// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/nextjs` — Next.js adapter for `@browsonic/sdk`.
 *
 * Public surface (0.1):
 * - `BrowsonicErrorPage` / `BrowsonicGlobalErrorPage` — drop-in
 *   components for `app/error.tsx` and `app/global-error.tsx`.
 * - `withBrowsonicRouteHandler` — wraps `app/api/.../route.ts`
 *   handlers to forward thrown errors to the SDK before the
 *   framework returns 500.
 * - `withBrowsonic(nextConfig)` — Next.js config wrapper. Currently
 *   a passthrough; reserved for future build-time integrations.
 * - All `@browsonic/react` exports — Error Boundary, hooks, HOC.
 *   Re-exported so consumers install one package, not two.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export {
  BrowsonicErrorPage,
  BrowsonicGlobalErrorPage,
  type NextErrorPageProps,
} from './error-page';
export { withBrowsonicRouteHandler } from './route-handler';
export {
  withBrowsonicConfig,
  type NextConfigLike,
  type WithBrowsonicConfigOptions,
} from './with-browsonic';
export { resolveSdk } from './resolve-sdk';

// Re-export everything from @browsonic/react so a Next.js consumer
// installs one package and gets the boundary, hooks, and HOC. The
// `withBrowsonic` HOC is re-exported under its original name —
// the Next.js config wrapper is `withBrowsonicConfig` (Sentry-style)
// to avoid the collision.
export {
  BrowsonicErrorBoundary,
  type BrowsonicErrorBoundaryProps,
  type BrowsonicErrorBoundaryFallback,
  useBrowsonic,
  useUser,
  useCaptureError,
  withBrowsonic,
} from '@browsonic/react';
