// SPDX-License-Identifier: Apache-2.0

/**
 * Pinia integration. When an action throws (or rejects) Pinia's
 * `$onAction.onError` hook fires before the error keeps bubbling out
 * of the action call. We use that hook to stamp the SDK's scope with
 * a `pinia` context bucket — store id, action name, args, and an
 * opt-in state snapshot — so when the Vue boundary (or a later
 * `captureError`) processes the same error, the operator-facing
 * event already carries the action that caused it.
 *
 * Why a structural `PiniaLike` shape instead of `import { Pinia } from 'pinia'`:
 * the adapter does not depend on `pinia`. The shapes below cover
 * Pinia 2.x and any plugin host that exposes the same `pinia.use(plugin)`
 * + `store.$onAction(callback)` contract — useful for tests and
 * vendored Pinia forks.
 *
 * Defensive contract:
 * - `setContext` is wrapped in try/catch so a thrown SDK call cannot
 *   propagate out of Pinia's error handler (which would crash the
 *   action's caller in unrelated ways).
 * - State capture is opt-in (`captureState: true`). Pinia stores
 *   often hold auth tokens / PII; defaulting to off keeps the
 *   adapter safe for the most common store shape.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/**
 * Subset of Pinia's `StoreGeneric` we touch. Pinia 2.x stores expose
 * a much richer API; we only require `$id`, `$state`, and the
 * `$onAction(callback) → unsubscribe` subscription.
 */
export interface PiniaStoreLike {
  $id: string;
  $state: unknown;
  $onAction: (
    callback: (context: PiniaActionContextLike) => void,
    detached?: boolean,
  ) => () => void;
}

/**
 * Subset of Pinia's `StoreOnActionListenerContext` we read in the
 * onError callback. `after` is unused here but kept on the type so
 * future opt-ins (e.g. action-success breadcrumbs) don't break the
 * structural contract.
 */
export interface PiniaActionContextLike {
  name: string;
  store: PiniaStoreLike;
  args: unknown[];
  after: (callback: (result: unknown) => void) => void;
  onError: (callback: (error: unknown) => void) => void;
}

/**
 * Subset of Pinia's `Pinia` instance we use. Only `pinia.use(plugin)`
 * is required — that's enough to wire every store the host registers
 * (now and later) without touching app bootstrap order.
 */
export interface PiniaLike {
  use: (plugin: (context: { store: PiniaStoreLike }) => void) => unknown;
}

export interface InstallPiniaIntegrationOptions {
  /**
   * Browsonic SDK instance. When omitted the function falls back to
   * `window.Browsonic.getBrowsonic()` (matches the rest of the
   * adapter's resolution order). If neither is reachable the
   * integration installs but emits no-ops.
   */
  sdk?: Browsonic | null;
  /**
   * Capture a JSON snapshot of `store.$state` alongside the action
   * context. Defaults to `false` because Pinia stores commonly hold
   * sensitive values (auth tokens, user PII, draft form data) and
   * operators must opt in per app once they've audited what's safe
   * to ship to the dashboard.
   */
  captureState?: boolean;
  /**
   * Stores to skip — match by `store.$id`. Useful for opting an auth
   * or wallet store out without affecting the rest of the app.
   */
  ignoreStores?: string[];
  /**
   * Override the context bucket name. Defaults to `'pinia'`. Custom
   * names let consumers run multiple Pinia instances side-by-side
   * (rare, but possible in micro-frontend setups) without one
   * clobbering the other's context.
   */
  contextName?: string;
  /**
   * Cap the serialised args / state at this many characters. Default
   * 4096. Pinia state can be deep; without a cap the context bucket
   * blows up the event payload and gets dropped server-side.
   */
  maxLength?: number;
}

/**
 * Wire a Pinia instance into the Browsonic SDK so that any unhandled
 * action error carries `setContext('pinia', { storeId, action, args })`
 * by the time it reaches the Vue boundary or window error handler.
 *
 * Returns nothing — Pinia plugins live on the instance for its
 * lifetime; per-store unsubscribe handles are not exposed because
 * this integration is meant to be installed once at bootstrap.
 *
 * @example
 * ```ts
 * import { createPinia } from 'pinia';
 * import { installPiniaIntegration } from '@browsonic/vue';
 *
 * const pinia = createPinia();
 * installPiniaIntegration(pinia, { captureState: false });
 * app.use(pinia);
 * ```
 */
export function installPiniaIntegration(
  pinia: PiniaLike,
  options: InstallPiniaIntegrationOptions = {},
): void {
  const captureState = options.captureState ?? false;
  const ignoreStores = options.ignoreStores ?? [];
  const contextName = options.contextName ?? 'pinia';
  const maxLength = options.maxLength ?? 4096;

  pinia.use(({ store }) => {
    if (ignoreStores.includes(store.$id)) return;

    store.$onAction(({ name, args, onError }) => {
      onError((error) => {
        const sdk = options.sdk ?? resolveSdk();
        if (!sdk) return;

        try {
          const ctx: Record<string, unknown> = {
            storeId: store.$id,
            action: name,
            args: safeStringify(args, maxLength),
          };
          if (captureState) {
            ctx.state = safeStringify(store.$state, maxLength);
          }
          // Best-effort error message — the actual `captureError` call
          // happens elsewhere (boundary, window handler). We attach a
          // string mirror so the context is self-contained even if the
          // capture path drops by the time the dashboard reads it.
          ctx.errorMessage = error instanceof Error ? error.message : String(error);
          sdk.setContext(contextName, ctx);
        } catch {
          // setContext failures must never propagate out of $onAction —
          // they would crash the action's caller in unrelated ways.
        }
      });
    });
  });
}

function safeStringify(value: unknown, maxLength: number): string {
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_key, v: unknown) => {
      if (typeof v === 'object' && v !== null) {
        if (seen.has(v)) return '[circular]';
        seen.add(v);
      }
      if (typeof v === 'function') return '[function]';
      if (typeof v === 'bigint') return v.toString();
      return v;
    });
    if (json === undefined) return String(value).slice(0, maxLength);
    return json.length > maxLength ? `${json.slice(0, maxLength)}…` : json;
  } catch {
    return '[unserializable]';
  }
}
