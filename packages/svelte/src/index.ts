// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/svelte` — Svelte / SvelteKit adapter for `@browsonic/sdk`.
 *
 * Public surface:
 *
 * 0.1 — bootstrap:
 * - `handleErrorWithBrowsonic` — SvelteKit `handleError` hook factory
 * - `subscribeUser` — Svelte store → SDK user context bridge
 * - `captureError` / `captureMessage` / `addBreadcrumb` — ergonomic
 *   wrappers around the global SDK singleton
 * - `resolveSdk` — explicit SDK lookup helper
 *
 * 0.2 — instrumentation + typing:
 * - `instrumentNavigation` — function returning unsubscribe; emits a
 *   `category: 'navigation'` breadcrumb on every URL change.
 * - `trackNavigation` — Svelte action wrapping the same engine.
 * - `handleErrorWithBrowsonic<App.Error>` — generic over the
 *   consumer's `App.Error` shape so the framework's exact error type
 *   flows through.
 *
 * 0.3 — SvelteKit form / error-page coverage:
 * - `withBrowsonicAction` — wraps a SvelteKit `actions: {}` handler
 *   so unhandled throws are reported, then re-thrown so the framework
 *   returns the action's failure to the client unchanged.
 * - `reportErrorPage` — one-shot, idempotent helper for
 *   `+error.svelte` to capture errors that surfaced during SSR or
 *   navigations where `handleError` never fired client-side.
 *
 * Why no boundary component?
 * Svelte 5 ships `<svelte:boundary>` natively; Svelte 4 has no clean
 * primitive for an error boundary. Rather than ship a half-working
 * shim, the adapter focuses on what works well: SvelteKit's
 * `handleError` hook, store-driven user identity, navigation
 * breadcrumbs, and the manual capture API. The README's "What this
 * package does NOT do" section makes the boundary divergence explicit.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export {
  handleErrorWithBrowsonic,
  type HandleErrorOptions,
  type BrowsonicHandleErrorInput,
  type BrowsonicHandleErrorReturn,
} from './handle-error';
export { subscribeUser, type ReadableLike, type SubscribeUserOptions } from './user-store';
export { captureError, captureMessage, addBreadcrumb } from './capture';
export { resolveSdk } from './resolve-sdk';
export {
  instrumentNavigation,
  trackNavigation,
  type InstrumentNavigationOptions,
} from './navigation';
export {
  withBrowsonicAction,
  type ActionEventLike,
  type WithBrowsonicActionOptions,
} from './form-actions';
export { reportErrorPage, type ReportErrorPageOptions } from './error-page';
