"use client";
import { useEffect, useRef, useState } from "react";
import { formatTime } from "./room/types";
import { youtubeId } from "@/lib/youtube";

export type YouTubeMeta = {
  id: string;
  title: string;
  channel: string | null;
  description: string | null;
  posterUrl: string | null;
  duration: number | null;
  embeddable: boolean;
  detailed: boolean;
};

/**
 * Shows the host what they just pasted. A link is eleven opaque characters, and
 * finding out you invited six people to the wrong video is a thing that should
 * happen before the room exists, not after.
 */
export function YouTubePreview({ url, onMeta }: { url: string; onMeta: (meta: YouTubeMeta | null) => void }) {
  const [meta, setMeta] = useState<YouTubeMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const sequence = useRef(0);
  const report = useRef(onMeta);
  report.current = onMeta;

  useEffect(() => {
    const id = youtubeId(url);
    if (!id) {
      setMeta(null);
      report.current(null);
      return;
    }

    setLoading(true);
    setExpanded(false);
    // Typing a URL produces a valid id well before the last keystroke, so wait
    // for a pause rather than looking up every prefix.
    const timer = window.setTimeout(async () => {
      const ticket = ++sequence.current;
      try {
        const response = await fetch(`/api/youtube/meta?url=${encodeURIComponent(url)}`);
        const data = response.ok ? await response.json() : null;
        if (ticket !== sequence.current) return;
        setMeta(data);
        report.current(data);
      } catch {
        if (ticket === sequence.current) {
          setMeta(null);
          report.current(null);
        }
      } finally {
        if (ticket === sequence.current) setLoading(false);
      }
    }, 450);

    return () => window.clearTimeout(timer);
  }, [url]);

  if (loading && !meta) {
    return (
      <p className="animate-soft-pulse rounded-lg border border-velvet-hi bg-velvet/60 px-3 py-2 text-sm text-ivory-dim">
        بنجيب بيانات الفيديو...
      </p>
    );
  }
  if (!meta) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-velvet-hi bg-velvet/60">
      <div className="flex gap-3 p-3">
        {meta.posterUrl ? (
          <img src={meta.posterUrl} alt="" className="h-16 w-28 shrink-0 rounded object-cover" />
        ) : (
          <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded bg-ink-deep text-2xl text-ivory-dim">
            ▶
          </span>
        )}

        <div className="min-w-0 flex-1">
          {meta.title ? (
            <b className="block text-sm leading-6 text-ivory">{meta.title}</b>
          ) : (
            <b className="block text-sm text-ivory-dim">
              الرابط سليم، بس مانقدرش نجيب اسم الفيديو دلوقتي.
            </b>
          )}
          <span className="mt-0.5 block text-xs text-ivory-dim">
            {meta.channel}
            {meta.channel && meta.duration ? " · " : ""}
            {meta.duration ? formatTime(meta.duration) : ""}
          </span>

          {meta.description && (
            <>
              <p className={`mt-2 whitespace-pre-line text-xs leading-6 text-ivory-dim ${expanded ? "" : "line-clamp-2"}`}>
                {meta.description}
              </p>
              <button
                type="button"
                onClick={() => setExpanded(open => !open)}
                className="mt-1 text-xs text-gold hover:underline"
              >
                {expanded ? "أقل" : "الوصف كامل"}
              </button>
            </>
          )}
        </div>
      </div>

      {meta.detailed && !meta.embeddable && (
        <p className="border-t border-curtain/40 bg-curtain/10 px-3 py-2 text-xs leading-6 text-curtain">
          صاحب الفيديو ده مانع تشغيله بره يوتيوب، فمش هيشتغل في السهرة. اختار فيديو تاني.
        </p>
      )}
    </div>
  );
}
