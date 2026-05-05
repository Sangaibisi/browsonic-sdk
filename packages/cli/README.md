# @browsonic/cli

Command-line companion for the [Browsonic SDK](https://www.npmjs.com/package/@browsonic/sdk). Today's surface is sourcemap upload — walks a dist tree and POSTs every `.map` file to the ingest service. Future commands (release management, build-time event tagging) live behind the same `browsonic <command>` entry point.

> **Status:** 0.1 surface — `upload-sourcemaps` is feature-complete and ships a `--dry-run` mode for use before the ingest endpoint is live. Pure-TypeScript, zero npm runtime deps (uses Node 20+'s built-in `fetch` + `node:util.parseArgs`). The full pipeline architecture lives in [`docs/design/SOURCEMAP_PIPELINE.md`](https://github.com/Sangaibisi/browsonic-sdk/blob/main/docs/design/SOURCEMAP_PIPELINE.md).

## Install

```bash
# Per-project (recommended for CI)
npm install --save-dev @browsonic/cli

# Or run ad-hoc with npx
npx @browsonic/cli upload-sourcemaps --dist-path ./dist --release v1.2.3 --dry-run
```

Requires Node ≥ 20 (uses built-in `fetch` + `FormData`).

## Quickstart — `upload-sourcemaps`

Wire it into your CI's post-build step (or your bundler plugin):

```bash
BROWSONIC_API_ENDPOINT=https://ingest.browsonic.example.com \
BROWSONIC_APP_KEY=app_xyz \
BROWSONIC_SOURCEMAP_TOKEN=sm_abc \
npx browsonic upload-sourcemaps --dist-path ./dist --release "$GITHUB_SHA"
```

The CLI walks `./dist` recursively, finds every `*.map` file, and POSTs each to `<BROWSONIC_API_ENDPOINT>/v1/sourcemaps` with a `Bearer <BROWSONIC_SOURCEMAP_TOKEN>` header. The `release` tag must match the value you pass to the SDK's `BrowsonicConfig.release` so the dashboard's symbolicator can pair frames to maps.

Per-file progress lines stream as the upload runs:

```
[browsonic] upload-sourcemaps: 12 file(s) found under ./dist
  ✓ chunks/main.abc123.js.map (482103 bytes) → sm_01HZ8RVK...
  ✓ chunks/about.def456.js.map (102301 bytes) → sm_01HZ8RVL...
  ...
[browsonic] upload-sourcemaps: 12/12 succeeded
```

## Dry-run mode (use before the ingest endpoint is live)

The service-side `/v1/sourcemaps` ingest endpoint is part of the deferred Sprint 3 / Sprint 4 source-map pipeline (see the design doc). Until it ships, `--dry-run` lets you wire the CLI into your CI today and validate the discovery / payload-size / release-tag flow:

```bash
npx browsonic upload-sourcemaps --dist-path ./dist --release v1.2.3 --dry-run
```

Dry-run skips the actual HTTP call, prints a `would-have-uploaded` list with the same per-file format, and exits 0. Drop the `--dry-run` flag once the service endpoint goes live — the command shape doesn't change.

## Flags

| Flag                 | Required | Env                         | Description                                                            |
| -------------------- | -------- | --------------------------- | ---------------------------------------------------------------------- |
| `--dist-path <path>` | yes      | —                           | Directory to walk for `*.map` files (e.g. `./dist`).                   |
| `--release <tag>`    | yes      | —                           | Release tag matching the SDK's `BrowsonicConfig.release`.              |
| `--app-key <key>`    | yes      | `BROWSONIC_APP_KEY`         | App key from the Browsonic dashboard.                                  |
| `--token <token>`    | yes      | `BROWSONIC_SOURCEMAP_TOKEN` | Sourcemap-upload Bearer token.                                         |
| `--base-url <url>`   | yes      | `BROWSONIC_API_ENDPOINT`    | Ingest service base URL.                                               |
| `--dist <name>`      | no       | —                           | Distribution discriminator (rarely needed).                            |
| `--dry-run`          | no       | —                           | Skip the HTTP call; print would-have-uploaded list.                    |
| `--bail-on-error`    | no       | —                           | Abort batch on first per-file failure (default: continue + aggregate). |
| `-h`, `--help`       | no       | —                           | Print this help.                                                       |

Tokens passed via env vars never leak onto CI shell history. Mix-and-match (env var for `--token`, flag for `--release`) works fine.

## Exit codes

| Code | Meaning                                                                   |
| ---- | ------------------------------------------------------------------------- |
| `0`  | All files uploaded, or dry-run / help / version                           |
| `1`  | At least one file failed to upload (some succeeded)                       |
| `2`  | argv validation (bad / missing flag, dist-path doesn't exist)             |
| `3`  | HTTP auth failure (401 / 403) — token doesn't have sourcemap-upload scope |
| `4`  | HTTP payload-too-large (413) — sourcemap exceeded ingest size limit       |
| `5`  | HTTP transient failure (5xx) — caller should retry                        |

CI scripts can branch on these codes to decide whether to retry, page the on-call, or move on.

## Programmatic API

The CLI's commands are exposed as library functions for consumers building bundler plugins (the future `@browsonic/build-tools` package wraps this surface):

```ts
import { runUploadSourcemaps } from "@browsonic/cli";

await runUploadSourcemaps(
  {
    command: "upload-sourcemaps",
    distPath: "./dist",
    release: "v1.2.3",
    appKey: process.env.BROWSONIC_APP_KEY!,
    token: process.env.BROWSONIC_SOURCEMAP_TOKEN!,
    baseUrl: process.env.BROWSONIC_API_ENDPOINT!,
    dryRun: false,
    bailOnError: false,
  },
  {
    log: (m) => console.log(m),
    error: (m) => console.error(m),
  },
);
```

Lower-level building blocks (`uploadOne`, `discoverSourceMaps`, `relativeFilenameForUpload`) are also exported — see [`src/index.ts`](./src/index.ts).

## Defensive contract

- Per-file failures are aggregated by default — a single bad file doesn't abort the whole batch (`--bail-on-error` overrides). Final exit code reflects whether any failure occurred.
- Network errors include the HTTP status + filename in the error message so CI logs are actionable.
- The injectable `fetch` override (programmatic API only) makes integration testing painless — pass a stub instead of standing up a real ingest.

## What this package does NOT do (yet)

- **Bundler plugins.** The companion `@browsonic/build-tools` package will ship webpack / vite / rollup plugins that wrap this CLI — tracked alongside the rest of the source-map pipeline implementation.
- **Inline-sourcemap extraction.** Modern bundlers default to external `.map` files. If your config emits inline sourcemaps (`//# sourceMappingURL=data:...` at the end of the bundle), extract them to `.map` siblings before invoking the CLI. Native inline support is on the design doc's Q5 list.
- **Symbolication.** That happens server-side at dashboard query time; this CLI only uploads.
- **Self-hosted retention policies.** Sourcemap pruning lives on the service side (per-app `maxReleases` setting, per the design doc).

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and [`NOTICE`](../../NOTICE).
