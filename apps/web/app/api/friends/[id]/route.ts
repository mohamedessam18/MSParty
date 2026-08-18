import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

/** Accepts a request. Only the person who received it can. */
export async function POST(_: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.friendship.findUnique({ where: { id: params.id } });
  // Accepting your own outgoing request would make friendship one-sided by
  // decree, so the check is on the addressee specifically, not on membership.
  if (!row || row.addresseeId !== user.id || row.status !== "pending") {
    return NextResponse.json({ message: "الطلب ده مش موجود." }, { status: 404 });
  }

  await prisma.friendship.update({
    where: { id: row.id },
    data: { status: "accepted", respondedAt: new Date() }
  });
  return NextResponse.json({ status: "accepted" });
}

/** Rejects a request, cancels one you sent, or removes an existing friend. */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const row = await prisma.friendship.findUnique({ where: { id: params.id } });
  if (!row || (row.requesterId !== user.id && row.addresseeId !== user.id)) {
    return NextResponse.json({ message: "مش موجود." }, { status: 404 });
  }

  await prisma.friendship.delete({ where: { id: row.id } });
  return new NextResponse(null, { status: 204 });
}
