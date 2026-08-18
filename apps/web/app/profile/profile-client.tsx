"use client";
import Link from "next/link";
import { useState } from "react";
import { signOut } from "next-auth/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";
import { VideoLibrary } from "@/components/video-library";
import { PushToggle } from "@/components/push-toggle";
import { FriendsPanel } from "./friends-panel";

export type Profile = {
  id: string;
  name: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt: string;
};

export function ProfileClient({ initial, stats }: { initial: Profile; stats: { parties: number; hosted: number } }) {
  const [me, setMe] = useState(initial);
  const [name, setName] = useState(initial.name);
  const [username, setUsername] = useState(initial.username ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(initial.avatarUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function pickFile(file: File | null) {
    if (!file) return;
    setAvatarFile(file);
    // Preview only — this data URI is never sent. Storing it is what used to
    // put megabytes of base64 into the database.
    const reader = new FileReader();
    reader.onload = event => setPreview(event.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      let avatarUrl = me.avatarUrl;

      if (avatarFile) {
        const signed = await fetch("/api/uploads", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: avatarFile.name, contentType: avatarFile.type || "image/jpeg", fileSize: avatarFile.size })
        });
        const data = await signed.json().catch(() => ({}));
        if (!signed.ok) throw new Error(data.message || "تعذر تجهيز رفع الصورة.");
        const put = await fetch(data.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": avatarFile.type || "image/jpeg" },
          body: avatarFile
        });
        if (!put.ok) throw new Error("رفع الصورة لم يكتمل.");
        avatarUrl = data.fileUrl;
      }

      const response = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, avatarUrl, ...(username.trim() ? { username } : {}) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر الحفظ.");

      setMe(data);
      setPreview(data.avatarUrl);
      setAvatarFile(null);
      setSaved(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-5 py-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Wordmark href="/dashboard" />
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm">
              بارتياتي
            </Button>
          </Link>
          <Button variant="danger" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
            خروج
          </Button>
        </div>
      </header>

      <section className="mt-10">
        <Kicker>البروفايل</Kicker>
        <h1 className="display mt-2 text-4xl text-ivory">{me.name}</h1>
        {me.username && <p className="mono mt-1 text-sm text-gold">@{me.username}</p>}
        <Rule className="mt-4 max-w-xs" />

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="سهرات حضرتها" value={stats.parties} />
          <Stat label="سهرات استضفتها" value={stats.hosted} />
          <Stat label="عضو منذ" value={new Date(me.createdAt).getFullYear()} />
        </div>
      </section>

      {me.isGuest && (
        <Card className="mt-6 border-gold/30 bg-gold/[.06] p-4">
          <p className="text-sm leading-7 text-ivory">
            <b className="text-gold">إنت داخل كضيف.</b> حسابك مربوط بالمتصفح ده بس — حوّله لحساب دائم من لوحة
            التحكم عشان تقدر تستضيف وتضيف أصدقاء.
          </p>
        </Card>
      )}

      <Card className="mt-6 p-5 sm:p-6">
        <Kicker>بياناتك</Kicker>
        <form onSubmit={save} className="mt-4 space-y-5">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar name={name} src={preview} size="xl" ring />
              <label className="absolute bottom-0 left-0 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-gold text-xs text-ink shadow-lift hover:bg-gold-lit">
                <span aria-hidden>📷</span>
                <span className="sr-only">اختر صورة</span>
                <input type="file" accept="image/*" className="hidden" onChange={event => pickFile(event.target.files?.[0] || null)} />
              </label>
            </div>
            <p className="text-xs leading-6 text-ivory-dim">
              الصورة بتظهر لأصحابك في الدردشة وصف المقاعد.
              <br />
              حتى 5MB.
            </p>
          </div>

          <Field label="الاسم المعروض">
            <Input required value={name} onChange={event => setName(event.target.value)} />
          </Field>

          <Field label="اسم المستخدم" hint="أصحابك بيلاقوك بيه · 3 لـ 20 حرف إنجليزي صغير أو رقم أو _">
            <Input
              dir="ltr"
              placeholder="username"
              value={username}
              onChange={event => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              disabled={me.isGuest}
            />
          </Field>

          {me.email && (
            <p className="text-xs text-ivory-dim">
              البريد: <span dir="ltr" className="mono">{me.email}</span>
            </p>
          )}

          {error && <FormError>{error}</FormError>}
          {saved && <p className="text-sm text-gold">تم الحفظ.</p>}

          <Button type="submit" disabled={saving}>
            {saving ? "جارٍ الحفظ..." : "احفظ"}
          </Button>
        </form>
      </Card>

      <Card className="mt-6 p-5">
        <Kicker>الإشعارات</Kicker>
        <div className="mt-3">
          <PushToggle />
        </div>
      </Card>

      <section className="mt-6">
        <FriendsPanel canUseFriends={!!me.username && !me.isGuest} />
      </section>

      <Card className="mt-6 p-5">
        <Kicker>مكتبتي</Kicker>
        <div className="mt-3">
          <VideoLibrary onPick={() => undefined} />
        </div>
      </Card>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-velvet-hi bg-velvet/60 p-4 text-center">
      <b className="display block text-2xl text-gold">{value}</b>
      <span className="mt-1 block text-xs text-ivory-dim">{label}</span>
    </div>
  );
}
