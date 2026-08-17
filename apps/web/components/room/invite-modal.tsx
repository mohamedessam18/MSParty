"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

export function InviteModal({
  open,
  onClose,
  code,
  partyId
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  partyId: string;
}) {
  const [link, setLink] = useState("");
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    if (!open) return;
    const url = `${window.location.origin}/party/${partyId}/join`;
    setLink(url);
    QRCode.toDataURL(url, {
      width: 320,
      margin: 1,
      color: { dark: "#140a0d", light: "#f2e8d5" }
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, [open, partyId]);

  async function copy(value: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  async function share() {
    if (!navigator.share) return copy(link, "link");
    try {
      await navigator.share({ title: "MSParty", text: `ادخل السهرة بالكود ${code}`, url: link });
    } catch {
      // The user dismissed the share sheet; nothing to report.
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="ادعُ صحابك">
      <div className="mt-5 space-y-5 text-center">
        <div>
          <p className="text-xs text-ivory-dim">كود البارتي</p>
          <button
            onClick={() => copy(code, "code")}
            className="mono mt-2 w-full rounded border border-gold/40 bg-ink-deep py-4 text-3xl tracking-[.4em] text-gold transition hover:bg-gold/10"
            aria-label={`انسخ الكود ${code}`}
          >
            {code}
          </button>
          <p className="mt-1 h-4 text-xs text-gold">{copied === "code" && "تم نسخ الكود"}</p>
        </div>

        {qr && (
          <div>
            <img src={qr} alt={`كود QR للانضمام بالكود ${code}`} className="mx-auto h-40 w-40 rounded" />
            <p className="mt-2 text-xs text-ivory-dim">صوّر الكود ده بالكاميرا للدخول على طول</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button className="flex-1" onClick={share}>
            شارك الرابط
          </Button>
          <Button variant="ghost" onClick={() => copy(link, "link")}>
            {copied === "link" ? "تم النسخ" : "انسخ"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
