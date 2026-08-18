import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

/**
 * Draws the extension's icon at every size the store and the browser ask for.
 *
 * Generated rather than checked in as binaries: the mark is three shapes and
 * two brand colours, so a script that renders it is easier to adjust than a set
 * of PNGs nobody can edit without a design tool. Re-run after changing either.
 *
 *   node make-icons.mjs
 */

const INK = [0x14, 0x0a, 0x0d];
const GOLD = [0xc9, 0xa2, 0x27];
const GOLD_LIT = [0xe8, 0xc2, 0x50];

/** Renders 4x and averages down; the mark is all curves and one diagonal, and
 *  every one of them looks broken without it. */
const SUPERSAMPLE = 4;

/** Signed distance to a rounded rectangle, in normalised units. */
function roundedRect(x, y, radius) {
  const dx = Math.abs(x - 0.5) - (0.5 - radius);
  const dy = Math.abs(y - 0.5) - (0.5 - radius);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - radius;
}

function inTriangle(x, y, points) {
  const sign = (ax, ay, bx, by, cx, cy) => (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const [[x1, y1], [x2, y2], [x3, y3]] = points;
  const d1 = sign(x, y, x1, y1, x2, y2);
  const d2 = sign(x, y, x2, y2, x3, y3);
  const d3 = sign(x, y, x3, y3, x1, y1);
  const negative = d1 < 0 || d2 < 0 || d3 < 0;
  const positive = d1 > 0 || d2 > 0 || d3 > 0;
  return !(negative && positive);
}

/**
 * The mark: a dark marquee panel, a gold ring around it, and a play triangle.
 * Everything is sized so the ring survives as a single pixel at 16px rather
 * than dissolving into the background.
 */
function sample(x, y, small) {
  if (roundedRect(x, y, 0.24) > 0) return null;

  const radius = Math.hypot(x - 0.5, y - 0.5);
  // The ring thins at small sizes; a proportional one would vanish.
  const thickness = small ? 0.055 : 0.045;
  if (radius < 0.38 && radius > 0.38 - thickness) return GOLD;

  // Nudged right of centre: a triangle balanced on its bounding box reads as
  // sitting too far left, because its mass is not where its box is.
  if (inTriangle(x, y, [[0.415, 0.315], [0.415, 0.685], [0.70, 0.5]])) {
    return small ? GOLD : GOLD_LIT;
  }

  return INK;
}

function render(size) {
  const small = size <= 32;
  const scale = size * SUPERSAMPLE;
  const pixels = Buffer.alloc(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px * SUPERSAMPLE + sx + 0.5) / scale;
          const y = (py * SUPERSAMPLE + sy + 0.5) / scale;
          const colour = sample(x, y, small);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          a += 255;
        }
      }

      const taken = SUPERSAMPLE * SUPERSAMPLE;
      const offset = (py * size + px) * 4;
      // Divided by the samples that landed on the shape, not by all of them:
      // averaging in the transparent ones darkens every edge into a halo.
      const hit = a / 255 || 1;
      pixels[offset] = Math.round(r / hit);
      pixels[offset + 1] = Math.round(g / hit);
      pixels[offset + 2] = Math.round(b / hit);
      pixels[offset + 3] = Math.round(a / taken);
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
  // compression, filter and interlace methods all have exactly one legal value

  // Each scanline carries its filter type; 0 means the bytes are as they are.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let row = 0; row < size; row++) {
    raw[row * (size * 4 + 1)] = 0;
    pixels.copy(raw, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// 16/48/128 are the browser's; 512 is what the store listing wants.
const SIZES = [16, 32, 48, 128, 512];

mkdirSync("src/icons", { recursive: true });
for (const size of SIZES) {
  writeFileSync(`src/icons/icon-${size}.png`, png(size, render(size)));
}
console.log(`drew ${SIZES.length} icons: ${SIZES.map(size => `${size}px`).join(", ")}`);
