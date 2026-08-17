/** Was duplicated verbatim in dashboard/page.tsx and party-room.tsx. */
export function initials(name?: string | null) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(part => part[0]).join("").toUpperCase() || "؟";
}

const sizes = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-9 w-9 text-xs",
  lg: "h-11 w-11 text-sm",
  xl: "h-24 w-24 text-2xl"
} as const;

export function Avatar({
  name,
  src,
  size = "md",
  ring = false,
  className = ""
}: {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof sizes;
  ring?: boolean;
  className?: string;
}) {
  const shape = `shrink-0 rounded-full object-cover ${sizes[size]} ${ring ? "border-2 border-gold" : ""} ${className}`;
  if (src) return <img src={src} alt={name || ""} className={shape} />;
  return (
    <span
      aria-hidden
      className={`flex items-center justify-center bg-velvet-hi font-bold text-gold ${shape}`}
    >
      {initials(name)}
    </span>
  );
}
