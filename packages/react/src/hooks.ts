// SPDX-License-Identifier: Apache-2.0

/**
 * React hooks for the Browsonic adapter.
 *
 * Three hooks ship in 0.2:
 *
 *   - `useBrowsonic()` — singleton instance lookup (lazy at mount,
 *     stable for the lifetime of the component).
 *   - `useUser(user | null)` — sets / clears user context as the
 *     component mounts and updates when the user fields change.
 *   - `useCaptureError()` — returns a stable callback that forwards
 *     to `sdk.captureError`, useful inside event handlers and
 *     try/catch sites that the Error Boundary cannot reach.
 *
 * All hooks are no-ops when the SDK is not reachable — they NEVER
 * throw, never log loudly. The host app must keep working even if
 * `@browsonic/sdk` was never initialised on the page.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import type { Browsonic, UserContext } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Resolve the Browsonic SDK singleton once, at component mount.
 * Subsequent renders return the cached value — the SDK is a singleton
 * so polling for it on every render would be wasted work. Returns
 * `null` when no SDK is reachable.
 */
export function useBrowsonic(): Browsonic | null {
  const [sdk] = useState<Browsonic | null>(resolveSdk);
  return sdk;
}

/**
 * Set the current user context on the Browsonic SDK while the
 * component is mounted. Pass `null` to clear the user context.
 *
 * The hook re-runs whenever the user's fields change (deep-equal via
 * JSON.stringify). When the component unmounts, it does NOT clear the
 * user automatically — clearing on unmount would race with subsequent
 * mounts of sibling components and produce flickering identity. The
 * caller decides when to clear by passing `null`.
 *
 * @example
 * ```tsx
 * function App() {
 *   const { data: user } = useCurrentUser();
 *   useUser(user ? { id: user.id, email: user.email, plan: user.plan } : null);
 *   return <Routes />;
 * }
 * ```
 */
export function useUser(user: UserContext | null): void {
  const sdk = useBrowsonic();
  // Stringify so dep-array comparison is value-based, not reference-
  // based. Most user objects are small JSON shapes; the cost is
  // negligible compared to a render.
  const userKey = user === null ? null : safeStringify(user);
  useEffect(() => {
    if (!sdk) return;
    try {
      if (user === null) {
        sdk.clearUser();
      } else {
        sdk.setUser(user);
      }
    } catch {
      // SDK reporting failures must never bubble out of a hook —
      // would crash the entire React subtree.
    }
    // `user` is intentionally not in the dep array; we use the
    // stringified hash to avoid retriggering on referentially-new
    // but value-equal objects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdk, userKey]);
}

/**
 * Returns a stable callback that forwards to `sdk.captureError`. Use
 * this inside event handlers and try/catch sites — places React's
 * Error Boundary cannot reach. The callback is a no-op when no SDK
 * is reachable.
 *
 * @example
 * ```tsx
 * function Buy() {
 *   const captureError = useCaptureError();
 *   const onClick = () => {
 *     try {
 *       buyItem();
 *     } catch (err) {
 *       captureError(err as Error);
 *       toast('Purchase failed');
 *     }
 *   };
 *   return <button onClick={onClick}>Buy</button>;
 * }
 * ```
 */
export function useCaptureError(): (error: Error) => void {
  const sdk = useBrowsonic();
  return useCallback(
    (error: Error) => {
      if (!sdk) return;
      try {
        sdk.captureError(error);
      } catch {
        // Defensive isolation, same contract as the boundary.
      }
    },
    [sdk],
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    // Circular or otherwise non-serialisable — fall back to a
    // type-tagged sentinel so the dep changes if the caller swaps
    // the reference, even if we can't compare contents.
    return `[unserialisable:${typeof value}]`;
  }
}
