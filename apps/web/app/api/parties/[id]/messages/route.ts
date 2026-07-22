import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
export async function GET(_: Request, { params }: { params: { id: string } }) { try { await requireUser(); const messages = await prisma.chatMessage.findMany({ where: { partyId: params.id }, orderBy: { sentAt: "asc" }, take: 100, include: { user: { select: { name: true, avatarUrl: true } } } }); return NextResponse.json(messages); } catch { return NextResponse.json({ message: "Unauthorized" }, { status: 401 }); } }
