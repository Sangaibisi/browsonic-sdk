// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { filterHeaders, redactString } from './redaction';

describe('redactString (Sprint 3 / gap B5)', () => {
  it('replaces email addresses with [REDACTED]', () => {
    expect(redactString('contact: jane.doe@example.test')).toBe('contact: [REDACTED]');
  });

  it('replaces JWT-shaped tokens', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzNDUiLCJleHAiOjE2OTk5OTk5OTl9.signature_value_here_long_enough';
    expect(redactString(`Authorization: Bearer ${jwt}`)).toContain('[REDACTED]');
    expect(redactString(`Authorization: Bearer ${jwt}`)).not.toContain(jwt);
  });

  it('replaces long opaque secrets', () => {
    // Vendor-prefix-free synthetic fixture so GitHub push-protection
    // doesn't flag it as a real Stripe / GitHub / npm token.
    const secret = 'TEST_FIXTURE_NOT_A_REAL_SECRET_abcdefghij1234567890';
    expect(redactString(`token=${secret}`)).toBe('token=[REDACTED]');
  });

  it('replaces credit-card-shaped digit groups', () => {
    expect(redactString('card 4242 4242 4242 4242')).toContain('[REDACTED]');
    expect(redactString('card 4242-4242-4242-4242')).toContain('[REDACTED]');
  });

  it('leaves short identifiers alone', () => {
    expect(redactString('user 12345')).toBe('user 12345');
    expect(redactString('order #42')).toBe('order #42');
  });

  it('returns empty input unchanged', () => {
    expect(redactString('')).toBe('');
  });
});

describe('filterHeaders (Sprint 3 / gap B5)', () => {
  it('keeps allowlisted headers and drops everything else', () => {
    const out = filterHeaders({
      'Content-Type': 'application/json',
      Authorization: 'Bearer secret',
      'X-Custom-Header': 'value',
    });
    expect(out['content-type']).toBe('application/json');
    expect(out['authorization']).toBeUndefined();
    expect(out['x-custom-header']).toBeUndefined();
  });

  it('lowercases header keys', () => {
    const out = filterHeaders({ 'X-REQUEST-ID': 'req-1' });
    expect(out['x-request-id']).toBe('req-1');
  });

  it('honors extraAllow but still blocks blocklisted patterns', () => {
    const out = filterHeaders(
      {
        'X-Request-ID': 'req-1',
        Authorization: 'Bearer secret',
        'X-Api-Key': 'key',
      },
      { extraAllow: ['authorization', 'x-api-key'] }
    );
    // extraAllow adds them to the allowlist but blocklist still wins.
    expect(out['authorization']).toBeUndefined();
    expect(out['x-api-key']).toBeUndefined();
    expect(out['x-request-id']).toBe('req-1');
  });

  it('redacts token-shaped values inside allowed headers', () => {
    const out = filterHeaders({
      'X-Request-ID': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1MTIzNDUifQ.signature_long_enough_to_match',
    });
    expect(out['x-request-id']).toBe('[REDACTED]');
  });

  it('returns empty object on undefined input', () => {
    expect(filterHeaders(undefined)).toEqual({});
  });
});
