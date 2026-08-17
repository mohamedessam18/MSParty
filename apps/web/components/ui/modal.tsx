"use client";
import { useEffect, useRef } from "react";

export function Modal({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("input, button, [href]")?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") return onClose();
      if (event.key !== "Tab" || !panel.current) return;
      // Keep focus inside the dialog.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'input:not([disabled]), button:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-deep/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-xl border border-velvet-hi bg-velvet p-6 shadow-lift sm:rounded-xl"
      >
        <div className="flex items-center justify-between border-b border-velvet-hi pb-4">
          <h2 className="display text-xl text-ivory">{title}</h2>
          <button onClick={onClose} aria-label="إغلاق" className="text-lg text-ivory-dim hover:text-ivory">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
