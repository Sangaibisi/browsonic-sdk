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
 * - `BROWSONIC_INSTRUMENTATION_VERSION` — string constant exposed
 *   so consumers building their own `reportError` sink can stamp
 *   the wire-up version on the events they POST. Bumped when the
 *   factory's call signature changes.
 *
 * Runtime profile:
 *
 * Browsonic is a **browser-only** error tracker by design — it
 * exists to capture client-side issues that browser users actually
 * experience. The SDK does not, and intentionally will not, ship a
 * server-runtime ingest path. What this entry CAN do:
 *
 *   1. **Validate config** — warn to `console.warn` when
 *      `apiEndpoint` / `appKey` are missing so the misconfiguration
 *      surfaces at server boot instead of silently shipping pages
 *      with no telemetry.
 *   2. **Surface unhandled errors via `onRequestError`** —
 *      forwards to `console.error` so server errors at least land
 *      in the platform's stdout instead of disappearing into Next's
 *      default 500 path silently.
 *
 * Why no fetch-POST default: a previous revision shipped a
 * server-to-/v1/events bridge here. It was reverted because it
 * pulled the SDK's scope toward Sentry-weight server observability
 * — Browsonic is TrackJS-weight by design. Consumers who want
 * server capture supply their own `reportError` callback that POSTs
 * to whatever pipeline they prefer; the SDK doesn't pick one for
 * them.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Version stamp consumers can attach to the events their own
 * `reportError` callback emits. Bump when the factory's call
 * signature changes so user-supplied sinks can branch on it.
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
 *   to `console.error` (or your `reportError` override) with the
 *   request path + route metadata as a structured prefix. The SDK
 *   does not POST to any ingest pipeline by default — Browsonic
 *   is browser-only by design.
 */
export function browsonicInstrumentation(
  options: BrowsonicInstrumentationOptions = {},
): BrowsonicInstrumentation {
  const warn = options.warn ?? defaultWarn;
  // The default report sink prints to `console.error` so unhandled
  // server-runtime errors at least surface in the platform's stdout.
  // We deliberately do NOT ship a fetch-POST default — Browsonic is
  // a browser-only error tracker by design (TrackJS-weight, not
  // Sentry-weight). A previous revision added that bridge; it was
  // reverted because it pulled the SDK's scope toward server-side
  // observability. Consumers who want server capture should supply
  // their own `reportError` callback that POSTs to whatever
  // ingest pipeline they prefer.
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
    // Validation only. No additional bootstrap work fires here —
    // the SDK is browser-only and `register()` runs in the server
    // runtime, so any per-request capture has to live on
    // `onRequestError` below.
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

/**
 * Default `reportError` sink — prints to `console.error` so the
 * unhandled error at least surfaces in stdout. Browsonic is a
 * browser-only error tracker; we deliberately do not ship a
 * server-runtime ingest path. If you want one, supply your own
 * `reportError` callback to `browsonicInstrumentation({ reportError })`.
 */
function defaultReportError(error: unknown, context?: Record<string, unknown>): void {
  console.error('[browsonic]', error, context);
}
