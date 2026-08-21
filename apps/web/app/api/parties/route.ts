import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDbUser, requireUser } from "@/lib/current-user";
import { generatePartyCode } from "@/lib/party-code";
import { VISIBILITIES, type Visibility } from "@/lib/party-access";
import { friendIdsOf } from "@/lib/friends";
import { notifyFriendsLive } from "@/lib/notify";
import { fetchYouTubeMeta } from "@/lib/youtube";
import { parsePlatformLink } from "@/lib/platforms";
import { recordWatch } from "@/lib/history";
import { authError } from "@/lib/api-errors";

export async function GET() {
  try {
    const user = await requireUser();
    const parties = await prisma.party.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" },
      include: { host: { select: { name: true } }, _count: { select: { members: true } } }
    });
    return NextResponse.json(parties);
  } catch (error) {
    return authError(error);
  }
}

export async function POST(request: Request) {
  let user;
  try {
    user = await requireDbUser();
  } catch (error) {
    return authError(error);
  }

  // Guests can watch and chat, but a party outlives the browser that made it.
  // Hosting needs an account that can be signed back into.
  if (user.isGuest) {
    return NextResponse.json({ message: "لازم تعمل حساب عشان تستضيف بارتي." }, { status: 403 });
  }

  const { name, contentType, contentUrl, uploadedVideoId, visibility } = await request.json();
  const access: Visibility = VISIBILITIES.includes(visibility) ? visibility : "code";
  if (!name?.trim() || !["youtube", "upload", "platform"].includes(contentType) || (contentType === "upload" && !uploadedVideoId)) {
    return NextResponse.json({ message: "Invalid party" }, { status: 400 });
  }

  // Resolve what is actually playing once, here, rather than on every read.
  // A failure to look it up is not a failure to create the party.
  const details: {
    posterUrl?: string | null;
    videoTitle?: string | null;
    videoChannel?: string | null;
    videoDescription?: string | null;
    videoDuration?: number | null;
    platform?: string | null;
  } = {};

  let resolvedUrl: string | null = contentUrl ?? null;

  if (contentType === "platform") {
    // The service is derived from the link rather than trusted from the form:
    // the two disagreeing would send everyone to a site the party is not on.
    const link = parsePlatformLink(contentUrl || "");
    if (!link.ok) return NextResponse.json({ message: link.message }, { status: 400 });
    details.platform = link.platform.slug;
    details.videoChannel = link.platform.label;
    resolvedUrl = link.url;
  }

  if (contentType === "youtube") {
    const meta = await fetchYouTubeMeta(contentUrl || "");
    if (!meta) return NextResponse.json({ message: "الرابط ده مش رابط يوتيوب صالح." }, { status: 400 });
    // Only refuse on an authoritative answer. Without an API key we have no
    // opinion, and guessing wrong would block a video that plays fine.
    if (meta.detailed && !meta.embeddable) {
      return NextResponse.json(
        { message: "الفيديو ده صاحبه مانعه إنه يتشغّل بره يوتيوب، فمش هينفع في سهرة." },
        { status: 400 }
      );
    }
    details.posterUrl = meta.posterUrl;
    details.videoTitle = meta.title || null;
    details.videoChannel = meta.channel;
    details.videoDescription = meta.description?.slice(0, 2000) || null;
    details.videoDuration = meta.duration;
  }

  try {
    if (contentType === "upload") {
      const source = await prisma.uploadedVideo.findFirst({
        where: { id: uploadedVideoId, uploaderId: user.id },
        select: { title: true, duration: true, posterUrl: true }
      });
      details.videoTitle = source?.title || null;
      details.videoDuration = source?.duration ?? null;
      details.posterUrl = source?.posterUrl || null;
    }

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
              contentUrl: resolvedUrl,
              hostId: user.id,
              ...details,
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

        // The host is watching too; their own history should not wait for a
        // second visit to the room.
        await recordWatch(user.id, party.id).catch(() => undefined);
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
