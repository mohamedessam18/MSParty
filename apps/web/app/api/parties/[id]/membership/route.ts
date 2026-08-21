import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { authError } from "@/lib/api-errors";

export const dynamic = "force-dynamic";

/**
 * Leaves a party — the member-level counterpart to the host's delete. The room
 * carries on for everyone else; only this person's seat and listing go.
 *
 * Watch history is deliberately left alone: forgetting a room you were in is a
 * separate decision from forgetting that you watched the film.
 */
export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return authError(error);
  }

  const member = await prisma.partyMember.findUnique({
    where: { partyId_userId: { partyId: params.id, userId: user.id } },
    select: { id: true, role: true }
  });
  if (!member) return NextResponse.json({ message: "Not found" }, { status: 404 });

  // A room with no host is a room nobody can control. The host either hands it
  // over or deletes it; walking away quietly is not one of the options.
  if (member.role === "host") {
    return NextResponse.json(
      { message: "إنت الهوست. انقل الاستضافة لحد تاني أو امسح البارتي." },
      { status: 409 }
    );
  }

  await prisma.partyMember.delete({ where: { id: member.id } });
  return new NextResponse(null, { status: 204 });
}
