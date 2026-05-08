// SPDX-License-Identifier: Apache-2.0

/**
 * Drop-in components for Next.js App Router error pages.
 *
 * `BrowsonicErrorPage` is meant to be re-exported from `app/error.tsx`
 * and `app/global-error.tsx` — Next.js renders these when a route
 * subtree throws during render or in a server-side data path. The
 * component captures the error to the SDK on mount and forwards
 * Next.js's `reset()` to the user-supplied fallback so the consumer
 * can offer a "try again" affordance.
 *
 * Wire it up:
 *
 * ```tsx
 * // app/error.tsx
 * 'use client';
 * import { BrowsonicErrorPage } from '@browsonic/nextjs';
 * export default BrowsonicErrorPage;
 * ```
 *
 * For `global-error.tsx` (renders when the root layout itself
 * crashes), the component must own the `<html>` and `<body>` shell:
 *
 * ```tsx
 * // app/global-error.tsx
 * 'use client';
 * import { BrowsonicGlobalErrorPage } from '@browsonic/nextjs';
 * export default BrowsonicGlobalErrorPage;
 * ```
 *
 * Defensive contract — same as the React adapter's boundary:
 * - SDK calls wrapped in try/catch.
 * - No-op when SDK is unreachable; the page still renders and `reset`
 *   still works.
 * - The component stack metadata is bounded (the React boundary's
 *   1024-char cap doesn't apply here — Next.js does not give us a
 *   componentStack on error.tsx).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { resolveSdk } from './resolve-sdk';

/**
 * Next.js passes `error` (with optional `digest`) and `reset` to every
 * `app/error.tsx` (and `app/global-error.tsx`) module. Mirroring the
 * shape from `@types/next` keeps consumers off our types — they
 * import the official ones for their app/error.tsx signature.
 *
 * 0.2 adds optional `pathname` + `params`. App Router consumers can
 * thread these in via Next's client hooks:
 *
 * ```tsx
 * 'use client';
 * import { usePathname, useParams } from 'next/navigation';
 * import { BrowsonicErrorPage } from '@browsonic/nextjs';
 * export default function ErrorBoundary({ error, reset }) {
 *   return (
 *     <BrowsonicErrorPage
 *       error={error}
 *       reset={reset}
 *       pathname={usePathname()}
 *       params={useParams()}
 *     />
 *   );
 * }
 * ```
 */
export interface NextErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
  /**
   * Optional canonical pathname from `usePathname()`. Lands as the
   * `nextjs.pathname` tag on the captured event.
   */
  pathname?: string;
  /**
   * Optional dynamic-segment params from `useParams()`. Lands as the
   * `nextjs.params` context on the captured event. Skipped when empty.
   */
  params?: Record<string, string | string[] | undefined>;
}

/**
 * Drop-in `app/error.tsx` component. Captures the error on mount,
 * then renders a minimal "Something went wrong" UI with a Try Again
 * button. To customise the rendered output, copy this 30-line
 * implementation and adjust the JSX — it's intentionally simple so
 * forking is a non-event.
 */
export function BrowsonicErrorPage({
  error,
  reset,
  pathname,
  params,
}: NextErrorPageProps): ReactNode {
  useEffect(() => {
    const sdk = resolveSdk();
    if (!sdk) return;
    try {
      // 0.2 — App Router metadata enrichment. Tags + context land on
      // the active scope BEFORE captureError so they ride along with
      // the event.
      if (typeof pathname === 'string' && pathname.length > 0) {
        try {
          sdk.setTag('nextjs.pathname', pathname);
        } catch {
          // Tag failures don't block the captureError below.
        }
      }
      // Consolidate App Router metadata onto the canonical `nextjs`
      // context bucket so the dashboard's NextJsCard renders a single
      // tailored card (was previously split across `nextjs.params` —
      // an unrecognised key that fell into the generic fallback).
      // `runtime: 'browser'` is set explicitly here because this
      // component is a `'use client'` boundary; server-runtime errors
      // come through the instrumentation entry, not this code path.
      try {
        const ctx: Record<string, unknown> = { runtime: 'browser', source: 'app-router-error' };
        if (typeof pathname === 'string' && pathname.length > 0) ctx.pathname = pathname;
        if (params && Object.keys(params).length > 0) ctx.params = params;
        sdk.setContext('nextjs', ctx);
      } catch {
        // Context failures don't block the captureError below.
      }

      sdk.captureError(error);
      if (error.digest) {
        sdk.addMetadata('nextjsErrorDigest', error.digest);
      }
    } catch {
      // Defensive isolation — error.tsx must not crash if reporting
      // throws. The page below still renders; reset() still works.
    }
  }, [error, pathname, params]);

  return (
    <div role="alert">
      <h2>Something went wrong</h2>
      <p>{error.message}</p>
      <button type="button" onClick={reset}>
        Try again
      </button>
    </div>
  );
}

/**
 * Drop-in `app/global-error.tsx`. Wraps `BrowsonicErrorPage` in the
 * `<html>` / `<body>` shell that Next.js requires when the root
 * layout itself has crashed.
 */
export function BrowsonicGlobalErrorPage(props: NextErrorPageProps): ReactNode {
  return (
    <html lang="en">
      <body>
        <BrowsonicErrorPage {...props} />
      </body>
    </html>
  );
}
