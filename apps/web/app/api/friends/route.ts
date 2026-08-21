import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { friendshipBetween, normalizeUsername } from "@/lib/friends";
import { notify } from "@/lib/notify";
import { ACTIVE_USER } from "@/lib/account-lifecycle";
import { authError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

const PROFILE = { id: true, name: true, username: true, avatarUrl: true } as const;

/** Friends, plus requests waiting on each side. */
export async function GET() {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  // The friendship row survives the departure — it has to, so restoring an
  // account restores who its friends were — but the other side stops seeing it.
  const rows = await prisma.friendship.findMany({
    where: {
      OR: [
        { requesterId: user.id, addressee: ACTIVE_USER },
        { addresseeId: user.id, requester: ACTIVE_USER }
      ]
    },
    include: { requester: { select: PROFILE }, addressee: { select: PROFILE } },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({
    friends: rows
      .filter(row => row.status === "accepted")
      .map(row => ({ id: row.id, user: row.requesterId === user.id ? row.addressee : row.requester })),
    // Split by direction: one side can act on them, the other can only wait.
    incoming: rows
      .filter(row => row.status === "pending" && row.addresseeId === user.id)
      .map(row => ({ id: row.id, user: row.requester })),
    outgoing: rows
      .filter(row => row.status === "pending" && row.requesterId === user.id)
      .map(row => ({ id: row.id, user: row.addressee }))
  });
}

/** Sends a request by username. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }
  if (user.isGuest) {
    return NextResponse.json({ message: "لازم تعمل حساب عشان تضيف أصدقاء." }, { status: 403 });
  }

  const { username } = await request.json();
  const clean = normalizeUsername(String(username || ""));
  if (!clean) return NextResponse.json({ message: "اكتب اسم المستخدم." }, { status: 400 });

  // findFirst rather than findUnique so the filter can be part of the lookup:
  // an account on its way out answers exactly like one that never existed.
  const target = await prisma.user.findFirst({ where: { username: clean, ...ACTIVE_USER }, select: PROFILE });
  if (!target) return NextResponse.json({ message: "مفيش حد بالاسم ده." }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ message: "ده إنت 🙂" }, { status: 400 });

  // A block is silent in both directions: the blocked person learns nothing,
  // and the blocker is not asked to explain themselves.
  const blocked = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedId: target.id },
        { blockerId: target.id, blockedId: user.id }
      ]
    },
    select: { id: true }
  });
  if (blocked) return NextResponse.json({ message: "مفيش حد بالاسم ده." }, { status: 404 });

  const existing = await friendshipBetween(user.id, target.id);
  if (existing?.status === "accepted") {
    return NextResponse.json({ message: "إنتوا أصدقاء بالفعل." }, { status: 409 });
  }
  if (existing) {
    // They already asked us — treat sending back as accepting, which is what
    // the person clearly means, instead of reporting a duplicate.
    if (existing.addresseeId === user.id) {
      await prisma.friendship.update({
        where: { id: existing.id },
        data: { status: "accepted", respondedAt: new Date() }
      });
      await notify({ userId: target.id, type: "friend_accepted", actorId: user.id }).catch(() => undefined);
      return NextResponse.json({ status: "accepted", user: target });
    }
    return NextResponse.json({ message: "بعتّ طلب بالفعل ومستني الرد." }, { status: 409 });
  }

  await prisma.friendship.create({ data: { requesterId: user.id, addresseeId: target.id } });
  await notify({ userId: target.id, type: "friend_request", actorId: user.id }).catch(() => undefined);
  return NextResponse.json({ status: "pending", user: target }, { status: 201 });
}
