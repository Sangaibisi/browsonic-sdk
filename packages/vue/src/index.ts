// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/vue` — Vue 3 adapter for `@browsonic/sdk`.
 *
 * Public surface (0.1):
 * - `browsonicPlugin` — `app.use(browsonicPlugin, { sdk })`
 * - `BrowsonicErrorBoundary` — component that wraps a subtree
 * - `useBrowsonic` / `useUser` / `useCaptureError` — composables
 * - `browsonicInjectionKey` — Vue `provide` / `inject` key
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export { browsonicPlugin, type BrowsonicVueOptions } from './plugin';
export { BrowsonicErrorBoundary, type BrowsonicErrorBoundaryFallback } from './error-boundary';
export { useBrowsonic, useUser, useCaptureError } from './composables';
export { browsonicInjectionKey } from './inject-key';
