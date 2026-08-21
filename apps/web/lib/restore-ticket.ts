import { SignJWT, jwtVerify } from "jose";

/**
 * The short-lived proof that someone just passed a sign-in for an account that
 * is on its way out.
 *
 * Sign-in for such an account is refused, so there is no session to carry the
 * fact forward — but the restore screen still has to know which account it is
 * offering back, and it cannot simply take a user id from the URL: that would
 * let anyone restore anyone else's account by guessing one.
 *
 * A signed ticket is the smallest thing that closes that gap. It says only
 * "whoever holds this proved they can sign in as this account, in the last
 * twenty minutes", which is exactly the claim the restore screen needs.
 */
const PURPOSE = "account-restore";
const TTL_MINUTES = 20;

function secret() {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is required to issue restore tickets");
  return new TextEncoder().encode(value);
}

export function issueRestoreTicket(userId: string) {
  return new SignJWT({ purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${TTL_MINUTES}m`)
    .sign(secret());
}

/** The account the ticket is for, or null if it is forged, stale or for something else. */
export async function readRestoreTicket(token: string | undefined | null) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== PURPOSE || !payload.sub) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
