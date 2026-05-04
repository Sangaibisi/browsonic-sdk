// SPDX-License-Identifier: Apache-2.0

/**
 * Shared SDK lookup. Mirrors the React and Vue adapters: prefer the
 * caller-supplied instance, fall back to `window.Browsonic.getBrowsonic()`,
 * return `null` in server / sandboxed contexts.
 *
 * Returning `null` is the contract: every consumer branches on
 * `if (!sdk) return` and stays silent. Reporting failures must never
 * crash the host application.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';

export function resolveSdk(explicit?: Browsonic): Browsonic | null {
  if (explicit) return explicit;
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
