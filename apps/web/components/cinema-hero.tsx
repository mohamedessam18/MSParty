/**
 * The landing page's poster: a small cinema, seen from the back of the room.
 *
 * Built in CSS 3D rather than drawn flat, because the thing being sold is the
 * room — the screen at the front, and rows of people between you and it. The
 * old version was a rectangle with three name chips pulled up over its edge on
 * a negative margin, and the frame clipped them in half.
 *
 * Every transform is on a compositor-friendly property, and the whole thing is
 * static: `prefers-reduced-motion` already stops the two ambient animations
 * globally, and nothing here moves except them.
 */

/** Depth of each row, in the scene's own units. Front row nearest the viewer. */
const ROWS = [
  { z: 0, seats: 4, opacity: 1 },
  { z: -70, seats: 5, opacity: 0.62 },
  { z: -140, seats: 6, opacity: 0.34 }
];

/** The people in the front row. Named, because the row is the product. */
const AUDIENCE = [
  { name: "أنت", host: true },
  { name: "سارة", host: false },
  { name: "عمر", host: false },
  { name: "ليلى", host: false }
];

function Seat({ lit, label }: { lit?: boolean; label?: string }) {
  return (
    <div className="relative flex flex-col items-center">
      {label && (
        <span
          className={`mb-1.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold ${
            lit ? "bg-gold text-ink" : "bg-velvet-hi text-ivory"
          }`}
        >
          {label}
        </span>
      )}
      {/* The seat back, echoing the mark: a rounded top on a solid base. */}
      <div
        className={`h-7 w-8 rounded-t-lg sm:h-9 sm:w-10 ${lit ? "bg-gold" : "bg-velvet-hi"}`}
        style={{
          // Rim light from the screen, which is the only light source here.
          boxShadow: lit ? "0 -2px 10px rgba(201,162,39,.5)" : "0 -2px 8px rgba(201,162,39,.16)"
        }}
      />
    </div>
  );
}

export function CinemaHero() {
  return (
    <div
      className="relative mx-auto w-full max-w-lg select-none"
      // Deep enough that the rows recede without the front row distorting.
      style={{ perspective: "1100px", perspectiveOrigin: "50% 38%" }}
      aria-hidden
    >
      {/* Room glow: the screen washing the back wall. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 blur-2xl"
        style={{ background: "radial-gradient(60% 45% at 50% 22%, rgba(201,162,39,.22), transparent 70%)" }}
      />

      <div style={{ transformStyle: "preserve-3d" }}>
        {/* The screen, tilted away at the top the way a real one is hung. */}
        <div
          className="marquee-frame relative mx-auto w-[86%]"
          style={{ transform: "rotateX(6deg) translateZ(-40px)", transformStyle: "preserve-3d" }}
        >
          <div className="relative aspect-video overflow-hidden border border-gold/25 bg-gradient-to-b from-velvet to-ink-deep">
            <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-2.5 text-[10px] sm:p-3 sm:text-xs">
              <span className="rounded border border-gold/25 bg-ink/70 px-2 py-1 text-gold">ليلة فيلم الجمعة</span>
              <span className="mono flex items-center gap-1.5 rounded bg-curtain/20 px-2 py-1 text-curtain">
                <i className="animate-soft-pulse h-1.5 w-1.5 rounded-full bg-curtain" />
                LIVE · 04
              </span>
            </div>

            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-xl text-gold sm:h-16 sm:w-16 sm:text-2xl">
                ▶
              </span>
            </div>

            {/* Scan of light across the picture, so the screen reads as lit
                rather than as a dark panel with a button on it. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{ background: "linear-gradient(160deg, rgba(242,232,213,.09), transparent 42%)" }}
            />
          </div>
        </div>

        {/* The beam. A trapezoid widening toward the viewer, which is what
            actually sells the depth — without it the rows read as stacked. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-[42%] mx-auto h-40 w-[86%]"
          style={{
            transform: "rotateX(74deg)",
            transformOrigin: "50% 0%",
            background: "linear-gradient(to bottom, rgba(201,162,39,.16), transparent 78%)",
            clipPath: "polygon(30% 0%, 70% 0%, 100% 100%, 0% 100%)"
          }}
        />

        {/* The rows, laid flat and pushed back. Rendered far to near so the
            nearer ones paint over the ones behind. */}
        <div
          className="relative mt-6 flex flex-col items-center gap-5 sm:mt-8 sm:gap-6"
          style={{ transform: "rotateX(20deg)", transformStyle: "preserve-3d" }}
        >
          {[...ROWS].reverse().map(row => (
            <div
              key={row.z}
              className="flex items-end justify-center gap-2 sm:gap-3"
              style={{
                transform: `translateZ(${row.z}px)`,
                opacity: row.opacity
              }}
            >
              {row.z === 0
                ? AUDIENCE.map(person => <Seat key={person.name} lit={person.host} label={person.name} />)
                : Array.from({ length: row.seats }, (_, index) => <Seat key={index} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
