"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { Button } from "./ui/button";
import { FormError, Input } from "./ui/input";

/**
 * Lets someone with an invite link watch without inventing a password. The
 * account is real but has no email, so it cannot be signed into elsewhere —
 * the dashboard offers to claim it with an email later.
 *
 * `party` is the invite this guest is arriving on, as a code or a party id. It
 * is required: creating an account is the one thing an unauthenticated request
 * can do here, and tying it to a party that exists is what keeps that from
 * being a way to write rows into the users table at will.
 */
export function GuestJoin({ party, onDone }: { party: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return setError("اكتب اسمك عشان الشلة تعرفك.");
    setError("");
    setBusy(true);
    const result = await signIn("guest", { name: clean, party, redirect: false });
    if (result?.error) {
      setError(
        result.error.includes("RATE_LIMITED")
          ? "جرّبت كتير من نفس الجهاز. استنى شوية وجرّب تاني."
          : "تعذر الدخول كضيف. جرّب تاني."
      );
      setBusy(false);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-right">
      <p className="text-sm text-ivory-dim">ادخل كضيف — اسمك بس، من غير حساب.</p>
      <Input
        autoFocus
        maxLength={40}
        placeholder="اسمك"
        value={name}
        onChange={event => setName(event.target.value)}
        aria-label="اسمك"
      />
      {error && <FormError>{error}</FormError>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "جارٍ الدخول..." : "ادخل كضيف"}
      </Button>
      <p className="text-center text-xs text-ivory-dim/70">
        تقدر تحوّله لحساب دائم بعدين من غير ما تفقد سهراتك.
      </p>
    </form>
  );
}
