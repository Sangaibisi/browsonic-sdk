// SPDX-License-Identifier: Apache-2.0

/**
 * Shared SDK lookup used by the error boundary and the hooks.
 *
 * The boundary needs the SDK at error time (synchronous), the hooks
 * need it at mount time (synchronous). Both look in the same place
 * — `window.Browsonic.getBrowsonic()` — so the lookup lives in a
 * single module rather than being duplicated.
 *
 * Returns `null` when the SDK is not reachable (server runtime, SDK
 * never initialised, or `window.Browsonic` shimmed away by a host
 * sandbox). Consumers MUST tolerate `null` and skip reporting in
 * that case — never throw, never warn loudly.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';

export function resolveSdk(): Browsonic | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & {
    Browsonic?: { getBrowsonic?: () => Browsonic };
  };
  try {
    return w.Browsonic?.getBrowsonic?.() ?? null;
  } catch {
    return null;
  }
}
