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

## 0.3 (shipped 2026-05-04)

- **Vue Router beforeEach instrumentation** — shipped 2026-05-04.
  `installRouterInstrumentation(router, { includeIntent: true })`
  now also subscribes to `router.beforeEach` and emits an
  `'intent'`-phase breadcrumb for the navigation about to start. The
  existing `afterEach` breadcrumb gains a `phase: 'completed'` tag
  when `includeIntent` is enabled. Pairs with the Astro adapter's
  `registerNavigationBreadcrumbs({ includeIntent })` for renderer
  consistency. Silently no-ops on `RouterLike` doubles that don't
  implement `beforeEach`.
- **Pinia integration** — shipped 2026-05-04.
  `installPiniaIntegration(pinia, options?)` registers a Pinia plugin
  that hooks `store.$onAction(({ onError }) => ...)` and stamps the
  SDK scope with `setContext('pinia', { storeId, action, args, errorMessage, state? })`
  before the action error keeps bubbling. State capture is opt-in
  (`captureState: true`); `ignoreStores` skips specific stores;
  `maxLength` caps args/state JSON. Structural `PiniaLike` shape so
  the adapter still has no `pinia` peerDep. Defensive try/catch
  around `setContext` keeps the action-caller path clean.
- **Composition + Options API parity tests** — shipped 2026-05-04.
  `error-boundary.parity.test.ts` exercises the boundary against
  components authored in both styles. Each Composition test has an
  Options API mirror (render throw, mounted hook, created hook,
  computed-getter throw surfaced via render) so a future regression
  on either path fails loudly instead of silently breaking
  consumers who haven't migrated. Asserts the same SDK contract
  (`captureError`, `setTag('vue.errorCaptured.info', …)`, fallback
  shape) in both runs.

## Later (parking lot)

- A built-in default fallback component (CSS-scoped) for plug-and-play
  error screens. Likely needs an SFC; we'd add `@vue/compiler-sfc` to
  the build chain at that point.

## Suspense integration — shipped 2026-05-05

The boundary's existing `onErrorCaptured` hook already catches errors
from async `setup()` functions inside `<Suspense>` (Vue 3.0+ stable
behaviour, no flag-gated APIs). The 0.3 sweep added an explicit
test suite (`error-boundary.suspense.test.ts`) pinning the contract:

- Async setup throws are forwarded to `sdk.captureError`.
- The boundary's fallback renders, replacing Suspense's pending UI.
- The `vue.errorCaptured.info` tag fires for async errors too
  (same shape as sync errors).

No public API change — this is purely a contract pin so a future
Vue minor version that rewires async error propagation can't
silently break consumers running `<script setup async>` /
top-level-`await` setup.

## Out of scope

- **Server-side rendering capture.** Vue SSR + Nuxt run on Node; this
  adapter is browser-only. Nuxt/SSR will be a separate adapter or
  guidance, not a feature here.
- **Vue 2 / Options-API-only consumers.** 3.3+ Composition API is the
  contract. Vue 2 has reached end-of-life; we are not back-porting.
