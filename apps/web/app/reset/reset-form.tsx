"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { PasswordMeter } from "@/components/auth/password-meter";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";
import { PASSWORD_MIN, checkPassword } from "@/lib/password";

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell kicker="الرابط ناقص" title="الرابط ده مش كامل" lede="افتح الرابط من رسالة البريد زي ما هو.">
        <Link href="/forgot" className="block">
          <Button size="lg" className="w-full">
            اطلب رابط جديد
          </Button>
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        kicker="تمام"
        title="كلمة المرور اتغيّرت"
        lede="وسجّلنا خروج أي جهاز كان داخل بحسابك، فمحدش فاضل جوّاه غيرك."
      >
        <Link href="/login" className="block">
          <Button size="lg" className="w-full">
            ادخل بكلمة المرور الجديدة
          </Button>
        </Link>
      </AuthShell>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password !== again) return setError("الكلمتين مش زي بعض.");
    // The same rules the server enforces, so a refusal that was coming anyway
    // happens with the field still in front of the person.
    const strength = checkPassword(password);
    if (!strength.ok) return setError(strength.message);

    setBusy(true);
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مقدرناش نغيّرها.");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="استرجاع"
      title="اختار كلمة مرور جديدة"
      lede="لما تحطها، أي جهاز داخل بحسابك دلوقتي هيتسجّل خروجه."
      footer={
        <Link className="text-gold hover:underline" href="/forgot">
          الرابط وقف؟ اطلب واحد جديد
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="كلمة المرور الجديدة" hint={`${PASSWORD_MIN} أحرف على الأقل`}>
          <Input
            required
            autoFocus
            minLength={PASSWORD_MIN}
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={password}
            onChange={event => setPassword(event.target.value)}
          />
          <PasswordMeter value={password} />
        </Field>
        <Field label="اكتبها تاني">
          <Input
            required
            type="password"
            dir="ltr"
            autoComplete="new-password"
            value={again}
            onChange={event => setAgain(event.target.value)}
          />
        </Field>
        {error && <FormError>{error}</FormError>}
        <Button size="lg" disabled={busy} className="w-full">
          {busy ? "بنغيّرها..." : "غيّر كلمة المرور"}
        </Button>
      </form>
    </AuthShell>
  );
}
