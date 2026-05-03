# @browsonic/vue — Roadmap

## 0.1 (this milestone)

- `browsonicPlugin` install with `app.config.errorHandler` chaining.
- `<BrowsonicErrorBoundary>` Vue 3 component (render-function based).
- `useBrowsonic` / `useUser` / `useCaptureError` composables.
- `browsonicInjectionKey` for hand-rolled DI.
- 19+ unit tests (composables × 8, error-boundary × 7, plugin × 6).
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2

- **Vue Router instrumentation.** `router.afterEach` integration that
  emits `sdk.addBreadcrumb({ category: 'navigation', ... })` on every
  route change.
- **`errorCaptured` info enrichment.** Surface the
  Vue-supplied `info` string (`'render function'`, `'setup function'`,
  `'errorCaptured'`, …) as a structured tag.
- **Composable `useBreadcrumb`** — typed wrapper that calls
  `sdk.addBreadcrumb(...)` with a `Breadcrumb` payload.

## 0.3

- **Vue Router beforeEach instrumentation** for "intent" breadcrumbs.
- **Pinia integration** — optional `sdk.setContext('pinia', ...)` on
  unhandled action errors.
- **Composition + Options API parity tests** — explicit suite that
  the boundary works under both authoring styles.

## Later (parking lot)

- A built-in default fallback component (CSS-scoped) for plug-and-play
  error screens. Likely needs an SFC; we'd add `@vue/compiler-sfc` to
  the build chain at that point.
- Suspense integration if Vue's RFC stabilises.

## Out of scope

- **Server-side rendering capture.** Vue SSR + Nuxt run on Node; this
  adapter is browser-only. Nuxt/SSR will be a separate adapter or
  guidance, not a feature here.
- **Vue 2 / Options-API-only consumers.** 3.3+ Composition API is the
  contract. Vue 2 has reached end-of-life; we are not back-porting.
