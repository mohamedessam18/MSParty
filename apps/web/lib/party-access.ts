import { prisma } from "./prisma";
import { areFriends } from "./friends";

export type Visibility = "private" | "friends" | "code";
export const VISIBILITIES: Visibility[] = ["private", "friends", "code"];

export type AccessDenial = { reason: "locked" | "blocked" | "friends" | "invite"; message: string };

/**
 * The single answer to "can this person walk into this room". Every entry point
 * — the code form, the invite link, the friends feed — routes through here, so
 * a rule can never hold on one path and not another.
 */
export async function canJoinParty(
  party: { id: string; hostId: string; isLocked: boolean; visibility: string },
  userId: string
): Promise<AccessDenial | null> {
  // Members are already inside; nothing below should be able to evict them.
  const member = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId: party.id, userId } }
  });
  if (member) return null;
  if (party.hostId === userId) return null;

  // A host who blocked someone should not have to also remember to lock the room.
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: party.hostId, blockedId: userId },
        { blockerId: userId, blockedId: party.hostId }
      ]
    },
    select: { id: true }
  });
  if (blocked) return { reason: "blocked", message: "مش قادر تدخل البارتي ده." };

  if (party.isLocked) {
    return { reason: "locked", message: "البارتي مقفول ومش بيستقبل حد جديد." };
  }

  if (party.visibility === "friends" && !(await areFriends(party.hostId, userId))) {
    return { reason: "friends", message: "البارتي ده لأصدقاء الهوست بس." };
  }

  if (party.visibility === "private") {
    const invite = await prisma.partyInvite.findUnique({
      where: { partyId_invitedId: { partyId: party.id, invitedId: userId } }
    });
    // A declined invite still counts: the room stays open to them if they
    // change their mind, which is friendlier than making the host re-send it.
    if (!invite) return { reason: "invite", message: "البارتي ده بالدعوة بس." };
  }

  return null;
}

/** Parties a person can see without holding a code: friends' rooms and invites. */
export async function discoverableFor(userId: string, friendIds: string[]) {
  if (!friendIds.length) return [];
  return prisma.party.findMany({
    where: {
      OR: [
        { hostId: { in: friendIds }, visibility: "friends" },
        { invites: { some: { invitedId: userId, status: "pending" } } }
      ]
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    include: {
      host: { select: { id: true, name: true, username: true, avatarUrl: true } },
      _count: { select: { members: true } }
    }
  });
}
