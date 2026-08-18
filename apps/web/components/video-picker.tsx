"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { FormError } from "./ui/input";
import { formatBytes, formatEta, probeVideo, uploadVideo, type Probe, type UploadHandle, type UploadProgress } from "@/lib/upload-client";
import { formatTime } from "./room/types";

export type PickedVideo = { videoId: string; fileUrl: string; title: string; duration: number };

/**
 * One picker used by both the create page and the room's host console, so the
 * two upload paths cannot drift apart again.
 */
export function VideoPicker({
  onUploaded,
  onBusyChange
}: {
  onUploaded: (video: PickedVideo) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const handle = useRef<UploadHandle | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploading = !!progress;
  useEffect(() => onBusyChange?.(uploading || checking), [uploading, checking, onBusyChange]);

  // Closing the tab mid-upload throws the whole transfer away; say so first.
  useEffect(() => {
    if (!uploading) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [uploading]);

  const choose = useCallback(async (picked: File | null) => {
    setError("");
    setProbe(null);
    setFile(picked);
    if (!picked) return;
    setChecking(true);
    const result = await probeVideo(picked);
    setChecking(false);
    setProbe(result);
    if (!result.playable) setError(result.reason || "الملف ده مش قابل للتشغيل.");
  }, []);

  async function start() {
    if (!file || !probe?.playable) return;
    setError("");
    const running = uploadVideo(file, { duration: probe.duration }, setProgress);
    handle.current = running;
    try {
      const { videoId, fileUrl } = await running.promise;
      onUploaded({ videoId, fileUrl, title: file.name, duration: probe.duration });
      setFile(null);
      setProbe(null);
    } catch (err: any) {
      if (err?.message !== "aborted") setError(err?.message || "الرفع لم يكتمل.");
    } finally {
      setProgress(null);
      handle.current = null;
    }
  }

  function cancel() {
    handle.current?.cancel();
    setProgress(null);
  }

  return (
    <div className="space-y-3">
      {!file && (
        <label
          onDragOver={event => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={event => {
            event.preventDefault();
            setDragging(false);
            choose(event.dataTransfer.files?.[0] || null);
          }}
          className={`block cursor-pointer rounded-lg border border-dashed p-6 text-center transition ${
            dragging ? "border-gold bg-gold/10" : "border-gold/35 bg-gold/5 hover:border-gold/60"
          }`}
        >
          <span aria-hidden className="text-2xl">
            ▣
          </span>
          <span className="mt-2 block text-sm text-ivory">اسحب الفيديو هنا أو اضغط للاختيار</span>
          <span className="mt-1 block text-xs text-ivory-dim">حتى 2GB · يُفضّل MP4 بترميز H.264</span>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={event => choose(event.target.files?.[0] || null)}
          />
        </label>
      )}

      {checking && (
        <p className="rounded border border-velvet-hi bg-velvet/60 px-3 py-2 text-sm text-ivory-dim">
          <span className="animate-soft-pulse">بنتأكد إن المتصفح يقدر يشغّل الملف...</span>
        </p>
      )}

      {file && probe && (
        <div className="flex gap-3 rounded-lg border border-velvet-hi bg-velvet/60 p-3">
          {probe.poster ? (
            <img src={probe.poster} alt="" className="h-16 w-28 shrink-0 rounded object-cover" />
          ) : (
            <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded bg-ink-deep text-2xl text-ivory-dim">
              ▣
            </span>
          )}
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm text-ivory">{file.name}</b>
            <span className="mt-0.5 block text-xs text-ivory-dim">
              {formatBytes(file.size)}
              {probe.duration > 0 && ` · ${formatTime(probe.duration)}`}
              {probe.playable && <span className="text-gold"> · جاهز للتشغيل ✓</span>}
            </span>

            {progress ? (
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-deep">
                  <div className="h-full bg-gold transition-all duration-200" style={{ width: `${progress.percent}%` }} />
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-[11px] text-ivory-dim">
                  <span className="mono">{progress.percent}%</span>
                  <span>{formatBytes(progress.bytesPerSecond)}/ث</span>
                  {progress.secondsLeft > 0 && <span>باقي {formatEta(progress.secondsLeft)}</span>}
                </div>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <Button size="sm" type="button" disabled={!probe.playable} onClick={start}>
                  ارفع الفيديو
                </Button>
                <Button size="sm" type="button" variant="ghost" onClick={() => choose(null)}>
                  غيّر الملف
                </Button>
              </div>
            )}
          </div>

          {progress && (
            <Button size="sm" type="button" variant="danger" onClick={cancel} className="self-start">
              إلغاء
            </Button>
          )}
        </div>
      )}

      {error && <FormError>{error}</FormError>}
    </div>
  );
}
