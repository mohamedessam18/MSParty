import { NextResponse } from "next/server";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { createSyncToken } from "@/lib/sync-token";

// This response carries a signed identity. Next's default of
// "Cache-Control: public, max-age=0" is wrong for that, so opt out explicitly
// rather than trusting no proxy on the path ever caches it.
export const dynamic = "force-dynamic";
export async function GET() { try { const sessionUser = await requireUser(); const user = await prisma.user.findUniqueOrThrow({ where: { email: sessionUser.email! } }); return NextResponse.json({ token: await createSyncToken(user) }); } catch { return NextResponse.json({ message: "Unauthorized" }, { status: 401 }); } }
