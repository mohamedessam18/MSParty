import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { normalizePartyCode } from "@/lib/party-code";
import { canJoinParty } from "@/lib/party-access";

export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "سجّل دخولك أولًا للانضمام." }, { status: 401 });
  }

  const { code } = await request.json();
  const clean = normalizePartyCode(String(code || ""));
  if (!clean) return NextResponse.json({ message: "اكتب كود البارتي." }, { status: 400 });

  const party = await prisma.party.findUnique({
    where: { code: clean },
    select: { id: true, hostId: true, isLocked: true, visibility: true }
  });
  if (!party) return NextResponse.json({ message: "مفيش بارتي بالكود ده." }, { status: 404 });

  const denial = await canJoinParty(party, user.id);
  if (denial) return NextResponse.json({ message: denial.message }, { status: 403 });

  const existing = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId: party.id, userId: user.id } }
  });

  if (!existing) {
    await prisma.partyMember.create({ data: { partyId: party.id, userId: user.id } });
  }
  return NextResponse.json({ id: party.id });
}
