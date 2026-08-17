import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/current-user";
import { generatePartyCode } from "@/lib/party-code";

export async function GET() {
  try {
    const user = await requireUser();
    const parties = await prisma.party.findMany({
      where: { members: { some: { user: { email: user.email! } } } },
      orderBy: { createdAt: "desc" },
      include: { host: { select: { name: true } }, _count: { select: { members: true } } }
    });
    return NextResponse.json(parties);
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  let sessionUser;
  try {
    sessionUser = await requireUser();
  } catch {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { name, contentType, contentUrl, uploadedVideoId } = await request.json();
  if (!name?.trim() || !["youtube", "upload"].includes(contentType) || (contentType === "upload" && !uploadedVideoId)) {
    return NextResponse.json({ message: "Invalid party" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: sessionUser.email! } });

    // Codes are short enough that collisions are possible; retry a few times
    // before giving up rather than failing the whole creation on one clash.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const party = await prisma.$transaction(async transaction => {
          const created = await transaction.party.create({
            data: {
              name: name.trim().slice(0, 80),
              code: generatePartyCode(),
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
