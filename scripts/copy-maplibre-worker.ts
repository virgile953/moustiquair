/**
 * Copy MapLibre's bundled web worker into `public/`.
 *
 * Why is this needed?
 * MapLibre moves all heavy tile/geometry processing into a Web Worker. Its
 * default detection of the worker file relies on bundler-specific module URLs.
 * Turbopack (used by `next dev` and `next build`) does not emit that file in a
 * location the browser can load, which produces:
 *
 *   "Worker failed to load. Check that the worker URL is correct."
 *
 * Serving the official worker as a static file and calling
 * `maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs")` makes the setup
 * explicit and works the same in development and production.
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SOURCE = join(process.cwd(), "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const TARGET_DIR = join(process.cwd(), "public", "vendor");
const TARGET = join(TARGET_DIR, "maplibre-gl-worker.mjs");

const sourceFile = Bun.file(SOURCE);
if (!(await sourceFile.exists())) {
  console.error("[maplibre] Worker introuvable. Lancez d'abord `bun install`.");
  process.exit(1);
}

await mkdir(TARGET_DIR, { recursive: true });
await Bun.write(TARGET, sourceFile);

console.log("[maplibre] Worker copié vers public/vendor/maplibre-gl-worker.mjs");
