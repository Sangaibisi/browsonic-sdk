# BrowSonic SDK - Integration Guide

Complete technical documentation for implementing and configuring BrowSonic SDK.

---

## Table of Contents

1. [Installation](#installation)
2. [Basic Setup](#basic-setup)
3. [Configuration Reference](#configuration-reference)
4. [1.0+ Features](#10-features)
5. [API Reference](#api-reference)
6. [Framework Integration](#framework-integration)
7. [Advanced Usage](#advanced-usage)
8. [Privacy & Security](#privacy--security)
9. [Troubleshooting](#troubleshooting)

---

## Installation

### NPM / Yarn

```bash
# NPM
npm install @browsonic/sdk

# Yarn
yarn add @browsonic/sdk

# PNPM
pnpm add @browsonic/sdk
```

### Script tag (UMD)

The `dist/umd/` bundle is a single-file UMD build intended for
environments that cannot consume ES modules — legacy CMS themes,
server-rendered marketing pages, A/B test containers (Optimizely,
Google Optimize), Shopify / Squarespace / WordPress theme editors.

`@browsonic/sdk` is published to the public npm registry, so you can
load the UMD bundle directly from any npm-aware CDN, or self-host it.
Supported UMD distribution paths:

1. **npm CDN (jsDelivr / unpkg)** — the simplest path. Pin a version
   so a new release does not silently change behaviour:
   `https://cdn.jsdelivr.net/npm/@browsonic/sdk@2.2.0/dist/umd/browsonic.min.js`.
2. **GitHub Release asset** — every tagged release attaches
   `browsonic.min.js` + source map. Download and host on your own CDN.
3. **Self-hosted CDN** — unpack the npm tarball and copy
   `dist/umd/browsonic.min.js` to your own origin (CloudFront,
   Cloudflare, Fastly). Recommended for production: it removes the SDK
   from your page's third-party script budget and gives you full
   versioning control.
4. **Inline `<script>`** — for extremely size-sensitive pages, inline
   the bundle directly in the HTML response.

```html
<!-- Load before any code that might throw -->
<script src="https://your-cdn.example.com/browsonic.min.js"></script>
<script>
  const sdk = window.Browsonic.getBrowsonic();
  sdk.init({
    apiEndpoint: 'https://api.browsonic.example.com',
    appKey: 'your-app-key',
    apiKey: 'your-api-key',
  });
</script>
```

The UMD bundle exposes the same named exports as the npm package's
main entry on `window.Browsonic`:

- `Browsonic` — the SDK class
- `getBrowsonic()` — singleton getter
- `resetBrowsonic()` — testing-only
- `createTelemetryStore()` — for custom plugin authors

> **Removed in 2.0:** The `Sentinel` / `getSentinel` / `resetSentinel`
> aliases shipped in 0.x–1.x were removed in 2.0. Host apps still on
> those names rename imports to `Browsonic` / `getBrowsonic` /
> `resetBrowsonic` before upgrading.

UMD bundle size: **18.6 KB gzipped / 56.8 KB minified** (Sprint 9).

### Build Outputs

The package includes multiple build formats:

| Format     | Path          | Use Case                                |
| ---------- | ------------- | --------------------------------------- |
| ES Modules | `dist/esm/`   | Modern bundlers (Webpack, Vite, Rollup) |
| CommonJS   | `dist/cjs/`   | Node.js, older bundlers                 |
| UMD        | `dist/umd/`   | Script tag / CDN / legacy pages         |
| TypeScript | `dist/types/` | Type definitions                        |

---

## Basic Setup

### Minimal Configuration

```typescript
import { getBrowsonic } from '@browsonic/sdk';

const browsonic = getBrowsonic();

browsonic.init({
  apiEndpoint: 'https://your-api.example.com',
  appKey: 'your-application-key',
});
```

### Recommended Configuration

```typescript
import { getBrowsonic } from '@browsonic/sdk';

const browsonic = getBrowsonic();

browsonic.init({
  // Required
  apiEndpoint: 'https://your-api.example.com',
  appKey: 'your-application-key',

  // Environment
  environment: process.env.NODE_ENV || 'production',
  clientVersion: process.env.APP_VERSION || '1.0.0',

  // Development
  debug: process.env.NODE_ENV === 'development',

  // Capture settings
  captureLevels: ['error', 'warn'], // Capture errors and warnings

  // Performance (0.3.0 defaults)
  flushIntervalMs: 10000, // Send events every 10 seconds
  maxBatchSize: 25, // Max 25 events per batch (sendBeacon 64KB-safe)

  // Offline support
  persistQueue: true, // Survive page refreshes (localStorage → IndexedDB fallback)
});

// Set user context after authentication
browsonic.setUser({
  id: user.id,
  email: user.email,
  plan: user.subscription.plan, // Custom fields allowed
});
```

---

## Configuration Reference

### Required Options

| Option        | Type     | Description                                                            |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `apiEndpoint` | `string` | Your BrowSonic API server URL. Must start with `http://` or `https://` |
| `appKey`      | `string` | Your application's unique identifier for multi-tenant support          |

### Environment Options

| Option          | Type             | Default        | Description                                                                    |
| --------------- | ---------------- | -------------- | ------------------------------------------------------------------------------ |
| `environment`   | `string`         | `"production"` | Environment name (e.g., `production`, `staging`, `development`)                |
| `clientVersion` | `string \| null` | `null`         | Client version tag for tracking deployments (shown as "Versions" in dashboard) |
| `debug`         | `boolean`        | `false`        | Enable debug logging to console                                                |

### Capture Options

| Option          | Type           | Default     | Description                                                         |
| --------------- | -------------- | ----------- | ------------------------------------------------------------------- |
| `captureLevels` | `EventLevel[]` | `["error"]` | Console levels to capture: `"info"`, `"warn"`, `"error"`, `"fatal"` |

> **Removed in 2.0:** `flushOnError`. Use `level: 'fatal'` on individual
> events for instant-flush semantics — see the "fatal level" section
> under [1.0+ Features](#10-features).

### Batching & Performance

| Option            | Type     | Default | Description                                                     |
| ----------------- | -------- | ------- | --------------------------------------------------------------- |
| `flushIntervalMs` | `number` | `10000` | Milliseconds between automatic flushes (min 1000, default 10 s) |
| `maxBatchSize`    | `number` | `25`    | Maximum events per batch (`sendBeacon` 64KB-safe)               |
| `maxPayloadBytes` | `number` | `51200` | Maximum batch payload size (~50 KB, margin under 64KB)          |
| `cooldownMs`      | `number` | `60000` | Deduplication cooldown for same error (1 minute)                |

### Queue & Persistence

| Option         | Type      | Default | Description                                                                                   |
| -------------- | --------- | ------- | --------------------------------------------------------------------------------------------- |
| `maxQueueSize` | `number`  | `200`   | Maximum events in offline queue                                                               |
| `persistQueue` | `boolean` | `false` | Persist queue across page refreshes. 3-stage fallback: `localStorage` → IndexedDB → in-memory |

### Privacy & Limits

| Option                | Type       | Default                                                                         | Description                                                                        |
| --------------------- | ---------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `redactKeys`          | `string[]` | `["token", "password", "authorization", "secret", "key", "credential", "auth"]` | Key names to mask (both exact-match Set and substring fallback at resolve time)    |
| `redactKeyPatterns`   | `string[]` | `[]`                                                                            | Additional substring patterns for key redaction (2.4+ / F3.1.I)                    |
| `redactCookieNames`   | `string[]` | `[]`                                                                            | Additional cookie names to mask                                                    |
| `maxValueLength`      | `number`   | `1000`                                                                          | Maximum characters per value before truncation                                     |
| `maxStackFrames`      | `number`   | `10`                                                                            | Maximum stack trace frames to include                                              |
| `captureStorage`      | `object`   | `{ local: false, session: false, maxEntries: 20 }`                              | Opt-in `localStorage` / `sessionStorage` capture (0.3.0 BREAKING — off by default) |
| `captureCookieValues` | `boolean`  | `false`                                                                         | When off, cookies emit names only (0.3.0 BREAKING)                                 |

---

## 1.0+ Features

Features introduced in the 1.0 / 1.1 / 2.0 lines that are **not** available
on legacy 0.x host apps. Every feature below is **additive** — existing
host apps get the new behaviour automatically by upgrading; none of
these require host code changes unless you want to opt in.

### Widget as a plugin (1.0+)

The interactive notification widget moved to a tree-shakeable plugin in
1.0. The default entry (`@browsonic/sdk`) ships the plugin
bundled so legacy `widgetRules: [...]` config keeps working. For apps
that want to remove widget code from the core bundle, import from
`@browsonic/sdk/core` and register the plugin explicitly:

```typescript
import { Browsonic } from '@browsonic/sdk/core';
import { widgetPlugin } from '@browsonic/sdk/widget';

const sdk = new Browsonic();
sdk.register(widgetPlugin());
sdk.init({
  apiEndpoint: 'https://your-api.example.com',
  appKey: 'your-app-key',
  widgetRules: [
    /* ... */
  ],
});
```

Bundle impact: core-only is ~12 KB gzipped; main-entry (with widget) is
~19 KB gzipped.

### Critical Path API (1.0+)

For conversion-critical flows (checkout, signup, payment) you can
temporarily tell the SDK to suppress non-essential telemetry and make
sure nothing non-critical interferes with the user journey:

```typescript
// Entering a critical page
sdk.enterCriticalPath({
  reason: 'checkout',
  suspendTelemetry: true, // pause click/input telemetry
  suspendWidget: true, // skip widget notifications
  captureOnly: ['error', 'fatal'], // drop info/warn during the window
  autoExitMs: 300_000, // auto-reset after 5 min safety timeout
});

// Leaving
sdk.exitCriticalPath();

// Read state (e.g. conditional logic)
if (sdk.isInCriticalPath()) {
  /* ... */
}
```

Hot-path overhead is a single branch check (<100µs per event), so this
is safe to leave active even during high-volume code paths.

### Self-diagnostics (1.1.0-rc.4+)

The SDK can emit its own latency / drop-reason / internal-error
metrics to `/v1/diagnostics` on the backend. This is **off by default**
(host apps opt in):

```typescript
sdk.init({
  apiEndpoint: 'https://your-api.example.com',
  appKey: 'your-app-key',
  internalDiagnostics: true, // turn the pipeline on
  internalDiagnosticsIntervalMs: 60_000, // report once per minute (min 5s)
});
```

Backend receives the SDK's own `init_duration_ms` / `event_process_ms` /
`flush_latency_ms` percentiles, dropped-event counters, and
internal-error monotonic counter on the `POST /v1/diagnostics` endpoint.

### Storage + cookie capture (0.3.0+, opt-in)

`localStorage` / `sessionStorage` / cookie **values** are **not
captured by default** in 0.3.0+. Only the raw keys are attached to
events so you can see what a user had, not what was in it:

```typescript
sdk.init({
  /* ... */
  // Enable value capture only in environments where you have
  // the privacy review to do so (e.g. non-production).
  captureStorage: { local: true, session: true, maxEntries: 50 },
  captureCookieValues: true,
  // redactKeys still masks values that look sensitive.
  redactKeys: ['token', 'password', 'authorization', 'secret'],
});
```

See [`PRIVACY.md`](PRIVACY.md) for the full redaction contract.

### `fatal` level (0.3.0+)

Events marked `level: 'fatal'` bypass the usual batching and trigger an
**immediate flush** — useful for unrecoverable errors right before a
navigation or page unload:

```typescript
try {
  await submitPayment();
} catch (err) {
  sdk.captureError(err, { level: 'fatal' }); // instant flush, not batched
  throw err;
}
```

The wire format preserves the string `fatal`; backends map it to
`CRITICAL` in their own enum (see
`sentinel-service/.../EventLevel.java`).

### Adaptive quality (0.3.0+)

The SDK reads the `X-Browsonic-Quota-Remaining` response header from
every ingest response (0.0–1.0 fraction). When remaining ≤ 0.2 OR the
backend returns 429, the SDK **temporarily** degrades its own sample
rate by up to 4× (configurable), so your monitoring traffic doesn't
become a self-DoS when the backend is under pressure. There is no
host-app configuration required — the mechanism is on by default.

### Async stack modes (0.3.0+, hardened in 2.0)

The `captureAsyncStack` option accepts three values:

| Value             | Effect                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| `false` (default) | No async wrapping — zero overhead                                       |
| `'manual'`        | Only events passed through `Browsonic.wrap(fn)` carry an async stack    |
| `'global'`        | All `setTimeout` / `setInterval` / `Promise.then` callbacks are wrapped |

The legacy boolean `true` (equivalent to `'global'`) was **removed in
2.0**; pass the string instead.

### Plugin API (1.0+)

Custom collectors / exporters can be written as plugins. A plugin is a
small object with a `name`, an optional `install(ctx)` and
`uninstall()` hook:

```typescript
import type { SdkPlugin } from '@browsonic/sdk';

const myExporter: SdkPlugin = {
  name: 'my-exporter',
  install(ctx) {
    ctx.onEvent((event) => {
      // forward event to your own system; never throw
    });
  },
};

sdk.register(myExporter);
```

Plugin event handlers run **inside** the hot path — keep them cheap
and non-throwing (the SDK wraps them in `safeExecute`, but an erroring
plugin still costs you CPU).

### Visitor ID strategy + consent (2.3+)

Pick how the SDK generates and stores visitor IDs per your privacy
regime. Default stays `'cookie'` for backward compatibility; the other
modes are opt-in:

```typescript
sdk.init({
  apiEndpoint: 'https://your-api.example.com',
  appKey: 'your-app-key',

  visitorIdStrategy: 'session', // 1-year cookie | localStorage | sessionStorage | fresh UUID
  respectGPC: true, // Honour navigator.globalPrivacyControl (default true)
  hasConsented: () => userConsent.analytics, // Optional host-supplied gate
});
```

When `respectGPC === true` and the browser sends
`navigator.globalPrivacyControl === true`, the SDK downgrades to an
ephemeral per-session UUID regardless of `visitorIdStrategy`. The same
applies when `hasConsented()` returns `false`.

### CSP nonce for widget styles (2.4+)

On hosts with a strict Content-Security-Policy that uses nonces, pass
the per-request nonce so the widget's shadow-root `<style>` element
passes the CSP check:

```typescript
sdk.init({
  /* … */
  cspNonce: window.__CSP_NONCE__, // e.g. rendered into the HTML by your server
});
```

When unset, the widget renders without a nonce attribute (fine for
hosts that don't use CSP nonces or that have allow-listed the widget
origin).

### Persist queue 3-stage fallback (2.4+)

When `persistQueue: true`, the SDK walks three storage tiers in order:

1. **`localStorage`** — primary, synchronous, ubiquitous.
2. **IndexedDB** — fallback when `localStorage` throws (quota
   exhaustion, Safari private mode, `SecurityError`).
3. **In-memory** — last resort; events stay in the live queue and are
   lost only if the tab closes before the next flush.

The escalation is driven by write failure; reads reverse the order so
a queue persisted to IndexedDB in a previous session is recovered on
next boot.

### Unsupported SDK version signalling (2.4+)

The backend can advertise a floor via the
`X-Browsonic-Min-Sdk-Version` response header on `/v1/events`. When
the SDK's running version is older, it fires
`onUnsupportedVersion(minVersion, currentVersion)` **exactly once per
session** so you can surface an upgrade banner without spamming:

```typescript
sdk.init({
  /* … */
  onUnsupportedVersion: (min, current) => {
    console.warn(`BrowSonic SDK ${current} is older than backend floor ${min}; please upgrade.`);
  },
});
```

### Error storm aggregation (2.4+ / F3.2.C)

When the SDK enters storm mode the extended dedup cooldown
(`errorStormCooldownMultiplier × cooldownMs`) drops duplicate errors.
On exit the SDK emits a **synthetic aggregation event** with
`_stormSuppressed: <count>` so the backend can surface
"storm-suppressed sessions" in the dashboard rather than losing the
masked signal entirely.

---

## API Reference

### Initialization

#### `getBrowsonic()`

Returns the singleton BrowSonic instance.

```typescript
import { getBrowsonic } from '@browsonic/sdk';

const browsonic = getBrowsonic();
```

#### `browsonic.init(config): boolean`

Initialize the SDK with configuration. Returns `true` if successful, `false` if validation fails.

```typescript
const success = browsonic.init({
  apiEndpoint: 'https://api.example.com',
  appKey: 'my-app',
});

if (!success) {
  console.warn('BrowSonic failed to initialize');
}
```

---

### Manual Capture

#### `browsonic.captureMessage(message, level?)`

Capture a custom message.

```typescript
// Info level (default)
browsonic.captureMessage('User viewed pricing page');

// Warning level
browsonic.captureMessage('Payment took longer than expected', 'warn');

// Error level
browsonic.captureMessage('Critical: Inventory sync failed', 'error');
```

#### `browsonic.captureError(error)`

Capture an Error object with full stack trace.

```typescript
try {
  await processPayment(order);
} catch (error) {
  browsonic.captureError(error);
  // Show user-friendly message
  showToast('Payment failed. Please try again.');
}
```

---

### User Context

#### `browsonic.setUser(user)`

Associate events with a user. Sensitive fields are automatically masked.

```typescript
// After login
browsonic.setUser({
  id: user.id,
  email: user.email,
  // Custom fields
  plan: 'enterprise',
  company: 'Acme Corp',
});
```

#### `browsonic.clearUser()`

Clear user context (e.g., on logout).

```typescript
// On logout
browsonic.clearUser();
```

---

### Configuration Updates

#### `browsonic.updateConfig(partialConfig)`

Update configuration at runtime.

```typescript
// Enable debug mode temporarily
browsonic.updateConfig({ debug: true });

// Change capture levels
browsonic.updateConfig({ captureLevels: ['error', 'warn', 'info'] });
```

---

### Queue Control

#### `browsonic.flush(): Promise<void>`

Manually flush pending events (useful before page unload).

```typescript
// Before navigation
window.addEventListener('beforeunload', async () => {
  await browsonic.flush();
});
```

#### `browsonic.pause()`

Pause event collection temporarily.

```typescript
// Pause during sensitive operations
browsonic.pause();
doSensitiveOperation();
browsonic.resume();
```

#### `browsonic.resume()`

Resume event collection after pause.

---

### Lifecycle

#### `browsonic.destroy()`

Cleanup and destroy the SDK instance. Uninstalls all hooks and clears state.

```typescript
// Cleanup on app unmount
browsonic.destroy();
```

#### `browsonic.getState(): SdkState`

Get current SDK state.

```typescript
const state = browsonic.getState();
// Returns: 'uninitialized' | 'running' | 'paused' | 'destroyed'

if (state === 'running') {
  // SDK is active
}
```

#### `browsonic.getPendingCount(): number`

Get number of events waiting to be sent.

```typescript
const pending = browsonic.getPendingCount();
console.log(`${pending} events in queue`);
```

---

## Framework Integration

### React

```tsx
// src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { getBrowsonic } from '@browsonic/sdk';
import App from './App';

// Initialize before rendering
const browsonic = getBrowsonic();
browsonic.init({
  apiEndpoint: import.meta.env.VITE_BROWSONIC_API,
  appKey: import.meta.env.VITE_BROWSONIC_KEY,
  environment: import.meta.env.MODE,
  clientVersion: import.meta.env.VITE_APP_VERSION,
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

#### React Error Boundary Integration

```tsx
// src/components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';
import { getBrowsonic } from '@browsonic/sdk';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Capture with BrowSonic
    getBrowsonic().captureError(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
```

---

### Vue.js

```typescript
// src/main.ts
import { createApp } from 'vue';
import { getBrowsonic } from '@browsonic/sdk';
import App from './App.vue';

// Initialize BrowSonic
const browsonic = getBrowsonic();
browsonic.init({
  apiEndpoint: import.meta.env.VITE_BROWSONIC_API,
  appKey: import.meta.env.VITE_BROWSONIC_KEY,
  environment: import.meta.env.MODE,
});

const app = createApp(App);

// Global error handler
app.config.errorHandler = (error, instance, info) => {
  browsonic.captureError(error as Error);
  console.error('Vue error:', error);
};

app.mount('#app');
```

---

### Angular

```typescript
// src/main.ts
import { bootstrapApplication } from '@angular/platform-browser';
import { getBrowsonic } from '@browsonic/sdk';
import { AppComponent } from './app/app.component';

// Initialize before bootstrap
const browsonic = getBrowsonic();
browsonic.init({
  apiEndpoint: environment.browsonicApi,
  appKey: environment.browsonicKey,
  environment: environment.production ? 'production' : 'development',
});

bootstrapApplication(AppComponent);
```

#### Angular Error Handler

```typescript
// src/app/browsonic-error-handler.ts
import { ErrorHandler, Injectable } from '@angular/core';
import { getBrowsonic } from '@browsonic/sdk';

@Injectable()
export class BrowsonicErrorHandler implements ErrorHandler {
  handleError(error: Error): void {
    getBrowsonic().captureError(error);
    console.error('Angular error:', error);
  }
}

// src/app/app.module.ts
@NgModule({
  providers: [{ provide: ErrorHandler, useClass: BrowsonicErrorHandler }],
})
export class AppModule {}
```

---

### Next.js

```typescript
// src/app/providers.tsx (App Router)
'use client';

import { useEffect } from 'react';
import { getBrowsonic } from '@browsonic/sdk';

export function BrowsonicProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const browsonic = getBrowsonic();
    browsonic.init({
      apiEndpoint: process.env.NEXT_PUBLIC_BROWSONIC_API!,
      appKey: process.env.NEXT_PUBLIC_BROWSONIC_KEY!,
      environment: process.env.NODE_ENV,
    });

    return () => {
      browsonic.destroy();
    };
  }, []);

  return <>{children}</>;
}
```

---

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My App</title>
  </head>
  <body>
    <div id="app"></div>

    <script type="module">
      import { getBrowsonic } from './node_modules/@browsonic/sdk/dist/esm/index.js';

      const browsonic = getBrowsonic();
      browsonic.init({
        apiEndpoint: 'https://api.example.com',
        appKey: 'my-app',
      });

      // Your app code here
    </script>
  </body>
</html>
```

---

## Advanced Usage

### User Journey Tracking

Track important user actions for debugging context:

```typescript
// Track page views
function trackPageView(pageName: string) {
  getBrowsonic().captureMessage(`Page view: ${pageName}`, 'info');
}

// Track key actions
function trackCheckoutStep(step: string) {
  getBrowsonic().captureMessage(`Checkout: ${step}`, 'info');
}

// Usage
trackPageView('Product Details');
trackCheckoutStep('Added to cart');
trackCheckoutStep('Started checkout');
trackCheckoutStep('Payment submitted');
```

### Conditional Capture

```typescript
// Only capture in production
if (process.env.NODE_ENV === 'production') {
  browsonic.init({ ... });
}

// Capture specific error types
try {
  await riskyOperation();
} catch (error) {
  if (error instanceof NetworkError) {
    browsonic.captureError(error);
  }
  // Don't capture validation errors
  if (!(error instanceof ValidationError)) {
    browsonic.captureError(error);
  }
}
```

### Pre-Navigation Flush

Ensure events are sent before the user leaves:

```typescript
// SPA navigation
router.beforeEach(async (to, from, next) => {
  await getBrowsonic().flush();
  next();
});

// Page unload
window.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    getBrowsonic().flush();
  }
});
```

### Feature Flag Integration

```typescript
// Pause BrowSonic when debugging locally
if (featureFlags.debugMode) {
  getBrowsonic().pause();
}

// Resume when done
getBrowsonic().resume();
```

---

## Privacy & Security

### Automatic Masking

The SDK automatically masks values for keys containing:

- `token`
- `password`
- `authorization`
- `secret`
- `key`
- `credential`
- `auth`

**Example:**

```
localStorage: { userToken: '***', userName: 'John' }
```

### Custom Masking

```typescript
browsonic.init({
  // Add custom patterns
  redactKeys: [
    'token',
    'password',
    'authorization',
    'secret',
    'key',
    'credential',
    'auth',
    'ssn', // Social Security Number
    'creditCard', // Credit card numbers
    'cvv', // CVV codes
  ],

  // Mask specific cookies
  redactCookieNames: ['session_id', 'auth_token'],
});
```

### Data Minimization

```typescript
browsonic.init({
  // Limit captured data — storage capture is opt-in since 0.3.0
  captureStorage: { local: true, session: true, maxEntries: 20 },
  maxValueLength: 500, // Truncate values at 500 chars
  maxStackFrames: 5, // Only top 5 stack frames
});
```

### GDPR Compliance

```typescript
// Check user consent before initializing
if (userConsent.analytics) {
  browsonic.init({ ... });
}

// Provide opt-out
function disableTracking() {
  getBrowsonic().destroy();
}
```

---

## Troubleshooting

### SDK Not Capturing Events

1. **Check initialization:**

```typescript
console.log('State:', getBrowsonic().getState());
// Should be 'running'
```

2. **Enable debug mode:**

```typescript
browsonic.init({ debug: true, ... });
// Check console for [Browsonic] logs
```

3. **Check capture levels:**

```typescript
// Default only captures 'error'
// Add 'warn' and 'info' if needed
browsonic.init({ captureLevels: ['error', 'warn', 'info'] });
```

### Events Not Reaching Server

1. **Check network tab** for requests to your API endpoint
2. **Verify API endpoint** is correct and accessible
3. **Check for CORS errors** in browser console
4. **Manually flush:**

```typescript
await getBrowsonic().flush();
```

### Too Many Events

1. **Increase dedup cooldown:**

```typescript
browsonic.init({ cooldownMs: 120000 }); // 2 minutes
```

2. **Reduce capture levels:**

```typescript
browsonic.init({ captureLevels: ['error'] }); // Errors only
```

3. **Increase flush interval:**

```typescript
browsonic.init({ flushIntervalMs: 60000 }); // 1 minute
```

### Memory Issues in Long-Running Apps

The SDK is designed to handle long-running SPAs:

- Cooldown map auto-cleans after 100 entries
- Queue has max size limit (default: 200)
- Persist debounced to prevent excessive writes

If issues persist, contact support.

---

## Event Schema

Events sent to your API have this structure:

```typescript
interface BrowsonicEvent {
  eventId: string; // UUID v4
  timestamp: string; // ISO 8601
  type: EventType; // 'error' | 'console_error' | 'network_error' | etc.
  level: EventLevel; // 'info' | 'warn' | 'error'
  message: string; // Error message
  stack: string | null; // Stack trace
  url: string; // Page URL
  appKey: string; // Your app key
  environment: string; // Environment name
  clientVersion: string | null; // Client version tag
  sessionId: string; // Session identifier
  context: {
    localStorage: Record<string, string>;
    sessionStorage: Record<string, string>;
    cookies: string;
    userAgent: string;
    url: string;
    referrer: string;
    viewport: { width: number; height: number };
    language: string;
    timezone: string;
  };
  user: {
    id?: string;
    email?: string;
    [key: string]: unknown;
  } | null;
  _truncated?: boolean; // True if data was truncated
  _fingerprint?: string; // Dedup fingerprint
}
```

### Batch Format

Events are sent in batches:

```typescript
interface EventBatch {
  batchId: string; // UUID v4
  events: BrowsonicEvent[];
}
```

### API Request

```http
POST /v1/events
Content-Type: application/json
X-API-KEY: your-app-key

{
  "batchId": "550e8400-e29b-41d4-a716-446655440000",
  "events": [...]
}
```

---

## Support

For issues or questions:

- Issues: Contact your BrowSonic administrator
- Documentation: [leguide.dev](https://leguide.dev/)
- Email: support@leguide.dev

---

**Version:** 0.2.0  
**Last Updated:** February 2026
