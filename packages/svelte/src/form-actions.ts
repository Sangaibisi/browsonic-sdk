// SPDX-License-Identifier: Apache-2.0

/**
 * SvelteKit form-action wrapper. SvelteKit `actions: {}` handlers run
 * server-side and report failures to the client through the framework's
 * action result protocol — by the time the client sees the failure,
 * stack frames and runtime context are already gone. `withBrowsonicAction`
 * wraps a handler so any throw is reported to the SDK first (when one
 * is reachable on the runtime) and **then re-thrown** so SvelteKit's
 * own error-result path runs unchanged.
 *
 * Why a structural `ActionEventLike` shape instead of `import { ... } from '@sveltejs/kit'`:
 * the adapter does not depend on `@sveltejs/kit`. The shape below
 * matches both the server `RequestEvent` SvelteKit hands to actions
 * and any test double — only the fields we report (`url.pathname`,
 * `request.method`, optional `route.id`) are required.
 *
 * Runtime profile: identical to `handleErrorWithBrowsonic` — when no
 * browser SDK is reachable (SSR/Node runtime without a global
 * `window.Browsonic`), the wrapper still runs the action and re-throws
 * verbatim. The SSR side is intentionally a no-op for capture; consumers
 * who want server-runtime telemetry wire their own logger alongside.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Subset of SvelteKit's `RequestEvent` that the wrapper reads. Captures
 * only the fields it forwards as metadata; everything else passes
 * through to the wrapped handler unchanged.
 */
export interface ActionEventLike {
  url: { pathname: string };
  request?: { method?: string };
  route?: { id?: string | null };
}

export interface WithBrowsonicActionOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /**
   * Action name as it appears in the dashboard. Optional — when omitted
   * the wrapper falls back to the route id or `'default'`.
   */
  actionName?: string;
  /**
   * Tag namespace prefix. Default `'sveltekit.action'`. Override when
   * a project hosts multiple SvelteKit apps and wants distinct
   * dashboard buckets.
   */
  tagNamespace?: string;
}

/**
 * Wrap a SvelteKit form-action handler so unhandled throws land in the
 * Browsonic SDK before the framework's own error path runs. The
 * wrapper:
 *
 *   1. Awaits the original action.
 *   2. On throw — captures the error, attaches `sveltekitPath` /
 *      `sveltekit.action.name` / `sveltekit.action.method` metadata,
 *      then re-throws so SvelteKit returns the action's
 *      `ActionFailure` to the client.
 *   3. On success — returns the value untouched.
 *
 * Re-throw order matters: SvelteKit only treats the action as failed
 * if the thrown value propagates. Consuming the error here would turn
 * every reported failure into a silent 200 response.
 *
 * @example
 * ```ts
 * // src/routes/login/+page.server.ts
 * import { withBrowsonicAction } from '@browsonic/svelte';
 *
 * export const actions = {
 *   default: withBrowsonicAction(async ({ request }) => {
 *     const data = await request.formData();
 *     // ... business logic that may throw
 *   }, { actionName: 'login.default' }),
 * };
 * ```
 */
export function withBrowsonicAction<E extends ActionEventLike, R>(
  handler: (event: E) => R | Promise<R>,
  options: WithBrowsonicActionOptions = {},
): (event: E) => Promise<R> {
  const tagNamespace = options.tagNamespace ?? 'sveltekit.action';

  return async (event) => {
    try {
      return await handler(event);
    } catch (err) {
      const sdk = resolveSdk(options.sdk);
      const errorObj = err instanceof Error ? err : new Error(String(err));

      if (sdk) {
        try {
          const name = options.actionName ?? event.route?.id ?? 'default';
          sdk.setTag(`${tagNamespace}.name`, name);
          if (event.request?.method) {
            sdk.setTag(`${tagNamespace}.method`, event.request.method);
          }
          if (event.url.pathname) {
            sdk.addMetadata('sveltekitPath', event.url.pathname);
          }
          // Mirror onto the `sveltekit` context bucket so the
          // dashboard's framework-aware SvelteKitCard renders the
          // action metadata. Tags are scope-only and dropped at
          // ingest today; the context bucket is what reaches the
          // event payload.
          const ctx: Record<string, unknown> = { kind: 'action', actionName: name };
          if (event.request?.method) ctx.method = event.request.method;
          if (event.url?.pathname) ctx.path = event.url.pathname;
          if (event.route?.id) ctx.routeId = event.route.id;
          sdk.setContext('sveltekit', ctx);
          sdk.captureError(errorObj);
        } catch {
          // Defensive isolation — SDK failures must never poison the
          // re-throw path that follows.
        }
      }

      // Re-throw so SvelteKit returns the action's failure to the
      // client. Consuming the error here would mask the failure as a
      // successful 200 response.
      throw err;
    }
  };
}
