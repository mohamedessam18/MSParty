import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";
import { ACTIVE_USER } from "@/lib/account-lifecycle";

export const dynamic = "force-dynamic";

/** The inbox: recent notices plus how many are still unread. */
export async function GET() {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  // A notice whose actor has left goes with them: "فلان بعتلك طلب صداقة" for
  // an account that is no longer reachable is a dead end, and it is one of the
  // last places a name would still surface after the person hid it. Notices
  // with no actor at all — the system's own — are kept.
  const where = {
    userId: user.id,
    OR: [{ actorId: null }, { actor: ACTIVE_USER }]
  };

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { actor: { select: { id: true, name: true, username: true, avatarUrl: true } } }
    }),
    prisma.notification.count({ where: { ...where, readAt: null } })
  ]);

  return NextResponse.json({ items, unread });
}

/** Marks everything read. Opening the inbox is the acknowledgement. */
export async function PATCH() {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });
  return NextResponse.json({ ok: true });
}
