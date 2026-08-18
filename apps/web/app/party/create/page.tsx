"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { VideoLibrary, type LibraryVideo } from "@/components/video-library";
import { VideoPicker, type PickedVideo } from "@/components/video-picker";
import { YouTubePreview, type YouTubeMeta } from "@/components/youtube-preview";
import { PLATFORMS, parsePlatformLink, platformBySlug, type PlatformSlug } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";
import { formatTime } from "@/components/room/types";

type Chosen = { videoId: string; fileUrl: string; title: string; duration: number; posterUrl: string | null };

export default function CreateParty() {
  const router = useRouter();
  const [name, setName] = useState("");
  // Whether the host has written the name themselves. Until they do, picking a
  // video fills it in for them; after, nothing overwrites what they typed.
  const [nameTouched, setNameTouched] = useState(false);
  const [contentType, setContentType] = useState<"youtube" | "upload" | "platform">("youtube");
  const [platform, setPlatform] = useState<PlatformSlug | null>(null);
  const [visibility, setVisibility] = useState<"private" | "friends" | "code">("friends");
  const [contentUrl, setContentUrl] = useState("");
  const [youtube, setYoutube] = useState<YouTubeMeta | null>(null);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [libraryKey, setLibraryKey] = useState(0);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // "Watch it again" from the history list lands here with the video attached.
  // Read off window rather than useSearchParams: the latter would force this
  // whole page behind a Suspense boundary for one optional convenience.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");
    if (type === "youtube" || type === "upload" || type === "platform") setContentType(type);
    const url = params.get("url");
    if (url) setContentUrl(url);
    const suggested = params.get("name");
    if (suggested) setName(suggested.slice(0, 80));
  }, []);

  const suggestName = useCallback((title: string | null | undefined) => {
    if (!title) return;
    setName(current => (current.trim() ? current : title.slice(0, 80)));
  }, []);

  function takeUploaded(video: PickedVideo) {
    setChosen(video);
    setLibraryKey(key => key + 1);
    if (!nameTouched) suggestName(video.title);
  }

  function takeFromLibrary(video: LibraryVideo) {
    setChosen({
      videoId: video.id,
      fileUrl: video.fileUrl,
      title: video.title || "فيديو مرفوع",
      duration: video.duration || 0,
      posterUrl: video.posterUrl
    });
    if (!nameTouched) suggestName(video.title);
  }

  const takeYouTube = useCallback(
    (meta: YouTubeMeta | null) => {
      setYoutube(meta);
      if (!nameTouched) suggestName(meta?.title);
    },
    [nameTouched, suggestName]
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (contentType === "upload" && !chosen) return setError("ارفع فيديو أو اختار واحد من مكتبتك.");
    if (contentType === "youtube" && youtube?.detailed && !youtube.embeddable) {
      return setError("الفيديو ده مش هيشتغل بره يوتيوب. اختار غيره.");
    }
    if (contentType === "platform") {
      if (!platform) return setError("اختار المنصة الأول.");
      if (!link?.ok) return setError(link?.message || "الزق رابط الحلقة أو الفيلم.");
    }
    setCreating(true);
    try {
      const response = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          contentType,
          contentUrl: contentType === "upload" ? chosen!.fileUrl : contentUrl,
          uploadedVideoId: contentType === "upload" ? chosen!.videoId : undefined,
          visibility
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
    { value: "upload" as const, icon: "▣", title: "فيديو مرفوع", hint: "من جهازك أو مكتبتك" },
    { value: "platform" as const, icon: "◈", title: "منصة", hint: "نتفليكس وشاهد وغيرهم" }
  ];

  // Checked as the host types so a wrong link is caught before six people are
  // invited to it. The server derives the service from the URL regardless.
  const link = contentType === "platform" && contentUrl.trim() ? parsePlatformLink(contentUrl, platform ?? undefined) : null;

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
            <Field label="اسم السهرة" hint="بيتملّى لوحده من الفيديو — غيّره زي ما تحب">
              <Input
                required
                placeholder="مثال: ليلة فيلم الجمعة"
                value={name}
                onChange={event => {
                  setNameTouched(true);
                  setName(event.target.value);
                }}
              />
            </Field>

            <fieldset>
              <legend className="text-sm text-ivory-dim">نوع العرض</legend>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
                {modes.map(mode => (
                  <button
                    key={mode.value}
                    type="button"
                    aria-pressed={contentType === mode.value}
                    onClick={() => setContentType(mode.value)}
                    className={`rounded-lg border p-3 text-right transition sm:p-4 ${
                      contentType === mode.value ? "border-gold bg-gold/10" : "border-velvet-hi hover:border-gold/40"
                    }`}
                  >
                    <b className="block text-sm text-ivory sm:text-base">
                      <span aria-hidden className="ml-1 text-gold">
                        {mode.icon}
                      </span>
                      {mode.title}
                    </b>
                    <span className="mt-1 block text-[11px] leading-5 text-ivory-dim sm:text-xs">{mode.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

            {contentType === "platform" ? (
              <div className="space-y-4">
                <fieldset>
                  <legend className="text-sm text-ivory-dim">المنصة</legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PLATFORMS.map(option => (
                      <button
                        key={option.slug}
                        type="button"
                        aria-pressed={platform === option.slug}
                        onClick={() => setPlatform(option.slug)}
                        className={`rounded-lg border px-3 py-2 text-sm transition ${
                          platform === option.slug
                            ? "border-gold bg-gold/10 text-ivory"
                            : "border-velvet-hi text-ivory-dim hover:border-gold/40 hover:text-ivory"
                        }`}
                      >
                        <span aria-hidden className="mono ml-1.5 text-xs text-gold">
                          {option.mark}
                        </span>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {platform && (
                  <Field
                    label={`رابط الحلقة أو الفيلم على ${platformBySlug(platform)?.label}`}
                    hint="افتح اللي هتتفرجوا عليه على المنصة، وانسخ الرابط من شريط العنوان"
                  >
                    <Input
                      required
                      dir="ltr"
                      placeholder={platformBySlug(platform)?.example}
                      value={contentUrl}
                      onChange={event => setContentUrl(event.target.value)}
                    />
                  </Field>
                )}

                {link && !link.ok && <FormError>{link.message}</FormError>}
                {link?.ok && (
                  <p className="rounded-lg border border-gold/30 bg-gold/[.06] px-3 py-2 text-sm text-ivory">
                    الرابط سليم — {link.platform.label} ✓
                  </p>
                )}

                <div className="space-y-2 rounded-lg border border-velvet-hi bg-velvet/50 p-4 text-xs leading-6 text-ivory-dim">
                  <b className="block text-sm text-ivory">اللي لازم تعرفه قبل ما تفتحها</b>
                  <p>
                    المنصات دي مابتشتغلش جوه أي موقع تاني — بتتفرجوا عندهم، والإضافة بتاعتنا بتزامن التشغيل وترسم الشات
                    فوق الصفحة.
                  </p>
                  <ul className="list-inside list-disc space-y-1">
                    <li>كل واحد لازم يكون معاه اشتراكه الخاص</li>
                    <li>لاب توب أو كمبيوتر — الإضافات مش بتشتغل على متصفحات الموبايل</li>
                    <li>اللي مش معاه اشتراك يقدر يدخل الشات والصوت مع الشلة</li>
                  </ul>
                  <p className="text-gold">الإضافة لسه تحت التنفيذ. تقدر تفتح السهرة دلوقتي وتتكلموا فيها.</p>
                </div>
              </div>
            ) : contentType === "youtube" ? (
              <div className="space-y-3">
                <Field label="رابط فيديو YouTube">
                  <Input required dir="ltr" placeholder="https://youtube.com/watch?v=…" value={contentUrl} onChange={event => setContentUrl(event.target.value)} />
                </Field>
                <YouTubePreview url={contentUrl} onMeta={takeYouTube} />
              </div>
            ) : chosen ? (
              <div className="flex items-center gap-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
                {chosen.posterUrl ? (
                  <img src={chosen.posterUrl} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
                ) : (
                  <span aria-hidden className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-ink-deep text-xl text-gold">
                    ▣
                  </span>
                )}
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

            <fieldset>
              <legend className="text-sm text-ivory-dim">مين يقدر يدخل؟</legend>
              <div className="mt-2 space-y-2">
                {[
                  { value: "friends" as const, title: "أصدقائي", hint: "بيشوفوها في صفحتهم ويدخلوا من غير كود" },
                  { value: "private" as const, title: "بالدعوة بس", hint: "اللي تدعوه بنفسك، ومحدش غيره" },
                  { value: "code" as const, title: "أي حد معاه الكود", hint: "زي الرابط العادي — مناسب لناس مش على المنصة" }
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={visibility === option.value}
                    onClick={() => setVisibility(option.value)}
                    className={`block w-full rounded-lg border p-3 text-right transition ${
                      visibility === option.value ? "border-gold bg-gold/10" : "border-velvet-hi hover:border-gold/40"
                    }`}
                  >
                    <b className="block text-sm text-ivory">{option.title}</b>
                    <span className="mt-0.5 block text-xs text-ivory-dim">{option.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>

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
