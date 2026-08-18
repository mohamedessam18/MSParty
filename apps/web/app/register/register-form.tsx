"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    if (!cleanName || !cleanEmail || password.length < 8) {
      setError("من فضلك ادخل اسمك، بريد صح، وكلمة مرور من 8 أحرف على الأقل.");
      setLoading(false);
      return;
    }
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, email: cleanEmail, password })
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "البريد مستخدم بالفعل أو كلمة المرور غير كافية.");
      }
      router.push("/login?registered=1");
    } catch (err: any) {
      setError(err.message || "حدث خطأ أثناء إنشاء الحساب.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <Wordmark className="mb-8 self-start" />
      <Card className="p-6 shadow-lift sm:p-8">
        <Kicker>حساب جديد</Kicker>
        <h1 className="display mt-2 text-3xl text-ivory">اعمل مكان للسهرة.</h1>
        <Rule className="mt-4" />
        <p className="mt-4 text-sm text-ivory-dim">ثلاث خانات، وبعدها تبقى جاهز تدعو صحابك.</p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label="الاسم">
            <Input required value={name} onChange={event => setName(event.target.value)} />
          </Field>
          <Field label="البريد الإلكتروني">
            <Input required type="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} />
          </Field>
          <Field label="كلمة المرور" hint="8 أحرف على الأقل">
            <Input required minLength={8} type="password" dir="ltr" value={password} onChange={event => setPassword(event.target.value)} />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button size="lg" disabled={loading} className="w-full">
            {loading ? "جارٍ إنشاء الحساب..." : "اعمل حساب"}
          </Button>
        </form>
        <p className="mt-6 text-sm text-ivory-dim">
          عندك حساب؟{" "}
          <Link className="text-gold hover:underline" href="/login">
            ادخل من هنا
          </Link>
        </p>
      </Card>
    </main>
  );
}
