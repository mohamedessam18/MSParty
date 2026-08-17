import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-gold text-ink font-bold hover:bg-gold-lit",
  ghost: "border border-gold/30 text-ivory hover:bg-gold/10 hover:border-gold/60",
  danger: "border border-curtain/40 bg-curtain/10 text-curtain hover:bg-curtain/20",
  subtle: "bg-velvet-hi text-ivory hover:bg-velvet-hi/70"
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-base"
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className = "", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 rounded transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});
