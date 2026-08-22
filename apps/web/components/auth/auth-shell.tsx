import { Rule, Wordmark } from "@/components/ui/wordmark";
import { CinemaStage } from "@/components/three/cinema-stage";
import { TiltStage } from "./tilt-stage";

/**
 * The frame every sign-in screen sits in.
 *
 * One component rather than three near-copies, because these screens are read
 * as a set — someone bounced from login to register to restore should feel like
 * they stayed in the same room and the furniture moved, not like they landed on
 * three different sites.
 */
export function AuthShell({
  kicker,
  title,
  lede,
  children,
  footer
}: {
  kicker: string;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <>
      {/* Outside <main> on purpose. `.stage` sets a CSS perspective, and a
          perspective makes a containing block for fixed descendants — nested
          inside, this was pinned to the width of the card instead of the
          window. Quieter than the landing page's too: these are screens people
          came to get something done on, so the room is atmosphere rather than
          the thing being looked at. */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 opacity-70">
        <CinemaStage className="h-full w-full" quality="reduced" variant="atmosphere" fallback={null} />
      </div>

      <main className="stage stage-glow relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <Wordmark className="mb-7 self-start" />

      <TiltStage>
        <div className="bevel relative rounded-xl bg-velvet/80 p-6 backdrop-blur-sm sm:p-8">
          {/* Lifted furthest, so it is the part that moves most as the card
              turns — the marquee should read as being in front of the card face. */}
          <div className="bulbs depth-3 mb-6" aria-hidden>
            {Array.from({ length: 9 }, (_, index) => (
              <span key={index} />
            ))}
          </div>

          <div className="depth-2">
            <p className="mono text-xs uppercase tracking-[.18em] text-gold">{kicker}</p>
            <h1 className="display mt-2 text-3xl leading-tight text-ivory">{title}</h1>
            <Rule className="mt-4" />
            {lede && <p className="mt-4 text-sm leading-7 text-ivory-dim">{lede}</p>}
          </div>

          <div className="depth-1 mt-6">{children}</div>
        </div>
      </TiltStage>

        {footer && <div className="mt-6 text-center text-sm text-ivory-dim">{footer}</div>}
      </main>
    </>
  );
}
