/**
 * The facts about leaving, with no dependencies.
 *
 * Split out from account-deletion.ts because half the app needs to know what a
 * departing account looks like — every listing filters on it — while only the
 * erasure job needs the machinery that does it. Keeping them in one file meant
 * a route that wanted a `where` clause imported the S3 client and the mailer
 * along with it, into a serverless bundle that then had to cold-start with
 * them.
 */

/** How long an account waits before it is erased, and can be taken back. */
export const GRACE_DAYS = 30;

/** How many days before erasure the last-chance mail goes out. */
export const REMINDER_DAYS_BEFORE = 3;

/** What a message shows once its author is gone — or on their way out. */
export const ERASED_AUTHOR = "مستخدم محذوف";

/**
 * The filter every listing needs: an account on its way out is not a member of
 * this place any more.
 *
 * Spread into a `where` rather than written out at each call site, because the
 * cost of forgetting it once is that someone who was told they had disappeared
 * turns up in a friend list, a search result or a room for another month.
 */
export const ACTIVE_USER = { deletionRequestedAt: null } as const;

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
 * How someone on their way out appears where a name has to be shown anyway —
 * an old chat line, a seat in a room they used to be in.
 *
 * Their own words are left alone until erasure; what goes is the identity
 * attached to them, which is what makes an account findable by the person it
 * left. Erased accounts arrive here as null and get the same treatment, so the
 * two cases read identically from outside.
 */
export function maskDeparted<T extends { name: string; avatarUrl?: string | null; username?: string | null }>(
  user: T | null | undefined,
  pending?: boolean
) {
  if (!user) return { name: ERASED_AUTHOR, avatarUrl: null, username: null, departed: true as const };
  if (!pending) return { ...user, departed: false as const };
  return { ...user, name: ERASED_AUTHOR, avatarUrl: null, username: null, departed: true as const };
}
