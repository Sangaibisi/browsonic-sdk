// SPDX-License-Identifier: Apache-2.0

/**
 * Transient scope (Sprint 8 M3). `withScope(fn)` lets callers tag, set
 * context, attach extras, or change the user just for the duration of
 * `fn` — events captured inside `fn` see the modified state, then the
 * SDK is restored to what it was before. Mirrors Sentry's `withScope`
 * so migrating teams keep their muscle memory.
 *
 * Restore semantics rely on a try/finally / Promise.finally envelope —
 * the original state is reinstalled even when the callback throws or
 * the returned promise rejects. The snapshot is shallow: top-level
 * `metadata` / `contexts` / `extras` keys are copied; nested objects
 * remain reference-shared with the live state. setContext/setTag/setExtra
 * write fresh objects (or fresh property entries), so the snapshot's
 * references stay untouched by subsequent set calls inside the scope.
 *
 * Breadcrumbs added inside a scope persist in the telemetry ring buffer
 * — they are NOT undone on exit. This is intentional and matches the
 * "trail of activity" semantic; the API doc on `Scope.addBreadcrumb`
 * makes the divergence explicit.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Breadcrumb, UserContext } from '../types';
import { safeExecute } from '../utils';
import type { Browsonic } from './browsonic';

/**
 * Per-scope mutator surface exposed inside the `withScope` callback.
 * Mutations here apply to events captured during the callback only —
 * the SDK is restored when the callback returns (or rejects). The one
 * exception is {@link addBreadcrumb}: breadcrumbs are appended to the
 * shared telemetry ring buffer and are NOT rolled back, mirroring the
 * "activity trail" semantic.
 *
 * @public Sprint 8 M3
 */
export interface Scope {
  setTag(key: string, value: string | number | boolean): void;
  setContext(name: string, ctx: Record<string, unknown>): void;
  setExtra(key: string, value: unknown): void;
  setUser(user: UserContext): void;
  /**
   * Append a breadcrumb. Persists in the telemetry timeline beyond the
   * scope — breadcrumbs are shared, not transient.
   */
  addBreadcrumb(breadcrumb: Breadcrumb): void;
}

interface ScopeSnapshot {
  metadata: Record<string, string | number | boolean>;
  contexts: Record<string, Record<string, unknown>>;
  extras: Record<string, unknown>;
  user: UserContext | null;
}

function takeSnapshot(sdk: Browsonic): ScopeSnapshot {
  return {
    metadata: { ...sdk.metadata },
    contexts: { ...sdk.contexts },
    extras: { ...sdk.extras },
    user: sdk.user,
  };
}

function restoreSnapshot(sdk: Browsonic, snapshot: ScopeSnapshot): void {
  sdk.metadata = snapshot.metadata;
  sdk.contexts = snapshot.contexts;
  sdk.extras = snapshot.extras;
  sdk.user = snapshot.user;
}

function makeScope(sdk: Browsonic): Scope {
  return {
    setTag: (key, value) => sdk.setTag(key, value),
    setContext: (name, ctx) => sdk.setContext(name, ctx),
    setExtra: (key, value) => sdk.setExtra(key, value),
    setUser: (user) => sdk.setUser(user),
    addBreadcrumb: (breadcrumb) => sdk.addBreadcrumb(breadcrumb),
  };
}

function isPromise<T>(value: unknown): value is Promise<T> {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

/**
 * Run `fn` against a transient scope. Sync overload returns whatever
 * `fn` returns; async overload returns a Promise that resolves with
 * `fn`'s resolved value (and reinstates the snapshot on rejection).
 *
 * The sync vs async split is decided at runtime by inspecting the
 * return value — a plain return restores immediately, a thenable
 * defers restore to `Promise.finally`. The compile-time overloads
 * surface either branch to TS callers.
 */
export function withScope<T>(sdk: Browsonic, fn: (scope: Scope) => Promise<T>): Promise<T>;
export function withScope<T>(sdk: Browsonic, fn: (scope: Scope) => T): T;
export function withScope<T>(sdk: Browsonic, fn: (scope: Scope) => T | Promise<T>): T | Promise<T> {
  const snapshot = takeSnapshot(sdk);
  const scope = makeScope(sdk);

  try {
    const result = fn(scope);
    if (isPromise<T>(result)) {
      return result.then(
        (value) => {
          restoreSnapshot(sdk, snapshot);
          return value;
        },
        (error: unknown) => {
          restoreSnapshot(sdk, snapshot);
          throw error;
        }
      );
    }
    restoreSnapshot(sdk, snapshot);
    return result;
  } catch (error) {
    restoreSnapshot(sdk, snapshot);
    safeExecute(
      () => sdk.debugLog('withScope callback threw; snapshot restored'),
      undefined,
      () => {}
    );
    throw error;
  }
}
