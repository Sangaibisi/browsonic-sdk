// SPDX-License-Identifier: Apache-2.0

/**
 * Linked-errors regression suite.
 *
 * Covers the three failure modes that previously slipped through manual
 * testing: max-depth runaway, cycles (a -> b -> a), and non-Error
 * causes. Each case here corresponds to a bug we want to keep caught.
 */
import { describe, it, expect } from 'vitest';
import {
  unwindLinkedErrors,
  DEFAULT_LINKED_ERRORS_MAX_DEPTH,
  type LinkedError,
} from './linked-errors';

describe('unwindLinkedErrors', () => {
  it('returns [] when error is not an object', () => {
    expect(unwindLinkedErrors(undefined)).toEqual([]);
    expect(unwindLinkedErrors(null)).toEqual([]);
    expect(unwindLinkedErrors('boom')).toEqual([]);
    expect(unwindLinkedErrors(42)).toEqual([]);
  });

  it('returns [] when error has no cause property', () => {
    expect(unwindLinkedErrors(new Error('plain'))).toEqual([]);
  });

  it('returns [] when cause is null or undefined', () => {
    expect(unwindLinkedErrors(new Error('top', { cause: undefined }))).toEqual([]);
    // Older runtimes may set cause to null explicitly; treat as no chain.
    const e = new Error('top');
    (e as Error & { cause?: unknown }).cause = null;
    expect(unwindLinkedErrors(e)).toEqual([]);
  });

  it('unwinds a single-level Error cause', () => {
    const root = new TypeError('underlying');
    const top = new Error('wrapped', { cause: root });
    const linked = unwindLinkedErrors(top);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject<Partial<LinkedError>>({
      type: 'TypeError',
      message: 'underlying',
    });
    // stack and stackFrames are best-effort — happy-dom may produce them
    // but Node may not, so we only assert structure, not content.
    expect(typeof linked[0]?.stack === 'string' || linked[0]?.stack === null).toBe(true);
    expect(Array.isArray(linked[0]?.stackFrames)).toBe(true);
  });

  it('unwinds a multi-level cause chain in cause-first order', () => {
    const a = new RangeError('a');
    const b = new Error('b', { cause: a });
    const c = new Error('c', { cause: b });
    const linked = unwindLinkedErrors(c);
    expect(linked).toHaveLength(2);
    expect(linked[0]?.message).toBe('b');
    expect(linked[0]?.type).toBe('Error');
    expect(linked[1]?.message).toBe('a');
    expect(linked[1]?.type).toBe('RangeError');
  });

  it('caps at DEFAULT_LINKED_ERRORS_MAX_DEPTH (5)', () => {
    // Build a chain of 10 errors; expect the unwinder to stop at 5.
    let chain = new Error('level-0');
    for (let i = 1; i < 10; i++) {
      chain = new Error(`level-${i}`, { cause: chain });
    }
    const linked = unwindLinkedErrors(chain);
    expect(linked).toHaveLength(DEFAULT_LINKED_ERRORS_MAX_DEPTH);
    expect(linked[0]?.message).toBe('level-8'); // immediate cause
    expect(linked[4]?.message).toBe('level-4'); // 5 levels down
  });

  it('respects an explicit maxDepth override', () => {
    let chain = new Error('level-0');
    for (let i = 1; i < 10; i++) {
      chain = new Error(`level-${i}`, { cause: chain });
    }
    const linked = unwindLinkedErrors(chain, 2);
    expect(linked).toHaveLength(2);
    expect(linked[0]?.message).toBe('level-8');
    expect(linked[1]?.message).toBe('level-7');
  });

  it('terminates safely on direct self-cycle (a.cause = a)', () => {
    const a = new Error('self-loop');
    (a as Error & { cause?: unknown }).cause = a;
    const linked = unwindLinkedErrors(a);
    // Top-level is marked visited up-front, so the cycle short-circuits
    // before even adding the first link. Empty array is the safe answer.
    expect(linked).toEqual([]);
  });

  it('terminates safely on indirect cycle (a -> b -> a)', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as Error & { cause?: unknown }).cause = b;
    const linked = unwindLinkedErrors(a);
    // The unwind sees b first (depth 1), then tries to follow b.cause
    // which points back to a — visited, short-circuit.
    expect(linked).toHaveLength(1);
    expect(linked[0]?.message).toBe('b');
  });

  it('captures a string cause as a synthetic linked error', () => {
    const top = new Error('wrapped', { cause: 'plain reason' });
    const linked = unwindLinkedErrors(top);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject<Partial<LinkedError>>({
      type: 'string',
      message: 'plain reason',
      stack: null,
      stackFrames: [],
    });
  });

  it('captures a number cause', () => {
    const top = new Error('wrapped', { cause: 42 });
    const linked = unwindLinkedErrors(top);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.type).toBe('number');
    expect(linked[0]?.message).toBe('42');
  });

  it('captures a plain-object cause via JSON.stringify', () => {
    const top = new Error('wrapped', { cause: { code: 'E_TIMEOUT', retries: 3 } });
    const linked = unwindLinkedErrors(top);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.type).toBe('Object');
    expect(linked[0]?.message).toContain('E_TIMEOUT');
  });

  it('survives an unserializable (circular) plain-object cause', () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const top = new Error('wrapped', { cause: circular });
    const linked = unwindLinkedErrors(top);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.message).toBe('[unserializable cause]');
  });

  it('stops the chain at the first non-Error cause', () => {
    // Error -> Error -> string. The string is captured then we stop;
    // even if the string had a `cause` it would not be followed.
    const root = new Error('underlying');
    const middle = new Error('middle', { cause: root });
    const top = new Error('top', { cause: middle });
    // Force the middle's cause to a string instead of root.
    (middle as Error & { cause?: unknown }).cause = 'string reason';
    const linked = unwindLinkedErrors(top);
    expect(linked).toHaveLength(2);
    expect(linked[0]?.message).toBe('middle');
    expect(linked[0]?.type).toBe('Error');
    expect(linked[1]?.message).toBe('string reason');
    expect(linked[1]?.type).toBe('string');
  });

  it('preserves custom Error subclass names in the type field', () => {
    class APIError extends Error {
      constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = 'APIError';
      }
    }
    const root = new APIError('downstream failed');
    const top = new Error('user load failed', { cause: root });
    const linked = unwindLinkedErrors(top);
    expect(linked).toHaveLength(1);
    expect(linked[0]?.type).toBe('APIError');
    expect(linked[0]?.message).toBe('downstream failed');
  });
});
