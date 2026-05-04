// SPDX-License-Identifier: Apache-2.0

/**
 * SDK lookup for Next.js. Mirrors React/Vue/Svelte adapters: prefer
 * the global `window.Browsonic.getBrowsonic()` singleton, return
 * `null` in server / sandboxed contexts (Next.js server components,
 * route handlers running in Node).
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
