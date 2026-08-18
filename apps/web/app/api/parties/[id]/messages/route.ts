import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/current-user";
import { ERASED_AUTHOR } from "@/lib/account-deletion";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireMembership(params.id);
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "FORBIDDEN";
    return NextResponse.json(
      { message: forbidden ? "Forbidden" : "Unauthorized" },
      { status: forbidden ? 403 : 401 }
    );
  }

  const messages = await prisma.chatMessage.findMany({
    where: { partyId: params.id },
    orderBy: { sentAt: "asc" },
    take: 100,
    include: { user: { select: { name: true, avatarUrl: true } } }
  });

  // Flattened here rather than in the client: a message whose author has erased
  // their account has no user to read a name off, and every reader would
  // otherwise need to know that.
  return NextResponse.json(
    messages.map(row => ({
      userId: row.userId,
      name: row.user?.name ?? ERASED_AUTHOR,
      avatarUrl: row.user?.avatarUrl ?? null,
      message: row.message,
      sentAt: row.sentAt
    }))
  );
}
