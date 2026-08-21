"use client";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Field, FormError, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

type State = {
  graceDays: number;
  confirmWith: "password" | "name";
  name: string;
  deletion: { erasesAt: string; daysLeft: number } | null;
};

/**
 * Leaving, and being able to change your mind about it.
 *
 * The wait is not a dark pattern in the other direction either: nothing is
 * hidden behind it. The account goes dark the moment the button is pressed, so
 * someone leaving to get away from a person gets that immediately; the thirty
 * days only protect against the press itself being a mistake.
 */
export function DeleteAccount() {
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/user/deletion")
      .then(response => (response.ok ? response.json() : null))
      .then(data => data && setState(data));
  }, []);

  if (!state) return null;

  async function schedule(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/user/deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مش قادرين نعمل ده دلوقتي.");
      // Signed out on the way out: the account is hidden from this moment, and
      // leaving the tab looking signed in would say otherwise. The screen it
      // lands on is the only place the grace period gets explained to someone
      // who is actually in it.
      await signOut({ callbackUrl: "/account/deleted" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة.");
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    await fetch("/api/user/deletion", { method: "DELETE" });
    setState(current => (current ? { ...current, deletion: null } : current));
    setBusy(false);
  }

  if (state.deletion) {
    return (
      <section className="mt-10 rounded-lg border border-curtain/40 bg-curtain/[.07] p-5">
        <h2 className="display text-lg text-curtain">حسابك متجدول للحذف</h2>
        <p className="mt-2 text-sm leading-7 text-ivory">
          هيتمسح نهائيًا بعد <b>{state.deletion.daysLeft} يوم</b>. لحد ساعتها إنت مخفي عن الكل، وتقدر تلغي في أي وقت.
        </p>
        <Button className="mt-4" disabled={busy} onClick={cancel}>
          {busy ? "لحظة..." : "الغِ الحذف ورجّع حسابي"}
        </Button>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-lg border border-velvet-hi p-5">
      <h2 className="display text-lg text-ivory">حذف الحساب</h2>
      <p className="mt-2 text-sm leading-7 text-ivory-dim">
        هتختفي فورًا، وبعد {state.graceDays} يوم يتمسح كل حاجة نهائيًا: سهراتك، فيديوهاتك المرفوعة، صورتك، وأصدقاؤك.
        لو سجّلت الدخول تاني خلال المدة دي، هنسألك لو عايز ترجّع الحساب.
      </p>
      <Button variant="danger" className="mt-4" onClick={() => setOpen(true)}>
        احذف حسابي
      </Button>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="متأكد؟">
        <form onSubmit={schedule} className="mt-5 space-y-4">
          <div className="rounded-lg border border-curtain/30 bg-curtain/[.06] p-3 text-sm leading-7 text-ivory">
            اللي هيتمسح نهائيًا بعد {state.graceDays} يوم:
            <ul className="mt-2 list-inside list-disc text-ivory-dim">
              <li>السهرات اللي إنت مستضيفها — ومعاها الشات بتاعها</li>
              <li>كل الفيديوهات اللي رفعتها</li>
              <li>صورتك واسم المستخدم وقائمة أصدقائك</li>
              <li>رسايلك في سهرات غيرك — نصها بيتشال ومكانه يبقى «مستخدم محذوف»</li>
            </ul>
          </div>

          <Field
            label={state.confirmWith === "password" ? "كلمة المرور" : `اكتب اسمك للتأكيد: ${state.name}`}
            hint={state.confirmWith === "password" ? undefined : "عشان نتأكد إن مش حد ماسك جهازك"}
          >
            <Input
              required
              autoComplete={state.confirmWith === "password" ? "current-password" : "off"}
              type={state.confirmWith === "password" ? "password" : "text"}
              dir={state.confirmWith === "password" ? "ltr" : "auto"}
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
            />
          </Field>

          {error && <FormError>{error}</FormError>}

          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={busy} className="flex-1">
              {busy ? "لحظة..." : "احذف حسابي"}
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              رجوع
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
