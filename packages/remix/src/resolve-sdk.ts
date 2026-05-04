// SPDX-License-Identifier: Apache-2.0

/**
 * SDK lookup helper for the Remix adapter. Mirrors the React /
 * Vue / Svelte / Next / Astro / Angular adapters: prefer the
 * explicit instance, fall back to the global window singleton,
 * return `null` in server / sandboxed contexts.
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
