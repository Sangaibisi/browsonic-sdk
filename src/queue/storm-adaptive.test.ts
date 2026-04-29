// SPDX-License-Identifier: Apache-2.0

/**
 * Queue — error storm detection + adaptive quality degradation.
 *
 * Covers:
 *   - Sprint 3.1 fatal-only instant flush
 *   - Sprint 3.2 error storm detection + onErrorStorm callback + hysteresis
 *   - Sprint 3.7 X-Browsonic-Quota-Remaining → adaptive multiplier
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventQueue } from './index';
import { resolveConfig } from '../config';
import type { BrowsonicEvent } from '../types';

vi.mock('../transport', () => ({
  sendBatch: vi.fn().mockResolvedValue({
    success: true,
    status: 200,
    quotaRemaining: null,
  }),
  calculateBackoff: (a: number) => Math.min(1000 * 2 ** a, 30_000),
}));

import { sendBatch } from '../transport';

const mockSendBatch = sendBatch as unknown as ReturnType<typeof vi.fn>;

function baseConfig(over: Partial<Parameters<typeof resolveConfig>[0]> = {}) {
  return resolveConfig({
    apiEndpoint: 'https://api.test',
    appKey: 'app',
    apiKey: 'k',
    flushIntervalMs: 1000,
    maxBatchSize: 100,
    persistQueue: false,
    sampleRate: 1.0,
    ...over,
  });
}

function makeEvent(
  seq: number,
  level: 'info' | 'warn' | 'error' | 'fatal' = 'warn',
  message?: string
): BrowsonicEvent {
  return {
    eventId: `evt-${seq}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: level === 'error' ? 'error' : level === 'fatal' ? 'fatal' : 'console_warn',
    level,
    message: message ?? `m${seq}`,
    stack: null,
    context: { url: 'https://x.test/', referrer: '', pageAge: 0 },
    telemetry: null,
  };
}

function makeQueue(cfg = baseConfig()) {
  return createEventQueue({
    config: cfg,
    debugLog: () => {},
    getSessionId: () => 'sid',
    getUser: () => null,
    getSessionSampled: () => true,
  });
}

describe('Sprint 3.1 — instant flush is fatal-only', () => {
  beforeEach(() => vi.clearAllMocks());

  it('error level batches (no instant flush)', () => {
    const q = makeQueue();
    q.enqueue(makeEvent(1, 'error'));
    expect(q.length()).toBe(1);
    expect(mockSendBatch).not.toHaveBeenCalled();
  });

  it('fatal level triggers instant flush', () => {
    const q = makeQueue();
    q.enqueue(makeEvent(1, 'fatal'));
    expect(mockSendBatch).toHaveBeenCalledTimes(1);
  });
});

describe('Sprint 3.2 — error storm detection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fires onErrorStorm with phase "enter" when threshold crossed', () => {
    const onStorm = vi.fn();
    const q = makeQueue(
      baseConfig({
        errorStormThreshold: 5,
        errorStormWindowMs: 10_000,
        onErrorStorm: onStorm,
      })
    );

    // Under threshold — no storm
    for (let i = 0; i < 4; i++) {
      q.enqueue(makeEvent(i, 'error', `unique-${i}`));
    }
    expect(onStorm).not.toHaveBeenCalled();
    expect(q.isInStorm()).toBe(false);

    // Cross threshold
    q.enqueue(makeEvent(99, 'error', 'unique-99'));
    expect(onStorm).toHaveBeenCalledWith('enter', 5);
    expect(q.isInStorm()).toBe(true);
  });

  it('exits storm with hysteresis (at half threshold)', async () => {
    vi.useFakeTimers();
    const onStorm = vi.fn();
    const cfg = baseConfig({
      errorStormThreshold: 4,
      errorStormWindowMs: 1000,
      onErrorStorm: onStorm,
    });
    const q = makeQueue(cfg);

    for (let i = 0; i < 4; i++) {
      q.enqueue(makeEvent(i, 'error', `m-${i}`));
    }
    expect(q.isInStorm()).toBe(true);
    expect(onStorm).toHaveBeenCalledWith('enter', 4);

    // Advance past window — old timestamps expire.
    vi.advanceTimersByTime(1100);

    // A single new error with now-empty window count = 1, which is
    // < threshold/2 (= 2) → hysteresis triggers exit.
    q.enqueue(makeEvent(10, 'error', 'new'));
    expect(q.isInStorm()).toBe(false);
    expect(onStorm).toHaveBeenLastCalledWith('exit', 1);
    vi.useRealTimers();
  });

  it('applies multiplied cooldown while in storm', () => {
    const cfg = baseConfig({
      errorStormThreshold: 2,
      errorStormCooldownMultiplier: 10,
      cooldownMs: 100,
    });
    const q = makeQueue(cfg);

    // Same-fingerprint events in quick succession.
    q.enqueue(makeEvent(1, 'error', 'same'));
    q.enqueue(makeEvent(2, 'error', 'same')); // triggers storm on 2nd
    expect(q.isInStorm()).toBe(true);

    // Third same-fingerprint should be deduped aggressively
    // (effective cooldown = 100 * 10 = 1000ms; original is 100ms)
    const lengthBefore = q.length();
    q.enqueue(makeEvent(3, 'error', 'same'));
    // Within storm cooldown → deduped → queue unchanged.
    expect(q.length()).toBe(lengthBefore);
  });
});

describe('Sprint 3.7 — adaptive quality degradation', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    mockSendBatch.mockResolvedValue({
      success: true,
      status: 200,
      quotaRemaining: null,
    });
  });

  it('starts with multiplier 1.0 (no adaptation)', () => {
    const q = makeQueue();
    expect(q.getAdaptiveMultiplier()).toBe(1.0);
    expect(q.getEffectiveSampleRate()).toBe(1.0);
  });

  // NOTE: These tests use 'error' level events. Errors bypass both
  // head-based sampling AND the adaptive-multiplier drop gate, so the
  // observed multiplier change is purely a function of the quota signal
  // returned by the mocked transport. Using 'warn' would introduce
  // Math.random() nondeterminism (gate drops some events when
  // multiplier < 1.0). We also bump `errorStormThreshold` above any
  // count we enqueue, so storm dedup doesn't swallow our events.

  it('degrades multiplier when quota-remaining is low', async () => {
    mockSendBatch.mockResolvedValueOnce({
      success: true,
      status: 200,
      quotaRemaining: 0.1, // very low
    });

    const q = makeQueue(baseConfig({ errorStormThreshold: 100 }));
    q.enqueue(makeEvent(1, 'error', 'err-1'));
    await q.flush();
    expect(q.getAdaptiveMultiplier()).toBeLessThan(1.0);
    expect(q.getAdaptiveMultiplier()).toBeCloseTo(0.5, 3);
  });

  it('recovers multiplier when quota is healthy', async () => {
    // First force degradation
    mockSendBatch.mockResolvedValueOnce({
      success: true,
      status: 200,
      quotaRemaining: 0.1,
    });
    const q = makeQueue(baseConfig({ errorStormThreshold: 100 }));
    q.enqueue(makeEvent(1, 'error', 'err-1'));
    await q.flush();
    const degraded = q.getAdaptiveMultiplier();
    expect(degraded).toBe(0.5);

    // Healthy quota → multiplier recovers by 1.5x per batch
    mockSendBatch.mockResolvedValueOnce({
      success: true,
      status: 200,
      quotaRemaining: 0.9,
    });
    q.enqueue(makeEvent(2, 'error', 'err-2'));
    await q.flush();
    expect(q.getAdaptiveMultiplier()).toBeGreaterThan(degraded);
  });

  it('degrades aggressively on HTTP 429', async () => {
    mockSendBatch.mockResolvedValueOnce({
      success: false,
      status: 429,
      retryAfter: 1,
      quotaRemaining: 0.0,
    });
    const q = makeQueue(baseConfig({ errorStormThreshold: 100 }));
    q.enqueue(makeEvent(1, 'error', 'err-1'));
    await q.flush();
    // 429 → multiplier *= 0.25
    expect(q.getAdaptiveMultiplier()).toBeCloseTo(0.25, 3);
  });

  it('multiplier never drops below ADAPTIVE_MIN floor (0.125)', async () => {
    const q = makeQueue(baseConfig({ errorStormThreshold: 100 }));
    for (let i = 0; i < 10; i++) {
      mockSendBatch.mockResolvedValueOnce({
        success: true,
        status: 200,
        quotaRemaining: 0.1,
      });
      q.enqueue(makeEvent(i, 'error', `err-${i}`));
      await q.flush();
    }
    expect(q.getAdaptiveMultiplier()).toBeGreaterThanOrEqual(0.125);
  });

  it('multiplier never exceeds 1.0 even under sustained recovery', async () => {
    const q = makeQueue(baseConfig({ errorStormThreshold: 100 }));
    for (let i = 0; i < 10; i++) {
      mockSendBatch.mockResolvedValueOnce({
        success: true,
        status: 200,
        quotaRemaining: 0.95,
      });
      q.enqueue(makeEvent(i, 'error', `err-${i}`));
      await q.flush();
    }
    expect(q.getAdaptiveMultiplier()).toBeLessThanOrEqual(1.0);
  });
});
