import { prisma } from "./prisma";
import { mailConfigured, sendMail } from "./mail";
import { verifyEmailTemplate } from "./mail-templates";
import { issueToken, spendToken } from "./verification-tokens";

// The token machinery is shared with password resets and address changes —
// see lib/verification-tokens.ts. Re-exported so the nightly job keeps its
// single import.
export { pruneVerificationTokens } from "./verification-tokens";

/**
 * Mails a fresh confirmation link.
 *
 * Returns quietly when there is no mail provider configured. Registration is
 * not allowed to fail because the mailer is missing.
 */
export async function sendVerificationEmail(user: { name: string; email: string }) {
  if (!mailConfigured()) return { sent: false as const };

  const identifier = user.email.toLowerCase();
  const token = await issueToken({ purpose: "verify_email", identifier });
  const mail = verifyEmailTemplate(user.name, token);
  return sendMail({ to: identifier, ...mail });
}

/** Spends a link and marks the address proven. */
export async function consumeVerificationToken(token: string) {
  const spent = await spendToken(token, "verify_email");
  if (!spent.ok) return { ok: false as const, reason: spent.reason };

  // Matched on the address rather than a user id: the row is written before we
  // know the link will ever be followed, and the account could have gone in
  // between. updateMany makes that a no-op instead of a throw.
  const { count } = await prisma.user.updateMany({
    where: { email: spent.identifier, emailVerified: null },
    data: { emailVerified: new Date() }
  });

  return { ok: true as const, alreadyVerified: count === 0 };
}
