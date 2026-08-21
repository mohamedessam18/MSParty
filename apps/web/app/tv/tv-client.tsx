"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { TvNotice, TvPlayer, type TvParty } from "@/components/tv/tv-player";
import { Mark } from "@/components/ui/logo";

/** Where the set keeps the credential it was handed. */
const STORAGE_KEY = "msparty.tv.secret";
/** How often the set asks whether anything has changed. */
const POLL_MS = 3000;

type Status =
  | { kind: "starting" }
  | { kind: "waiting"; code: string }
  | { kind: "idle"; code: string; owner: string }
  | { kind: "ready"; token: string; party: TvParty }
  | { kind: "error"; message: string };

export function TvClient() {
  const [status, setStatus] = useState<Status>({ kind: "starting" });
  const secret = useRef<string | null>(null);

  /** Asks for a fresh code, discarding whatever the set was holding. */
  const pair = useCallback(async () => {
    const response = await fetch("/api/tv/pair", { method: "POST" });
    if (!response.ok) throw new Error("pair failed");
    const data = await response.json();
    secret.current = data.secret;
    try {
      window.localStorage.setItem(STORAGE_KEY, data.secret);
    } catch {
      // Private browsing, or a set with storage disabled. The pairing still
      // works for as long as this page stays open, which is the whole evening —
      // it just has to be redone tomorrow.
    }
    setStatus({ kind: "waiting", code: data.code });
  }, []);

  useEffect(() => {
    let active = true;
    let timer: number;

    async function tick() {
      if (!active) return;

      try {
        if (!secret.current) {
          try {
            secret.current = window.localStorage.getItem(STORAGE_KEY);
          } catch {
            secret.current = null;
          }
          if (!secret.current) {
            await pair();
            timer = window.setTimeout(tick, POLL_MS);
            return;
          }
        }

        const response = await fetch(`/api/tv/pair?secret=${encodeURIComponent(secret.current)}`);
        if (!active) return;

        // The stored secret is not a television any more: the code lapsed
        // before anyone claimed it, or the phone unpaired the set. Either way
        // the answer is to start over with a new code rather than to sit on a
        // credential that will never work again.
        if (response.status === 404) {
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {}
          secret.current = null;
          await pair();
          timer = window.setTimeout(tick, POLL_MS);
          return;
        }

        const data = await response.json();
        if (!active) return;

        if (data.status === "ready") setStatus({ kind: "ready", token: data.token, party: data.party });
        else if (data.status === "idle") setStatus({ kind: "idle", code: data.code, owner: data.owner });
        else setStatus({ kind: "waiting", code: data.code });
      } catch {
        // A television's network drops constantly — the set moves rooms, the
        // router restarts. Never a dead end: say so and try again.
        if (active) setStatus({ kind: "error", message: "مفيش نت. بنحاول تاني..." });
      }

      timer = window.setTimeout(tick, POLL_MS);
    }

    tick();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [pair]);

  /**
   * The set keeps polling while it plays, so pointing it at another party from
   * the phone switches the picture without anyone touching the television. That
   * is also why the player is keyed by party id: a new party is a new player,
   * not an old one told to load a different file.
   */
  if (status.kind === "ready") {
    return (
      <TvPlayer
        key={status.party.id}
        token={status.token}
        party={status.party}
        onLeave={() => setStatus({ kind: "starting" })}
      />
    );
  }

  if (status.kind === "idle") {
    return (
      <TvNotice
        title={`أهلاً ${status.owner} 👋`}
        body="التليفزيون مربوط بحسابك. افتح سهرة من الموبايل واختار «شغّلها على التليفزيون» وهتظهر هنا على طول."
        action={`كود الجهاز: ${status.code}`}
      />
    );
  }

  if (status.kind === "error") {
    return <TvNotice title="مفيش اتصال" body={status.message} />;
  }

  return <PairingScreen code={status.kind === "waiting" ? status.code : null} />;
}

function PairingScreen({ code }: { code: string | null }) {
  return (
    <div className="tv tv-safe flex h-screen w-screen flex-col items-center justify-center bg-ink text-center">
      <Mark className="h-[1.6em] w-auto" />
      <h1 className="display mt-6 text-[1.6em] text-ivory">وصّل التليفزيون بحسابك</h1>

      <p className="mt-8 text-[0.85em] leading-relaxed text-ivory-dim">
        من الموبايل، افتح <b className="text-gold">msparty</b> ← البروفايل ← <b className="text-gold">وصّل تليفزيون</b>
        <br />
        واكتب الكود ده:
      </p>

      {/* The one thing on this screen that gets read out loud from across a
          room, so it is the only thing sized for that. */}
      <p className="tv-code mt-8" dir="ltr">
        {code ?? "••••••"}
      </p>

      <p className="mt-10 text-[0.65em] text-ivory-dim/70">
        الكود بيتغيّر كل ربع ساعة. سيب الصفحة مفتوحة.
      </p>
    </div>
  );
}
