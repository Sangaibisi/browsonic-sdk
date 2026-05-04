# @browsonic/vue — Roadmap

## 0.1 (this milestone)

- `browsonicPlugin` install with `app.config.errorHandler` chaining.
- `<BrowsonicErrorBoundary>` Vue 3 component (render-function based).
- `useBrowsonic` / `useUser` / `useCaptureError` composables.
- `browsonicInjectionKey` for hand-rolled DI.
- 19+ unit tests (composables × 8, error-boundary × 7, plugin × 6).
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2 (shipped 2026-05-04)

- **Vue Router instrumentation.** `installRouterInstrumentation(router, options?)`
  subscribes to a `RouterLike.afterEach` and emits
  `sdk.addBreadcrumb({ category: 'navigation', message: '/from → /to', data: { from, to, name? } })`
  on every successful route change. Returns the unsubscribe handle from
  Vue Router for HMR-friendly teardown. Structural `RouterLike` shape
  keeps the adapter free of a `vue-router` peerDep.
- **`errorCaptured` info enrichment.** Boundary now calls
  `sdk.setTag('vue.errorCaptured.info', info)` (truncated to 64 chars)
  on top of the existing `addMetadata('componentStack', info)` so the
  Vue-supplied source string lands as a structured, filterable tag.
  Tag failures are isolated — `captureError` still fires.
- **Composable `useBreadcrumb`.** Typed wrapper that returns a stable
  `(breadcrumb: Breadcrumb) => void` callback. No-op when SDK is
  unreachable; throws are swallowed.

## 0.3

- **Vue Router beforeEach instrumentation** — shipped 2026-05-04.
  `installRouterInstrumentation(router, { includeIntent: true })`
  now also subscribes to `router.beforeEach` and emits an
  `'intent'`-phase breadcrumb for the navigation about to start. The
  existing `afterEach` breadcrumb gains a `phase: 'completed'` tag
  when `includeIntent` is enabled. Pairs with the Astro adapter's
  `registerNavigationBreadcrumbs({ includeIntent })` for renderer
  consistency. Silently no-ops on `RouterLike` doubles that don't
  implement `beforeEach`.
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
