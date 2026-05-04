// SPDX-License-Identifier: Apache-2.0

/**
 * Vue Router instrumentation. Subscribes to a router's `afterEach`
 * navigation guard and emits a `category: 'navigation'` breadcrumb on
 * every successful route change, mirroring `@sentry/vue`'s router
 * integration so migrations stay one-to-one.
 *
 * Why a structural router type instead of `import { Router } from 'vue-router'`:
 * the adapter does not depend on `vue-router`. The `RouterLike` shape
 * below covers Vue Router 4.x and any router that implements the same
 * `afterEach(guard) → unsubscribe` contract — including test doubles.
 *
 * Defensive contract:
 * - The breadcrumb call is wrapped in try/catch — a thrown
 *   `addBreadcrumb` cannot crash a navigation.
 * - Returning the unsubscribe handle from `afterEach` lets hosts unwire
 *   the guard during teardown / hot-module-reload without leaking
 *   listeners across reloads.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Breadcrumb, Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Minimal RouteLocation shape Vue Router 4 ships. Captures only the
 * fields we read.
 */
export interface RouteLocationLike {
  fullPath: string;
  path: string;
  name?: string | symbol | null;
  hash?: string;
}

/**
 * Minimal Router shape — `afterEach(guard) → unsubscribe` is required
 * (we always wire it). `beforeEach(guard) → unsubscribe` is optional
 * and only consumed when {@link InstallRouterInstrumentationOptions.includeIntent}
 * is enabled. Both shapes match Vue Router 4.x.
 */
export interface RouterLike {
  afterEach: (guard: (to: RouteLocationLike, from: RouteLocationLike) => void) => () => void;
  beforeEach?: (guard: (to: RouteLocationLike, from: RouteLocationLike) => void) => () => void;
}

export interface InstallRouterInstrumentationOptions {
  /**
   * Browsonic SDK instance. When omitted the function falls back to
   * `window.Browsonic.getBrowsonic()` (matches the rest of the
   * adapter's resolution order). If neither is reachable the
   * instrumentation installs but emits no-ops — the unsubscribe
   * handle still works.
   */
  sdk?: Browsonic | null;
  /**
   * Override the breadcrumb category. Defaults to `'navigation'`.
   */
  category?: string;
  /**
   * Skip the very first `afterEach` call (initial mount). Some apps
   * already have a separate "session start" breadcrumb and don't want
   * a duplicate signal. Defaults to `false`.
   */
  skipInitial?: boolean;
  /**
   * 0.3 — also subscribe to `router.beforeEach` and emit an "intent"
   * breadcrumb for the navigation that's about to start. Pairs with
   * the `afterEach` breadcrumb to give a from/to trail with timing —
   * useful when an error fires mid-navigation (the `afterEach` guard
   * never runs in that case, so without `includeIntent` the trail
   * would have no record of the attempted route).
   *
   * When enabled, both breadcrumbs tag `data.phase`
   * (`'intent'` vs `'completed'`) so the dashboard renderer can group
   * them or de-dupe per phase. Mirrors the Astro adapter's
   * `registerNavigationBreadcrumbs({ includeIntent })` flag.
   *
   * No-op when the supplied router has no `beforeEach` method.
   * Default: `false` (matches 0.2 behaviour).
   */
  includeIntent?: boolean;
}

/**
 * Wire a Vue Router (4.x or any compatible RouterLike) into the
 * Browsonic SDK so navigation breadcrumbs land alongside captured
 * errors. Returns the unsubscribe handle from `router.afterEach`.
 *
 * @example
 * ```ts
 * import { createRouter } from 'vue-router';
 * import { installRouterInstrumentation } from '@browsonic/vue';
 *
 * const router = createRouter({ ... });
 * const off = installRouterInstrumentation(router);
 * // optional: off() during HMR teardown
 * ```
 */
export function installRouterInstrumentation(
  router: RouterLike,
  options: InstallRouterInstrumentationOptions = {},
): () => void {
  const category = options.category ?? 'navigation';
  const skipInitial = options.skipInitial ?? false;
  const includeIntent = options.includeIntent ?? false;
  let isFirst = true;

  const routeName = (loc: RouteLocationLike): string | undefined => {
    if (loc.name === undefined || loc.name === null) return undefined;
    return typeof loc.name === 'symbol' ? (loc.name.description ?? '') : loc.name;
  };

  const offAfter = router.afterEach((to, from) => {
    if (skipInitial && isFirst) {
      isFirst = false;
      return;
    }
    isFirst = false;

    const sdk = options.sdk ?? resolveSdk();
    if (!sdk) return;

    const name = routeName(to);
    const breadcrumb: Breadcrumb = {
      category,
      message: `${from.fullPath} → ${to.fullPath}`,
      data: {
        from: from.fullPath,
        to: to.fullPath,
        ...(name !== undefined ? { name } : {}),
        ...(includeIntent ? { phase: 'completed' } : {}),
      },
    };

    try {
      sdk.addBreadcrumb(breadcrumb);
    } catch {
      // Breadcrumb failures must never cancel a navigation.
    }
  });

  // 0.3 — opt-in `beforeEach` instrumentation. Skipped silently if the
  // router doesn't expose `beforeEach` (test doubles or older RouterLike
  // implementations); the `afterEach` channel still works.
  const offBefore =
    includeIntent && typeof router.beforeEach === 'function'
      ? router.beforeEach((to, from) => {
          const sdk = options.sdk ?? resolveSdk();
          if (!sdk) return;

          const name = routeName(to);
          const breadcrumb: Breadcrumb = {
            category,
            message: `${from.fullPath} → ${to.fullPath} (intent)`,
            data: {
              from: from.fullPath,
              to: to.fullPath,
              ...(name !== undefined ? { name } : {}),
              phase: 'intent',
            },
          };

          try {
            sdk.addBreadcrumb(breadcrumb);
          } catch {
            // Same defensive contract as the afterEach channel — a
            // thrown breadcrumb cannot block a navigation.
          }
        })
      : undefined;

  return () => {
    offAfter();
    offBefore?.();
  };
}
