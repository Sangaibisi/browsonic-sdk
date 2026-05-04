# @browsonic/remix

Remix adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — drop-in for route `ErrorBoundary` exports, action / loader wrappers (with `remix.handler` runtime tag), `entry.client.tsx` bootstrap helper, route-hierarchy navigation breadcrumb hook, plus all React-side primitives re-exported from [`@browsonic/react`](https://www.npmjs.com/package/@browsonic/react).

> **Status:** 0.3 surface — route-error boundary drop-in, imperative `captureRouteError` companion, action + loader wrappers, `bootstrapBrowsonic({ apiEndpoint, … })` `entry.client.tsx` helper, `useRemixNavigationBreadcrumbs(useNavigation(), useMatches())` hook with route hierarchy in breadcrumb data, full React surface re-export. Vite + `@remix-run/react` legacy mode both supported (no runtime Remix imports — peer-only types).

## Why this adapter

Remix's error model is route-scoped: each route module can export an `ErrorBoundary` component that the framework renders when the route's loader / action / component throws. We ship a drop-in that captures the error on mount.

For server-side action / loader errors, the wrapper forwards thrown errors to a browser SDK if one is reachable (typical on the client navigation path) and re-throws so Remix's response pipeline is preserved.

This package depends on `@browsonic/react` and re-exports its surface, mirroring the Next.js adapter's "one install for the whole stack" pattern.

## Install

```bash
npm install @browsonic/sdk @browsonic/react @browsonic/remix
```

`@browsonic/sdk`, `@browsonic/react`, and `react` (18+) are peer dependencies.

## Quickstart — Route ErrorBoundary

```tsx
// app/routes/some-route.tsx
import { useRouteError } from '@remix-run/react';
import { BrowsonicRouteErrorBoundary, captureRouteError } from '@browsonic/remix';

export function ErrorBoundary() {
  const error = useRouteError();
  // Pass the error through; the boundary captures + renders fallback
  return <BrowsonicRouteErrorBoundary error={error} />;
}

export default function Page() {
  return <div>...</div>;
}
```

Or use the imperative companion when you want a custom fallback UI:

```tsx
import { useRouteError } from '@remix-run/react';
import { captureRouteError } from '@browsonic/remix';

export function ErrorBoundary() {
  const error = useRouteError();
  captureRouteError(error);
  return <MyCustomErrorScreen error={error} />;
}
```

## Quickstart — `entry.client.tsx` bootstrap

```tsx
// app/entry.client.tsx
import { RemixBrowser } from '@remix-run/react';
import { startTransition, StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { bootstrapBrowsonic } from '@browsonic/remix';

bootstrapBrowsonic({
  apiEndpoint: 'https://your-ingest-endpoint.test/v1/events',
  appKey: 'your-app-key',
  environment: 'production',
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <RemixBrowser />
    </StrictMode>,
  );
});
```

`bootstrapBrowsonic` reads any existing `window.Browsonic.config` (so the server-side `entry.server.tsx` can serialise per-request fields like `release`), merges your options on top, and returns the SDK singleton. SSR-safe — Node calls return `null` without touching globals.

## Quickstart — Action / loader wrappers

```ts
// app/routes/checkout.tsx
import { withBrowsonicRemixAction, withBrowsonicRemixLoader } from '@browsonic/remix';

export const loader = withBrowsonicRemixLoader(async ({ request }) => {
  // ... data fetch that may throw
});

export const action = withBrowsonicRemixAction(async ({ request }) => {
  const data = await request.formData();
  if (!data.get('email')) throw new Error('email required');
  return { ok: true };
});
```

Both wrappers tag the captured event with `remix.handler: 'action' | 'loader'` so dashboards can distinguish data-fetch errors from mutation errors. Legacy `remixAction` / new `remixLoader` metadata keys preserved for back-compat.

## Quickstart — Navigation breadcrumbs with route hierarchy

`useRemixNavigationBreadcrumbs(useNavigation(), useMatches())` emits a `category: 'navigation'` breadcrumb each time the Remix navigation state transitions from non-`idle` → `'idle'`. Each breadcrumb carries the route hierarchy alongside the URL.

```tsx
// app/root.tsx
import { Outlet, useNavigation, useMatches } from '@remix-run/react';
import { useRemixNavigationBreadcrumbs } from '@browsonic/remix';

export default function App() {
  useRemixNavigationBreadcrumbs(useNavigation(), useMatches());
  return <Outlet />;
}
```

Breadcrumb data:

```ts
{
  from: '/',
  to: '/dashboard/users/42',
  routeId: 'routes/_app.dashboard.users.$userId',           // leaf
  routeChain: 'routes/_app › routes/_app.dashboard › routes/_app.dashboard.users › routes/_app.dashboard.users.$userId',
}
```

Cross-shell URLs that look identical (e.g. `/users/42` inside `_app` vs a public route) become distinguishable in incident triage.

## Quickstart — React surface

The full `@browsonic/react` surface re-exports through this package, so you don't need a separate import:

```tsx
import { BrowsonicErrorBoundary, useUser, useCaptureError } from '@browsonic/remix';

export default function Layout() {
  useUser({ id: 'u1' });
  return (
    <BrowsonicErrorBoundary fallback={(err) => <div>{err.message}</div>}>
      <Outlet />
    </BrowsonicErrorBoundary>
  );
}
```

## Defensive contract

Same as every other adapter:

- The host app must never crash because reporting failed.
- All SDK calls in `try { … } catch {}`.
- The route boundary still renders fallback when the SDK is unreachable.
- The action wrapper still re-throws even when the reporter throws.

## What this package does NOT do

- **Server-runtime capture in Node.** The SDK is a browser library; action / loader errors that occur in pure Node have no `window` to write to. The wrapper still re-throws so Remix returns the expected status. Wire your own server logging if needed.
- **Edge runtime instrumentation.** Edge runtimes lack a stable global Browsonic singleton.
- **`<RemoteCatch>` / pre-Remix-v2 `CatchBoundary` back-port.** Tracked for a future release if community demand surfaces; the v2 ErrorBoundary path covers the common case.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
