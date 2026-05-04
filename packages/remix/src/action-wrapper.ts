// SPDX-License-Identifier: Apache-2.0

/**
 * Wrap a Remix `action` or `loader` so thrown errors are forwarded
 * to the SDK before the framework re-throws them. Mirrors
 * `withBrowsonicRouteHandler` in the Next.js adapter.
 *
 * Remix actions / loaders run server-side (Node / Edge). The SDK
 * is browser-only, so the wrapper resolves the SDK opportunistically
 * — when a browser SDK is reachable, it forwards; otherwise it just
 * re-throws. This makes the wrapper safe to use in either runtime.
 *
 * ```ts
 * // app/routes/checkout.tsx
 * import { withBrowsonicRemixAction } from '@browsonic/remix';
 *
 * export const action = withBrowsonicRemixAction(async ({ request }) => {
 *   const data = await request.formData();
 *   if (!data.get('email')) throw new Error('email required');
 *   return { ok: true };
 * });
 * ```
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { resolveSdk } from './resolve-sdk';

export function withBrowsonicRemixAction<TArgs extends unknown[], TReturn>(
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
          sdk.captureError(errorObj);
          sdk.addMetadata('remixAction', 'true');
        } catch {
          // Defensive isolation — never poison the response because
          // reporting threw.
        }
      }
      throw error;
    }
  };
}
