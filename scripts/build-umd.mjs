/**
 * Build a UMD bundle for CDN / <script> tag usage.
 *
 * Why:
 *   The ESM + CJS outputs ship via npm. Some host environments — server-
 *   rendered marketing pages, legacy CMS themes, experimental A/B containers,
 *   Squarespace / Shopify / WordPress theme editors — can only load a single
 *   <script> file from a CDN. This target covers them.
 *
 *   jsDelivr does NOT proxy GitHub Packages, so the canonical distribution
 *   path for UMD builds is a GitHub Release asset or a customer-owned CDN
 *   origin. See docs/INTEGRATION.md for the "Script tag usage" section.
 *
 * Output:
 *   dist/umd/browsonic.js           — readable, sourcemap (debug)
 *   dist/umd/browsonic.js.map
 *   dist/umd/browsonic.min.js       — minified, sourcemap (production)
 *   dist/umd/browsonic.min.js.map
 *
 * Global:
 *   The bundle exposes `window.Browsonic` with the same named exports as
 *   the npm package's main entry — `{ Browsonic, getBrowsonic, resetBrowsonic,
 *   createTelemetryStore, ... }`. The default export (singleton getter) is
 *   available as `window.Browsonic.default`.
 *
 * Usage:
 *   <script src="https://your-cdn.example.com/browsonic.min.js"></script>
 *   <script>
 *     const sdk = window.Browsonic.getBrowsonic();
 *     sdk.init({ apiEndpoint: '…', appKey: '…' });
 *   </script>
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUT_DIR = resolve(ROOT, 'dist/umd');

await mkdir(OUT_DIR, { recursive: true });

/**
 * esbuild emits an IIFE as `var Browsonic = (() => { … })();` which is
 * already window-scoped. To make it true UMD (AMD + CJS + global) we wrap
 * the IIFE in a tiny UMD preamble/postscript via `banner` + `footer`.
 *
 * The IIFE is assigned to `__browsonic_iife__` via `globalName`, then the
 * footer remaps it to `Browsonic` on window / module.exports / AMD define.
 */
const UMD_BANNER = `(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Browsonic = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {`;

const UMD_FOOTER = `  return __browsonic_iife__;
}));`;

const COMMON = {
  entryPoints: [resolve(ROOT, 'src/index.ts')],
  bundle: true,
  platform: 'browser',
  target: 'es2018', // wider compatibility for CDN consumers
  format: 'iife',
  globalName: '__browsonic_iife__',
  sourcemap: true,
  banner: { js: UMD_BANNER },
  footer: { js: UMD_FOOTER },
  logLevel: 'info',
};

await build({
  ...COMMON,
  outfile: resolve(OUT_DIR, 'browsonic.js'),
  minify: false,
});

await build({
  ...COMMON,
  outfile: resolve(OUT_DIR, 'browsonic.min.js'),
  minify: true,
});

console.log('[build-umd] done →', OUT_DIR);
