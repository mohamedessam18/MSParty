import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";

/**
 * One-time links, for the three things this app mails.
 *
 * `verify_email` proves a new account's address, `reset_password` lets someone
 * back in, and `change_email` proves a *different* address belongs to an
 * account that already exists. They share a table because they share every
 * property that matters: single use, short lived, and useless once read out of
 * the database.
 *
 * Only the hash is stored. A token is a password that happens to arrive by
 * mail, and a leaked database should not hand out working ones.
 */
export type Purpose = "verify_email" | "reset_password" | "change_email";

/** How long each kind of link lasts, in hours. */
const TTL: Record<Purpose, number> = {
  verify_email: 24,
  // Deliberately short. This one is a way into the account, so the window in
  // which a forwarded or intercepted mail is worth anything should be small.
  reset_password: 1,
  change_email: 24
};

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Issues a link, replacing any outstanding one of the same kind.
 *
 * Replacing matters: without it every reset ever requested stays live for its
 * full hour, so asking twice doubles the number of working keys rather than
 * rotating them.
 */
export async function issueToken({
  purpose,
  identifier,
  userId
}: {
  purpose: Purpose;
  identifier: string;
  userId?: string;
}) {
  const token = randomBytes(32).toString("base64url");

  await prisma.verificationToken.deleteMany({
    where: userId ? { purpose, userId } : { purpose, identifier }
  });
  await prisma.verificationToken.create({
    data: {
      identifier,
      userId: userId ?? null,
      purpose,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + TTL[purpose] * 3600_000)
    }
  });

  return token;
}

/**
 * Looks a token up without spending it.
 *
 * For the one flow that can still refuse after the token checks out: a reset
 * validates the new password, and doing that *after* consuming the link means
 * a typo — a password too short, or one on the common list — costs the person
 * their only way in and sends them back to the mailbox for another mail.
 */
export async function findToken(token: string, purpose: Purpose) {
  if (!token) return null;
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hash(token) } });
  return row && row.purpose === purpose ? row : null;
}

/**
 * Spends a token that has already been found, as part of a wider change.
 *
 * The delete is the lock: two requests holding the same link both reach here,
 * and only the one whose delete removes a row is allowed to continue. Run
 * inside the caller's transaction so the spend and the change it authorises
 * cannot come apart.
 */
export async function consumeFound(
  transaction: { verificationToken: { deleteMany: (args: any) => Promise<{ count: number }> } },
  id: string
) {
  const { count } = await transaction.verificationToken.deleteMany({ where: { id } });
  return count === 1;
}

/**
 * Issues a token, mails it, and takes it back if the mail did not go.
 *
 * Without this a refused send — an unverified sending domain, a provider
 * outage — still leaves a live row behind: a working link that nobody was
 * given, sitting in the table until it expires. Not dangerous, since holding
 * the row is not holding the token, but it makes the table lie about what is
 * outstanding.
 *
 * The caller still learns nothing about whether the address exists; that
 * decision belongs upstream, and this only reports whether the send worked.
 */
export async function issueAndMail({
  purpose,
  identifier,
  userId,
  send
}: {
  purpose: Purpose;
  identifier: string;
  userId?: string;
  send: (token: string) => Promise<{ sent: boolean; reason?: string }>;
}) {
  const token = await issueToken({ purpose, identifier, userId });
  const result = await send(token).catch(() => ({ sent: false, reason: "threw" }));

  if (!result.sent) {
    await prisma.verificationToken
      .deleteMany({ where: { tokenHash: hash(token) } })
      .catch(() => undefined);
    // Named loudly, because the caller's answer to the person is deliberately
    // the same either way and this log is the only place the failure shows.
    console.error(`Mail for ${purpose} was not delivered (${result.reason ?? "unknown"}); token discarded.`);
  }

  return result;
}

export type SpentToken =
  | { ok: true; identifier: string; userId: string | null }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Spends a link.
 *
 * The row is deleted before the expiry is checked, not after: an expired token
 * is still a token somebody was mailed, and leaving it in the table means a
 * clock skew or a slow job is the difference between single use and reusable.
 */
export async function spendToken(token: string, purpose: Purpose): Promise<SpentToken> {
  if (!token) return { ok: false, reason: "invalid" };

  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.purpose !== purpose) return { ok: false, reason: "invalid" };

  await prisma.verificationToken.delete({ where: { id: row.id } }).catch(() => undefined);
  if (row.expiresAt <= new Date()) return { ok: false, reason: "expired" };

  return { ok: true, identifier: row.identifier, userId: row.userId };
}

export function pruneVerificationTokens() {
  return prisma.verificationToken.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}
