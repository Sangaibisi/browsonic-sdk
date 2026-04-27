/**
 * Utils — hash + fingerprint + truncate + UUID regression suite.
 * Added in Sprint 5 to cover the cyrb53 migration + util plumbing.
 */
import { describe, it, expect } from 'vitest';
import {
  simpleHash,
  cyrb53,
  generateFingerprint,
  truncate,
  truncateStack,
  cleanStackTrace,
  uuid,
  getByteSize,
  resolveEndpoint,
  normalizeUrlForFingerprint,
} from './index';

describe('cyrb53 — 53-bit hash', () => {
  it('produces stable output for the same input', () => {
    const a = cyrb53('abc');
    const b = cyrb53('abc');
    expect(a).toBe(b);
  });

  it('produces different output for different inputs', () => {
    expect(cyrb53('abc')).not.toBe(cyrb53('abd'));
  });

  it('returns a string', () => {
    expect(typeof cyrb53('x')).toBe('string');
  });

  it('supports seed for namespacing', () => {
    expect(cyrb53('abc', 0)).not.toBe(cyrb53('abc', 1));
  });

  it('handles empty string without throwing', () => {
    expect(() => cyrb53('')).not.toThrow();
    expect(typeof cyrb53('')).toBe('string');
  });

  it('handles long inputs deterministically', () => {
    const longA = 'x'.repeat(10_000);
    expect(cyrb53(longA)).toBe(cyrb53(longA));
  });

  it('is distinct from simpleHash for the same input (regression)', () => {
    // Migration smoke: new backend dedup keys should NOT equal legacy ones.
    expect(cyrb53('abc')).not.toBe(simpleHash('abc'));
  });
});

describe('simpleHash — legacy 32-bit hash', () => {
  it('still produces stable output for back-compat consumers', () => {
    expect(simpleHash('abc')).toBe(simpleHash('abc'));
  });
});

describe('generateFingerprint', () => {
  it('returns the same fingerprint for identical inputs', () => {
    const a = generateFingerprint('error', 'boom', 'at x:1:1', 'https://a', 10);
    const b = generateFingerprint('error', 'boom', 'at x:1:1', 'https://a', 10);
    expect(a).toBe(b);
  });

  it('differs when type changes', () => {
    const a = generateFingerprint('error', 'x', null, 'u', 10);
    const b = generateFingerprint('network_error', 'x', null, 'u', 10);
    expect(a).not.toBe(b);
  });

  it('differs when message changes', () => {
    const a = generateFingerprint('error', 'boom', null, 'u', 10);
    const b = generateFingerprint('error', 'bang', null, 'u', 10);
    expect(a).not.toBe(b);
  });

  it('ignores stack frames beyond maxStackFrames', () => {
    const stack10 = Array.from({ length: 10 }, (_, i) => `at fn${i}`).join('\n');
    const stack20 = stack10 + '\n' + Array.from({ length: 10 }, (_, i) => `at more${i}`).join('\n');
    // Same 10-frame prefix → same fingerprint at maxStackFrames=10.
    expect(generateFingerprint('error', 'm', stack10, 'u', 10)).toBe(
      generateFingerprint('error', 'm', stack20, 'u', 10)
    );
  });

  it('handles null stack', () => {
    expect(() => generateFingerprint('error', 'm', null, 'u', 10)).not.toThrow();
  });
});

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    expect(truncate('hi', 10)).toBe('hi');
  });

  it('appends ellipsis at max length', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde...');
  });
});

describe('truncateStack', () => {
  it('returns null input as-is', () => {
    const result = truncateStack(null, 10);
    expect(result.stack).toBeNull();
    expect(result.truncated).toBe(false);
  });

  it('keeps stacks at or under max frames', () => {
    const stack = Array.from({ length: 5 }, (_, i) => `at fn${i}`).join('\n');
    const result = truncateStack(stack, 10);
    expect(result.stack).toBe(stack);
    expect(result.truncated).toBe(false);
  });

  it('truncates long stacks and flags it', () => {
    const stack = Array.from({ length: 20 }, (_, i) => `at fn${i}`).join('\n');
    const result = truncateStack(stack, 5);
    expect(result.stack?.split('\n').length).toBe(5);
    expect(result.truncated).toBe(true);
  });
});

describe('cleanStackTrace', () => {
  it('returns null for null input', () => {
    expect(cleanStackTrace(null)).toBeNull();
    expect(cleanStackTrace(undefined)).toBeNull();
  });

  it('removes SDK internal frames', () => {
    const stack = [
      'Error: boom',
      '  at user.handleClick (https://app.test/app.js:10:5)',
      '  at onEvent (/collectors/console.js:50:1)',
      '  at sentinel.handleEvent (/dist/esm/sentinel.js:100:1)',
      '  at app.main (https://app.test/main.js:5:1)',
    ].join('\n');
    const cleaned = cleanStackTrace(stack);
    expect(cleaned).toContain('user.handleClick');
    expect(cleaned).toContain('app.main');
    expect(cleaned).not.toContain('/collectors/console.');
    expect(cleaned).not.toContain('/dist/esm/sentinel.');
  });

  it('keeps error message line', () => {
    const cleaned = cleanStackTrace('Error: boom\n  at /collectors/console.js:1:1');
    expect(cleaned).toContain('Error: boom');
  });

  it('falls back to original stack if filtering would leave nothing useful', () => {
    const sdkOnly = [
      'Error: boom',
      '  at /collectors/console.js:1:1',
      '  at /dist/esm/sentinel.js:1:1',
    ].join('\n');
    const cleaned = cleanStackTrace(sdkOnly);
    // Safety fallback: if everything is filtered, return original.
    expect(cleaned).toBe(sdkOnly);
  });
});

describe('uuid', () => {
  it('returns a string', () => {
    expect(typeof uuid()).toBe('string');
  });

  it('returns a different value on each call', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) ids.add(uuid());
    expect(ids.size).toBe(100);
  });

  it('matches RFC 4122 format (looser check for fallback)', () => {
    // native crypto.randomUUID gives 8-4-4-4-12 hex; our fallback is same shape.
    expect(uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('getByteSize', () => {
  it('returns byte count for a plain object', () => {
    expect(getByteSize({ a: 'b' })).toBeGreaterThan(0);
  });

  it('handles circular structures without throwing', () => {
    const obj: Record<string, unknown> = {};
    obj.self = obj;
    // Blob path throws on circular; impl falls back to length * 2.
    const size = getByteSize(obj);
    // The fallback path for circulars produces 0 (JSON.stringify throws,
    // returning the fallback Blob + stringify second attempt also throws
    // → caller-supplied fallback path). Accept any non-negative number.
    expect(size).toBeGreaterThanOrEqual(0);
  });
});

describe('normalizeUrlForFingerprint — grouping-friendly paths', () => {
  it('replaces numeric path IDs', () => {
    expect(normalizeUrlForFingerprint('https://app.example.com/users/123')).toBe(
      'https://app.example.com/users/:id'
    );
    expect(normalizeUrlForFingerprint('https://app.example.com/users/123/orders/456')).toBe(
      'https://app.example.com/users/:id/orders/:id'
    );
  });

  it('replaces UUIDs regardless of case', () => {
    const a = normalizeUrlForFingerprint(
      'https://app.example.com/items/550e8400-e29b-41d4-a716-446655440000'
    );
    const b = normalizeUrlForFingerprint(
      'https://app.example.com/items/7c9e6679-7425-40de-944b-e07fc1f90ae7'
    );
    expect(a).toBe(b);
    expect(a).toContain(':uuid');
  });

  it('drops query strings + fragments', () => {
    const a = normalizeUrlForFingerprint('https://app.example.com/search?q=foo&t=1');
    const b = normalizeUrlForFingerprint('https://app.example.com/search?q=bar&t=2');
    expect(a).toBe(b);
    expect(a).toBe('https://app.example.com/search');

    const c = normalizeUrlForFingerprint('https://app.example.com/doc#section-a');
    const d = normalizeUrlForFingerprint('https://app.example.com/doc#section-b');
    expect(c).toBe(d);
  });

  it('preserves origin so cross-host errors do not collide', () => {
    const a = normalizeUrlForFingerprint('https://a.example.com/users/1');
    const b = normalizeUrlForFingerprint('https://b.example.com/users/1');
    expect(a).not.toBe(b);
  });

  it('returns raw input on parse failure (empty string → empty)', () => {
    expect(normalizeUrlForFingerprint('')).toBe('');
    // Relative paths parse against the sentinel base and still normalise.
    expect(normalizeUrlForFingerprint('/users/123')).toBe('/users/:id');
  });

  it('integrates with generateFingerprint — /users/123 vs /users/456 collide', () => {
    const fp1 = generateFingerprint('error', 'boom', null, 'https://app.example.com/users/123', 10);
    const fp2 = generateFingerprint('error', 'boom', null, 'https://app.example.com/users/456', 10);
    expect(fp1).toBe(fp2);
  });
});

describe('resolveEndpoint — URL compose', () => {
  it('resolves an absolute path against a bare host', () => {
    expect(resolveEndpoint('https://api.example.com', '/v1/events')).toBe(
      'https://api.example.com/v1/events'
    );
  });

  it('normalises trailing slash on base', () => {
    // Previous string-concat gave `https://api.example.com//v1/events` —
    // this test pins the corrected behaviour.
    expect(resolveEndpoint('https://api.example.com/', '/v1/events')).toBe(
      'https://api.example.com/v1/events'
    );
  });

  it('strips base path when resolving an absolute path', () => {
    // Matches pre-2.1 string-concat behaviour: the absolute path wins,
    // so a base with a prefix does not get that prefix into ingest URLs.
    expect(resolveEndpoint('https://api.example.com/prefix', '/v1/events')).toBe(
      'https://api.example.com/v1/events'
    );
  });

  it('preserves port and https', () => {
    expect(resolveEndpoint('https://api.example.com:8443', '/v1/events')).toBe(
      'https://api.example.com:8443/v1/events'
    );
  });

  it('falls back to string concat on malformed base (safety net)', () => {
    // Defensive fallback — validateConfig should have caught this, but
    // resolveEndpoint must never crash the SDK mid-flight.
    expect(resolveEndpoint('not a url', '/v1/events')).toBe('not a url/v1/events');
  });
});
