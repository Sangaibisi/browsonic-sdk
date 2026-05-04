// SPDX-License-Identifier: Apache-2.0

/**
 * Ergonomic capture wrappers. Re-export the SDK's most common
 * call-site primitives (`captureError`, `captureMessage`,
 * `addBreadcrumb`) as standalone functions that resolve the SDK
 * lazily from `window`. Callers don't need a separate import from
 * `@browsonic/sdk` for the everyday cases.
 *
 * Each wrapper is a no-op when the SDK is unreachable and isolates
 * SDK-side throws — same defensive contract as the React and Vue
 * adapters.
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
    // Reporting failures must never bubble out of a capture call.
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
