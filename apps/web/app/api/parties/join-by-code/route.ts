import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { normalizePartyCode } from "@/lib/party-code";

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

  const party = await prisma.party.findUnique({ where: { code: clean }, select: { id: true, isLocked: true } });
  if (!party) return NextResponse.json({ message: "مفيش بارتي بالكود ده." }, { status: 404 });

  const existing = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId: party.id, userId: user.id } }
  });

  // A locked room still lets its existing members back in — the lock only stops
  // newcomers, so a reconnect or refresh never locks someone out of their party.
  if (!existing && party.isLocked) {
    return NextResponse.json({ message: "البارتي مقفول ومش بيستقبل حد جديد." }, { status: 403 });
  }

  if (!existing) {
    await prisma.partyMember.create({ data: { partyId: party.id, userId: user.id } });
  }
  return NextResponse.json({ id: party.id });
}
