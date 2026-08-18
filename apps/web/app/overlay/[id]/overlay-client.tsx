"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ChatPanel } from "@/components/room/chat-panel";
import { useCall } from "@/components/room/use-call";
import { REACTIONS, type FlyingReaction, type Member, type Message } from "@/components/room/types";
import { parsePlatformLink } from "@/lib/platforms";
import { Avatar } from "@/components/ui/avatar";
import { Mark } from "@/components/ui/logo";

type SyncState = {
  isPlaying: boolean;
  timestamp: number;
  serverTime: number;
  role?: string;
  contentUrl?: string | null;
};

/** What the content script sends us, and what we send back. */
const TO_PAGE = "msparty-overlay";
const FROM_PAGE = "msparty-extension";

const OPEN_WIDTH = 340;
const RAIL_WIDTH = 56;

/**
 * The room, as a panel over Netflix, Shahid and the rest.
 *
 * It owns the socket rather than the extension doing so: a Manifest V3 service
 * worker is stopped whenever the browser feels like it, which is not something
 * a two-hour film survives. This is an ordinary page and lives as long as its
 * tab does.
 *
 * The extension's only job across the postMessage boundary is to move a
 * playback position. No frame of video ever crosses it.
 */
export function OverlayClient({ partyId }: { partyId: string }) {
  const [connected, setConnected] = useState(false);
  const [open, setOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [reactions, setReactions] = useState<FlyingReaction[]>([]);
  const [role, setRole] = useState("viewer");
  const [playing, setPlaying] = useState(false);
  const [drift, setDrift] = useState(0);
  /** Null until the page has told us; false means this tab is on something else. */
  const [onRightVideo, setOnRightVideo] = useState<boolean | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  /** The link this tab is on, so the host can hand it to the party. */
  const [here, setHere] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<{ userId: string; name: string; url: string } | null>(null);
  const [pasting, setPasting] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");
  const [changeError, setChangeError] = useState("");
  const [fault, setFault] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const socket = useRef<Socket>();
  /** Where the page actually is, reported back by the content script. */
  const localTime = useRef(0);
  /** Read inside socket handlers, which close over the state they were built
   *  with — the page must never be told the wrong person is driving. */
  const roleRef = useRef("viewer");

  const isHost = role === "host";
  const call = useCall(socket, partyId, connected);

  const toPage = useCallback((message: Record<string, unknown>) => {
    window.parent?.postMessage({ source: TO_PAGE, ...message }, "*");
  }, []);

  // The iframe is as wide as the panel; a transparent one would swallow clicks
  // meant for the film behind it, so the page is told to shrink it too.
  useEffect(() => {
    toPage({ type: "resize", width: open ? OPEN_WIDTH : RAIL_WIDTH });
    if (open) setUnread(0);
  }, [open, toPage]);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFault("مفيش جلسة. ابدأ من صفحة السهرة على MSParty.");
      return;
    }

    // A signed identity sitting in a URL. Taking it out of the address bar
    // means a screenshot of the tab does not hand it to anyone.
    window.history.replaceState(null, "", window.location.pathname);

    try {
      setUserId(JSON.parse(atob(token.split(".")[1])).sub || "");
    } catch {
      // Only marks our own chat lines; not worth failing over.
    }

    // Entering fullscreen re-parents this frame, which reloads it. Chat has no
    // history endpoint reachable from a cross-origin frame, so it is kept here
    // and read back on the way up.
    try {
      const saved = sessionStorage.getItem(`msparty:chat:${partyId}`);
      if (saved) setMessages(JSON.parse(saved));
    } catch {}

    const client = io(process.env.NEXT_PUBLIC_SYNC_SERVER_URL || "http://localhost:4000", {
      auth: { userToken: token }
    });
    socket.current = client;

    client.on("connect", () => {
      setConnected(true);
      client.emit("join-party", { partyId });
    });
    client.on("disconnect", () => setConnected(false));
    client.on("connect_error", () => setFault("مش قادرين نوصل لسيرفر التزامن."));
    client.on("error:unauthorized", ({ message }: { message: string }) => setFault(message));

    const onState = (state: SyncState) => {
      // Only the join reply carries a role; heartbeats do not, so it is kept
      // rather than re-read, and every message repeats it to the page.
      if (state.role) {
        roleRef.current = state.role;
        setRole(state.role);
      }
      setPlaying(state.isPlaying);
      const target = state.isPlaying ? state.timestamp + (Date.now() - state.serverTime) / 1000 : state.timestamp;
      setDrift(localTime.current ? target - localTime.current : 0);
      // The page enforces this on a viewer's own player, so it has to be told
      // who is driving — otherwise it either fights the host or lets everyone
      // scrub.
      toPage({ type: "state", state: { ...state, isHost: roleRef.current === "host" } });
    };
    client.on("sync:state", onState);
    client.on("sync:heartbeat", onState);

    // Handing over the room mid-film changes who may touch the player.
    client.on("party:hostChanged", ({ hostId }: { hostId: string }) => {
      const mine = JSON.parse(atob(token.split(".")[1] || "e30="))?.sub;
      roleRef.current = hostId === mine ? "host" : "viewer";
      setRole(roleRef.current);
    });

    client.on("party:presence", ({ members: present }: { members: Member[] }) => setMembers(present));
    // Only ever delivered to the host.
    client.on("platform:suggested", (incoming: { userId: string; name: string; url: string }) =>
      setSuggestion(incoming)
    );
    client.on("chat:message", (message: Message) => setMessages(list => [...list, message]));
    client.on("chat:typing", ({ name }: { name: string }) => {
      setTyping(list => (list.includes(name) ? list : [...list, name]));
      window.setTimeout(() => setTyping(list => list.filter(item => item !== name)), 3000);
    });
    client.on("reaction:received", ({ emoji, name }: { emoji: string; name: string }) => {
      const key = `${Date.now()}-${Math.random()}`;
      setReactions(list => [...list, { key, emoji, name, offset: 0 }]);
      window.setTimeout(() => setReactions(list => list.filter(item => item.key !== key)), 2600);
    });

    return () => {
      client.disconnect();
      toPage({ type: "leave" });
    };
  }, [partyId, toPage]);

  // Kept so the panel survives being re-parented into a fullscreen element.
  useEffect(() => {
    try {
      sessionStorage.setItem(`msparty:chat:${partyId}`, JSON.stringify(messages.slice(-60)));
    } catch {}
  }, [messages, partyId]);

  useEffect(() => {
    if (!open && messages.length) setUnread(count => count + 1);
    // Counting arrivals, not comparing lengths: restoring from storage would
    // otherwise register sixty unread messages at once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  // What the person watching did, and where their player actually is.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.source !== FROM_PAGE) return;

      if (event.data.type === "position") {
        localTime.current = event.data.seconds;
        // Positions only arrive while something is playing, so one is proof
        // the browser let go.
        setAutoplayBlocked(false);
        return;
      }
      if (event.data.type === "page") {
        setOnRightVideo(event.data.matches);
        setHere(event.data.current ?? null);
        // The host's list of who came along is built from what each tab
        // reports about itself; nothing else knows where anyone is.
        socket.current?.emit("platform:where", { partyId, following: event.data.matches });
        return;
      }
      if (event.data.type === "autoplay-blocked") {
        setAutoplayBlocked(true);
        return;
      }
      // Only the host's actions become the room's — and only the host sends
      // any: the page puts a viewer's player straight back instead of asking.
      if (event.data.type !== "control" || !isHost || !socket.current) return;
      const { kind, seconds } = event.data;
      if (kind !== "play" && kind !== "pause" && kind !== "seek") return;
      socket.current.emit(`control:${kind}`, { partyId, timestamp: seconds });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isHost, partyId]);

  const send = (text: string) => socket.current?.emit("chat:send", { partyId, message: text });

  /**
   * Moves the whole party to another link. Host only, and platform only: the
   * panel lives inside a streaming page, so switching to YouTube or an upload
   * would leave it hanging over a site the party is no longer on.
   */
  function moveParty(url: string) {
    const link = parsePlatformLink(url);
    if (!link.ok) return setChangeError(link.message);
    setChangeError("");
    socket.current?.emit("control:changeVideo", { partyId, contentType: "platform", contentUrl: link.url });
    setSuggestion(null);
    setPasting(false);
    setDraftUrl("");
  }
  const react = (emoji: string) => socket.current?.emit("reaction:send", { partyId, emoji });

  const watching = useMemo(() => members.filter(member => member.id !== userId), [members, userId]);
  // Explicitly false, not merely falsy: undefined means a tab that has not
  // reported yet, and calling those people late would be wrong.
  const behind = useMemo(() => watching.filter(member => member.following === false), [watching]);
  const offBy = Math.abs(drift);

  if (fault) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-ink p-5 text-center">
        <Mark className="h-10 w-10 text-gold" />
        <p className="text-sm leading-7 text-curtain">{fault}</p>
      </main>
    );
  }

  // Collapsed: a rail narrow enough to leave the film alone, wide enough to say
  // the room is still there and whether anything has happened in it.
  if (!open) {
    return (
      <main className="flex h-screen flex-col items-center gap-3 border-l border-velvet-hi bg-ink/95 py-3 backdrop-blur">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="افتح لوحة السهرة"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 transition hover:border-gold"
        >
          <Mark className="h-6 w-6 text-gold" />
          {unread > 0 && (
            <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-curtain px-1 text-[10px] font-bold text-ivory">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>

        <span className={`h-2 w-2 rounded-full ${connected ? "bg-gold" : "bg-curtain"}`} title={connected ? "متصل" : "مش متصل"} />

        <div className="flex flex-col gap-1.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {members.slice(0, 8).map(member => (
            <Avatar key={member.id} name={member.name} src={member.avatarUrl} size="sm" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex h-screen flex-col border-l border-velvet-hi bg-ink/95 backdrop-blur">
      {/* Reactions drift up the panel rather than over the film: the extension
          draws nothing on the service's own page. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-24 z-20 flex flex-col items-center gap-1">
        {reactions.map(item => (
          <span key={item.key} className="animate-reaction-float text-2xl drop-shadow">
            {item.emoji}
          </span>
        ))}
      </div>

      <header className="flex items-center gap-2 border-b border-velvet-hi px-3 py-2.5">
        <Mark className="h-5 w-5 shrink-0 text-gold" />
        <span className="display shrink-0 text-sm text-ivory">
          MS<span className="text-gold">Party</span>
        </span>
        <span className="flex-1" />
        <span className={`text-[11px] ${connected ? "text-gold" : "text-curtain"}`}>
          {connected ? (playing ? "● شغّال" : "متوقف") : "بيحاول يوصل"}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="اطوِ اللوحة"
          className="rounded px-1.5 py-1 text-ivory-dim transition hover:bg-velvet hover:text-ivory"
        >
          ⟨
        </button>
        <button
          type="button"
          onClick={() => toPage({ type: "stop" })}
          aria-label="اقفل السهرة على المنصة دي"
          title="اقفل السهرة"
          className="rounded px-1.5 py-1 text-ivory-dim transition hover:bg-curtain/15 hover:text-curtain"
        >
          ✕
        </button>
      </header>

      {/* The same fact reads two completely different ways depending on who is
          looking at it: the host has wandered off and can take everyone along,
          a viewer has wandered off and needs to come back. */}
      {onRightVideo === false && (
        <div className="border-b border-curtain/40 bg-curtain/10 px-3 py-2.5">
          {isHost ? (
            <>
              <p className="text-[11px] leading-5 text-gold">إنت فاتح حاجة تانية. تنقل الشلة معاك؟</p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => here && moveParty(here)}
                  className="flex-1 rounded border border-gold/50 bg-gold/15 py-1.5 text-[11px] text-gold transition hover:bg-gold/25"
                >
                  انقل الشلة هنا
                </button>
                <button
                  type="button"
                  onClick={() => toPage({ type: "navigate" })}
                  className="rounded border border-velvet-hi px-2 py-1.5 text-[11px] text-ivory-dim transition hover:text-ivory"
                >
                  رجّعني
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] leading-5 text-curtain">إنت على حاجة تانية غير اللي الشلة بتتفرج عليها.</p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => toPage({ type: "navigate" })}
                  className="flex-1 rounded border border-curtain/50 bg-curtain/10 py-1.5 text-[11px] text-curtain transition hover:bg-curtain/20"
                >
                  وديني عندهم
                </button>
                <button
                  type="button"
                  onClick={() => here && socket.current?.emit("platform:suggest", { partyId, url: here })}
                  title="ابعت اللي إنت فاتحه للهوست"
                  className="rounded border border-velvet-hi px-2 py-1.5 text-[11px] text-ivory-dim transition hover:border-gold/40 hover:text-gold"
                >
                  اقترحها
                </button>
              </div>
            </>
          )}
          {changeError && <p className="mt-1.5 text-[11px] text-curtain">{changeError}</p>}
        </div>
      )}

      {/* Reaches the host and nobody else. */}
      {suggestion && isHost && (
        <div className="border-b border-gold/25 bg-gold/[.07] px-3 py-2.5">
          <p className="text-[11px] leading-5 text-ivory">
            <b className="text-gold">{suggestion.name}</b> بيقترح تتفرجوا على حاجة تانية.
          </p>
          <p dir="ltr" className="mt-1 truncate text-[10px] text-ivory-dim">{suggestion.url}</p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => moveParty(suggestion.url)}
              className="flex-1 rounded border border-gold/50 bg-gold/15 py-1.5 text-[11px] text-gold transition hover:bg-gold/25"
            >
              وافق وانقل الكل
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="rounded border border-velvet-hi px-2 py-1.5 text-[11px] text-ivory-dim transition hover:text-ivory"
            >
              لأ
            </button>
          </div>
        </div>
      )}

      {autoplayBlocked && onRightVideo !== false && (
        <p className="border-b border-gold/20 bg-gold/[.07] px-3 py-2 text-[11px] leading-5 text-gold">
          متصفحك موقف التشغيل التلقائي. دوس تشغيل مرة واحدة وهو هيمشي مع الشلة لوحده بعد كده.
        </p>
      )}

      {/* Only shown when it is worth acting on. A permanent readout of a number
          that is almost always zero teaches people to stop reading it. */}
      {connected && offBy > 2 && (
        <p className="border-b border-gold/20 bg-gold/[.07] px-3 py-2 text-[11px] leading-5 text-gold">
          {isHost
            ? `الشلة ${drift > 0 ? "ورّاك" : "قدامك"} بـ${offBy.toFixed(0)} ثانية.`
            : `بنظبّطك مع الشلة — فرق ${offBy.toFixed(0)} ثانية.`}
        </p>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-velvet-hi px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {members.map(member => (
          <span
            key={member.id}
            title={`${member.name}${member.following === false ? " · لسه مالحقش" : ""}`}
            className="relative shrink-0"
          >
            <Avatar
              name={member.name}
              src={member.avatarUrl}
              size="sm"
              // Dimmed rather than hidden: the host needs to see who is missing
              // from the film, not a shorter list that hides them.
              className={member.following === false ? "opacity-35" : ""}
            />
            {member.role === "host" && (
              <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full border border-ink bg-gold" title="الهوست" />
            )}
          </span>
        ))}
        {!watching.length && <span className="text-[11px] text-ivory-dim">لسه لوحدك</span>}
      </div>

      {/* Named, not counted. "2 of 4" tells the host to wait; a list tells them
          who to nudge in the chat. Only worth the room while someone is behind. */}
      {isHost && !!behind.length && (
        <p className="border-b border-velvet-hi px-3 py-1.5 text-[11px] leading-5 text-ivory-dim">
          لسه مالحقوش: <b className="text-ivory">{behind.map(member => member.name).join("، ")}</b>
        </p>
      )}

      {isHost && (
        <div className="border-b border-velvet-hi px-3 py-2">
          {pasting ? (
            <form
              onSubmit={event => {
                event.preventDefault();
                moveParty(draftUrl);
              }}
              className="flex gap-1.5"
            >
              <input
                autoFocus
                dir="ltr"
                value={draftUrl}
                onChange={event => setDraftUrl(event.target.value)}
                placeholder="الزق رابط من أي منصة"
                className="min-w-0 flex-1 rounded border border-velvet-hi bg-ink px-2 py-1.5 text-[11px] text-ivory outline-none focus:border-gold/60"
              />
              <button type="submit" className="rounded border border-gold/40 bg-gold/10 px-2 text-[11px] text-gold">
                انقل
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasting(false);
                  setChangeError("");
                }}
                className="rounded px-1.5 text-[11px] text-ivory-dim hover:text-ivory"
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setPasting(true)}
              className="w-full rounded border border-velvet-hi py-1.5 text-[11px] text-ivory-dim transition hover:border-gold/40 hover:text-gold"
            >
              غيّر اللي بتتفرجوا عليه
            </button>
          )}
          {/* Only here when the banner above is not already carrying it. */}
          {changeError && onRightVideo !== false && (
            <p className="mt-1.5 text-[11px] text-curtain">{changeError}</p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ChatPanel
          messages={messages}
          userId={userId}
          typing={typing}
          onSend={send}
          onTyping={() => socket.current?.emit("chat:typing", { partyId })}
        />
      </div>

      <div className="flex items-center gap-1 border-t border-velvet-hi px-2 py-2">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            type="button"
            onClick={() => react(emoji)}
            aria-label={`ابعت ${emoji}`}
            className="flex-1 rounded py-1 text-lg transition hover:bg-velvet"
          >
            {emoji}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 border-t border-velvet-hi px-3 py-2">
        {call.joined ? (
          <>
            <button
              type="button"
              onClick={call.toggleMic}
              className={`flex-1 rounded border px-2 py-1.5 text-xs transition ${
                call.micMuted ? "border-curtain/40 bg-curtain/10 text-curtain" : "border-gold/30 bg-gold/10 text-gold"
              }`}
            >
              {call.micMuted ? "المايك مقفول" : "المايك شغّال"}
            </button>
            <button
              type="button"
              onClick={call.toggleCamera}
              className={`rounded border px-2 py-1.5 text-xs transition ${
                call.cameraOn ? "border-gold/30 bg-gold/10 text-gold" : "border-velvet-hi text-ivory-dim hover:text-ivory"
              }`}
            >
              كام
            </button>
            <button
              type="button"
              onClick={call.leave}
              className="rounded border border-curtain/40 px-2 py-1.5 text-xs text-curtain transition hover:bg-curtain/10"
            >
              اقفل
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={call.join}
            className="w-full rounded border border-gold/30 bg-gold/10 py-1.5 text-xs text-gold transition hover:border-gold"
          >
            اتكلم مع الشلة 🎙
          </button>
        )}
      </div>
    </main>
  );
}
