// SPDX-License-Identifier: Apache-2.0

/**
 * `BrowsonicRouteErrorBoundary` — drop-in component for Remix
 * routes' exported `ErrorBoundary`. Each Remix route can export an
 * `ErrorBoundary` Component that the framework renders when the
 * route's loader / action / component throws. Our drop-in captures
 * the error to the SDK on mount and renders a minimal fallback.
 *
 * Wire it up:
 *
 * ```tsx
 * // app/routes/some-route.tsx
 * import { BrowsonicRouteErrorBoundary } from '@browsonic/remix';
 *
 * export { BrowsonicRouteErrorBoundary as ErrorBoundary };
 *
 * export default function Page() {
 *   return <div>...</div>;
 * }
 * ```
 *
 * The component reads the route error via Remix's `useRouteError`
 * hook. Because we don't import `@remix-run/react` (it's a peer
 * dep — type-only), consumers pass the error explicitly OR call
 * `useRouteError` themselves and wrap our boundary. The default
 * export here works against a tiny duck-typed contract that
 * matches the framework's `useRouteError` return shape: the
 * boundary inspects `window.__remixRouteError` if present, then
 * falls back to a "Something went wrong" UI.
 *
 * For maximum control, see {@link captureRouteError} which is the
 * imperative call-site version.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { useEffect, type ReactNode } from 'react';
import { resolveSdk } from './resolve-sdk';

export interface BrowsonicRouteErrorBoundaryProps {
  /**
   * The error to capture. When omitted, the component does NOT
   * attempt to introspect Remix internals — it just renders the
   * fallback. Use `captureRouteError(error)` from the route's
   * `ErrorBoundary` body if you want explicit control.
   */
  error?: unknown;
  /** Optional custom fallback. Defaults to a minimal alert. */
  children?: ReactNode;
}

export function BrowsonicRouteErrorBoundary({
  error,
  children,
}: BrowsonicRouteErrorBoundaryProps): ReactNode {
  useEffect(() => {
    if (error === undefined || error === null) return;
    const sdk = resolveSdk();
    if (!sdk) return;
    const errorObj = error instanceof Error ? error : new Error(coerceMessage(error));
    try {
      // Mirror onto the `remix` context bucket BEFORE capture so the
      // snapshot taken by captureError carries the boundary kind.
      // Feeds the dashboard's RemixCard.
      try {
        sdk.setContext('remix', { handler: 'routeError' });
      } catch {
        // Context failures must not block captureError below.
      }
      sdk.captureError(errorObj);
      sdk.addMetadata('remixRouteError', 'true');
    } catch {
      // Defensive isolation — boundary still renders if reporter throws.
    }
  }, [error]);

  if (children) return children;

  const message =
    error instanceof Error
      ? error.message
      : error !== undefined
        ? coerceMessage(error)
        : 'Unknown error';
  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <p>{message}</p>
    </div>
  );
}

/**
 * Imperative companion to {@link BrowsonicRouteErrorBoundary}.
 * Call inside a Remix route's `ErrorBoundary` body when you'd
 * rather use `useRouteError` from `@remix-run/react` directly:
 *
 * ```tsx
 * import { useRouteError } from '@remix-run/react';
 * import { captureRouteError } from '@browsonic/remix';
 *
 * export function ErrorBoundary() {
 *   const error = useRouteError();
 *   captureRouteError(error);
 *   return <div>{String(error)}</div>;
 * }
 * ```
 */
export function captureRouteError(error: unknown): void {
  const sdk = resolveSdk();
  if (!sdk) return;
  const errorObj = error instanceof Error ? error : new Error(coerceMessage(error));
  try {
    sdk.captureError(errorObj);
    sdk.addMetadata('remixRouteError', 'true');
  } catch {
    // Defensive isolation.
  }
}

/**
 * Safely coerce an unknown value to a string message. Avoids the
 * `'[object Object]'` default-stringification trap by JSON-encoding
 * objects when possible and falling back to a typeof tag otherwise.
 */
function coerceMessage(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return String(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserialisable object]';
    }
  }
  return `[${typeof value}]`;
}
