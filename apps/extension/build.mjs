import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { build } from "esbuild";

/**
 * Bundles the extension and assembles dist/.
 *
 * A script rather than a shell one-liner because the copy step has to work on
 * Windows too: `cp a b dist/` is a Unix idiom that cmd.exe does not have at all
 * and PowerShell parses differently, so the old build line only ever ran on one
 * of the three shells this repo gets used from.
 */
const ENTRIES = ["background", "content-script", "popup", "netflix-page"];
const STATIC = ["manifest.json", "popup.html"];
/** The browser's three; 512 is for the store listing and does not ship. */
const ICONS = [16, 32, 48, 128];

mkdirSync("dist/icons", { recursive: true });

await build({
  entryPoints: ENTRIES.map(name => `src/${name}.ts`),
  outdir: "dist",
  bundle: true,
  // Extension pages have no module loader; each file has to stand alone.
  format: "iife",
  target: "chrome110",
  logLevel: "info"
});

for (const file of STATIC) copyFileSync(`src/${file}`, `dist/${file}`);

// Chrome refuses to load a manifest naming an icon that is not there, so say
// which one is missing rather than letting the browser report it as a whole
// broken extension.
for (const size of ICONS) {
  const icon = `icons/icon-${size}.png`;
  if (!existsSync(`src/${icon}`)) throw new Error(`${icon} is missing — run: node make-icons.mjs`);
  copyFileSync(`src/${icon}`, `dist/${icon}`);
}

console.log(`assembled dist/ (${ENTRIES.length} scripts, ${STATIC.length} static, ${ICONS.length} icons)`);
