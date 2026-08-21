import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/current-user";
import { maskDeparted } from "@/lib/account-lifecycle";
import { authError } from "@/lib/api-errors";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireMembership(params.id);
  } catch (error) {
    return authError(error);
  }

  const messages = await prisma.chatMessage.findMany({
    where: { partyId: params.id },
    orderBy: { sentAt: "asc" },
    take: 100,
    include: { user: { select: { name: true, avatarUrl: true, deletionRequestedAt: true } } }
  });

  // Flattened here rather than in the client: a message whose author has erased
  // their account has no user to read a name off, and every reader would
  // otherwise need to know that. An author who is still inside their grace
  // period reads the same way — the row is there, but the identity on it is
  // exactly what they asked to stop showing.
  return NextResponse.json(
    messages.map(row => {
      const author = maskDeparted(row.user, Boolean(row.user?.deletionRequestedAt));
      return {
        userId: author.departed ? null : row.userId,
        name: author.name,
        avatarUrl: author.avatarUrl,
        message: row.message,
        sentAt: row.sentAt
      };
    })
  );
}
