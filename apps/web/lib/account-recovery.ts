import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { mailConfigured, sendMail } from "./mail";
import { changeEmailTemplate, resetPasswordTemplate } from "./mail-templates";
import { consumeFound, findToken, issueToken, spendToken } from "./verification-tokens";
import { checkPassword } from "./password";

/**
 * Getting back into an account, and getting out of every session of it.
 *
 * The deletion flow already went to some trouble to make a lost account
 * recoverable for thirty days. Forgetting a password used to lose one
 * permanently and immediately, which made that care look like an accident.
 */

/**
 * Mails a reset link, if there is anything to mail.
 *
 * Returns nothing useful on purpose. Whether an address has an account here is
 * not a question this endpoint should answer — for an app people leave to get
 * away from someone, "does he have an account" is exactly the thing worth
 * asking, and a difference in response is an answer.
 */
export async function requestPasswordReset(email: string) {
  if (!mailConfigured()) return;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, passwordHash: true, deletionRequestedAt: true }
  });

  // A Google-only account has no password to reset, and an account on its way
  // out is answered by the restore screen instead. Both are silent here.
  if (!user || !user.passwordHash || user.deletionRequestedAt) return;

  const token = await issueToken({ purpose: "reset_password", identifier: email, userId: user.id });
  const mail = resetPasswordTemplate(user.name, token);
  await sendMail({ to: email, ...mail }).catch(() => undefined);
}

export type ResetOutcome =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" | "weak"; message: string };

/**
 * Spends a reset link and sets the new password.
 *
 * Every other session ends at the same time. Someone resetting a password is
 * either locked out or worried about who else is in — and both readings are
 * answered by the same act, so it is not offered as a choice.
 */
export async function completePasswordReset(token: string, password: string): Promise<ResetOutcome> {
  const invalid = { ok: false as const, reason: "invalid" as const, message: "الرابط ده مش صالح أو اتستخدم قبل كده." };

  // Found, not spent. Everything that can still refuse has to happen while the
  // link is intact — a password the rules reject must cost a retry, not the
  // only way back into the account.
  const row = await findToken(token, "reset_password");
  if (!row || !row.userId) return invalid;

  if (row.expiresAt <= new Date()) {
    await prisma.verificationToken.delete({ where: { id: row.id } }).catch(() => undefined);
    return { ok: false, reason: "expired", message: "الرابط ده انتهت مدته. اطلب واحد جديد." };
  }

  const user = await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true, email: true } });
  if (!user) return invalid;

  const strength = checkPassword(password, { email: user.email ?? undefined, name: user.name });
  if (!strength.ok) return { ok: false, reason: "weak", message: strength.message };

  // Hashed before the transaction: bcrypt at cost 12 takes a few hundred
  // milliseconds, and holding a database transaction open across it for no
  // reason is how connection pools run out.
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.$transaction(async transaction => {
      // The delete is the lock. Two tabs holding the same link both arrive
      // here; only the one that removes the row may go on.
      if (!(await consumeFound(transaction, row.id))) throw new Error("SPENT");
      await transaction.user.update({
        where: { id: row.userId! },
        data: {
          passwordHash,
          // Proving control of the mailbox is the same proof the confirmation
          // link asks for, so an unverified address becomes verified here.
          emailVerified: new Date(),
          tokenVersion: { increment: 1 }
        }
      });
    });
  } catch {
    return invalid;
  }

  return { ok: true };
}

/**
 * Starts an address change by mailing the *new* address.
 *
 * Nothing moves until that link is followed. Writing the new address first and
 * confirming later would let a typo lock someone out of their own account, and
 * would let anyone who borrowed an unlocked phone redirect the account
 * somewhere else in one step.
 */
export async function requestEmailChange(user: { id: string; name: string }, newEmail: string) {
  const taken = await prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
  if (taken && taken.id !== user.id) {
    return { ok: false as const, message: "البريد ده مستخدم في حساب تاني." };
  }
  if (!mailConfigured()) {
    return { ok: false as const, message: "تغيير البريد مش متاح دلوقتي. جرّب بعدين." };
  }

  const token = await issueToken({ purpose: "change_email", identifier: newEmail, userId: user.id });
  const mail = changeEmailTemplate(user.name, newEmail, token);
  await sendMail({ to: newEmail, ...mail }).catch(() => undefined);
  return { ok: true as const };
}

/** Spends an address-change link. */
export async function completeEmailChange(token: string) {
  const spent = await spendToken(token, "change_email");
  if (!spent.ok || !spent.userId) return { ok: false as const, reason: spent.ok ? "invalid" : spent.reason };

  try {
    await prisma.user.update({
      where: { id: spent.userId },
      // Verified by construction: the link only reached them because the
      // address works.
      data: { email: spent.identifier, emailVerified: new Date() }
    });
    return { ok: true as const, email: spent.identifier };
  } catch {
    // Someone else claimed the address between the mail and the click.
    return { ok: false as const, reason: "taken" as const };
  }
}

/** Ends every session of this account, including the one asking. */
export function revokeAllSessions(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
    select: { tokenVersion: true }
  });
}
