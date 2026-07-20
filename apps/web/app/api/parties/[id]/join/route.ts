import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
export async function POST(_: Request, { params }: { params: { id: string } }) { try { const sessionUser = await requireUser(); const user = await prisma.user.findUniqueOrThrow({ where: { email: sessionUser.email! } }); const member = await prisma.partyMember.upsert({ where: { partyId_userId: { partyId: params.id, userId: user.id } }, update: {}, create: { partyId: params.id, userId: user.id } }); return NextResponse.json(member); } catch { return NextResponse.json({ message: "Unable to join party" }, { status: 400 }); } }
