"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const params = useSearchParams();
  // Set when a join link bounced the user here to switch accounts, so they land
  // back on the invite instead of the generic dashboard.
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setError("من فضلك ادخل البريد الإلكتروني وكلمة المرور.");
      setLoading(false);
      return;
    }
    try {
      const result = await signIn("credentials", { email: cleanEmail, password, redirect: false });
      if (result?.error) {
        setError("بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور.");
        setLoading(false);
      } else {
        // Only ever follow a same-origin path, so a crafted ?next= cannot
        // bounce someone off the site straight after they authenticate.
        window.location.href = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      }
    } catch {
      setError("تعذر تسجيل الدخول. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Wordmark className="mb-8 self-start" />
      <Card className="p-6 shadow-lift sm:p-8">
        <Kicker>عودة حميدة</Kicker>
        <h1 className="display mt-2 text-3xl text-ivory">جاهز تكمّل السهرة؟</h1>
        <Rule className="mt-4" />
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label="البريد الإلكتروني">
            <Input required type="email" dir="ltr" placeholder="example@domain.com" value={email} onChange={event => setEmail(event.target.value)} />
          </Field>
          <Field label="كلمة المرور">
            <Input required type="password" dir="ltr" placeholder="••••••••" value={password} onChange={event => setPassword(event.target.value)} />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button size="lg" disabled={loading} className="w-full">
            {loading ? "جارٍ تسجيل الدخول..." : "ادخل للبارتيهات"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-ivory-dim">
          لسه جديد؟{" "}
          <Link className="text-gold hover:underline" href="/register">
            اعمل حساب سريع
          </Link>
        </p>
      </Card>
    </main>
  );
}
