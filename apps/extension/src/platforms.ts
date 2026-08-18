/**
 * One adapter per streaming service.
 *
 * Every service is a `<video>` element underneath, but almost none of them can
 * be driven by touching it directly. Their players keep their own idea of the
 * playback position, and setting `currentTime` behind their back leaves the
 * controls, the buffer and the progress bar disagreeing with the picture. Where
 * a service exposes its own player, the adapter goes through that instead.
 *
 * Slugs must match apps/web/lib/platforms.ts and apps/sync-server/src/platforms.ts.
 */

export type Adapter = {
  slug: string;
  /** Hostnames this adapter claims. Exact matches, never suffixes. */
  hosts: string[];
  /**
   * The element carrying the film, once the page has one. Services mount their
   * player late and swap it between titles, so this is asked repeatedly rather
   * than resolved once.
   */
  video(): HTMLVideoElement | null;
  /** True while the page is on a watchable screen rather than a browse grid. */
  watching(): boolean;
  /** Seconds. Overridden where the service's own player is authoritative. */
  seek?(video: HTMLVideoElement, seconds: number): void;
  /** The title being watched, for the room to display. Best effort. */
  title?(): string | null;
};

/** Every service that is not Netflix behaves closely enough to plain HTML5. */
function standard(slug: string, hosts: string[], watchPath: RegExp, titleSelectors: string[] = []): Adapter {
  return {
    slug,
    hosts,
    video: () => {
      // The largest video on the page is the film; the small ones are trailers
      // and autoplaying tiles in the surrounding UI.
      const candidates = Array.from(document.querySelectorAll("video"));
      if (!candidates.length) return null;
      return candidates.reduce((best, item) =>
        item.videoWidth * item.videoHeight > best.videoWidth * best.videoHeight ? item : best
      );
    },
    watching: () => watchPath.test(location.pathname),
    title: () => {
      for (const selector of titleSelectors) {
        const text = document.querySelector(selector)?.textContent?.trim();
        if (text) return text;
      }
      // document.title is a fallback, not a first choice: most of these append
      // the service's own name to it.
      return document.title.replace(/\s*[|·-]\s*(Netflix|Disney\+|Shahid|شاهد|Prime Video|OSN\+?|Viu|Watch iT!?)\s*$/i, "").trim() || null;
    }
  };
}

/**
 * Netflix is the exception. Its player lives on `window.netflix`, which a
 * content script cannot reach — extensions run in an isolated world with their
 * own `window`. The bridge in page-bridge.ts is injected into the page itself
 * and relays commands; this adapter only asks for them.
 */
const netflix: Adapter = {
  slug: "netflix",
  hosts: ["netflix.com", "www.netflix.com"],
  video: () => document.querySelector<HTMLVideoElement>("video"),
  watching: () => location.pathname.startsWith("/watch/"),
  seek: (_video, seconds) => {
    // Netflix keeps its own position and rewrites currentTime from it, so a
    // direct assignment is undone within a frame. The bridge calls the player's
    // own seek, which is the only thing it will honour.
    window.postMessage({ source: "msparty", type: "netflix:seek", ms: Math.round(seconds * 1000) }, "*");
  },
  title: () => document.querySelector('[data-uia="video-title"]')?.textContent?.trim() || null
};

export const ADAPTERS: Adapter[] = [
  netflix,
  standard("shahid", ["shahid.mbc.net"], /\/(movies|series|episodes|show|player|live)\b/, [
    "h1",
    '[class*="title"]'
  ]),
  standard("disneyplus", ["disneyplus.com", "www.disneyplus.com"], /\/(play|video)\b/, [
    '[data-testid="title"]'
  ]),
  standard("osn", ["stream.osn.com", "osnplus.com", "www.osnplus.com"], /\/(watch|play|player|movie|series)\b/),
  standard("primevideo", ["primevideo.com", "www.primevideo.com"], /\/(detail|watch|region)\b/, [
    '[data-automation-id="title"]'
  ]),
  standard("watchit", ["watchit.com", "www.watchit.com", "app.watchit.com"], /\/(watch|play|movie|series|episode)\b/),
  standard("viu", ["viu.com", "www.viu.com"], /\/(ott|vod|media)\b/)
];

/** The adapter for the page this script is running on, if any. */
export function adapterForHost(host = location.hostname.toLowerCase()) {
  return ADAPTERS.find(adapter => adapter.hosts.includes(host)) ?? null;
}
