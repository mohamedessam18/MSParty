import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const sessionUser = await requireUser();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: sessionUser.email! } });

    const party = await prisma.party.findUnique({ where: { id: params.id }, select: { isLocked: true } });
    if (!party) return NextResponse.json({ message: "البارتي ده مش موجود." }, { status: 404 });

    const existing = await prisma.partyMember.findUnique({
      where: { partyId_userId: { partyId: params.id, userId: user.id } }
    });
    // The lock keeps newcomers out but never evicts an existing member.
    if (!existing && party.isLocked) {
      return NextResponse.json({ message: "البارتي مقفول ومش بيستقبل حد جديد." }, { status: 403 });
    }

    const member = existing ?? (await prisma.partyMember.create({ data: { partyId: params.id, userId: user.id } }));
    return NextResponse.json(member);
  } catch {
    return NextResponse.json({ message: "Unable to join party" }, { status: 400 });
  }
}
