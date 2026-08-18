"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/card";
import { formatTime } from "./room/types";

export type HistoryEntry = {
  id: string;
  partyId: string | null;
  partyName: string;
  hostName: string | null;
  contentType: string;
  contentUrl: string | null;
  title: string;
  posterUrl: string | null;
  channel: string | null;
  durationSeconds: number | null;
  positionSeconds: number;
  watchedAt: string;
  partyAlive: boolean;
};

const relative = new Intl.RelativeTimeFormat("ar-EG", { numeric: "auto" });

function whenever(iso: string) {
  const minutes = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (Math.abs(minutes) < 60) return relative.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return relative.format(days, "day");
  return relative.format(Math.round(days / 30), "month");
}

/** Where to send someone who wants to watch this again. */
function restartHref(entry: HistoryEntry) {
  const params = new URLSearchParams({ name: entry.title });
  if (entry.contentType === "youtube" && entry.contentUrl) {
    params.set("type", "youtube");
    params.set("url", entry.contentUrl);
  } else {
    // The file itself went back to the uploader's library when the party was
    // deleted, so the picker is the right place to land — not a dead R2 link.
    params.set("type", "upload");
  }
  return `/party/create?${params}`;
}

/**
 * What someone has watched, which outlives the rooms it happened in. Rooms get
 * deleted; "the film we saw last Thursday" should still be one click from
 * playing again.
 */
export function HistoryList({ limit, onCount }: { limit?: number; onCount?: (count: number) => void }) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Held in a ref so a parent passing an inline callback cannot make this
  // refetch on every one of its own renders.
  const report = useRef(onCount);
  report.current = onCount;

  useEffect(() => {
    let active = true;
    fetch(`/api/history?take=${limit ?? 60}`)
      .then(response => (response.ok ? response.json() : []))
      .then((data: HistoryEntry[]) => {
        if (!active) return;
        setItems(data);
        report.current?.(data.length);
      })
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [limit]);

  async function forget(id: string) {
    setBusy(id);
    const response = await fetch(`/api/history/${id}`, { method: "DELETE" });
    if (response.ok) setItems(list => list.filter(item => item.id !== id));
    setBusy(null);
  }

  if (!ready) return null;

  if (!items.length) {
    return (
      <EmptyState icon="◌" title="لسه مافيش حاجة اتفرجت عليها.">
        أول ما تدخل سهرة، هتلاقيها هنا — وتقدر تشغّلها تاني بضغطة.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map(entry => {
        const progress =
          entry.durationSeconds && entry.positionSeconds > 30
            ? Math.min(100, (entry.positionSeconds / entry.durationSeconds) * 100)
            : 0;

        return (
          <li
            key={entry.id}
            className="flex items-center gap-3 rounded-lg border border-velvet-hi bg-velvet/60 p-3 transition hover:border-gold/40"
          >
            <span className="relative shrink-0">
              {entry.posterUrl ? (
                <img src={entry.posterUrl} alt="" loading="lazy" className="h-12 w-20 rounded object-cover sm:h-14 sm:w-24" />
              ) : (
                <span
                  aria-hidden
                  className="flex h-12 w-20 items-center justify-center rounded border border-gold/25 bg-gold/10 text-gold sm:h-14 sm:w-24"
                >
                  {entry.contentType === "youtube" ? "▶" : "▣"}
                </span>
              )}
              {progress > 0 && (
                <span className="absolute inset-x-0 bottom-0 h-1 rounded-b bg-ink/70">
                  <span className="block h-full rounded-b bg-curtain" style={{ width: `${progress}%` }} />
                </span>
              )}
            </span>

            <div className="min-w-0 flex-1">
              <b className="block truncate text-sm text-ivory">{entry.title}</b>
              <span className="mt-0.5 block truncate text-xs text-ivory-dim">
                {entry.channel || entry.hostName}
                {entry.durationSeconds ? ` · ${formatTime(entry.durationSeconds)}` : ""}
                {` · ${whenever(entry.watchedAt)}`}
              </span>
              {/* The party name only earns a line when it says something the
                  video title does not. */}
              {entry.partyName !== entry.title && (
                <span className="mt-0.5 block truncate text-[11px] text-ivory-dim/70">من «{entry.partyName}»</span>
              )}
            </div>

            {entry.partyAlive && entry.partyId ? (
              <Link href={`/party/${entry.partyId}`} className="shrink-0">
                <Button size="sm">ارجع</Button>
              </Link>
            ) : (
              <Link href={restartHref(entry)} className="shrink-0">
                <Button size="sm" variant="ghost">
                  شغّله تاني
                </Button>
              </Link>
            )}

            <button
              type="button"
              disabled={busy === entry.id}
              onClick={() => forget(entry.id)}
              title="شيله من السجل"
              aria-label={`شيل ${entry.title} من السجل`}
              className="shrink-0 rounded px-1.5 py-1 text-sm text-ivory-dim transition hover:text-curtain disabled:opacity-40"
            >
              ✕
            </button>
          </li>
        );
      })}
    </ul>
  );
}
