// SPDX-License-Identifier: Apache-2.0

/**
 * Astro View Transitions instrumentation. Astro emits two custom
 * events on `document` when its View Transitions client navigates:
 *
 *   - `astro:before-preparation` — fires before the new page swap.
 *   - `astro:after-swap` — fires after the new DOM replaces the old.
 *
 * We listen to `astro:after-swap` and emit a navigation breadcrumb
 * with `from` / `to` paths. Consumers wire this once in their root
 * layout's client-side script.
 *
 * Browser-only — `typeof document === 'undefined'` short-circuits in
 * SSR / build-time contexts so importing this module doesn't crash
 * the Astro build.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

export interface RegisterNavigationBreadcrumbsOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /** Custom event name. Default: `'astro:after-swap'`. */
  eventName?: string;
}

/**
 * Subscribe a `astro:after-swap` listener that emits a navigation
 * breadcrumb on every Astro View Transitions navigation. Returns the
 * unsubscribe handle. No-op when running outside a browser context.
 *
 * @example
 * ```astro
 * ---
 * // src/layouts/Base.astro
 * ---
 * <script>
 *   import { registerNavigationBreadcrumbs } from '@browsonic/astro';
 *   registerNavigationBreadcrumbs();
 * </script>
 * ```
 */
export function registerNavigationBreadcrumbs(
  options: RegisterNavigationBreadcrumbsOptions = {},
): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const eventName = options.eventName ?? 'astro:after-swap';
  let lastPath = typeof window !== 'undefined' ? window.location.pathname : '';

  const handler = (): void => {
    const sdk = resolveSdk(options.sdk);
    if (!sdk) return;

    const currentPath = window.location.pathname;
    try {
      sdk.addBreadcrumb({
        category: 'navigation',
        message: `${lastPath} → ${currentPath}`,
        data: { from: lastPath, to: currentPath, source: 'astro:view-transitions' },
      });
    } catch {
      // Defensive isolation — breadcrumb failures must never throw
      // out of an Astro lifecycle handler (would break the page swap).
    }
    lastPath = currentPath;
  };

  document.addEventListener(eventName, handler);
  return () => document.removeEventListener(eventName, handler);
}
