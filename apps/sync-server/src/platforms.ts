/**
 * Streaming services a party can be held on.
 *
 * Deliberately duplicated from apps/web/lib/platforms.ts. The two packages ship
 * separately and cannot import across the boundary without a shared build step,
 * and this side has to validate independently anyway: a change of content
 * arrives over the socket, not through the web app's API, so trusting what the
 * client says the service is would let a party point anywhere.
 *
 * Only the slugs and hostnames live here. Labels, marks and examples are
 * presentation and belong to the web app alone.
 */
const HOSTS: Record<string, string[]> = {
  shahid: ["shahid.mbc.net"],
  netflix: ["netflix.com", "www.netflix.com"],
  disneyplus: ["disneyplus.com", "www.disneyplus.com"],
  osn: ["stream.osn.com", "osnplus.com", "www.osnplus.com"],
  primevideo: ["primevideo.com", "www.primevideo.com"],
  watchit: ["watchit.com", "www.watchit.com", "app.watchit.com"],
  viu: ["viu.com", "www.viu.com"]
};

/** The service a link belongs to, or null if it belongs to none of them. */
export function platformForUrl(input: string): string | null {
  let host: string;
  try {
    const url = new URL((input || "").trim());
    if (url.protocol !== "https:") return null;
    host = url.hostname.toLowerCase();
  } catch {
    return null;
  }
  const found = Object.entries(HOSTS).find(([, hosts]) => hosts.includes(host));
  return found ? found[0] : null;
}

/** Drops the fragment, which never identifies the video and often carries a session. */
export function normalisePlatformUrl(input: string) {
  const url = new URL(input.trim());
  url.hash = "";
  return url.toString();
}
