import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMembership } from "@/lib/current-user";

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
  return NextResponse.json(messages);
}
