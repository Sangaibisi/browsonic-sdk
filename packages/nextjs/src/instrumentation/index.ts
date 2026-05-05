// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/nextjs/instrumentation` — server-runtime entry for
 * Next.js's `instrumentation.ts` file convention. Next 13.4+
 * looks for a project-root `instrumentation.ts` (or `.js`) and
 * calls its exported `register()` once on server startup, plus
 * its optional `onRequestError(error, request, context)` for any
 * unhandled error in a route handler / server component.
 *
 * What this entry ships:
 *
 * - `browsonicInstrumentation(options)` — factory that returns the
 *   `{ register, onRequestError }` shape Next.js expects. Consumers
 *   wire it once and re-export the two functions verbatim.
 * - `BROWSONIC_INSTRUMENTATION_VERSION` — string constant tagged
 *   on whatever the future server-side capture path emits, useful
 *   for distinguishing "this app is on the new instrumentation
 *   wire-up" from "this app is on the old client-only setup".
 *
 * Runtime profile:
 *
 * The SDK is browser-only — `register()` cannot bootstrap browser
 * capture from the server. What it CAN do today:
 *
 *   1. **Validate config** — warn to `console.warn` when
 *      `apiEndpoint` / `appKey` are missing so the misconfiguration
 *      surfaces at server boot instead of silently shipping pages
 *      with no telemetry.
 *   2. **Future-proof the entry point** — when the SDK gains
 *      server-side capture (Sprint 3 / Sprint 4 source-map pipeline
 *      lands the ingest contract), the same wire-up works without
 *      consumer code change.
 *   3. **Surface unhandled errors via `onRequestError`** —
 *      currently `console.error` so the error doesn't disappear
 *      into Next's default 500 path silently. Future versions can
 *      forward to a server-side ingest endpoint.
 *
 * The factory is intentionally minimal — it ships the entry point
 * Next.js needs without locking us into a specific server-runtime
 * capture implementation that we'd then have to migrate later.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Version stamp the future server-runtime capture path will tag
 * on emitted events. Bump when the wire-up contract changes
 * (consumer-visible — the version sticks to the
 * `nextjs.instrumentation.version` tag).
 */
export const BROWSONIC_INSTRUMENTATION_VERSION = '0.3.0';

export interface BrowsonicInstrumentationOptions {
  /**
   * The Browsonic ingest endpoint URL. Required for any production
   * deploy. Reading from `process.env.BROWSONIC_API_ENDPOINT` is
   * the recommended pattern.
   */
  apiEndpoint?: string;
  /**
   * The app key issued for this Next.js app's project in the
   * Browsonic dashboard. Required for any production deploy.
   */
  appKey?: string;
  /**
   * Environment label (`'production'`, `'staging'`, etc.). Used by
   * the dashboard to filter events. Defaults to
   * `process.env.NODE_ENV` if available.
   */
  environment?: string;
  /**
   * Override the warning sink. Defaults to `console.warn`. Tests
   * pass a stub to assert the warning message without polluting
   * the test runner's stdout.
   */
  warn?: (message: string) => void;
  /**
   * Override the error sink for `onRequestError`. Defaults to
   * `console.error`. Tests pass a stub to capture the call
   * without polluting stdout.
   */
  reportError?: (error: unknown, context?: Record<string, unknown>) => void;
}

/**
 * Subset of Next.js's `RequestErrorContext` (the third argument
 * to `onRequestError`). Captures only the fields we forward —
 * the full type lives in `next/dist/server/instrumentation/types`
 * and we don't import from `next/*` runtime paths to keep this
 * entry's dependency graph minimal.
 */
export interface NextRequestErrorContextLike {
  routerKind?: 'Pages Router' | 'App Router';
  routePath?: string;
  routeType?: 'render' | 'route' | 'action' | 'middleware';
  renderSource?: string;
  revalidateReason?: string;
  /** Allow upstream to surface fields we don't statically model. */
  [key: string]: unknown;
}

/**
 * Subset of the `request` argument to `onRequestError`. Next.js
 * passes a plain object with `path` + headers; we forward `path`
 * to context.
 */
export interface NextRequestLike {
  path?: string;
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * The shape Next.js expects from `instrumentation.ts` — exactly
 * the two named exports the framework looks for. Consumers
 * destructure the result and re-export.
 */
export interface BrowsonicInstrumentation {
  register: () => Promise<void> | void;
  onRequestError: (
    error: unknown,
    request: NextRequestLike,
    context: NextRequestErrorContextLike,
  ) => Promise<void> | void;
}

/**
 * Build the `{ register, onRequestError }` pair Next.js's
 * `instrumentation.ts` file convention expects. Wire it once at
 * the project root:
 *
 * @example
 * ```ts
 * // instrumentation.ts (project root, alongside `next.config.mjs`)
 * import { browsonicInstrumentation } from '@browsonic/nextjs/instrumentation';
 *
 * const { register, onRequestError } = browsonicInstrumentation({
 *   apiEndpoint: process.env.BROWSONIC_API_ENDPOINT,
 *   appKey: process.env.BROWSONIC_APP_KEY,
 *   environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
 * });
 *
 * export { register, onRequestError };
 * ```
 *
 * Behaviour today:
 *
 * - `register()` validates that `apiEndpoint` + `appKey` are set
 *   and emits one `console.warn` per missing field. Returns
 *   immediately on success (no async work).
 * - `onRequestError(error, request, context)` forwards the error
 *   to `console.error` with the request path + route metadata as
 *   a structured prefix. Tests can override the sink via the
 *   `reportError` option.
 *
 * Future versions add server-runtime capture without changing the
 * factory's call signature — the entry point is forward-compatible.
 */
export function browsonicInstrumentation(
  options: BrowsonicInstrumentationOptions = {},
): BrowsonicInstrumentation {
  const warn = options.warn ?? defaultWarn;
  const reportError = options.reportError ?? defaultReportError;

  const register = (): void => {
    if (!options.apiEndpoint) {
      warn(
        '[browsonic] instrumentation.register: missing `apiEndpoint`. Set BROWSONIC_API_ENDPOINT or pass `apiEndpoint` to browsonicInstrumentation().',
      );
    }
    if (!options.appKey) {
      warn(
        '[browsonic] instrumentation.register: missing `appKey`. Set BROWSONIC_APP_KEY or pass `appKey` to browsonicInstrumentation().',
      );
    }
    // Future server-runtime capture init lands here. The version
    // stamp is exported so future events can carry it without
    // re-inferring from the call site.
  };

  const onRequestError = (
    error: unknown,
    request: NextRequestLike,
    context: NextRequestErrorContextLike,
  ): void => {
    try {
      reportError(error, {
        'nextjs.instrumentation.version': BROWSONIC_INSTRUMENTATION_VERSION,
        'nextjs.path': request.path ?? null,
        'nextjs.method': request.method ?? null,
        'nextjs.routerKind': context.routerKind ?? null,
        'nextjs.routePath': context.routePath ?? null,
        'nextjs.routeType': context.routeType ?? null,
        'nextjs.renderSource': context.renderSource ?? null,
        'nextjs.revalidateReason': context.revalidateReason ?? null,
      });
    } catch {
      // Defensive isolation — a thrown report sink must never
      // propagate into Next's error pipeline (would mask the
      // original error and crash the request lifecycle).
    }
  };

  return { register, onRequestError };
}

function defaultWarn(message: string): void {
  console.warn(message);
}

function defaultReportError(error: unknown, context?: Record<string, unknown>): void {
  console.error('[browsonic]', error, context);
}
