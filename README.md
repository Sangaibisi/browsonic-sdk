# Browsonic SDK

[![npm version](https://img.shields.io/npm/v/@browsonic/sdk.svg)](https://www.npmjs.com/package/@browsonic/sdk)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/Sangaibisi/browsonic-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/Sangaibisi/browsonic-sdk/actions/workflows/ci.yml)
[![Bundle size](https://img.shields.io/bundlephobia/minzip/@browsonic/sdk?label=gzipped)](https://bundlephobia.com/package/@browsonic/sdk)

**See what your users see. Fix issues before they complain.**

A privacy-first browser RUM and error tracking SDK. Lightweight (~15-22 KB gzipped), framework-agnostic, no PII captured by default. Pairs with any HTTP ingest endpoint that accepts the documented event payload.

```bash
npm install @browsonic/sdk
```

---

## The Problem We Solve

Every day, your customers encounter errors on your website that you never hear about:

- A payment button that doesn't respond
- A form that silently fails to submit
- An API call that returns an error but shows nothing to the user
- A JavaScript crash that breaks the entire page

**90% of users who experience an error simply leave.** They don't contact support. They don't report the issue. They just go to your competitor.

By the time you discover the problem from the 10% who do complain, you've already lost countless customers and revenue.

---

## What is BrowSonic?

BrowSonic is a lightweight JavaScript SDK that sits silently in your web application, capturing every error, failed API call, and anomaly the moment it happens—before your users even notice.

Think of it as **security cameras for your user experience**: always watching, never interfering, and ready to show you exactly what went wrong.

---

## Real-World Scenarios

### Scenario 1: The Silent Checkout Failure

**Without BrowSonic:**

> Your checkout page has a bug that affects 3% of users on Safari. The payment API returns a 400 error, but your UI shows a loading spinner forever. Users refresh, try again, and eventually give up. You lose $50,000 in revenue over 2 weeks before someone finally emails support.

**With BrowSonic:**

> The moment the first Safari user encounters the 400 error, BrowSonic captures it with full context: the browser version, the exact API response, the user's cart contents (masked for privacy). Your team gets alerted, identifies the Safari-specific bug, and deploys a fix within hours—before most users are affected.

---

### Scenario 2: The Third-Party Script Disaster

**Without BrowSonic:**

> A third-party analytics script you installed last month starts throwing JavaScript errors after an update. Your entire product page breaks for 20% of mobile users. You don't find out until angry reviews appear on social media 3 days later.

**With BrowSonic:**

> BrowSonic captures the JavaScript error immediately, including the stack trace pointing to the third-party script. Your team is notified, temporarily disables the script, and contacts the vendor—all before a single negative review is posted.

---

### Scenario 3: The API Degradation

**Without BrowSonic:**

> Your backend team deploys a new version. Response times increase from 200ms to 3 seconds for certain endpoints. Users experience slow loading, and conversion rates drop 15%. The backend metrics look fine because the servers aren't crashing—they're just slow.

**With BrowSonic:**

> BrowSonic captures every failed or slow API call from the user's perspective. You see exactly which endpoints are slow, which users are affected, and what they were trying to do. You catch the performance regression the same day it's deployed.

---

## Why Choose BrowSonic?

### 1. Zero Impact on Your Application

Unlike other monitoring tools that can slow down your site or cause crashes, BrowSonic is built with a **fail-safe guarantee**:

- SDK errors **never** crash your application
- Automatic circuit breaker pauses monitoring if something goes wrong
- Your users will never know it's there

### 2. Rich Context, Automatically

When an error happens, you don't just get "Error: undefined is not a function." You get:

- **What page** the user was on
- **What they were doing** (their localStorage state, form data)
- **Their environment** (browser, device, timezone)
- **The exact moment** it happened
- **How to reproduce it** (stack trace, API responses)

### 3. Privacy by Default

BrowSonic automatically masks sensitive data:

- Passwords, tokens, and API keys are **automatically redacted**
- Input values are **never stored** - only patterns and lengths
- Password fields are **completely skipped**
- GDPR and CCPA compliant out of the box

📖 **[Full Privacy Documentation](./PRIVACY.md)**

### 4. Works Offline

Users on unreliable connections? No problem. BrowSonic queues events locally and sends them when connectivity returns. **No error is ever lost.**

### 5. Lightweight

- **~15 KB gzipped** core entry (widget-free); **~22 KB** with widget
- No external dependencies
- Works with any JavaScript framework (React, Vue, Angular, vanilla JS)
- Plugin architecture — opt into only the collectors you need

---

## How It Works

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Your Web App  │────▶│   BrowSonic     │────▶│  Your Dashboard │
│                 │     │      SDK        │     │                 │
│  • JS Errors    │     │  • Captures     │     │  • Real-time    │
│  • API Failures │     │  • Enriches     │     │    alerts       │
│  • Console Logs │     │  • Batches      │     │  • Analytics    │
│                 │     │  • Sends        │     │  • Debugging    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

1. **Capture**: SDK silently monitors console errors, JavaScript exceptions, and network failures
2. **Enrich**: Each event is automatically enriched with user context, environment data, and session information
3. **Protect**: Sensitive data is masked before leaving the browser
4. **Deliver**: Events are batched and sent to your backend efficiently

---

## Quick Start

Add a few lines of code to start monitoring:

```typescript
import { Browsonic } from '@browsonic/sdk';

const sdk = new Browsonic();
sdk.init({
  apiEndpoint: 'https://your-browsonic-api.com',
  appKey: 'your-app-key',

  // Optional: Enable visitor tracking (privacy-safe)
  trackVisitor: true,

  // Optional: Add custom metadata
  onError: (event) => {
    // Filter or modify events before sending
    return true;
  },
});

// Add context
sdk.setUser({ id: 'user-123', plan: 'premium' });
sdk.addMetadata('version', '1.0.0');
```

That's it. You're now capturing every error on your site.

---

## What Gets Captured

| Event Type             | Description                       | Example                                            |
| ---------------------- | --------------------------------- | -------------------------------------------------- |
| **JavaScript Errors**  | Runtime exceptions, syntax errors | `TypeError: Cannot read property 'x' of undefined` |
| **Unhandled Promises** | Rejected promises without catch   | `Promise rejection: Network request failed`        |
| **Console Errors**     | `console.error()` calls           | `console.error('Payment failed:', error)`          |
| **Network Failures**   | API calls with status >= 400      | `POST /api/checkout - 500 Internal Server Error`   |
| **Custom Events**      | Your own tracked events           | `sdk.captureMessage('User abandoned cart')`        |

---

## Key Features

| Feature                  | Benefit                              |
| ------------------------ | ------------------------------------ |
| **Automatic Capture**    | No manual instrumentation needed     |
| **Session Tracking**     | Follow a user's entire journey       |
| **Deduplication**        | Same error doesn't flood your system |
| **Offline Support**      | Events queued until network returns  |
| **Privacy Masking**      | PII automatically redacted           |
| **Zero-Crash Guarantee** | SDK never breaks your app            |
| **Lightweight**          | ~15 KB core, no dependencies         |

---

## ROI: The Business Case

| Metric                         | Without BrowSonic   | With BrowSonic |
| ------------------------------ | ------------------- | -------------- |
| Time to detect issues          | Days to weeks       | Minutes        |
| Customer complaints before fix | 50-100+             | 1-5            |
| Revenue lost per incident      | $10,000 - $100,000+ | < $1,000       |
| Developer debugging time       | Hours               | Minutes        |
| Customer trust impact          | Significant         | Minimal        |

**One prevented incident pays for years of monitoring.**

---

## 2.x Feature Highlights

### Telemetry Timeline

Captures chronological events leading up to errors:

- **Console logs** — info, warn, error
- **Network requests** — Fetch & XMLHttpRequest
- **Navigation** — SPA route changes
- **Visitor interactions** — Clicks & inputs (privacy-safe)

### Developer Experience

- **Plugin architecture** — register only the collectors you need
- **`onError` callback** — filter or modify events before send
- **Metadata API** — add custom session + event context
- **Async stack modes** — `false` / `'manual'` / `'global'` (2.0 strict)
- **Dependency detection** — auto-detect React, Vue, jQuery, etc.

### Reliability

- **Critical Path API** — suspend non-essential telemetry during
  checkout / payment / signup flows
- **`fatal` level + instant flush** — unrecoverable errors bypass batching
- **Error storm protection** — `onErrorStorm` callback + extended
  dedup cooldown when the error rate spikes
- **Adaptive quality degradation** — SDK listens to
  `X-Browsonic-Quota-Remaining` and eases off when the backend is
  under pressure
- **Offline queue with tiered persistence** — `localStorage` → IndexedDB
  → in-memory fallback survives quota exhaustion and private-mode browsers

### Privacy & Compliance

- **Storage + cookie capture OFF by default** (0.3.0 BREAKING) —
  `captureStorage: { local: true }` is opt-in
- **`visitorIdStrategy`** — `'cookie'` (default) / `'localStorage'` /
  `'session'` / `'none'` for GDPR-aware deployments
- **`respectGPC`** — honours `navigator.globalPrivacyControl` by default
- **`hasConsented()`** — host-supplied consent gate
- **`redactKeys` (Set) + `redactKeyPatterns`** — O(1) exact-match fast
  path plus substring fallback
- **Automatic PII redaction**, cookie value stripping, password fields skipped

### Observability

- **`internalDiagnostics: true`** — SDK posts its own
  `init_duration_ms` / `event_process_ms` / `flush_latency_ms`
  percentiles + dropped-event counters to `/v1/diagnostics`
- **`onUnsupportedVersion`** — callback fires when the backend signals
  (via `X-Browsonic-Min-Sdk-Version`) that the running SDK is below
  the supported floor
- **Storm-suppression aggregation events** surface masked signal to
  dashboards

### Security

- **`cspNonce` config** — applies a CSP nonce to the widget's
  shadow-root `<style>` for strict-CSP hosts
- **URL whitelist validation** — `apiEndpoint` parsed with `new URL()`
  so parser-trick hosts
  (`https://evil.example.com\@trusted.example.com`) fail at
  `validateConfig` time
- **Widget ReDoS + XSS guards** on match patterns
- CycloneDX SBOM + SHA-256 checksums on every release

---

## Configuration Options

```typescript
sdk.init({
  // Required
  apiEndpoint: 'https://your-api.com',
  appKey: 'your-app-key',

  // Batching
  flushIntervalMs: 10000, // Default 10s (was 30s pre-0.3.0)
  maxBatchSize: 25, // Default 25 (sendBeacon 64KB-safe)
  maxPayloadBytes: 51200, // Default 50 KB (margin under 64KB)

  // Telemetry
  maxTelemetryEntries: 20, // Ring buffer size
  includeTelemetry: true, // Include timeline with errors

  // Network
  captureXHR: true, // Capture XMLHttpRequest
  networkTelemetry: true, // Record all network requests

  // Navigation (SPA)
  trackNavigation: true, // Track route changes

  // Visitor (OFF by default for privacy)
  trackVisitor: false, // Enable click/input tracking
  visitor: {
    click: true, // Track clicks
    input: true, // Track inputs (patterns only)
    inputThrottleMs: 500, // Throttle input events
  },

  // Visitor ID strategy (2.3+)
  visitorIdStrategy: 'cookie', // 'cookie' | 'localStorage' | 'session' | 'none'
  respectGPC: true, // Honour navigator.globalPrivacyControl
  hasConsented: () => true, // Host-supplied consent gate

  // Async Stack Trace (OFF by default for performance)
  captureAsyncStack: false, // false | 'manual' | 'global'

  // Storage + cookie capture (OFF by default since 0.3.0)
  captureStorage: { local: false, session: false, maxEntries: 20 },
  captureCookieValues: false,

  // Privacy — Set-based exact match + pattern fallback
  redactKeys: ['token', 'password', 'authorization', 'secret'],
  redactKeyPatterns: [], // Optional substring-match add-ons
  redactCookieNames: ['session_id'],

  // CSP nonce for widget <style> on strict-CSP hosts (2.4+)
  cspNonce: undefined,

  // Self-diagnostics (opt-in)
  internalDiagnostics: false,
  internalDiagnosticsIntervalMs: 60000,

  // Callbacks
  onError: (event) => true, // Filter/modify events
  onErrorStorm: (phase, count) => {}, // Storm enter/exit hook
  onUnsupportedVersion: (min, current) => {}, // Backend min-version signal

  // Debug
  debug: false, // Enable console logging
});
```

---

## API Reference

### SDK Instance

```typescript
const sdk = new Browsonic();

sdk.init(config); // Initialize
sdk.captureMessage('Custom event'); // Manual capture
sdk.captureError(new Error('Oops')); // Capture error
sdk.setUser({ id: '123' }); // Set user context
sdk.clearUser(); // Clear user
sdk.addMetadata('key', 'value'); // Add metadata
sdk.removeMetadata('key'); // Remove metadata
sdk.getMetadata(); // Get all metadata
sdk.clearMetadata(); // Clear metadata
sdk.flush(); // Force send events
sdk.pause(); // Pause capturing
sdk.resume(); // Resume capturing
sdk.destroy(); // Cleanup
```

---

## Documentation

- **[Integration Guide](./INTEGRATION.md)** — installation, configuration, framework adapters, ingest contract
- **[Privacy](./PRIVACY.md)** — what is captured, what is masked, opt-in/opt-out controls
- **[Benchmarks](./BENCHMARKS.md)** — measured size and runtime overhead, reproducible setup
- **[Contributing](./CONTRIBUTING.md)** — dev environment, commit conventions, PR workflow
- **[Security](./SECURITY.md)** — private vulnerability disclosure

---

## Self-hosting and SaaS

The SDK is an HTTP client. It posts batches to a `/v1/events` endpoint that you configure via `apiEndpoint`. The wire protocol is documented in [INTEGRATION.md](./INTEGRATION.md). You can:

- Run your own ingest server that accepts the payload format and stores events however you like.
- Or use the hosted Browsonic SaaS, which provides a turnkey backend with dashboards, alerts, and replay. (The SaaS backend is a separate, closed-source product.)

The SDK has no hardcoded endpoint and works with either path.

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Copyright 2024-2026 Emrullah Yıldırım.
