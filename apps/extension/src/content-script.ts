import { adapterForHost, type Adapter } from "./platforms";

/**
 * Runs on every supported streaming page, and on MSParty itself.
 *
 * On a streaming page it does two things and no more: it drives that page's
 * player from the room, and it hangs the room over the page in an iframe. The
 * iframe is served from our own origin, so the chat, the cameras and the
 * reactions are the same code the website runs — the extension never redraws
 * any of it.
 *
 * It never reads, records or forwards a frame of video. There is no code here
 * that could: it moves a playback position and nothing else.
 */

const MARKER = "msparty-extension";
const VERSION = chrome.runtime.getManifest().version;

/** Announces the extension to our own page, which offers to use it if present. */
document.documentElement.setAttribute(`data-${MARKER}`, VERSION);

type Session = { partyId: string; token: string; siteOrigin: string };

// ---------------------------------------------------------------- our own site

/**
 * On MSParty, the page hands over a session so the extension can join the same
 * room on the streaming site. Passed by postMessage rather than a direct
 * connection so the page never needs to know the extension's id.
 */
function runOnSite() {
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source !== "msparty-site") return;

    if (data.type === "start-platform-party") {
      chrome.runtime.sendMessage({
        type: "start",
        session: { partyId: data.partyId, token: data.token, siteOrigin: location.origin },
        url: data.url
      });
    }
    if (data.type === "stop-platform-party") {
      chrome.runtime.sendMessage({ type: "stop" });
    }
  });
}

// ------------------------------------------------------------ streaming pages

let overlay: HTMLIFrameElement | null = null;
let applying = false;
let adapter: Adapter | null = null;

/**
 * Hangs the room over the page. Same origin as the website, so it carries its
 * own socket and needs nothing from us but a position.
 *
 * It floats rather than pushing the page aside. Every one of these services
 * lays its player out with fixed positioning against the viewport, so shifting
 * the document moves the chrome and leaves the video where it was — the first
 * version did exactly that.
 */
function mountOverlay(session: Session) {
  if (overlay) return;

  const frame = document.createElement("iframe");
  frame.src = `${session.siteOrigin}/overlay/${session.partyId}?token=${encodeURIComponent(session.token)}`;
  frame.setAttribute("allow", "camera; microphone; autoplay");
  // Right-hand side: the page is for an Arabic audience reading right to left,
  // and every one of these players puts its own controls bottom-left.
  frame.style.cssText = [
    "position:fixed",
    "top:0",
    "right:0",
    "left:auto",
    "width:340px",
    "height:100vh",
    "border:0",
    "margin:0",
    "padding:0",
    "z-index:2147483647",
    "color-scheme:dark"
  ].join(";");

  document.documentElement.appendChild(frame);
  overlay = frame;
  followFullscreen();
}

function unmountOverlay() {
  overlay?.remove();
  overlay = null;
}

/**
 * Keeps the panel visible when the player goes fullscreen.
 *
 * Only the fullscreen element and its descendants are painted, so a panel
 * parented to <html> simply vanishes — which is precisely when people are
 * watching. Re-parenting reloads the iframe, and the overlay keeps its chat in
 * sessionStorage for that reason; there is no way to move an iframe without
 * reloading it.
 */
function followFullscreen() {
  document.addEventListener("fullscreenchange", () => {
    if (!overlay) return;
    const target = document.fullscreenElement ?? document.documentElement;
    if (!target.contains(overlay)) target.appendChild(overlay);
  });
}

/** Where the room says everyone should be, in seconds. */
function apply(state: { isPlaying: boolean; timestamp: number; serverTime: number }) {
  const video = adapter?.video();
  if (!video || !adapter) return;

  const target = state.isPlaying ? state.timestamp + (Date.now() - state.serverTime) / 1000 : state.timestamp;

  // The player's own play/pause events fire from this, and they must not be
  // reported back as if the person had pressed something.
  applying = true;
  try {
    if (Math.abs(video.currentTime - target) > 1) {
      if (adapter.seek) adapter.seek(video, target);
      else video.currentTime = target;
    }
    if (state.isPlaying) void video.play().catch(() => undefined);
    else video.pause();
  } finally {
    // Long enough for the service's player to settle and stop emitting.
    setTimeout(() => {
      applying = false;
    }, 600);
  }
}

/** Tells the room what the person watching just did. Host-only; the overlay
 *  decides whether to forward it. */
function report(kind: "play" | "pause" | "seek", seconds: number, origin: string) {
  if (applying || !overlay?.contentWindow) return;
  // Targeted at our own origin rather than "*": the message says what someone
  // is watching and when, and a wildcard hands that to whatever else is framed.
  overlay.contentWindow.postMessage({ source: "msparty-extension", type: "control", kind, seconds }, origin);
}

function watchPlayer(session: Session) {
  let lastTime = 0;

  // Capturing listeners on the document: the <video> is replaced when the
  // service changes title, and rebinding to each new element would miss the
  // gap. Media events do not bubble, but they do capture.
  document.addEventListener("play", event => {
    const video = event.target as HTMLVideoElement;
    if (video?.tagName === "VIDEO") report("play", video.currentTime, session.siteOrigin);
  }, true);

  document.addEventListener("pause", event => {
    const video = event.target as HTMLVideoElement;
    if (video?.tagName === "VIDEO") report("pause", video.currentTime, session.siteOrigin);
  }, true);

  document.addEventListener("timeupdate", event => {
    const video = event.target as HTMLVideoElement;
    if (video?.tagName !== "VIDEO") return;
    // A jump larger than playback could account for is a seek. Ordinary
    // progress moves by well under a second per event.
    if (Math.abs(video.currentTime - lastTime) > 2) report("seek", video.currentTime, session.siteOrigin);
    lastTime = video.currentTime;
  }, true);

  // The overlay is the only thing that talks to the sync server.
  window.addEventListener("message", event => {
    if (event.origin !== session.siteOrigin) return;
    const data = event.data;
    if (data?.source !== "msparty-overlay") return;
    if (data.type === "state") apply(data.state);
    if (data.type === "leave") unmountOverlay();
    // Collapsed, the panel must stop covering the film. The iframe is opaque to
    // clicks whatever it draws, so the frame itself has to shrink.
    if (data.type === "resize" && overlay && typeof data.width === "number") {
      overlay.style.width = `${data.width}px`;
    }
  });

  // Lets the panel say how far out of step this player is without asking for
  // it. Cheap: one number a second, and only while something is playing.
  setInterval(() => {
    const video = adapter?.video();
    if (!video || video.paused || !overlay?.contentWindow) return;
    overlay.contentWindow.postMessage(
      { source: "msparty-extension", type: "position", seconds: video.currentTime },
      session.siteOrigin
    );
  }, 1000);
}

/** Netflix's player is unreachable from here; this puts a relay in the page. */
function injectNetflixBridge() {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("netflix-page.js");
  script.onload = () => script.remove();
  (document.head || document.documentElement).appendChild(script);
}

async function runOnPlatform(found: Adapter) {
  adapter = found;

  const stored = (await chrome.storage.local.get(["session"])) as { session?: Session };
  const session = stored.session;
  if (!session?.partyId || !session.token) return;

  if (found.slug === "netflix") injectNetflixBridge();

  // Services mount their player long after load, and route between titles
  // without a navigation. Wait for something watchable rather than giving up.
  const started = Date.now();
  const timer = setInterval(() => {
    if (found.watching() && found.video()) {
      clearInterval(timer);
      mountOverlay(session);
      watchPlayer(session);
    } else if (Date.now() - started > 5 * 60 * 1000) {
      clearInterval(timer);
    }
  }, 1000);
}

const platform = adapterForHost();
if (platform) void runOnPlatform(platform);
else runOnSite();
