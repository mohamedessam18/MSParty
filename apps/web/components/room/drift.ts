/**
 * Staying in step with the room.
 *
 * The thresholds and the decision that reads them live here rather than in the
 * room component, because there is now a second player — the television — that
 * has to make exactly the same judgement. Two copies of these numbers would
 * drift apart the first time one of them was tuned, and the symptom would be a
 * TV that is half a second behind the laptop next to it.
 */

/** Drift thresholds, in seconds. */
export const HARD_SEEK = 5; // beyond this, catching up gradually would take too long
export const NUDGE = 0.35; // beyond this, lean on playback rate
export const SETTLED = 0.15; // inside this, run at normal speed

export type Correction =
  /** Jump. Used when the gap is too wide to close by running faster. */
  | { kind: "seek"; to: number }
  /** Run slightly fast or slow until the gap closes on its own. */
  | { kind: "rate"; factor: number }
  /** Close enough — nothing to do. */
  | { kind: "hold" };

/**
 * What to do about being `drift` seconds away from `target`.
 *
 * Positive drift means the room is ahead and this player is behind.
 *
 * A paused room gets no rate correction at all: a stopped picture cannot catch
 * up by playing faster, so the only way to align it is to move it.
 */
export function correctionFor(drift: number, isPlaying: boolean, target: number): Correction {
  const gap = Math.abs(drift);

  if (!isPlaying) return gap > 0.5 ? { kind: "seek", to: target } : { kind: "hold" };
  if (gap > HARD_SEEK) return { kind: "seek", to: target };
  if (gap > NUDGE) return { kind: "rate", factor: drift > 0 ? 1.05 : 0.95 };
  if (gap < SETTLED) return { kind: "rate", factor: 1 };
  return { kind: "hold" };
}

/**
 * Where the room actually is right now.
 *
 * A playing room's broadcast position is already stale by the time it arrives,
 * by however long the message took — so the elapsed time since the server
 * stamped it is added back. A paused one is wherever it was left.
 */
export function roomPosition(
  { isPlaying, timestamp, serverTime }: { isPlaying: boolean; timestamp: number; serverTime: number },
  runtime = 0
) {
  const raw = isPlaying ? timestamp + (Date.now() - serverTime) / 1000 : timestamp;
  // A room left flagged as playing accumulates elapsed time without bound, so
  // an old party can report a position hours past the runtime. Never seek
  // beyond the end of the media we actually have.
  return runtime > 0 ? Math.min(raw, runtime) : raw;
}
