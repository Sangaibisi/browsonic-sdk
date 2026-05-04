# @browsonic/svelte

Svelte / SvelteKit adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — SvelteKit `handleError` hook factory, Svelte-store user-context bridge, ergonomic capture wrappers, navigation breadcrumb instrumentation, SvelteKit form-action wrapper, and a `+error.svelte` integration helper.

> **Status:** 0.3 surface — pure-TypeScript helpers, no compiled `.svelte` files. Boundary capture relies on Svelte 5's native `<svelte:boundary>`. Load-bearing surfaces: SvelteKit `handleError` hook (generic over `App.Error`), Svelte store user-context bridge, navigation breadcrumb instrumentation (`instrumentNavigation` + `trackNavigation` Svelte action), SvelteKit form-action wrapper (`withBrowsonicAction`), and a `+error.svelte` page helper (`reportErrorPage`).

## Why this adapter

Two things differentiate Svelte from the React / Vue adapters:

1. **Svelte 5 has a native `<svelte:boundary>`.** We don't ship a competing boundary — use the framework primitive. The adapter's job is to give your `onerror` handler a one-liner SDK forwarder.
2. **SvelteKit's error handling is hook-driven.** `src/hooks.client.ts` exports a `handleError` function that the framework calls for every render-time crash. This package gives you the factory.

## Install

```bash
npm install @browsonic/sdk @browsonic/svelte
```

`@browsonic/sdk` is a peer dependency. `svelte` (4.x or 5.x) is a peer dependency, but the recommended target is Svelte 5 — only Svelte 5 has `<svelte:boundary>`.

## Quickstart — SvelteKit

```ts
// src/hooks.client.ts
import { handleErrorWithBrowsonic } from '@browsonic/svelte';
import { getBrowsonic } from '@browsonic/sdk';

const sdk = getBrowsonic();
sdk.init({ apiEndpoint: 'https://your-ingest-endpoint.test/v1/events' });

export const handleError = handleErrorWithBrowsonic();
```

For the server-side companion (`hooks.server.ts`), the SDK is a browser library — server capture is out of scope. Wire your server-side telemetry through the appropriate runtime adapter.

## Quickstart — Svelte 5 boundary

```svelte
<script lang="ts">
  import { captureError } from '@browsonic/svelte';
</script>

<svelte:boundary onerror={(err, reset) => {
  captureError(err instanceof Error ? err : new Error(String(err)));
}}>
  <RiskySubtree />
  {#snippet failed(error)}
    <p>Crashed: {error.message}</p>
  {/snippet}
</svelte:boundary>
```

## Quickstart — User identity from a Svelte store

```svelte
<script lang="ts">
  import { writable } from 'svelte/store';
  import { onDestroy } from 'svelte';
  import { subscribeUser } from '@browsonic/svelte';

  export const user = writable<UserContext | null>(null);

  const off = subscribeUser(user);
  onDestroy(off);
</script>
```

Every store change is mirrored as `sdk.setUser(value)`; setting the store to `null` clears the user.

## API

### `handleErrorWithBrowsonic(options?)`

```ts
import { handleErrorWithBrowsonic } from '@browsonic/svelte';

export const handleError = handleErrorWithBrowsonic({
  sdk, // optional; default = window.Browsonic.getBrowsonic()
  chain: (input) => ({ message: '…' }), // optional; runs after the SDK has been notified
});
```

Returns a SvelteKit-compatible `handleError` hook. Forwards the thrown value (coerced to `Error`) to `sdk.captureError`, records the URL pathname under `sveltekitPath` metadata, and chains into your own handler if you pass one.

### `subscribeUser(store, options?)`

Subscribe a Svelte readable store to the SDK user context. Accepts any object with a `subscribe(fn) => unsubscribe` shape — `Readable`, `Writable`, custom stores. Returns the unsubscribe handle.

### `captureError` / `captureMessage` / `addBreadcrumb`

Ergonomic standalone wrappers that resolve the SDK from `window`. Use these when you don't already have a reference to the SDK in scope. All three are no-ops when the SDK is unreachable.

```ts
import { captureError, captureMessage, addBreadcrumb } from '@browsonic/svelte';

captureError(new Error('purchase failed'));
captureMessage('checkout step 2', 'info');
addBreadcrumb({ category: 'navigation', message: '/checkout' });
```

### `instrumentNavigation(options?)` / `trackNavigation` Svelte action

Subscribe to SvelteKit / SPA navigation and emit a `category: 'navigation'` breadcrumb on every URL change. Two surfaces over one engine:

```ts
// Programmatic — call once at app init
import { instrumentNavigation } from '@browsonic/svelte';
const off = instrumentNavigation();
// optional: off() on app teardown
```

```svelte
<!-- Action form — drop on a layout root -->
<script lang="ts">
  import { trackNavigation } from '@browsonic/svelte';
</script>

<div use:trackNavigation>
  <slot />
</div>
```

History API patches (`pushState` / `replaceState`) are ref-counted so multiple callers share one set of patches and the last unsubscribe restores the originals. Programmatic `goto()` calls fire via the synthetic `browsonic:locationchange` event; back/forward fire via popstate. Works without a `@sveltejs/kit` peer dep.

### `withBrowsonicAction(handler, options?)`

Wraps a SvelteKit `actions: {}` handler so unhandled throws are reported (with `sveltekit.action.name` / `sveltekit.action.method` tags + `sveltekitPath` metadata) and **then re-thrown** so SvelteKit returns the action's failure to the client unchanged.

```ts
// src/routes/login/+page.server.ts
import { withBrowsonicAction } from '@browsonic/svelte';

export const actions = {
  default: withBrowsonicAction(
    async ({ request }) => {
      const data = await request.formData();
      // ... business logic that may throw
    },
    { actionName: 'login.default' },
  ),
};
```

Re-throw order matters — consuming the error here would mask every reported failure as a successful 200 response.

### `reportErrorPage(error, options?)`

One-shot, idempotent capture for `+error.svelte`'s `<script>` block. Reference-keyed de-dupe via module-scope `WeakSet` so a reactive `$:` binding doesn't re-report on every store tick.

```svelte
<!-- src/routes/+error.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { reportErrorPage } from '@browsonic/svelte';

  $: reportErrorPage($page.error, {
    status: $page.status,
    pathname: $page.url.pathname,
  });
</script>

<h1>{$page.status}: {$page.error?.message ?? 'Something went wrong'}</h1>
```

Browser-only — SSR (`typeof window === 'undefined'`) and "no SDK reachable" cases short-circuit to `false` so the helper is safe to call unconditionally.

### `resolveSdk(explicit?)`

Lower-level helper for when you need explicit SDK access. Returns the explicit instance, or `window.Browsonic.getBrowsonic()`, or `null`.

## Defensive contract

Every public surface follows the same rule:

- The host app must never crash because reporting failed.
- SDK calls are wrapped in `try { ... } catch {}`. If the wrapper, factory, or store subscriber can't reach the SDK, it stays silent.
- `subscribeUser` returns a no-op unsubscribe when the input is not a store, instead of throwing.

## What this package does NOT do

- **No `<BrowsonicErrorBoundary>` component.** Use Svelte 5's native `<svelte:boundary>` and forward the thrown error from `onerror` via `captureError`. Svelte 4 has no clean boundary primitive — the SvelteKit `handleError` hook is the next-best mitigation.
- **Server-side capture.** SvelteKit's `hooks.server.ts` runs in Node. The SDK is browser-only. `withBrowsonicAction` runs on the server too — it captures _if_ a browser SDK is reachable (rare in pure server contexts) and otherwise re-throws cleanly.
- **Svelte 3 / pre-Composition Svelte.** Svelte 3 is end-of-life; no back-port.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
