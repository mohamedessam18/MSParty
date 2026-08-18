"use client";
import { useEffect, useRef, useState } from "react";
import { Message, REACTIONS } from "./types";

/**
 * Fullscreen puts only the stage element on screen, so the page's chat panel
 * disappears with it. This stands in for it — but as a live feed rather than a
 * panel: messages drift away on their own, and the input and reactions come and
 * go with the control bar, so nothing sits permanently over the film.
 */
export function StageOverlay({
  messages,
  chromeShown,
  onSend,
  onReact
}: {
  messages: Message[];
  chromeShown: boolean;
  onSend: (text: string) => void;
  onReact: (emoji: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [visible, setVisible] = useState<Message[]>([]);
  const timers = useRef<number[]>([]);

  // Show each new message for a few seconds, then let it go.
  useEffect(() => {
    const latest = messages[messages.length - 1];
    if (!latest) return;
    setVisible(items => [...items, latest].slice(-4));
    const timer = window.setTimeout(
      () => setVisible(items => items.filter(item => item !== latest)),
      8000
    );
    timers.current.push(timer);
    return () => window.clearTimeout(timer);
  }, [messages]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="flex max-w-sm flex-col gap-2">
      <div className="space-y-1">
        {visible.map((entry, index) => (
          <p
            key={`${entry.sentAt}-${index}`}
            className="animate-message-in w-fit max-w-full rounded bg-ink-deep/70 px-2.5 py-1.5 text-sm text-ivory backdrop-blur-sm"
          >
            <b className="ml-1.5 text-gold">{entry.name}</b>
            {entry.message}
          </p>
        ))}
      </div>

      {/* Tied to the control bar so the film is never framed by chrome. */}
      <div className={`transition-opacity duration-300 ${chromeShown ? "opacity-100" : "pointer-events-none opacity-0"}`}>
        <div className="flex gap-1">
          {REACTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              aria-label={`ابعت ${emoji}`}
              className="rounded bg-ink-deep/75 px-2 py-1 text-base backdrop-blur-sm transition hover:bg-gold/30"
            >
              {emoji}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="mt-1.5">
          <input
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="اكتب رسالة..."
            aria-label="رسالة سريعة"
            className="w-full rounded border border-velvet-hi bg-ink/85 px-3 py-2 text-sm text-ivory placeholder:text-ivory-dim/60 focus:border-gold focus:outline-none"
          />
        </form>
      </div>
    </div>
  );
}
