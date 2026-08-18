import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { friendIdsOf } from "@/lib/friends";
import { discoverableFor } from "@/lib/party-access";

export const dynamic = "force-dynamic";

/**
 * Everything the dashboard leads with: rooms you can walk into right now,
 * invitations waiting on you, and who your friends are. Presence itself arrives
 * over the socket, since it changes by the second and has no business in a
 * cached HTTP response.
 */
export async function GET() {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const friendIds = await friendIdsOf(user.id);

  const [open, invites, friends, mine] = await Promise.all([
    discoverableFor(user.id, friendIds),
    prisma.partyInvite.findMany({
      where: { invitedId: user.id, status: "pending" },
      orderBy: { createdAt: "desc" },
      include: {
        party: { select: { id: true, name: true, isPlaying: true, _count: { select: { members: true } } } },
        invitedBy: { select: { id: true, name: true, username: true, avatarUrl: true } }
      }
    }),
    prisma.user.findMany({
      where: { id: { in: friendIds } },
      select: { id: true, name: true, username: true, avatarUrl: true }
    }),
    prisma.party.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      // Selected rather than included: the description runs to two thousand
      // characters and has no business in a list of cards.
      select: {
        id: true,
        code: true,
        name: true,
        contentType: true,
        posterUrl: true,
        videoTitle: true,
        videoDuration: true,
        hostId: true,
        host: { select: { name: true } },
        _count: { select: { members: true } }
      }
    })
  ]);

  return NextResponse.json({
    // The caller's own id, so the client can tell which parties it may delete
    // rather than merely leave.
    me: user.id,
    // Rooms a friend has open that you are allowed into, minus ones you are
    // already a member of — those belong under "your parties".
    live: open
      .filter(party => !mine.some(item => item.id === party.id))
      .map(party => ({
        id: party.id,
        name: party.name,
        isPlaying: party.isPlaying,
        members: party._count.members,
        host: party.host
      })),
    invites: invites.map(row => ({
      id: row.id,
      party: { id: row.party.id, name: row.party.name, members: row.party._count.members },
      from: row.invitedBy
    })),
    friends,
    parties: mine
  });
}
