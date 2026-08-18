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

/**
 * Says where it got to, out loud.
 *
 * This runs inside somebody else's page, across two message boundaries and a
 * service worker, and none of it is visible from a terminal. Without a trail,
 * "it does nothing" is all anyone can report — and that describes six different
 * failures equally well.
 */
const say = (...parts: unknown[]) => console.log("%c[MSParty]", "color:#c9a227;font-weight:bold", ...parts);

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
  say(`v${VERSION} — على موقع MSParty. مستني إشارة فتح سهرة منصة.`);
  window.addEventListener("message", event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (data?.source !== "msparty-site") return;

    if (data.type === "start-platform-party") {
      say("وصلتني جلسة — بفتح", data.url);
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
/** The last thing the room said, and whether this person gets to say it. */
let room: RoomState | null = null;
let isHost = false;

type RoomState = {
  isPlaying: boolean;
  timestamp: number;
  serverTime: number;
  isHost?: boolean;
  contentUrl?: string | null;
};

/** What the party is on, when the room has told us. */
let expected: string | null = null;
let lastVerdict: boolean | null = null;

/**
 * Whether two links are the same thing to watch.
 *
 * Compared without the query or the fragment: these services hang a profile,
 * a locale and a tracking id off the same episode, so two people on the very
 * same scene rarely hold identical URLs.
 */
function sameVideo(a: string, b: string) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.origin === right.origin && left.pathname.replace(/\/+$/, "") === right.pathname.replace(/\/+$/, "");
  } catch {
    return false;
  }
}

/**
 * Tells the panel whether this tab is even on the right video.
 *
 * Synchronising a position between two different episodes is worse than not
 * synchronising at all: everything looks like it is working, and everyone is
 * watching something else.
 */
function checkPage(origin: string) {
  if (!expected || !overlay?.contentWindow) return;
  const matches = sameVideo(location.href, expected);
  if (matches === lastVerdict) return;
  lastVerdict = matches;
  overlay.contentWindow.postMessage({ source: "msparty-extension", type: "page", matches, expected }, origin);
}

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
  say("اللوحة اتركّبت:", frame.src);
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
function apply(state: RoomState) {
  room = state;
  if (typeof state.isHost === "boolean") isHost = state.isHost;
  // The host swapping the film mid-party arrives the same way the position
  // does, so following them is the same check as never having been in the
  // right place to begin with.
  if (state.contentUrl) expected = state.contentUrl;

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
    if (state.isPlaying) {
      // A tab that has never been clicked in is not allowed to make noise, and
      // the rejection is the only way to find out. Silently swallowing it
      // leaves someone staring at a frozen frame with no idea why.
      video.play().catch(() => tellPanel({ type: "autoplay-blocked" }));
    } else {
      video.pause();
    }
  } finally {
    // Long enough for the service's player to settle and stop emitting.
    setTimeout(() => {
      applying = false;
    }, 600);
  }
}

/**
 * Puts a viewer's player back where the room has it, now.
 *
 * The room already ignores what a viewer does — but ignoring it server-side
 * means their own picture runs free until the next heartbeat arrives, so
 * pressing play visibly worked for a second before being yanked back. Undoing
 * it here costs no round trip, so the button simply does nothing instead.
 */
function enforce() {
  if (isHost || applying || !room) return;
  apply(room);
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
  // Null until the first event: starting at zero makes a video that resumes at
  // an hour in look like an hour-long jump, which reads as a seek.
  let lastTime: number | null = null;

  // Capturing listeners on the document: the <video> is replaced when the
  // service changes title, and rebinding to each new element would miss the
  // gap. Media events do not bubble, but they do capture.
  const onAction = (kind: "play" | "pause" | "seek") => (event: Event) => {
    const video = event.target as HTMLVideoElement;
    if (video?.tagName !== "VIDEO" || applying) return;
    // The host drives the room; everyone else is put straight back.
    if (isHost) report(kind, video.currentTime, session.siteOrigin);
    else enforce();
  };

  document.addEventListener("play", onAction("play"), true);
  document.addEventListener("pause", onAction("pause"), true);

  document.addEventListener("timeupdate", event => {
    const video = event.target as HTMLVideoElement;
    if (video?.tagName !== "VIDEO") return;
    // A jump larger than playback could account for is a seek. Ordinary
    // progress moves by well under a second per event.
    if (!applying && lastTime !== null && Math.abs(video.currentTime - lastTime) > 2) {
      if (isHost) report("seek", video.currentTime, session.siteOrigin);
      else enforce();
    }
    lastTime = video.currentTime;
  }, true);

  // The overlay is the only thing that talks to the sync server.
  window.addEventListener("message", event => {
    if (event.origin !== session.siteOrigin) return;
    const data = event.data;
    if (data?.source !== "msparty-overlay") return;
    if (data.type === "state") {
      apply(data.state);
      checkPage(session.siteOrigin);
    }
    if (data.type === "leave") unmountOverlay();
    // Following the room to another episode is a navigation the person asked
    // for, from a button in our own panel — never something we do to them.
    if (data.type === "navigate" && expected) location.href = expected;
    if (data.type === "stop") {
      chrome.runtime.sendMessage({ type: "stop" });
      unmountOverlay();
    }
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
    if (!video || !overlay?.contentWindow) return;

    // A safety net behind the event handlers. Some players change track without
    // firing anything we listen for, and a viewer who slips through would
    // otherwise stay adrift until the next heartbeat.
    if (!isHost && room && !applying) {
      const target = room.isPlaying ? room.timestamp + (Date.now() - room.serverTime) / 1000 : room.timestamp;
      if (video.paused === room.isPlaying || Math.abs(video.currentTime - target) > 1.5) enforce();
    }

    // These services route between titles without a page load, so the answer
    // can change under us at any moment.
    checkPage(session.siteOrigin);

    if (video.paused) return;
    overlay.contentWindow.postMessage(
      { source: "msparty-extension", type: "position", seconds: video.currentTime },
      session.siteOrigin
    );
  }, 1000);
}

/** One-way note to the panel, for things it should say out loud. */
function tellPanel(message: Record<string, unknown>) {
  overlay?.contentWindow?.postMessage({ source: "msparty-extension", ...message }, "*");
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

  say(`v${VERSION} — منصة: ${found.slug}`);

  const stored = (await chrome.storage.local.get(["session"])) as { session?: Session };
  const session = stored.session;
  if (!session?.partyId || !session.token) {
    say("مفيش جلسة محفوظة. ابدأ من صفحة السهرة على MSParty ودوس «افتح على المنصة».");
    return;
  }

  if (found.slug === "netflix") injectNetflixBridge();

  // Services mount their player long after load, and route between titles
  // without a navigation. Wait for something watchable rather than giving up.
  const started = Date.now();
  let announced = false;
  const timer = setInterval(() => {
    const watching = found.watching();
    const video = found.video();
    if (watching && video) {
      clearInterval(timer);
      mountOverlay(session);
      watchPlayer(session);
    } else if (Date.now() - started > 5 * 60 * 1000) {
      clearInterval(timer);
      say("عدّت ٥ دقايق ومالقيتش فيديو. المسار:", location.pathname, "· صفحة مشاهدة؟", watching);
    } else if (!announced && Date.now() - started > 8000) {
      // Said once, eight seconds in: long enough that a slow player is not
      // reported as a fault, soon enough to be useful while someone is looking.
      announced = true;
      say("مستني الفيديو — صفحة مشاهدة؟", watching, "· لقيت <video>؟", !!video, "· المسار:", location.pathname);
    }
  }, 1000);
}

const platform = adapterForHost();
if (platform) void runOnPlatform(platform);
else runOnSite();
