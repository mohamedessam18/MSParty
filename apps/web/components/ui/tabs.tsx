"use client";
import { useRef } from "react";

export type TabItem<T extends string> = { value: T; label: string; badge?: number };

/** Roving-tabindex tablist. Arrow keys are swapped for RTL so "left" moves forward. */
export function Tabs<T extends string>({
  value,
  onChange,
  items
}: {
  value: T;
  onChange: (next: T) => void;
  items: TabItem<T>[];
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const forward = event.key === "ArrowLeft";
    const back = event.key === "ArrowRight";
    if (!forward && !back) return;
    event.preventDefault();
    const next = (index + (forward ? 1 : -1) + items.length) % items.length;
    onChange(items[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div role="tablist" className="flex gap-1 border-b border-velvet-hi px-1 pb-2">
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={element => {
              refs.current[index] = element;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={event => onKeyDown(event, index)}
            onClick={() => onChange(item.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-sm transition ${
              active ? "bg-gold font-bold text-ink" : "text-ivory-dim hover:bg-velvet-hi hover:text-ivory"
            }`}
          >
            {item.label}
            {!active && !!item.badge && (
              <span
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-curtain px-1 text-[10px] font-bold text-ivory"
                aria-label={`${item.badge} جديد`}
              >
                {item.badge > 9 ? "9+" : item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
