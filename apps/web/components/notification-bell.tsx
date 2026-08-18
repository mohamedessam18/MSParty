"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { Avatar } from "./ui/avatar";
import { Button } from "./ui/button";

type Actor = { id: string; name: string; username: string | null; avatarUrl: string | null };
type Note = {
  id: string;
  type: "friend_request" | "friend_accepted" | "party_invite" | "friend_live";
  actor: Actor | null;
  partyId: string | null;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

const LINES: Record<Note["type"], (note: Note) => string> = {
  friend_request: note => `${note.actor?.name ?? "حد"} بعتلك طلب صداقة`,
  friend_accepted: note => `${note.actor?.name ?? "حد"} قبل طلبك`,
  party_invite: note => `${note.actor?.name ?? "حد"} دعاك لـ «${note.body ?? "سهرة"}»`,
  friend_live: note => `${note.actor?.name ?? "حد"} فتح «${note.body ?? "سهرة"}» دلوقتي`
};

/**
 * The inbox lives in the database, so an invite sent while you were away is
 * still here. The socket only makes it arrive without a refresh.
 */
export function NotificationBell() {
  const [items, setItems] = useState<Note[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const socket = useRef<Socket>();

  const load = useCallback(async () => {
    const response = await fetch("/api/notifications");
    if (!response.ok) return;
    const data = await response.json();
    setItems(data.items);
    setUnread(data.unread);
  }, []);

  useEffect(() => {
    load();
    let active = true;
    fetch("/api/sync-token")
      .then(response => response.json())
      .then(({ token }) => {
        if (!active || !token) return;
        const client = io(process.env.NEXT_PUBLIC_SYNC_SERVER_URL || "http://localhost:4000", {
          auth: { userToken: token }
        });
        socket.current = client;
        client.on("notification", (note: Note) => {
          setItems(list => [note, ...list].slice(0, 30));
          setUnread(count => count + 1);
        });
      });
    return () => {
      active = false;
      socket.current?.disconnect();
    };
  }, [load]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    // Opening the inbox is the acknowledgement; no separate "mark read" button.
    if (next && unread) {
      setUnread(0);
      await fetch("/api/notifications", { method: "PATCH" });
    }
  }

  function href(note: Note) {
    if (note.partyId) return `/party/${note.partyId}`;
    return "/profile";
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label={`الإشعارات${unread ? ` · ${unread} جديدة` : ""}`}
        className="relative rounded border border-velvet-hi bg-velvet px-2.5 py-1.5 text-sm text-ivory transition hover:border-gold/50"
      >
        <span aria-hidden>🔔</span>
        {!!unread && (
          <span className="absolute -left-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-curtain px-1 text-[10px] font-bold text-ivory">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-lg border border-velvet-hi bg-velvet p-2 shadow-lift">
            {items.length ? (
              items.map(note => (
                <Link
                  key={note.id}
                  href={href(note)}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-2 rounded p-2 text-sm transition hover:bg-velvet-hi ${
                    note.readAt ? "text-ivory-dim" : "text-ivory"
                  }`}
                >
                  <Avatar name={note.actor?.name} src={note.actor?.avatarUrl} size="sm" />
                  <span className="min-w-0 flex-1">{LINES[note.type]?.(note) ?? "إشعار"}</span>
                </Link>
              ))
            ) : (
              <p className="p-4 text-center text-sm text-ivory-dim">مفيش إشعارات.</p>
            )}
            <div className="border-t border-velvet-hi p-2">
              <Link href="/profile" onClick={() => setOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full">
                  الأصدقاء والطلبات
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
