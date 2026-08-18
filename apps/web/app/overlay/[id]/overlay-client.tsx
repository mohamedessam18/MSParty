"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ChatPanel } from "@/components/room/chat-panel";
import { useCall } from "@/components/room/use-call";
import { REACTIONS, type FlyingReaction, type Member, type Message } from "@/components/room/types";
import { Avatar } from "@/components/ui/avatar";
import { Mark } from "@/components/ui/logo";

type SyncState = { isPlaying: boolean; timestamp: number; serverTime: number; role?: string };

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
  const react = (emoji: string) => socket.current?.emit("reaction:send", { partyId, emoji });

  const watching = useMemo(() => members.filter(member => member.id !== userId), [members, userId]);
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
      </header>

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
          <span key={member.id} title={member.name} className="relative shrink-0">
            <Avatar name={member.name} src={member.avatarUrl} size="sm" />
            {member.role === "host" && (
              <span className="absolute -bottom-0.5 -left-0.5 h-2 w-2 rounded-full border border-ink bg-gold" title="الهوست" />
            )}
          </span>
        ))}
        {!watching.length && <span className="text-[11px] text-ivory-dim">لسه لوحدك</span>}
      </div>

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
