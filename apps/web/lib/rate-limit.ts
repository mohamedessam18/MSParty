import { prisma } from "./prisma";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/**
 * A fixed-window attempt counter, kept in Postgres.
 *
 * One statement rather than read-then-write: two sign-in attempts arriving
 * together would both read the same count and both write count + 1, which is
 * exactly the shape an attacker gets for free by opening two connections.
 * `ON CONFLICT DO UPDATE` makes the read, the decision and the write one atomic
 * step, and returns the value that was actually stored.
 *
 * An expired row is reused rather than deleted: the window resets in the same
 * statement, so there is no gap between "expired" and "counted again".
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
  const expiresAt = new Date(Date.now() + windowSeconds * 1000);

  try {
    const [row] = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${expiresAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."expiresAt" <= NOW() THEN 1 ELSE "RateLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= NOW() THEN ${expiresAt} ELSE "RateLimit"."expiresAt" END
      RETURNING "count", "expiresAt"
    `;

    const used = Number(row?.count ?? 1);
    const resetsAt = row?.expiresAt ?? expiresAt;
    return {
      ok: used <= limit,
      remaining: Math.max(0, limit - used),
      retryAfterSeconds: Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000))
    };
  } catch (error) {
    // Fail open. A limiter that cannot reach its table must not become the
    // reason nobody can sign in; the alternative locks out every real user to
    // slow down an attacker who is not necessarily there.
    console.error("Rate limit unavailable:", error);
    return { ok: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

/** Undoes one attempt — for when the thing being limited actually succeeded. */
export async function releaseAttempt(key: string) {
  await prisma
    .$executeRaw`UPDATE "RateLimit" SET "count" = GREATEST(0, "count" - 1) WHERE "key" = ${key}`
    .catch(() => undefined);
}

/** Drops windows that have closed. Called by the nightly job. */
export function pruneRateLimits() {
  return prisma.rateLimit.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

/**
 * The caller's address as the platform reports it.
 *
 * Only the first entry of x-forwarded-for is trusted: the rest are whatever the
 * client chose to send, and treating those as the identity would let one
 * attacker present a new "address" on every request.
 */
export function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/** 429 with the header a well-behaved client waits on. */
export function tooManyRequests(result: RateLimitResult, message: string) {
  return Response.json(
    { message, retryAfter: result.retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } }
  );
}
