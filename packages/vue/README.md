# @browsonic/vue

Vue 3 adapter for [`@browsonic/sdk`](https://www.npmjs.com/package/@browsonic/sdk) — error boundary component, composables, and an `app.use()` plugin that chains into `app.config.errorHandler`.

> **Status:** 0.1 surface — boundary, three composables, plugin install. Server-side rendering capture is intentionally out of scope (browser-runtime adapter only).

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

### `useBrowsonic()` / `useUser()` / `useCaptureError()`

```ts
import { useBrowsonic, useUser, useCaptureError } from '@browsonic/vue';

const sdk = useBrowsonic();
useUser({ id: 'u1', email: 'a@b.test' });

const captureError = useCaptureError();
function onClick() {
  try {
    risky();
  } catch (err) {
    captureError(err as Error);
  }
}
```

`useUser` accepts a plain value or a `Ref` (re-applies on change, immediate). All three composables are no-ops when the SDK is unreachable.

## Defensive contract

Every public surface follows the same rule:

- The host app must never crash because reporting failed.
- SDK calls are wrapped in `try { ... } catch {}`. If the boundary, plugin, or composable can't reach the SDK, it stays silent.
- Composables and the boundary work without the plugin — they fall back to `window.Browsonic.getBrowsonic()`.

## What this package does NOT do

- **Server-side rendering capture.** Out of scope for 0.1. The SDK is a browser library; the adapter is a browser library.
- **Vue Router instrumentation.** Will arrive in a follow-up release. Until then, attach a `router.afterEach` and call `sdk.addBreadcrumb({ category: 'navigation', message: to.fullPath })` yourself.
- **Vuex / Pinia state snapshot on error.** Add it via `onError` if you want it; we don't bake an opinion in.

## License

Apache-2.0. See the repo root [`LICENSE`](../../LICENSE) and the package [`NOTICE`](./NOTICE).
