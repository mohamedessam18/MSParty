import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireUser } from "@/lib/current-user";
import { generatePartyCode } from "@/lib/party-code";
import { VISIBILITIES, type Visibility } from "@/lib/party-access";
import { friendIdsOf } from "@/lib/friends";
import { notifyFriendsLive } from "@/lib/notify";

export async function GET() {
  try {
    const user = await requireUser();
    const parties = await prisma.party.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: { host: { select: { name: true } }, _count: { select: { members: true } } }
    });
    return NextResponse.json(parties);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  // Guests can watch and chat, but a party outlives the browser that made it.
  // Hosting needs an account that can be signed back into.
  if (user.isGuest) {
    return NextResponse.json({ message: "لازم تعمل حساب عشان تستضيف بارتي." }, { status: 403 });
  }

  const { name, contentType, contentUrl, uploadedVideoId, visibility } = await request.json();
  const access: Visibility = VISIBILITIES.includes(visibility) ? visibility : "code";
  if (!name?.trim() || !["youtube", "upload"].includes(contentType) || (contentType === "upload" && !uploadedVideoId)) {
    return NextResponse.json({ message: "Invalid party" }, { status: 400 });
  }

  try {

    // Codes are short enough that collisions are possible; retry a few times
    // before giving up rather than failing the whole creation on one clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const party = await prisma.$transaction(async transaction => {
          const created = await transaction.party.create({
            data: {
              name: name.trim().slice(0, 80),
              code: generatePartyCode(),
              visibility: access,
              contentType,
              contentUrl,
              hostId: user.id,
              members: { create: { userId: user.id, role: "host" } }
            }
          });
          if (contentType === "upload") {
            const video = await transaction.uploadedVideo.updateMany({
              where: { id: uploadedVideoId, uploaderId: user.id, partyId: null },
              data: { partyId: created.id, cleanupAt: null }
            });
            if (video.count !== 1) throw new Error("Invalid upload");
          }
          return created;
        });
        // Friends hear about a room they can actually walk into; a private or
        // code-only one is nobody's business until they are invited.
        if (access === "friends") {
          const friendIds = await friendIdsOf(user.id);
          await notifyFriendsLive(user.id, friendIds, party.id, party.name).catch(() => undefined);
        }
        return NextResponse.json(party, { status: 201 });
      } catch (error) {
        const isCodeClash =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          (error.meta?.target as string[] | undefined)?.includes("code");
        if (!isCodeClash) throw error;
      }
    }
    return NextResponse.json({ message: "تعذر توليد كود للبارتي. جرّب تاني." }, { status: 503 });
  } catch {
    return NextResponse.json({ message: "Unable to create party" }, { status: 400 });
  }
}
