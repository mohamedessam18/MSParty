"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Wordmark } from "@/components/ui/wordmark";

type Party = { id: string; code: string; name: string; contentType: string; host: { name: string }; _count: { members: number } };
type UserProfile = { id: string; name: string; email: string; avatarUrl: string | null };

const contentLabel: Record<string, string> = { youtube: "YouTube", upload: "فيديو مرفوع", streaming: "إكستنشن" };
const contentIcon: Record<string, string> = { youtube: "▶", upload: "▣", streaming: "◌" };

export default function Dashboard() {
  const [parties, setParties] = useState<Party[]>([]);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [open, setOpen] = useState(false);

  const [editName, setEditName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/parties")
      .then(response => (response.ok ? response.json() : []))
      .then(setParties)
      .finally(() => setReady(true));

    fetch("/api/user/profile")
      .then(response => (response.ok ? response.json() : null))
      .then(data => data && setUser(data));
  }, []);

  function openProfile() {
    if (!user) return;
    setEditName(user.name);
    setPreview(user.avatarUrl);
    setAvatarFile(null);
    setMessage("");
    setError("");
    setOpen(true);
  }

  function pickFile(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    // Local preview only — never sent to the server. Storing this data URI is
    // what used to put megabytes of base64 into the database.
    const reader = new FileReader();
    reader.onload = event => setPreview(event.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      let avatarUrl = user?.avatarUrl ?? null;

      if (avatarFile) {
        const signed = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: avatarFile.name, contentType: avatarFile.type || "image/jpeg", fileSize: avatarFile.size })
        });
        const signedData = await signed.json().catch(() => ({}));
        if (!signed.ok) throw new Error(signedData.message || "تعذر تجهيز رفع الصورة.");

        const upload = await fetch(signedData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": avatarFile.type || "image/jpeg" },
          body: avatarFile
        });
        if (!upload.ok) throw new Error("رفع الصورة لم يكتمل. تحقق من سياسة CORS في R2.");
        avatarUrl = signedData.fileUrl;
      }

      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, avatarUrl })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر حفظ التعديلات.");

      setUser(data);
      setPreview(data.avatarUrl);
      setAvatarFile(null);
      setMessage("تم الحفظ.");
      window.setTimeout(() => setOpen(false), 900);
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء الحفظ.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Wordmark />
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/join">
            <Button variant="ghost" size="sm">
              ادخل بكود
            </Button>
          </Link>
          <Link href="/party/create">
            <Button size="sm">اعمل بارتي</Button>
          </Link>
          {user && (
            <button
              onClick={openProfile}
              title="تعديل البروفايل"
              className="flex items-center gap-2 rounded border border-velvet-hi bg-velvet px-2 py-1.5 transition hover:border-gold/50"
            >
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <span className="max-w-24 truncate text-xs font-semibold text-ivory">{user.name}</span>
            </button>
          )}
          <Button variant="danger" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
            خروج
          </Button>
        </div>
      </header>

      <section className="mt-12">
        <Kicker>لياليك</Kicker>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <h1 className="display text-4xl text-ivory">بارتياتي</h1>
          <p className="text-sm text-ivory-dim">مكان واحد لكل ليلة حلوة.</p>
        </div>

        <div className="mt-8 grid gap-3">
          {parties.map(party => (
            <Link
              key={party.id}
              href={`/party/${party.id}`}
              className="group flex items-center gap-4 rounded-lg border border-velvet-hi bg-velvet/60 p-4 transition hover:border-gold/50 hover:bg-velvet"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded border border-gold/30 bg-gold/10 text-lg text-gold">
                {contentIcon[party.contentType] ?? "◌"}
              </span>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-base text-ivory">{party.name}</b>
                <span className="mt-1 block text-sm text-ivory-dim">
                  {contentLabel[party.contentType] ?? party.contentType} · {party._count.members} معك · {party.host.name}
                </span>
              </span>
              <span className="mono hidden shrink-0 rounded border border-velvet-hi px-2 py-1 text-xs tracking-widest text-gold sm:block">
                {party.code}
              </span>
              <span aria-hidden className="text-gold transition group-hover:-translate-x-1">
                ←
              </span>
            </Link>
          ))}

          {ready && !parties.length && (
            <EmptyState
              icon="◌"
              title="مفيش سهرة لسه."
              action={
                <Link href="/party/create">
                  <Button>اعمل أول بارتي</Button>
                </Link>
              }
            >
              اختار فيديو، وادعُ الناس اللي بتحب تتفرج معاهم.
            </EmptyState>
          )}

          {!ready && <div className="h-20 animate-pulse rounded-lg border border-velvet-hi bg-velvet/40" />}
        </div>
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="تعديل البروفايل">
        <form onSubmit={saveProfile} className="mt-5 space-y-5">
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar name={editName} src={preview} size="xl" ring />
              <label className="absolute bottom-0 left-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gold text-xs text-ink shadow-lift hover:bg-gold-lit">
                <span aria-hidden>📷</span>
                <span className="sr-only">اختر صورة</span>
                <input type="file" accept="image/*" className="hidden" onChange={event => pickFile(event.target.files?.[0] || null)} />
              </label>
            </div>
            <p className="text-xs text-ivory-dim">اضغط على الأيقونة لاختيار صورة (حتى 5MB)</p>
          </div>

          <Field label="اسمك في البارتي">
            <Input required value={editName} onChange={event => setEditName(event.target.value)} />
          </Field>

          {error && <FormError>{error}</FormError>}
          {message && <p className="text-center text-sm font-semibold text-gold">{message}</p>}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? "جارٍ الحفظ..." : "حفظ التعديلات"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  );
}
