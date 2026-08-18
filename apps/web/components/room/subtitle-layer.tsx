"use client";
import { useEffect, useMemo, useState } from "react";
import { cueAt, parseSubtitles, type Cue } from "@/lib/subtitles";

/**
 * Cues are drawn by us rather than handed to a <track>, for two reasons: the
 * YouTube embed cannot take a track element at all, and Arabic subtitles need
 * direction and styling that native cue rendering barely lets you touch.
 */
export function SubtitleLayer({
  url,
  currentTime,
  enabled
}: {
  url: string | null;
  currentTime: number;
  enabled: boolean;
}) {
  const [cues, setCues] = useState<Cue[]>([]);

  useEffect(() => {
    if (!url) return setCues([]);
    let active = true;
    fetch(url)
      .then(response => (response.ok ? response.text() : ""))
      .then(text => active && setCues(parseSubtitles(text)))
      .catch(() => active && setCues([]));
    return () => {
      active = false;
    };
  }, [url]);

  const line = useMemo(() => (enabled && cues.length ? cueAt(cues, currentTime) : null), [cues, currentTime, enabled]);
  if (!line) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-16 z-20 flex justify-center px-6 sm:bottom-20">
      <p
        dir="auto"
        className="max-w-3xl whitespace-pre-line rounded bg-ink-deep/75 px-3 py-1.5 text-center text-base leading-relaxed text-ivory shadow-lift sm:text-xl"
        style={{ textShadow: "0 2px 6px rgba(0,0,0,.9)" }}
      >
        {line.text}
      </p>
    </div>
  );
}
