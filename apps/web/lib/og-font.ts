/**
 * An Arabic font for the share-card renderer.
 *
 * next/og shapes text itself rather than handing it to a browser, and its
 * shaper only implements part of OpenType. Left to pick a system font it fails
 * outright on Arabic — "lookupType: 5 substFormat: 3 is not yet supported" —
 * because joining and contextual forms are exactly the tables it is missing.
 * Naming a font that it can shape is the whole fix.
 *
 * Fetched rather than committed: a variable Arabic font is a few hundred
 * kilobytes of binary in the repository for one picture. Held in module scope
 * afterwards, so a warm server renders every later card without going out
 * again, and a cold one pays for it once.
 */
let cached: Promise<ArrayBuffer | null> | null = null;

/** The one weight the card uses. A family here would be three downloads. */
const FAMILY = "Cairo:wght@700";

async function download(): Promise<ArrayBuffer | null> {
  try {
    // No User-Agent at all, which is the part worth writing down: Google picks
    // the format from it, and the renderer can only read truetype. A modern
    // agent gets woff2 and the well-known "pretend to be IE6" trick now gets a
    // third thing again — sending none is what returns a plain .ttf today.
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${FAMILY}&display=swap`, {
      signal: AbortSignal.timeout(6000)
    });
    if (!css.ok) return null;

    const source = (await css.text()).match(/src:\s*url\(([^)]+\.ttf)\)/)?.[1];
    // Matched on the extension rather than on the first url(): the endpoint
    // answers with several formats depending on what it thinks is asking, and
    // handing the renderer a woff2 fails later and less clearly than not
    // finding a font at all.
    if (!source) return null;

    const font = await fetch(source, { signal: AbortSignal.timeout(8000) });
    if (!font.ok) return null;
    return await font.arrayBuffer();
  } catch {
    return null;
  }
}

export function arabicFont() {
  // A failure is not cached: a card rendered during a blip must not poison
  // every card after it for the life of the process.
  if (!cached) {
    cached = download().then(buffer => {
      if (!buffer) cached = null;
      return buffer;
    });
  }
  return cached;
}
