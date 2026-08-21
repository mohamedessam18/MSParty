import { SignJWT } from "jose";

/**
 * The credential the socket server accepts.
 *
 * `scope` is what separates a person from a television. A set keeps its pairing
 * secret in local storage where anyone with the remote can reach it, and that
 * secret can be exchanged for one of these at any time — so the token it gets
 * must not be able to pause a film for everyone. "tv" is refused every
 * mutating event by the socket server; the default has no scope and is
 * unchanged.
 */
export async function createSyncToken(user: { id: string; name: string }, scope?: "tv") {
  const secret = new TextEncoder().encode(process.env.SYNC_TOKEN_SECRET || process.env.NEXTAUTH_SECRET);
  return new SignJWT(scope ? { name: user.name, scope } : { name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(secret);
}
