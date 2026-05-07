# Integration Guide — `@browsonic/sdk` 3.x (event-payload schema v2.3)

This guide covers the **alignment-program features** added against the
v2.3 event-payload schema — opt-in plugins, framework adapter setup,
redaction tuning, and the widget interaction beacon. For the basic
install + bootstrap flow, see [`packages/sdk/INTEGRATION.md`](../packages/sdk/INTEGRATION.md).
For the on-the-wire payload reference, see
[`docs/design/EVENT_PAYLOAD_SCHEMA.md`](./design/EVENT_PAYLOAD_SCHEMA.md).

> **Naming note.** The npm release line and the wire-format spec are
> versioned independently. `@browsonic/sdk` is at `3.1.2`; the alignment
> commits ship in the next 3.x semantic-release. The wire-format target
> is the **event-payload schema v2.3** referenced below — the schema name
> stays put even as the npm package keeps moving.

## Table of contents

1. [Picking the right adapter](#picking-the-right-adapter)
2. [Opt-in plugins](#opt-in-plugins)
3. [Web Vitals collection](#web-vitals-collection)
4. [Framework-aware metadata](#framework-aware-metadata)
5. [Network detail and redaction](#network-detail-and-redaction)
6. [Widget interaction telemetry](#widget-interaction-telemetry)
7. [Diagnostics and observability](#diagnostics-and-observability)
8. [Adapter version stamping (release engineering)](#adapter-version-stamping-release-engineering)
9. [Backwards compatibility (pre-schema-v2.3 fleets)](#backwards-compatibility-pre-schema-v23-fleets)

---

## Picking the right adapter

| Framework     | Package              | Entry helper                       |
| ------------- | -------------------- | ---------------------------------- |
| React (16.8+) | `@browsonic/react`   | `BrowsonicErrorBoundary`, hooks    |
| Vue 3         | `@browsonic/vue`     | `createBrowsonicVue()` plugin      |
| SvelteKit     | `@browsonic/svelte`  | `handleError` factory              |
| Angular 17+   | `@browsonic/angular` | `provideBrowsonic()`               |
| Astro         | `@browsonic/astro`   | Astro Integration (auto-injects)   |
| Next.js (App) | `@browsonic/nextjs`  | `instrumentation.ts` + error pages |
| Remix         | `@browsonic/remix`   | Route `ErrorBoundary` helpers      |

All adapters depend on `@browsonic/sdk` and call
`registerAdapter()` at module load — you do not need to do this
yourself. The active adapter rides on every `EventBatch.adapter`
and is rendered by the dashboard's Adapter Breakdown.

If you ship more than one adapter (e.g. an Astro shell hosting a
React island), import each adapter from its own bundle. The
registry holds the most-recently-registered adapter as the
"active" one for batch metadata.

---

## Opt-in plugins

Plugins extend the core SDK with collectors and side channels. They
are **not** included in the default bundle to keep the gzipped size
under budget (`24 KB` Main ESM, `16 KB` Core ESM, `6 KB` Widget
plugin). Import them explicitly:

```ts
import { Browsonic, webVitalsPlugin, widgetPlugin } from "@browsonic/sdk";

Browsonic.init({
  apiKey: import.meta.env.VITE_BROWSONIC_KEY,
  plugins: [
    webVitalsPlugin({ rating: "good-needs-improvement-poor" }),
    widgetPlugin({ consentGate: () => userConsented() }),
  ],
});
```

Plugins implementing the `Collector` interface participate in the
plugin health channel (`collectPluginHealth()`), which the
dashboard renders in `<PluginHealthPanel>`. Implement `health()`
on any plugin that ships state worth observing — it returns
`{ ok, lastError?, eventsEmitted? }` and gets a per-plugin row in
the dashboard.

---

## Web Vitals collection

`webVitalsPlugin()` uses native `PerformanceObserver` to capture
LCP / FCP / CLS / TTFB. FID and INP need event-handler hooks and
are scheduled for a follow-up release.

```ts
import { webVitalsPlugin } from "@browsonic/sdk";

Browsonic.init({
  apiKey,
  plugins: [
    webVitalsPlugin({
      // Optional: filter which vitals to ship
      enabled: ["LCP", "FCP", "CLS", "TTFB"],
      // Optional: drop vitals whose rating is 'good'
      minRating: "needs-improvement",
    }),
  ],
});
```

Vitals are attached to the most recent pageview event in the
batch. The dashboard's `<WebVitalsPanel>` mounts on
`EventDetailPage` whenever `event.webVitals` is populated. Each
vital renders with a colour pill and an
`aria-label="LCP poor: 4500ms"`-style label.

---

## Framework-aware metadata

Adapters attach framework-specific context to events
(Pinia state snapshot, Astro island id, SvelteKit form action,
Next.js route segment, Angular `HttpErrorResponse`). The
dashboard routes this through
`<FrameworkContextRenderer>`, which selects one of five tailored
cards:

| Adapter ships      | Renderer                      |
| ------------------ | ----------------------------- |
| `pinia.state`      | `PiniaStateRenderer`          |
| `astro.island`     | `AstroIslandRenderer`         |
| `sveltekit.action` | `SvelteKitFormActionRenderer` |
| `nextjs.route`     | `NextJsRouteRenderer`         |
| `angular.http`     | `AngularHttpRenderer`         |

Unknown framework keys fall back to the generic context cards.
**Don't inline framework JSON dumps on `EventDetailPage`** — add a
new card under `browsonic-dashboard/src/components/framework/` and
extend the renderer's discriminator instead.

---

## Network detail and redaction

The XHR and fetch collectors emit `network_*` events with full
detail: redacted headers, request/response sizes, the
`traceparent` correlation id, and an `aborted` flag. PII redaction
runs through `utils/redaction.ts` before anything leaves the
bundle.

```ts
// utils/redaction.ts is hands-off by default; tune via init opts:
Browsonic.init({
  apiKey,
  redaction: {
    // Add domain-specific patterns
    extraPatterns: [/X-MY-INTERNAL-TOKEN: [^\s]+/g],
    // Headers always carried through (allowlist)
    headerAllowlist: ["content-type", "cache-control", "x-request-id"],
    // Headers always stripped (blocklist; takes priority)
    headerBlocklist: ["authorization", "cookie", "x-api-key"],
  },
});
```

The 11 redaction tests in `packages/sdk/src/utils/redaction.test.ts`
pin the regex behaviour. **Add a test for any new pattern** — a
mis-redaction is a privacy incident.

---

## Widget interaction telemetry

Widget impressions, clicks, and dismisses ship via a separate
beacon (not the main event batch) for low latency:

```text
POST /v1/widget-rules/{ruleId}/interactions
{ "type": "impression" | "click" | "dismiss",
  "sessionId": "...",
  "appKey": "..." }
```

The beacon is **consent-gated at the SDK** — supply a
`consentGate` to the widget plugin:

```ts
import { widgetPlugin } from "@browsonic/sdk";

Browsonic.init({
  apiKey,
  plugins: [
    widgetPlugin({
      consentGate: () => cookies.get("analytics-consent") === "true",
    }),
  ],
});
```

Aggregation happens server-side in `WidgetInteractionService.aggregate24h`.
The dashboard's widget rule listing carries 24h
`impressionCount24h` / `clickCount24h` / `dismissCount24h` /
`dismissRate24h` on every rule row — no extra round-trip per row.

---

## Diagnostics and observability

`@browsonic/sdk` ships a self-monitoring channel that the
dashboard surfaces under SDK Health:

| Surface            | Source                                 | Dashboard                     |
| ------------------ | -------------------------------------- | ----------------------------- |
| Plugin health      | `sentinel/plugins.collectPluginHealth` | `<PluginHealthPanel>`         |
| Retry outcomes     | `diagnostics/retry-tracker`            | `<RetryOutcomesCard>`         |
| Queue depth + rate | `queue/index.queueMetrics` snapshot    | `<QueueHealthPanel>`          |
| Adapter breakdown  | `sentinel/adapter-registry`            | `<AdapterBreakdownTable>`     |
| Drop reasons       | `diagnostics/store.DroppedReason`      | (rolled into the cards above) |

`DroppedReason` distinguishes:

- `transport_fail` — single failed attempt; will retry
- `permanent_fail` — retries exhausted
- `queue_full`, `payload_too_large`, etc. — terminal client-side
  reasons

---

## Adapter version stamping (release engineering)

`semantic-release` rewrites only `package.json` on publish — not
bundled source. To get the real semver into the runtime
`registerAdapter` call, every adapter ships a build-time stamper:

```text
packages/<adapter>/scripts/stamp-version.mjs   ← reads package.json
                                                 writes src/__pkg.ts
packages/<adapter>/package.json                ← "prebuild": "npm run stamp-version"
packages/<adapter>/src/__pkg.ts                ← (generated; gitignored)
packages/<adapter>/src/index.ts                ← imports PACKAGE_NAME / PACKAGE_VERSION
                                                 calls registerAdapter()
```

When iterating locally on an adapter, run `npm run build` or
`npm run stamp-version` once — without it, `__pkg.ts` is missing
and tsc fails. CI invokes `prebuild` automatically.

---

## Backwards compatibility (pre-schema-v2.3 fleets)

The v2.3 wire schema is **strictly additive**:

- New fields on `EventBatch` (`visitorId`, `adapter`, `plugins`,
  `queueMetrics`) are nullable.
- New fields on `BrowsonicEvent` (`webVitals`, `networkDetail`)
  are nullable.
- The `console_debug` `EventType` is new — pre-v2.3 servers should
  ignore unknown types.

The backend (`browsonic-service`) accepts pre-schema-v2.3 batches
unchanged; the dashboard renders pre-v2.3 events without the new
panels (they are absence-aware). You can roll old → new SDK
fleets in waves with no flag-day; the only fleet-wide upgrade
required is the `V19` + `V20` Postgres migrations and the matching
`compose/clickhouse/migrations/006-…` ClickHouse migration.

Concretely: pre-alignment SDKs were `@browsonic/sdk@2.x`; the
alignment landed on the `3.x` line that npm has already moved to.
Both kinds of clients (legacy 2.x emitting the old schema; 3.x with
the alignment commits emitting schema v2.3) are accepted by the
backend simultaneously.
