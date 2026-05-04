// SPDX-License-Identifier: Apache-2.0

/**
 * Angular Router instrumentation. Subscribes to a `Router.events`
 * Observable, filters for the `NavigationEnd` event, and emits a
 * `category: 'navigation'` breadcrumb with the resolved URL.
 *
 * Why a structural router type instead of `import { Router } from '@angular/router'`:
 * the adapter must not pull `@angular/router` (or `@angular/core`)
 * into its runtime graph — both stay peer-only type imports. The
 * `RouterLike` shape below covers Angular Router 14+ and any
 * Subscribable/Observable that emits the same payload (incl. test
 * doubles). NavigationEnd is detected by structural discriminator
 * (`'urlAfterRedirects' in event`) so we don't need
 * `instanceof NavigationEnd` either.
 *
 * Defensive contract:
 * - The breadcrumb call is wrapped in try/catch — a thrown
 *   `addBreadcrumb` cannot break a navigation observer.
 * - The returned unsubscribe forwards to the upstream subscription's
 *   `unsubscribe()` (RxJS-compatible) so HMR / tear-down hosts can
 *   clean up without leaking listeners.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Breadcrumb, Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Minimal RxJS-compatible subscription. RxJS `Subscription`,
 * `Observer`, and the value returned by `Observable.subscribe` all
 * conform.
 */
export interface SubscriptionLike {
  unsubscribe(): void;
}

/**
 * Minimal observable shape. Any object with a single-callback
 * `subscribe()` works — RxJS Observables, simple event streams, and
 * test doubles.
 */
export interface ObservableLike<T> {
  subscribe(observer: (value: T) => void): SubscriptionLike;
}

/**
 * Discriminator-friendly subset of Angular's NavigationEnd. Captures
 * only the fields we read; `urlAfterRedirects` is the structural
 * discriminator that separates NavigationEnd from NavigationStart /
 * Cancel / Error.
 */
export interface RouterEventLike {
  url?: string;
  urlAfterRedirects?: string;
  navigationTrigger?: 'imperative' | 'popstate' | 'hashchange';
}

/**
 * Minimal Router shape — only the `events` Observable is required.
 */
export interface RouterLike {
  events: ObservableLike<RouterEventLike>;
}

export interface InstallRouterInstrumentationOptions {
  /** SDK override; defaults to `resolveSdk()` window-singleton lookup. */
  sdk?: Browsonic;
  /** Breadcrumb category. Defaults to `'navigation'`. */
  category?: string;
}

/**
 * Wire an Angular Router (or any compatible RouterLike) into the
 * Browsonic SDK so navigation breadcrumbs land alongside captured
 * errors. Returns an `unsubscribe()` callable.
 *
 * @example
 * ```ts
 * import { Router } from '@angular/router';
 * import { installRouterInstrumentation } from '@browsonic/angular';
 *
 * @Component({ ... })
 * export class AppComponent implements OnInit, OnDestroy {
 *   private off?: () => void;
 *   constructor(private router: Router) {}
 *   ngOnInit() { this.off = installRouterInstrumentation(this.router); }
 *   ngOnDestroy() { this.off?.(); }
 * }
 * ```
 */
export function installRouterInstrumentation(
  router: RouterLike,
  options: InstallRouterInstrumentationOptions = {},
): () => void {
  const category = options.category ?? 'navigation';
  let lastUrl: string | null = null;

  const subscription = router.events.subscribe((event) => {
    // Structural NavigationEnd detection — `urlAfterRedirects` is
    // unique to `NavigationEnd` among the standard Angular Router
    // events (NavigationStart / NavigationCancel / NavigationError
    // don't carry it).
    if (typeof event.urlAfterRedirects !== 'string') return;

    const toUrl = event.urlAfterRedirects;
    const fromUrl = lastUrl ?? event.url ?? '';
    lastUrl = toUrl;

    const sdk = options.sdk ?? resolveSdk();
    if (!sdk) return;

    const breadcrumb: Breadcrumb = {
      category,
      message: `${fromUrl} → ${toUrl}`,
      data: {
        from: fromUrl,
        to: toUrl,
        ...(event.navigationTrigger ? { trigger: event.navigationTrigger } : {}),
      },
    };

    try {
      sdk.addBreadcrumb(breadcrumb);
    } catch {
      // Breadcrumb failures must never propagate.
    }
  });

  return () => {
    try {
      subscription.unsubscribe();
    } catch {
      // RxJS `Subscription.unsubscribe()` is well-behaved; the catch
      // is belt-and-braces for non-RxJS test doubles.
    }
  };
}
