import { forwardRef } from "react";

const base =
  "w-full min-w-0 rounded border border-velvet-hi bg-ink-deep px-4 py-3 text-ivory placeholder:text-ivory-dim/60 transition focus:border-gold focus:outline-none";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return <input ref={ref} className={`${base} ${className}`} {...props} />;
  }
);

/** Label + field, the pattern every form screen was repeating by hand. */
export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-ivory-dim">
      {label}
      <span className="mt-2 block">{children}</span>
      {hint && <span className="mt-1.5 block text-xs text-ivory-dim/70">{hint}</span>}
    </label>
  );
}

export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded border border-curtain/30 bg-curtain/10 px-3 py-2 text-sm text-curtain">
      {children}
    </p>
  );
}
