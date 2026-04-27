/**
 * DiagnosticsStore — ring-buffer counters + percentile snapshot.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createDiagnosticsStore, type DiagnosticsStore } from './store';

describe('createDiagnosticsStore', () => {
  let store: DiagnosticsStore;

  beforeEach(() => {
    store = createDiagnosticsStore(10);
  });

  it('empty snapshot reports nulls + zero counters', () => {
    const s = store.snapshot();
    expect(s.init_duration_ms).toEqual({ p50: null, p95: null, count: 0 });
    expect(s.event_process_duration_ms).toEqual({ p50: null, p95: null, count: 0 });
    expect(s.flush_latency_ms).toEqual({ p50: null, p95: null, count: 0 });
    expect(s.internal_error_count).toBe(0);
    expect(s.dropped_events).toEqual({});
  });

  it('computes p50/p95 from samples', () => {
    for (let i = 1; i <= 10; i++) store.recordInit(i);
    const s = store.snapshot();
    expect(s.init_duration_ms.count).toBe(10);
    // Sorted 1..10; p50 = index floor(0.5 * 10) = 5 → value 6 (array idx 5, 0-based).
    // p95 = index floor(0.95 * 10) = 9 → value 10.
    expect(s.init_duration_ms.p50).toBe(6);
    expect(s.init_duration_ms.p95).toBe(10);
  });

  it('ring buffer wraps — oldest samples dropped after cap', () => {
    for (let i = 1; i <= 25; i++) store.recordEventProcess(i);
    const s = store.snapshot();
    expect(s.event_process_duration_ms.count).toBe(10);
    // Last 10 pushes were 16..25; p50 ~= 21, p95 ~= 25.
    expect(s.event_process_duration_ms.p50).toBeGreaterThanOrEqual(20);
    expect(s.event_process_duration_ms.p95).toBe(25);
  });

  it('rejects negative / non-finite samples silently', () => {
    store.recordInit(-5);
    store.recordInit(NaN);
    store.recordInit(Infinity);
    expect(store.snapshot().init_duration_ms.count).toBe(0);
  });

  it('counts internal errors + dropped events by reason', () => {
    store.incInternalError();
    store.incInternalError();
    store.incDropped('sampled_out');
    store.incDropped('sampled_out');
    store.incDropped('storm');
    const s = store.snapshot();
    expect(s.internal_error_count).toBe(2);
    expect(s.dropped_events.sampled_out).toBe(2);
    expect(s.dropped_events.storm).toBe(1);
  });

  it('drain() resets duration rings but preserves cumulative counters', () => {
    store.recordInit(5);
    store.recordFlush(10);
    store.incInternalError();
    store.incDropped('quota');

    const drained = store.drain();
    expect(drained.init_duration_ms.count).toBe(1);
    expect(drained.internal_error_count).toBe(1);
    expect(drained.dropped_events.quota).toBe(1);

    // Post-drain: rings empty; counters retained.
    const after = store.snapshot();
    expect(after.init_duration_ms.count).toBe(0);
    expect(after.flush_latency_ms.count).toBe(0);
    expect(after.internal_error_count).toBe(1);
    expect(after.dropped_events.quota).toBe(1);
  });
});
