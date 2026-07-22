"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function CreateParty() {
  const router = useRouter();
  const [name, setName] = useState(""); const [contentType, setContentType] = useState<"youtube" | "upload">("youtube"); const [contentUrl, setContentUrl] = useState(""); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(""); const [uploading, setUploading] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(""); setUploading(true);
    try {
      let uploadedVideoId: string | undefined; let finalUrl = contentUrl;
      if (contentType === "upload") {
        if (!file) throw new Error("اختار فيديو لرفعه أولًا.");
        const signed = await fetch("/api/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }) });
        if (!signed.ok) throw new Error("تعذر تجهيز رفع الفيديو. راجع إعدادات Cloudflare R2.");
        const { uploadUrl, fileUrl, videoId } = await signed.json();
        const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
        if (!upload.ok) throw new Error("رفع الفيديو لم يكتمل. جرّب مرة ثانية.");
        finalUrl = fileUrl; uploadedVideoId = videoId;
      }
      const response = await fetch("/api/parties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, contentType, contentUrl: finalUrl, uploadedVideoId }) });
      if (!response.ok) throw new Error("مش قادرين نعمل البارتي دلوقتي. تأكد إنك مسجل دخول.");
      router.push(`/party/${(await response.json()).id}`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "حصلت مشكلة. جرّب تاني."); } finally { setUploading(false); }
  }
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-7"><Link className="display text-xl font-bold" href="/">MS<span className="text-[#90e4ff]">Party</span></Link><section className="mt-14"><p className="mono text-xs text-[#90e4ff]">HOST A NIGHT</p><h1 className="display mt-2 text-4xl font-semibold">افتح الشاشة للشلة.</h1><p className="mt-3 text-[#aab9d7]">اختار رابط YouTube أو ارفع فيديو مؤقت للبارتي فقط.</p><form onSubmit={submit} className="mt-8 space-y-6 rounded-[24px] border border-white/10 bg-[#131d35]/70 p-5 sm:p-7"><label className="block text-sm text-[#cbd8f1]">اسم السهرة<input required className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-white" placeholder="مثال: ليلة فيلم الجمعة" value={name} onChange={event => setName(event.target.value)} /></label><fieldset><legend className="text-sm text-[#cbd8f1]">نوع العرض</legend><div className="mt-2 grid grid-cols-2 gap-3"><button type="button" onClick={() => setContentType("youtube")} className={`rounded-2xl border p-4 text-right ${contentType === "youtube" ? "border-[#90e4ff] bg-[#90e4ff]/10" : "border-white/10"}`}><b>▶ YouTube</b><span className="mt-1 block text-xs text-[#aab9d7]">رابط جاهز للشلة</span></button><button type="button" onClick={() => setContentType("upload")} className={`rounded-2xl border p-4 text-right ${contentType === "upload" ? "border-[#d4b7ff] bg-[#d4b7ff]/10" : "border-white/10"}`}><b>▣ فيديو مرفوع</b><span className="mt-1 block text-xs text-[#aab9d7]">مؤقت ويحذف تلقائيًا</span></button></div></fieldset>{contentType === "youtube" ? <label className="block text-sm text-[#cbd8f1]">رابط فيديو YouTube<input required className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-white" placeholder="https://youtube.com/watch?v=…" dir="ltr" value={contentUrl} onChange={event => setContentUrl(event.target.value)} /></label> : <label className="block rounded-2xl border border-dashed border-[#d4b7ff]/40 bg-[#d4b7ff]/5 p-5 text-sm text-[#e8dcff]">اختار فيديو (حتى 2GB)<input required type="file" accept="video/*" className="mt-3 block w-full text-sm" onChange={event => setFile(event.target.files?.[0] || null)} /><span className="mt-3 block text-xs leading-6 text-[#aab9d7]">يُحذف الفيديو بعد تغيير العرض بـ30 دقيقة، أو إذا لم تنشئ بارتي خلال ساعتين.</span></label>}{error && <p className="rounded-xl bg-[#ff7b8d]/15 px-3 py-2 text-sm text-[#ffd6dd]">{error}</p>}<button disabled={uploading} className="rounded-full bg-[#90e4ff] px-6 py-3 font-bold text-[#10172b] disabled:opacity-60">{uploading ? "جارٍ تجهيز البارتي…" : "افتح البارتي وخد كود الدعوة"}</button></form></section></main>;
}
