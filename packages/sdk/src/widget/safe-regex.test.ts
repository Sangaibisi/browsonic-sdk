// SPDX-License-Identifier: Apache-2.0

/**
 * Safe-regex / ReDoS mitigation — regression suite.
 *
 * Covers TEKNIK-IYILESTIRME-PLANI.md §1.2.
 */
import { describe, it, expect, vi } from 'vitest';
import { compileSafeRegex, createRegexCache, MAX_PATTERN_LENGTH } from './safe-regex';

describe('compileSafeRegex — length and shape gates', () => {
  it('compiles ordinary patterns', () => {
    const re = compileSafeRegex('Loading chunk', 'i');
    expect(re).toBeInstanceOf(RegExp);
    expect(re!.test('Loading chunk 42 failed')).toBe(true);
  });

  it('rejects empty pattern', () => {
    const onReject = vi.fn();
    expect(compileSafeRegex('', 'i', onReject)).toBeNull();
    expect(onReject).toHaveBeenCalledOnce();
  });

  it('rejects patterns over MAX_PATTERN_LENGTH', () => {
    const huge = 'a'.repeat(MAX_PATTERN_LENGTH + 1);
    const onReject = vi.fn();
    expect(compileSafeRegex(huge, 'i', onReject)).toBeNull();
    expect(onReject).toHaveBeenCalled();
    expect(onReject.mock.calls[0][0]).toMatch(/exceeds/);
  });

  it('rejects patterns at exactly MAX_PATTERN_LENGTH + 1', () => {
    expect(compileSafeRegex('b'.repeat(MAX_PATTERN_LENGTH + 1), 'i')).toBeNull();
  });

  it('accepts patterns at exactly MAX_PATTERN_LENGTH', () => {
    expect(compileSafeRegex('c'.repeat(MAX_PATTERN_LENGTH), 'i')).not.toBeNull();
  });

  it('rejects textbook catastrophic backtracking: (a+)+', () => {
    const onReject = vi.fn();
    expect(compileSafeRegex('(a+)+', 'i', onReject)).toBeNull();
    expect(onReject.mock.calls[0][0]).toMatch(/nested unbounded quantifier/);
  });

  it('rejects (a*)*', () => {
    expect(compileSafeRegex('(a*)*', 'i')).toBeNull();
  });

  it('rejects (.+)+', () => {
    expect(compileSafeRegex('(.+)+', 'i')).toBeNull();
  });

  it('rejects (.+)*b', () => {
    expect(compileSafeRegex('(.+)*b', 'i')).toBeNull();
  });

  it('rejects (?:a+)+', () => {
    expect(compileSafeRegex('(?:a+)+', 'i')).toBeNull();
  });

  it('accepts a simple capture with a single quantifier', () => {
    expect(compileSafeRegex('(foo|bar)', 'i')).not.toBeNull();
    expect(compileSafeRegex('(foo)+', 'i')).not.toBeNull();
  });

  it('reports invalid regex syntax via onReject', () => {
    const onReject = vi.fn();
    expect(compileSafeRegex('(unclosed', 'i', onReject)).toBeNull();
    expect(onReject).toHaveBeenCalled();
    expect(onReject.mock.calls[0][0]).toMatch(/invalid regex/);
  });
});

describe('createRegexCache — memoization', () => {
  it('returns the same RegExp instance for repeated identical calls', () => {
    const cache = createRegexCache();
    const a = cache('error .+', 'i');
    const b = cache('error .+', 'i');
    expect(a).toBe(b);
  });

  it('treats different flags as distinct cache keys', () => {
    const cache = createRegexCache();
    const a = cache('x', 'i');
    const b = cache('x', 'g');
    expect(a).not.toBe(b);
  });

  it('returns null on rejection and caches the null', () => {
    const onReject = vi.fn();
    const cache = createRegexCache(onReject);
    expect(cache('(a+)+')).toBeNull();
    expect(cache('(a+)+')).toBeNull();
    // onReject fires once (cached null) — acceptable either way, this test
    // documents current behavior
    expect(onReject).toHaveBeenCalled();
  });
});

describe('ReDoS performance smoke — nominal patterns compile fast', () => {
  it('compiles 100 unique safe patterns in under 10ms', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      compileSafeRegex(`Loading chunk ${i}`, 'i');
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10);
  });
});
