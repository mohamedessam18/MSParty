"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { ChatPanel } from "@/components/room/chat-panel";
import { Avatar } from "@/components/ui/avatar";
import type { Member, Message } from "@/components/room/types";

type SyncState = { isPlaying: boolean; timestamp: number; serverTime: number; role?: string };

/** What the content script sends us, and what we send back. */
const TO_PAGE = "msparty-overlay";
const FROM_PAGE = "msparty-extension";

/**
 * The panel that hangs over Netflix, Shahid and the rest.
 *
 * It owns the socket rather than the extension doing so: a Manifest V3 service
 * worker is stopped whenever the browser feels like it, which is not a thing a
 * two-hour film can survive. This is an ordinary page and stays alive as long
 * as the tab does.
 *
 * The extension's only job on the other side of the postMessage boundary is to
 * move a playback position. No frame of video ever crosses it.
 */
export function OverlayClient({ partyId }: { partyId: string }) {
  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [typing, setTyping] = useState<string[]>([]);
  const [role, setRole] = useState("viewer");
  const [playing, setPlaying] = useState(false);
  const [fault, setFault] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const socket = useRef<Socket>();

  const isHost = role === "host";

  /** Tells the content script where the room says playback should be. */
  const toPage = useCallback((state: SyncState) => {
    window.parent?.postMessage({ source: TO_PAGE, type: "state", state }, "*");
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setFault("مفيش جلسة. ابدأ من صفحة السهرة على MSParty.");
      return;
    }

    // The token is a signed identity sitting in a URL. Taking it out of the
    // address bar means a screenshot of the tab does not hand it to anyone.
    window.history.replaceState(null, "", window.location.pathname);

    try {
      setUserId(JSON.parse(atob(token.split(".")[1])).sub || "");
    } catch {
      // Only used to mark our own chat lines; not worth failing over.
    }

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
      if (state.role) setRole(state.role);
      setPlaying(state.isPlaying);
      toPage(state);
    };
    client.on("sync:state", onState);
    client.on("sync:heartbeat", onState);

    client.on("party:presence", ({ members: present }: { members: Member[] }) => setMembers(present));
    client.on("chat:message", (message: Message) => setMessages(list => [...list, message]));
    client.on("chat:typing", ({ name }: { name: string }) => {
      setTyping(list => (list.includes(name) ? list : [...list, name]));
      window.setTimeout(() => setTyping(list => list.filter(item => item !== name)), 3000);
    });

    return () => {
      client.disconnect();
      window.parent?.postMessage({ source: TO_PAGE, type: "leave" }, "*");
    };
  }, [partyId, toPage]);

  // What the person watching did on the streaming page. Only the host's actions
  // become the room's — a viewer pressing pause pauses their own tab and the
  // next heartbeat pulls them back, which is the same as in the website's room.
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.data?.source !== FROM_PAGE || event.data.type !== "control") return;
      if (!isHost || !socket.current) return;
      const { kind, seconds } = event.data;
      if (kind !== "play" && kind !== "pause" && kind !== "seek") return;
      socket.current.emit(`control:${kind}`, { partyId, timestamp: seconds });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [isHost, partyId]);

  const send = (text: string) => socket.current?.emit("chat:send", { partyId, message: text });

  if (fault) {
    return (
      <main className="flex h-screen flex-col items-center justify-center gap-3 bg-ink p-6 text-center">
        <span aria-hidden className="text-2xl">⚠️</span>
        <p className="text-sm leading-7 text-curtain">{fault}</p>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-ink">
      <header className="flex items-center justify-between gap-2 border-b border-velvet-hi px-3 py-2.5">
        <span className="display text-sm text-ivory">
          MS<span className="text-gold">Party</span>
        </span>
        <span className={`text-[11px] ${connected ? "text-gold" : "text-curtain"}`}>
          {connected ? (playing ? "● بتتفرجوا" : "متصل") : "بيحاول يوصل..."}
        </span>
      </header>

      <div className="flex gap-1.5 overflow-x-auto border-b border-velvet-hi px-3 py-2">
        {members.map(member => (
          <span key={member.id} title={member.name} className="shrink-0">
            <Avatar name={member.name} src={member.avatarUrl} size="sm" />
          </span>
        ))}
        {!members.length && <span className="text-[11px] text-ivory-dim">لسه مفيش حد</span>}
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
    </main>
  );
}
