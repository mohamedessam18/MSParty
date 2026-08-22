"use client";
import { useEffect, useRef, useState } from "react";
import type { Quality, SceneHandle, Variant } from "./cinema-scene";

/**
 * Decides whether the room gets rendered at all, and keeps it cheap when it is.
 *
 * The three.js scene is a background. It has to be possible for it to simply
 * not happen — no WebGL, a machine that cannot spare the frames, a reader who
 * asked for less motion — and for the page to still look finished. So the
 * fallback is not a blank space: it is the CSS cinema that was already here,
 * which stays on screen until the real one has actually started drawing.
 *
 * The module is loaded on demand rather than imported at the top: three is a
 * hundred and fifty kilobytes, and no other page should pay for it.
 */
export function CinemaStage({
  fallback,
  className = "",
  quality: forced,
  variant = "room"
}: {
  fallback: React.ReactNode;
  className?: string;
  variant?: Variant;
  /** Auth screens ask for the quieter build; the landing page takes the full one. */
  quality?: Quality;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    // A reader who asked for less motion gets the still picture instead. This
    // is the one case where the fallback is the better answer rather than the
    // lesser one.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let handle: SceneHandle | null = null;
    let frame = 0;
    let disposed = false;
    let observer: ResizeObserver | undefined;

    // A coarse pointer usually means a phone, where the scene is
    // both harder to run and barely seen behind the content.
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const quality: Quality = forced ?? (coarse || (navigator.hardwareConcurrency ?? 4) <= 4 ? "reduced" : "full");

    import("./cinema-scene").then(({ createCinema }) => {
      if (disposed || !canvas.current) return;
      handle = createCinema(canvas.current, quality, variant);
      if (!handle) return;

      const fit = () => {
        const box = canvas.current?.parentElement?.getBoundingClientRect();
        if (box && box.width && box.height) handle?.resize(box.width, box.height);
      };
      fit();
      observer = new ResizeObserver(fit);
      if (canvas.current.parentElement) observer.observe(canvas.current.parentElement);

      const onPointer = (event: PointerEvent) => {
        handle?.look((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
      };
      if (!coarse) window.addEventListener("pointermove", onPointer, { passive: true });

      const loop = (time: number) => {
        // Stops entirely when the tab is not being looked at. A background
        // animation nobody can see is pure battery.
        if (document.visibilityState === "visible") handle?.render(time / 1000);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
      // Only now does the fallback go: swapping on load rather than on first
      // frame leaves a black hole for however long the first draw takes.
      setLive(true);

      handle.dispose = ((original) => () => {
        window.removeEventListener("pointermove", onPointer);
        original();
      })(handle.dispose);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      handle?.dispose();
    };
  }, [forced, variant]);

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvas}
        aria-hidden
        className={`absolute inset-0 h-full w-full transition-opacity duration-700 ${live ? "opacity-100" : "opacity-0"}`}
      />
      {/* Kept mounted underneath rather than swapped out: it is what shows when
          the scene never starts, and what shows while it is still loading. */}
      <div className={`transition-opacity duration-700 ${live ? "pointer-events-none opacity-0" : "opacity-100"}`}>
        {fallback}
      </div>
    </div>
  );
}
