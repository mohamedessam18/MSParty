import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderCard, renderPng, renderSvg } from "./mark.mjs";

/**
 * Writes every rendering of the mark, from the one drawing in mark.mjs.
 *
 *   node tools/draw.mjs
 *
 * Run it after changing the geometry. Nothing here is generated at build time
 * on purpose: the outputs are committed, so a deploy never depends on a
 * rasteriser and the files can be looked at in a pull request.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** [path relative to the repo, size in pixels] */
const PNGS = [
  // The browser's toolbar and the extension listing.
  ["apps/extension/src/icons/icon-16.png", 16],
  ["apps/extension/src/icons/icon-32.png", 32],
  ["apps/extension/src/icons/icon-48.png", 48],
  ["apps/extension/src/icons/icon-128.png", 128],
  ["apps/extension/src/icons/icon-512.png", 512],
  // iOS uses this when the site is added to the home screen, which is also the
  // only way web push works there at all.
  ["apps/web/app/apple-icon.png", 180],
  // Declared by the web manifest for installed shortcuts.
  ["apps/web/public/icon-192.png", 192],
  ["apps/web/public/icon-512.png", 512]
];

const SVGS = [["apps/web/app/icon.svg", { panel: true }]];

for (const [path, size] of PNGS) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderPng(size));
}

for (const [path, options] of SVGS) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, renderSvg(options));
}

// The card every messenger draws beside a shared link. Next picks these up by
// filename; the .alt.txt beside it becomes the image's alt text.
writeFileSync(join(root, "apps/web/app/opengraph-image.png"), renderCard(1200, 630));
writeFileSync(join(root, "apps/web/app/opengraph-image.alt.txt"), "MSParty — اتفرجوا سوا\n");

console.log(`drew ${PNGS.length} PNGs, ${SVGS.length} SVG and the share card from tools/mark.mjs`);
