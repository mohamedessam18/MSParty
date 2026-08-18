import Link from "next/link";

/**
 * The mark: a row of cinema seats under the glow of a screen.
 *
 * Seats rather than a play triangle, because the thing that makes this not a
 * video player is that there are other people in the room. Drawn on a 64-unit
 * grid with gaps wide enough to survive being four pixels across — three seats
 * that merge into one blob at favicon size are worth less than no mark at all.
 */
export function Mark({
  className = "",
  title,
  size
}: {
  className?: string;
  title?: string;
  /** Explicit pixels, for renderers with no CSS — the share-card generator
   *  sizes by attribute because Tailwind classes mean nothing to it. */
  size?: number;
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      fill="none"
    >
      {title && <title>{title}</title>}
      {/* The screen. An arc of a circle centred well below the frame, so the
          curve is shallow and reads as a wide screen, not a rainbow. */}
      <path
        d="M 7.8 28 A 28 28 0 0 1 56.2 28"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        opacity=".72"
      />
      {/* Three seat backs and the row they sit in, drawn as one filled shape so
          the overlap never shows as a seam. */}
      <g fill="currentColor">
        <rect x="10" y="32" width="12" height="14" rx="5" />
        <rect x="26" y="32" width="12" height="14" rx="5" />
        <rect x="42" y="32" width="12" height="14" rx="5" />
        <rect x="8" y="44" width="48" height="5" rx="2.5" />
      </g>
    </svg>
  );
}

/**
 * The mark and the name together. `compact` drops the name for places with no
 * room for it — the mark alone is the only part that works below about 80px.
 */
export function Wordmark({
  href = "/",
  className = "",
  compact = false
}: {
  href?: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} className={`flex items-center gap-2 leading-none text-ivory ${className}`}>
      <Mark className="h-7 w-7 shrink-0 text-gold" title="MSParty" />
      {!compact && (
        <span className="display text-2xl">
          MS<span className="text-gold">Party</span>
        </span>
      )}
    </Link>
  );
}

/** Thin gilded rule used under headings, echoing a marquee border. */
export function Rule({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-gradient-to-l from-gold/60 via-gold/20 to-transparent ${className}`} />;
}
