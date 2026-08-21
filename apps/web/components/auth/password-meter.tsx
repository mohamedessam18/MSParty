"use client";
import { PASSWORD_MIN, passwordStrength } from "@/lib/password";

const LABELS = ["ضعيفة جدًا", "ضعيفة", "معقولة", "كويسة", "قوية"];
const COLOURS = ["bg-curtain", "bg-curtain", "bg-gold/60", "bg-gold", "bg-gold-lit"];

/**
 * Advisory, and says so: nothing here refuses a password. The server has the
 * rules (lib/password.ts), and a meter that disagrees with the server about
 * what is allowed is worse than no meter — this reads the same function the
 * server does, so it cannot drift from it.
 */
export function PasswordMeter({ value }: { value: string }) {
  if (!value) return null;
  const score = passwordStrength(value);
  const short = value.length < PASSWORD_MIN;

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map(index => (
          <span
            key={index}
            className={`h-1 flex-1 rounded-sm transition-colors ${index < score ? COLOURS[score] : "bg-velvet-hi"}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ivory-dim/80">
        {short ? `فاضل ${PASSWORD_MIN - value.length} حرف` : LABELS[score]}
      </p>
    </div>
  );
}
