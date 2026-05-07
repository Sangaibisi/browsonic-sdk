// SPDX-License-Identifier: Apache-2.0

/**
 * Self-diagnostics store — an in-memory ring buffer for the SDK's own
 * performance metrics. Enabled via `internalDiagnostics: true`; a
 * reporter drains this store on a fixed interval and POSTs to
 * `/v1/diagnostics`.
 *
 * Metrics tracked (Sprint 10):
 *   - init_duration_ms          (one sample per init)
 *   - event_process_duration_ms (one sample per handleEvent)
 *   - flush_latency_ms          (one sample per queue.flush)
 *   - internal_error_count      (monotonic counter)
 *   - dropped_events            (counters keyed by reason)
 *
 * The store reports percentiles (p50/p95) computed over the ring's
 * current contents, plus raw counters. Cheap to query — we re-sort
 * the N most recent samples on demand, and N is capped (default 200).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { AdapterIdentity, PluginHealthSummary, QueueMetricsSnapshot } from '../types';
import { createRetryTracker, type RetryTracker } from './retry-tracker';

/**
 * Sprint 2 (gap B2) added `'permanent_fail'` to mark events dropped
 * after the queue exhausted its retry budget. The same name is part
 * of the public `DroppedReason` union in `../types` — keep them in
 * sync; this file is the source of truth for the diagnostics store.
 */
export type DroppedReason =
  | 'sampled_out'
  | 'storm'
  | 'oversized'
  | 'quota'
  | 'ignored'
  | 'state'
  | 'permanent_fail';

export interface DiagnosticsSnapshot {
  init_duration_ms: { p50: number | null; p95: number | null; count: number };
  event_process_duration_ms: { p50: number | null; p95: number | null; count: number };
  flush_latency_ms: { p50: number | null; p95: number | null; count: number };
  internal_error_count: number;
  dropped_events: Partial<Record<DroppedReason, number>>;
  /** Sprint 2 (gap B2): retry-attempt percentiles for transport flushes. */
  retry_attempts: { p50: number; p95: number; max: number; count: number };
  /** Sprint 2 (gap B1): per-plugin health snapshot (top 50 entries). */
  plugins: PluginHealthSummary[];
  /** Sprint 2 (gap B3): queue depth + drop counters at snapshot time. */
  queue_metrics: QueueMetricsSnapshot | null;
  /** Sprint 2 (gap B3): adapter identity (or null when SDK is vanilla). */
  adapter: AdapterIdentity | null;
}

interface RingBuffer {
  samples: number[];
  head: number;
  full: boolean;
  readonly cap: number;
}

function makeRing(cap: number): RingBuffer {
  return { samples: new Array(cap).fill(0), head: 0, full: false, cap };
}

function push(ring: RingBuffer, v: number): void {
  ring.samples[ring.head] = v;
  ring.head = (ring.head + 1) % ring.cap;
  if (ring.head === 0) ring.full = true;
}

function snapshot(ring: RingBuffer): { p50: number | null; p95: number | null; count: number } {
  const len = ring.full ? ring.cap : ring.head;
  if (len === 0) return { p50: null, p95: null, count: 0 };
  const sorted = ring.samples.slice(0, len).sort((a, b) => a - b);
  const pick = (p: number) => sorted[Math.min(len - 1, Math.floor(p * len))];
  return { p50: pick(0.5), p95: pick(0.95), count: len };
}

export interface DiagnosticsStore {
  recordInit(durationMs: number): void;
  recordEventProcess(durationMs: number): void;
  recordFlush(latencyMs: number): void;
  incInternalError(): void;
  incDropped(reason: DroppedReason): void;
  /** Sprint 2 (gap B2): record a final retry-attempt count from the queue. */
  recordRetryAttempt(attempts: number): void;
  /** Sprint 2 (gap B1): replace the per-plugin health snapshot. Capped at 50. */
  setPluginHealth(plugins: PluginHealthSummary[]): void;
  /** Sprint 2 (gap B3): replace the queue metrics snapshot. */
  setQueueMetrics(metrics: QueueMetricsSnapshot | null): void;
  /** Sprint 2 (gap B3): set the adapter identity once (idempotent). */
  setAdapter(adapter: AdapterIdentity | null): void;
  snapshot(): DiagnosticsSnapshot;
  /** Reset after a successful report. Keeps cumulative drop counters since
   *  they are small and the backend aggregates over time anyway. */
  drain(): DiagnosticsSnapshot;
}

/**
 * Build a new diagnostics store.
 *
 * @param cap  ring buffer capacity per metric. Default 200 — enough for
 *             a stable p95 without bounding memory unpredictably.
 */
export function createDiagnosticsStore(cap: number = 200): DiagnosticsStore {
  const initRing = makeRing(cap);
  const eventRing = makeRing(cap);
  const flushRing = makeRing(cap);
  let internalErrors = 0;
  const dropped: Partial<Record<DroppedReason, number>> = {};
  const retry: RetryTracker = createRetryTracker();
  let plugins: PluginHealthSummary[] = [];
  let queueMetrics: QueueMetricsSnapshot | null = null;
  let adapter: AdapterIdentity | null = null;

  return {
    recordInit(durationMs) {
      if (durationMs >= 0 && isFinite(durationMs)) push(initRing, durationMs);
    },
    recordEventProcess(durationMs) {
      if (durationMs >= 0 && isFinite(durationMs)) push(eventRing, durationMs);
    },
    recordFlush(latencyMs) {
      if (latencyMs >= 0 && isFinite(latencyMs)) push(flushRing, latencyMs);
    },
    incInternalError() {
      internalErrors++;
    },
    incDropped(reason) {
      dropped[reason] = (dropped[reason] ?? 0) + 1;
    },
    recordRetryAttempt(attempts) {
      retry.record(attempts);
    },
    setPluginHealth(next) {
      // Cap at 50 to bound the diagnostics payload.
      plugins = next.slice(0, 50);
    },
    setQueueMetrics(metrics) {
      queueMetrics = metrics;
    },
    setAdapter(next) {
      adapter = next ? { name: next.name, version: next.version } : null;
    },
    snapshot() {
      return {
        init_duration_ms: snapshot(initRing),
        event_process_duration_ms: snapshot(eventRing),
        flush_latency_ms: snapshot(flushRing),
        internal_error_count: internalErrors,
        dropped_events: { ...dropped },
        retry_attempts: retry.snapshot(),
        plugins: plugins.slice(),
        queue_metrics: queueMetrics ? { ...queueMetrics } : null,
        adapter: adapter ? { ...adapter } : null,
      };
    },
    drain() {
      const snap = {
        init_duration_ms: snapshot(initRing),
        event_process_duration_ms: snapshot(eventRing),
        flush_latency_ms: snapshot(flushRing),
        internal_error_count: internalErrors,
        dropped_events: { ...dropped },
        retry_attempts: retry.drain(),
        plugins: plugins.slice(),
        queue_metrics: queueMetrics ? { ...queueMetrics } : null,
        adapter: adapter ? { ...adapter } : null,
      };
      // Clear rings after reporting so each interval is independent.
      // Keep cumulative internal_error_count + dropped_events + plugins
      // + adapter + queue_metrics — the backend will treat these as
      // monotonic / latest-wins and do the delta itself.
      initRing.head = 0;
      initRing.full = false;
      eventRing.head = 0;
      eventRing.full = false;
      flushRing.head = 0;
      flushRing.full = false;
      return snap;
    },
  };
}
