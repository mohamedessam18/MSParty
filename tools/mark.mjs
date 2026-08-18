import { deflateSync, crc32 } from "node:zlib";

/**
 * The one drawing of the MSParty mark: a row of cinema seats under the glow of
 * a screen.
 *
 * Every rendering of it comes from here — the site's favicon, the touch icon,
 * the web manifest, and the extension's toolbar icons. It used to live in three
 * places and the comment warning about that was the only thing keeping them in
 * step, which is not a mechanism.
 *
 * Seats rather than a play triangle: what makes this not a video player is that
 * there are other people in the room.
 *
 * A build script, not shipped code. Run `node tools/draw.mjs` after any change.
 */

export const INK = "#140a0d";
export const GOLD = "#c9a227";

const INK_RGB = [0x14, 0x0a, 0x0d];
const GOLD_RGB = [0xc9, 0xa2, 0x27];

/** Drawn on a 64-unit grid so every size divides it cleanly. */
export const GRID = 64;
const CORNER = 15;
/** The screen is an arc of a circle centred below the frame, which makes the
 *  curve shallow enough to read as a wide screen rather than a rainbow. */
const ARC = { cx: 32, cy: 42, r: 28, half: 2.5, bottom: 28, dim: 0.72 };
const SEATS = { lefts: [10, 26, 42], width: 12, top: 32, bottom: 46, radius: 5 };
const ROW = { x0: 8, y0: 44, x1: 56, y1: 49, radius: 2.5 };

/** Renders 4x and averages down. Every edge is a curve or a diagonal, and all
 *  of them look chewed without it. */
const SUPERSAMPLE = 4;

function roundedRect(x, y, x0, y0, x1, y1, radius) {
  const halfWidth = (x1 - x0) / 2;
  const halfHeight = (y1 - y0) / 2;
  const dx = Math.abs(x - (x0 + halfWidth)) - (halfWidth - radius);
  const dy = Math.abs(y - (y0 + halfHeight)) - (halfHeight - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

const dim = (weight = 1) => GOLD_RGB.map((channel, index) => Math.round(channel * weight + INK_RGB[index] * (1 - weight)));

/**
 * `weight` fattens the strokes at small sizes. A shape scaled down
 * proportionally disappears long before the pixel grid runs out — at 16px the
 * arc is one pixel and the gaps between the seats are less than one.
 */
function sample(x, y, weight) {
  if (roundedRect(x, y, 0, 0, GRID, GRID, CORNER) > 0) return null;

  const fromCentre = Math.hypot(x - ARC.cx, y - ARC.cy);
  if (y < ARC.bottom && Math.abs(fromCentre - ARC.r) < ARC.half + weight) {
    // Dimmer than the seats — it is the light they face, not the subject. Not
    // much dimmer: below about two thirds it stops registering at favicon size.
    return dim(ARC.dim);
  }

  // Gaps grow with weight so three seats stay three things rather than merging.
  const gap = weight / 2;
  for (const left of SEATS.lefts) {
    if (roundedRect(x, y, left + gap, SEATS.top - weight, left + SEATS.width - gap, SEATS.bottom, SEATS.radius) <= 0) {
      return GOLD_RGB;
    }
  }
  if (roundedRect(x, y, ROW.x0, ROW.y0 - weight, ROW.x1, ROW.y1, ROW.radius) <= 0) return GOLD_RGB;

  return INK_RGB;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(typed) >>> 0);
  return Buffer.concat([length, typed, check]);
}

function encode(width, height, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  // compression, filter and interlace methods each have exactly one legal value

  // Every scanline carries its filter type; 0 means the bytes stand as they are.
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row++) {
    raw[row * stride] = 0;
    pixels.copy(raw, row * stride + 1, row * width * 4, (row + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/** A PNG of the mark at `size` square, as a Buffer. */
export function renderPng(size) {
  const weight = size <= 32 ? 1 : 0;
  const scale = size * SUPERSAMPLE;
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const colour = sample(
            ((px * SUPERSAMPLE + sx + 0.5) / scale) * GRID,
            ((py * SUPERSAMPLE + sy + 0.5) / scale) * GRID,
            weight
          );
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          covered++;
        }
      }

      const offset = (py * size + px) * 4;
      // Averaged over the samples that landed inside the shape, not over all of
      // them: including the transparent ones darkens every edge into a halo.
      const divisor = covered || 1;
      pixels[offset] = Math.round(r / divisor);
      pixels[offset + 1] = Math.round(g / divisor);
      pixels[offset + 2] = Math.round(b / divisor);
      pixels[offset + 3] = Math.round((covered / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
    }
  }

  return encode(size, size, pixels);
}

const VELVET_RGB = [0x2d, 0x14, 0x18];

/**
 * Ordered dither. A gradient this dark spans about twenty levels across twelve
 * hundred pixels, so rounding to whole bytes lays down visible concentric rings
 * — scattering the rounding error breaks them into noise the eye reads as
 * smooth. Values are the classic 4x4 Bayer matrix, centred on zero.
 */
const BAYER = [
  [-0.5, 0.0, -0.375, 0.125],
  [0.25, -0.25, 0.375, -0.125],
  [-0.3125, 0.1875, -0.4375, 0.0625],
  [0.4375, -0.0625, 0.3125, -0.1875]
];

/**
 * The share card: the mark alone, lit like a screen in a dark room.
 *
 * No text on it. The words come from the link's own title and description,
 * which every messenger draws beside the picture — and drawing them here would
 * mean a font renderer, which is a great deal of machinery for a line that
 * would be repeated underneath anyway.
 *
 * Written as a file rather than generated by next/og: that route failed to
 * build at all here, and a share card that only exists if a font loads at
 * request time is a share card that will one day silently stop existing.
 */
export function renderCard(width, height) {
  const pixels = Buffer.alloc(width * height * 4);
  // Big enough to carry the card, small enough to leave the frame breathing.
  const box = Math.round(Math.min(width, height) * 0.42);
  const left = (width - box) / 2;
  const top = (height - box) / 2 - height * 0.04;
  // The glow sits above centre, where a projector beam would land.
  const glow = { x: width / 2, y: height * 0.36, r: Math.max(width, height) * 0.62 };

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const offset = (py * width + px) * 4;

      const distance = Math.hypot(px + 0.5 - glow.x, py + 0.5 - glow.y) / glow.r;
      const lift = Math.max(0, 1 - distance) ** 2;
      const noise = BAYER[py % 4][px % 4];
      let colour = INK_RGB.map((channel, index) =>
        Math.round(channel + (VELVET_RGB[index] - channel) * lift + noise)
      );

      // The rule under the mark, echoing the marquee border used on headings.
      const ruleTop = top + box + height * 0.07;
      if (py >= ruleTop && py < ruleTop + 4 && Math.abs(px - width / 2) < width * 0.13) {
        const fade = 1 - Math.abs(px - width / 2) / (width * 0.13);
        colour = colour.map((channel, index) => Math.round(channel + (GOLD_RGB[index] - channel) * fade * 0.8));
      }

      // The mark itself, supersampled against the background already laid down.
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = ((px + (sx + 0.5) / SUPERSAMPLE - left) / box) * GRID;
          const y = ((py + (sy + 0.5) / SUPERSAMPLE - top) / box) * GRID;
          if (x < 0 || y < 0 || x > GRID || y > GRID) continue;
          const inside = sample(x, y, 0);
          if (!inside) continue;
          r += inside[0];
          g += inside[1];
          b += inside[2];
          covered++;
        }
      }

      if (covered) {
        const total = SUPERSAMPLE * SUPERSAMPLE;
        const alpha = covered / total;
        const markColour = [r / covered, g / covered, b / covered];
        colour = colour.map((channel, index) => Math.round(channel * (1 - alpha) + markColour[index] * alpha));
      }

      pixels[offset] = colour[0];
      pixels[offset + 1] = colour[1];
      pixels[offset + 2] = colour[2];
      pixels[offset + 3] = 255;
    }
  }

  return encode(width, height, pixels);
}

/** The same mark as SVG. `panel` draws the dark rounded backing behind it. */
export function renderSvg({ panel = true, colour = GOLD } = {}) {
  const arcHalfWidth = Math.sqrt(ARC.r ** 2 - (ARC.cy - ARC.bottom) ** 2);
  const seats = SEATS.lefts
    .map(left => `<rect x="${left}" y="${SEATS.top}" width="${SEATS.width}" height="${SEATS.bottom - SEATS.top}" rx="${SEATS.radius}"/>`)
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}">
  ${panel ? `<rect width="${GRID}" height="${GRID}" rx="${CORNER}" fill="${INK}"/>` : ""}
  <path d="M ${(ARC.cx - arcHalfWidth).toFixed(1)} ${ARC.bottom} A ${ARC.r} ${ARC.r} 0 0 1 ${(ARC.cx + arcHalfWidth).toFixed(1)} ${ARC.bottom}" stroke="${colour}" stroke-width="${ARC.half * 2}" stroke-linecap="round" fill="none" opacity="${ARC.dim}"/>
  <g fill="${colour}">
    ${seats}
    <rect x="${ROW.x0}" y="${ROW.y0}" width="${ROW.x1 - ROW.x0}" height="${ROW.y1 - ROW.y0}" rx="${ROW.radius}"/>
  </g>
</svg>
`;
}
