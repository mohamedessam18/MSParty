import Link from "next/link";

export function Wordmark({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`display text-2xl leading-none text-ivory ${className}`}>
      MS<span className="text-gold">Party</span>
    </Link>
  );
}

/** Thin gilded rule used under headings, echoing a marquee border. */
export function Rule({ className = "" }: { className?: string }) {
  return <div className={`h-px bg-gradient-to-l from-gold/60 via-gold/20 to-transparent ${className}`} />;
}
