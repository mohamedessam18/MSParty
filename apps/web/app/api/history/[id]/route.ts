import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

/** Removes one entry. Nothing else is touched — the party, if it still exists,
 *  carries on without the person who forgot about it. */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // deleteMany scoped by userId rather than delete by id: it cannot be made to
  // remove somebody else's row, and a stale id is a no-op instead of a throw.
  const { count } = await prisma.watchHistory.deleteMany({ where: { id: params.id, userId: user.id } });
  return count ? new NextResponse(null, { status: 204 }) : NextResponse.json({ message: "Not found" }, { status: 404 });
}
