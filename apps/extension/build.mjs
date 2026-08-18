import { copyFileSync, mkdirSync } from "node:fs";
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

mkdirSync("dist", { recursive: true });

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

console.log(`assembled dist/ (${ENTRIES.length} scripts, ${STATIC.length} static files)`);
