"use client";
import { useState } from "react";
import { Message, REACTIONS } from "./types";

/**
 * Fullscreen puts only the stage element on screen, so the page's chat panel
 * disappears with it. This is a compact stand-in that lives inside the stage.
 */
export function StageOverlay({
  messages,
  onSend,
  onReact
}: {
  messages: Message[];
  onSend: (text: string) => void;
  onReact: (emoji: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const recent = messages.slice(-5);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {recent.map((entry, index) => (
          <p key={`${entry.sentAt}-${index}`} className="w-fit max-w-full rounded bg-ink/75 px-2.5 py-1.5 text-sm text-ivory backdrop-blur-sm">
            <b className="ml-1.5 text-gold">{entry.name}</b>
            {entry.message}
          </p>
        ))}
      </div>

      <div className="flex gap-1">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => onReact(emoji)}
            aria-label={`ابعت ${emoji}`}
            className="rounded bg-ink/75 px-2 py-1 text-base backdrop-blur-sm transition hover:bg-gold/30"
          >
            {emoji}
          </button>
        ))}
      </div>

      <form onSubmit={submit}>
        <input
          value={draft}
          onChange={event => setDraft(event.target.value)}
          placeholder="اكتب رسالة..."
          aria-label="رسالة سريعة"
          className="w-full rounded border border-velvet-hi bg-ink/85 px-3 py-2 text-sm text-ivory placeholder:text-ivory-dim/60 focus:border-gold focus:outline-none"
        />
      </form>
    </div>
  );
}
