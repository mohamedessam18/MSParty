"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";

type Device = {
  id: string;
  code: string;
  label: string | null;
  lastSeenAt: string | null;
  party: { id: string; name: string } | null;
};

/**
 * The phone half of pairing.
 *
 * This is the screen that does the actual authenticating: the television proved
 * nothing, and this page — which is signed in — is what turns a code on a
 * screen into a credential for this account.
 */
export function TvLinkClient() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/tv/devices");
    setDevices(response.ok ? (await response.json()).devices : []);
  }

  useEffect(() => {
    load();
  }, []);

  async function claim(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/tv/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, label })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مقدرناش نوصّل التليفزيون.");
      setCode("");
      setLabel("");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة.");
    } finally {
      setBusy(false);
    }
  }

  async function unpair(id: string) {
    setBusy(true);
    await fetch(`/api/tv/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
    setBusy(false);
  }

  return (
    <main className="mx-auto min-h-screen max-w-md px-5 py-6">
      <header className="flex items-center justify-between">
        <Wordmark href="/dashboard" />
        <Link href="/profile">
          <Button variant="ghost" size="sm">
            ← البروفايل
          </Button>
        </Link>
      </header>

      <section className="mt-10">
        <Kicker>تليفزيون</Kicker>
        <h1 className="display mt-2 text-3xl text-ivory">اتفرجوا على الشاشة الكبيرة</h1>
        <Rule className="mt-4" />
        <p className="mt-4 text-sm leading-7 text-ivory-dim">
          افتح <b className="mono text-gold">msparty.app/tv</b> من متصفح التليفزيون، وهيظهرلك كود. اكتبه هنا مرة واحدة
          وخلاص.
        </p>
      </section>

      <Card className="mt-6 p-5">
        <form onSubmit={claim} className="space-y-4">
          <Field label="الكود اللي على الشاشة">
            <Input
              required
              dir="ltr"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={6}
              placeholder="ABC234"
              value={code}
              onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
              className="mono text-center text-2xl tracking-[.4em]"
            />
          </Field>
          <Field label="اسم للتليفزيون" hint="اختياري — عشان تعرفه لو عندك أكتر من واحد">
            <Input
              maxLength={40}
              placeholder="تليفزيون الصالة"
              value={label}
              onChange={event => setLabel(event.target.value)}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button size="lg" disabled={busy || code.length < 6} className="w-full">
            {busy ? "لحظة..." : "وصّل التليفزيون"}
          </Button>
        </form>
      </Card>

      <section className="mt-8">
        <h2 className="display text-lg text-ivory">تليفزيوناتك</h2>
        <div className="mt-3 space-y-2">
          {devices === null && <p className="text-sm text-ivory-dim">بنحمّل...</p>}

          {devices?.length === 0 && (
            <EmptyState icon="📺" title="مفيش تليفزيون موصّل">
              وصّل واحد من فوق، وبعدين تقدر تبعت أي سهرة عليه من غير ما تلمس الريموت.
            </EmptyState>
          )}

          {devices?.map(device => (
            <Card key={device.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="truncate font-bold text-ivory">{device.label || "تليفزيون"}</p>
                <p className="mt-0.5 truncate text-xs text-ivory-dim">
                  {device.party ? `بيشغّل: ${device.party.name}` : "مستني سهرة"}
                  {device.lastSeenAt && ` · آخر ظهور ${relative(device.lastSeenAt)}`}
                </p>
              </div>
              <Button variant="danger" size="sm" disabled={busy} onClick={() => unpair(device.id)}>
                افصله
              </Button>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}

function relative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 2) return "دلوقتي";
  if (minutes < 60) return `من ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `من ${hours} ساعة`;
  return `من ${Math.round(hours / 24)} يوم`;
}
