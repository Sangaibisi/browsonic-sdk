// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { StackFrame } from '../utils/stack-parser';
import type { LinkedError } from '../utils/linked-errors';

/**
 * Re-export the parsed-stack types so consumers can import them from
 * `@browsonic/sdk` directly:
 *
 * ```ts
 * import type { BrowsonicEvent, StackFrame, LinkedError } from '@browsonic/sdk';
 * ```
 *
 * The runtime parser lives in `src/utils/stack-parser.ts` and
 * `src/utils/linked-errors.ts`; only the types travel here.
 */
export type { StackFrame, StackLineParser } from '../utils/stack-parser';
export type { LinkedError } from '../utils/linked-errors';

/**
 * Event severity levels.
 *
 * `fatal` (added 0.3.0) indicates an unrecoverable condition that must
 * reach the backend immediately — the only level that triggers instant
 * flush. `error` now goes through normal batching; on very high-traffic
 * sites this prevents an error storm from DDoS-ing the ingest endpoint.
 *
 * Upgrade path: call `captureError()` for recoverable exceptions, and
 * `captureMessage(..., 'fatal')` for process-ending conditions that
 * cannot wait (e.g. payment signature mismatch, fraud guard trip).
 */
export type EventLevel = 'info' | 'warn' | 'error' | 'fatal';

/**
 * Event types captured by the SDK
 *
 * `console_debug` (added 2.3 / Sprint 1, gap A3): produced by the console
 * collector when the host calls `console.debug(...)`. Emitted at event
 * level `'info'` because EventLevel does not carry `'debug'`; the
 * accompanying telemetry entry preserves the original `'debug'` level
 * so the dashboard's `EventLevelBadge` debug variant lights up.
 */
export type EventType =
  | 'console_info'
  | 'console_warn'
  | 'console_error'
  | 'console_debug'
  | 'unhandledrejection'
  | 'error'
  | 'fatal'
  | 'network_error';

/**
 * User context (optional)
 */
export interface UserContext {
  id?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

/**
 * Session-level context collected once per batch (heavy data)
 * This data is collected at batch send time, not per event
 */
export interface SessionContext {
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  cookies: string;
  userAgent: string;
  language: string;
  timezone: string;
  viewport: {
    width: number;
    height: number;
  };
  /** Detected JavaScript libraries and their versions */
  dependencies: Record<string, string>;
}

/**
 * Event-level context collected per event (lightweight data)
 * This data is specific to the moment the event occurred
 */
export interface EventContext {
  url: string;
  referrer: string;
  /** Time elapsed since page load in milliseconds */
  pageAge: number;
}

/**
 * Custom metadata entry
 */
export interface MetadataEntry {
  key: string;
  value: string;
}

/**
 * Single event captured by the SDK
 * Note: Session-level data (appKey, environment, sessionId, user) moved to EventBatch
 */
export interface BrowsonicEvent {
  eventId: string;
  timestamp: string;
  type: EventType;
  level: EventLevel;
  message: string;
  stack?: string | null;
  /**
   * Constructor name of the captured error (`TypeError`, `RangeError`,
   * custom Error subclass). `null` for non-Error captures (manual
   * `captureMessage`, `unhandledrejection` with a string reason).
   * Added in Sprint 2 (M2).
   */
  errorType?: string | null;
  /**
   * Parsed stack frames produced by the multi-engine stack parser
   * (Sprint 2 M1+M2). Empty array when the engine produced no usable
   * stack. Backends should prefer `stackFrames` over the raw `stack`
   * string for grouping and display — the parser already normalises
   * function names and flags `inApp` per frame.
   */
  stackFrames?: StackFrame[];
  /**
   * Unwound `Error.cause` chain (Sprint 2 M2). Ordered direct cause
   * first, oldest cause last. Capped at depth 5 with circular-
   * reference protection. Empty array when there is no cause chain.
   */
  linkedErrors?: LinkedError[];
  /** Event-level context (url, referrer, pageAge) */
  context: EventContext;
  /** Telemetry timeline (console, network, navigation logs) */
  telemetry?: TelemetryTimeline | null;
  /** Custom metadata */
  metadata?: MetadataEntry[];
  /**
   * Structured context buckets (Sprint 8 M1). Keys are domain names
   * (e.g. `'order'`, `'session'`); values are arbitrary objects. Used
   * for grouping per-event context into UI-friendly panels in the
   * backend. Sentry-compatible naming so teams migrating from
   * `@sentry/browser` keep their muscle memory. Empty when the host
   * has not set any context.
   */
  contexts?: Record<string, Record<string, unknown>>;
  /**
   * Event-level non-indexed extras (Sprint 8 M1). For large
   * diagnostic blobs that do not need backend indexing — debug
   * snapshots, truncated request bodies, feature-flag dumps. Use
   * `metadata` (`setTag`) for short indexable values; use this for
   * everything else. Empty when no extras have been set.
   */
  extras?: Record<string, unknown>;
  /**
   * Session health at the moment this event was captured (Sprint
   * 9 M2). Three-state monotonic machine — `'ok'` → `'errored'` →
   * `'crashed'`. Stamped on every event so backends can plot the
   * per-session timeline of state transitions. Absent on events
   * captured before the SDK reached `'running'` state.
   */
  sessionHealth?: 'ok' | 'errored' | 'crashed';
  /** Async stack trace captured at callback bind time */
  bindStack?: string | null;
  /** Timestamp when bindStack was captured */
  bindTime?: string | null;
  /** Internal: indicates if data was truncated */
  _truncated?: boolean;
  /** Internal: fingerprint for deduplication */
  _fingerprint?: string;
  /**
   * Internal (Sprint P14 / F3.2.B): when the event was captured inside
   * an `enterCriticalPath()` window, this carries the {@code reason} tag
   * (e.g. `"checkout"`). Backends use this for the SDK-Health "Critical
   * Path" breakdown panel; absent fields mean the event was collected
   * outside any critical path.
   */
  _criticalPath?: string;
  /**
   * Internal (Sprint P15 / F3.2.C): set on the synthetic aggregation
   * event emitted when the SDK's error-storm window closes. The value
   * is the total number of events suppressed by the extended dedup
   * cooldown while the storm was active — backends persist it in the
   * {@code events.storm_suppressed_count} column so the
   * "Storm-suppressed sessions" dashboard gauge can surface fleets
   * that are masking real signal behind noise.
   */
  _stormSuppressed?: number;
  /**
   * Web Vitals samples (LCP / FID / INP / CLS / TTFB / FCP) attached
   * to the most-recent pageview event. Empty when the opt-in plugin
   * `webVitalsPlugin()` is not loaded. See
   * `browsonic-sdk/docs/design/EVENT_PAYLOAD_SCHEMA.md` (gap A2).
   */
  webVitals?: WebVitalMetric[];
  /**
   * HTTP capture detail (allowlisted headers, request/response sizes,
   * `traceparent`, abort flag). Populated only on `network_*` event
   * types when the network collector's detail mode is enabled. The
   * SDK strictly enforces a header allowlist + PII redaction at the
   * producer; see `utils/redaction.ts` (gap B5).
   */
  networkDetail?: NetworkDetail;
}

/**
 * Web Vitals metric sample (Sprint 1 / gap A2). Mirrors the
 * `web-vitals` library's `Metric` shape so the opt-in plugin can pass
 * the value through with minimal copying.
 */
export type WebVitalName = 'LCP' | 'FID' | 'INP' | 'CLS' | 'TTFB' | 'FCP';
export type WebVitalRating = 'good' | 'needs-improvement' | 'poor';

export interface WebVitalMetric {
  name: WebVitalName;
  /** CLS is unit-less; everything else is milliseconds. */
  value: number;
  /** Delta from previous report (web-vitals lib semantics). */
  delta: number;
  /** Stable id from the web-vitals library, lets the backend dedupe. */
  id: string;
  /** Pre-computed by the web-vitals library against Google thresholds. */
  rating: WebVitalRating;
  /** Navigation timing API entry type when relevant. */
  navigationType?: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender';
}

/**
 * Network capture detail (Sprint 3 / gap B5). Populated on `network_*`
 * events. Header keys are filtered through the SDK's redaction
 * allowlist before serialisation, so backends can persist the JSON
 * without re-running the redaction pass.
 */
export interface NetworkDetail {
  requestSize?: number;
  responseSize?: number;
  headers?: Record<string, string>;
  traceparent?: string;
  aborted?: boolean;
}

/**
 * Per-plugin health snapshot reported on every batch (Sprint 2 / gap
 * B1). Backend-side `pluginBreakdown` aggregation rolls these up into
 * fleet-level stats for the dashboard's `<PluginHealthPanel>`.
 */
export interface PluginHealthSummary {
  /** Stable plugin id, e.g. `'sdk:error'`, `'sdk:console'`. */
  id: string;
  /** `plugin.health?()` returned ok (or no health() defined). */
  ok: boolean;
  /** Optional last-error reason when `ok` is false. */
  detail?: string;
  /** Monotonic counter since SDK init. */
  errorCount: number;
  /** Wall-clock millis when `activate()` first succeeded. */
  activatedAtMs: number;
}

/**
 * Drop reasons on the queue. `permanent_fail` is new in 2.3 (Sprint 2 /
 * gap B2) — emitted when transport retry budget is exhausted.
 */
export type DroppedReason =
  | 'sampled_out'
  | 'storm'
  | 'oversized'
  | 'quota'
  | 'ignored'
  | 'state'
  | 'permanent_fail';

/**
 * Queue health snapshot reported on every batch (Sprint 2 / gap B3).
 * Distinct from the diagnostics endpoint: this rides along the event
 * batch so the persist path can stamp every event with a coarse
 * "queue was healthy when this fired" marker.
 */
export interface QueueMetricsSnapshot {
  /** Queue length at batch creation time. */
  depth: number;
  /** Wall-clock millis of the previous successful flush. */
  lastFlushTimeMs: number;
  /** Drops since the previous batch, grouped by reason. */
  drops: { reason: DroppedReason; count: number }[];
  /** Retry attempts observed in the last reporting window. */
  retryAttempts: { p50: number; p95: number; max: number };
}

/**
 * Framework adapter identity (Sprint 2 / gap B3). Distinct from the
 * `EventBatch.sdk` field which always describes the core SDK package.
 * Absent when the SDK is used directly without a framework adapter.
 */
export interface AdapterIdentity {
  /** npm package name, e.g. `'@browsonic/react'`. */
  name: string;
  /** Adapter package version. */
  version: string;
}

/**
 * Severity levels for breadcrumb entries (Sprint 8 M2). Sentry-compatible
 * naming so teams migrating from `@sentry/browser` keep their muscle
 * memory. Note that this differs from console entry levels (which use
 * `'warn'` instead of `'warning'`).
 */
export type BreadcrumbLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

/**
 * Public input shape for {@link Browsonic.addBreadcrumb}. Mirrors
 * Sentry's `Breadcrumb` so adapter code reads naturally for migrating
 * teams. `category` is the only required field; `level` defaults to
 * `'info'` and `timestamp` is auto-filled by the SDK when omitted.
 *
 * @public Sprint 8 M2
 */
export interface Breadcrumb {
  /**
   * Domain category — Sentry conventions are `'navigation'`, `'http'`,
   * `'ui'`, `'console'`, `'auth'`. Custom strings are accepted.
   */
  category: string;
  /** Severity level. Default `'info'`. */
  level?: BreadcrumbLevel;
  /** Human-readable description. */
  message?: string;
  /** Arbitrary structured data attached to the breadcrumb. */
  data?: Record<string, unknown>;
  /** ISO 8601 timestamp; auto-set when omitted. */
  timestamp?: string;
}

/**
 * Wire-format breadcrumb entry as it appears inside
 * {@link TelemetryTimeline.breadcrumb}. Distinct from the input
 * {@link Breadcrumb} type: `timestamp` and `level` are always present
 * here because the SDK fills the defaults during `addBreadcrumb`.
 *
 * @public Sprint 8 M2
 */
export interface BreadcrumbTelemetryEntry {
  timestamp: string;
  category: string;
  level: BreadcrumbLevel;
  message?: string;
  data?: Record<string, unknown>;
}

/**
 * Telemetry timeline included with events
 */
export interface TelemetryTimeline {
  console: ConsoleTelemetryEntry[];
  network: NetworkTelemetryEntry[];
  navigation: NavigationTelemetryEntry[];
  visitor: VisitorTelemetryEntry[];
  /**
   * User-supplied breadcrumb trail (Sprint 8 M2). Ordered chronologically
   * (oldest → newest). Empty when no breadcrumbs were added.
   */
  breadcrumb: BreadcrumbTelemetryEntry[];
}

export interface ConsoleTelemetryEntry {
  timestamp: string;
  level: 'log' | 'debug' | 'info' | 'warn' | 'error';
  message: string;
  stack?: string | null;
}

export interface NetworkTelemetryEntry {
  timestamp: string;
  method: string;
  url: string;
  statusCode: number;
  statusText: string;
  duration: number;
  type: 'fetch' | 'xhr';
}

export interface NavigationTelemetryEntry {
  timestamp: string;
  from: string;
  to: string;
  type: 'pushState' | 'replaceState' | 'popstate' | 'hashchange';
}

export interface VisitorTelemetryEntry {
  timestamp: string;
  action: 'click' | 'input';
  element: {
    tag: string;
    attributes: {
      id?: string;
      class?: string;
      type?: string;
      name?: string;
      placeholder?: string;
    };
    value?: {
      length: number;
      pattern:
        | 'empty'
        | 'email'
        | 'numeric'
        | 'alpha'
        | 'alphanumeric'
        | 'whitespace'
        | 'characters';
    };
  };
}

/**
 * Batch of events sent to the API
 * Session context is included once at batch level to reduce payload size
 */
export interface EventBatch {
  batchId: string;
  /** Timestamp when batch was created */
  timestamp: string;
  /** App identification */
  appKey: string;
  environment: string;
  clientVersion?: string | null;
  /** Session identifier */
  sessionId: string;
  /**
   * Stable visitor identifier (Sprint 1 / gap A1). Resolved by
   * `getOrCreateVisitorId(config)` against the configured strategy
   * (cookie / localStorage / session / none). `null` when consent or
   * GPC forces the unlinkable `'none'` strategy. Promoted from the
   * pageview-only `vid` field so cross-session journeys can link.
   */
  visitorId?: string | null;
  /** Session-level context (collected at batch send time) */
  sessionContext: SessionContext;
  /** User context (if set) */
  user?: UserContext | null;
  /** Events in this batch */
  events: BrowsonicEvent[];
  /**
   * Sampling metadata. Backends MUST apply weighting `1/sampleRate` when
   * computing aggregate metrics from sampled batches.
   * See PERFORMANCE-STRATEGY.md §3 (Sampling Strategy).
   */
  sampled?: boolean;
  sampleRate?: number;
  /**
   * SDK version + profile information.
   * Added in SDK 0.3.0 to support version-aware backend processing.
   */
  sdk?: {
    name: string;
    version: string;
  };
  /**
   * Framework adapter that bootstrapped the SDK (Sprint 2 / gap B3).
   * Distinct from `sdk` — this names the wrapper package
   * (`@browsonic/react` etc.). Absent when the SDK is used directly.
   */
  adapter?: AdapterIdentity;
  /**
   * Per-plugin health snapshot at batch creation time (Sprint 2 / gap
   * B1). Capped at 50 entries by the producer.
   */
  plugins?: PluginHealthSummary[];
  /**
   * Queue depth + drop counters + retry stats at batch creation time
   * (Sprint 2 / gap B3). Lets the persist path stamp every event with
   * a coarse "fleet was healthy" marker so the dashboard's
   * `<QueueHealthPanel>` can render without an extra round-trip.
   */
  queueMetrics?: QueueMetricsSnapshot;
}

/**
 * SDK Configuration
 */
export interface BrowsonicConfig {
  /** Required: API endpoint URL */
  apiEndpoint: string;

  /** Required: Application key for tenant identification */
  appKey: string;

  /** API key for authentication */
  apiKey?: string;

  /** Environment name (default: "production") */
  environment?: string;

  /** Client version tag for version analytics (shown as "Versions" in dashboard) */
  clientVersion?: string | null;

  /** Enable debug logging (default: false) */
  debug?: boolean;

  /**
   * Batch flush interval in ms.
   * Default changed in 0.3.0: 30000 → 10000 (tighter loop, less data loss on unload).
   */
  flushIntervalMs?: number;

  /**
   * Max events per batch.
   * Default changed in 0.3.0: 50 → 25 (fits within sendBeacon 64KB limit
   * with typical 2KB events).
   */
  maxBatchSize?: number;

  /** Cooldown for same fingerprint in ms (default: 60000) */
  cooldownMs?: number;

  /**
   * Max payload size in bytes.
   * Default changed in 0.3.0: 65536 → 51200 (margin below sendBeacon 64KB).
   */
  maxPayloadBytes?: number;

  /**
   * Controls localStorage / sessionStorage capture.
   * Added in 0.3.0; default is fully OFF. Privacy-first — customers
   * explicitly enable per environment need.
   *
   * @example
   *   captureStorage: {
   *     local: true,
   *     session: false,
   *     keys: ['appVersion', 'userSegment'] // allow-list
   *   }
   */
  captureStorage?: {
    /** Capture localStorage entries (default: false). */
    local?: boolean;
    /** Capture sessionStorage entries (default: false). */
    session?: boolean;
    /**
     * If provided, only entries with these keys are captured (allow-list).
     * If omitted and local/session is true, all entries are captured
     * subject to redaction.
     */
    keys?: string[];
    /** Max entries captured when no allow-list (default: 20). */
    maxEntries?: number;
  };

  /**
   * Whether to capture cookie VALUES in addition to names.
   * Default changed in 0.3.0: previously captured values by default;
   * now names-only is the default for privacy.
   */
  captureCookieValues?: boolean;

  /**
   * Head-based session sampling rate for non-error events (0.0 – 1.0).
   * Default: 0.1 (10% of sessions record non-error telemetry).
   * Errors are always captured regardless of this value.
   * Added in 0.3.0.
   */
  sampleRate?: number;

  /**
   * Error storm protection — when more than `errorStormThreshold`
   * error-level events arrive within `errorStormWindowMs`, the SDK
   * enters "storm mode": fingerprint dedup cooldown is multiplied by
   * `errorStormCooldownMultiplier` to collapse duplicate noise while
   * still delivering the first few per-fingerprint.
   * Added in 0.3.0. See TECHNICAL-IMPROVEMENTS §2.4.
   */
  errorStormThreshold?: number; // default: 20
  errorStormWindowMs?: number; // default: 10000
  errorStormCooldownMultiplier?: number; // default: 5

  /**
   * Called exactly once when the SDK enters storm mode, and again when
   * it exits. `count` is the rolling-window error count at detection
   * time (always >= errorStormThreshold on enter; always <= threshold
   * at exit). Use for dashboards or alerting.
   */
  onErrorStorm?: (phase: 'enter' | 'exit', count: number) => void;

  /**
   * Enable self-diagnostics — SDK collects its own performance metrics
   * (init_duration_ms, event_process_duration_ms, flush_latency_ms,
   * dropped_events by reason, internal_error_count) and periodically
   * (default 60 s) POSTs them to `/v1/diagnostics`.
   *
   * Default `false`. When enabled, expect one extra POST per minute with
   * a small JSON payload (< 1 KB). Useful for observability teams that
   * want to monitor the SDK itself in production.
   */
  internalDiagnostics?: boolean;

  /** How often self-diagnostics flushes (ms). Default 60_000. */
  internalDiagnosticsIntervalMs?: number;

  /** Max stack trace frames (default: 10) */
  maxStackFrames?: number;

  /** Max offline queue size (default: 200) */
  maxQueueSize?: number;

  /** Persist queue to localStorage (default: false) */
  persistQueue?: boolean;

  /** Console levels to capture (default: ["error"]) */
  captureLevels?: EventLevel[];

  /**
   * Exact-match key names to redact from storage / cookies / user
   * context. Fast path: on the hot redaction loop we test membership
   * via a {@code Set<string>} lookup, which the V8 benchmark clocks at
   * ~40x the old {@code Array#some(.includes)} cost for the common
   * case of a sensitive key that matches a default entry exactly
   * ({@code token}, {@code password}, etc.).
   *
   * Entries are lowercased at resolve time so the hot path can skip
   * the per-call {@code toLowerCase()} allocation.
   */
  redactKeys?: string[];

  /**
   * Substring patterns for key redaction (Sprint P15 / F3.1.I).
   * Evaluated as the slow-path fallback when the exact-match
   * {@link BrowsonicConfig#redactKeys} Set misses — so a user supplying
   * {@code redactKeyPatterns: ['token']} will still catch
   * {@code authToken} and {@code csrf_token} without inflating the
   * default list.
   *
   * Default is empty; the legacy substring behaviour of the default
   * {@link BrowsonicConfig#redactKeys} entries is preserved because
   * those entries are copied into both the Set and the pattern list
   * at resolve time.
   */
  redactKeyPatterns?: string[];

  /** Cookie names to redact */
  redactCookieNames?: string[];

  /** Max value length before truncation (default: 1000) */
  maxValueLength?: number;

  /**
   * Max telemetry entries to keep (breadcrumb ring buffer).
   * Default changed in 0.3.0: 30 → 20 (memory tight on long sessions).
   */
  maxTelemetryEntries?: number;

  /** Include telemetry timeline with errors (default: true) */
  includeTelemetry?: boolean;

  /** Capture XMLHttpRequest in addition to fetch (default: true) */
  captureXHR?: boolean;

  /** Include successful network requests in telemetry (default: true) */
  networkTelemetry?: boolean;

  /** Track navigation changes in SPA (default: true) */
  trackNavigation?: boolean;

  /** Track visitor interactions - clicks/inputs (default: false for privacy) */
  trackVisitor?: boolean;

  /** Track page views via pixel (default: true) */
  trackPageViews?: boolean;

  /** Visitor tracking options */
  visitor?: {
    /** Track click events (default: true) */
    click?: boolean;
    /** Track input events (default: true) */
    input?: boolean;
    /** Input throttle period in ms (default: 500) */
    inputThrottleMs?: number;
  };

  /**
   * Strategy for the visitor ID used in pageview telemetry (2.3+).
   *
   *   - `'cookie'` (default) — 1-year cookie {@code browsonic_vid}.
   *     Persistent across sessions + tabs; the classical analytics model.
   *   - `'localStorage'` — persists across sessions, but only within the
   *     current origin. Not readable from server-side code.
   *   - `'session'` — `sessionStorage`-backed; resets when the tab closes.
   *     Privacy-preserving choice that still lets the SDK correlate
   *     pageviews inside one visit.
   *   - `'none'` — fresh UUID every call. Unlinkable; useful for apps
   *     under strict consent regimes (DNT / GPC / refused cookie banner).
   *
   * Default stays `'cookie'` in 2.x for backward compatibility; privacy-
   * conscious host apps should explicitly set `'session'` or `'none'`.
   * Under GDPR/KVKK, pick the weakest identifier your analytics need
   * actually requires.
   */
  visitorIdStrategy?: 'cookie' | 'localStorage' | 'session' | 'none';

  /**
   * Honour the browser's {@code navigator.globalPrivacyControl} signal
   * (Global Privacy Control). When the user has GPC enabled and this
   * flag is `true` (default), the SDK forces visitor ID down to a
   * session-scoped ephemeral UUID regardless of {@code visitorIdStrategy}.
   *
   * Default: `true`.
   */
  respectGPC?: boolean;

  /**
   * Host-supplied consent gate. Called once per visitor-ID resolution;
   * if it returns `false`, the SDK treats the user as unconsented and
   * issues an ephemeral UUID (same behaviour as `'none'` strategy) so
   * no persistent identifier is written to cookies or storage.
   *
   * Leave undefined when your consent framework already prevents SDK
   * init (which is preferable — don't boot the SDK at all for refused
   * sessions).
   */
  hasConsented?: () => boolean;

  /**
   * Content Security Policy nonce to attach to the widget's
   * shadow-root `<style>` element (2.4+, Sprint P15 / F3.1.C).
   *
   * Leave undefined when your CSP does not use nonces OR when you've
   * explicitly allowed the widget origin. Set to the per-request
   * nonce value that your server emitted in the CSP response header
   * (e.g. `style-src 'nonce-abc123'`) so the widget style passes the
   * browser's CSP check on hosts with strict CSP enabled.
   *
   * The SDK stores the nonce as a string and applies it once, at
   * widget host construction — subsequent init() calls with a new
   * nonce require the widget to be re-mounted (which happens on
   * destroy/reinstall).
   */
  cspNonce?: string;

  /**
   * Callback invoked before an error is reported.
   * Return false to suppress the error.
   * Modify the event object to add custom context.
   */
  onError?: (event: BrowsonicEvent) => boolean | void;

  /**
   * Invoked when the backend signals — via the
   * `X-Browsonic-Min-Sdk-Version` response header — that the currently
   * running SDK build is older than the minimum the service now
   * supports (2.4+, Sprint P15 / F3.1.F).
   *
   * Fires at most once per session: after the first header parse flags
   * a mismatch, subsequent batches won't re-trigger the callback. Use
   * it to surface an upgrade banner or page a release engineer; the
   * SDK otherwise continues operating on a best-effort basis (older
   * events may be rejected by backend validation).
   *
   * The header value is a bare version string like `"2.3.0"`. The SDK
   * compares it against its own `clientVersion`/`sdk.version` using a
   * simple numeric `major.minor.patch` comparison, so pre-release
   * suffixes (`-rc.1`) are stripped before compare.
   */
  onUnsupportedVersion?: (minVersion: string, currentVersion: string) => void;

  /**
   * Async stack trace capture mode.
   *
   *   - `false` (default) — no wrapping; lowest overhead.
   *   - `'manual'` — SDK provides a `Browsonic.wrap(fn)` helper; user wraps
   *     specific critical callbacks. No global prototype mutation.
   *   - `'global'` — LEGACY: SDK wraps `setTimeout`, `setInterval`,
   *     `requestAnimationFrame`, and `EventTarget.prototype.addEventListener`
   *     globally. `removeEventListener` is also wrapped so that callers
   *     who hold a reference to the original listener can still remove
   *     it. Still heavy on CPU — not recommended for production.
   *
   * 2.0 — the legacy `true` value was removed. Use `'global'` instead.
   *
   * See TECHNICAL-IMPROVEMENTS §2.1.
   */
  captureAsyncStack?: 'manual' | 'global' | false;

  // ===========================================
  // Ignore Rules (TrackJS-style filtering)
  // ===========================================

  /**
   * Patterns to ignore in stack traces.
   * Errors with stack traces containing these patterns will be suppressed.
   * Useful for filtering third-party scripts like analytics, ads, etc.
   * @example ['cdn.mxpnl.com', 'googletagmanager.com', 'facebook.net']
   */
  ignorePatterns?: string[];

  /**
   * Automatically ignore errors from browser extensions (default: true)
   * Filters: chrome-extension://, moz-extension://, safari-extension://
   */
  ignoreExtensions?: boolean;

  /**
   * Refuse to initialise when the SDK is loaded inside a browser
   * extension context (chrome-extension://, moz-extension://, etc.).
   * Default: `true`. Distinct from {@link ignoreExtensions}, which
   * filters extension-origin events at capture time — this aborts
   * init entirely so no telemetry pipeline runs. Added in Sprint 9 M1.
   */
  abortInExtensionContext?: boolean;

  /**
   * Refuse to initialise when the navigator user agent matches a known
   * bot pattern (Googlebot, Bingbot, Slackbot, headless tooling, …).
   * Default: `true`. Override the pattern list with {@link botPatterns}.
   * Added in Sprint 9 M1.
   */
  abortForBots?: boolean;

  /**
   * Custom bot user-agent fragment list. When supplied, REPLACES the
   * built-in `DEFAULT_BOT_PATTERNS` for the {@link abortForBots} check.
   * Substring match, case-insensitive. Added in Sprint 9 M1.
   */
  botPatterns?: readonly string[];

  /**
   * Ignore cross-origin "Script error" messages (default: true)
   * These occur when scripts from other domains throw errors but
   * don't have proper CORS headers, providing no useful information.
   */
  ignoreScriptErrors?: boolean;

  /**
   * Patterns to ignore in error messages.
   * @example ['ResizeObserver loop', 'Loading chunk']
   */
  ignoreMessages?: string[];

  /**
   * URL patterns to ignore errors from.
   * @example ['/health', '/ping', 'localhost']
   */
  ignoreUrls?: string[];

  // ===========================================
  // Widget Configuration
  // ===========================================
  //
  // 2.0 — `enableWidget` removed. Since 1.0 the widget has been a
  // plugin; registering `widgetPlugin()` is the opt-in. The flag was
  // a no-op deprecation shim that is now gone.

  /**
   * Widget position on screen (default: 'bottom-right')
   */
  widgetPosition?: WidgetPosition;

  /**
   * Client-side widget notification rules.
   * These rules are evaluated locally in the browser.
   * Server-side rules are fetched from the API on init.
   */
  widgetRules?: WidgetRule[];

  /**
   * Enable/configure server-defined widget rules fetching (default: false).
   * - `true`: Fetch from `${apiEndpoint}/v1/widget-rules/sdk` automatically
   * - `false`: Disable server rule fetching (use local rules only)
   * - `string`: Custom endpoint URL for fetching widget rules
   */
  widgetRulesEndpoint?: string | boolean;
}

/**
 * Internal resolved config with all defaults applied
 */
export interface ResolvedConfig extends Required<
  Omit<
    BrowsonicConfig,
    | 'clientVersion'
    | 'redactKeys'
    | 'redactKeyPatterns'
    | 'redactCookieNames'
    | 'apiKey'
    | 'captureXHR'
    | 'networkTelemetry'
    | 'trackNavigation'
    | 'trackVisitor'
    | 'trackPageViews'
    | 'visitor'
    | 'visitorIdStrategy'
    | 'respectGPC'
    | 'hasConsented'
    | 'cspNonce'
    | 'onError'
    | 'onUnsupportedVersion'
    | 'captureAsyncStack'
    | 'ignorePatterns'
    | 'ignoreMessages'
    | 'ignoreUrls'
    | 'captureStorage'
    | 'captureCookieValues'
    | 'sampleRate'
    | 'onErrorStorm'
    | 'abortInExtensionContext'
    | 'abortForBots'
    | 'botPatterns'
  >
> {
  clientVersion: string | null;
  /**
   * Resolved exact-match redact keys (Sprint P15 / F3.1.I).
   * Contains every entry from both {@link BrowsonicConfig#redactKeys}
   * and {@link BrowsonicConfig#redactKeyPatterns}, lowercased. The
   * {@code .has(key)} lookup is the fast path on the redaction hot
   * loop.
   */
  redactKeys: Set<string>;
  /**
   * Resolved substring-match redact patterns (Sprint P15 / F3.1.I).
   * Same contents as {@link ResolvedConfig#redactKeys} but as an
   * iterable list, for the {@code patterns.some(p => key.includes(p))}
   * fallback that still catches keys like {@code auth_token} when
   * {@code token} is in the list.
   */
  redactKeyPatterns: string[];
  redactCookieNames: string[];
  apiKey: string | null;
  captureXHR: boolean;
  networkTelemetry: boolean;
  trackNavigation: boolean;
  trackVisitor: boolean;
  trackPageViews: boolean;
  visitor: {
    click: boolean;
    input: boolean;
    inputThrottleMs: number;
  };
  /** Resolved visitor ID strategy. See {@link BrowsonicConfig#visitorIdStrategy}. */
  visitorIdStrategy: 'cookie' | 'localStorage' | 'session' | 'none';
  /** Resolved GPC flag — defaults to true. */
  respectGPC: boolean;
  /** Resolved consent gate. `null` = not supplied, treated as consented. */
  hasConsented: (() => boolean) | null;
  /** Resolved CSP nonce; `null` = not supplied, no nonce attribute set. */
  cspNonce: string | null;
  onError: ((event: BrowsonicEvent) => boolean | void) | null;
  /** Resolved unsupported-version callback; null = not supplied. */
  onUnsupportedVersion: ((minVersion: string, currentVersion: string) => void) | null;
  /** Resolved: false | 'manual' | 'global'. Legacy `true` is normalized to 'global'. */
  captureAsyncStack: false | 'manual' | 'global';
  // Ignore rules
  ignorePatterns: string[];
  ignoreExtensions: boolean;
  ignoreScriptErrors: boolean;
  ignoreMessages: string[];
  ignoreUrls: string[];
  // Widget
  widgetPosition: WidgetPosition;
  widgetRules: WidgetRule[];
  widgetRulesEndpoint: string | boolean;
  // 0.3.0: privacy + sampling
  captureStorage: {
    local: boolean;
    session: boolean;
    keys: string[] | null;
    maxEntries: number;
  };
  captureCookieValues: boolean;
  sampleRate: number;
  // 0.3.0 (Sprint 3): Error storm protection
  onErrorStorm: ((phase: 'enter' | 'exit', count: number) => void) | null;
}

/**
 * SDK State machine.
 *
 * Transitions (0.3.0):
 *   uninitialized → initializing → running
 *                                  ↓
 *                                  paused (via pause())
 *                                  ↓
 *                                  running (via resume())
 *   * → destroyed (via destroy())
 *
 * `initializing` was added in 0.3.0 to support async bootstrap.
 * Between `init()` return and full collector install, the SDK is in this
 * state; events captured via public API are buffered and replayed once
 * the state transitions to `running`.
 */
export type SdkState = 'uninitialized' | 'initializing' | 'running' | 'paused' | 'destroyed';

/**
 * Options for entering Critical Path mode — used on conversion-critical
 * flows (checkout, payment, signup) to reduce SDK overhead to the minimum.
 *
 * See PERFORMANCE-STRATEGY.md §5.
 */
export interface CriticalPathOptions {
  /** Analytics label — shown on the Critical-Path Sessions dashboard. */
  reason: string;
  /**
   * When true (default), breadcrumb collection pauses — console/network/
   * visitor/navigation telemetry is dropped for the duration.
   */
  suspendTelemetry?: boolean;
  /**
   * When true (default), widget notifications never render during
   * critical path, even if a rule matches.
   */
  suspendWidget?: boolean;
  /**
   * Which event levels to capture during critical path. Defaults to
   * `['error']` (plus `'fatal'` once that level is introduced in Sprint 3).
   * Non-matching events are silently dropped at the SDK boundary.
   */
  captureOnly?: EventLevel[];
  /**
   * Safety timeout — if `exitCriticalPath()` is not called within this
   * many ms, the SDK auto-exits. Default 300_000 (5 minutes).
   * Set to 0 to disable auto-exit (not recommended).
   */
  autoExitMs?: number;
}

/**
 * Resolved critical path state, kept on the Browsonic singleton.
 * Internal; not exported from the public API.
 */
export interface CriticalPathState {
  reason: string;
  suspendTelemetry: boolean;
  suspendWidget: boolean;
  captureOnly: EventLevel[];
  enteredAt: number;
}

// ===========================================
// Widget Types
// ===========================================

/**
 * Notification severity displayed in the widget
 */
export type WidgetSeverity = 'info' | 'warning' | 'error';

/**
 * Widget position on screen
 */
export type WidgetPosition = 'bottom-right' | 'bottom-left';

/**
 * Notification content shown in the widget
 */
export interface WidgetNotification {
  /** Notification title */
  title: string;
  /** Notification body message */
  message: string;
  /** Visual severity (default: 'error') */
  severity?: WidgetSeverity;
  /** Optional action URL (e.g. status page link) */
  actionUrl?: string;
  /** Optional action label (default: 'Learn more') */
  actionLabel?: string;
  /** Auto-dismiss after ms (0 = manual dismiss only, default: 0) */
  autoDismissMs?: number;
}

/**
 * Match conditions for a widget rule
 */
export interface WidgetRuleMatch {
  /** Event types to match */
  type?: EventType[];
  /** Event levels to match */
  level?: EventLevel[];
  /** Regex pattern to match against error message */
  messagePattern?: string;
  /** Regex pattern to match against page URL */
  urlPattern?: string;
  /** Minimum occurrence count before triggering (default: 1) */
  minCount?: number;
  /** Time window in ms for minCount (default: 60000) */
  withinMs?: number;
}

/**
 * A widget notification rule
 * When match conditions are met, the notification is shown
 */
export interface WidgetRule {
  /** Unique rule identifier */
  id: string;
  /** Whether this rule is active (default: true) */
  enabled?: boolean;
  /** Match conditions */
  match: WidgetRuleMatch;
  /** Notification to display when matched */
  notification: WidgetNotification;
  /** Cooldown in ms before this rule can trigger again (default: 300000 = 5min) */
  cooldownMs?: number;
}
