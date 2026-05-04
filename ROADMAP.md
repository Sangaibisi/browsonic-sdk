# Browsonic SDK — Roadmap

> Public-facing roadmap. The detailed sprint plan with internal tracking lives in [`docs/sprint-tracking/SPRINT_PLAN.md`](./docs/sprint-tracking/SPRINT_PLAN.md).
> This file is updated whenever a milestone moves between sections — issues / PRs welcome.

## Vision

Browsonic is a **focused, privacy-first browser error tracking SDK**. We deliberately keep the surface small: errors, breadcrumbs, network/console/navigation telemetry, source-map symbolication, and the framework adapters needed to use them. We are not chasing the "everything platform" surface (distributed tracing, session replay, profiling, multi-runtime, AI SDK instrumentation, feature-flag integrations) — products like Sentry serve that need very well. Browsonic's bet is that the focused, tiny-bundle slice is a better fit for teams that want a TrackJS-class SDK they can self-host or pair with a SaaS backend.

## Now (in flight)

- _No active work — **the original 19-week plan is complete** (2026-05-04). The framework matrix ships seven adapters (react / vue / svelte / nextjs / astro / angular / remix) plus the core SDK; the public API has reached Sentry-compatible breadth on the surface that intersects with our scope. Future work (deferred items + 0.2 follow-ups in each package's ROADMAP) rejoins the queue when prioritised._

## Recently shipped

- **OSS foundation hygiene** _(2026-04-29)_ — Apache-2.0 license headers, SPDX identifiers in every source file, public roadmap.
- **Multi-engine stack parser & linked errors** _(2026-04-29, SDK 2.3.0)_ — Chromium / Gecko / WebKit per-engine parsers, `Error.cause` chain unwinding (depth 5 + circular guard), frame-aware fingerprint that absorbs line/column variance across minified rebuilds. New public types `StackFrame` and `LinkedError` on `BrowsonicEvent`.
- **`@browsonic/react` adapter** _(2026-04-29)_ — Apache-2.0. Ships `<BrowsonicErrorBoundary>`, `useBrowsonic` / `useUser` / `useCaptureError` hooks, and the `withBrowsonic` HOC.
- **Public scope / breadcrumb / tag API** _(2026-05-04, SDK 2.4-track)_ — full Sentry-compatible surface: `setTag` / `setContext` / `setExtra` (M1), `addBreadcrumb` (M2), `withScope` sync + async (M3). New public types `Breadcrumb`, `BreadcrumbLevel`, `BreadcrumbTelemetryEntry`, `Scope`. New optional `BrowsonicEvent.contexts` and `extras` fields plus a fifth `TelemetryTimeline.breadcrumb` channel. Migrating teams from `@sentry/browser` keep their muscle memory.
- **Monorepo migration** _(2026-05-04)_ — repo restructured into npm workspaces. `@browsonic/sdk` lives at `packages/sdk/`, `@browsonic/react` lives at `packages/react/`. Old standalone `Sangaibisi/browsonic-react` repo archived. Future framework adapters (Vue, Svelte, Next, Astro, Angular, Remix) ship as new workspaces inside this monorepo — see [`packages/react/docs/ADAPTER_TEMPLATE.md`](./packages/react/docs/ADAPTER_TEMPLATE.md).
- **`@browsonic/vue` adapter** _(2026-05-04)_ — Apache-2.0. Ships `browsonicPlugin` (`app.use()` install with `app.config.errorHandler` chaining), `<BrowsonicErrorBoundary>` (Vue 3 `defineComponent` + `onErrorCaptured`, pure TS render function — no `.vue` SFC), and `useBrowsonic` / `useUser` / `useCaptureError` composables. Peer: `vue ^3.3.0`.
- **`@browsonic/svelte` adapter** _(2026-05-04)_ — Apache-2.0. Ships `handleErrorWithBrowsonic` (SvelteKit `handleError` hook factory), `subscribeUser` (Svelte readable-store → SDK user context bridge), and ergonomic `captureError` / `captureMessage` / `addBreadcrumb` wrappers around the global SDK singleton. **No `<BrowsonicErrorBoundary>`** — Svelte 5 ships `<svelte:boundary>` natively; we forward `onerror` to `captureError` instead of competing with the framework primitive. Peer: `svelte ^4.0.0 || ^5.0.0`.
- **`@browsonic/nextjs` adapter** _(2026-05-04)_ — Apache-2.0. Drop-ins for App Router `app/error.tsx` (`BrowsonicErrorPage`) and `app/global-error.tsx` (`BrowsonicGlobalErrorPage`), `withBrowsonicRouteHandler` for `app/api/*/route.ts`, `withBrowsonicConfig` config wrapper (passthrough; reserved for future build-time integrations). Re-exports the full `@browsonic/react` surface so consumers install one package. Naming: `withBrowsonic` is the React HOC; `withBrowsonicConfig` is the Next config wrapper (Sentry-style collision avoidance). Peer: `next >=13.4`, `@browsonic/react ^0.1.0 || ^1.0.0`.
- **`@browsonic/astro` adapter** _(2026-05-04)_ — Apache-2.0. `registerNavigationBreadcrumbs` listens for `astro:after-swap` and emits a navigation breadcrumb on every View Transitions swap; standalone `captureError` / `captureMessage` / `addBreadcrumb` wrappers round out the surface. No boundary component — Astro is multi-framework on the client (React + Vue + Svelte islands coexist), so per-island boundaries belong in the framework's own adapter. Peer: `astro >=4.0`.
- **Extension / bot detection at init + session health** _(2026-05-04, SDK 2.4-track)_ — `isExtensionContext()` and `isBotUserAgent()` guard the SDK init flow so the SDK refuses to initialise inside `chrome-extension://` (and the equivalent Firefox / Safari / Edge protocols) and under known bot user agents (Googlebot, Slackbot, headless tooling — 28 default patterns, override-able). Three-state monotonic session health (`'ok'` → `'errored'` → `'crashed'`) is stamped on every event so backends can plot per-session timelines; the SDK's circuit breaker forces `'crashed'` automatically when the internal-error budget is exceeded. Public surface: `getSessionHealth()`, `markSessionCrashed()`, plus the new `BrowsonicEvent.sessionHealth` field. The CDN loader script milestone is **deferred** — it depends on a CDN distribution channel that hasn't been provisioned yet on the ops side; `<script async>` with the existing UMD bundle is the recommended pattern until then.
- **`@browsonic/angular` adapter** _(2026-05-04)_ — Apache-2.0. `BrowsonicErrorHandler` (Angular `ErrorHandler` duck-typed drop-in), `BrowsonicService` (injectable wrapper), `provideBrowsonic()` (Angular 17+ standalone provider factory). Pure-TypeScript: `@angular/core` is a peer-only type import — the adapter does not pull Angular into its runtime graph. Peer: `@angular/core >=17`.
- **`@browsonic/remix` adapter** _(2026-05-04)_ — Apache-2.0. `BrowsonicRouteErrorBoundary` drop-in for Remix routes' `ErrorBoundary` export, `captureRouteError(error)` imperative companion, `withBrowsonicRemixAction` action / loader wrapper. Re-exports the full `@browsonic/react` surface — a single `npm install @browsonic/remix` covers the framework. Peer: `@browsonic/react ^0.1.0 || ^1.0.0`.
- **Migration guides** _(2026-05-04)_ — [`MIGRATION_FROM_SENTRY.md`](./docs/migration/MIGRATION_FROM_SENTRY.md) and [`MIGRATION_FROM_TRACKJS.md`](./docs/migration/MIGRATION_FROM_TRACKJS.md). API mapping tables, step-by-step walkthroughs, and explicit "things Browsonic deliberately does NOT do" notes so teams can decide whether the focused-scope tradeoff fits their use case.

## Next (queued, in priority order)

_The original 19-week plan is complete. Subsequent work is sequenced from per-package ROADMAPs (each adapter has 0.2 / 0.3 ideas) and the deferred items below._

## Deferred (rejoining the queue after design review)

- **Source-map upload pipeline (Webpack / Vite / Rollup / esbuild).** A separate `@browsonic/sourcemaps` package with CLI + bundler plugins, plus a backend `/v1/sourcemaps` ingest endpoint. Deferred 2026-04-29 — design (debugId strategy, ingest contract, backend symbolicator) needs a dedicated review session before implementation begins.

## Later (parking lot — not committed)

- A docs site (separate from this README + `INTEGRATION.md`).
- An optional development-mode debug overlay (similar in spirit to Sentry's Spotlight).
- Framework adapters beyond the matrix above — only as community demand surfaces.

## Out of scope (intentional non-goals)

These are **good products** — they're just not what Browsonic is for. Pull requests adding them will be politely declined; we'd rather ship a focused tool well than a broad tool poorly.

- Distributed tracing / spans / W3C Trace Context propagation.
- Session replay (rrweb-style DOM recording).
- CPU profiling.
- Server runtimes: Node, Deno, Bun, Cloudflare Workers, Vercel Edge, AWS Lambda.
- AI SDK instrumentation (Anthropic, OpenAI, Google GenAI, LangChain).
- Feature-flag integrations (LaunchDarkly, OpenFeature, Unleash, GrowthBook, Statsig).
- Vendor-specific client wrappers (GraphQL, Supabase, tRPC).

If your team needs the above, [`@sentry/browser`](https://github.com/getsentry/sentry-javascript) is an excellent choice and we suggest it without hesitation.

## How this roadmap is maintained

- Concrete dates, sprint cadence, and per-task work logs live in [`docs/sprint-tracking/SPRINT_PLAN.md`](./docs/sprint-tracking/SPRINT_PLAN.md). That file is the operational source of truth — this one is the executive summary.
- Cross-repo impacts (browsonic-service, dashboard, ops, etc.) are tracked in [`docs/sprint-tracking/CROSS_REPO_IMPACTS.md`](./docs/sprint-tracking/CROSS_REPO_IMPACTS.md).
- Releases are driven by [semantic-release](https://semantic-release.gitbook.io) on Conventional Commits. The CHANGELOG is generated; do not hand-edit.
