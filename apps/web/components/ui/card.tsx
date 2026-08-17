export function Card({ className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-velvet-hi bg-velvet/70 ${className}`} {...props} />;
}

/** Small uppercase kicker above a heading — the marquee label. */
export function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="mono text-xs uppercase tracking-[.18em] text-gold">{children}</p>;
}

export function EmptyState({
  icon,
  title,
  children,
  action
}: {
  icon: string;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gold/25 bg-velvet/40 p-8 text-center">
      <span aria-hidden className="text-3xl">
        {icon}
      </span>
      <h2 className="display mt-3 text-xl text-ivory">{title}</h2>
      {children && <p className="mt-2 text-sm leading-7 text-ivory-dim">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
