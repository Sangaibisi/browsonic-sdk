// SPDX-License-Identifier: Apache-2.0

/**
 * Astro Actions wrapper. Astro 4.15+ ships server-side actions
 * (`src/actions/index.ts` exports a `server: { ... }` map of
 * `defineAction`-built handlers). When an action throws, Astro
 * surfaces the failure to the calling form / `actions.x.safe()`
 * caller — but by the time the client sees it, runtime context is
 * already gone. `withBrowsonicAstroAction` wraps a handler so any
 * unhandled throw is reported to the SDK first and **then re-thrown**
 * so Astro's own error path runs unchanged.
 *
 * Mirrors `withBrowsonicRouteHandler` from `@browsonic/nextjs` —
 * same shape, same defensive contract. The wrapper is generic over
 * the handler's arg tuple so it composes cleanly with Astro's
 * typed `defineAction({ handler })`.
 *
 * Runtime profile: Astro Actions execute on the server (Node /
 * adapter runtime). The SDK is a browser library, so the wrapper's
 * `resolveSdk()` call is a no-op in pure server contexts — the
 * thrown error still propagates to Astro's error path. When called
 * from a hybrid context that has `window.Browsonic` reachable
 * (test harness, dev server with HMR, etc.) the report fires.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

export interface WithBrowsonicAstroActionOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /**
   * Action name as it should appear on the captured event. Optional
   * — when omitted the wrapper skips the name tag and the dashboard
   * groups failures by stack trace instead. Recommended for any
   * action you actually care about; the names map cleanly to
   * Astro's `actions.x.y` accessors.
   */
  actionName?: string;
  /**
   * Tag namespace prefix. Defaults to `'astro.action'`. Override for
   * multi-app setups where a single dashboard hosts more than one
   * Astro project.
   */
  tagNamespace?: string;
}

/**
 * Wrap an Astro Action `handler` so unhandled throws are captured
 * to the Browsonic SDK before the framework's own error response
 * runs. Returns a handler with the same call signature.
 *
 * Re-throw order matters: Astro only treats the action as failed if
 * the thrown value propagates. Consuming the error here would turn
 * every reported failure into a silent success.
 *
 * @example
 * ```ts
 * // src/actions/index.ts
 * import { defineAction } from 'astro:actions';
 * import { z } from 'astro:schema';
 * import { withBrowsonicAstroAction } from '@browsonic/astro';
 *
 * export const server = {
 *   signup: defineAction({
 *     accept: 'form',
 *     input: z.object({ email: z.string().email() }),
 *     handler: withBrowsonicAstroAction(
 *       async ({ email }) => {
 *         // ... business logic that may throw
 *       },
 *       { actionName: 'signup' },
 *     ),
 *   }),
 * };
 * ```
 */
export function withBrowsonicAstroAction<TArgs extends unknown[], TReturn>(
  handler: (...args: TArgs) => TReturn | Promise<TReturn>,
  options: WithBrowsonicAstroActionOptions = {},
): (...args: TArgs) => Promise<TReturn> {
  const tagNamespace = options.tagNamespace ?? 'astro.action';

  return async (...args: TArgs): Promise<TReturn> => {
    try {
      return await handler(...args);
    } catch (error) {
      const sdk = resolveSdk(options.sdk);
      const errorObj = error instanceof Error ? error : new Error(String(error));

      if (sdk) {
        try {
          if (options.actionName) {
            sdk.setTag(`${tagNamespace}.name`, options.actionName);
          }
          // 0.3: tag the runtime so the dashboard can split Astro
          // Actions failures from Astro view-transitions failures
          // (and from Next.js / Remix server failures further down
          // the stack).
          sdk.setTag('astro.runtime', 'action');
          // Mirror onto the `astro` context bucket so the
          // dashboard's framework-aware AstroCard renders the
          // action metadata. Tags are scope-only and currently
          // dropped at ingest; the context bucket is what reaches
          // the event payload.
          const astroCtx: Record<string, unknown> = { runtime: 'action' };
          if (options.actionName) astroCtx.actionName = options.actionName;
          sdk.setContext('astro', astroCtx);
          sdk.captureError(errorObj);
        } catch {
          // Defensive isolation — the reporter cannot poison the
          // re-throw path that follows.
        }
      }

      // Re-throw so Astro returns the action's failure to the
      // caller. Consuming the error here would mask the failure as
      // a successful return value.
      throw error;
    }
  };
}
