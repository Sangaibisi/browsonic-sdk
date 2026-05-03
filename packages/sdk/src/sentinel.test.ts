// SPDX-License-Identifier: Apache-2.0

/**
 * Browsonic lifecycle + Critical Path + async bootstrap — regression suite.
 *
 * Covers:
 *   - Sprint 2.1 — 'initializing' state exists and is reachable.
 *   - Sprint 2.3/2.4 — enterCriticalPath / exitCriticalPath behavior.
 *   - Sprint 2.5 — init() is sync, start() awaits bootstrap.
 *   - Sprint 2.6 — pre-bootstrap buffer replays on transition.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock transport so nothing hits the network.
vi.mock('./transport', () => ({
  sendBatch: vi.fn().mockResolvedValue({ success: true, status: 200 }),
  calculateBackoff: (a: number) => Math.min(1000 * 2 ** a, 30_000),
}));

import { Browsonic, resetBrowsonic } from './sentinel';
import { sendBatch } from './transport';

function makeSdkConfig() {
  return {
    apiEndpoint: 'https://api.test',
    appKey: 'app',
    apiKey: 'k',
    debug: false,
    // trackPageViews requires apiKey; set false to simplify in-unit tests
    trackPageViews: false,
    // Make sampling sticky-on for deterministic assertions
    sampleRate: 1.0,
    flushIntervalMs: 1000,
  };
}

describe('Browsonic — lifecycle states', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    vi.clearAllMocks();
    resetBrowsonic();
    sdk = new Browsonic();
  });

  afterEach(() => {
    sdk.destroy();
  });

  it('starts in uninitialized state', () => {
    expect(sdk.getState()).toBe('uninitialized');
  });

  it('init() transitions sync to initializing (not running yet)', () => {
    const ok = sdk.init(makeSdkConfig());
    expect(ok).toBe(true);
    expect(sdk.getState()).toBe('initializing');
  });

  it('start() resolves true once bootstrap completes', async () => {
    sdk.init(makeSdkConfig());
    const ok = await sdk.start();
    expect(ok).toBe(true);
    expect(sdk.getState()).toBe('running');
  });

  it('start() on already-running resolves true immediately', async () => {
    sdk.init(makeSdkConfig());
    await sdk.start();
    const again = await sdk.start();
    expect(again).toBe(true);
  });

  it('start() when uninitialized resolves false', async () => {
    const ok = await sdk.start();
    expect(ok).toBe(false);
  });

  it('destroy() during initializing resolves pending start() with false', async () => {
    sdk.init(makeSdkConfig());
    const startPromise = sdk.start();
    sdk.destroy();
    const result = await startPromise;
    expect(result).toBe(false);
    expect(sdk.getState()).toBe('destroyed');
  });

  it('re-init() while initializing is rejected', () => {
    sdk.init(makeSdkConfig());
    const second = sdk.init(makeSdkConfig());
    expect(second).toBe(false);
  });

  it('re-init() while running is rejected', async () => {
    sdk.init(makeSdkConfig());
    await sdk.start();
    const second = sdk.init(makeSdkConfig());
    expect(second).toBe(false);
  });

  it('init() after destroy() succeeds', async () => {
    sdk.init(makeSdkConfig());
    await sdk.start();
    sdk.destroy();
    const second = sdk.init(makeSdkConfig());
    expect(second).toBe(true);
    const ok = await sdk.start();
    expect(ok).toBe(true);
  });
});

describe('Browsonic — pre-bootstrap event buffer', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    vi.clearAllMocks();
    resetBrowsonic();
    sdk = new Browsonic();
  });

  afterEach(() => {
    sdk.destroy();
  });

  it('captureError during initializing is replayed after start()', async () => {
    sdk.init(makeSdkConfig());
    expect(sdk.getState()).toBe('initializing');

    // Fire an error BEFORE bootstrap completes
    sdk.captureError(new Error('pre-bootstrap boom'));

    await sdk.start();

    // In 0.3.0 'error' level is batched (no more instant flush) —
    // manual flush is required for the test to observe delivery.
    await sdk.flush();

    expect(sendBatch).toHaveBeenCalled();
    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(batch.events.length).toBe(1);
    expect(batch.events[0].message).toBe('pre-bootstrap boom');
  });

  it('captureMessage during initializing is replayed', async () => {
    sdk.init(makeSdkConfig());
    sdk.captureMessage('pre-bootstrap info', 'info');
    sdk.captureMessage('pre-bootstrap warn', 'warn');
    await sdk.start();

    // These are non-error, flushed on normal batch timer. Give them a tick.
    await sdk.flush();

    expect(sendBatch).toHaveBeenCalled();
    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const messages = batch.events.map((e: { message: string }) => e.message);
    expect(messages).toContain('pre-bootstrap info');
    expect(messages).toContain('pre-bootstrap warn');
  });

  it('buffer is capped — oldest events are dropped', async () => {
    // Use a large batch size so one flush drains the replayed queue.
    sdk.init({ ...makeSdkConfig(), maxBatchSize: 100 });
    // Push more than cap (50) to verify drop-oldest behavior.
    for (let i = 0; i < 60; i++) {
      sdk.captureMessage(`msg-${i}`, 'warn');
    }
    await sdk.start();
    await sdk.flush();

    // Aggregate messages across all sendBatch calls (in case batch split).
    const mock = sendBatch as unknown as ReturnType<typeof vi.fn>;
    const allMessages: string[] = [];
    for (const call of mock.mock.calls) {
      for (const e of call[0].events) allMessages.push(e.message);
    }
    // First 10 (msg-0 .. msg-9) should have been dropped by the 50-cap buffer.
    expect(allMessages).not.toContain('msg-0');
    expect(allMessages).not.toContain('msg-9');
    expect(allMessages).toContain('msg-10');
    expect(allMessages).toContain('msg-59');
    expect(allMessages.length).toBe(50);
  });

  it('buffered events dropped entirely if destroy() called before start()', async () => {
    sdk.init(makeSdkConfig());
    sdk.captureError(new Error('will never ship'));
    sdk.destroy();
    expect(sendBatch).not.toHaveBeenCalled();
  });
});

describe('Browsonic — Critical Path mode', () => {
  let sdk: Browsonic;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetBrowsonic();
    sdk = new Browsonic();
    sdk.init(makeSdkConfig());
    await sdk.start();
  });

  afterEach(() => {
    sdk.destroy();
  });

  it('isInCriticalPath reflects state', () => {
    expect(sdk.isInCriticalPath()).toBe(false);
    sdk.enterCriticalPath({ reason: 'checkout' });
    expect(sdk.isInCriticalPath()).toBe(true);
    sdk.exitCriticalPath();
    expect(sdk.isInCriticalPath()).toBe(false);
  });

  it('non-error events are dropped during critical path (default captureOnly=[error])', async () => {
    sdk.enterCriticalPath({ reason: 'checkout' });
    sdk.captureMessage('checkout step 1', 'info');
    sdk.captureMessage('checkout warn', 'warn');
    await sdk.flush();
    // Nothing was queued
    expect(sendBatch).not.toHaveBeenCalled();
  });

  it('error events still flow during critical path', async () => {
    sdk.enterCriticalPath({ reason: 'checkout' });
    sdk.captureError(new Error('payment failed'));
    await sdk.flush(); // 0.3.0: error batches, requires flush()

    expect(sendBatch).toHaveBeenCalled();
    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(batch.events[0].message).toBe('payment failed');
    // Sprint P14 (F3.2.B): events captured inside a critical path
    // window carry the flow reason for backend breakdown.
    expect(batch.events[0]._criticalPath).toBe('checkout');
  });

  it('events outside critical path do not carry _criticalPath tag', async () => {
    sdk.captureError(new Error('noise'));
    await sdk.flush();
    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(batch.events[0]._criticalPath).toBeUndefined();
  });

  it('custom captureOnly respected', async () => {
    sdk.enterCriticalPath({
      reason: 'checkout',
      captureOnly: ['error', 'warn'],
    });
    sdk.captureMessage('info dropped', 'info');
    sdk.captureMessage('warn kept', 'warn');
    await sdk.flush();

    expect(sendBatch).toHaveBeenCalled();
    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const messages = batch.events.map((e: { message: string }) => e.message);
    expect(messages).toContain('warn kept');
    expect(messages).not.toContain('info dropped');
  });

  it('exitCriticalPath restores normal event flow', async () => {
    sdk.enterCriticalPath({ reason: 'checkout' });
    sdk.captureMessage('dropped', 'info');
    sdk.exitCriticalPath();
    sdk.captureMessage('kept', 'info');
    await sdk.flush();

    expect(sendBatch).toHaveBeenCalled();
    const batch = (sendBatch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const messages = batch.events.map((e: { message: string }) => e.message);
    expect(messages).toEqual(['kept']);
  });

  it('auto-exit timer fires after autoExitMs', async () => {
    vi.useFakeTimers();
    sdk.enterCriticalPath({ reason: 'checkout', autoExitMs: 1000 });
    expect(sdk.isInCriticalPath()).toBe(true);

    vi.advanceTimersByTime(999);
    expect(sdk.isInCriticalPath()).toBe(true);

    vi.advanceTimersByTime(2);
    expect(sdk.isInCriticalPath()).toBe(false);
    vi.useRealTimers();
  });

  it('calling enterCriticalPath twice replaces options + resets timer', () => {
    vi.useFakeTimers();
    sdk.enterCriticalPath({ reason: 'first', autoExitMs: 500 });
    vi.advanceTimersByTime(400);
    sdk.enterCriticalPath({ reason: 'second', autoExitMs: 5000 });
    vi.advanceTimersByTime(150); // total 550 → would've triggered first timer
    expect(sdk.isInCriticalPath()).toBe(true); // second timer not yet up
    vi.useRealTimers();
    sdk.exitCriticalPath();
  });

  it('exitCriticalPath is idempotent — safe to call when not in critical path', () => {
    expect(() => sdk.exitCriticalPath()).not.toThrow();
    expect(sdk.isInCriticalPath()).toBe(false);
  });

  it('destroy() clears critical path + timer', () => {
    vi.useFakeTimers();
    sdk.enterCriticalPath({ reason: 'checkout', autoExitMs: 10000 });
    sdk.destroy();
    expect(sdk.getState()).toBe('destroyed');
    // No errors when advancing past auto-exit point
    vi.advanceTimersByTime(20000);
    vi.useRealTimers();
  });
});
