"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/input";
import { Kicker } from "@/components/ui/card";
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
  onChangeVideo: (input: { url: string; file: File | null }, onProgress: (percent: number) => void) => Promise<void>;
  onGrant: (userId: string) => void;
  onDeny: (userId: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    setProgress(file ? 0 : null);
    try {
      await onChangeVideo({ url, file }, setProgress);
      setUrl("");
      setFile(null);
    } catch (err: any) {
      setError(err?.message || "حدث خطأ أثناء تبديل الفيديو.");
    } finally {
      setBusy(false);
      setProgress(null);
    }
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

      <form onSubmit={submit} className="mt-4 space-y-2 rounded-lg bg-ink/60 p-3">
        <p className="text-sm text-ivory-dim">غيّر العرض — الفيديو المرفوع القديم يُحذف بعد 30 دقيقة.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            dir="ltr"
            placeholder="رابط YouTube جديد"
            value={url}
            onChange={event => {
              setUrl(event.target.value);
              setFile(null);
            }}
            aria-label="رابط الفيديو الجديد"
          />
          <input
            type="file"
            accept="video/*"
            aria-label="ارفع فيديو"
            className="text-xs text-ivory-dim"
            onChange={event => {
              setFile(event.target.files?.[0] || null);
              setUrl("");
            }}
          />
          <Button type="submit" disabled={busy} className="shrink-0">
            {busy ? (progress !== null ? `جارٍ الرفع (${progress}%)` : "جارٍ التبديل...") : "غيّر الفيديو"}
          </Button>
        </div>
        {progress !== null && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-deep">
            <div className="h-full bg-gold transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        )}
        {error && <FormError>{error}</FormError>}
      </form>
    </div>
  );
}
