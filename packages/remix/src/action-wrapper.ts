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
 * import {
 *   withBrowsonicRemixAction,
 *   withBrowsonicRemixLoader,
 * } from '@browsonic/remix';
 *
 * export const loader = withBrowsonicRemixLoader(async ({ params }) => {
 *   const order = await db.order.findUnique({ where: { id: params.id } });
 *   if (!order) throw new Response('Not found', { status: 404 });
 *   return order;
 * });
 *
 * export const action = withBrowsonicRemixAction(async ({ request }) => {
 *   const data = await request.formData();
 *   if (!data.get('email')) throw new Error('email required');
 *   return { ok: true };
 * });
 * ```
 *
 * Both wrappers share the same engine. The `kind` tag distinguishes
 * them on the captured event so dashboards can filter "loader
 * errors" separately from "action errors".
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { resolveSdk } from './resolve-sdk';

type RemixHandlerKind = 'action' | 'loader';

function makeWrapper(kind: RemixHandlerKind) {
  return function wrap<TArgs extends unknown[], TReturn>(
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
            // Mirror onto the `remix` context bucket BEFORE capture so
            // the snapshot taken by captureError carries the handler
            // kind. Feeds the dashboard's RemixCard. Tags are scope-only
            // and dropped at ingest today; the context bucket reaches
            // the event payload.
            try {
              sdk.setContext('remix', { handler: kind });
            } catch {
              // Context failures must not block captureError below.
            }
            sdk.captureError(errorObj);
            // Legacy metadata key kept for back-compat with the
            // 0.1 dashboard renderer; new structured tag replaces
            // it as the canonical filter handle.
            sdk.addMetadata(kind === 'action' ? 'remixAction' : 'remixLoader', 'true');
            try {
              sdk.setTag('remix.handler', kind);
            } catch {
              // Tag failures don't block the captureError above.
            }
          } catch {
            // Defensive isolation — never poison the response because
            // reporting threw.
          }
        }
        throw error;
      }
    };
  };
}

export const withBrowsonicRemixAction = makeWrapper('action');

/**
 * Loader-side counterpart. Wraps a Remix `loader` export the same
 * way `withBrowsonicRemixAction` wraps an `action`. The captured
 * event is tagged `remix.handler: 'loader'` so dashboards can
 * distinguish data-fetch errors from mutation errors.
 *
 * 0.2 — added so consumers can opt loaders into capture per-route
 * without copying the action-wrapper boilerplate.
 */
export const withBrowsonicRemixLoader = makeWrapper('loader');
