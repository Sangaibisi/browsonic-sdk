/**
 * Build a browser-loadable SDK bundle for e2e perf fixtures.
 *
 * Why needed:
 *   The production tsc output (`dist/esm/index.js`) uses extension-less imports
 *   ("./sentinel" instead of "./sentinel.js"), which browsers cannot resolve
 *   natively. This script bundles the SDK into a single-file IIFE that the
 *   demo-app fixture can load via a plain <script> tag.
 *
 * Output:
 *   e2e/fixtures/demo-app/sdk.bundle.js        — non-minified (debug-friendly)
 *   e2e/fixtures/demo-app/sdk.bundle.min.js    — minified (size measurement)
 *
 * Not for production distribution — only for perf/test fixtures.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const COMMON = {
  entryPoints: [resolve(ROOT, 'src/index.ts')],
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  globalName: 'BrowsonicSDK',
  // Expose the default export (getBrowsonic) as window.BrowsonicSDK.default
  // and all named exports under window.BrowsonicSDK.*
  sourcemap: true,
  logLevel: 'info',
};

await build({
  ...COMMON,
  outfile: resolve(ROOT, 'e2e/fixtures/demo-app/sdk.bundle.js'),
  minify: false,
});

await build({
  ...COMMON,
  outfile: resolve(ROOT, 'e2e/fixtures/demo-app/sdk.bundle.min.js'),
  minify: true,
});

console.log('[build-e2e-bundle] done');
