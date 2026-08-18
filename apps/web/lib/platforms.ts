/**
 * The streaming services a party can be held on.
 *
 * These are never played inside MSParty and never could be: they answer with
 * `X-Frame-Options: DENY`, and their video is Widevine-encrypted against their
 * own origin. A platform party is watched on the service's own site, with the
 * browser extension driving its player and drawing our room over it.
 *
 * Matching is by hostname only. Deep-link paths differ per service, change
 * without notice, and vary by region — a path pattern would reject working
 * links, which is a worse failure than accepting a wrong one.
 */

export type PlatformSlug =
  | "netflix"
  | "shahid"
  | "disneyplus"
  | "primevideo"
  | "osn"
  | "watchit"
  | "viu";

export type Platform = {
  slug: PlatformSlug;
  label: string;
  /** Every hostname the service serves its player from. */
  hosts: string[];
  /** Where to send someone who has not picked anything yet. */
  home: string;
  mark: string;
  /** What a watchable link looks like, shown when one is rejected. */
  example: string;
};

export const PLATFORMS: Platform[] = [
  {
    slug: "shahid",
    label: "شاهد",
    hosts: ["shahid.mbc.net"],
    home: "https://shahid.mbc.net",
    mark: "ش",
    example: "https://shahid.mbc.net/ar/movies/..."
  },
  {
    slug: "netflix",
    label: "Netflix",
    hosts: ["netflix.com", "www.netflix.com"],
    home: "https://www.netflix.com",
    mark: "N",
    example: "https://www.netflix.com/watch/81234567"
  },
  {
    slug: "disneyplus",
    label: "Disney+",
    hosts: ["disneyplus.com", "www.disneyplus.com"],
    home: "https://www.disneyplus.com",
    mark: "D+",
    example: "https://www.disneyplus.com/play/..."
  },
  {
    slug: "osn",
    label: "OSN+",
    hosts: ["stream.osn.com", "osnplus.com", "www.osnplus.com"],
    home: "https://stream.osn.com",
    mark: "OSN",
    example: "https://stream.osn.com/ar/..."
  },
  {
    slug: "primevideo",
    label: "Prime Video",
    hosts: ["primevideo.com", "www.primevideo.com"],
    home: "https://www.primevideo.com",
    mark: "PV",
    example: "https://www.primevideo.com/detail/..."
  },
  {
    slug: "watchit",
    label: "Watch iT!",
    hosts: ["watchit.com", "www.watchit.com", "app.watchit.com"],
    home: "https://app.watchit.com",
    mark: "W",
    example: "https://app.watchit.com/..."
  },
  {
    slug: "viu",
    label: "Viu",
    hosts: ["viu.com", "www.viu.com"],
    home: "https://www.viu.com",
    mark: "V",
    example: "https://www.viu.com/ott/..."
  }
];

export const PLATFORM_SLUGS = PLATFORMS.map(platform => platform.slug);

export function platformBySlug(slug: string | null | undefined) {
  return PLATFORMS.find(platform => platform.slug === slug) ?? null;
}

/** Which service a link belongs to, or null if it belongs to none of them. */
export function platformForUrl(input: string): Platform | null {
  let host: string;
  try {
    const url = new URL(input.trim());
    // http would be downgraded by every one of these services anyway, and
    // accepting it here would put a mixed-content URL in the database.
    if (url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  return PLATFORMS.find(platform => platform.hosts.includes(host)) ?? null;
}

export type PlatformLink =
  | { ok: true; platform: Platform; url: string }
  | { ok: false; message: string };

/**
 * Validates a pasted watch link. Query strings are kept — several services put
 * the episode or the profile there — but the fragment is dropped, since it is
 * never part of what identifies the video and often carries session junk.
 */
export function parsePlatformLink(input: string, expected?: PlatformSlug): PlatformLink {
  const trimmed = (input || "").trim();
  if (!trimmed) return { ok: false, message: "الزق رابط الحلقة أو الفيلم." };

  const platform = platformForUrl(trimmed);
  if (!platform) {
    return { ok: false, message: "الرابط ده مش من منصة مدعومة." };
  }
  if (expected && platform.slug !== expected) {
    return { ok: false, message: `الرابط ده بتاع ${platform.label}، مش المنصة اللي اخترتها.` };
  }

  const url = new URL(trimmed);
  url.hash = "";
  return { ok: true, platform, url: url.toString() };
}
