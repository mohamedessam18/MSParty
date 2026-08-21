"use client";
import { useState } from "react";
import { AuthShell } from "@/components/auth/auth-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/input";

/**
 * The offer, and the one button that takes it.
 *
 * Deliberately not automatic. Signing in used to cancel the deletion silently,
 * which meant the only way to check whether an account was really going was to
 * accidentally keep it. Coming back should be something a person does on
 * purpose, so it is a decision with a name on it, a date, and a way to walk
 * away without touching anything.
 */
export function RestoreClient({
  ticket,
  name,
  avatarUrl,
  emailHint,
  daysLeft,
  erasesAt
}: {
  ticket: string;
  name: string;
  avatarUrl: string | null;
  emailHint: string | null;
  daysLeft: number;
  erasesAt: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function restore() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مقدرناش نرجّع الحساب دلوقتي.");
      // Back to sign-in rather than straight in: the refused attempt opened no
      // session, and asking for the password once more is a second's work
      // against silently signing in a browser that was told it could not.
      window.location.href = "/login?restored=1";
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة.");
      setBusy(false);
    }
  }

  return (
    <AuthShell
      kicker="الحساب ده في طريقه للحذف"
      title="تحب نرجّعه؟"
      lede={
        <>
          كلمة السر مظبوطة — بس الحساب ده إنت طلبت حذفه، وهو دلوقتي مخفي عن الكل ومش شغّال.
          هيتمسح نهائيًا يوم <b className="text-ivory">{erasesAt}</b>.
        </>
      }
    >
      <div className="rounded-lg border border-velvet-hi bg-ink-deep/60 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={name} src={avatarUrl} size="lg" ring />
          <div className="min-w-0">
            <p className="truncate font-bold text-ivory">{name}</p>
            {emailHint && <p dir="ltr" className="mono truncate text-xs text-ivory-dim">{emailHint}</p>}
          </div>
        </div>

        <p className="mono mt-4 border-t border-velvet-hi pt-3 text-center text-sm text-curtain">
          فاضل {daysLeft} يوم
        </p>
      </div>

      <ul className="mt-5 space-y-1.5 text-sm leading-7 text-ivory-dim">
        <li>لو رجّعته: كل حاجة بترجع زي ما هي — سهراتك، فيديوهاتك، أصحابك.</li>
        <li>لو سيبته: بعد الميعاد ده مفيش رجوع، والاسم بيتحرر لغيرك.</li>
      </ul>

      {error && <div className="mt-4"><FormError>{error}</FormError></div>}

      <div className="mt-6 space-y-2">
        <Button size="lg" disabled={busy} onClick={restore} className="w-full">
          {busy ? "بنرجّعه..." : "أيوه، رجّع حسابي"}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => (window.location.href = "/")}
          className="w-full"
        >
          لأ، سيبه يتمسح
        </Button>
      </div>
    </AuthShell>
  );
}
