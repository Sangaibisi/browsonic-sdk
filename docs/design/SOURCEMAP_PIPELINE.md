# Source-map pipeline — design draft

> **Status:** Draft — design review pending. Sprint S3 + S4 of the
> original 19-week plan deferred this work; this document captures
> the open design decisions so the reopen sprint can land
> implementation without re-deriving the architecture.
>
> **Last updated:** 2026-05-05
> **Owner (when scheduled):** SDK team + service team joint
> **Blocked by:** none — ready for design review

---

## Why this work matters

Browsonic captures stack frames from minified production bundles —
file names like `https://app.example.com/_next/static/chunks/abc123.js`,
line numbers in the 50,000s. Operators reading those frames in the
dashboard see opaque coordinates without source-map symbolication.
Every other browser observability product (Sentry, TrackJS, Bugsnag,
Rollbar) ships some flavour of sourcemap upload + ingest-side
symbolication. Browsonic's ingest currently stores frames verbatim;
the dashboard renders them verbatim.

This is the missing piece for production-grade triage. With this
pipeline:

- Every dashboard stack-frame view shows the original `.ts` / `.tsx`
  / `.svelte` line — not `chunks/abc123.js:1`.
- Release attribution becomes meaningful: the dashboard can group
  events by `release` tag and surface "this bug only exists in
  v2.4.1 onwards".
- Source-map upload is gated by app key + a separate scoped token,
  so source code never leaks even if read-only API keys are
  compromised.

## Non-goals (explicit)

- **Live source upload from the SDK at runtime.** Source maps are
  build-time artefacts; uploading from the running browser would be
  a privacy disaster.
- **Server-side runtime instrumentation.** Already documented as
  out of scope across the adapter ROADMAPs.
- **Symbolication at ingest time.** The original sprint plan briefly
  considered ingest-side symbolication and rejected it (see
  Open question 3 below). Symbolicate lazily at dashboard read time.
- **Hosting consumer source code.** We index source maps to look up
  original positions; we don't re-host the application source for
  customer consumption.

---

## Architecture overview

```
[ Build pipeline ]                    [ Browsonic backend ]

  ┌─────────────┐                       ┌──────────────────┐
  │ Bundler     │  webpack / vite /     │  /v1/sourcemaps  │
  │ output:     │──┐  rollup plugin     │   ingest         │
  │ chunks/*.js │  │  (or @browsonic/   │                  │
  │ chunks/*.js │  │   cli)             │  ┌─ S3 / R2 ──┐  │
  │ .map        │  │                    │  │ object     │  │
  └─────────────┘  │  multipart upload  │  │ store      │  │
                   ├──────────────────► │  └────────────┘  │
                   │  POST              │                  │
                   │  Authorization:    │  ┌─ ClickHouse ─┐│
                   │   Bearer <token>   │  │ releases     ││
                   │  Form fields:      │  │ sourcemap_   ││
                   │   release          │  │ index        ││
                   │   filename         │  └──────────────┘│
                   │   sourcemap (file) │                  │
                   └────────────────────┘                  │

[ Dashboard event detail ]            [ Symbolication query path ]

  User opens an event ───► Dashboard ─►/v1/symbolicate ─► fetch
                                       (release, frames)   sourcemap
                                                           from S3,
                                                           run sourcemap
                                                           query, return
                                                           original line
                                                           + column +
                                                           source URL
```

The pipeline is **strictly additive** — events with no matching
release upload symbolicate to verbatim minified frames (today's
behaviour). Adopting sourcemap upload is opt-in per app.

---

## Component breakdown

### 1. Build-time CLI / bundler plugins

Two surfaces over one engine, mirroring the pattern Sentry already
established:

- **`@browsonic/cli`** — new published package. Single command:
  `browsonic upload-sourcemaps --release v1.2.3 --dist-path ./dist
--token "$BROWSONIC_SOURCEMAP_TOKEN" --app-key "$BROWSONIC_APP_KEY"`.
  Walks the dist tree, finds every `.map` file, POSTs to the ingest.
  Idempotent — duplicate uploads of the same `(release, filename)`
  return 200 without re-storing.
- **`@browsonic/build-tools`** — bundler plugins:
  - `BrowsonicWebpackPlugin({ release, dryRun? })`
  - `browsonicVitePlugin({ release })`
  - `browsonicRollupPlugin({ release })`
    All thin wrappers over the CLI's HTTP client.

Existing `withBrowsonicConfig` in `@browsonic/nextjs` becomes the
fourth surface — wraps the Next.js config to register the webpack
plugin automatically.

#### CLI failure modes

| Failure             | Exit code | Message                                                                        |
| ------------------- | --------- | ------------------------------------------------------------------------------ |
| Missing `--app-key` | 2         | Tells the caller to set `BROWSONIC_APP_KEY`                                    |
| Missing `--token`   | 2         | Tells the caller about the scoped token (separate from API key)                |
| 401 / 403           | 3         | Token doesn't have sourcemap-upload scope                                      |
| 413                 | 4         | Sourcemap exceeded ingest size limit (default 50 MB; configurable per project) |
| 5xx                 | 5         | Service unavailable; CI should retry                                           |

### 2. Service ingest endpoint

`POST /v1/sourcemaps` — multipart/form-data:

| Field       | Type   | Required | Notes                                                        |
| ----------- | ------ | -------- | ------------------------------------------------------------ |
| `release`   | string | yes      | Free-form tag matching the SDK's `BrowsonicConfig.release`   |
| `filename`  | string | yes      | URL or path the runtime will report                          |
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
"Tokens" page (new feature alongside this work).

Storage: object store (S3 / R2 / MinIO depending on deploy). Keyed
by `(tenant_id, app_id, release, filename)`. ClickHouse table
`sourcemap_index` carries the metadata + storage URI.

### 3. Symbolication query path

The dashboard's event-detail page already renders a stack frame
list. With the sourcemap pipeline:

1. Frontend issues `POST /v1/symbolicate` with the event's `release`
   tag + the array of `{ filename, line, column }` frames.
2. Backend looks up the sourcemap by `(release, filename)`, fetches
   from object store (cached for 1 h via Redis / Cloudflare KV).
3. Runs `source-map` library's `originalPositionFor` for each
   frame.
4. Returns `{ source, line, column, name, sourceContent? }` per
   frame.

Symbolication is **lazy**: never run at ingest time. Hot events
(opened multiple times) hit the cache; cold events take ~30 ms
extra on the dashboard's first render. Trade-off: ingest stays
fast (single insert), and we don't pay symbolication cost for
events nobody ever looks at.

---

## Open design questions

### Q1: Token scope — single sourcemap-upload token, or per-environment?

Options:

- **A**: One token per app, used across all environments. Simpler
  for consumers; matches Sentry's default.
- **B**: One token per environment (`production`, `staging`,
  `dev`). More restrictive blast radius on token leak.
- **C**: One token per release. Highest security; impractical for
  CI.

**Recommendation:** Start with A. Add per-environment scoping in
a follow-up if customer demand surfaces.

### Q2: Release-name format — opaque string, or structured?

The SDK already supports `release: 'v1.2.3'` as an opaque string.
Sourcemap upload accepts the same shape. Options:

- **Opaque string** — no validation, customer chooses.
- **Semver-required** — reject non-semver releases.
- **Branch-aware** — accept `branch:main:abc123` etc.

**Recommendation:** Opaque string. Document the convention
(`v<semver>` or `<commit-hash>`) but don't enforce.

### Q3: Where to symbolicate — ingest, dashboard read, or both?

Already decided: **dashboard read time only** (lazy). Ingest stays
free of sourcemap dependencies. Documented here so the design
review doesn't re-litigate.

### Q4: Sourcemap retention — how long do we keep them?

Options:

- Keep forever. Simple. Storage grows unbounded (~50 MB × app ×
  release × month).
- Auto-prune after N releases (default 50, configurable).
- TTL based — auto-prune after 90 days.

**Recommendation:** N-releases policy, configurable per app. 50 is
the default. Old sourcemaps aren't deleted from object store
immediately — they get an "archived" flag so a reopened incident
can still symbolicate older releases for ~30 more days.

### Q5: Inline vs external sourcemaps?

Modern bundlers default to external `.map` files. We support both:

- External: standard upload path.
- Inline (`//# sourceMappingURL=data:application/json;base64,…` at
  the end of the bundle): the CLI extracts the inline source map
  before uploading. Adds a parser dependency but is the better DX
  for hand-rolled webpack configs.

**Recommendation:** Both, with inline extraction in the CLI.

### Q6: Should we publish the symbolication algorithm publicly?

The `source-map` library (Mozilla's reference implementation) is
the industry standard. We use it server-side. No need to re-invent.

### Q7: Privacy / source-content embedding?

`source-map` files often embed `sourcesContent` arrays (the original
source code). Options:

- Strip on upload (smaller storage, can't show original source in
  dashboard).
- Keep on upload (richer dashboard experience, larger storage).
- Make it a per-app setting.

**Recommendation:** Per-app setting, default "keep". Operators who
want stricter privacy strip on the build-tool side before upload.

---

## Cross-repo coordination (CROSS_REPO_IMPACTS.md preview)

When this work schedules, expected entries:

- **browsonic-service**: New `sourcemap_index` ClickHouse table +
  `POST /v1/sourcemaps` ingest endpoint + `POST /v1/symbolicate`
  read endpoint + scoped-token auth path + S3 / R2 storage adapter.
- **browsonic-dashboard**: Sourcemap upload "Tokens" page in app
  settings; event-detail panel that shows symbolicated frames + a
  "view original source" affordance when `sourcesContent` is
  available.
- **browsonic-ops**: Object store provisioning (S3 bucket + IAM
  role / R2 bucket + API token) per deploy.
- **browsonic-compose**: MinIO container + bucket bootstrap for
  self-hosted stacks.
- **browsonic-sdk**: New `@browsonic/cli` and `@browsonic/build-tools`
  packages; `withBrowsonicConfig` (Next.js) auto-registration of
  the webpack plugin.

This impact list will land as a real cross-repo log entry when the
work schedules — not before, per the protocol in
[`docs/sprint-tracking/CROSS_REPO_IMPACTS.md`](../sprint-tracking/CROSS_REPO_IMPACTS.md).

---

## Effort estimate (rough)

| Component                                              | Effort                              |
| ------------------------------------------------------ | ----------------------------------- |
| `@browsonic/cli` package + tests                       | 2–3 days                            |
| `@browsonic/build-tools` package (3 plugins)           | 2 days                              |
| Service ingest endpoint + ClickHouse migration         | 3 days                              |
| Service symbolication endpoint + caching               | 2 days                              |
| Dashboard upload-token UI + event-detail symbolication | 3 days                              |
| Self-hosted compose updates (MinIO)                    | 1 day                               |
| Documentation (per-package + migration guide)          | 1 day                               |
| Buffer (design review iteration, security pass)        | 2 days                              |
| **Total**                                              | **~16 days (≈ 3–4 weeks calendar)** |

This is large enough to justify a dedicated sprint pair (S3 + S4 in
the original plan, or a re-numbered S11 + S12 when scheduled).
Smaller than the 19-week initial SDK build but bigger than every
0.3 adapter feature combined.

---

## Acceptance criteria

A future sprint closure marks this design "implemented" when:

1. `@browsonic/cli` is published to npm + integrates in CI for at
   least one demo app.
2. A representative bundle (Next.js + Vite + Astro) all upload
   their sourcemaps successfully via the bundler plugin path.
3. The dashboard's event detail shows symbolicated frames for
   events tagged with a release that has uploaded sourcemaps.
4. Symbolication latency p95 ≤ 100 ms (cold), ≤ 5 ms (warm cache).
5. Token rotation playbook for sourcemap-upload tokens lives in
   the npm publish reference doc.
6. End-to-end smoke test in CI uploads a sample sourcemap, sends
   an event with a matching release, and asserts the dashboard
   API returns symbolicated frames.

---

## Status

**Open for design review.** Primary uncertainty is Q1 (token
scoping) and Q4 (retention policy). Either can be answered with a
brief written discussion + one round of feedback; nothing here is
blocked on customer interviews or external research.

When this work schedules, the SDK side ships first (CLI + bundler
plugins land before the service endpoint goes live, gated behind a
"sourcemap pipeline disabled" 404 from the service that the CLI
treats as "feature not enabled for this deploy"). That sequencing
lets us validate the upload contract end-to-end on a feature flag
without holding either side back.
