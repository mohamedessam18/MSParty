"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/input";
import { Kicker } from "@/components/ui/card";
import { VideoLibrary } from "@/components/video-library";
import { VideoPicker } from "@/components/video-picker";
import { ControlRequest } from "./types";

export function HostConsole({
  playing,
  isLocked,
  waitForAll,
  stalled,
  requests,
  onTogglePlay,
  onRestart,
  onInvite,
  onToggleLock,
  onToggleWaitForAll,
  onChangeVideo,
  onSwapToUpload,
  subtitlesUrl,
  onUploadSubtitles,
  onClearSubtitles,
  onGrant,
  onDeny
}: {
  playing: boolean;
  isLocked: boolean;
  waitForAll: boolean;
  stalled: { userId: string; name: string }[];
  requests: ControlRequest[];
  onTogglePlay: () => void;
  onRestart: () => void;
  onInvite: () => void;
  onToggleLock: () => void;
  onToggleWaitForAll: () => void;
  onChangeVideo: (youtubeUrl: string) => void;
  onSwapToUpload: (videoId: string, fileUrl: string) => void;
  subtitlesUrl: string | null;
  onUploadSubtitles: (file: File) => Promise<void>;
  onClearSubtitles: () => void;
  onGrant: (userId: string) => void;
  onDeny: (userId: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [subsBusy, setSubsBusy] = useState(false);
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!url.trim()) return;
    setError("");
    setBusy(true);
    onChangeVideo(url.trim());
    setUrl("");
    window.setTimeout(() => setBusy(false), 800);
  }

  return (
    <div className="mt-8 rounded-lg border border-gold/25 bg-gold/[.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Kicker>كونسول الهوست</Kicker>
          <h2 className="display mt-1 text-lg text-ivory">أنت ماسك العرض الليلة.</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onTogglePlay}>
            {playing ? "إيقاف العرض" : "شغّل الفيديو"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onRestart}>
            ابدأ من الأول
          </Button>
          <Button size="sm" variant="ghost" onClick={onInvite}>
            ادعُ صحابك
          </Button>
          <Button size="sm" variant={isLocked ? "danger" : "ghost"} onClick={onToggleLock}>
            {isLocked ? "🔒 مقفول" : "🔓 مفتوح"}
          </Button>
          <Button
            size="sm"
            variant={waitForAll ? "primary" : "ghost"}
            onClick={onToggleWaitForAll}
            aria-pressed={waitForAll}
            title="يوقف العرض تلقائيًا لو حد لسه بيحمّل"
          >
            {waitForAll ? "⏳ بيستنى الكل" : "⏩ مش بيستنى"}
          </Button>
        </div>
      </div>

      {!!stalled.length && (
        <p className="mt-3 rounded border border-curtain/30 bg-curtain/10 px-3 py-2 text-sm text-curtain">
          لسه بيحمّلوا: <b>{stalled.map(item => item.name).join("، ")}</b>
          {waitForAll && " — العرض متوقف لحد ما يجهزوا."}
        </p>
      )}

      {requests.map(request => (
        <div
          key={request.userId}
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-ink/70 p-3 text-sm"
        >
          <span className="text-ivory">
            <b className="text-gold">{request.name}</b> طالب التحكم في العرض
          </span>
          <span className="flex gap-2">
            <Button size="sm" onClick={() => onGrant(request.userId)}>
              سلّمه التحكم
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDeny(request.userId)}>
              مش دلوقتي
            </Button>
          </span>
        </div>
      ))}

      <div className="mt-4 space-y-3 rounded-lg bg-ink/60 p-3">
        <p className="text-sm text-ivory-dim">غيّر العرض — الفيديو القديم يرجع لمكتبتك، مش بيتمسح.</p>

        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
          <Input
            dir="ltr"
            placeholder="رابط YouTube جديد"
            value={url}
            onChange={event => setUrl(event.target.value)}
            aria-label="رابط الفيديو الجديد"
          />
          <Button type="submit" disabled={busy || !url.trim()} className="shrink-0">
            {busy ? "جارٍ التبديل..." : "غيّر الفيديو"}
          </Button>
        </form>

        <VideoPicker onUploaded={video => onSwapToUpload(video.videoId, video.fileUrl)} onBusyChange={setUploadBusy} />
        <VideoLibrary onPick={video => onSwapToUpload(video.id, video.fileUrl)} />

        <div className="flex flex-wrap items-center gap-2 border-t border-velvet-hi pt-3">
          <span className="text-sm text-ivory-dim">الترجمة:</span>
          {subtitlesUrl ? (
            <>
              <span className="text-xs text-gold">مرفوعة ✓</span>
              <Button size="sm" type="button" variant="ghost" onClick={onClearSubtitles}>
                شيلها
              </Button>
            </>
          ) : (
            <label className="cursor-pointer rounded border border-gold/30 px-3 py-1.5 text-xs text-ivory hover:bg-gold/10">
              {subsBusy ? "جارٍ الرفع..." : "ارفع ملف SRT أو VTT"}
              <input
                type="file"
                accept=".srt,.vtt,text/vtt"
                className="hidden"
                onChange={async event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  setError("");
                  setSubsBusy(true);
                  try {
                    await onUploadSubtitles(file);
                  } catch (err: any) {
                    setError(err?.message || "تعذر رفع الترجمة.");
                  } finally {
                    setSubsBusy(false);
                  }
                }}
              />
            </label>
          )}
        </div>

        {error && <FormError>{error}</FormError>}
      </div>
    </div>
  );
}
