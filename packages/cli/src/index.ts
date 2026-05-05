// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/cli` — CLI for the Browsonic SDK. Today's surface is
 * `browsonic upload-sourcemaps`, which walks a dist tree and posts
 * every `.map` file to the ingest endpoint described in
 * `docs/design/SOURCEMAP_PIPELINE.md`.
 *
 * The library export (this `index.ts`) lets consumers run the
 * commands programmatically — e.g. from a custom CI step or a
 * bundler plugin (`@browsonic/build-tools`'s webpack / vite /
 * rollup plugins are thin wrappers over this surface).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export {
  parseCliArgs,
  ArgsError,
  USAGE,
  USAGE_UPLOAD_SOURCEMAPS,
} from "./args.js";
export type {
  Args,
  UploadSourcemapsArgs,
  HelpArgs,
  VersionArgs,
  Env,
} from "./args.js";
export {
  runUploadSourcemaps,
  type UploadSourcemapsRunResult,
  type UploadSourcemapsLogger,
} from "./commands/upload-sourcemaps.js";
export {
  uploadOne,
  uploadOneDryRun,
  UploadError,
  type UploadOptions,
  type UploadResult,
} from "./upload.js";
export { discoverSourceMaps, relativeFilenameForUpload } from "./walk.js";

/**
 * The CLI's published version. Hard-coded here because the bin
 * entry needs to print it without reading `package.json` at
 * runtime (would force a JSON import + bundling complexity for
 * little value). semantic-release rewrites this string at publish
 * time via the `versionScripts` hook.
 */
export const CLI_VERSION = "0.1.0";
