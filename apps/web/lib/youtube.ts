/**
 * Everything we know about a YouTube link without opening it. Lives outside the
 * component tree because both the API route and the player need the same idea
 * of what a video id is — two extractors would eventually disagree.
 */

const ID_SHAPE = /^[a-zA-Z0-9_-]{11}$/;

/** Pulls the id out of any YouTube URL form, or returns "" if there isn't one. */
export function youtubeId(input: string) {
  const trimmed = (input || "").trim();
  if (!trimmed) return "";
  if (ID_SHAPE.test(trimmed)) return trimmed;

  const match = trimmed.match(/(?:youtu\.be\/|\/v\/|\/u\/\w\/|\/embed\/|\/shorts\/|\/live\/|[?&]v=)([^#&?/]+)/);
  return match && ID_SHAPE.test(match[1]) ? match[1] : "";
}

/**
 * The thumbnail without asking anyone: YouTube serves these straight off the
 * CDN for any public video, so a poster survives a missing API key.
 */
export function youtubeThumbnail(id: string) {
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function youtubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** PT1H2M3S → 3723. The API reports durations in ISO 8601, not seconds. */
export function parseIsoDuration(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const total =
    Number(days || 0) * 86400 + Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
  return total > 0 ? total : null;
}

export type YouTubeMeta = {
  id: string;
  title: string;
  channel: string | null;
  description: string | null;
  posterUrl: string | null;
  duration: number | null;
  /** False when YouTube forbids playback outside its own site — the room would
   *  show an error and nothing else, so the host should hear about it first. */
  embeddable: boolean;
  /** True when the details came from the API rather than being guessed. */
  detailed: boolean;
};

/** A live stream reports a zero or absent duration; treat that as unknown. */
function bestThumbnail(thumbnails: Record<string, { url?: string }> | undefined, id: string) {
  const order = ["maxres", "standard", "high", "medium", "default"];
  for (const size of order) {
    const url = thumbnails?.[size]?.url;
    if (url) return url;
  }
  return youtubeThumbnail(id);
}

/**
 * Asks the Data API about a video. Without a key — or when the key is out of
 * quota — this still returns something usable rather than failing the flow:
 * the thumbnail is derivable from the id alone, and a party with a poster and
 * no title is far better than a refused creation.
 */
export async function fetchYouTubeMeta(rawUrlOrId: string): Promise<YouTubeMeta | null> {
  const id = youtubeId(rawUrlOrId);
  if (!id) return null;

  const fallback: YouTubeMeta = {
    id,
    title: "",
    channel: null,
    description: null,
    posterUrl: youtubeThumbnail(id),
    duration: null,
    embeddable: true,
    detailed: false
  };

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return fallback;

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/videos");
    endpoint.searchParams.set("part", "snippet,contentDetails,status");
    endpoint.searchParams.set("id", id);
    endpoint.searchParams.set("key", key);

    // A slow Google response must not hold up party creation.
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(6000), cache: "no-store" });
    if (!response.ok) return fallback;

    const data = await response.json();
    const item = data?.items?.[0];
    // No item means private, deleted, or never existed. The distinction matters:
    // a poster for a video nobody can watch is a worse answer than none.
    if (!item) return { ...fallback, posterUrl: null, embeddable: false, detailed: true };

    return {
      id,
      title: item.snippet?.title || "",
      channel: item.snippet?.channelTitle || null,
      description: item.snippet?.description || null,
      posterUrl: bestThumbnail(item.snippet?.thumbnails, id),
      duration: parseIsoDuration(item.contentDetails?.duration),
      embeddable: item.status?.embeddable !== false,
      detailed: true
    };
  } catch {
    // Timeout, network, or a malformed payload — the id is still enough.
    return fallback;
  }
}
