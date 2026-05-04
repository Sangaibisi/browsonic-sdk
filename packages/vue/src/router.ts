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
 * Minimal Router shape — the `afterEach(guard)` signature returns an
 * unsubscribe function in Vue Router 4. We only require that subset.
 */
export interface RouterLike {
  afterEach: (guard: (to: RouteLocationLike, from: RouteLocationLike) => void) => () => void;
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
  let isFirst = true;

  return router.afterEach((to, from) => {
    if (skipInitial && isFirst) {
      isFirst = false;
      return;
    }
    isFirst = false;

    const sdk = options.sdk ?? resolveSdk();
    if (!sdk) return;

    const breadcrumb: Breadcrumb = {
      category,
      message: `${from.fullPath} → ${to.fullPath}`,
      data: {
        from: from.fullPath,
        to: to.fullPath,
        ...(to.name !== undefined && to.name !== null
          ? { name: typeof to.name === 'symbol' ? (to.name.description ?? '') : to.name }
          : {}),
      },
    };

    try {
      sdk.addBreadcrumb(breadcrumb);
    } catch {
      // Breadcrumb failures must never cancel a navigation.
    }
  });
}
