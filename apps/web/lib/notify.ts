import { prisma } from "./prisma";

export type NotificationType = "friend_request" | "friend_accepted" | "party_invite" | "friend_live";

/**
 * Writes a notification and lets the sync server push it to anyone connected.
 * Persisting first is the point: an invite sent while someone is offline has to
 * be waiting when they come back, not lost with the socket.
 */
export async function notify(input: {
  userId: string;
  type: NotificationType;
  actorId?: string;
  partyId?: string;
  body?: string;
}) {
  if (input.actorId === input.userId) return null;

  const created = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      actorId: input.actorId,
      partyId: input.partyId,
      body: input.body
    },
    include: { actor: { select: { id: true, name: true, username: true, avatarUrl: true } } }
  });

  // Best effort: the row is the record, the push is a nicety. A sync server
  // that is down or slow must never fail the action that caused the notice.
  const base = process.env.SYNC_SERVER_INTERNAL_URL || process.env.NEXT_PUBLIC_SYNC_SERVER_URL;
  if (base && process.env.NEXTAUTH_SECRET) {
    fetch(`${base}/internal/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${process.env.NEXTAUTH_SECRET}` },
      body: JSON.stringify({ userId: input.userId, notification: created }),
      cache: "no-store"
    }).catch(() => undefined);
  }

  return created;
}

/** Tells a host's friends a room just opened, without spamming the whole list. */
export async function notifyFriendsLive(hostId: string, friendIds: string[], partyId: string, partyName: string) {
  if (!friendIds.length) return;
  const since = new Date(Date.now() - 60 * 60 * 1000);
  // One "went live" per friend per hour, however many rooms they open.
  const recent = await prisma.notification.findMany({
    where: { type: "friend_live", actorId: hostId, createdAt: { gte: since }, userId: { in: friendIds } },
    select: { userId: true }
  });
  const alreadyTold = new Set(recent.map(row => row.userId));
  await Promise.all(
    friendIds
      .filter(id => !alreadyTold.has(id))
      .map(id => notify({ userId: id, type: "friend_live", actorId: hostId, partyId, body: partyName }))
  );
}
