"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QueueItem } from "./types";

export function QueuePanel({
  items,
  userId,
  isHost,
  onAdd,
  onVote,
  onRemove,
  onPlayNext
}: {
  items: QueueItem[];
  userId: string;
  isHost: boolean;
  onAdd: (title: string, url: string) => void;
  onVote: (id: string) => void;
  onRemove: (id: string) => void;
  onPlayNext: (id: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    onAdd(title.trim() || url.trim(), url.trim());
    setUrl("");
    setTitle("");
  }

  // Most-wanted first; ties fall back to the order they were added in.
  const ordered = [...items].sort((a, b) => b.votes - a.votes);

  return (
    <div className="p-3 sm:p-4">
      <p className="text-sm text-ivory-dim">
        {isHost ? "اختار اللي هتشغّله بعد الفيديو الحالي." : "رشّح فيديو وصوّت على اللي عايز تشوفه."}
      </p>

      <div className="mt-3 space-y-2">
        {ordered.map(item => (
          <div key={item.id} className="flex items-center gap-2 rounded-lg bg-velvet-hi/60 p-3 text-sm">
            <button
              onClick={() => onVote(item.id)}
              aria-label={`صوّت لـ ${item.title}`}
              className="flex w-11 shrink-0 flex-col items-center rounded border border-gold/30 py-1 text-gold transition hover:bg-gold/10"
            >
              <span aria-hidden className="text-xs leading-none">
                ▲
              </span>
              <span className="mono text-xs font-bold">{item.votes}</span>
            </button>
            <div className="min-w-0 flex-1">
              <b className="block truncate text-ivory">{item.title}</b>
              <span className="text-xs text-ivory-dim">{item.addedBy.name}</span>
            </div>
            {isHost && (
              <Button size="sm" onClick={() => onPlayNext(item.id)}>
                شغّله
              </Button>
            )}
            {(isHost || item.addedBy.id === userId) && (
              <button
                onClick={() => onRemove(item.id)}
                aria-label={`شيل ${item.title}`}
                className="px-1 text-ivory-dim transition hover:text-curtain"
              >
                ✕
              </button>
            )}
          </div>
        ))}

        {!ordered.length && (
          <p className="rounded-lg border border-dashed border-velvet-hi p-5 text-center text-sm text-ivory-dim">
            مفيش اقتراحات لسه.
          </p>
        )}
      </div>

      <form className="mt-3 space-y-2" onSubmit={submit}>
        <Input
          dir="ltr"
          placeholder="رابط YouTube"
          value={url}
          onChange={event => setUrl(event.target.value)}
          aria-label="رابط الفيديو"
        />
        <div className="flex gap-2">
          <Input placeholder="اسم الفيلم (اختياري)" value={title} onChange={event => setTitle(event.target.value)} aria-label="اسم الفيديو" />
          <Button type="submit">اقترح</Button>
        </div>
      </form>
    </div>
  );
}
