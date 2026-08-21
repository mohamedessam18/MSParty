"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthDivider, GoogleButton } from "@/components/auth/google-button";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";

/**
 * Everything that can put a message at the top of this screen, in one place.
 *
 * These arrive as query parameters from four different directions — a finished
 * registration, a confirmation link, a restored account, a refusal from the
 * Google callback — and the alternative to naming them here is four components
 * that each know a little about the sign-in screen.
 */
const NOTICES: Record<string, { tone: "good" | "bad"; text: string }> = {
  registered: { tone: "good", text: "تمام، حسابك اتعمل. ادخل بيه دلوقتي." },
  restored: { tone: "good", text: "رجّعنا حسابك 🎉 ادخل عادي، كل حاجة زي ما سيبتها." },
  "verify=sent": { tone: "good", text: "تمام، حسابك اتعمل وبعتنالك إيميل تأكيد. ادخل عادي، والتأكيد يستنى." },
  "verify=done": { tone: "good", text: "بريدك اتأكد. تمام." },
  "verify=already": { tone: "good", text: "البريد ده متأكد بالفعل." },
  "verify=expired": { tone: "bad", text: "رابط التأكيد انتهت مدته. هنبعتلك واحد جديد من الإعدادات." },
  "verify=invalid": { tone: "bad", text: "رابط التأكيد مش مظبوط أو اتستخدم قبل كده." },
  "verify=throttled": { tone: "bad", text: "محاولات كتير. استنى شوية وجرّب تاني." },
  revoked: { tone: "good", text: "قفلنا كل الجلسات. ادخل تاني من الجهاز ده." },
  "email=changed": { tone: "good", text: "بريد حسابك اتغيّر. ادخل بالبريد الجديد." },
  restore_expired: { tone: "bad", text: "الرابط ده انتهت مدته. سجّل الدخول تاني وهنسألك من الأول." },
  restore_erased: { tone: "bad", text: "الحساب ده اتمسح خلاص، ومش هينفع يرجع. تقدر تعمل حساب جديد." },
  google_unverified: { tone: "bad", text: "جوجل مأكدتش البريد ده، فمش هنقدر نربطه بحساب هنا." },
  google_no_email: { tone: "bad", text: "حساب جوجل ده مش مديّنا بريد. جرّب تدخل بالبريد وكلمة المرور." },
  google_conflict: { tone: "bad", text: "البريد ده مربوط بحساب ضيف. ادخل بيه الأول وحوّله لحساب دائم." },
  Callback: { tone: "bad", text: "حصلت مشكلة في الدخول بجوجل. جرّب تاني." },
  OAuthAccountNotLinked: { tone: "bad", text: "البريد ده متسجّل بطريقة تانية. ادخل بكلمة المرور." }
};

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  // useSearchParams needs a Suspense boundary during prerendering.
  return (
    <Suspense>
      <Login googleEnabled={googleEnabled} />
    </Suspense>
  );
}

function Login({ googleEnabled }: { googleEnabled: boolean }) {
  const params = useSearchParams();
  // Set when a join link bounced the user here to switch accounts, so they land
  // back on the invite instead of the generic dashboard.
  const next = params.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const verify = params.get("verify");
  const notice =
    NOTICES[params.get("error") || ""] ||
    (verify ? NOTICES[`verify=${verify}`] : undefined) ||
    (params.get("registered") ? NOTICES.registered : undefined) ||
    (params.get("restored") ? NOTICES.restored : undefined) ||
    (params.get("revoked") ? NOTICES.revoked : undefined) ||
    (params.get("email") ? NOTICES[`email=${params.get("email")}`] : undefined);

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

      // A refused sign-in for an account on its way out is not an error: the
      // signIn callback answers with the address of the one screen that account
      // may still reach, and following it is the whole point.
      if (result?.url && new URL(result.url, window.location.origin).pathname === "/account/restore") {
        window.location.href = result.url;
        return;
      }

      if (result?.error) {
        setError(
          result.error.includes("RATE_LIMITED")
            ? "محاولات كتير أوي. استنى ربع ساعة وجرّب تاني."
            : "بيانات الدخول غير صحيحة. تحقق من البريد وكلمة المرور."
        );
        setLoading(false);
        return;
      }

      // Only ever follow a same-origin path, so a crafted ?next= cannot
      // bounce someone off the site straight after they authenticate.
      window.location.href = next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    } catch {
      setError("تعذر تسجيل الدخول. حاول مرة أخرى.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      kicker="عودة حميدة"
      title="جاهز تكمّل السهرة؟"
      footer={
        <>
          لسه جديد؟{" "}
          <Link className="text-gold hover:underline" href={next ? `/register?next=${encodeURIComponent(next)}` : "/register"}>
            اعمل حساب سريع
          </Link>
        </>
      }
    >
      {notice && (
        <p
          role="status"
          className={`mb-5 rounded border px-3 py-2 text-sm leading-6 ${
            notice.tone === "good"
              ? "border-gold/30 bg-gold/10 text-ivory"
              : "border-curtain/30 bg-curtain/10 text-curtain"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="space-y-5">
        {/* Only when it is configured — a button that leads to Google's own
            error page is worse than no button. See googleEnabled in lib/auth. */}
        {googleEnabled && (
          <>
            <GoogleButton next={next} label="ادخل بحساب جوجل" />
            <AuthDivider />
          </>
        )}

        <form className="space-y-4" onSubmit={submit}>
          <Field label="البريد الإلكتروني">
            <Input
              required
              type="email"
              dir="ltr"
              autoComplete="email"
              placeholder="example@domain.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </Field>
          <Field label="كلمة المرور">
            <Input
              required
              type="password"
              dir="ltr"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <Button size="lg" disabled={loading} className="w-full">
            {loading ? "جارٍ تسجيل الدخول..." : "ادخل للبارتيهات"}
          </Button>
          <p className="text-center">
            <Link className="text-sm text-ivory-dim hover:text-gold hover:underline" href="/forgot">
              نسيت كلمة المرور؟
            </Link>
          </p>
        </form>
      </div>
    </AuthShell>
  );
}
