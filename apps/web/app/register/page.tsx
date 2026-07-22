"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
export default function Register() {
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
    <main className="mx-auto flex min-h-screen max-w-md items-center px-5">
      <section className="w-full rounded-[26px] border border-[#d4b7ff]/20 bg-[#131d35]/80 p-6 shadow-2xl shadow-black/20 sm:p-9">
        <Link className="display text-xl font-bold" href="/">MS<span className="text-[#90e4ff]">Party</span></Link>
        <h1 className="display mt-8 text-3xl font-semibold">اعمل مكان للسهرة.</h1>
        <p className="mt-2 text-sm text-[#aab9d7]">ثلاث خانات، وبعدها تبقى جاهز تدعو صحابك.</p>
        <form className="mt-7 space-y-4" onSubmit={submit}>
          <label className="block text-sm text-[#cbd8f1]">
            الاسم
            <input required className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-white focus:border-[#d4b7ff] focus:outline-none" value={name} onChange={event => setName(event.target.value)} />
          </label>
          <label className="block text-sm text-[#cbd8f1]">
            البريد الإلكتروني
            <input required className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-white focus:border-[#d4b7ff] focus:outline-none" type="email" value={email} onChange={event => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm text-[#cbd8f1]">
            كلمة المرور (8 أحرف على الأقل)
            <input required minLength={8} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0d1629] px-4 py-3 text-white focus:border-[#d4b7ff] focus:outline-none" type="password" value={password} onChange={event => setPassword(event.target.value)} />
          </label>
          {error && <p className="rounded-xl bg-[#ff7b8d]/15 px-3 py-2 text-sm text-[#ffd6dd]">{error}</p>}
          <button disabled={loading} className="w-full rounded-xl bg-[#d4b7ff] px-4 py-3 font-bold text-[#10172b] hover:bg-[#e5d4ff] disabled:opacity-60 transition">
            {loading ? "جارٍ إنشاء الحساب..." : "اعمل حساب"}
          </button>
        </form>
        <Link className="mt-5 block text-sm text-[#90e4ff] hover:underline" href="/login">عندك حساب؟ ادخل من هنا</Link>
      </section>
    </main>
  );
}
