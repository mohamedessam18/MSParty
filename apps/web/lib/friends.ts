import { prisma } from "./prisma";

// Username shape and normalisation live in lib/username.ts; re-exported here
// so callers that only care about friends do not have to know that.
export { normalizeUsername } from "./username";

/** Ids of everyone the user has an accepted friendship with, in either direction. */
export async function friendIdsOf(userId: string) {
  const rows = await prisma.friendship.findMany({
    where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true }
  });
  return rows.map(row => (row.requesterId === userId ? row.addresseeId : row.requesterId));
}

export async function areFriends(a: string, b: string) {
  if (a === b) return true;
  const found = await prisma.friendship.findFirst({
    where: {
      status: "accepted",
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a }
      ]
    },
    select: { id: true }
  });
  return !!found;
}

/**
 * Finds the row for a pair regardless of who asked first. The unique constraint
 * is directional, so a plain lookup would miss a request sent the other way and
 * let both sides sit with a pending request to each other.
 */
export function friendshipBetween(a: string, b: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a }
      ]
    }
  });
}

/** How many parties two people have both been members of. */
export async function sharedPartyCount(a: string, b: string) {
  return prisma.party.count({
    where: { AND: [{ members: { some: { userId: a } } }, { members: { some: { userId: b } } }] }
  });
}
