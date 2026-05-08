// SPDX-License-Identifier: Apache-2.0

/**
 * Route-handler wrapper for `app/api/.../route.ts`. Wraps a Next.js
 * route handler so any thrown error is forwarded to the SDK before
 * the framework returns a 500.
 *
 * Note: Next.js route handlers run in either the Node.js or Edge
 * runtime (the latter has no `window`). The SDK is a browser library;
 * this wrapper's job is to make sure errors that originated *during a
 * server-side route invocation* still get a chance to be reported
 * **if a browser-side SDK is reachable** at the time the wrapper
 * runs (in Edge runtimes that have `window` polyfilled, or when
 * called from a hybrid component).
 *
 * For pure Node-side capture (no `window`), users wire their own
 * server runtime telemetry — the SDK does not expand into Node.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { resolveSdk } from './resolve-sdk';

/**
 * Wrap a Next.js route handler so thrown errors are reported.
 *
 * @example
 * ```ts
 * import { withBrowsonicRouteHandler } from '@browsonic/nextjs';
 *
 * export const POST = withBrowsonicRouteHandler(async (req) => {
 *   const data = await req.json();
 *   if (!data.email) throw new Error('email required');
 *   return new Response(JSON.stringify({ ok: true }));
 * });
 * ```
 */
export function withBrowsonicRouteHandler<TArgs extends unknown[], TReturn>(
  handler: (...args: TArgs) => TReturn | Promise<TReturn>,
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await handler(...args);
    } catch (error) {
      const sdk = resolveSdk();
      if (sdk) {
        try {
          const errorObj = error instanceof Error ? error : new Error(String(error));
          // Mirror onto the `nextjs` context bucket BEFORE capture so
          // the dashboard's NextJsCard renders the route-handler
          // origin. `resolveSdk()` returns non-null only on the
          // browser, so the runtime is browser by construction.
          try {
            sdk.setContext('nextjs', { runtime: 'browser', source: 'route-handler' });
          } catch {
            // Context failures must not block captureError below.
          }
          sdk.captureError(errorObj);
          sdk.addMetadata('nextjsRouteHandler', 'true');
        } catch {
          // Defensive isolation — never poison the route response
          // because reporting threw.
        }
      }
      throw error;
    }
  };
}
