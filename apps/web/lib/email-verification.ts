import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { mailConfigured, sendMail } from "./mail";
import { verifyEmailTemplate } from "./mail-templates";

const TTL_HOURS = 24;

/** Only the hash is stored, so the table is useless to anyone who reads it. */
function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Mails a fresh confirmation link, replacing any older one for the same address.
 *
 * Returns quietly when there is no mail provider configured — see lib/mail.ts.
 * Registration is not allowed to fail because the mailer is missing.
 */
export async function sendVerificationEmail(user: { name: string; email: string }) {
  if (!mailConfigured()) return { sent: false as const };

  const identifier = user.email.toLowerCase();
  const token = randomBytes(32).toString("base64url");

  // One live link per address: a second request should invalidate the first,
  // otherwise every link ever mailed stays usable for its full day.
  await prisma.verificationToken.deleteMany({ where: { identifier, purpose: "verify_email" } });
  await prisma.verificationToken.create({
    data: {
      identifier,
      tokenHash: hash(token),
      purpose: "verify_email",
      expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000)
    }
  });

  const mail = verifyEmailTemplate(user.name, token);
  return sendMail({ to: identifier, ...mail });
}

/**
 * Spends a link. Marks the address verified and drops the token, so a link that
 * was forwarded or sat in a mailbox cannot be used a second time.
 */
export async function consumeVerificationToken(token: string) {
  const row = await prisma.verificationToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.purpose !== "verify_email") return { ok: false as const, reason: "invalid" as const };

  await prisma.verificationToken.delete({ where: { id: row.id } }).catch(() => undefined);
  if (row.expiresAt <= new Date()) return { ok: false as const, reason: "expired" as const };

  // Matched on the address, not on a user id: the row is written before we know
  // the link will ever be followed, and the account could have been deleted in
  // between. updateMany rather than update so that case is a no-op, not a throw.
  const { count } = await prisma.user.updateMany({
    where: { email: row.identifier, emailVerified: null },
    data: { emailVerified: new Date() }
  });

  return { ok: true as const, alreadyVerified: count === 0 };
}

export function pruneVerificationTokens() {
  return prisma.verificationToken.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}
