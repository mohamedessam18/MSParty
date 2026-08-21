import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";
import { DEVICE_TTL_DAYS, deviceByCode } from "@/lib/tv-pairing";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** The televisions this account has paired, for the list on the phone. */
export async function GET() {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  const devices = await prisma.tvDevice.findMany({
    where: { userId: user.id, expiresAt: { gt: new Date() } },
    orderBy: { claimedAt: "desc" },
    select: {
      id: true,
      code: true,
      label: true,
      lastSeenAt: true,
      claimedAt: true,
      party: { select: { id: true, name: true } }
    }
  });

  return NextResponse.json({ devices });
}

/**
 * Claims a code, or points an already-claimed set at a different party.
 *
 * The same endpoint for both, because they are the same act from the phone's
 * side: "this television is mine, and it should be showing this". A set that is
 * already someone else's is refused — pairing is not a way to take one over.
 */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  // Six characters from a 32-letter alphabet is a billion codes, but only the
  // handful live at any moment are guessable — this is what stops someone
  // walking them until they hit a television sitting on a pairing screen.
  const limit = await rateLimit(`tvclaim:user:${user.id}`, 15, 15 * 60);
  if (!limit.ok) return tooManyRequests(limit, "محاولات كتير. استنى شوية.");

  const { code, partyId, label } = await request.json().catch(() => ({}));
  const device = await deviceByCode(String(code ?? ""));
  if (!device || device.expiresAt <= new Date()) {
    return NextResponse.json({ message: "الكود ده مش موجود أو انتهت مدته." }, { status: 404 });
  }
  if (device.userId && device.userId !== user.id) {
    return NextResponse.json({ message: "التليفزيون ده مربوط بحساب تاني." }, { status: 409 });
  }

  // Pointing a set at a party you are not in would hand it a token that the
  // socket then refuses — a television stuck on a loading screen with no way to
  // say why. Checked before anything is written.
  let party: { id: string } | null = null;
  if (partyId) {
    const member = await prisma.partyMember.findUnique({
      where: { partyId_userId: { partyId: String(partyId), userId: user.id } },
      select: { partyId: true }
    });
    if (!member) return NextResponse.json({ message: "إنت مش في السهرة دي." }, { status: 403 });
    party = { id: member.partyId };
  }

  const updated = await prisma.tvDevice.update({
    where: { id: device.id },
    data: {
      userId: user.id,
      claimedAt: device.claimedAt ?? new Date(),
      label: typeof label === "string" && label.trim() ? label.trim().slice(0, 40) : device.label,
      // Only touched when a party was actually named, so re-pairing a set does
      // not silently stop whatever it is playing.
      ...(party ? { partyId: party.id } : {}),
      expiresAt: new Date(Date.now() + DEVICE_TTL_DAYS * 86400_000)
    },
    select: { id: true, code: true, label: true, party: { select: { id: true, name: true } } }
  });

  return NextResponse.json({ device: updated });
}

/** Unpairs. The set's stored secret stops working the moment this returns. */
export async function DELETE(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

  // deleteMany, scoped by owner: an id belonging to someone else's television
  // deletes nothing rather than erroring, and says nothing about whether it
  // exists.
  const { count } = await prisma.tvDevice.deleteMany({ where: { id, userId: user.id } });
  return NextResponse.json({ removed: count });
}
