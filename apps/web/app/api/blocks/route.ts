import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";
import { normalizeUsername } from "@/lib/friends";

export const dynamic = "force-dynamic";

export async function GET() {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const blocks = await prisma.block.findMany({
    where: { blockerId: user.id },
    include: { blocked: { select: { id: true, name: true, username: true, avatarUrl: true } } }
  });
  return NextResponse.json(blocks.map(row => ({ id: row.id, user: row.blocked })));
}

/** Blocking also ends the friendship and drops any pending request between them. */
export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { username } = await request.json();
  const target = await prisma.user.findUnique({
    where: { username: normalizeUsername(String(username || "")) },
    select: { id: true }
  });
  if (!target) return NextResponse.json({ message: "مفيش حد بالاسم ده." }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ message: "مينفعش." }, { status: 400 });

  await prisma.$transaction([
    prisma.friendship.deleteMany({
      where: {
        OR: [
          { requesterId: user.id, addresseeId: target.id },
          { requesterId: target.id, addresseeId: user.id }
        ]
      }
    }),
    prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId: user.id, blockedId: target.id } },
      update: {},
      create: { blockerId: user.id, blockedId: target.id }
    })
  ]);

  return NextResponse.json({ ok: true }, { status: 201 });
}

export async function DELETE(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
  const { id } = await request.json();
  await prisma.block.deleteMany({ where: { id: String(id), blockerId: user.id } });
  return new NextResponse(null, { status: 204 });
}
