# Browsonic SDK — Roadmap

> Public-facing roadmap. The detailed sprint plan with internal tracking lives in [`docs/sprint-tracking/SPRINT_PLAN.md`](./docs/sprint-tracking/SPRINT_PLAN.md).
> This file is updated whenever a milestone moves between sections — issues / PRs welcome.

## Vision

Browsonic is a **focused, privacy-first browser error tracking SDK**. We deliberately keep the surface small: errors, breadcrumbs, network/console/navigation telemetry, source-map symbolication, and the framework adapters needed to use them. We are not chasing the "everything platform" surface (distributed tracing, session replay, profiling, multi-runtime, AI SDK instrumentation, feature-flag integrations) — products like Sentry serve that need very well. Browsonic's bet is that the focused, tiny-bundle slice is a better fit for teams that want a TrackJS-class SDK they can self-host or pair with a SaaS backend.

## Now (in flight)

- **OSS foundation hygiene.** Apache-2.0 license headers, SPDX identifiers in every source file, public roadmap, contribution glide path. Closing the gap between the published license and historical file-level notices left over from the early closed-source phase.

## Next (queued, in priority order)

1. **Multi-engine stack parser & linked errors.** First-class parsing for Chrome (V8), Firefox (Gecko), Safari (WebKit), and Edge (Chromium) stack traces. Linked-error / `Error.cause` chain unwinding with circular-reference protection. Golden-fixture suite per engine.
2. **Source-map upload pipeline (Webpack first).** A separate `@browsonic/sourcemaps` package: CLI for upload / inject / list / delete, plus a Webpack plugin. Backend `/v1/sourcemaps` ingest contract finalised. Debug-ID injection so releases don't depend solely on a release tag.
3. **Source-map upload pipeline (Vite, Rollup, esbuild).** Round out the bundler matrix. Shared `@browsonic/sourcemaps-core` keeps the upload + inject logic single-sourced across plugins.
4. **React adapter (pilot for the rest).** `@browsonic/react`: `<BrowsonicErrorBoundary>`, `useBrowsonic()` hook, `withBrowsonic()` HOC, opt-in React Router instrumentation. The shipped adapter is also the **template** all other framework adapters follow — the template is committed alongside the package.
5. **Vue + Svelte adapters.** Apply the React-pilot template to `@browsonic/vue` (Composition API plugin, `app.config.errorHandler` chaining, Vue Router instrumentation) and `@browsonic/svelte` (SvelteKit `handleError` hook, `+error.svelte` integration).
6. **Next.js + Astro adapters.** App Router `error.tsx` / `global-error.tsx` integration, `instrumentation.ts` registry; Astro integration with View Transitions support. Browser-side capture only — server-runtime is out of scope.
7. **Public scope / breadcrumb / tag API.** `addBreadcrumb`, `setTag`, `setContext`, `setExtra`, `withScope` — Sentry-compatible naming so teams switching from `@sentry/browser` keep their muscle memory.
8. **CDN loader, extension / bot detection, session health.** Async lazy-loading stub script (~3 KB), automatic shutdown inside browser-extension contexts, default ignore list for known bots, minimal "errored / healthy / crashed" session signal.
9. **Angular + Remix adapters, migration guides.** Closes the framework matrix. Migration guides from Sentry and TrackJS, including an opt-in `jscodeshift` codemod for the API surface that has direct one-to-one mapping.

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
