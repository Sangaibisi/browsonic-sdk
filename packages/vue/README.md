# @browsonic/vue

Vue 3 adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — error boundary component, composables, an `app.use()` plugin that chains into `app.config.errorHandler`, Vue Router instrumentation, and a Pinia integration.

> **Status:** 0.3 surface — boundary, four composables (`useBrowsonic` / `useUser` / `useCaptureError` / `useBreadcrumb`), plugin install, Vue Router 4 navigation breadcrumbs (with optional `beforeEach` intent phase), Pinia plugin that stamps store action errors with context. Server-side rendering capture is intentionally out of scope (browser-runtime adapter only).

## Why this adapter

Vue's reconciler captures render-time and lifecycle exceptions in descendant components and routes them through `errorCaptured` / `app.config.errorHandler`. The plain `@browsonic/sdk` install therefore never hears about them — only the global `error` / `unhandledrejection` events. This package closes that gap.

## Install

```bash
npm install @browsonic/sdk @browsonic/vue
```

`@browsonic/sdk` is a peer dependency. `vue` (3.3+) is a peer dependency.

## Quickstart

```ts
import { createApp } from 'vue';
import { getBrowsonic } from '@browsonic/sdk';
import { browsonicPlugin, BrowsonicErrorBoundary } from '@browsonic/vue';
import App from './App.vue';

const sdk = getBrowsonic();
sdk.init({ apiEndpoint: 'https://your-ingest-endpoint.test/v1/events' });

const app = createApp(App);
app.use(browsonicPlugin, { sdk });
app.component('BrowsonicErrorBoundary', BrowsonicErrorBoundary);
app.mount('#app');
```

Wrap the parts of your tree you want to isolate:

```vue
<BrowsonicErrorBoundary :fallback="ErrorScreen">
  <Routes />
</BrowsonicErrorBoundary>
```

## API

### `browsonicPlugin`

```ts
app.use(browsonicPlugin, {
  sdk, // optional; falls back to window.Browsonic.getBrowsonic()
  chainErrorHandler: true, // optional; default true — chains into app.config.errorHandler
});
```

Wires `provide(browsonicInjectionKey, sdk)` so composables can resolve via `inject`, and chains into `app.config.errorHandler` so errors that aren't caught by a boundary still reach the SDK. The previously-installed handler is preserved and called after the report.

### `<BrowsonicErrorBoundary>`

```vue
<BrowsonicErrorBoundary :fallback="(ctx) => h('div', 'Crashed: ' + ctx.error.message)">
  <Inner />
</BrowsonicErrorBoundary>
```

Props:

| Prop       | Type                                                | Required |
| ---------- | --------------------------------------------------- | -------- |
| `fallback` | `Component \| ((ctx: { error, reset }) => unknown)` | yes      |
| `sdk`      | `Browsonic`                                         | no       |
| `onError`  | `(error: Error, info: string) => void`              | no       |

When a child throws during render or in a lifecycle hook, the boundary forwards the error to the SDK (truncating any component stack to 1024 characters as `componentStack` metadata) and then renders the fallback. Returning `false` from `errorCaptured` stops further propagation.

### `useBrowsonic()` / `useUser()` / `useCaptureError()` / `useBreadcrumb()`

```ts
import { useBrowsonic, useUser, useCaptureError, useBreadcrumb } from '@browsonic/vue';

const sdk = useBrowsonic();
useUser({ id: 'u1', email: 'a@b.test' });

const captureError = useCaptureError();
const addBreadcrumb = useBreadcrumb();
function onClick() {
  addBreadcrumb({ category: 'ui.click', message: 'buy button' });
  try {
    risky();
  } catch (err) {
    captureError(err as Error);
  }
}
```

`useUser` accepts a plain value or a `Ref` (re-applies on change, immediate). All four composables are no-ops when the SDK is unreachable.

### `installRouterInstrumentation(router, options?)`

Subscribes to a Vue Router 4 `afterEach` guard and emits a `category: 'navigation'` breadcrumb on every successful route change. Pass `{ includeIntent: true }` to also subscribe to `beforeEach` and emit a `phase: 'intent'` breadcrumb before the navigation begins (the existing afterEach breadcrumb gets `phase: 'completed'`). Returns the unsubscribe handle from Vue Router for HMR-friendly teardown.

```ts
import { createRouter, createWebHistory } from 'vue-router';
import { installRouterInstrumentation } from '@browsonic/vue';

const router = createRouter({ history: createWebHistory(), routes: [...] });
const off = installRouterInstrumentation(router, { includeIntent: true });
// optional: off() during HMR teardown
```

Structural `RouterLike` shape — no `vue-router` runtime dep. Intent breadcrumbs are the only record of an attempted route when an error fires mid-navigation, so `includeIntent: true` is recommended for production observability.

### `installPiniaIntegration(pinia, options?)`

Pinia plugin that hooks every store's `$onAction.onError` so unhandled action errors stamp the SDK scope with `setContext('pinia', { storeId, action, args, errorMessage, state? })` before bubbling. The Vue boundary or window error handler then captures an event that already knows which store + action caused the failure.

```ts
import { createPinia } from 'pinia';
import { installPiniaIntegration } from '@browsonic/vue';

const pinia = createPinia();
installPiniaIntegration(pinia, {
  // Opt-in: include store state snapshot. Off by default — Pinia stores
  // commonly hold auth tokens / PII; audit per app before enabling.
  captureState: false,
  // Skip specific stores by `$id` (auth / wallet stores benefit).
  ignoreStores: ['auth'],
});
app.use(pinia);
```

Structural `PiniaLike` / `PiniaStoreLike` — no `pinia` runtime dep. `maxLength` (default 4096) caps serialised args / state to keep event payload size bounded.

## Defensive contract

Every public surface follows the same rule:

- The host app must never crash because reporting failed.
- SDK calls are wrapped in `try { ... } catch {}`. If the boundary, plugin, or composable can't reach the SDK, it stays silent.
- Composables and the boundary work without the plugin — they fall back to `window.Browsonic.getBrowsonic()`.

## What this package does NOT do

- **Server-side rendering capture.** Out of scope. The SDK is a browser library; the adapter is a browser library.
- **Vue 2 / Options-API-only consumers.** Vue 3.3+ Composition API is the contract. Vue 2 has reached end-of-life; we are not back-porting. (Note: Options API components inside a Vue 3 app _are_ supported — the boundary catches errors from both authoring styles. The parity test suite pins this contract.)
- **Vuex state snapshot on error.** Pinia is the supported store integration via `installPiniaIntegration`. Vuex consumers can mirror the same shape with `sdk.setContext('vuex', ...)` from a custom plugin, but we don't ship one.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
