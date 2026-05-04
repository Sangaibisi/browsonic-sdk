// SPDX-License-Identifier: Apache-2.0

/**
 * Standalone capture wrappers. Astro's client islands are
 * framework-agnostic; consumers reach for the simplest possible
 * import surface from a `<script>` block. These wrappers resolve the
 * SDK from `window` at call time and forward — no DI, no plugin,
 * no boundary.
 *
 * Mirrors the Svelte adapter's `capture.ts` shape so the surface is
 * consistent across the meta-framework adapters.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Breadcrumb } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

export function captureError(error: Error): void {
  const sdk = resolveSdk();
  if (!sdk) return;
  try {
    sdk.captureError(error);
  } catch {
    // Defensive isolation.
  }
}

export function captureMessage(
  message: string,
  level: 'info' | 'warn' | 'error' | 'fatal' = 'info',
): void {
  const sdk = resolveSdk();
  if (!sdk) return;
  try {
    sdk.captureMessage(message, level);
  } catch {
    // Defensive isolation.
  }
}

export function addBreadcrumb(breadcrumb: Breadcrumb): void {
  const sdk = resolveSdk();
  if (!sdk) return;
  try {
    sdk.addBreadcrumb(breadcrumb);
  } catch {
    // Defensive isolation.
  }
}
