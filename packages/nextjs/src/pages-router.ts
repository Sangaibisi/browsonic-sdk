// SPDX-License-Identifier: Apache-2.0

/**
 * Pages Router companions. Next.js 14/15 still ship the legacy
 * `pages/` directory mode alongside the new `app/` directory; both
 * surface server-rendered errors through `pages/_error.tsx` and
 * client-side wraps through `pages/_app.tsx`. This file ships two
 * reusable hooks for those entry points without forcing
 * `pages/`-specific imports on hosts that only use App Router.
 *
 * Why a structural `NextPageContextLike` instead of importing
 * `NextPageContext` from `next`: the adapter does not bundle the
 * `next` package's type imports inside our build (next stays a peer
 * dep). The shape below covers exactly the fields we read.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { resolveSdk } from './resolve-sdk';

/**
 * Subset of `NextPageContext` (from `next`) we read inside
 * `getInitialProps`. The full Next.js type carries `req`, `res`,
 * `pathname`, `query`, etc. — we only need the error info.
 */
export interface NextPageContextLike {
  err?: (Error & { statusCode?: number }) | null;
  res?: { statusCode?: number };
  pathname?: string;
  asPath?: string;
}

export interface BrowsonicErrorPageProps {
  /**
   * HTTP status returned for the request. Mirrors the value Next.js
   * passes to `_error.tsx` itself.
   */
  statusCode: number;
  /**
   * Optional canonical pathname (`ctx.pathname`, e.g. `'/products/[id]'`).
   * Surfaced as the `nextjs.pagePath` tag on the captured event.
   */
  pagePath?: string;
}

/**
 * `getInitialProps` factory for `pages/_error.tsx`. Captures the
 * error to the SDK (server-rendered errors flow through here) and
 * returns a `{ statusCode, pagePath }` shape suitable for the page
 * component to render.
 *
 * ```tsx
 * // pages/_error.tsx
 * import { browsonicPagesErrorInitialProps } from '@browsonic/nextjs';
 * function ErrorPage({ statusCode }) { return <h1>{statusCode}</h1>; }
 * ErrorPage.getInitialProps = browsonicPagesErrorInitialProps;
 * export default ErrorPage;
 * ```
 *
 * Pages Router note: `_error.tsx` runs both on the server (during
 * SSR error handling) and on the client. The capture path is
 * intentionally browser-friendly — `resolveSdk()` returns null in
 * Node, so the server invocation no-ops on the SDK side and only
 * returns the props.
 */
export const browsonicPagesErrorInitialProps = (
  ctx: NextPageContextLike,
): BrowsonicErrorPageProps => {
  const statusCode = ctx.res?.statusCode ?? ctx.err?.statusCode ?? 404;
  const pagePath = ctx.pathname;

  if (ctx.err) {
    const sdk = resolveSdk();
    if (sdk) {
      try {
        const errorObj = ctx.err instanceof Error ? ctx.err : new Error(String(ctx.err));
        sdk.captureError(errorObj);
        if (typeof statusCode === 'number') {
          sdk.addMetadata('nextjsStatusCode', String(statusCode));
        }
        if (typeof pagePath === 'string' && pagePath.length > 0) {
          sdk.setTag('nextjs.pagePath', pagePath);
        }
        if (typeof ctx.asPath === 'string' && ctx.asPath.length > 0) {
          sdk.addMetadata('nextjsAsPath', ctx.asPath);
        }
      } catch {
        // Defensive — `_error.tsx` must never throw from the reporter.
      }
    }
  }

  const props: BrowsonicErrorPageProps = { statusCode };
  if (typeof pagePath === 'string' && pagePath.length > 0) {
    props.pagePath = pagePath;
  }
  return props;
};

/**
 * Side-effect-free `pages/_app.tsx` ergonomic helper. Reports global
 * unhandled rejections + window-level errors to the SDK from the
 * client side. `_app.tsx` only runs on the client for hydration, so
 * the work here happens once per page load.
 *
 * Usage:
 *
 * ```tsx
 * // pages/_app.tsx
 * import { browsonicPagesAppInit } from '@browsonic/nextjs';
 * import { useEffect } from 'react';
 *
 * export default function MyApp({ Component, pageProps }) {
 *   useEffect(() => browsonicPagesAppInit(), []);
 *   return <Component {...pageProps} />;
 * }
 * ```
 *
 * The function returns a teardown callback so the cleanup runs on
 * route teardown / fast refresh — preventing duplicate listeners.
 */
export function browsonicPagesAppInit(): () => void {
  if (typeof window === 'undefined') {
    return () => {
      /* SSR no-op */
    };
  }

  const onError = (event: ErrorEvent): void => {
    const sdk = resolveSdk();
    if (!sdk) return;
    try {
      const errorObj =
        event.error instanceof Error
          ? event.error
          : new Error(String(event.message ?? 'Unknown error'));
      sdk.captureError(errorObj);
    } catch {
      // Defensive — never propagate a reporter failure into Next's
      // own error handler.
    }
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
    const sdk = resolveSdk();
    if (!sdk) return;
    try {
      const reason = event.reason as unknown;
      const errorObj = reason instanceof Error ? reason : new Error(String(reason));
      sdk.captureError(errorObj);
    } catch {
      // Defensive — see onError above.
    }
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandledRejection);

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  };
}
