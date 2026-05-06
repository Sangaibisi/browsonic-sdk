# @browsonic/build-tools

Bundler plugins for uploading source maps to Browsonic. Drop one into your build pipeline and every release ships with symbolicated stack traces.

Apache-2.0. Part of the [Browsonic SDK monorepo](https://github.com/Sangaibisi/browsonic-sdk).

## Why

Browsonic ingests source maps via [`@browsonic/cli`](../cli) (`browsonic upload-sourcemaps`). The CLI is fine in CI scripts, but most teams already have a bundler — Vite, Webpack, Rollup, or esbuild — running. This package wraps the CLI as a bundler plugin so the upload happens automatically as part of `npm run build`. No extra CI step, no version-drift between `<release>` and what was built.

The plugins are zero-runtime in your bundle: they only fire after the build is written to disk. Source-map upload is configured to **never break the build by default** — a missing `BROWSONIC_SOURCEMAP_TOKEN` or a transient ingest 5xx logs a warning and the build continues.

## Install

```bash
npm install --save-dev @browsonic/build-tools
```

The bundler itself is a peer dependency — install whichever one your project uses (`vite`, `webpack`, `rollup`, `esbuild`). The plugin's import path determines which bundler hook it targets, so you only get the code for what you actually use.

## Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import browsonicSourceMaps from "@browsonic/build-tools/vite";

export default defineConfig({
  build: { sourcemap: "hidden" }, // emit .map files without sourceMappingURL
  plugins: [browsonicSourceMaps({ appKey: "web" })],
});
```

`build.sourcemap: 'hidden'` is the recommended setting: production assets do not advertise the source maps to end users, but the `.map` files are still written to disk where the plugin picks them up.

## Webpack

```js
// webpack.config.js
import { BrowsonicSourceMapsPlugin } from "@browsonic/build-tools/webpack";

export default {
  devtool: "hidden-source-map",
  plugins: [new BrowsonicSourceMapsPlugin({ appKey: "web" })],
};
```

`devtool: 'hidden-source-map'` strips the `sourceMappingURL` comment from the bundle so the maps stay private.

## Rollup

```js
// rollup.config.js
import browsonicSourceMaps from "@browsonic/build-tools/rollup";

export default {
  output: { dir: "dist", sourcemap: "hidden" },
  plugins: [browsonicSourceMaps({ appKey: "web" })],
};
```

## esbuild

```js
import { build } from "esbuild";
import browsonicSourceMaps from "@browsonic/build-tools/esbuild";

await build({
  entryPoints: ["src/index.ts"],
  outdir: "dist",
  sourcemap: "external",
  plugins: [browsonicSourceMaps({ appKey: "web" })],
});
```

esbuild's plugin model fires `onEnd` after every build — in watch mode that means an upload per rebuild. Either skip the plugin in dev configs or pass `dryRun: true`.

## Options

| Option        | Type      | Default                                       | Description                                                                                  |
| ------------- | --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `appKey`      | `string`  | (required)                                    | The application key from the Browsonic dashboard.                                            |
| `release`     | `string`  | env → git short-sha → `package.json` version  | Release identifier. Falls back through that chain when omitted.                              |
| `token`       | `string`  | `BROWSONIC_SOURCEMAP_TOKEN`                   | Bearer token. Generated per-app in the dashboard's Source Maps page.                         |
| `baseUrl`     | `string`  | `BROWSONIC_API_ENDPOINT` → `api.browsonic.io` | Ingest endpoint base URL.                                                                    |
| `distPath`    | `string`  | (auto-detected from bundler)                  | Override the dist directory. Useful when the bundler's default differs from where maps land. |
| `dist`        | `string`  | (none)                                        | Distribution discriminator. Rare — typically only when shipping multiple artefact variants.  |
| `dryRun`      | `boolean` | `false`                                       | Walk + report without making the HTTP call. Handy for CI smoke tests.                        |
| `bailOnError` | `boolean` | `false`                                       | When `true`, throws on upload failure instead of warning.                                    |
| `silent`      | `boolean` | `false`                                       | Suppress all stdout/stderr output from the plugin.                                           |

## Environment variables

The plugin reads three env vars when the corresponding option is missing:

- `BROWSONIC_SOURCEMAP_TOKEN` — auth token. Without it, the plugin logs a warning and skips upload (build continues).
- `BROWSONIC_RELEASE` — release identifier. First in the fallback chain.
- `BROWSONIC_API_ENDPOINT` — ingest base URL. Defaults to `https://api.browsonic.io`.

## Programmatic API

If your build script doesn't fit any of the four bundler shapes, call the runner directly:

```ts
import { runUploadFromOptions, deriveRelease } from "@browsonic/build-tools";

await runUploadFromOptions({ appKey: "web" }, "dist");
```

The signature is `(options, distPath, cwd?)`. Same option type as the plugins; same env fallbacks.

## What this package does NOT do

- **Inject `debugId`s into bundle output.** Today's pipeline matches uploads by `(appKey, release, filename)`. Per-build `debugId` injection is on the v0.2 roadmap so the same release can ship multiple builds without overwriting maps; until then, treat `release` as the single key.
- **Strip the `sourceMappingURL` comment** itself — that's a bundler config (`sourcemap: 'hidden'` for Vite/Rollup, `devtool: 'hidden-source-map'` for Webpack). The plugin assumes the user has already chosen the right source-map mode.
- **Symbolicate locally.** Symbolication happens server-side in the Browsonic backend, lazily, when the dashboard renders an event. The plugin only ships the `.map` files; the backend reads them when needed.

## License

[Apache-2.0](../../LICENSE).
