/**
 * Widget rule matcher — event matching + cooldown + minCount/within regression suite.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRuleMatcher } from './rule-matcher';
import type { BrowsonicEvent, WidgetRule } from '../types';

function makeEvent(over: Partial<BrowsonicEvent> = {}): BrowsonicEvent {
  return {
    eventId: 'e',
    timestamp: new Date().toISOString(),
    type: 'error',
    level: 'error',
    message: 'TypeError: x is undefined',
    stack: null,
    context: { url: 'https://app.test/page', referrer: '', pageAge: 0 },
    telemetry: null,
    ...over,
  };
}

function makeRule(partial: Partial<WidgetRule> = {}): WidgetRule {
  return {
    id: 'r1',
    match: {},
    notification: { title: 'hi', message: 'x', severity: 'error' },
    ...partial,
  };
}

describe('RuleMatcher — type + level filters', () => {
  it('matches rule with type filter', () => {
    const m = createRuleMatcher([makeRule({ match: { type: ['error'] } })]);
    const result = m.check(makeEvent({ type: 'error' }), 'https://x.test');
    expect(result).not.toBeNull();
  });

  it('rejects rule when type does not match', () => {
    const m = createRuleMatcher([makeRule({ match: { type: ['unhandledrejection'] } })]);
    expect(m.check(makeEvent({ type: 'error' }), 'https://x.test')).toBeNull();
  });

  it('matches rule with level filter', () => {
    const m = createRuleMatcher([makeRule({ match: { level: ['warn', 'error'] } })]);
    expect(m.check(makeEvent({ level: 'error' }), 'x')).not.toBeNull();
    expect(m.check(makeEvent({ level: 'info' }), 'x')).toBeNull();
  });
});

describe('RuleMatcher — regex patterns', () => {
  it('matches messagePattern regex', () => {
    const m = createRuleMatcher([makeRule({ match: { messagePattern: 'TypeError' } })]);
    expect(m.check(makeEvent({ message: 'TypeError: foo' }), 'https://x.test')).not.toBeNull();
    expect(m.check(makeEvent({ message: 'ReferenceError: bar' }), 'https://x.test')).toBeNull();
  });

  it('matches urlPattern regex', () => {
    const m = createRuleMatcher([makeRule({ match: { urlPattern: '/checkout' } })]);
    expect(m.check(makeEvent(), 'https://shop.test/checkout/step-2')).not.toBeNull();
    expect(m.check(makeEvent(), 'https://shop.test/home')).toBeNull();
  });

  it('safely rejects catastrophic backtracking regex (ReDoS mitigation)', () => {
    const m = createRuleMatcher([
      makeRule({ match: { messagePattern: '(a+)+b' } }), // nested unbounded
    ]);
    // Safe-regex rejects the pattern → matcher returns null.
    expect(m.check(makeEvent({ message: 'aaab' }), 'https://x.test')).toBeNull();
  });

  it('safely rejects invalid regex', () => {
    const m = createRuleMatcher([makeRule({ match: { messagePattern: '(unclosed' } })]);
    expect(m.check(makeEvent(), 'https://x.test')).toBeNull();
  });
});

describe('RuleMatcher — minCount + withinMs hit counting', () => {
  it('does not trigger until minCount hits occur', () => {
    const m = createRuleMatcher([
      makeRule({
        match: { messagePattern: 'boom', minCount: 3, withinMs: 60_000 },
      }),
    ]);
    expect(m.check(makeEvent({ message: 'boom' }), 'x')).toBeNull();
    expect(m.check(makeEvent({ message: 'boom' }), 'x')).toBeNull();
    expect(m.check(makeEvent({ message: 'boom' }), 'x')).not.toBeNull();
  });

  it('prunes hits outside withinMs window', () => {
    vi.useFakeTimers();
    const m = createRuleMatcher([
      makeRule({
        match: { messagePattern: 'boom', minCount: 2, withinMs: 1000 },
        cooldownMs: 0,
      }),
    ]);
    expect(m.check(makeEvent({ message: 'boom' }), 'x')).toBeNull();
    vi.advanceTimersByTime(1500); // push the first hit outside the window
    expect(m.check(makeEvent({ message: 'boom' }), 'x')).toBeNull();
    // Only the second hit is in-window; minCount=2 not yet reached.
    vi.useRealTimers();
  });
});

describe('RuleMatcher — cooldown', () => {
  it('does not re-trigger within cooldown window', () => {
    vi.useFakeTimers();
    const m = createRuleMatcher([makeRule({ cooldownMs: 1000 })]);
    expect(m.check(makeEvent(), 'x')).not.toBeNull();
    // Immediate re-check: cooldown active
    expect(m.check(makeEvent(), 'x')).toBeNull();
    vi.advanceTimersByTime(1200);
    // Cooldown elapsed → fires again
    expect(m.check(makeEvent(), 'x')).not.toBeNull();
    vi.useRealTimers();
  });

  it('cooldownMs = 0 means no cooldown (every match fires)', () => {
    const m = createRuleMatcher([makeRule({ cooldownMs: 0 })]);
    expect(m.check(makeEvent(), 'x')).not.toBeNull();
    expect(m.check(makeEvent(), 'x')).not.toBeNull();
  });
});

describe('RuleMatcher — enabled flag + disabled rules', () => {
  it('skips rules with enabled=false', () => {
    const m = createRuleMatcher([
      makeRule({ id: 'off', enabled: false }),
      makeRule({ id: 'on', enabled: true }),
    ]);
    const result = m.check(makeEvent(), 'x');
    expect(result?.rule.id).toBe('on');
  });
});

describe('RuleMatcher — addRules + ruleCount + reset', () => {
  it('addRules appends new rules', () => {
    const m = createRuleMatcher([makeRule({ id: 'a' })]);
    expect(m.ruleCount()).toBe(1);
    m.addRules([makeRule({ id: 'b' }), makeRule({ id: 'c' })]);
    expect(m.ruleCount()).toBe(3);
  });

  it('addRules replaces rules with same id', () => {
    const r1 = makeRule({ id: 'x', notification: { title: 'v1', message: 'v1' } });
    const r2 = makeRule({ id: 'x', notification: { title: 'v2', message: 'v2' } });
    const m = createRuleMatcher([r1]);
    m.addRules([r2]);
    expect(m.ruleCount()).toBe(1);
    const result = m.check(makeEvent(), 'x');
    expect(result?.notification.title).toBe('v2');
  });

  it('reset() clears per-rule state (hits + cooldown)', () => {
    vi.useFakeTimers();
    const m = createRuleMatcher([makeRule({ cooldownMs: 60_000 })]);
    expect(m.check(makeEvent(), 'x')).not.toBeNull();
    expect(m.check(makeEvent(), 'x')).toBeNull(); // in cooldown
    m.reset();
    expect(m.check(makeEvent(), 'x')).not.toBeNull(); // state cleared
    vi.useRealTimers();
  });
});
