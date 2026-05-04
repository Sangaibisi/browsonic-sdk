// SPDX-License-Identifier: Apache-2.0

/**
 * Navigation breadcrumb instrumentation. Two surfaces, one engine:
 *
 *   - {@link instrumentNavigation} — function returning an unsubscribe
 *     handle. Call once at app init (e.g. in your top-level
 *     `+layout.svelte`'s `onMount`, or `src/hooks.client.ts`).
 *   - {@link trackNavigation} — Svelte action wrapper around the same
 *     engine. Use as `<div use:trackNavigation>` when you prefer the
 *     `use:` directive over imperative wiring.
 *
 * Why patch `history.pushState` / `replaceState` ourselves instead of
 * importing `afterNavigate` from `$app/navigation`: the adapter does
 * not depend on `@sveltejs/kit`. The History API + popstate is what
 * SvelteKit (and most SPA routers) use under the hood, so the
 * synthetic `browsonic:locationchange` event covers programmatic
 * `goto()` calls that don't fire popstate, while popstate itself
 * covers the back/forward buttons.
 *
 * The patches are installed once per page and ref-counted across
 * multiple `instrumentNavigation` callers — the last unsubscribe
 * tears them down.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

const LOCATION_CHANGE_EVENT = 'browsonic:locationchange';

interface PatchedHistory {
  __browsonicPatched?: boolean;
  __browsonicRefcount?: number;
  __browsonicOriginalPush?: typeof History.prototype.pushState;
  __browsonicOriginalReplace?: typeof History.prototype.replaceState;
}

function ensureHistoryPatched(): void {
  if (typeof window === 'undefined') return;
  const h = window.history as unknown as PatchedHistory;
  h.__browsonicRefcount = (h.__browsonicRefcount ?? 0) + 1;
  if (h.__browsonicPatched) return;

  // Storing the unbound method reference is intentional — the patched
  // wrappers below re-apply the correct `this` (the History instance)
  // via `.apply(this, args)`. ESLint's unbound-method rule warns
  // because most plain references would lose `this`; here we always
  // call through `.apply` so the binding is preserved.
  /* eslint-disable @typescript-eslint/unbound-method */
  h.__browsonicOriginalPush = window.history.pushState;
  h.__browsonicOriginalReplace = window.history.replaceState;
  /* eslint-enable @typescript-eslint/unbound-method */

  window.history.pushState = function patchedPushState(
    this: History,
    ...args: Parameters<History['pushState']>
  ) {
    const result = (h.__browsonicOriginalPush as typeof History.prototype.pushState).apply(
      this,
      args,
    );
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
    return result;
  };

  window.history.replaceState = function patchedReplaceState(
    this: History,
    ...args: Parameters<History['replaceState']>
  ) {
    const result = (h.__browsonicOriginalReplace as typeof History.prototype.replaceState).apply(
      this,
      args,
    );
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
    return result;
  };

  h.__browsonicPatched = true;
}

function releaseHistoryPatch(): void {
  if (typeof window === 'undefined') return;
  const h = window.history as unknown as PatchedHistory;
  if (!h.__browsonicPatched) return;
  h.__browsonicRefcount = Math.max(0, (h.__browsonicRefcount ?? 1) - 1);
  if (h.__browsonicRefcount > 0) return;

  if (h.__browsonicOriginalPush) {
    window.history.pushState = h.__browsonicOriginalPush;
  }
  if (h.__browsonicOriginalReplace) {
    window.history.replaceState = h.__browsonicOriginalReplace;
  }
  h.__browsonicPatched = false;
  delete h.__browsonicOriginalPush;
  delete h.__browsonicOriginalReplace;
}

export interface InstrumentNavigationOptions {
  /**
   * SDK override. Defaults to `resolveSdk()` (window singleton lookup).
   */
  sdk?: Browsonic;
  /**
   * Breadcrumb category. Defaults to `'navigation'`.
   */
  category?: string;
}

/**
 * Subscribe to URL changes and emit a `category: 'navigation'`
 * breadcrumb on each. Returns an unsubscribe function.
 *
 * Browser-only. SSR / Node calls are a no-op that returns a no-op
 * unsubscribe — the caller doesn't have to guard `typeof window`.
 */
export function instrumentNavigation(options: InstrumentNavigationOptions = {}): () => void {
  if (typeof window === 'undefined') {
    return () => {
      /* SSR no-op */
    };
  }

  const category = options.category ?? 'navigation';
  let lastUrl = window.location.href;

  const handler = (): void => {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    const fromUrl = lastUrl;
    lastUrl = currentUrl;

    const sdk = options.sdk ?? resolveSdk();
    if (!sdk) return;

    try {
      sdk.addBreadcrumb({
        category,
        message: `${pathOf(fromUrl)} → ${pathOf(currentUrl)}`,
        data: {
          from: fromUrl,
          to: currentUrl,
        },
      });
    } catch {
      // Breadcrumb failures must never propagate.
    }
  };

  ensureHistoryPatched();
  window.addEventListener('popstate', handler);
  window.addEventListener(LOCATION_CHANGE_EVENT, handler);

  let active = true;
  return (): void => {
    if (!active) return;
    active = false;
    window.removeEventListener('popstate', handler);
    window.removeEventListener(LOCATION_CHANGE_EVENT, handler);
    releaseHistoryPatch();
  };
}

/**
 * Svelte action wrapper around {@link instrumentNavigation}. Use as:
 *
 * ```svelte
 * <script lang="ts">
 *   import { trackNavigation } from '@browsonic/svelte';
 * </script>
 *
 * <div use:trackNavigation />
 * ```
 *
 * The action takes optional parameters (same shape as
 * `InstrumentNavigationOptions`) so callers can override the SDK or
 * the breadcrumb category per use.
 */
export function trackNavigation(
  _node: Element,
  params: InstrumentNavigationOptions = {},
): { update: (p: InstrumentNavigationOptions) => void; destroy: () => void } {
  let unsubscribe = instrumentNavigation(params);
  return {
    update(nextParams: InstrumentNavigationOptions): void {
      // Re-arm with new params. The history patch is ref-counted, so
      // teardown + setup here doesn't disturb other callers.
      unsubscribe();
      unsubscribe = instrumentNavigation(nextParams);
    },
    destroy(): void {
      unsubscribe();
    },
  };
}

function pathOf(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}
