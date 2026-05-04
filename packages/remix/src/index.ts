// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/remix` — Remix adapter for `@browsonic/sdk`.
 *
 * Public surface:
 *
 * 0.1 — bootstrap:
 * - `BrowsonicRouteErrorBoundary` — drop-in for Remix routes'
 *   exported `ErrorBoundary`. Captures the error on mount.
 * - `captureRouteError(error)` — imperative companion for callers
 *   who use `useRouteError` from `@remix-run/react` directly.
 * - `withBrowsonicRemixAction(handler)` — wraps Remix `action`
 *   exports for error capture. Mirrors the Next.js adapter's
 *   route-handler wrapper.
 * - All `@browsonic/react` exports re-exported (boundary, hooks,
 *   HOC) — Remix consumers install one package, not two.
 *
 * 0.2 — entry helper + loader instrumentation:
 * - `bootstrapBrowsonic({ apiEndpoint, ... })` — `entry.client.tsx`
 *   ergonomic helper that sets `window.Browsonic.config` and
 *   returns the SDK singleton.
 * - `withBrowsonicRemixLoader(handler)` — loader-side counterpart
 *   to `withBrowsonicRemixAction`. Tags the captured event with
 *   `remix.handler: 'loader'` so dashboards can distinguish data-
 *   fetch errors from mutation errors.
 * - `withBrowsonicRemixAction` now also tags the event with
 *   `remix.handler: 'action'`. The legacy `remixAction` metadata
 *   key is preserved for back-compat.
 *
 * 0.3 — navigation breadcrumbs with route hierarchy:
 * - `useRemixNavigationBreadcrumbs(useNavigation(), useMatches())`
 *   — hook that emits `category: 'navigation'` breadcrumbs on
 *   transition completion (state: non-idle → idle). Each
 *   breadcrumb carries `routeId` (leaf) + `routeChain` (parent →
 *   leaf joined with ›) so the dashboard can triage cross-route
 *   incidents without parsing URLs.
 *
 * Remix v2 supports both the new vite-based mode and the legacy
 * `@remix-run/react` mode. None of the helpers in this package
 * import from a runtime-Remix module, so both modes work — the
 * adapter stays peer-only on `@remix-run/*` types.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export {
  BrowsonicRouteErrorBoundary,
  captureRouteError,
  type BrowsonicRouteErrorBoundaryProps,
} from './route-error-boundary';
export { withBrowsonicRemixAction, withBrowsonicRemixLoader } from './action-wrapper';
export { bootstrapBrowsonic, type BrowsonicBootstrapOptions } from './bootstrap';
export {
  useRemixNavigationBreadcrumbs,
  type NavigationLike,
  type MatchLike,
  type UseRemixNavigationBreadcrumbsOptions,
} from './use-navigation-breadcrumbs';
export { resolveSdk } from './resolve-sdk';

// Re-export everything from @browsonic/react (Remix is React-based).
export {
  BrowsonicErrorBoundary,
  type BrowsonicErrorBoundaryProps,
  type BrowsonicErrorBoundaryFallback,
  useBrowsonic,
  useUser,
  useCaptureError,
  withBrowsonic,
} from '@browsonic/react';
