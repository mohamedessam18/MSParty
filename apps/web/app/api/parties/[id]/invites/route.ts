import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { areFriends } from "@/lib/friends";
import { notify } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Who the host has already invited, so the room can grey them out. */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const member = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId: params.id, userId: user.id } }
  });
  if (!member) return NextResponse.json({ message: "Forbidden" }, { status: 403 });

  const invites = await prisma.partyInvite.findMany({
    where: { partyId: params.id },
    include: { invited: { select: { id: true, name: true, username: true, avatarUrl: true } } }
  });
  return NextResponse.json(invites.map(row => ({ id: row.id, status: row.status, user: row.invited })));
}

/** Invites a friend. Only friends, so an invite cannot be a channel to strangers. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const party = await prisma.party.findUnique({
    where: { id: params.id },
    select: { id: true, name: true, hostId: true }
  });
  if (!party) return NextResponse.json({ message: "مش موجود." }, { status: 404 });

  // Any member may invite, but only their own friends — that keeps the guest
  // list inside the social graph rather than open to anyone with the room id.
  const member = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId: params.id, userId: user.id } }
  });
  if (!member) return NextResponse.json({ message: "مش عضو في البارتي ده." }, { status: 403 });

  const { userId } = await request.json();
  if (!userId || userId === user.id) return NextResponse.json({ message: "اختار حد." }, { status: 400 });
  if (!(await areFriends(user.id, String(userId)))) {
    return NextResponse.json({ message: "تقدر تدعو أصدقاءك بس." }, { status: 403 });
  }

  const invite = await prisma.partyInvite.upsert({
    where: { partyId_invitedId: { partyId: party.id, invitedId: String(userId) } },
    // Re-inviting someone who declined is allowed; it just refreshes the row
    // rather than creating a second one.
    update: { status: "pending", invitedById: user.id },
    create: { partyId: party.id, invitedId: String(userId), invitedById: user.id }
  });

  await notify({
    userId: String(userId),
    type: "party_invite",
    actorId: user.id,
    partyId: party.id,
    body: party.name
  }).catch(() => undefined);

  return NextResponse.json({ id: invite.id, status: invite.status }, { status: 201 });
}
