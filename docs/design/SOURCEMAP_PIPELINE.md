# Source-map pipeline — design (v0.1 implemented 2026-05-06)

> **Status:** **v0.1 shipped 2026-05-06** across `browsonic-sdk`
> (`@browsonic/cli` + `@browsonic/build-tools`), `browsonic-service`
> (`POST /v1/sourcemaps` + `POST /v1/symbolicate`, Flyway V18
> `sourcemap_uploads` table, custom Java VLQ decoder),
> `browsonic-dashboard` (SourceMapsPage rebuild + EventDetail
> symbolicate flow), and `browsonic-compose` (MinIO bucket auto-init
>
> - S3 env contract). End-to-end pipeline live.
>
> **Deferred to v0.2:** admin surface polish — token CRUD endpoints
> and id-keyed list/delete on `sourcemap_uploads`. Tracked in
> `ROADMAP.md`.
>
> **Queued for SDK 1.x:** in-bundle `debugId` injection so events can
> be matched to a sourcemap without relying on the operator-supplied
> release tag.
>
> **Last updated:** 2026-05-06

---

## Why this work matters

Browsonic captures stack frames from minified production bundles —
file names like `https://app.example.com/_next/static/chunks/abc123.js`,
line numbers in the 50,000s. Operators reading those frames in the
dashboard see opaque coordinates without source-map symbolication.
Every other browser observability product (Sentry, TrackJS, Bugsnag,
Rollbar) ships some flavour of sourcemap upload + ingest-side
symbolication.

With this pipeline live:

- Every dashboard stack-frame view shows the original `.ts` / `.tsx`
  / `.svelte` line — not `chunks/abc123.js:1`.
- Release attribution becomes meaningful: the dashboard groups events
  by `release` tag and surfaces "this bug only exists in v2.4.1
  onwards".
- Source-map upload is gated by app key + a separate scoped token,
  so source code never leaks even if read-only API keys are
  compromised.

## Non-goals (explicit)

- **Live source upload from the SDK at runtime.** Source maps are
  build-time artefacts; uploading from the running browser would be
  a privacy disaster.
- **Server-side runtime instrumentation.** Already documented as
  out of scope across the adapter ROADMAPs.
- **Symbolication at ingest time.** Ingest-side symbolication was
  considered and rejected (see "Symbolication strategy" below).
  Symbolicate lazily at dashboard read time.
- **Hosting consumer source code.** We index source maps to look up
  original positions; we don't re-host the application source for
  customer consumption.

---

## Architecture overview

```
[ Build pipeline ]                    [ Browsonic backend ]

  ┌─────────────┐                       ┌──────────────────┐
  │ Bundler     │  webpack / vite /     │  /v1/sourcemaps  │
  │ output:     │──┐  rollup / esbuild  │   ingest         │
  │ chunks/*.js │  │  (or @browsonic/   │                  │
  │ chunks/*.js │  │   cli)             │  ┌─ S3 / R2 /  ┐ │
  │ .map        │  │                    │  │ MinIO       │ │
  └─────────────┘  │  multipart upload  │  │ object store│ │
                   ├──────────────────► │  └─────────────┘ │
                   │  POST              │                  │
                   │  Authorization:    │  ┌─ Postgres ──┐ │
                   │   Bearer <token>   │  │ sourcemap_  │ │
                   │  Form fields:      │  │ uploads     │ │
                   │   release          │  └─────────────┘ │
                   │   filename         │                  │
                   │   appKey           │                  │
                   │   sourcemap (file) │                  │
                   └────────────────────┘                  │

[ Dashboard event detail ]            [ Symbolication query path ]

  User opens an event ───► Dashboard ─►/v1/symbolicate ─► fetch
                                       (release, frames)   sourcemap
                                                           from object
                                                           store, run
                                                           VLQ decoder,
                                                           return
                                                           original line
                                                           + column +
                                                           source URL
```

The pipeline is **strictly additive** — events with no matching
release upload symbolicate to verbatim minified frames (the
pre-pipeline behaviour). Adopting sourcemap upload is opt-in per
app.

---

## Component breakdown

### 1. Build-time CLI / bundler plugins

Two surfaces over one engine, mirroring the pattern Sentry already
established. Both are dependency-free at runtime — Node 20+ built-ins
only (`fetch`, `FormData`, `Blob`, `parseArgs`, `fs/promises`).

- **`@browsonic/cli`** — published package. Single command:
  `browsonic upload-sourcemaps --release v1.2.3 --dist-path ./dist
--token "$BROWSONIC_SOURCEMAP_TOKEN" --app-key "$BROWSONIC_APP_KEY"`.
  Walks the dist tree, finds every `.map` file, POSTs to the ingest.
  Idempotent — duplicate uploads of the same `(release, filename)`
  return 200 / 409 without re-storing.
- **`@browsonic/build-tools`** — bundler plugins, one subpath each:
  - `@browsonic/build-tools/vite` — Vite plugin (hooks `closeBundle`).
  - `@browsonic/build-tools/webpack` — `BrowsonicSourceMapsPlugin`
    (hooks `afterEmit`).
  - `@browsonic/build-tools/rollup` — Rollup plugin (hooks
    `writeBundle`).
  - `@browsonic/build-tools/esbuild` — esbuild plugin (hooks `onEnd`).

  All four are thin wrappers over the CLI's HTTP client via
  `runUploadFromOptions`. Each plugin defines a structural type for
  its bundler's hook surface so `@browsonic/build-tools` does **not**
  pull vite / webpack / rollup / esbuild as dependencies.

#### Plugin option surface

`BrowsonicSourceMapsOptions` is shared across all four plugins:

- `appKey` is **required** and has no env fallback. Multi-app teams
  silently misroute uploads when env-only fallback is allowed; we
  force the value to live in build config.
- `release` falls back to `BROWSONIC_RELEASE` → git short-sha →
  `package.json` `version` → throw (`deriveRelease`).
- `token` falls back to `BROWSONIC_SOURCEMAP_TOKEN`. **Missing token
  is a warning, not a failure** — sourcemap upload must never break
  the consumer's build.
- `baseUrl` falls back to `BROWSONIC_API_ENDPOINT` →
  `https://api.browsonic.io`.
- `bailOnError` defaults to `false`. Per-file errors are logged and
  the build continues.
- `silent`, `dryRun`, `dist`, `distPath` round out the surface.

#### CLI failure modes

| Failure             | Exit code | Message                                                                        |
| ------------------- | --------- | ------------------------------------------------------------------------------ |
| Missing `--app-key` | 2         | Tells the caller to set `BROWSONIC_APP_KEY`                                    |
| Missing `--token`   | 2         | Tells the caller about the scoped token (separate from API key)                |
| 401 / 403           | 3         | Token doesn't have sourcemap-upload scope                                      |
| 413                 | 4         | Sourcemap exceeded ingest size limit (default 50 MB; configurable per project) |
| 5xx                 | 5         | Service unavailable; CI should retry                                           |
| Per-file failure    | 1         | At least one upload failed; aggregate count printed                            |

### 2. Service ingest endpoint

`POST /v1/sourcemaps` — multipart/form-data:

| Field       | Type   | Required | Notes                                                        |
| ----------- | ------ | -------- | ------------------------------------------------------------ |
| `release`   | string | yes      | Free-form tag matching the SDK's `BrowsonicConfig.release`   |
| `filename`  | string | yes      | URL or path the runtime will report                          |
| `appKey`    | string | yes      | Project identifier from the dashboard                        |
| `sourcemap` | file   | yes      | The `.map` content; up to 50 MB default                      |
| `dist`      | string | no       | Distribution discriminator (e.g. `esm`/`cjs`); rarely needed |

Response:

```json
{
  "id": "sm_01HZ...",
  "release": "v1.2.3",
  "filename": "/_next/static/chunks/abc123.js",
  "uploadedAt": "2026-05-05T10:00:00Z"
}
```

Auth: `Authorization: Bearer <SOURCEMAP_UPLOAD_TOKEN>` — separate
from the public app key. Issued per-app from the dashboard's
SourceMaps page.

Storage: object store (S3 / R2 / MinIO depending on deploy). Keyed
by `(tenant_id, app_id, release, filename)`. Postgres table
`sourcemap_uploads` (Flyway V18) carries the metadata + storage URI.

### 3. Symbolication query path

The dashboard's event-detail page renders a stack frame list. With
the sourcemap pipeline:

1. Frontend issues `POST /v1/symbolicate` with the event's `release`
   tag + the array of `{ filename, line, column }` frames.
2. Backend looks up the sourcemap by `(release, filename)`, fetches
   from object store (cached for 1 h via Redis).
3. Runs the custom Java VLQ decoder for each frame.
4. Returns `{ source, line, column, name, sourceContent? }` per
   frame.

Symbolication is **lazy**: never run at ingest time. Hot events
(opened multiple times) hit the cache; cold events take ~30 ms
extra on the dashboard's first render. Trade-off: ingest stays
fast (single insert), and we don't pay symbolication cost for
events nobody ever looks at.

---

## Design decisions (rationale)

The decisions below were live questions during design; each is
captured for reference because the trade-offs still apply when we
pick up future work in this area.

### Token scope

Single sourcemap-upload token per app, used across all environments.
Simplest for consumers and matches Sentry's default. Per-environment
or per-release scoping was considered (and rejected) for v0.1 — the
blast-radius win is small relative to the CI ergonomics cost. Will
revisit if customer demand surfaces.

### Release-name format

Free-form opaque string. The convention (`v<semver>` or
`<commit-hash>`) is documented but not enforced. SDK-side `debugId`
injection (queued for 1.x) is the long-term answer to fragile
release-tag matching.

### Symbolication strategy

Dashboard read time only (lazy). Ingest stays free of sourcemap
dependencies. Hot events hit the Redis cache; cold events pay ~30 ms
on first open. Alternative — ingest-side symbolication — would have
inflated insert cost across all events, including those nobody ever
opens.

### Sourcemap retention

N-releases policy, configurable per app, default 50. Old sourcemaps
get an "archived" flag rather than immediate object-store deletion,
so a reopened incident can still symbolicate older releases for ~30
more days. TTL-based pruning was rejected because release cadence
varies by customer.

### Inline vs external sourcemaps

v0.1 supports **external `.map` files only** — the bundler default
across vite, webpack, rollup, and esbuild. Inline sourcemap
extraction (parsing `//# sourceMappingURL=data:...` from the bundle)
is on the backlog if hand-rolled webpack configs surface as a real
demand signal.

### Symbolication algorithm

Custom Java VLQ decoder server-side. Mozilla's `source-map` was
considered; we chose the in-house decoder because the service
runtime is Java and the JVM port of `source-map` adds a Node bridge
we'd otherwise not need. The decoder follows the Mozilla
specification and is covered by parity tests against known fixtures.

### Privacy / source-content embedding

Per-app setting; default "keep". Operators wanting stricter privacy
strip `sourcesContent` on the build-tool side before upload. We
considered stripping by default but the dashboard "view original
source" affordance is the headline UX win — defaulting it off would
hide the feature from operators who would benefit from it.

---

## Cross-repo touch points (recap)

The v0.1 ship landed across:

- **browsonic-service**: `sourcemap_uploads` Postgres table (Flyway
  V18), `POST /v1/sourcemaps` ingest endpoint, `POST /v1/symbolicate`
  read endpoint, scoped-token auth path, S3/R2/MinIO storage adapter,
  custom Java VLQ decoder.
- **browsonic-dashboard**: SourceMapsPage rebuild (upload-token
  display + uploads list); EventDetail symbolicate flow with "view
  original source" affordance when `sourcesContent` is available.
- **browsonic-compose**: MinIO container + bucket auto-init for
  self-hosted stacks; S3 env contract documented.
- **browsonic-sdk**: `@browsonic/cli` and `@browsonic/build-tools`
  packages published to npm with four bundler subpaths
  (vite/webpack/rollup/esbuild).

`@browsonic/nextjs`'s `withBrowsonicConfig` auto-registration of the
webpack plugin is **not** part of v0.1 — consumers explicitly
register `BrowsonicSourceMapsPlugin` in their next.config.js for now.
Auto-wire is queued for an `@browsonic/nextjs` minor.

---

## Acceptance criteria (v0.1)

The v0.1 closure was gated on:

1. `@browsonic/cli` published to npm + integrated in CI for at least
   one demo app. **DONE.**
2. A representative bundle (Next.js + Vite + Astro) all upload their
   sourcemaps successfully via the bundler plugin path. **DONE.**
3. The dashboard's event detail shows symbolicated frames for events
   tagged with a release that has uploaded sourcemaps. **DONE.**
4. Symbolication latency p95 ≤ 100 ms (cold), ≤ 5 ms (warm cache).
   **DONE.**
5. Token rotation playbook for sourcemap-upload tokens lives in the
   npm publish reference doc. **DONE.**
6. End-to-end smoke test in CI uploads a sample sourcemap, sends an
   event with a matching release, and asserts the dashboard API
   returns symbolicated frames. **DONE.**

## v0.2 backlog

- Token CRUD endpoints (`POST/PATCH/DELETE /v1/sourcemap-tokens`)
  with id-keyed list/delete.
- Dashboard SourceMapsPage refactor to operate on token ids rather
  than name lookup.
- `@browsonic/nextjs` `withBrowsonicConfig` auto-registration of the
  webpack plugin.

## SDK 1.x backlog

- In-bundle `debugId` injection at build time so events match a
  sourcemap without depending on operator-supplied release tags.
- Inline sourcemap extraction (`data:` URI in the bundle) in
  `@browsonic/build-tools`, gated on real customer demand.
