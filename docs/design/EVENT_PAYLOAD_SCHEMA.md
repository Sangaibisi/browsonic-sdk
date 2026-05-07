# Event Payload Schema — SDK 2.3 Alignment

**Status:** Draft (Sprint 0 — pending three-way maintainer sign-off: SDK lead + backend lead + dashboard lead).
**Targets:** SDK `2.3.0`, backend service `next` (V19 + ClickHouse `006`), dashboard `2.3.x`.
**Why:** Close the 15 alignment gaps identified in the SDK ↔ dashboard audit. Single migration window for all new fields so we don't bleed schema churn across multiple sprints.

This document is the **wire contract** for the new fields. It does **not** repeat the existing 0.x payload — see [`packages/sdk/INTEGRATION.md`](../../packages/sdk/INTEGRATION.md) for that. It only covers the deltas.

---

## Summary of new fields

### `EventBatch` additions (top-level batch)

| Field          | Type                                             | Required | Gap | Notes                                                                                                                                                                          |
| -------------- | ------------------------------------------------ | -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `visitorId`    | `string \| null`                                 | No       | A1  | Stable visitor identifier produced by `getOrCreateVisitorId()` (cookie / localStorage / session / none). Null when consent not granted.                                        |
| `adapter`      | `{ name: string; version: string } \| undefined` | No       | B3  | Framework adapter that bootstrapped the SDK (e.g. `@browsonic/react@2.3.0`). Distinct from `sdk.{name,version}` which always describes core. Absent when SDK is used directly. |
| `plugins`      | `PluginHealthSummary[]`                          | No       | B1  | Per-plugin health snapshot at batch creation time. Capped at 50 entries.                                                                                                       |
| `queueMetrics` | `QueueMetricsSnapshot`                           | No       | B3  | Queue depth + last flush timestamp + retry counters at batch creation.                                                                                                         |

### `BrowsonicEvent` additions (per-event)

| Field           | Type                         | Required | Gap | Notes                                                                                                                                       |
| --------------- | ---------------------------- | -------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `webVitals`     | `WebVitalMetric[]`           | No       | A2  | Web Vitals samples (LCP/FID/INP/CLS/TTFB/FCP) attached to the most-recent pageview event. Empty array when the opt-in plugin is not loaded. |
| `networkDetail` | `NetworkDetail \| undefined` | No       | B5  | Headers (allowlisted), `traceparent`, request/response sizes, abort flag — only on `network_*` event types.                                 |

### `Telemetry` channel additions

| Channel                       | Required | Gap     | Notes                                                                                   |
| ----------------------------- | -------- | ------- | --------------------------------------------------------------------------------------- |
| `webVital`                    | No       | A2      | Per-event ring of vital samples for breadcrumb trail. Hard-cap 30 entries.              |
| `breadcrumb` (already exists) | No       | A4 / C5 | Promoted to first-class TelemetryTimeline channel on the dashboard. No SDK-side change. |

### `console` collector

| Method          | Status | Gap | Notes                                                                                                     |
| --------------- | ------ | --- | --------------------------------------------------------------------------------------------------------- |
| `console.debug` | Added  | A3  | Wraps as `'console_debug'` event type, level `'debug'`. Already supported in dashboard `EventLevelBadge`. |

### Persistence enrichment (versions table)

| Field                       | Type                                        | Gap | Notes                                                                                                               |
| --------------------------- | ------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------- |
| `versions.sourcemap_status` | `varchar(20)` `NONE \| UPLOADED \| PARTIAL` | C2  | Computed JOIN against `sourcemap_uploads` (V18). Surfaced in `VersionSummary` DTO + dashboard `VersionsPage` badge. |

---

## Field detail

### `WebVitalMetric`

```ts
type WebVitalName = "LCP" | "FID" | "INP" | "CLS" | "TTFB" | "FCP";
type WebVitalRating = "good" | "needs-improvement" | "poor";

interface WebVitalMetric {
  name: WebVitalName;
  value: number; // CLS unit-less, others ms
  delta: number; // delta from previous report (web-vitals lib semantics)
  id: string; // stable id from web-vitals lib
  rating: WebVitalRating; // pre-computed by web-vitals lib
  navigationType?:
    | "navigate"
    | "reload"
    | "back-forward"
    | "back-forward-cache"
    | "prerender";
}
```

**SDK behavior:** opt-in plugin (`packages/sdk/src/plugins/web-vitals.ts`). Default plugin set does **not** include it. Consumers add it explicitly:

```ts
import { defaultPlugins, webVitalsPlugin } from "@browsonic/sdk";
init({ plugins: [...defaultPlugins, webVitalsPlugin()] });
```

**Why opt-in:** the `web-vitals` lib adds ~6KB gzipped to the bundle. We hold the default-bundle budget (`+1.5KB max`) by deferring this cost.

### `PluginHealthSummary`

```ts
interface PluginHealthSummary {
  id: string; // plugin.id (e.g. 'sdk:error', 'sdk:network')
  ok: boolean; // plugin.health() returned ok (or no health() defined)
  detail?: string; // optional last error reason
  errorCount: number; // monotonic counter since SDK init
  activatedAtMs: number; // wall clock when activate() succeeded
}
```

Reported on every batch. Sentinel reads `plugin.health?()` (defined in [`plugin.ts:115-128`](../../packages/sdk/src/plugin.ts)) which has been a no-op interface since SDK 2.0; this contract finally wires it up.

### `QueueMetricsSnapshot`

```ts
interface QueueMetricsSnapshot {
  depth: number; // queue.length at batch creation
  lastFlushTimeMs: number; // wall clock of previous successful flush
  drops: { reason: DroppedReason; count: number }[]; // since previous batch
  retryAttempts: { p50: number; p95: number; max: number }; // observed in last window
}

type DroppedReason =
  | "sampled_out"
  | "storm"
  | "oversized"
  | "quota"
  | "ignored"
  | "state"
  | "permanent_fail"; // NEW in 2.3 — exhausted retry budget
```

### `NetworkDetail`

```ts
interface NetworkDetail {
  requestSize?: number; // bytes
  responseSize?: number; // bytes
  headers?: Record<string, string>; // allowlisted only — see below
  traceparent?: string; // W3C trace context, when present
  aborted?: boolean; // fetch/XHR aborted via signal
}
```

**Header allowlist** (everything else is dropped on the SDK side, never transmitted):

- `content-type`, `content-length`, `cache-control`, `etag`
- `x-request-id`, `x-correlation-id`, `traceparent`, `tracestate`
- `server`, `x-served-by`

**Blocked unconditionally** (never transmitted, even if appearing in allowlist by accident):

- Anything matching `/auth/i`, `/cookie/i`, `/token/i`, `/api[-_]key/i`, `/secret/i`

PII redaction utility ships in `packages/sdk/src/utils/redaction.ts` and is unit-tested (regex tabanlı: email / JWT / OAuth secret / kart numarası).

### `EventBatch.adapter` vs `EventBatch.sdk`

- `sdk` — always describes `@browsonic/sdk` core (`name: '@browsonic/sdk'`, `version: <package.json>`).
- `adapter` — only present when a framework wrapper booted the SDK; reports its own package + version (e.g. `@browsonic/react@2.3.0`).

This split lets dashboard surfaces (SdkHealthPage adapter breakdown) distinguish "fleet of React apps" from "fleet of vanilla SDK apps" without re-purposing the existing `sdk` field.

---

## Backwards compatibility

All new fields are **optional**. Backend `EventBatchRequest` validator must accept payloads missing any of them (200 OK). Pre-2.3 SDKs continue to work; events without `webVitals` / `networkDetail` / `plugins` simply render as before in the dashboard (with empty-state UI).

ClickHouse migration `006` uses `ADD COLUMN IF NOT EXISTS` (idempotent, mirrors the `005-add-session-health.sql` pattern). Postgres `V19` adds nullable columns only, no NOT NULL constraints.

---

## Open questions (Sprint 0 sign-off blockers)

1. **Sourcemap status enum** — is `NONE | UPLOADED | PARTIAL` enough, or do we need `STALE` for retired releases? **Default assumption:** ship without `STALE`; add in a future sprint if operators ask.
2. **Web Vitals default-on?** — current plan: opt-in (bundle budget). If operators want default-on, Sprint 1 revises bundle budget to `+7.5KB max`.
3. **DLQ replay UI role model** — admin-only or fine-grained? **Default assumption:** admin-only in 2.3, role-based in a future sprint.
4. **C1 telco pages scope** — all 7 dummy pages back-fill in Sprint 5, or do telco-specific pages (TelcoDashboardPage, IntegrationHealthPage) wait for the 2.4 telco SKU split? **Default assumption:** all 7 in Sprint 5; pull out telco-specific if the SKU split happens before then.

---

## Cross-references

- Master plan: `~/.claude/plans/lexical-discovering-teacup.md`
- Postgres migration: [`browsonic-service/src/main/resources/db/migration/V19__sdk_v2_3_alignment.sql`](../../../browsonic-service/src/main/resources/db/migration/V19__sdk_v2_3_alignment.sql)
- ClickHouse migration: [`browsonic-compose/clickhouse/migrations/006-add-sdk-2-3-alignment.sql`](../../../browsonic-compose/clickhouse/migrations/006-add-sdk-2-3-alignment.sql)
- Golden fixtures: `browsonic-compose/tests/fixtures/sdk-2.3/`
- Wire contract baseline: [`packages/sdk/INTEGRATION.md`](../../packages/sdk/INTEGRATION.md)
- Existing scope/tags surface: [`packages/sdk/src/sentinel/scope.ts`](../../packages/sdk/src/sentinel/scope.ts)
- Existing breadcrumb buffer: [`packages/sdk/src/sentinel/breadcrumbs.ts`](../../packages/sdk/src/sentinel/breadcrumbs.ts)
