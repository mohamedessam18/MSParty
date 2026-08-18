"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { NotificationBell } from "@/components/notification-bell";
import { Wordmark } from "@/components/ui/wordmark";
import { Feed } from "./feed";

type UserProfile = { id: string; name: string; email: string | null; avatarUrl: string | null; isGuest: boolean; username: string | null };

export default function Dashboard() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/user/profile")
      .then(response => (response.ok ? response.json() : null))
      .then(data => data && setUser(data));
  }, []);

  async function upgrade(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/user/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر تحويل الحساب.");
      setUser(data);
      setUpgradeOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
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
          <NotificationBell />
          {user && (
            <Link
              href="/profile"
              title="البروفايل والأصدقاء"
              className="flex items-center gap-2 rounded border border-velvet-hi bg-velvet px-2 py-1.5 transition hover:border-gold/50"
            >
              <Avatar name={user.name} src={user.avatarUrl} size="sm" />
              <span className="max-w-24 truncate text-xs font-semibold text-ivory">{user.name}</span>
            </Link>
          )}
          <Button variant="danger" size="sm" onClick={() => signOut({ callbackUrl: "/" })}>
            خروج
          </Button>
        </div>
      </header>

      {user?.isGuest && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/[.06] p-4">
          <p className="text-sm text-ivory">
            <b className="text-gold">إنت داخل كضيف.</b> حوّله لحساب دائم عشان تستضيف، وتضيف أصدقاء، وتدخل من أي جهاز.
          </p>
          <Button size="sm" onClick={() => setUpgradeOpen(true)}>
            حوّله لحساب دائم
          </Button>
        </div>
      )}

      {user && !user.isGuest && !user.username && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gold/25 bg-gold/[.05] p-4">
          <p className="text-sm text-ivory">اختار اسم مستخدم عشان أصحابك يلاقوك ويدعوك لسهراتهم.</p>
          <Link href="/profile">
            <Button size="sm">اختار اسم</Button>
          </Link>
        </div>
      )}

      <section className="mt-10">
        <Kicker>لياليك</Kicker>
        <h1 className="display mt-2 text-4xl text-ivory">أهلاً{user ? ` يا ${user.name}` : ""}.</h1>
      </section>

      <Feed />

      <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title="حوّل حسابك لدائم">
        <form onSubmit={upgrade} className="mt-5 space-y-4">
          <p className="text-sm leading-7 text-ivory-dim">سهراتك ورسايلك هتفضل زي ما هي — بنضيف بريد وكلمة مرور لنفس الحساب.</p>
          <Field label="البريد الإلكتروني">
            <Input required type="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} />
          </Field>
          <Field label="كلمة المرور" hint="8 أحرف على الأقل">
            <Input required minLength={8} type="password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "جارٍ التحويل..." : "حوّل الحساب"}
          </Button>
        </form>
      </Modal>
    </main>
  );
}
