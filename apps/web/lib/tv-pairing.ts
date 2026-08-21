import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { generatePartyCode, normalizePartyCode } from "./party-code";

/** How long an unclaimed code stays on screen before it is worthless. */
export const CODE_TTL_MINUTES = 15;
/** How long a paired television stays paired without being seen. */
export const DEVICE_TTL_DAYS = 90;

/**
 * Pairing a television.
 *
 * The set is not signed in and cannot reasonably be made to sign in — a remote
 * with four arrows and an OK button is not a keyboard. So it proves nothing at
 * all: it asks for a code, shows it, and waits. The proof happens on a phone
 * that is already signed in, which is the device the person is holding anyway.
 *
 * What the set keeps afterwards is `secret`, a bearer credential. That is the
 * same trade every television makes, and the mitigations are the usual ones:
 * it is stored hashed here, it is scoped to one account, it expires if the set
 * goes quiet for three months, and the phone that made it can revoke it.
 */
export function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

/** A fresh, unclaimed code for a set that has just been switched on. */
export async function createPairing() {
  const secret = randomBytes(32).toString("base64url");

  // Retried rather than assumed unique: the code space is small on purpose, so
  // it can be read across a room, and small spaces collide.
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generatePartyCode();
    const clash = await prisma.tvDevice.findUnique({ where: { code }, select: { id: true } });
    if (clash) continue;

    const device = await prisma.tvDevice.create({
      data: {
        code,
        secretHash: hashSecret(secret),
        expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000)
      },
      select: { code: true, expiresAt: true }
    });
    return { ...device, secret };
  }

  throw new Error("Could not allocate a pairing code");
}

/**
 * The set, identified by the secret it was handed.
 *
 * Looked up by the hash rather than by the code, so a stranger who reads the
 * code off a screen cannot poll for the television's token — reading a code
 * only ever lets you *give* a set an account, never take one from it.
 */
export function deviceBySecret(secret: string) {
  return prisma.tvDevice.findUnique({
    where: { secretHash: hashSecret(secret) },
    include: {
      user: { select: { id: true, name: true, deletionRequestedAt: true } },
      party: {
        select: {
          id: true,
          name: true,
          contentType: true,
          contentUrl: true,
          videoTitle: true,
          posterUrl: true
        }
      }
    }
  });
}

export function deviceByCode(code: string) {
  return prisma.tvDevice.findUnique({ where: { code: normalizePartyCode(code) } });
}

/** Pushes the expiry out; called on every poll, so a set in daily use never lapses. */
export function touchDevice(id: string) {
  return prisma.tvDevice.update({
    where: { id },
    data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + DEVICE_TTL_DAYS * 86400_000) }
  });
}

/** Codes nobody claimed, and sets nobody switched on for three months. */
export function pruneTvDevices() {
  return prisma.tvDevice.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}
