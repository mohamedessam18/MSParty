import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireMembership } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";
import { maskDeparted } from "@/lib/account-lifecycle";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireMembership(params.id);
  } catch (error) {
    return authError(error);
  }

  const party = await prisma.party.findUnique({
    where: { id: params.id },
    include: {
      host: { select: { name: true, deletionRequestedAt: true } },
      members: {
        include: { user: { select: { id: true, name: true, avatarUrl: true, deletionRequestedAt: true } } }
      }
    }
  });
  if (!party) return NextResponse.json({ message: "Not found" }, { status: 404 });

  // A member on their way out keeps their seat — the membership has to survive
  // for restoring to mean anything — but not their name on it.
  return NextResponse.json({
    ...party,
    host: { name: maskDeparted(party.host, Boolean(party.host.deletionRequestedAt)).name },
    members: party.members.map(member => {
      const { deletionRequestedAt, ...user } = member.user;
      return { ...member, user: maskDeparted(user, Boolean(deletionRequestedAt)) };
    })
  });
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireDbUser();
    const party = await prisma.party.findUnique({ where: { id: params.id }, select: { hostId: true } });
    if (!party || party.hostId !== user.id) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

    await prisma.$transaction([
      // Hand the video back to its owner's library instead of letting the
      // SetNull relation strand it: a row with partyId and cleanupAt both NULL
      // is invisible to the cleanup query, so this used to leak the object.
      prisma.uploadedVideo.updateMany({ where: { partyId: params.id }, data: { partyId: null } }),
      prisma.party.delete({ where: { id: params.id } })
    ]);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return authError(error);
  }
}
