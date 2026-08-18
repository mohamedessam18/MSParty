import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { areFriends } from "@/lib/friends";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireDbUser();

    const party = await prisma.party.findUnique({ where: { id: params.id }, select: { isLocked: true, friendsOnly: true, hostId: true } });
    if (!party) return NextResponse.json({ message: "البارتي ده مش موجود." }, { status: 404 });

    const existing = await prisma.partyMember.findUnique({
      where: { partyId_userId: { partyId: params.id, userId: user.id } }
    });
    // The lock keeps newcomers out but never evicts an existing member.
    if (!existing && party.isLocked) {
      return NextResponse.json({ message: "البارتي مقفول ومش بيستقبل حد جديد." }, { status: 403 });
    }
    // A friends-only room admits the host's friends without a code, and nobody
    // else — even someone holding the link.
    if (!existing && party.friendsOnly && !(await areFriends(party.hostId, user.id))) {
      return NextResponse.json({ message: "البارتي ده لأصدقاء الهوست بس." }, { status: 403 });
    }

    const member = existing ?? (await prisma.partyMember.create({ data: { partyId: params.id, userId: user.id } }));
    return NextResponse.json(member);
  } catch {
    return NextResponse.json({ message: "Unable to join party" }, { status: 400 });
  }
}
