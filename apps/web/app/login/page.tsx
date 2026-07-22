"use client";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
export default function Login() {
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
      } else if (result?.ok || !result?.error) {
        window.location.href = "/dashboard";
      } else {
        setError("تعذر تسجيل الدخول. حاول مرة أخرى.");
        setLoading(false);
      }
    } catch (err: any) {
      console.error("Login Exception:", err);
      setError("بيانات الدخول غير صحيحة أو السيرفر مشغول. تحقق من بياناتك وحاول ثانية.");
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-5">
      <section className="w-full rounded-[26px] border border-[#90e4ff]/20 bg-[#131d35]/80 p-6 shadow-2xl shadow-black/20 sm:p-9">
        <Link className="display text-xl font-bold" href="/">MS<span className="text-[#90e4ff]">Party</span></Link>
        <p className="mono mt-8 text-xs text-[#90e4ff]">WELCOME BACK</p>
        <h1 className="display mt-2 text-3xl font-semibold">جاهز تكمل السهرة؟</h1>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm text-[#cbd8f1]">
            البريد الإلكتروني
            <input
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-white focus:border-[#90e4ff] focus:outline-none"
              type="email"
              placeholder="example@domain.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </label>
          <label className="block text-sm text-[#cbd8f1]">
            كلمة المرور
            <input
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-white focus:border-[#90e4ff] focus:outline-none"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="rounded-xl bg-[#ff7b8d]/15 px-3 py-2 text-sm text-[#ffd6dd]">{error}</p>}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-[#90e4ff] px-4 py-3 font-bold text-[#10172b] hover:bg-[#cff4ff] disabled:opacity-60 transition"
          >
            {loading ? "جارٍ تسجيل الدخول..." : "ادخل للبارتيهات"}
          </button>
        </form>
        <p className="mt-5 text-sm text-[#aab9d7]">
          لسه جديد؟ <Link className="text-[#d4b7ff] hover:underline" href="/register">اعمل حساب سريع</Link>
        </p>
      </section>
    </main>
  );
}
