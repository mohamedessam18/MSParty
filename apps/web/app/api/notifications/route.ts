import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

/** The inbox: recent notices plus how many are still unread. */
export async function GET() {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { actor: { select: { id: true, name: true, username: true, avatarUrl: true } } }
    }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } })
  ]);

  return NextResponse.json({ items, unread });
}

/** Marks everything read. Opening the inbox is the acknowledgement. */
export async function PATCH() {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() }
  });
  return NextResponse.json({ ok: true });
}
