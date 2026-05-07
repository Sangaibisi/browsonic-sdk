// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Transport retry tracker (Sprint 2 / gap B2).
 *
 * Records the per-batch retry-attempt count produced by the queue's
 * exponential-backoff loop. Reports p50 / p95 / max in
 * `DiagnosticsSnapshot.retry_attempts` so the dashboard's
 * `<RetryOutcomesCard>` can plot fleet retry pressure without an
 * additional endpoint.
 *
 * Distinct from the queue's internal `retryAttempt` counter: that one
 * resets on every successful send. This tracker keeps a ring of the
 * **final** retry counts seen so the percentile is a meaningful
 * summary rather than the latest single value.
 */

const RING_CAP = 200;

interface Ring {
  samples: number[];
  head: number;
  full: boolean;
}

function makeRing(): Ring {
  return { samples: new Array(RING_CAP).fill(0), head: 0, full: false };
}

export interface RetryTracker {
  /** Record a final retry-attempt count for one batch flush. */
  record(attempts: number): void;
  /** Snapshot the current ring without resetting. */
  snapshot(): { p50: number; p95: number; max: number; count: number };
  /** Snapshot + reset the ring. */
  drain(): { p50: number; p95: number; max: number; count: number };
}

export function createRetryTracker(): RetryTracker {
  let ring = makeRing();
  const permanentFails = 0;
  void permanentFails; // surfaced via dropped_events.permanent_fail; kept for symmetry

  function read(target: Ring): { p50: number; p95: number; max: number; count: number } {
    const len = target.full ? RING_CAP : target.head;
    if (len === 0) return { p50: 0, p95: 0, max: 0, count: 0 };
    const sorted = target.samples.slice(0, len).sort((a, b) => a - b);
    const pick = (p: number) => sorted[Math.min(len - 1, Math.floor(p * len))];
    return { p50: pick(0.5), p95: pick(0.95), max: sorted[len - 1], count: len };
  }

  return {
    record(attempts: number): void {
      if (!Number.isFinite(attempts) || attempts < 0) return;
      ring.samples[ring.head] = attempts;
      ring.head = (ring.head + 1) % RING_CAP;
      if (ring.head === 0) ring.full = true;
    },
    snapshot(): { p50: number; p95: number; max: number; count: number } {
      return read(ring);
    },
    drain(): { p50: number; p95: number; max: number; count: number } {
      const out = read(ring);
      ring = makeRing();
      return out;
    },
  };
}
