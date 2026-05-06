// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/build-tools` — bundler plugins for uploading source
 * maps to Browsonic.
 *
 * Each bundler has its own subpath entry; consumers import directly
 * from the subpath their build pipeline uses:
 *
 * - `@browsonic/build-tools/vite` → Vite plugin
 * - `@browsonic/build-tools/webpack` → Webpack plugin
 * - `@browsonic/build-tools/rollup` → Rollup plugin
 * - `@browsonic/build-tools/esbuild` → esbuild plugin
 *
 * The aggregate entry (this file) re-exports the shared option type,
 * the release-derivation helper, and a programmatic upload runner so
 * consumers can wire uploads into custom build scripts without
 * depending on a bundler hook.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export type { BrowsonicSourceMapsOptions } from "./types.js";
export { deriveRelease } from "./derive-release.js";
export { runUploadFromOptions } from "./run-upload.js";
