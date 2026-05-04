// SPDX-License-Identifier: Apache-2.0

/**
 * SvelteKit `handleError` factory. SvelteKit calls the registered
 * `handleError` from `src/hooks.client.ts` (and `src/hooks.server.ts`,
 * if you wire one) whenever a load function throws or a rendered
 * component crashes. This factory returns a hook that:
 *
 *   1. Reports the error to the Browsonic SDK (if reachable).
 *   2. Optionally chains into a previously-defined hook.
 *   3. Returns the SvelteKit-shaped `App.Error` payload that the
 *      framework expects (or undefined to use the default).
 *
 * Wire it from `src/hooks.client.ts`:
 *
 * ```ts
 * import { handleErrorWithBrowsonic } from '@browsonic/svelte';
 * export const handleError = handleErrorWithBrowsonic();
 * ```
 *
 * Browser-runtime only. The SDK is a browser library; SSR capture is
 * out of scope for this adapter and `handleErrorWithBrowsonic` is
 * intentionally a no-op when `typeof window === 'undefined'`.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Subset of SvelteKit's `HandleClientError` input we actually consume.
 * Mirroring the public `@sveltejs/kit` type without importing it keeps
 * `@sveltejs/kit` out of our dependency graph — consumers wire the
 * return into their own `HandleClientError` typing.
 */
export interface BrowsonicHandleErrorInput {
  error: unknown;
  event?: { url?: { pathname?: string } };
  status?: number;
  message?: string;
}

export interface BrowsonicHandleErrorReturn {
  message?: string;
  [key: string]: unknown;
}

export interface HandleErrorOptions<
  TError extends BrowsonicHandleErrorReturn = BrowsonicHandleErrorReturn,
> {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /**
   * Optional next handler — your existing `handleError` hook, called
   * after the SDK has been notified. Receives the same input and may
   * return the SvelteKit-shaped error payload. The return type is
   * generic over the consumer's `App.Error` shape so the framework's
   * own typing flows through unchanged (0.2 — pre-typed App.Error
   * exports).
   */
  chain?: (input: BrowsonicHandleErrorInput) => TError | void;
}

/**
 * SvelteKit `handleError` factory.
 *
 * The single type parameter `TError` defaults to the broad
 * `BrowsonicHandleErrorReturn` (0.1 behaviour). Consumers who maintain
 * an `App.Error` interface in `src/app.d.ts` can pass it explicitly:
 *
 * ```ts
 * import type { HandleClientError } from '@sveltejs/kit';
 * export const handleError: HandleClientError =
 *   handleErrorWithBrowsonic<App.Error>({
 *     chain: ({ error }) => ({ id: crypto.randomUUID(), message: 'oops' }),
 *   });
 * ```
 */
export function handleErrorWithBrowsonic<
  TError extends BrowsonicHandleErrorReturn = BrowsonicHandleErrorReturn,
>(options: HandleErrorOptions<TError> = {}): (input: BrowsonicHandleErrorInput) => TError | void {
  return (input) => {
    const sdk = resolveSdk(options.sdk);
    const errorObj = input.error instanceof Error ? input.error : new Error(String(input.error));

    if (sdk) {
      try {
        sdk.captureError(errorObj);
        const pathname = input.event?.url?.pathname;
        if (typeof pathname === 'string' && pathname.length > 0) {
          sdk.addMetadata('sveltekitPath', pathname);
        }
      } catch {
        // Defensive isolation — SvelteKit's error path must not be
        // poisoned by a thrown reporter.
      }
    }

    if (options.chain) {
      try {
        return options.chain(input);
      } catch {
        // Same defensive contract for the user-supplied chain.
        return undefined;
      }
    }
    return undefined;
  };
}
