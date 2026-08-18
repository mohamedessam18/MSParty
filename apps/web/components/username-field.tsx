"use client";
import { useEffect, useRef, useState } from "react";
import { Field, Input } from "./ui/input";
import { USERNAME_MAX } from "@/lib/username";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "taken"; message: string; suggestions: string[] };

/**
 * Checks as the person types rather than after they submit. A name is claimed
 * by whoever gets there first, so finding out at submit time means retyping a
 * password-length form to learn a second name is gone too.
 */
export function UsernameField({
  value,
  onChange,
  disabled,
  hint
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const timer = useRef<number>();
  const sequence = useRef(0);

  useEffect(() => {
    window.clearTimeout(timer.current);
    if (!value) return setStatus({ kind: "idle" });

    setStatus({ kind: "checking" });
    // Debounced: a request per keystroke would race itself, and the last reply
    // to arrive is not necessarily the last one asked for.
    timer.current = window.setTimeout(async () => {
      const ticket = ++sequence.current;
      try {
        const response = await fetch(`/api/username/check?u=${encodeURIComponent(value)}`);
        const data = await response.json();
        if (ticket !== sequence.current) return;
        setStatus(
          data.available
            ? { kind: "free" }
            : { kind: "taken", message: data.message, suggestions: data.suggestions ?? [] }
        );
      } catch {
        if (ticket === sequence.current) setStatus({ kind: "idle" });
      }
    }, 400);

    return () => window.clearTimeout(timer.current);
  }, [value]);

  return (
    <Field label="اسم المستخدم" hint={hint ?? `أصحابك بيلاقوك بيه · حروف إنجليزي وأرقام و . و _ · حتى ${USERNAME_MAX} حرف`}>
      <div className="relative">
        <span className="mono pointer-events-none absolute inset-y-0 left-3 flex items-center text-ivory-dim">@</span>
        <Input
          dir="ltr"
          disabled={disabled}
          maxLength={USERNAME_MAX}
          placeholder="username"
          className="pl-8"
          value={value}
          // Mirror the server's shape while typing so the field cannot hold
          // something that could never be accepted.
          onChange={event => onChange(event.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, USERNAME_MAX))}
          aria-describedby="username-status"
        />
      </div>

      <p id="username-status" aria-live="polite" className="mt-1.5 min-h-5 text-xs">
        {status.kind === "checking" && <span className="text-ivory-dim">بنشوف...</span>}
        {status.kind === "free" && <span className="text-gold">متاح ✓</span>}
        {status.kind === "taken" && <span className="text-curtain">{status.message}</span>}
      </p>

      {status.kind === "taken" && !!status.suggestions.length && (
        <div className="flex flex-wrap gap-1.5">
          {status.suggestions.map(suggestion => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onChange(suggestion)}
              className="mono rounded border border-velvet-hi px-2 py-1 text-xs text-ivory transition hover:border-gold hover:text-gold"
            >
              @{suggestion}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
}
