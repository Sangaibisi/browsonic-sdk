// SPDX-License-Identifier: Apache-2.0

/**
 * `useRemixNavigationBreadcrumbs` — Remix-aware navigation breadcrumb
 * hook. Subscribes to a navigation transition surfaced by Remix's
 * `useNavigation` hook plus the route hierarchy from `useMatches`,
 * and emits a `category: 'navigation'` breadcrumb each time a
 * navigation completes (state transitions from non-`idle` →
 * `'idle'`).
 *
 * Why pass values instead of importing the hooks: the adapter has
 * no `@remix-run/react` runtime dependency (peer-only / type-only).
 * Consumers call Remix's hooks themselves and pass the *values* in,
 * which keeps the import graph clean and lets the same hook power
 * tests against hand-rolled fixtures.
 *
 * Why hierarchy matters: a Remix route id like
 * `routes/_app.dashboard.users.$userId` encodes the full nesting
 * chain. Plain URLs lose that — `/dashboard/users/42` reads the
 * same whether the user is inside the `_app` shell or a public
 * route. Tagging the breadcrumb with the route id chain makes
 * cross-route incident triage one click instead of three.
 *
 * Default category is `'navigation'` (matches Vue / Astro / Svelte
 * adapters). Override via `options.category`.
 *
 * Browser-only — `useEffect` is React's gate, so SSR pre-mount
 * passes are inert. No-op when no SDK is reachable.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { useEffect, useRef } from 'react';
import type { Breadcrumb, Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Subset of the `Navigation` shape Remix's `useNavigation()` returns.
 * Only `state` and `location.pathname` are read here. The full Remix
 * shape ships with `formMethod`, `formAction`, etc. — none of which
 * map cleanly to a navigation breadcrumb (those signals live on the
 * action wrapper).
 */
export interface NavigationLike {
  state: 'idle' | 'submitting' | 'loading';
  location?: { pathname?: string } | null;
}

/**
 * Subset of the entries `useMatches()` returns. Each entry is one
 * route in the active hierarchy; the array itself is parent → leaf
 * order, so the last entry is the most specific match.
 */
export interface MatchLike {
  id: string;
  pathname: string;
}

export interface UseRemixNavigationBreadcrumbsOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /**
   * Override the breadcrumb category. Defaults to `'navigation'` to
   * keep parity with the other framework adapters.
   */
  category?: string;
  /**
   * Skip the first observed `idle` state. Some apps mount with the
   * navigation already idle, which would otherwise emit a "/ → /"
   * breadcrumb on first render. Defaults to `true`.
   */
  skipInitial?: boolean;
}

interface PrevState {
  state: NavigationLike['state'];
  pathname: string;
}

/**
 * Wire Remix's `useNavigation()` + `useMatches()` outputs into the
 * Browsonic SDK. Call this in your root layout (or any always-
 * mounted component) and breadcrumbs land for every successful
 * route transition with the leaf route id, the parent chain, and
 * `from`/`to` paths.
 *
 * @example
 * ```tsx
 * import { useNavigation, useMatches } from '@remix-run/react';
 * import { useRemixNavigationBreadcrumbs } from '@browsonic/remix';
 *
 * export default function App() {
 *   useRemixNavigationBreadcrumbs(useNavigation(), useMatches());
 *   return <Outlet />;
 * }
 * ```
 */
export function useRemixNavigationBreadcrumbs(
  navigation: NavigationLike,
  matches: MatchLike[],
  options: UseRemixNavigationBreadcrumbsOptions = {},
): void {
  const category = options.category ?? 'navigation';
  const skipInitial = options.skipInitial ?? true;

  const prevRef = useRef<PrevState | null>(null);
  const isFirstRef = useRef(true);

  useEffect(() => {
    const currentPath =
      typeof window !== 'undefined' && window.location ? window.location.pathname : '';
    const navPath = navigation.location?.pathname ?? '';

    // Treat the transition as completed when:
    // - we just observed an `idle` state, AND
    // - the previous render was non-idle (a navigation was in flight)
    //
    // Without the prev-state guard we'd fire on every render where
    // `state === 'idle'`, which Remix re-emits on data revalidations
    // and useFetcher submits.
    const prev = prevRef.current;
    const isCompletedTransition =
      navigation.state === 'idle' && prev !== null && prev.state !== 'idle';

    if (isCompletedTransition) {
      if (skipInitial && isFirstRef.current) {
        isFirstRef.current = false;
        prevRef.current = { state: navigation.state, pathname: currentPath };
        return;
      }
      isFirstRef.current = false;

      const sdk = resolveSdk(options.sdk);
      if (sdk) {
        const leaf = matches.length > 0 ? matches[matches.length - 1] : undefined;
        const fromPath = prev.pathname || '/';
        const toPath = currentPath || '/';

        const breadcrumb: Breadcrumb = {
          category,
          message: `${fromPath} → ${toPath}`,
          data: {
            from: fromPath,
            to: toPath,
            ...(leaf?.id !== undefined ? { routeId: leaf.id } : {}),
            ...(matches.length > 0 ? { routeChain: matches.map((m) => m.id).join(' › ') } : {}),
          },
        };

        try {
          sdk.addBreadcrumb(breadcrumb);
        } catch {
          // Defensive isolation — a thrown SDK call must never
          // bubble out of a useEffect (would crash the host tree).
        }
      }
    } else if (prev === null) {
      // First render — record state without firing a breadcrumb. The
      // initial-skip option only kicks in once a transition actually
      // completes; this branch is the cold-start where there's
      // nothing observable yet.
      isFirstRef.current = true;
    }

    prevRef.current = {
      state: navigation.state,
      pathname: navPath || currentPath,
    };
  }, [
    navigation.state,
    navigation.location?.pathname,
    matches,
    options.sdk,
    category,
    skipInitial,
  ]);
}
