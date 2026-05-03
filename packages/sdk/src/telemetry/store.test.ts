// SPDX-License-Identifier: Apache-2.0

/**
 * TelemetryStore — ring buffer + pause/resume regression suite.
 * pause()/resume() added in 0.3.0 for Critical Path mode.
 */
import { describe, it, expect } from 'vitest';
import { createTelemetryStore } from './store';

describe('TelemetryStore — ring buffer semantics', () => {
  it('accumulates entries until maxSize, then overwrites oldest', () => {
    const store = createTelemetryStore(3);
    store.add({ category: 'console', data: { level: 'log', message: 'a', stack: null } });
    store.add({ category: 'console', data: { level: 'log', message: 'b', stack: null } });
    store.add({ category: 'console', data: { level: 'log', message: 'c', stack: null } });
    expect(store.size()).toBe(3);

    store.add({ category: 'console', data: { level: 'log', message: 'd', stack: null } });
    expect(store.size()).toBe(3);

    const timeline = store.getTimeline();
    // Oldest 'a' dropped; order chronological (b, c, d)
    expect(timeline.console.map((e) => e.message)).toEqual(['b', 'c', 'd']);
  });

  it('getRecent(n) returns newest-first', () => {
    const store = createTelemetryStore(5);
    for (const m of ['a', 'b', 'c']) {
      store.add({ category: 'console', data: { level: 'log', message: m, stack: null } });
    }
    const recent = store.getRecent(2);
    expect(recent.length).toBe(2);
    expect((recent[0].data as { message: string }).message).toBe('c');
    expect((recent[1].data as { message: string }).message).toBe('b');
  });

  it('clear empties buffer', () => {
    const store = createTelemetryStore(5);
    store.add({ category: 'console', data: { level: 'log', message: 'x', stack: null } });
    store.clear();
    expect(store.size()).toBe(0);
    expect(store.getTimeline().console).toEqual([]);
  });
});

describe('TelemetryStore — pause / resume (Critical Path support)', () => {
  it('pause() makes add() a no-op until resume()', () => {
    const store = createTelemetryStore(5);
    store.add({ category: 'console', data: { level: 'log', message: 'before', stack: null } });
    expect(store.size()).toBe(1);

    store.pause();
    expect(store.isPaused()).toBe(true);

    store.add({ category: 'console', data: { level: 'log', message: 'during', stack: null } });
    store.add({ category: 'console', data: { level: 'log', message: 'during2', stack: null } });
    expect(store.size()).toBe(1); // still 1

    store.resume();
    expect(store.isPaused()).toBe(false);

    store.add({ category: 'console', data: { level: 'log', message: 'after', stack: null } });
    expect(store.size()).toBe(2);

    const messages = store.getTimeline().console.map((e) => e.message);
    expect(messages).toEqual(['before', 'after']);
  });

  it('existing entries remain queryable while paused', () => {
    const store = createTelemetryStore(5);
    store.add({ category: 'console', data: { level: 'log', message: 'x', stack: null } });
    store.pause();
    expect(store.getTimeline().console.length).toBe(1);
    expect(store.size()).toBe(1);
  });

  it('pause is idempotent', () => {
    const store = createTelemetryStore(5);
    store.pause();
    store.pause();
    expect(store.isPaused()).toBe(true);
    store.resume();
    expect(store.isPaused()).toBe(false);
  });
});
