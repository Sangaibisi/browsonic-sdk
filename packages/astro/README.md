# @browsonic/astro

Astro adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — Astro View Transitions navigation breadcrumbs and ergonomic capture wrappers.

> **Status:** 0.1 surface — pure-TypeScript helpers. No `.astro` components shipped. Astro is multi-framework on the client; per-framework boundaries belong in the framework's own adapter (`@browsonic/react`, `@browsonic/vue`, `@browsonic/svelte`).

## Why this adapter

Astro projects use multiple component frameworks side-by-side (React + Vue + Svelte islands in the same app). Each island brings its own boundary primitive — we don't try to unify them. What this package adds is the **shared client-side instrumentation** that doesn't live in any single framework adapter:

1. **View Transitions navigation breadcrumbs.** Astro emits `astro:after-swap` on every client-side navigation; we listen and emit a breadcrumb.
2. **Standalone capture wrappers.** Drop into a `<script>` block in any layout without picking a framework.

## Install

```bash
npm install @browsonic/sdk @browsonic/astro
```

`@browsonic/sdk` is a peer dependency. `astro` (4.x or 5.x) is a peer dependency.

## Quickstart — Navigation breadcrumbs

```astro
---
// src/layouts/Base.astro
---
<html>
  <head>...</head>
  <body>
    <slot />
    <script>
      import { registerNavigationBreadcrumbs } from '@browsonic/astro';
      registerNavigationBreadcrumbs();
    </script>
  </body>
</html>
```

Every Astro View Transitions navigation now emits:

```ts
{
  category: 'navigation',
  message: '/from-path → /to-path',
  data: { from: '/from-path', to: '/to-path', source: 'astro:view-transitions' }
}
```

## Quickstart — Standalone capture

```astro
<script>
  import { captureError, addBreadcrumb } from '@browsonic/astro';

  async function loadProduct(id) {
    try {
      const res = await fetch(`/api/product/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      addBreadcrumb({ category: 'http', message: `GET /api/product/${id}` });
      return await res.json();
    } catch (err) {
      captureError(err);
      throw err;
    }
  }
</script>
```

## API

### `registerNavigationBreadcrumbs(options?)`

Wires an `astro:after-swap` listener that emits a navigation breadcrumb on every View Transitions navigation. Returns the unsubscribe handle so callers can detach when needed.

| Option      | Type        | Default                           |
| ----------- | ----------- | --------------------------------- |
| `sdk`       | `Browsonic` | `window.Browsonic.getBrowsonic()` |
| `eventName` | `string`    | `'astro:after-swap'`              |

Browser-only — short-circuits to a no-op when `typeof document === 'undefined'` so importing it from server / build-time code doesn't crash.

### `captureError` / `captureMessage` / `addBreadcrumb`

Standalone wrappers around the global SDK singleton. Resolve the SDK from `window.Browsonic.getBrowsonic()` at call time. All three are no-ops when the SDK is unreachable.

### `resolveSdk(explicit?)`

Lower-level lookup helper for when you need explicit SDK access.

## Defensive contract

- The host app must never crash because reporting failed.
- SDK calls are wrapped in `try { ... } catch {}`.
- The View Transitions listener short-circuits in non-browser contexts.

## What this package does NOT do

- **Component-framework error boundaries.** Use the framework-specific adapter (`@browsonic/react`, `@browsonic/vue`, `@browsonic/svelte`) inside the corresponding island.
- **Server-side rendering capture.** Astro's SSR runs in Node; the SDK is browser-only.
- **An Astro Integration that auto-injects the SDK script.** That belongs in 0.2; for now consumers add a `<script>` block to their root layout.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
