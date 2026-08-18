"use client";
import { useEffect, useRef } from "react";

/**
 * Phones dim and lock while a film plays, because nobody is touching the
 * screen. Hold a wake lock for as long as playback is running, and take it
 * again when the tab comes back — the browser drops it on every hide.
 */
export function useScreenWake(active: boolean) {
  const lock = useRef<any>(null);

  useEffect(() => {
    const anyNavigator = navigator as any;
    if (!anyNavigator.wakeLock) return;

    let cancelled = false;

    const acquire = async () => {
      if (!active || document.visibilityState !== "visible" || lock.current) return;
      try {
        const sentinel = await anyNavigator.wakeLock.request("screen");
        if (cancelled) return sentinel.release().catch(() => undefined);
        lock.current = sentinel;
        sentinel.addEventListener?.("release", () => {
          lock.current = null;
        });
      } catch {
        // Denied or unsupported; the film still plays, the screen just sleeps.
      }
    };

    const release = () => {
      lock.current?.release?.().catch(() => undefined);
      lock.current = null;
    };

    if (active) acquire();
    else release();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && active) acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      release();
    };
  }, [active]);
}
