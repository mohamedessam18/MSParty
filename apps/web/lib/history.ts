import { prisma } from "./prisma";
import { youtubeId, youtubeThumbnail } from "./youtube";

/** How long an entry survives before the cleanup job drops it. */
export const HISTORY_DAYS = 90;

/**
 * Records that someone was in a room, or updates where they got to. Everything
 * is copied off the party rather than referenced, because the row has to keep
 * reading correctly once the party is deleted.
 */
export async function recordWatch(userId: string, partyId: string, positionSeconds?: number) {
  const party = await prisma.party.findUnique({
    where: { id: partyId },
    select: {
      id: true,
      name: true,
      contentType: true,
      contentUrl: true,
      posterUrl: true,
      videoTitle: true,
      videoChannel: true,
      videoDuration: true,
      host: { select: { name: true } }
    }
  });
  if (!party) return null;

  // Older parties predate the metadata columns, so fall back to what the id
  // alone can give us rather than showing a blank card.
  const poster =
    party.posterUrl ||
    (party.contentType === "youtube" ? youtubeThumbnail(youtubeId(party.contentUrl || "")) : null);

  const position = Number.isFinite(positionSeconds) && positionSeconds! > 0 ? positionSeconds! : undefined;

  const snapshot = {
    partyName: party.name,
    hostName: party.host.name,
    contentType: party.contentType,
    contentUrl: party.contentUrl,
    title: party.videoTitle || party.name,
    posterUrl: poster,
    channel: party.videoChannel,
    durationSeconds: party.videoDuration,
    watchedAt: new Date()
  };

  return prisma.watchHistory.upsert({
    where: { userId_partyId: { userId, partyId } },
    create: { userId, partyId, ...snapshot, positionSeconds: position ?? 0 },
    // A later visit refreshes the snapshot: the host may have swapped the video.
    // Position only moves when the caller actually reported one, so re-opening
    // the dashboard cannot reset someone back to zero.
    update: { ...snapshot, ...(position === undefined ? {} : { positionSeconds: position }) }
  });
}

export function pruneHistory() {
  return prisma.watchHistory.deleteMany({
    where: { watchedAt: { lt: new Date(Date.now() - HISTORY_DAYS * 86400_000) } }
  });
}
