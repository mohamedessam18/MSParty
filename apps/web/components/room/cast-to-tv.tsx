"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { FormError } from "@/components/ui/input";

type Device = {
  id: string;
  /** How the set is addressed — see /api/tv/devices. */
  code: string;
  label: string | null;
  party: { id: string; name: string } | null;
};

/**
 * "Play this on the television."
 *
 * There is no casting protocol here and none is needed: the set is already a
 * member of the party, polling for what it should be showing. Sending a party
 * to it is one write to its row — the television notices within a few seconds
 * and switches by itself.
 *
 * Hidden entirely when the account has no televisions paired, rather than
 * offered and then explained. The place to pair one is the profile screen, and
 * a button that only ever opens an advert for another screen is noise in a room
 * someone is trying to watch a film in.
 */
export function CastToTv({ partyId, platform }: { partyId: string; platform: boolean }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/tv/devices")
      .then(response => (response.ok ? response.json() : { devices: [] }))
      .then(data => setDevices(data.devices))
      .catch(() => setDevices([]));
  }, []);

  if (!devices?.length) return null;

  async function cast(device: Device) {
    setBusy(device.id);
    setError("");
    try {
      // The code is the address of the set; the phone already knows it is
      // theirs, because the list it came from is scoped to this account.
      const response = await fetch("/api/tv/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: device.code, partyId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "مقدرناش نبعتها للتليفزيون.");
      setSent(device.label || "التليفزيون");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "حصلت مشكلة.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        📺 على التليفزيون
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="شغّلها على التليفزيون">
        {platform ? (
          <p className="mt-5 rounded-lg border border-curtain/30 bg-curtain/10 p-4 text-sm leading-7 text-curtain">
            السهرة دي على منصة (نتفليكس، شاهد، ديزني+) وبتشتغل بإضافة المتصفح — والتليفزيون مابيشغّلش إضافات.
            سهرات اليوتيوب والفيديوهات المرفوعة بس هي اللي تنفع على الشاشة الكبيرة.
          </p>
        ) : (
          <div className="mt-5 space-y-2">
            {devices.map(device => (
              <button
                key={device.id}
                disabled={!!busy}
                onClick={() => cast(device)}
                className="flex w-full items-center justify-between rounded-lg border border-velvet-hi bg-ink-deep/60 p-4 text-right transition hover:border-gold/50 disabled:opacity-50"
              >
                <span>
                  <span className="block font-bold text-ivory">{device.label || "تليفزيون"}</span>
                  <span className="mt-0.5 block text-xs text-ivory-dim">
                    {device.party?.id === partyId ? "بيشغّل السهرة دي" : device.party ? `بيشغّل: ${device.party.name}` : "فاضي"}
                  </span>
                </span>
                <span className="text-sm text-gold">{busy === device.id ? "..." : "شغّل"}</span>
              </button>
            ))}

            {sent && (
              <p role="status" className="rounded border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-gold">
                اتبعتت لـ{sent}. هتظهر على الشاشة خلال ثواني.
              </p>
            )}
            {error && <FormError>{error}</FormError>}
          </div>
        )}
      </Modal>
    </>
  );
}
