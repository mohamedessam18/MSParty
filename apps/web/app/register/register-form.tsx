"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { PasswordMeter } from "@/components/auth/password-meter";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";
import { UsernameField } from "@/components/username-field";
import { PASSWORD_MIN, checkPassword } from "@/lib/password";

export function RegisterForm({ googleEnabled }: { googleEnabled: boolean }) {
  return (
    <Suspense>
      <Register googleEnabled={googleEnabled} />
    </Suspense>
  );
}

function Register({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
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

    if (!cleanName || !cleanEmail) {
      setError("من فضلك ادخل اسمك وبريد صح.");
      setLoading(false);
      return;
    }
    if (!username) {
      setError("اختار اسم مستخدم — أصحابك هيلاقوك بيه.");
      setLoading(false);
      return;
    }
    // The same check the server runs, so a rejection that was going to happen
    // anyway happens here — before a round trip, and with the field still in
    // front of the person who has to change it.
    const strength = checkPassword(password, { email: cleanEmail, name: cleanName });
    if (!strength.ok) {
      setError(strength.message);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanName, email: cleanEmail, password, username })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مقدرناش نعمل الحساب.");

      const query = new URLSearchParams({ registered: "1" });
      if (data.verificationSent) query.set("verify", "sent");
      if (next?.startsWith("/") && !next.startsWith("//")) query.set("next", next);
      router.push(`/login?${query}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حدث خطأ أثناء إنشاء الحساب.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      kicker="حساب جديد"
      title="اعمل مكان للسهرة."
      lede="أربع خانات، وبعدها تبقى جاهز تدعو صحابك."
      footer={
        <>
          عندك حساب؟{" "}
          <Link className="text-gold hover:underline" href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}>
            ادخل من هنا
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        {googleEnabled && (
          <>
            <GoogleButton next={next} label="اعمل حساب بجوجل" />
            <AuthDivider />
          </>
        )}

        <form className="space-y-4" onSubmit={submit}>
          <Field label="الاسم">
            <Input required autoComplete="name" value={name} onChange={event => setName(event.target.value)} />
          </Field>
          <UsernameField value={username} onChange={setUsername} />
          <Field label="البريد الإلكتروني">
            <Input
              required
              type="email"
              dir="ltr"
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </Field>
          <Field label="كلمة المرور" hint={`${PASSWORD_MIN} أحرف على الأقل — الطول أهم من العلامات الغريبة`}>
            <Input
              required
              minLength={PASSWORD_MIN}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
            <PasswordMeter value={password} />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button size="lg" disabled={loading} className="w-full">
            {loading ? "جارٍ إنشاء الحساب..." : "اعمل حساب"}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
