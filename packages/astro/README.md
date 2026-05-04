# @browsonic/astro

Astro adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — auto-injecting Astro Integration, View Transitions navigation breadcrumbs (with optional intent phase), Astro Actions error wrapper, partial-hydration island awareness, and ergonomic capture wrappers.

> **Status:** 0.3 surface — pure-TypeScript helpers. No `.astro` components shipped. Astro is multi-framework on the client; per-framework boundaries belong in the framework's own adapter (`@browsonic/react`, `@browsonic/vue`, `@browsonic/svelte`). Load-bearing surfaces: Astro Integration default export (auto-injects navigation hookup), View Transitions instrumentation with intent phase, Astro Actions wrapper (`withBrowsonicAstroAction`), and `tagAsAstroIsland(name)` for cross-framework island context.

## Why this adapter

Astro projects use multiple component frameworks side-by-side (React + Vue + Svelte islands in the same app). Each island brings its own boundary primitive — we don't try to unify them. What this package adds is the **shared client-side instrumentation** that doesn't live in any single framework adapter:

1. **View Transitions navigation breadcrumbs.** Astro emits `astro:after-swap` on every client-side navigation; we listen and emit a breadcrumb.
2. **Standalone capture wrappers.** Drop into a `<script>` block in any layout without picking a framework.

## Install

```bash
npm install @browsonic/sdk @browsonic/astro
```

`@browsonic/sdk` is a peer dependency. `astro` (4.x or 5.x) is a peer dependency.

## Quickstart — Astro Integration (recommended)

The default export of `@browsonic/astro/integration` auto-wires the navigation hookup on every page via `astro:config:setup` → `injectScript`. Pass `apiEndpoint` / `appKey` / `environment` to also inject `window.Browsonic.config = { ... }`.

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import browsonic from '@browsonic/astro/integration';

export default defineConfig({
  integrations: [
    browsonic({
      apiEndpoint: 'https://your-ingest-endpoint.test/v1/events',
      appKey: 'your-app-key',
      environment: 'production',
      includeIntent: true, // emit `phase: 'intent'` breadcrumb on `astro:before-preparation`
    }),
  ],
});
```

That's the entire wire-up. Skip to [Astro Actions](#astro-actions) if you want server-side action capture too.

## Quickstart — Navigation breadcrumbs (manual)

If you'd rather not use the integration, drop the listener in a root layout:

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
      registerNavigationBreadcrumbs({ includeIntent: true });
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

### Astro Actions

`withBrowsonicAstroAction(handler, options?)` wraps a server-side action handler so unhandled throws are reported (with `astro.action.name` + `astro.runtime: 'action'` tags) and **then re-thrown** so Astro returns the failure unchanged.

```ts
// src/actions/index.ts
import { defineAction } from 'astro:actions';
import { z } from 'astro:schema';
import { withBrowsonicAstroAction } from '@browsonic/astro';

export const server = {
  signup: defineAction({
    accept: 'form',
    input: z.object({ email: z.string().email() }),
    handler: withBrowsonicAstroAction(
      async ({ email }) => {
        // ... business logic that may throw
      },
      { actionName: 'signup' },
    ),
  }),
};
```

Re-throw order matters — consuming the error here would mask every reported failure as a successful return value. Mirrors `withBrowsonicRouteHandler` from `@browsonic/nextjs`.

### `tagAsAstroIsland(name, options?)`

Stamp `astro.island = <name>` on the SDK's active scope so subsequent captured events (from a per-framework boundary inside the island) carry the island name as a filterable tag. Works because `setTag` is sticky on the SDK's top-level scope — no cross-adapter coordination is needed.

```tsx
// src/components/ContactForm.tsx — a React island
import { useEffect } from 'react';
import { tagAsAstroIsland } from '@browsonic/astro';

export function ContactForm() {
  useEffect(() => {
    tagAsAstroIsland('ContactForm');
  }, []);
  // ... island content
}
```

Browser-only short-circuit on SSR. Defensive try/catch keeps a thrown `setTag` from unmounting the island.

### `resolveSdk(explicit?)`

Lower-level lookup helper for when you need explicit SDK access.

## Defensive contract

- The host app must never crash because reporting failed.
- SDK calls are wrapped in `try { ... } catch {}`.
- The View Transitions listener short-circuits in non-browser contexts.

## What this package does NOT do

- **Component-framework error boundaries.** Use the framework-specific adapter (`@browsonic/react`, `@browsonic/vue`, `@browsonic/svelte`) inside the corresponding island. Pair it with `tagAsAstroIsland(name)` to attribute captured errors to the island they came from.
- **Server-side rendering capture.** Astro's SSR runs in Node; the SDK is browser-only. `withBrowsonicAstroAction` runs on the server and reports _if_ a browser SDK is reachable — pure server contexts re-throw cleanly without a report.
- **Astro Content Collections breadcrumbs.** Tracked for a future release; needs upstream API design alignment for the page-build → page-load identity bridge.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
