import bcrypt from "bcryptjs";
import { GRACE_DAYS, REMINDER_DAYS_BEFORE, deletionState } from "./account-lifecycle";
import { prisma } from "./prisma";
import { abortMultipart, deleteR2Object, storageKeyFrom } from "./r2";
import { mailConfigured, sendMail } from "./mail";
import { deletionDoneTemplate, deletionReminderTemplate, deletionScheduledTemplate } from "./mail-templates";

// Re-exported so callers that already reach for these here keep working, and so
// there is one obvious place to import them from when erasure is also in play.
export { ACTIVE_USER, ERASED_AUTHOR, GRACE_DAYS, deletionState, maskDeparted } from "./account-lifecycle";
export type { DeletionState } from "./account-lifecycle";

/**
 * Confirms the person asking is the person leaving.
 *
 * Guests have no password at all, so requiring one would leave the only kind of
 * account that cannot be signed back into as the only kind that cannot be
 * deleted. They type their own name instead, which is the same test a password
 * is: something the person at the keyboard knows and a passer-by does not.
 */
export async function confirmIdentity(
  user: { name: string; passwordHash: string | null; isGuest: boolean },
  answer: string
) {
  const given = (answer || "").trim();
  if (!given) return false;
  if (user.passwordHash) return bcrypt.compare(given, user.passwordHash);
  return given.toLowerCase() === user.name.trim().toLowerCase();
}

/**
 * Starts the clock. The account goes dark immediately — that matters, because
 * a common reason to leave is wanting to stop being findable by someone, and
 * telling that person to wait a month is not an answer.
 *
 * The previous `invisible` value is stored alongside, because forcing the flag
 * on is only half a change: without remembering what it was, cancelling has
 * nothing to put back and has to guess.
 */
export async function scheduleDeletion(user: { id: string; name: string; email: string | null; invisible: boolean }) {
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      deletionRequestedAt: new Date(),
      invisible: true,
      invisibleBeforeDeletion: user.invisible,
      // A previous cancelled request may have left one behind; this run gets
      // its own reminder.
      deletionReminderSentAt: null
    },
    select: { deletionRequestedAt: true }
  });

  const state = deletionState(updated.deletionRequestedAt)!;
  if (user.email) {
    // Best effort, and after the write. Someone must not be told the deletion
    // failed because a mail server was busy.
    const mail = deletionScheduledTemplate(user.name, state.daysLeft, state.erasesAt);
    await sendMail({ to: user.email, ...mail }).catch(() => undefined);
  }

  return updated;
}

/**
 * Takes it back, and puts back the visibility they had before.
 *
 * `invisible` was ours to set, so it is ours to unset — but only to whatever it
 * was. Someone who was deliberately invisible before they left would otherwise
 * come back visible to everyone without having asked for that.
 */
export async function cancelDeletion(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { invisibleBeforeDeletion: true }
  });

  return prisma.user.update({
    where: { id: userId },
    data: {
      deletionRequestedAt: null,
      deletionReminderSentAt: null,
      // Null means the request predates this column; false is the right guess
      // there, since forcing it on is what the old code did unconditionally.
      invisible: user?.invisibleBeforeDeletion ?? false,
      invisibleBeforeDeletion: null
    }
  });
}

/**
 * Erases an account for real.
 *
 * Stored objects go first and rows second. The other order can lose the only
 * record of what to delete: a row removed before its file leaves the file in
 * the bucket with nothing left pointing at it, paid for and unreachable.
 *
 * Every storage delete is allowed to fail. A bucket that is briefly unreachable
 * must not leave someone's account half-erased and unerasable.
 */
export async function eraseAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatarUrl: true, name: true, email: true }
  });
  if (!user) return false;

  const uploads = await prisma.uploadedVideo.findMany({
    where: { uploaderId: userId },
    select: { id: true, storageKey: true, multipartId: true, posterUrl: true }
  });
  for (const video of uploads) {
    // An unfinished upload holds parts, not an object; only an abort frees them.
    if (video.multipartId) await abortMultipart(video.storageKey, video.multipartId).catch(() => undefined);
    else await deleteR2Object(video.storageKey).catch(() => undefined);
    if (video.posterUrl) await deleteR2Object(`posters/${userId}/${video.id}.jpg`).catch(() => undefined);
  }

  // Subtitle tracks belong to the party but sit under the uploader's prefix.
  const hosted = await prisma.party.findMany({
    where: { hostId: userId },
    select: { subtitlesUrl: true }
  });
  for (const party of hosted) {
    const key = storageKeyFrom(party.subtitlesUrl, `subtitles/${userId}/`);
    if (key) await deleteR2Object(key).catch(() => undefined);
  }

  const avatarKey = storageKeyFrom(user.avatarUrl, `avatars/${userId}/`);
  if (avatarKey) await deleteR2Object(avatarKey).catch(() => undefined);

  await prisma.$transaction([
    // Blanked here, detached by the foreign key's SET NULL when the user goes.
    // Both are needed: the words are theirs, and the place in the conversation
    // is everyone else's.
    prisma.chatMessage.updateMany({ where: { userId }, data: { message: "" } }),
    // Keyed by address rather than by user, so nothing survives that could
    // still verify an address for an account that no longer exists.
    prisma.verificationToken.deleteMany({ where: { identifier: user.email ?? "" } }),
    // Hosted parties go with them. Uploads attached to those parties are
    // detached rather than destroyed — they may belong to someone else.
    prisma.party.deleteMany({ where: { hostId: userId } }),
    prisma.uploadedVideo.deleteMany({ where: { uploaderId: userId } }),
    // Linked sign-in methods go with the row by cascade; named here so the
    // erasure reads as complete rather than relying on the schema to be read.
    prisma.account.deleteMany({ where: { userId } }),
    prisma.user.delete({ where: { id: userId } })
  ]);

  // Last, and only after the row is gone: a "your account is erased" mail sent
  // before the erasure would be a lie if the transaction then rolled back.
  if (user.email) {
    const mail = deletionDoneTemplate(user.name);
    await sendMail({ to: user.email, ...mail }).catch(() => undefined);
  }

  return true;
}

/**
 * The last-chance mail, a few days out.
 *
 * Sent once per request: `deletionReminderSentAt` is what stops the nightly job
 * mailing the same person every night for the rest of their grace period.
 * Accounts with no address — guests — are marked as if sent, since there is
 * nowhere to send to and leaving them unmarked would retry them forever.
 */
export async function sendDeletionReminders(limit = 50) {
  // With no mail provider there is nothing to send and nothing to record.
  // Marking accounts as reminded anyway would mean that turning mail on later
  // silently skips everyone already inside their grace period.
  if (!mailConfigured()) return { sent: 0, considered: 0 };

  const cutoff = new Date(Date.now() - (GRACE_DAYS - REMINDER_DAYS_BEFORE) * 86400_000);
  const due = await prisma.user.findMany({
    where: { deletionRequestedAt: { not: null, lte: cutoff }, deletionReminderSentAt: null },
    select: { id: true, name: true, email: true, deletionRequestedAt: true },
    take: limit
  });

  let sent = 0;
  for (const account of due) {
    const state = deletionState(account.deletionRequestedAt)!;
    if (account.email) {
      const mail = deletionReminderTemplate(account.name, state.daysLeft, state.erasesAt);
      const result = await sendMail({ to: account.email, ...mail }).catch(() => ({ sent: false }));
      if (result.sent) sent++;
    }
    await prisma.user
      .update({ where: { id: account.id }, data: { deletionReminderSentAt: new Date() } })
      .catch(() => undefined);
  }

  return { sent, considered: due.length };
}

/** Accounts whose grace period has run out. */
export function accountsDueForErasure(limit = 25) {
  return prisma.user.findMany({
    where: { deletionRequestedAt: { lte: new Date(Date.now() - GRACE_DAYS * 86400_000) } },
    select: { id: true },
    take: limit
  });
}
