export type Member = { id: string; name: string; avatarUrl?: string | null; role: string; isGuest?: boolean };
/** userId is null once the author has erased their account; the line stays so
 *  the conversation around it still reads, but it points at nobody. */
export type Message = { userId: string | null; name: string; message: string; sentAt: string; avatarUrl?: string | null };
export type QueueItem = {
  id: string;
  title: string;
  contentType: string;
  contentUrl: string;
  addedBy: { id: string; name: string };
  votes: number;
};
export type FlyingReaction = { key: string; emoji: string; name: string; offset: number };
export type ControlRequest = { userId: string; name: string };

export const REACTIONS = ["😂", "😮", "❤️", "🔥", "👏", "😢"] as const;

/** Accepts a full YouTube URL, a share link, or a bare 11-character id. */
export function videoId(url: string) {
  if (!url) return "";
  const trimmed = url.trim();
  const match = trimmed.match(/^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/);
  if (match && match[2].length === 11) return match[2];
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;
  return trimmed;
}

export function formatTime(seconds: number) {
  if (!seconds || Number.isNaN(seconds)) return "00:00";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}
