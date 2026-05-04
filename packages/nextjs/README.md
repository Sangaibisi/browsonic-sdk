# @browsonic/nextjs

Next.js adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — App Router error-page components (with optional `pathname` / `params` context), route-handler capture wrapper, Pages Router companions (`browsonicPagesAppInit` / `browsonicPagesErrorInitialProps`), config wrapper, plus all the React-side primitives re-exported from [`@browsonic/react`](https://www.npmjs.com/package/@browsonic/react).

> **Status:** 0.2 surface — App Router `BrowsonicErrorPage` / `BrowsonicGlobalErrorPage` accept optional `pathname` + `params` props that consumers thread from `usePathname()` / `useParams()` and land as `nextjs.pathname` tag + `nextjs.params` context. Pages Router companions ship for `pages/_app.tsx` (`browsonicPagesAppInit`) and `pages/_error.tsx` (`browsonicPagesErrorInitialProps`). 0.3 features (build-time sourcemap upload via `withBrowsonicConfig`, `instrumentation.ts` auto-registration) are deferred until the Sprint 3 / Sprint 4 source-map pipeline lands.

## Why this adapter

Next.js's App Router has framework-specific error surfaces that the React adapter alone doesn't cover:

1. **`app/error.tsx`** is rendered by Next.js when a route subtree throws. The component is a Client Component that receives `{ error, reset }`. We ship a drop-in for it.
2. **`app/global-error.tsx`** owns the `<html>` / `<body>` shell and is rendered when the root layout itself crashes. We ship a drop-in for it too.
3. **`app/api/.../route.ts`** route handlers run server-side. A wrapper forwards thrown errors to the SDK (when reachable) before re-throwing them so Next.js can serve its 500.

This package depends on `@browsonic/react` and re-exports its surface so Next.js consumers install one package, not two.

## Install

```bash
npm install @browsonic/sdk @browsonic/react @browsonic/nextjs
```

`@browsonic/sdk`, `@browsonic/react`, `next` (≥13.4), and `react` (18+) are all peer dependencies.

## Quickstart — App Router error pages

```tsx
// app/error.tsx
'use client';
import { BrowsonicErrorPage } from '@browsonic/nextjs';
export default BrowsonicErrorPage;
```

```tsx
// app/global-error.tsx
'use client';
import { BrowsonicGlobalErrorPage } from '@browsonic/nextjs';
export default BrowsonicGlobalErrorPage;
```

The components capture `{ error, digest }` to the SDK on mount, then render a minimal "Something went wrong" UI with a Try Again button. To customise, copy the 30-line implementation from [`src/error-page.tsx`](./src/error-page.tsx) and adjust the JSX.

To attach route-context to captured errors, wrap the default export with `pathname` and `params` from Next's hooks:

```tsx
// app/error.tsx
'use client';
import { usePathname, useParams } from 'next/navigation';
import { BrowsonicErrorPage } from '@browsonic/nextjs';

export default function ErrorPage(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <BrowsonicErrorPage {...props} pathname={usePathname()} params={useParams()} />;
}
```

The boundary tags the captured event with `nextjs.pathname` and lands `params` under the `nextjs.params` context bucket so dashboards can group errors by route shape.

## Quickstart — Pages Router (Next ≤ 12 / opt-in 13+)

For projects on the Pages Router, two companions cover the equivalent surfaces:

```tsx
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { browsonicPagesAppInit } from '@browsonic/nextjs';

browsonicPagesAppInit({
  apiEndpoint: 'https://your-ingest-endpoint.test/v1/events',
  appKey: 'your-app-key',
});

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
```

```tsx
// pages/_error.tsx
import type { NextPage, NextPageContext } from 'next';
import { browsonicPagesErrorInitialProps } from '@browsonic/nextjs';

interface ErrorProps {
  statusCode: number;
}

const Error: NextPage<ErrorProps> = ({ statusCode }) => <div>Error {statusCode}</div>;

Error.getInitialProps = async (ctx: NextPageContext) => {
  await browsonicPagesErrorInitialProps(ctx);
  return { statusCode: (ctx.res?.statusCode ?? ctx.err) ? 500 : 404 };
};

export default Error;
```

`browsonicPagesAppInit` initialises the SDK once on the client and is a no-op on the server. `browsonicPagesErrorInitialProps` captures whatever Next put on `ctx.err`, tagged with `nextjs.runtime: 'pages-error'`.

## Quickstart — Route handlers

```ts
// app/api/checkout/route.ts
import { withBrowsonicRouteHandler } from '@browsonic/nextjs';

export const POST = withBrowsonicRouteHandler(async (req: Request) => {
  const data = await req.json();
  if (!data.email) throw new Error('email required');
  return Response.json({ ok: true });
});
```

The wrapper forwards the thrown `Error` to `sdk.captureError`, tags it with `nextjsRouteHandler: 'true'`, and re-throws — Next.js's normal 500 path is preserved.

## Quickstart — `next.config.js`

```js
// next.config.mjs
import { withBrowsonicConfig } from '@browsonic/nextjs';

export default withBrowsonicConfig({
  reactStrictMode: true,
  // your config
});
```

In 0.2 this is a passthrough. Adopt it now and pick up future build-time integrations (sourcemap upload, `instrumentation.ts` auto-registration) without touching your config file again. Both planned for 0.3 once the Sprint 3 / Sprint 4 source-map pipeline lands.

## Quickstart — Boundary inside Client Components

The full React surface re-exports through this package, so anywhere in your `'use client'` tree you can:

```tsx
'use client';
import { BrowsonicErrorBoundary, useUser } from '@browsonic/nextjs';

export function App() {
  useUser({ id: 'u1' });
  return (
    <BrowsonicErrorBoundary fallback={(error, reset) => <div>{error.message}</div>}>
      <Routes />
    </BrowsonicErrorBoundary>
  );
}
```

## Naming note

`withBrowsonic` is the React **HOC** (re-exported from `@browsonic/react`).
`withBrowsonicConfig` is the Next.js **config wrapper** (this package).
The split mirrors `@sentry/nextjs`'s `withSentryConfig` pattern.

## Defensive contract

Same as every other adapter:

- The host app must never crash because reporting failed.
- SDK calls are wrapped in `try { ... } catch {}`.
- All surfaces work without an SDK present (page still renders, route handler still throws upstream, config still passes through).

## What this package does NOT do (yet)

- **Sourcemap upload at build time.** The deferred Sprint 3 / Sprint 4 source-map pipeline will wire this through `withBrowsonicConfig`. Tracked for 0.3.
- **`instrumentation.ts` auto-registration.** Planned for 0.3 alongside the sourcemap pipeline so the SDK can register itself without consumer wiring.
- **Server-runtime capture.** The SDK is a browser library; route-handler errors that occur in pure Node have no `window` to write to. The wrapper still re-throws so your handler returns its expected status.
- **Edge runtime instrumentation.** Edge runtimes lack a stable global Browsonic singleton — adopt the SDK in the client layer and use the route-handler wrapper for opportunistic capture.
- **Pages Router data layer instrumentation** (`getServerSideProps` / `getStaticProps`). Will be revisited only if Pages Router consumer demand surfaces.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
