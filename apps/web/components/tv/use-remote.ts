"use client";
import { useEffect, useRef, useState } from "react";

/**
 * A remote control, as a list of things and an index into it.
 *
 * Televisions do not agree on much, but they all send arrow keys, and most send
 * a Back that is either Escape or key code 461 (webOS) / 10009 (Tizen). Those
 * two numbers are the whole reason this is a hook and not a call to the
 * browser's own focus handling: `keyCode` is deprecated everywhere except on
 * the devices that only speak it.
 *
 * Roving focus rather than native tab order, because tab order follows the DOM
 * and a remote follows the picture. With a handful of controls on screen the
 * two are the same thing, and a single index is far easier to reason about than
 * a tree of tabindexes.
 */
export const BACK_KEYS = new Set(["Escape", "Backspace", "GoBack", "BrowserBack"]);
/** webOS and Tizen send their Back button as a code with no name. */
const BACK_CODES = new Set([461, 10009]);

export function useRemote({
  count,
  enabled = true,
  onSelect,
  onBack,
  orientation = "vertical"
}: {
  count: number;
  enabled?: boolean;
  onSelect: (index: number) => void;
  onBack?: () => void;
  orientation?: "vertical" | "horizontal";
}) {
  const [index, setIndex] = useState(0);
  // Held in a ref as well so the listener never has to be rebuilt — rebinding a
  // keydown listener on every arrow press drops the one that arrives during it.
  const state = useRef({ index: 0, count, onSelect, onBack, orientation });
  state.current = { index, count, onSelect, onBack, orientation };

  // A control that disappears must not leave the cursor pointing past the end.
  useEffect(() => {
    setIndex(current => (current >= count ? Math.max(0, count - 1) : current));
  }, [count]);

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      const { index: at, count: total, onSelect: select, onBack: back, orientation: axis } = state.current;
      const forward = axis === "vertical" ? "ArrowDown" : "ArrowLeft";
      const backward = axis === "vertical" ? "ArrowUp" : "ArrowRight";

      if (BACK_CODES.has(event.keyCode) || BACK_KEYS.has(event.key)) {
        if (!back) return;
        event.preventDefault();
        return back();
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        return select(at);
      }

      if (!total) return;
      if (event.key === forward) {
        event.preventDefault();
        // Wraps, because a remote has no scrollbar to tell you where the end is.
        setIndex(current => (current + 1) % total);
      } else if (event.key === backward) {
        event.preventDefault();
        setIndex(current => (current - 1 + total) % total);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  return { index, setIndex };
}
