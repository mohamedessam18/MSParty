import { forwardRef } from "react";

type Variant = "primary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

/**
 * Each variant carries its own base — the colour of the side you are looking at
 * when the button is standing up. It is the variant's own colour taken down,
 * never a generic black: a shadow the colour of the object reads as the object
 * continuing, and a grey one reads as a drop shadow behind it.
 */
const variants: Record<Variant, string> = {
  primary: "bg-gold text-ink font-bold hover:bg-gold-lit [--btn-base:#8a6d14]",
  ghost: "border border-gold/30 text-ivory hover:bg-gold/10 hover:border-gold/60 [--btn-base:#2a1418] [--btn-depth:3px]",
  danger: "border border-curtain/40 bg-curtain/10 text-curtain hover:bg-curtain/20 [--btn-base:#5c1d1d] [--btn-depth:3px]",
  subtle: "bg-velvet-hi text-ivory hover:bg-velvet-hi/70 [--btn-base:#241014]"
};

const sizes: Record<Size, string> = {
  sm: "px-3 py-1.5 text-xs [--btn-depth:2px]",
  md: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3 text-base [--btn-depth:5px]"
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
      // btn-3d before the variant classes so a caller's className, and the
      // variant's own --btn-base, both still win.
      className={`btn-3d inline-flex items-center justify-center gap-2 rounded transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});
