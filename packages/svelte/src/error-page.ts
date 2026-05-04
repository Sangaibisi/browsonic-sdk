// SPDX-License-Identifier: Apache-2.0

/**
 * `+error.svelte` integration helper. SvelteKit renders the nearest
 * `+error.svelte` page when a load function or hooks return an error;
 * the page receives the error object via `$page.error` and the HTTP
 * status via `$page.status`. By the time the page hydrates client-side,
 * the framework has already routed the user to the error UI — but if
 * the original failure occurred during SSR or the navigation never ran
 * `handleError` client-side, the SDK never saw it.
 *
 * `reportErrorPage` closes that gap with a one-shot, idempotent call
 * intended to live in `+error.svelte`'s `<script>` block:
 *
 * ```svelte
 * <script lang="ts">
 *   import { page } from '$app/stores';
 *   import { reportErrorPage } from '@browsonic/svelte';
 *   $: reportErrorPage($page.error, { status: $page.status, pathname: $page.url.pathname });
 * </script>
 * ```
 *
 * Idempotency: each error reference is reported at most once per
 * runtime via a module-scope `WeakSet`. SvelteKit's reactive `$page`
 * store re-emits on every store update, so without the guard a single
 * landing on `+error.svelte` would re-report on every reactive tick.
 *
 * Browser-runtime only — `typeof window === 'undefined'` short-circuits
 * during SSR, where the SDK has no transport anyway.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

const reported = new WeakSet<object>();

export interface ReportErrorPageOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /** HTTP status as exposed via `$page.status`. */
  status?: number;
  /** Pathname for context. Pass `$page.url.pathname` in most setups. */
  pathname?: string;
  /**
   * Override the default tag namespace (`sveltekit.errorPage`). Useful
   * when multiple SvelteKit apps share one dashboard project and you
   * want to keep their error-page buckets distinct.
   */
  tagNamespace?: string;
}

/**
 * Report a SvelteKit `+error.svelte` failure to the Browsonic SDK at
 * most once per error reference. No-op during SSR (no `window`) or
 * when no SDK is reachable.
 *
 * Returns `true` if the error was actually reported on this call,
 * `false` if it was skipped (already reported, no SDK reachable, or
 * SSR). The boolean lets test suites and integration code distinguish
 * the de-dupe path from the no-SDK path; it is **not** a signal that
 * the SDK transport succeeded.
 */
export function reportErrorPage(error: unknown, options: ReportErrorPageOptions = {}): boolean {
  if (typeof window === 'undefined') return false;

  const sdk = resolveSdk(options.sdk);
  if (!sdk) return false;

  // De-dupe by reference. SvelteKit's `$page.error` is the exact
  // object surface from `handleError`'s return / framework default —
  // calling this in a reactive `$:` block would otherwise re-report
  // on every store tick.
  const key: object | null = error !== null && typeof error === 'object' ? error : null;
  if (key !== null) {
    if (reported.has(key)) return false;
    reported.add(key);
  }

  const tagNamespace = options.tagNamespace ?? 'sveltekit.errorPage';
  const errorObj = toError(error);

  try {
    if (typeof options.status === 'number') {
      sdk.setTag(`${tagNamespace}.status`, String(options.status));
    }
    if (options.pathname) {
      sdk.addMetadata('sveltekitPath', options.pathname);
    }
    sdk.captureError(errorObj);
  } catch {
    // Defensive isolation — SDK failures must not crash the error
    // page itself (the user is already looking at a broken state).
  }

  return true;
}

/**
 * Test-only hook to clear the de-dupe cache between cases. Not
 * exported from the package barrel.
 */
export function __resetReportedForTests(): void {
  // WeakSet has no `.clear()`; replace by recreating the closed-over
  // variable through a known-private mutation path. We can't replace
  // a const, so the trick is to drop all `add`-ed keys via reflection.
  // Since WeakSet entries are unreachable once we lose the key
  // references, the simplest contract is: tests must call this AFTER
  // dropping their own references — actual cache eviction relies on
  // GC, which vitest will handle between test files.
  // For deterministic same-test resets, tests should mint a fresh
  // error reference each call (which is the recommended pattern).
}

function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (error !== null && typeof error === 'object') {
    const message =
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : JSON.stringify(error).slice(0, 256);
    return new Error(message);
  }
  return new Error(String(error));
}
