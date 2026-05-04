// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/remix` — Remix adapter for `@browsonic/sdk`.
 *
 * Public surface (0.1):
 * - `BrowsonicRouteErrorBoundary` — drop-in for Remix routes'
 *   exported `ErrorBoundary`. Captures the error on mount.
 * - `captureRouteError(error)` — imperative companion for callers
 *   who use `useRouteError` from `@remix-run/react` directly.
 * - `withBrowsonicRemixAction(handler)` — wraps Remix `action` /
 *   `loader` exports for error capture. Mirrors the Next.js
 *   adapter's route-handler wrapper.
 * - All `@browsonic/react` exports re-exported (boundary, hooks,
 *   HOC) — Remix consumers install one package, not two.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export {
  BrowsonicRouteErrorBoundary,
  captureRouteError,
  type BrowsonicRouteErrorBoundaryProps,
} from './route-error-boundary';
export { withBrowsonicRemixAction } from './action-wrapper';
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
