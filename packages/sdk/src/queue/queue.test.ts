// SPDX-License-Identifier: Apache-2.0

/**
 * Queue — sampling + batch metadata regression suite.
 * Covers PERFORMANCE-STRATEGY §3 (sampling) and CHANGELOG 0.3.0 batch fields.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEventQueue } from './index';
import { resolveConfig } from '../config';
import type { BrowsonicEvent, ResolvedConfig } from '../types';

// Mock transport so we don't hit the network.
vi.mock('../transport', () => ({
  sendBatch: vi.fn().mockResolvedValue({ success: true, status: 200 }),
  calculateBackoff: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
}));

import { sendBatch } from '../transport';

function makeConfig(partial: Partial<Parameters<typeof resolveConfig>[0]> = {}): ResolvedConfig {
  return resolveConfig({
    apiEndpoint: 'https://api.test',
    appKey: 'app',
    apiKey: 'k',
    flushIntervalMs: 1000,
    maxBatchSize: 25,
    persistQueue: false,
    ...partial,
  });
}

function makeEvent(seq: number, level: 'info' | 'warn' | 'error' = 'warn'): BrowsonicEvent {
  return {
    eventId: `evt-${seq}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    type: level === 'error' ? 'error' : 'console_warn',
    level,
    message: `m${seq}`,
    stack: null,
    context: { url: 'https://x.test/a', referrer: '', pageAge: 0 },
    telemetry: null,
  };
}

describe('queue — head-based session sampling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('drops non-error events when session not sampled', () => {
    const q = createEventQueue({
      config: makeConfig(),
      debugLog: () => {},
      getSessionId: () => 'sid',
      getUser: () => null,
      getSessionSampled: () => false,
    });
    q.enqueue(makeEvent(1, 'warn'));
    q.enqueue(makeEvent(2, 'info'));
    expect(q.length()).toBe(0);
  });

  it('always keeps error events regardless of sampling', () => {
    const q = createEventQueue({
      config: makeConfig(),
      debugLog: () => {},
      getSessionId: () => 'sid',
      getUser: () => null,
      getSessionSampled: () => false,
    });
    q.enqueue(makeEvent(1, 'error'));
    // Error events batch normally in 0.3.0 (no more instant flush).
    // They sit in the queue until flushIntervalMs or manual flush().
    expect(q.length()).toBe(1);
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it('always keeps fatal events regardless of sampling AND instant-flushes them', async () => {
    const q = createEventQueue({
      config: makeConfig(),
      debugLog: () => {},
      getSessionId: () => 'sid',
      getUser: () => null,
      getSessionSampled: () => false,
    });
    q.enqueue(makeEvent(1, 'fatal'));
    // Fatal events are instant-flushed — sendBatch called synchronously-ish.
    expect(sendBatch).toHaveBeenCalledTimes(1);
  });

  it('keeps non-error events when session IS sampled', () => {
    const q = createEventQueue({
      config: makeConfig(),
      debugLog: () => {},
      getSessionId: () => 'sid',
      getUser: () => null,
      getSessionSampled: () => true,
    });
    q.enqueue(makeEvent(1, 'warn'));
    q.enqueue(makeEvent(2, 'info'));
    expect(q.length()).toBe(2);
  });

  it('no sampler provided → keeps everything (back-compat)', () => {
    const q = createEventQueue({
      config: makeConfig(),
      debugLog: () => {},
      getSessionId: () => 'sid',
      getUser: () => null,
    });
    q.enqueue(makeEvent(1, 'warn'));
    expect(q.length()).toBe(1);
  });
});

describe('queue — batch metadata in send payload', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes sampled, sampleRate, and sdk metadata', async () => {
    const q = createEventQueue({
      config: makeConfig({ sampleRate: 0.25 }),
      debugLog: () => {},
      getSessionId: () => 'sid',
      getUser: () => null,
      getSessionSampled: () => true,
      sdkName: '@browsonic/sdk',
      sdkVersion: '0.3.0',
    });
    // 0.3.0: fatal is the only instant-flush level. error batches normally.
    q.enqueue(makeEvent(1, 'fatal'));

    // Give the instant-flush microtask time to send
    await new Promise((r) => setTimeout(r, 10));

    expect(sendBatch).toHaveBeenCalled();
    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(batch.sampled).toBe(true);
    expect(batch.sampleRate).toBe(0.25);
    expect(batch.sdk).toEqual({
      name: '@browsonic/sdk',
      version: '0.3.0',
    });
  });

  it('falls back gracefully when sdk metadata not supplied', async () => {
    const q = createEventQueue({
      config: makeConfig(),
      debugLog: () => {},
      getSessionId: () => 'sid',
      getUser: () => null,
      getSessionSampled: () => true,
    });
    q.enqueue(makeEvent(1, 'fatal'));
    await new Promise((r) => setTimeout(r, 10));

    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(batch.sampled).toBe(true);
    expect(batch.sdk).toBeUndefined();
  });
});
