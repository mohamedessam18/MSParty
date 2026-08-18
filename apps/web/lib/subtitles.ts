export type Cue = { start: number; end: number; text: string };

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[.,](\d{1,3})/;

function seconds(stamp: string) {
  const match = stamp.match(TIME);
  if (!match) return NaN;
  const [, h, m, s, ms] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

/**
 * Parses SRT and WebVTT with one pass. They differ only in a header, cue ids,
 * and `,` versus `.` before the milliseconds, so splitting on blank lines and
 * looking for the arrow handles both.
 */
export function parseSubtitles(raw: string): Cue[] {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const cues: Cue[] = [];

  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").filter(line => line.trim());
    if (!lines.length) continue;
    const timingIndex = lines.findIndex(line => line.includes("-->"));
    if (timingIndex === -1) continue;

    const [from, to] = lines[timingIndex].split("-->");
    const start = seconds(from);
    const end = seconds(to);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

    const body = lines
      .slice(timingIndex + 1)
      // Strip the inline tags SRT files often carry; we style cues ourselves.
      .map(line => line.replace(/<[^>]+>/g, "").replace(/\{\\[^}]+\}/g, ""))
      .join("\n")
      .trim();
    if (body) cues.push({ start, end, text: body });
  }

  return cues.sort((a, b) => a.start - b.start);
}

/** Finds the cue covering a moment. Linear is fine at a few thousand cues. */
export function cueAt(cues: Cue[], time: number) {
  for (const cue of cues) {
    if (time >= cue.start && time <= cue.end) return cue;
    if (cue.start > time) break;
  }
  return null;
}

const VTT_TIME = (value: number) => {
  const h = Math.floor(value / 3600);
  const m = Math.floor((value % 3600) / 60);
  const s = Math.floor(value % 60);
  const ms = Math.round((value % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

/** Normalises whatever the host picked into WebVTT before it is stored. */
export function toVtt(cues: Cue[]) {
  return `WEBVTT\n\n${cues
    .map((cue, index) => `${index + 1}\n${VTT_TIME(cue.start)} --> ${VTT_TIME(cue.end)}\n${cue.text}`)
    .join("\n\n")}\n`;
}
