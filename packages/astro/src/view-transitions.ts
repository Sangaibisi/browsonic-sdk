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
import { readContentCollectionFromDocument } from './content-collections';

export interface RegisterNavigationBreadcrumbsOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /** Custom event name for the swap-completed signal. Default: `'astro:after-swap'`. */
  eventName?: string;
  /**
   * 0.2 — also subscribe to `astro:before-preparation` and emit an
   * "intent" breadcrumb for the navigation about to happen. Pairs
   * with the after-swap breadcrumb to give a from/to trail with
   * timing — useful when an error fires mid-navigation.
   *
   * The intent breadcrumb uses category `'navigation'` (same as
   * after-swap) but tags `data.phase: 'intent'` vs
   * `data.phase: 'completed'` so the dashboard renderer can group
   * them or de-dupe per phase.
   *
   * Default: `false` (matches 0.1 behaviour).
   */
  includeIntent?: boolean;
  /**
   * Custom event name for the intent signal. Default:
   * `'astro:before-preparation'`. Only consumed when `includeIntent`
   * is `true`.
   */
  intentEventName?: string;
}

/**
 * Subscribe a `astro:after-swap` listener that emits a navigation
 * breadcrumb on every Astro View Transitions navigation. Returns the
 * unsubscribe handle. No-op when running outside a browser context.
 *
 * 0.2 adds an opt-in `includeIntent: true` flag that also subscribes
 * to `astro:before-preparation` for a richer pre-swap trail.
 *
 * @example
 * ```astro
 * ---
 * // src/layouts/Base.astro
 * ---
 * <script>
 *   import { registerNavigationBreadcrumbs } from '@browsonic/astro';
 *   registerNavigationBreadcrumbs({ includeIntent: true });
 * </script>
 * ```
 */
export function registerNavigationBreadcrumbs(
  options: RegisterNavigationBreadcrumbsOptions = {},
): () => void {
  if (typeof document === 'undefined') {
    return () => {};
  }

  const swapEventName = options.eventName ?? 'astro:after-swap';
  const intentEventName = options.intentEventName ?? 'astro:before-preparation';
  const includeIntent = options.includeIntent ?? false;
  let lastPath = typeof window !== 'undefined' ? window.location.pathname : '';

  const swapHandler = (): void => {
    const sdk = resolveSdk(options.sdk);
    if (!sdk) return;

    const currentPath = window.location.pathname;
    // Content Collections bridge — pages that called
    // `renderContentCollectionMeta` in their build-time frontmatter
    // ship a `<meta name="browsonic:content-collection">` tag whose
    // value identifies the collection + entry. The runtime read is
    // a single querySelector on each swap; absent on non-collection
    // pages, in which case `contentCollection` stays out of the
    // breadcrumb data.
    const contentCollection = readContentCollectionFromDocument();
    try {
      sdk.addBreadcrumb({
        category: 'navigation',
        message: `${lastPath} → ${currentPath}`,
        data: {
          from: lastPath,
          to: currentPath,
          source: 'astro:view-transitions',
          ...(contentCollection !== null ? { contentCollection } : {}),
          ...(includeIntent ? { phase: 'completed' } : {}),
        },
      });
    } catch {
      // Defensive isolation — breadcrumb failures must never throw
      // out of an Astro lifecycle handler (would break the page swap).
    }
    lastPath = currentPath;
  };

  // Astro's `astro:before-preparation` event carries `from` + `to`
  // URL objects on its detail. The cast covers Astro 4.x + 5.x;
  // older Astro versions that lacked the event simply never fire it.
  const intentHandler = (event: Event): void => {
    const sdk = resolveSdk(options.sdk);
    if (!sdk) return;

    const detail = (event as Event & { from?: URL; to?: URL }).from
      ? (event as Event & { from?: URL; to?: URL })
      : ((event as unknown as { detail?: { from?: URL; to?: URL } }).detail ?? {});
    const fromUrl = detail.from?.pathname ?? lastPath;
    const toUrl = detail.to?.pathname ?? '';

    try {
      sdk.addBreadcrumb({
        category: 'navigation',
        message: `${fromUrl} → ${toUrl} (intent)`,
        data: {
          from: fromUrl,
          to: toUrl,
          source: 'astro:view-transitions',
          phase: 'intent',
        },
      });
    } catch {
      // Same defensive contract as the swap handler.
    }
  };

  document.addEventListener(swapEventName, swapHandler);
  if (includeIntent) {
    document.addEventListener(intentEventName, intentHandler);
  }
  return () => {
    document.removeEventListener(swapEventName, swapHandler);
    if (includeIntent) {
      document.removeEventListener(intentEventName, intentHandler);
    }
  };
}
