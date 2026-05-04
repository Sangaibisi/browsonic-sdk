// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/svelte` — Svelte / SvelteKit adapter for `@browsonic/sdk`.
 *
 * Public surface (0.1):
 * - `handleErrorWithBrowsonic` — SvelteKit `handleError` hook factory
 * - `subscribeUser` — Svelte store → SDK user context bridge
 * - `captureError` / `captureMessage` / `addBreadcrumb` — ergonomic
 *   wrappers around the global SDK singleton
 * - `resolveSdk` — explicit SDK lookup helper
 *
 * Why no boundary component?
 * Svelte 5 ships `<svelte:boundary>` natively; Svelte 4 has no clean
 * primitive for an error boundary. Rather than ship a half-working
 * shim, the adapter focuses on what works well: SvelteKit's
 * `handleError` hook, store-driven user identity, and the manual
 * capture API. The README's "What this package does NOT do" section
 * makes the boundary divergence explicit.
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
