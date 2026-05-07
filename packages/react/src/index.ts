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

import { registerAdapter } from '@browsonic/sdk';
import { PACKAGE_NAME, PACKAGE_VERSION } from './__pkg';

// Sprint 2 (gap B3): announce this adapter to the SDK so every batch
// + diagnostics report carries the framework identity. The
// PACKAGE_NAME / PACKAGE_VERSION constants are stamped from
// package.json at build time by `scripts/stamp-version.mjs`; the
// runtime bundle therefore reports the correct semver after every
// semantic-release publish.
registerAdapter({ name: PACKAGE_NAME, version: PACKAGE_VERSION });

export { BrowsonicErrorBoundary } from './error-boundary';
export type { BrowsonicErrorBoundaryProps, BrowsonicErrorBoundaryFallback } from './error-boundary';

// Hooks (0.2)
export { useBrowsonic, useUser, useCaptureError } from './hooks';

// HOC (0.2)
export { withBrowsonic } from './hoc';
export type { WithBrowsonicInjectedProps } from './hoc';
