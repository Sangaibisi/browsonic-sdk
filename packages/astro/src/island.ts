// SPDX-License-Identifier: Apache-2.0

/**
 * Astro Islands awareness helper. Astro renders most of a page as
 * static HTML, then hydrates discrete component-framework islands
 * (React / Vue / Svelte / Solid components annotated with a
 * `client:*` directive). When an island throws, the SDK's captured
 * event by itself can't distinguish "ProductCard island on /shop"
 * from "ContactForm island on /contact" — both surface as plain
 * JS errors with similar stack frames once minified.
 *
 * `tagAsAstroIsland(name)` solves that with one line of host code:
 * the consumer calls it from inside the island (e.g. a React
 * `useEffect`, a Vue `onMounted`, a Svelte `onMount`) and every
 * subsequent captured event picks up an `astro.island` tag on the
 * active scope until another island claims it. No cross-adapter
 * coordination is needed — `setTag` is sticky on the SDK's
 * top-level scope, which the per-framework boundaries inherit.
 *
 * Browser-runtime only — `typeof window === 'undefined'` short-
 * circuits during SSR. No-op when no SDK is reachable.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

export interface TagAsAstroIslandOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /**
   * Override the tag key. Defaults to `'astro.island'` to match the
   * other Astro adapter tags (`astro.runtime`, `astro.action.name`,
   * etc.). Custom keys let consumers run more than one island-id
   * dimension side-by-side (rare; e.g. `'astro.island.role'`
   * + `'astro.island.name'`).
   */
  tagKey?: string;
}

/**
 * Stamp `astro.island = <name>` on the SDK's active scope so any
 * subsequent `captureError` call carries the island name as a
 * filterable tag. Returns `true` if the tag was set, `false` if
 * the call was a no-op (SSR, no SDK reachable, or the SDK's
 * `setTag` itself threw).
 *
 * @example
 * ```tsx
 * // src/components/ContactForm.tsx — a React island
 * import { useEffect } from 'react';
 * import { tagAsAstroIsland } from '@browsonic/astro';
 *
 * export function ContactForm() {
 *   useEffect(() => {
 *     tagAsAstroIsland('ContactForm');
 *   }, []);
 *   // ...
 * }
 * ```
 *
 * The helper is intentionally synchronous + idempotent — calling
 * it on every render is safe; the SDK's tag store is a simple
 * Map<string, string> overwrite, so there's no allocation
 * cost beyond the function call itself.
 */
export function tagAsAstroIsland(name: string, options: TagAsAstroIslandOptions = {}): boolean {
  if (typeof window === 'undefined') return false;

  const sdk = resolveSdk(options.sdk);
  if (!sdk) return false;

  const tagKey = options.tagKey ?? 'astro.island';

  try {
    sdk.setTag(tagKey, name);
    return true;
  } catch {
    // Defensive isolation — a thrown SDK call must never propagate
    // out of an island's mount path (would unmount the island and
    // strand whatever shell rendered around it).
    return false;
  }
}
