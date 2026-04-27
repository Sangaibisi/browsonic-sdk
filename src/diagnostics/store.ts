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
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

export type DroppedReason = 'sampled_out' | 'storm' | 'oversized' | 'quota' | 'ignored' | 'state';

export interface DiagnosticsSnapshot {
  init_duration_ms: { p50: number | null; p95: number | null; count: number };
  event_process_duration_ms: { p50: number | null; p95: number | null; count: number };
  flush_latency_ms: { p50: number | null; p95: number | null; count: number };
  internal_error_count: number;
  dropped_events: Partial<Record<DroppedReason, number>>;
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
    snapshot() {
      return {
        init_duration_ms: snapshot(initRing),
        event_process_duration_ms: snapshot(eventRing),
        flush_latency_ms: snapshot(flushRing),
        internal_error_count: internalErrors,
        dropped_events: { ...dropped },
      };
    },
    drain() {
      const snap = this.snapshot();
      // Clear rings after reporting so each interval is independent.
      // Keep cumulative internal_error_count + dropped_events — the
      // backend will treat these as monotonic and do the delta itself.
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
