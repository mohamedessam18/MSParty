"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";

export default function CreateParty() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [contentType, setContentType] = useState<"youtube" | "upload">("youtube");
  const [contentUrl, setContentUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [formatWarning, setFormatWarning] = useState<string | null>(null);

  function handleFileChange(selected: File | null) {
    setFile(selected);
    const ext = selected?.name.split(".").pop()?.toLowerCase();
    setFormatWarning(
      ext === "mkv" || ext === "avi"
        ? "ملفات .mkv و .avi غالبًا مش مدعومة في المتصفحات. يُفضّل MP4 بترميز H.264."
        : null
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setUploading(true);
    setProgress(null);
    try {
      let uploadedVideoId: string | undefined;
      let finalUrl = contentUrl;

      if (contentType === "upload") {
        if (!file) throw new Error("اختار فيديو لرفعه أولًا.");
        const signed = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size })
        });
        const signedData = await signed.json().catch(() => ({}));
        if (!signed.ok) throw new Error(signedData.message || "تعذر تجهيز رفع الفيديو. راجع إعدادات Cloudflare R2.");

        setProgress(0);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", signedData.uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type || "video/mp4");
          xhr.upload.onprogress = event =>
            event.lengthComputable && setProgress(Math.round((event.loaded / event.total) * 100));
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error("رفع الفيديو لم يكتمل. جرّب مرة ثانية."));
          xhr.onerror = () => reject(new Error("حدث خطأ في الشبكة أثناء نقل الفيديو."));
          xhr.send(file);
        });

        finalUrl = signedData.fileUrl;
        uploadedVideoId = signedData.videoId;
      }

      const response = await fetch("/api/parties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, contentType, contentUrl: finalUrl, uploadedVideoId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مش قادرين نعمل البارتي دلوقتي. تأكد إنك مسجل دخول.");
      router.push(`/party/${data.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة. جرّب تاني.");
      setUploading(false);
      setProgress(null);
    }
  }

  const modes = [
    { value: "youtube" as const, icon: "▶", title: "YouTube", hint: "رابط جاهز للشلة" },
    { value: "upload" as const, icon: "▣", title: "فيديو مرفوع", hint: "مؤقت ويُحذف تلقائيًا" }
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
        <p className="mt-4 text-ivory-dim">اختار رابط YouTube أو ارفع فيديو مؤقت للبارتي.</p>

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
            ) : (
              <div className="space-y-3">
                <label className="block rounded-lg border border-dashed border-gold/35 bg-gold/5 p-5 text-sm text-ivory">
                  اختار فيديو (حتى 2GB)
                  <input required type="file" accept="video/*" className="mt-3 block w-full text-sm text-ivory-dim" onChange={event => handleFileChange(event.target.files?.[0] || null)} />
                  <span className="mt-3 block text-xs leading-6 text-ivory-dim">
                    يُحذف الفيديو بعد تغيير العرض بـ30 دقيقة، أو لو ما أنشأتش بارتي خلال ساعتين.
                  </span>
                </label>
                {formatWarning && (
                  <p className="rounded border border-gold/25 bg-gold/5 p-3 text-xs text-gold">{formatWarning}</p>
                )}
              </div>
            )}

            {progress !== null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-gold">
                  <span>جارٍ رفع الفيديو...</span>
                  <span className="mono">{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-deep">
                  <div className="h-full bg-gold transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}

            {error && <FormError>{error}</FormError>}

            <Button size="lg" disabled={uploading} className="w-full">
              {uploading ? (progress !== null ? `جارٍ الرفع (${progress}%)...` : "جارٍ تجهيز البارتي...") : "افتح البارتي وخد كود الدعوة"}
            </Button>
          </form>
        </Card>
      </section>
    </main>
  );
}
