# @browsonic/remix

Remix adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — drop-in for route `ErrorBoundary` exports, action / loader wrapper, plus all the React-side primitives re-exported from [`@browsonic/react`](https://www.npmjs.com/package/@browsonic/react).

> **Status:** 0.1 surface — route-error boundary drop-in, imperative `captureRouteError` companion, action wrapper, full React surface re-export.

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

## Quickstart — Action / loader wrappers

```ts
// app/routes/checkout.tsx
import { withBrowsonicRemixAction } from '@browsonic/remix';

export const action = withBrowsonicRemixAction(async ({ request }) => {
  const data = await request.formData();
  if (!data.get('email')) throw new Error('email required');
  return { ok: true };
});
```

The wrapper forwards the thrown `Error` to `sdk.captureError`, tags it with `remixAction: 'true'`, and re-throws — Remix's normal response path is preserved.

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
- **Auto-injection of the SDK script.** Add the SDK init to your `app/entry.client.tsx` manually.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
