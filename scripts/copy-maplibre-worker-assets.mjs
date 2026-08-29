// RYVO PATCH V5 03: maplibre-gl's tile-parsing Web Worker (maplibre-gl-worker.mjs) has a static
// sibling import, `from "./maplibre-gl-shared.mjs"`, that expects both files to sit next to each
// other at the SAME relative path they occupy inside node_modules/maplibre-gl/dist. Vite's build
// can't discover or bundle either file on its own -- the worker is instantiated via a runtime
// string template MapLibre builds internally (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`),
// not a literal Vite's static-worker analysis can trace -- so both are copied here, verbatim and
// unhashed, into public/ (which Vite/Capacitor serve as-is from the app root) so the worker's own
// unprocessed `from "./maplibre-gl-shared.mjs"` resolves correctly at runtime. Confirmed on-device
// that skipping this (or hashing just one of the pair via a `?url` import) leaves the map
// permanently blank: style/background render, but the vector tile source never loads, with no
// thrown error anywhere -- the worker fails silently trying to import its missing sibling.
//
// Runs automatically before every `build`/`dev` (see package.json) so this survives a maplibre-gl
// version bump without needing to remember a manual copy step.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'node_modules', 'maplibre-gl', 'dist');
const destDir = join(root, 'public');

const files = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'];

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

for (const file of files) {
  const src = join(srcDir, file);
  const dest = join(destDir, file);
  if (!existsSync(src)) {
    console.error(`[copy-maplibre-worker-assets] Missing expected file: ${src}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
}

console.log(`[copy-maplibre-worker-assets] Copied ${files.join(', ')} into public/`);
