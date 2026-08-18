import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { abortMultipart, deleteR2Object, storageKeyFrom } from "./r2";

/** How long an account waits before it is erased, and can be taken back. */
export const GRACE_DAYS = 30;

/** What a message shows once its author is gone. */
export const ERASED_AUTHOR = "مستخدم محذوف";

export type DeletionState = { requestedAt: Date; erasesAt: Date; daysLeft: number };

export function deletionState(requestedAt: Date | null): DeletionState | null {
  if (!requestedAt) return null;
  const erasesAt = new Date(requestedAt.getTime() + GRACE_DAYS * 86400_000);
  return {
    requestedAt,
    erasesAt,
    daysLeft: Math.max(0, Math.ceil((erasesAt.getTime() - Date.now()) / 86400_000))
  };
}

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
 */
export async function scheduleDeletion(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { deletionRequestedAt: new Date(), invisible: true },
    select: { deletionRequestedAt: true }
  });
}

/** Takes it back. Invisibility is left on: it was set by us, but turning it off
 *  would override a choice they may have made themselves beforehand. */
export function cancelDeletion(userId: string) {
  return prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: null } });
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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { avatarUrl: true } });
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
    // Hosted parties go with them. Uploads attached to those parties are
    // detached rather than destroyed — they may belong to someone else.
    prisma.party.deleteMany({ where: { hostId: userId } }),
    prisma.uploadedVideo.deleteMany({ where: { uploaderId: userId } }),
    prisma.user.delete({ where: { id: userId } })
  ]);

  return true;
}

/** Accounts whose grace period has run out. */
export function accountsDueForErasure(limit = 25) {
  return prisma.user.findMany({
    where: { deletionRequestedAt: { lte: new Date(Date.now() - GRACE_DAYS * 86400_000) } },
    select: { id: true },
    take: limit
  });
}
