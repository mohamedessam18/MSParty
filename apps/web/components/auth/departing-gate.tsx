"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * Screens this never runs on: the ones an account on its way out is allowed to
 * see, plus the landing page — which is mostly read by people with no session
 * at all, and asking the server about a session that is not there on every one
 * of those visits buys nothing.
 */
const EXEMPT = ["/login", "/register", "/account/", "/privacy"];

type Pending = { daysLeft: number; erasesAt: string };

/**
 * The catch for a session that outlived its account.
 *
 * Sign-in refuses a departing account, but a session opened *before* the
 * deletion — a laptop left signed in while the phone pressed the button — is a
 * signed token this app cannot revoke. Every API route already refuses it, so
 * without something like this the app does not look deleted, it looks broken:
 * a dashboard that loads and then fails at everything.
 *
 * One request per page load, which is also the cheapest way to notice: the
 * endpoint is the same one the profile screen reads, and it answers 401 for
 * anyone who is not signed in at all.
 */
export function DepartingGate() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const path = window.location.pathname;
    if (path === "/" || EXEMPT.some(prefix => path.startsWith(prefix))) return;
    let active = true;

    fetch("/api/user/deletion")
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (active && data?.deletion) setPending(data.deletion);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  if (!pending) return null;

  async function restore() {
    setBusy(true);
    const response = await fetch("/api/user/deletion", { method: "DELETE" });
    if (!response.ok) return setBusy(false);
    // Reloaded rather than patched away: every panel behind this was rendered
    // against an account that could do nothing, and none of them refetch.
    window.location.reload();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-deep/95 p-5 backdrop-blur-sm">
      <div className="bevel w-full max-w-sm rounded-xl bg-velvet p-6 text-center">
        <span aria-hidden className="text-3xl">
          🕯️
        </span>
        <h2 className="display mt-3 text-2xl text-ivory">حسابك في طريقه للحذف</h2>
        <p className="mt-3 text-sm leading-7 text-ivory-dim">
          إنت مخفي عن الكل دلوقتي، وفاضل <b className="text-curtain">{pending.daysLeft} يوم</b> على الحذف النهائي.
          الجلسة دي مفتوحة من قبل الطلب، عشان كده مفيش حاجة هنا شغّالة.
        </p>
        <div className="mt-6 space-y-2">
          <Button size="lg" disabled={busy} onClick={restore} className="w-full">
            {busy ? "بنرجّعه..." : "رجّع حسابي"}
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full"
          >
            اخرج من الجلسة دي
          </Button>
        </div>
      </div>
    </div>
  );
}
