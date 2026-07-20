import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSyncToken } from "@/lib/sync-token";
export async function POST(request: Request) { const { email, password } = await request.json(); const user = email && await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } }); if (!user?.passwordHash || !(await bcrypt.compare(String(password || ""), user.passwordHash))) return NextResponse.json({ message: "Invalid credentials" }, { status: 401 }); return NextResponse.json({ token: await createSyncToken(user), name: user.name }); }
