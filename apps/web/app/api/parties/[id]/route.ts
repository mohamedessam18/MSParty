import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireMembership } from "@/lib/current-user";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireMembership(params.id);
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "FORBIDDEN";
    return NextResponse.json(
      { message: forbidden ? "Forbidden" : "Unauthorized" },
      { status: forbidden ? 403 : 401 }
    );
  }

  const party = await prisma.party.findUnique({
    where: { id: params.id },
    include: {
      host: { select: { name: true } },
      members: { include: { user: { select: { id: true, name: true, avatarUrl: true } } } }
    }
  });
  return party ? NextResponse.json(party) : NextResponse.json({ message: "Not found" }, { status: 404 });
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
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}
