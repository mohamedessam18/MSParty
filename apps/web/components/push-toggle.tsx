"use client";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";

/** Push keys arrive base64url-encoded; the API wants raw bytes. */
function decodeKey(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
}

type State = "unsupported" | "off" | "on" | "denied";

/**
 * Device notifications are opt-in behind a deliberate press. Asking on page load
 * is how a permission prompt gets dismissed forever — and a denied prompt cannot
 * be shown again by the site, so the first ask has to be one the person meant.
 */
export function PushToggle() {
  const [state, setState] = useState<State>("off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (typeof window === "undefined") return;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState("unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const registration = await navigator.serviceWorker.getRegistration();
      const existing = await registration?.pushManager.getSubscription();
      setState(existing ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setError("");
    setBusy(true);
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("الإشعارات مش متظبطة على السيرفر.");

      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setState("denied");
        return;
      }
      if (permission !== "granted") return;

      const registration = await navigator.serviceWorker.register("/sw.js");
      // Registration resolves before the worker is usable; this waits for it.
      await navigator.serviceWorker.ready;

      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          // Chrome refuses a subscription that could deliver silently.
          userVisibleOnly: true,
          applicationServerKey: decodeKey(key)
        }));

      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON())
      });
      if (!response.ok) throw new Error("تعذر تسجيل الجهاز.");
      setState("on");
    } catch (err: any) {
      setError(err?.message || "تعذر تفعيل الإشعارات.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        await subscription.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  if (state === "unsupported") {
    return <p className="text-xs text-ivory-dim">المتصفح ده مابيدعمش إشعارات الجهاز.</p>;
  }

  if (state === "denied") {
    return (
      <p className="text-xs leading-6 text-ivory-dim">
        الإشعارات مرفوضة من إعدادات المتصفح. لازم تسمح بيها من إعدادات الموقع في متصفحك — مش من هنا.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant={state === "on" ? "danger" : "primary"} disabled={busy} onClick={state === "on" ? disable : enable}>
          {busy ? "..." : state === "on" ? "اقفل إشعارات الجهاز" : "🔔 فعّل إشعارات الجهاز"}
        </Button>
        <span className="text-xs text-ivory-dim">
          {state === "on" ? "الجهاز ده هيوصله الدعوات وطلبات الصداقة." : "توصلك الدعوات حتى لو الموقع مقفول."}
        </span>
      </div>
      {error && <p className="text-xs text-curtain">{error}</p>}
    </div>
  );
}
