import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Draws the extension's icon: a row of cinema seats under the glow of a screen,
 * the same mark the website uses. Kept as a script rather than checked-in
 * binaries so the shape can be adjusted without a design tool — re-run after
 * changing anything here, then `node build.mjs`.
 *
 * Geometry matches apps/web/app/icon.svg on the same 64-unit grid. Change one,
 * change the other, or the tab and the toolbar stop looking like one product.
 */

const INK = [0x14, 0x0a, 0x0d];
const GOLD = [0xc9, 0xa2, 0x27];

/** Renders 4x and averages down. Every edge here is a curve or a diagonal, and
 *  all of them look chewed without it. */
const SUPERSAMPLE = 4;

/** Signed distance to a rounded rectangle, in 64-unit coordinates. */
function roundedRect(x, y, x0, y0, x1, y1, radius) {
  const halfWidth = (x1 - x0) / 2;
  const halfHeight = (y1 - y0) / 2;
  const dx = Math.abs(x - (x0 + halfWidth)) - (halfWidth - radius);
  const dy = Math.abs(y - (y0 + halfHeight)) - (halfHeight - radius);
  return Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0) - radius;
}

/**
 * The mark. `weight` fattens the strokes at small sizes: a shape scaled down
 * proportionally disappears long before the grid runs out of pixels.
 */
function sample(x, y, weight) {
  if (roundedRect(x, y, 0, 0, 64, 64, 15) > 0) return null;

  // The screen: an arc of a circle centred below the frame, so the curve is
  // shallow and reads as a wide screen rather than a rainbow.
  const fromCentre = Math.hypot(x - 32, y - 42);
  if (y < 28 && Math.abs(fromCentre - 28) < 2.5 + weight) {
    // Dimmer than the seats — it is the light they are facing, not the subject.
    // Not much dimmer: below about a third of the way to the background it
    // stops registering at all once the icon is 16 pixels across.
    return GOLD.map((channel, index) => Math.round(channel * 0.72 + INK[index] * 0.28));
  }

  // Three seat backs and the row they sit in. Gaps grow with weight so the
  // seats stay three things rather than merging into one bar.
  const gap = weight / 2;
  for (const left of [10, 26, 42]) {
    if (roundedRect(x, y, left + gap, 32 - weight, left + 12 - gap, 46, 5) <= 0) return GOLD;
  }
  if (roundedRect(x, y, 8, 44 - weight, 56, 49, 2.5) <= 0) return GOLD;

  return INK;
}

function render(size) {
  // Below 32px the arc is a single pixel and the gaps are sub-pixel; both need
  // the extra half-unit to survive the downsample.
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
          const x = ((px * SUPERSAMPLE + sx + 0.5) / scale) * 64;
          const y = ((py * SUPERSAMPLE + sy + 0.5) / scale) * 64;
          const colour = sample(x, y, weight);
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

  return pixels;
}

function chunk(type, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(typed) >>> 0);
  return Buffer.concat([length, typed, check]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // truecolour with alpha
  // compression, filter and interlace methods each have exactly one legal value

  // Every scanline carries its filter type; 0 means the bytes stand as they are.
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let row = 0; row < size; row++) {
    raw[row * stride] = 0;
    pixels.copy(raw, row * stride + 1, row * size * 4, (row + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// 16/32/48/128 are the browser's; 512 is what the store listing wants.
const SIZES = [16, 32, 48, 128, 512];

mkdirSync("src/icons", { recursive: true });
for (const size of SIZES) {
  writeFileSync(`src/icons/icon-${size}.png`, png(size, render(size)));
}
console.log(`drew ${SIZES.length} icons: ${SIZES.map(size => `${size}px`).join(", ")}`);
