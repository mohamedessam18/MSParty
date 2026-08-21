import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { recordWatch } from "@/lib/history";
import { authError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/** The caller's history, newest first. */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authError(error);
  }

  const take = Math.min(Number(new URL(request.url).searchParams.get("take")) || 60, 100);
  const items = await prisma.watchHistory.findMany({
    where: { userId: user.id },
    orderBy: { watchedAt: "desc" },
    take,
    select: {
      id: true,
      partyId: true,
      partyName: true,
      hostName: true,
      contentType: true,
      contentUrl: true,
      title: true,
      posterUrl: true,
      channel: true,
      durationSeconds: true,
      positionSeconds: true,
      watchedAt: true,
      // Present only while the room still exists; the client uses it to decide
      // between "go back in" and "start it again".
      party: { select: { id: true } }
    }
  });

  return NextResponse.json(
    items.map(({ party, ...item }) => ({ ...item, partyAlive: !!party }))
  );
}

/**
 * Records or advances an entry. Called when someone enters a room and
 * periodically while they are in it, including as a beacon on the way out —
 * so the body has to be tolerant of arriving as text/plain.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authError(error);
  }

  const body = await request.json().catch(() => null);
  const partyId = typeof body?.partyId === "string" ? body.partyId : null;
  if (!partyId) return NextResponse.json({ message: "partyId required" }, { status: 400 });

  // Being a member is what makes this the caller's history to write; without the
  // check anyone could seed their own timeline with rooms they never entered.
  const member = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId, userId: user.id } },
    select: { id: true }
  });
  if (!member) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const position = typeof body?.position === "number" ? body.position : undefined;
  const entry = await recordWatch(user.id, partyId, position);
  return entry ? NextResponse.json({ ok: true }) : NextResponse.json({ message: "Not found" }, { status: 404 });
}
