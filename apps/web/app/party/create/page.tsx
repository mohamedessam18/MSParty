"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { VideoLibrary, type LibraryVideo } from "@/components/video-library";
import { VideoPicker, type PickedVideo } from "@/components/video-picker";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";
import { formatTime } from "@/components/room/types";

type Chosen = { videoId: string; fileUrl: string; title: string; duration: number };

export default function CreateParty() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contentType, setContentType] = useState<"youtube" | "upload">("youtube");
  const [contentUrl, setContentUrl] = useState("");
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  function takeUploaded(video: PickedVideo) {
    setChosen(video);
    setLibraryKey(key => key + 1);
  }

  function takeFromLibrary(video: LibraryVideo) {
    setChosen({
      videoId: video.id,
      fileUrl: video.fileUrl,
      title: video.title || "فيديو مرفوع",
      duration: video.duration || 0
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (contentType === "upload" && !chosen) return setError("ارفع فيديو أو اختار واحد من مكتبتك.");
    setCreating(true);
    try {
      const response = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contentType,
          contentUrl: contentType === "upload" ? chosen!.fileUrl : contentUrl,
          uploadedVideoId: contentType === "upload" ? chosen!.videoId : undefined
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مش قادرين نعمل البارتي دلوقتي.");
      router.push(`/party/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة. جرّب تاني.");
      setCreating(false);
    }
  }

  const modes = [
    { value: "youtube" as const, icon: "▶", title: "YouTube", hint: "رابط جاهز للشلة" },
    { value: "upload" as const, icon: "▣", title: "فيديو مرفوع", hint: "من جهازك أو مكتبتك" }
  ];

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-5 py-6">
      <header className="flex items-center justify-between">
        <Wordmark />
        <Link className="text-xs text-ivory-dim hover:text-ivory" href="/dashboard">
          ← لوحة التحكم
        </Link>
      </header>

      <section className="mt-10">
        <Kicker>استضف ليلة</Kicker>
        <h1 className="display mt-2 text-4xl text-ivory">افتح الشاشة للشلة.</h1>
        <Rule className="mt-4 max-w-xs" />

        <Card className="mt-8 p-5 sm:p-7">
          <form onSubmit={submit} className="space-y-6">
            <Field label="اسم السهرة">
              <Input required placeholder="مثال: ليلة فيلم الجمعة" value={name} onChange={event => setName(event.target.value)} />
            </Field>

            <fieldset>
              <legend className="text-sm text-ivory-dim">نوع العرض</legend>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {modes.map(mode => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={contentType === mode.value}
                    onClick={() => setContentType(mode.value)}
                    className={`rounded-lg border p-4 text-right transition ${
                      contentType === mode.value ? "border-gold bg-gold/10" : "border-velvet-hi hover:border-gold/40"
                    }`}
                  >
                    <b className="block text-ivory">
                      <span aria-hidden className="ml-1 text-gold">
                        {mode.icon}
                      </span>
                      {mode.title}
                    </b>
                    <span className="mt-1 block text-xs text-ivory-dim">{mode.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {contentType === "youtube" ? (
              <Field label="رابط فيديو YouTube">
                <Input required dir="ltr" placeholder="https://youtube.com/watch?v=…" value={contentUrl} onChange={event => setContentUrl(event.target.value)} />
              </Field>
            ) : chosen ? (
              <div className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
                <span aria-hidden className="text-xl text-gold">
                  ▣
                </span>
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm text-ivory">{chosen.title}</b>
                  {chosen.duration > 0 && <span className="text-xs text-ivory-dim">{formatTime(chosen.duration)}</span>}
                </div>
                <Button size="sm" type="button" variant="ghost" onClick={() => setChosen(null)}>
                  غيّره
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <VideoPicker onUploaded={takeUploaded} onBusyChange={setUploadBusy} />
                <VideoLibrary refreshKey={libraryKey} onPick={takeFromLibrary} />
              </div>
            )}

            {error && <FormError>{error}</FormError>}

            <Button size="lg" disabled={creating || uploadBusy} className="w-full">
              {creating ? "جارٍ تجهيز البارتي..." : uploadBusy ? "استنى الرفع يخلص..." : "افتح البارتي وخد كود الدعوة"}
            </Button>
          </form>
        </Card>
      </section>
    </main>
  );
}
