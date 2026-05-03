// SPDX-License-Identifier: Apache-2.0

/**
 * @browsonic/react — React adapter for the Browsonic SDK.
 *
 * Public entry. Imports from this barrel; nothing in `dist/` should
 * be considered part of the contract beyond what is re-exported here.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export { BrowsonicErrorBoundary } from './error-boundary';
export type { BrowsonicErrorBoundaryProps, BrowsonicErrorBoundaryFallback } from './error-boundary';

// Hooks (0.2)
export { useBrowsonic, useUser, useCaptureError } from './hooks';

// HOC (0.2)
export { withBrowsonic } from './hoc';
export type { WithBrowsonicInjectedProps } from './hoc';
