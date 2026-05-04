# Migrating from TrackJS to Browsonic

TrackJS and Browsonic share the same scope — focused, privacy-first browser error tracking — so the migration is mostly cosmetic. Most call sites have a one-to-one rename.

## TL;DR — the API maps almost one-to-one

| TrackJS                                  | Browsonic                                                   | Notes                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `trackJs.configure({ token, … })`        | `Browsonic.init({ apiEndpoint, appKey, … })`                | TrackJS' token → Browsonic's `appKey` + ingest URL.                                   |
| `trackJs.track(error)`                   | `sdk.captureError(error)`                                   | Identical semantic.                                                                   |
| `trackJs.track(message, options)`        | `sdk.captureMessage(message, level)`                        | Levels: `'info' \| 'warn' \| 'error' \| 'fatal'`.                                     |
| `trackJs.addLogTelemetry(severity, msg)` | `sdk.addBreadcrumb({ category, level, msg })`               | Browsonic's breadcrumb model is structured (category + level + message + data).       |
| `trackJs.addMetadata(key, value)`        | `sdk.setTag(key, value)` _or_ `sdk.addMetadata(key, value)` | Both work; `setTag` is the Sentry-compatible alias kept for muscle memory.            |
| `trackJs.removeMetadata(key)`            | `sdk.removeTag(key)` _or_ `sdk.removeMetadata(key)`         | Same backing store.                                                                   |
| `trackJs.attempt(fn)`                    | `try { fn() } catch (err) { sdk.captureError(err) }`        | Browsonic does not ship an `attempt()` wrapper — the inline pattern is two lines.     |
| `trackJs.onError(handler)`               | `Browsonic.init({ onError })` config field                  | Same callback shape: `(event) => boolean \| void`.                                    |
| `trackJs.console.log(...)` etc.          | _(not shipped)_                                             | Browsonic auto-instruments `console.*` via the console collector; opt-out via config. |
| `trackJs.network.error`                  | _(not shipped)_                                             | Browsonic auto-instruments network via the XHR + fetch collectors.                    |

## Step-by-step migration

### 1. Init

**TrackJS**

```html
<script src="https://cdn.trackjs.com/agent/v3/latest/t.js"></script>
<script>
  window.TrackJS &&
    TrackJS.install({
      token: "xxxxxxxx",
      application: "frontend",
    });
</script>
```

**Browsonic**

```html
<script>
  window.Browsonic = window.Browsonic || {};
  window.Browsonic.config = {
    apiEndpoint: "https://your-ingest-endpoint.test/v1/events",
    appKey: "frontend",
    environment: "production",
  };
</script>
<script async src="https://your-cdn/browsonic.umd.min.js"></script>
```

(or the npm flow)

```ts
import { getBrowsonic } from "@browsonic/sdk";

const sdk = getBrowsonic();
sdk.init({
  apiEndpoint: "https://your-ingest-endpoint.test/v1/events",
  appKey: "frontend",
  environment: "production",
});
```

### 2. Track an error

```diff
- trackJs.track(error);
+ sdk.captureError(error);
```

### 3. Track a message

```diff
- trackJs.track('something happened', { severity: 'warn' });
+ sdk.captureMessage('something happened', 'warn');
```

### 4. Add a breadcrumb / log telemetry

```diff
- trackJs.addLogTelemetry('info', 'user clicked checkout');
+ sdk.addBreadcrumb({
+   category: 'ui',
+   level: 'info',
+   message: 'user clicked checkout',
+ });
```

### 5. Tags / metadata

```diff
- trackJs.addMetadata('plan', 'pro');
+ sdk.setTag('plan', 'pro');     // Sentry-style alias
+ // or
+ sdk.addMetadata('plan', 'pro'); // legacy name kept for parity
```

### 6. User identity

```diff
- trackJs.addMetadata('user_id', 'u1');
- trackJs.addMetadata('email', 'a@b.test');
+ sdk.setUser({ id: 'u1', email: 'a@b.test' });
```

`setUser` puts the identity in a structured `user` field on every captured event (separate from `metadata`), which most backends index for "errored users" reporting.

### 7. Custom error filter

```diff
- trackJs.onError = function (payload) {
-   if (payload.message.includes('Script error')) return false;
-   return true;
- };
+ Browsonic.init({
+   apiEndpoint: '…',
+   appKey: '…',
+   onError: (event) => {
+     if (event.message.includes('Script error')) return false;
+     return true;
+   },
+   ignoreScriptErrors: true, // also a built-in default
+ });
```

### 8. Script tag → npm

```diff
- <script src="https://cdn.trackjs.com/agent/v3/latest/t.js"></script>
+ <script async src="https://your-cdn/browsonic.umd.min.js"></script>
```

…or import from npm:

```ts
import { getBrowsonic } from "@browsonic/sdk";
const sdk = getBrowsonic();
sdk.init({ apiEndpoint: "…", appKey: "…" });
```

### 9. Framework adapters

TrackJS doesn't ship per-framework adapters — the script tag suffices because the agent installs global handlers. Browsonic adapters add the framework-native primitives (boundary components, hooks / composables, route handlers). They're optional:

| Need                               | Adapter                                               |
| ---------------------------------- | ----------------------------------------------------- |
| React error boundaries + hooks     | [`@browsonic/react`](../../packages/react#readme)     |
| Vue 3 plugin + boundary            | [`@browsonic/vue`](../../packages/vue#readme)         |
| Svelte / SvelteKit `handleError`   | [`@browsonic/svelte`](../../packages/svelte#readme)   |
| Next.js App Router error pages     | [`@browsonic/nextjs`](../../packages/nextjs#readme)   |
| Astro View Transitions breadcrumbs | [`@browsonic/astro`](../../packages/astro#readme)     |
| Angular ErrorHandler + Service     | [`@browsonic/angular`](../../packages/angular#readme) |
| Remix route ErrorBoundary          | [`@browsonic/remix`](../../packages/remix#readme)     |

## Privacy / data residency notes

TrackJS is SaaS-hosted; Browsonic ships as the SDK only — your team chooses the ingest backend (Browsonic SaaS or self-hosted with the documented `/v1/events` contract). The SDK's privacy defaults (masked passwords/tokens, redacted cookies, no implicit identity correlation) are designed to keep the data set small enough to host in your own infrastructure if regulation requires it. See [`packages/sdk/PRIVACY.md`](../../packages/sdk/PRIVACY.md).

## Things to know about parity

TrackJS' "Telemetry Timeline" maps directly to Browsonic's `event.telemetry`. The five channels (`console`, `network`, `navigation`, `visitor`, `breadcrumb`) line up with TrackJS' equivalent buckets. The only field-level difference: TrackJS' `severity` is mapped to `level` in our model, and we use `'info' / 'warn' / 'error' / 'fatal'` consistently across capture and breadcrumb APIs (TrackJS occasionally uses `'log' / 'debug'` in some channels).

## Optional codemod

The `jscodeshift` codemod for `Sentry → Browsonic` is planned for a follow-up release; the TrackJS codemod is on the same backlog. The mapping above is concise enough that most teams complete the migration in a single PR.
