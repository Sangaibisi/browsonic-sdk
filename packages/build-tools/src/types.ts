// SPDX-License-Identifier: Apache-2.0

/**
 * Common options for every Browsonic source-map plugin (Vite,
 * Webpack, Rollup, esbuild).
 *
 * Required:
 *   - `appKey` — the application key as configured in the Browsonic
 *     dashboard. Plugins do NOT fall back to env for this; every
 *     team has multiple apps and a misconfigured env on CI silently
 *     misroutes uploads.
 *
 * Falls back to env when omitted:
 *   - `release` — `BROWSONIC_RELEASE` → git short-sha → package.json
 *     `version` → throw.
 *   - `token` — `BROWSONIC_SOURCEMAP_TOKEN`. If missing, the plugin
 *     prints a warning and skips upload (does not break the build).
 *   - `baseUrl` — `BROWSONIC_API_ENDPOINT` → `https://api.browsonic.io`.
 *
 * Defaults:
 *   - `distPath` — auto-detected from the bundler's own output
 *     option, falling back to `dist`.
 *   - `dryRun` — `false`.
 *   - `bailOnError` — `false`. Sourcemap upload MUST NOT break the
 *     build by default; CI surfaces missing maps via the next
 *     symbolicate attempt instead.
 *   - `silent` — `false`.
 */
export interface BrowsonicSourceMapsOptions {
  appKey: string;
  release?: string;
  token?: string;
  baseUrl?: string;
  distPath?: string;
  dist?: string;
  dryRun?: boolean;
  bailOnError?: boolean;
  silent?: boolean;
}
