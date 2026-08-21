"use client";
import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/**
 * Asking for a way back in.
 *
 * The confirmation is deliberately the same whether or not the address has an
 * account: the server will not say, so neither will this. Telling someone
 * "no account with that address" here is a lookup service for anyone curious
 * whether a particular person is on this app.
 */
export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    await fetch("/api/auth/password-reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() })
    }).catch(() => undefined);
    setBusy(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        kicker="بعتنا"
        title="بُص في بريدك"
        lede={
          <>
            لو في حساب على <b className="text-ivory" dir="ltr">{email.trim()}</b>، هيوصله رابط لتغيير كلمة المرور.
            الرابط بيقف بعد ساعة.
          </>
        }
        footer={
          <Link className="text-gold hover:underline" href="/login">
            ← رجوع لتسجيل الدخول
          </Link>
        }
      >
        <div className="rounded-lg border border-velvet-hi bg-ink-deep/60 p-4 text-sm leading-7 text-ivory-dim">
          مالقتش الرسالة؟ شوف في الـSpam. ولو الحساب داخل بجوجل، مفيش كلمة مرور أصلاً — ادخل بزرار جوجل.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      kicker="استرجاع"
      title="نسيت كلمة المرور؟"
      lede="اكتب بريدك وهنبعتلك رابط تحط بيه واحدة جديدة."
      footer={
        <Link className="text-gold hover:underline" href="/login">
          ← رجوع لتسجيل الدخول
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <Field label="البريد الإلكتروني">
          <Input
            required
            autoFocus
            type="email"
            dir="ltr"
            autoComplete="email"
            placeholder="example@domain.com"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </Field>
        <Button size="lg" disabled={busy} className="w-full">
          {busy ? "بنبعت..." : "ابعتلي الرابط"}
        </Button>
      </form>
    </AuthShell>
  );
}
