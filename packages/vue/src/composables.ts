// SPDX-License-Identifier: Apache-2.0

/**
 * Composition API composables for the Vue adapter. Three primitives
 * mirror the React adapter (`useBrowsonic`, `useUser`, `useCaptureError`)
 * so docs and migration guides translate one-to-one.
 *
 * Resolution order: `inject(browsonicInjectionKey)` first (set by the
 * plugin) → `resolveSdk()` global window fallback → `null`. The fallback
 * lets composables work even when the host has not installed the plugin,
 * matching the SDK's "no-config" UMD path.
 *
 * All composables are no-ops when no SDK is reachable. They MUST NEVER
 * throw — a thrown composable would propagate through the Vue render
 * tree and crash the host application.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { inject, watch, type Ref } from 'vue';
import type { Breadcrumb, Browsonic, UserContext } from '@browsonic/sdk';
import { browsonicInjectionKey } from './inject-key';
import { resolveSdk } from './resolve-sdk';

/**
 * Resolve the Browsonic SDK in the current Vue setup scope. Prefers
 * the plugin-provided instance; falls back to the global window
 * singleton; returns `null` if neither is reachable.
 */
export function useBrowsonic(): Browsonic | null {
  const provided = inject(browsonicInjectionKey, null);
  if (provided) return provided;
  return resolveSdk();
}

/**
 * Set the current user context on the Browsonic SDK while the
 * component is mounted. Pass `null` (or `ref(null)`) to clear the user
 * context.
 *
 * The composable accepts either a plain value or a `Ref<UserContext | null>`;
 * when a ref is passed it is watched and re-applied on change. When the
 * component unmounts the user is NOT cleared automatically — clearing
 * on unmount would race with subsequent mounts of sibling components
 * and produce flickering identity. The caller decides when to clear by
 * setting the ref to `null`.
 */
export function useUser(user: UserContext | null | Ref<UserContext | null>): void {
  const sdk = useBrowsonic();
  if (!sdk) return;

  const apply = (value: UserContext | null): void => {
    try {
      if (value === null) {
        sdk.clearUser();
      } else {
        sdk.setUser(value);
      }
    } catch {
      // Defensive isolation — a thrown setUser must not propagate.
    }
  };

  if (isRef(user)) {
    watch(user, (next) => apply(next), { immediate: true, deep: true });
  } else {
    apply(user);
  }
}

/**
 * Returns a stable callback that forwards to `sdk.captureError`. Use
 * inside event handlers and try/catch sites — places the boundary's
 * `errorCaptured` cannot reach (async, event handlers). The callback
 * is a no-op when no SDK is reachable.
 */
export function useCaptureError(): (error: Error) => void {
  const sdk = useBrowsonic();
  return (error: Error): void => {
    if (!sdk) return;
    try {
      sdk.captureError(error);
    } catch {
      // Same defensive contract as the boundary.
    }
  };
}

/**
 * Typed wrapper around `sdk.addBreadcrumb`. Returns a stable callback
 * that takes a {@link Breadcrumb} payload and forwards it to the SDK.
 * No-op when the SDK is not reachable; throws are swallowed to keep
 * the host app stable.
 *
 * @example
 * ```ts
 * const addBreadcrumb = useBreadcrumb();
 * addBreadcrumb({ category: 'ui', message: 'cart cleared' });
 * ```
 */
export function useBreadcrumb(): (breadcrumb: Breadcrumb) => void {
  const sdk = useBrowsonic();
  return (breadcrumb: Breadcrumb): void => {
    if (!sdk) return;
    try {
      sdk.addBreadcrumb(breadcrumb);
    } catch {
      // Defensive: a thrown breadcrumb must not bubble.
    }
  };
}

function isRef<T>(value: T | Ref<T>): value is Ref<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    '__v_isRef' in value &&
    (value as { __v_isRef: boolean }).__v_isRef === true
  );
}
