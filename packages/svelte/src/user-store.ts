// SPDX-License-Identifier: Apache-2.0

/**
 * Subscribe a Svelte store to the Browsonic user context. Every value
 * change is mirrored as `sdk.setUser(value)`, `null` clears the user.
 *
 * The function is store-shape agnostic — it accepts anything with a
 * `subscribe(fn)` method that returns an unsubscribe function. This
 * matches Svelte's `Readable` / `Writable` / custom store contracts
 * without us having to import `svelte/store` (and force consumers to
 * keep the same Svelte major as us).
 *
 * Returns the unsubscribe handle so callers can detach in `onDestroy`
 * or wherever they manage lifetimes.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic, UserContext } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Minimal Svelte-store contract. `Readable<T>.subscribe` returns a
 * function that detaches the subscription.
 */
export interface ReadableLike<T> {
  subscribe(run: (value: T) => void): () => void;
}

export interface SubscribeUserOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
}

/**
 * Mirror a `Readable<UserContext | null>` Svelte store onto the
 * Browsonic SDK's user context. Returns the unsubscribe handle.
 *
 * @example
 * ```ts
 * import { writable } from 'svelte/store';
 * import { subscribeUser } from '@browsonic/svelte';
 * import { onDestroy } from 'svelte';
 *
 * const user = writable<UserContext | null>(null);
 * const off = subscribeUser(user);
 * onDestroy(off);
 * ```
 */
export function subscribeUser(
  store: ReadableLike<UserContext | null>,
  options: SubscribeUserOptions = {},
): () => void {
  const sdk = resolveSdk(options.sdk);

  // Store-shape sanity — be defensive about consumer-side mistakes.
  if (typeof store?.subscribe !== 'function') {
    return () => {};
  }

  const unsubscribe = store.subscribe((value) => {
    if (!sdk) return;
    try {
      if (value === null) {
        sdk.clearUser();
      } else {
        sdk.setUser(value);
      }
    } catch {
      // Defensive isolation — store-driven setUser must not crash.
    }
  });

  return unsubscribe;
}
