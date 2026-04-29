# Browsonic SDK — Roadmap

> Public-facing roadmap. The detailed sprint plan with internal tracking lives in [`docs/sprint-tracking/SPRINT_PLAN.md`](./docs/sprint-tracking/SPRINT_PLAN.md).
> This file is updated whenever a milestone moves between sections — issues / PRs welcome.

## Vision

Browsonic is a **focused, privacy-first browser error tracking SDK**. We deliberately keep the surface small: errors, breadcrumbs, network/console/navigation telemetry, source-map symbolication, and the framework adapters needed to use them. We are not chasing the "everything platform" surface (distributed tracing, session replay, profiling, multi-runtime, AI SDK instrumentation, feature-flag integrations) — products like Sentry serve that need very well. Browsonic's bet is that the focused, tiny-bundle slice is a better fit for teams that want a TrackJS-class SDK they can self-host or pair with a SaaS backend.

## Now (in flight)

- **Public scope / breadcrumb / tag API** _(queued — see "Next")_.

## Recently shipped

- **OSS foundation hygiene** _(2026-04-29)_ — Apache-2.0 license headers, SPDX identifiers in every source file, public roadmap.
- **Multi-engine stack parser & linked errors** _(2026-04-29, SDK 2.3.0)_ — Chromium / Gecko / WebKit per-engine parsers, `Error.cause` chain unwinding (depth 5 + circular guard), frame-aware fingerprint that absorbs line/column variance across minified rebuilds. New public types `StackFrame` and `LinkedError` on `BrowsonicEvent`.
- **`@browsonic/react` adapter** _(2026-04-29)_ — separate repo [Sangaibisi/browsonic-react](https://github.com/Sangaibisi/browsonic-react), Apache-2.0. Ships `<BrowsonicErrorBoundary>`, `useBrowsonic` / `useUser` / `useCaptureError` hooks, and the `withBrowsonic` HOC. The repo carries [`docs/ADAPTER_TEMPLATE.md`](https://github.com/Sangaibisi/browsonic-react/blob/main/docs/ADAPTER_TEMPLATE.md) — the checklist that the next framework adapters (Vue, Svelte, Angular) replicate.

## Next (queued, in priority order)

1. **Public scope / breadcrumb / tag API.** `addBreadcrumb`, `setTag`, `setContext`, `setExtra`, `withScope` — Sentry-compatible naming so teams switching from `@sentry/browser` keep their muscle memory.
2. **Vue + Svelte adapters.** Apply the React-pilot template ([`browsonic-react/docs/ADAPTER_TEMPLATE.md`](https://github.com/Sangaibisi/browsonic-react/blob/main/docs/ADAPTER_TEMPLATE.md)) to `@browsonic/vue` (Composition API plugin, `app.config.errorHandler` chaining, Vue Router instrumentation) and `@browsonic/svelte` (SvelteKit `handleError` hook, `+error.svelte` integration).
3. **Next.js + Astro adapters.** App Router `error.tsx` / `global-error.tsx` integration, `instrumentation.ts` registry; Astro integration with View Transitions support. Browser-side capture only — server-runtime is out of scope.
4. **CDN loader, extension / bot detection, session health.** Async lazy-loading stub script (~3 KB), automatic shutdown inside browser-extension contexts, default ignore list for known bots, minimal "errored / healthy / crashed" session signal.
5. **Angular + Remix adapters, migration guides.** Closes the framework matrix. Migration guides from Sentry and TrackJS, including an opt-in `jscodeshift` codemod for the API surface that has direct one-to-one mapping.

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
