import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { createSyncToken } from "@/lib/sync-token";
export async function GET() { try { const sessionUser = await requireUser(); const user = await prisma.user.findUniqueOrThrow({ where: { email: sessionUser.email! } }); return NextResponse.json({ token: await createSyncToken(user) }); } catch { return NextResponse.json({ message: "Unauthorized" }, { status: 401 }); } }
