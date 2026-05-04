// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/vue` — Vue 3 adapter for `@browsonic/sdk`.
 *
 * Public surface:
 *
 * 0.1 — bootstrap:
 * - `browsonicPlugin` — `app.use(browsonicPlugin, { sdk })`
 * - `BrowsonicErrorBoundary` — component that wraps a subtree
 * - `useBrowsonic` / `useUser` / `useCaptureError` — composables
 * - `browsonicInjectionKey` — Vue `provide` / `inject` key
 *
 * 0.2 — instrumentation + ergonomics:
 * - `installRouterInstrumentation` — Vue Router 4 navigation breadcrumbs
 * - `useBreadcrumb` — typed `addBreadcrumb` wrapper composable
 * - `errorCaptured` info now lands as a structured tag
 *   (`vue.errorCaptured.info`) on top of the existing metadata.
 *
 * 0.3 — richer signals:
 * - `installRouterInstrumentation({ includeIntent })` — opt-in
 *   `beforeEach` "intent" breadcrumbs that complement the existing
 *   `afterEach` channel.
 * - `installPiniaIntegration` — Pinia plugin that stamps a `pinia`
 *   context bucket on the SDK scope when a store action throws.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export { browsonicPlugin, type BrowsonicVueOptions } from './plugin';
export { BrowsonicErrorBoundary, type BrowsonicErrorBoundaryFallback } from './error-boundary';
export { useBrowsonic, useUser, useCaptureError, useBreadcrumb } from './composables';
export { browsonicInjectionKey } from './inject-key';
export {
  installRouterInstrumentation,
  type RouterLike,
  type RouteLocationLike,
  type InstallRouterInstrumentationOptions,
} from './router';
export {
  installPiniaIntegration,
  type PiniaLike,
  type PiniaStoreLike,
  type PiniaActionContextLike,
  type InstallPiniaIntegrationOptions,
} from './pinia';
