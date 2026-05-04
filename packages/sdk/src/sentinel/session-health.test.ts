// SPDX-License-Identifier: Apache-2.0

/**
 * Session health state machine regression suite (Sprint 9 M2).
 * Locks in the monotonic ordering and the terminal-`'crashed'`
 * contract — once crashed, a session never recovers.
 */
import { describe, it, expect } from 'vitest';
import { transitionOnEvent, markCrashed, severity, type SessionHealth } from './session-health';

describe('transitionOnEvent', () => {
  it('keeps "ok" on info / warn levels', () => {
    expect(transitionOnEvent('ok', 'info')).toBe('ok');
    expect(transitionOnEvent('ok', 'warn')).toBe('ok');
  });

  it('upgrades "ok" → "errored" on error level', () => {
    expect(transitionOnEvent('ok', 'error')).toBe('errored');
  });

  it('upgrades "ok" → "errored" on fatal level', () => {
    expect(transitionOnEvent('ok', 'fatal')).toBe('errored');
  });

  it('keeps "errored" on subsequent error events (idempotent)', () => {
    expect(transitionOnEvent('errored', 'error')).toBe('errored');
    expect(transitionOnEvent('errored', 'fatal')).toBe('errored');
  });

  it('does not downgrade "errored" on info / warn events', () => {
    expect(transitionOnEvent('errored', 'info')).toBe('errored');
    expect(transitionOnEvent('errored', 'warn')).toBe('errored');
  });

  it('keeps "crashed" no matter the next event level (terminal)', () => {
    const levels: Array<
      SessionHealth extends string ? Parameters<typeof transitionOnEvent>[1] : never
    > = ['info', 'warn', 'error', 'fatal'];
    for (const level of levels) {
      expect(transitionOnEvent('crashed', level)).toBe('crashed');
    }
  });
});

describe('markCrashed', () => {
  it('returns "crashed"', () => {
    expect(markCrashed()).toBe('crashed');
  });
});

describe('severity', () => {
  it('orders ok < errored < crashed', () => {
    expect(severity('ok')).toBe(0);
    expect(severity('errored')).toBe(1);
    expect(severity('crashed')).toBe(2);
    expect(severity('ok') < severity('errored')).toBe(true);
    expect(severity('errored') < severity('crashed')).toBe(true);
  });
});
