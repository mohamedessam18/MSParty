import type { Account, Profile } from "next-auth";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { canonicalUsername, validateUsername } from "./username";

export type GoogleResolution =
  | { ok: true; userId: string }
  | { ok: false; reason: "unverified" | "no_email" | "conflict" };

/**
 * Turns a Google identity into an account here, creating or linking as needed.
 *
 * Linking is by verified address, which is the part that has to be got right.
 * Google only ever reports `email_verified` for an address it has proven the
 * person controls, and that is the same proof a password reset by email would
 * give — so matching on it is safe, and refusing to would strand everyone who
 * registered with a password and later pressed the Google button. An address
 * Google itself has not verified is refused outright: without that check,
 * anyone able to set an unverified address at any provider could walk into the
 * matching account here.
 */
export async function resolveGoogleUser(account: Account, profile: Profile | undefined): Promise<GoogleResolution> {
  const email = profile?.email?.trim().toLowerCase();
  if (!email) return { ok: false, reason: "no_email" };
  if ((profile as { email_verified?: boolean } | undefined)?.email_verified === false) {
    return { ok: false, reason: "unverified" };
  }

  const linked = await prisma.account.findUnique({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId
      }
    },
    select: { userId: true }
  });
  if (linked) {
    await storeTokens(account, linked.userId);
    return { ok: true, userId: linked.userId };
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, isGuest: true } });
  if (existing) {
    // A guest row has no email, so this cannot be one — but the check costs
    // nothing and the alternative is a guest silently becoming a full account
    // through a path that never asked it to.
    if (existing.isGuest) return { ok: false, reason: "conflict" };
    await prisma.$transaction([
      prisma.user.update({
        where: { id: existing.id },
        // Google's word is the proof; an account reached this way is verified
        // even if it never followed a link we mailed.
        data: { emailVerified: new Date() }
      }),
      linkQuery(account, existing.id)
    ]);
    return { ok: true, userId: existing.id };
  }

  try {
    const created = await prisma.user.create({
      data: {
        email,
        emailVerified: new Date(),
        name: (profile?.name || email.split("@")[0]).slice(0, 50),
        avatarUrl: typeof profile?.image === "string" ? profile.image.slice(0, 512) : null,
        ...(await freeUsernameFrom(email)),
        // Left null on purpose, so the first change from the profile screen is
        // free: this name was generated for them, not chosen by them, and the
        // cooldown is meant to slow down changes of mind, not first choices.
        usernameChangedAt: null,
        accounts: { create: accountData(account) }
      },
      select: { id: true }
    });
    return { ok: true, userId: created.id };
  } catch (error) {
    // Someone else got there first — a double-clicked button, or the same
    // person signing in from two tabs. Every check above passed when it ran,
    // so the only sound answer is to look again rather than to fail: the row
    // that won the race is the account this person wanted.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const settled = await prisma.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId
          }
        },
        select: { userId: true }
      });
      if (settled) return { ok: true, userId: settled.userId };

      const byEmail = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (byEmail) {
        await prisma.account.create({ data: { ...accountData(account), userId: byEmail.id } }).catch(() => undefined);
        return { ok: true, userId: byEmail.id };
      }
    }
    throw error;
  }
}

function accountData(account: Account) {
  return {
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
    refresh_token: account.refresh_token ?? null,
    access_token: account.access_token ?? null,
    expires_at: typeof account.expires_at === "number" ? account.expires_at : null,
    token_type: account.token_type ?? null,
    scope: account.scope ?? null,
    id_token: account.id_token ?? null,
    session_state: typeof account.session_state === "string" ? account.session_state : null
  };
}

function linkQuery(account: Account, userId: string) {
  return prisma.account.create({ data: { ...accountData(account), userId } });
}

/** Keeps the stored tokens current on every later sign-in. */
function storeTokens(account: Account, userId: string) {
  return prisma.account
    .update({
      where: {
        provider_providerAccountId: {
          provider: account.provider,
          providerAccountId: account.providerAccountId
        }
      },
      data: { ...accountData(account), userId }
    })
    .catch(() => undefined);
}

/**
 * A username for someone who never picked one.
 *
 * Every screen here assumes an account is findable by name, so a Google sign-up
 * cannot be left without one — and interrupting a one-click sign-in to demand a
 * name is the thing one-click sign-in exists to avoid. The address's local part
 * is the closest thing to a name they have already chosen; a numeric suffix
 * settles collisions.
 */
async function freeUsernameFrom(email: string) {
  // Everything the rules do not allow is dropped rather than rejected: a "+tag"
  // or a capital letter is not a reason to hand someone a random name.
  const base = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._]/g, "").replace(/^\.+|\.+$/g, "");

  for (let attempt = 0; attempt < 12; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const check = validateUsername(candidate);
    if (!check.ok) continue;

    const taken = await prisma.user.findFirst({
      where: { OR: [{ username: check.username }, { usernameCanonical: check.canonical }] },
      select: { id: true }
    });
    if (!taken) return { username: check.username, usernameCanonical: check.canonical };
  }

  // Nothing derived from the address worked — a short local part, an alphabet
  // the rules reject, or a run of unlucky collisions. A random name is still a
  // working account, and it can be changed for free from the profile screen.
  const fallback = `user${Date.now().toString(36)}`;
  return { username: fallback, usernameCanonical: canonicalUsername(fallback) };
}
