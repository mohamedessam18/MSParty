"use client";
import { useEffect, useRef } from "react";

/**
 * The card that turns to face you.
 *
 * The rotation is written to two CSS variables rather than to the transform
 * itself, so the stylesheet keeps ownership of what the card looks like and
 * this only says where the pointer is. It also means the effect can be removed
 * entirely by CSS — see the reduced-motion block in globals.css.
 *
 * Nothing happens on a device without a hovering pointer. A phone has no cursor
 * to follow, and driving the tilt from touch turns every tap into a lurch.
 */
export function TiltStage({
  children,
  className = "",
  max = 7
}: {
  children: React.ReactNode;
  className?: string;
  /** Degrees at the far corner. Past about eight it stops reading as depth and
   *  starts reading as a bug. */
  max?: number;
}) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = card.current;
    if (!element) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;

    function onMove(event: PointerEvent) {
      // Coalesced into one write per frame: pointermove fires far faster than
      // the screen refreshes, and every extra write is a layout the user never
      // sees.
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const box = element!.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        // Inverted on the X axis: pushing the pointer down should tip the top
        // of the card away, the way a hinged object behaves.
        element!.style.setProperty("--tilt-x", `${(-y * max).toFixed(2)}deg`);
        element!.style.setProperty("--tilt-y", `${(x * max).toFixed(2)}deg`);
      });
    }

    function reset() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      element!.style.setProperty("--tilt-x", "0deg");
      element!.style.setProperty("--tilt-y", "0deg");
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", reset);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", reset);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [max]);

  return (
    <div ref={card} className={`stage-card ${className}`}>
      {children}
    </div>
  );
}
