"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { formatBytes } from "@/lib/upload-client";
import { formatTime } from "./room/types";

export type LibraryVideo = {
  id: string;
  title: string | null;
  duration: number | null;
  sizeBytes: number | null;
  fileUrl: string;
  partyId: string | null;
};

/**
 * Uploads now survive their party, so the same film can start a new night
 * without a second two-gigabyte transfer.
 */
export function VideoLibrary({
  onPick,
  refreshKey = 0
}: {
  onPick: (video: LibraryVideo) => void;
  refreshKey?: number;
}) {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [ready, setReady] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/uploads")
      .then(response => (response.ok ? response.json() : []))
      .then(items => active && setVideos(items))
      .finally(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  async function remove(id: string) {
    setRemoving(id);
    const response = await fetch(`/api/uploads/${id}`, { method: "DELETE" });
    if (response.ok) setVideos(items => items.filter(item => item.id !== id));
    setRemoving(null);
  }

  if (!ready || !videos.length) return null;

  return (
    <div className="space-y-2">
      <p className="text-sm text-ivory-dim">أو اختار من فيديوهاتك المرفوعة:</p>
      {videos.map(video => (
        <div key={video.id} className="flex items-center gap-3 rounded-lg border border-velvet-hi bg-velvet/50 p-3">
          <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gold/30 bg-gold/10 text-gold">
            ▣
          </span>
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm text-ivory">{video.title || "فيديو بدون اسم"}</b>
            <span className="text-xs text-ivory-dim">
              {video.duration ? formatTime(video.duration) : "مدة غير معروفة"}
              {video.sizeBytes ? ` · ${formatBytes(video.sizeBytes)}` : ""}
              {video.partyId && <span className="text-gold"> · مستخدم في بارتي</span>}
            </span>
          </div>
          <Button
            size="sm"
            type="button"
            // A video can only be attached to one party at a time (partyId is
            // unique), so it has to leave its current room before reuse.
            disabled={!!video.partyId}
            title={video.partyId ? "شغّال في بارتي تاني دلوقتي" : undefined}
            onClick={() => onPick(video)}
          >
            اختاره
          </Button>
          <Button
            size="sm"
            type="button"
            variant="danger"
            disabled={!!video.partyId || removing === video.id}
            title={video.partyId ? "مستخدم في بارتي دلوقتي" : "امسحه"}
            onClick={() => remove(video.id)}
          >
            ✕
          </Button>
        </div>
      ))}
    </div>
  );
}
