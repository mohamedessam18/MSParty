import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { canJoinParty } from "@/lib/party-access";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const user = await requireDbUser();

    const party = await prisma.party.findUnique({
      where: { id: params.id },
      select: { id: true, hostId: true, isLocked: true, visibility: true }
    });
    if (!party) return NextResponse.json({ message: "البارتي ده مش موجود." }, { status: 404 });

    const denial = await canJoinParty(party, user.id);
    if (denial) return NextResponse.json({ message: denial.message }, { status: 403 });

    const existing = await prisma.partyMember.findUnique({
      where: { partyId_userId: { partyId: params.id, userId: user.id } }
    });
    const member = existing ?? (await prisma.partyMember.create({ data: { partyId: params.id, userId: user.id } }));
    return NextResponse.json(member);
  } catch {
    return NextResponse.json({ message: "Unable to join party" }, { status: 400 });
  }
}
