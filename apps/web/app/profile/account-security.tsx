"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, Kicker } from "@/components/ui/card";
import { Field, FormError, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

/** What the confirmation link's redirect can say when it lands back here. */
const EMAIL_NOTICES: Record<string, string> = {
  changed: "تمام، بريد حسابك اتغيّر.",
  expired: "رابط التأكيد وقف. اطلب واحد جديد.",
  invalid: "الرابط ده مش صالح أو اتستخدم قبل كده.",
  taken: "حد تاني أخد البريد ده قبل ما تأكّد.",
  throttled: "محاولات كتير. استنى شوية."
};

/**
 * The two things an account needs and had neither of: a way to move it to
 * another address, and a way to end sessions it cannot see.
 */
export function AccountSecurity({ email, isGuest }: { email: string | null; isGuest: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("email");
    if (!status) return;
    setNotice(EMAIL_NOTICES[status] ?? null);
    // Clears the parameter so a refresh does not replay the message.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  if (isGuest) return null;

  async function requestChange(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/user/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: next.trim() })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مقدرناش نبعت التأكيد.");
      setSentTo(data.to);
      setOpen(false);
      setNext("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    await fetch("/api/user/sessions", { method: "DELETE" }).catch(() => undefined);
    // Including this one — that is what "everywhere" means, and leaving the
    // tab looking signed in would be a lie about what just happened.
    await signOut({ callbackUrl: "/login?revoked=1" });
  }

  return (
    <Card className="mt-6 p-5">
      <Kicker>أمان الحساب</Kicker>

      {notice && (
        <p role="status" className="mt-3 rounded border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
          {notice}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-velvet-hi pb-4">
        <div className="min-w-0">
          <p className="text-sm text-ivory-dim">بريد الحساب</p>
          <p dir="ltr" className="mono mt-1 truncate text-ivory">{email || "—"}</p>
          {sentTo && (
            <p className="mt-2 text-xs leading-6 text-gold">
              بعتنا تأكيد لـ <span dir="ltr">{sentTo}</span>. البريد مايتغيّرش غير لما تضغط الرابط.
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          غيّره
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-ivory-dim">الأجهزة</p>
          <p className="mt-1 text-sm leading-6 text-ivory">
            سايب حسابك مفتوح على جهاز مش معاك؟ اقفل كل الجلسات.
          </p>
        </div>
        <Button variant="danger" size="sm" disabled={busy} onClick={revoke}>
          {busy ? "لحظة..." : "اخرج من كل الأجهزة"}
        </Button>
      </div>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="بريد جديد">
        <form onSubmit={requestChange} className="mt-5 space-y-4">
          <div className="rounded-lg border border-velvet-hi bg-ink-deep/60 p-3 text-sm leading-7 text-ivory-dim">
            هنبعت رابط تأكيد للبريد الجديد. حسابك هيفضل على بريده الحالي لحد ما تضغط الرابط.
          </div>
          <Field label="البريد الجديد">
            <Input
              required
              autoFocus
              type="email"
              dir="ltr"
              autoComplete="email"
              value={next}
              onChange={event => setNext(event.target.value)}
            />
          </Field>
          {error && <FormError>{error}</FormError>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy} className="flex-1">
              {busy ? "بنبعت..." : "ابعت التأكيد"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              رجوع
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
