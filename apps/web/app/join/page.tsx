"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { GuestJoin } from "@/components/guest-join";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { FormError } from "@/components/ui/input";
import { Rule, Wordmark } from "@/components/ui/wordmark";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsIdentity, setNeedsIdentity] = useState(false);

  async function attempt() {
    const response = await fetch("/api/parties/join-by-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    const data = await response.json().catch(() => ({}));
    // 401 means "we don't know who you are yet", not "bad code" — offer the
    // guest path instead of sending someone away to build an account.
    if (response.status === 401) {
      setNeedsIdentity(true);
      setLoading(false);
      return;
    }
    if (!response.ok) throw new Error(data.message || "تعذر الدخول بالكود ده.");
    router.replace(`/party/${data.id}`);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (code.length < 6) return setError("الكود ٦ حروف. راجع اللي بعتهولك الهوست.");
    setLoading(true);
    try {
      await attempt();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Wordmark />
        <Link className="text-xs text-ivory-dim hover:text-ivory" href="/dashboard">
          ← بارتياتي
        </Link>
      </div>
      <Card className="p-6 shadow-lift sm:p-8">
        <Kicker>الدخول للصالة</Kicker>
        <h1 className="display mt-2 text-3xl text-ivory">مكانك محفوظ.</h1>
        <Rule className="mt-4" />
        <p className="mt-4 text-sm leading-7 text-ivory-dim">
          اكتب الكود اللي بعته الهوست. لو معاك رابط، افتحه وهتدخل على طول.
        </p>
        <form className="mt-6" onSubmit={submit}>
          <label className="block text-sm text-ivory-dim" htmlFor="party-code">
            كود البارتي
          </label>
          <input
            id="party-code"
            autoFocus
            dir="ltr"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={6}
            placeholder="ABC234"
            value={code}
            // The stored codes exclude I/O/0/1, so anything else is a typo we
            // simply drop as the user types rather than rejecting on submit.
            onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            className="mono mt-2 w-full rounded border border-velvet-hi bg-ink-deep px-4 py-4 text-center text-2xl tracking-[.4em] text-ivory placeholder:text-ivory-dim/40 focus:border-gold focus:outline-none"
          />
          {error && <div className="mt-3">
            <FormError>{error}</FormError>
          </div>}
          <Button size="lg" disabled={loading} className="mt-4 w-full">
            {loading ? "جارٍ الدخول..." : "ادخل البارتي"}
          </Button>
        </form>

        {needsIdentity && (
          <div className="mt-6 border-t border-velvet-hi pt-5">
            <GuestJoin
              party={code}
              onDone={() => {
                setNeedsIdentity(false);
                setLoading(true);
                attempt().catch(err => {
                  setError(err.message);
                  setLoading(false);
                });
              }}
            />
          </div>
        )}

        <div className="mt-6 flex justify-between border-t border-velvet-hi pt-4 text-xs">
          <Link className="text-gold hover:underline" href="/party/create">
            عايز تستضيف؟ أنشئ بارتي
          </Link>
          <Link className="text-ivory-dim hover:text-ivory" href="/login">
            عندي حساب
          </Link>
        </div>
      </Card>
    </main>
  );
}
