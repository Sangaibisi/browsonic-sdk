/**
 * Redaction / masking microbenchmark.
 *
 * PERFORMANCE-STRATEGY.md §3: Storage capture is off by default; once it's
 * turned on, redact becomes a hot path. Key lookup is O(K*N) in the current
 * implementation.
 */
import { bench, describe } from 'vitest';

const REDACT_KEYS = ['token', 'password', 'authorization', 'secret', 'key', 'credential', 'auth'];
const LOWER_REDACT_KEYS = REDACT_KEYS.map((k) => k.toLowerCase());
const REDACT_SET = new Set(LOWER_REDACT_KEYS);

const SAMPLE_KEYS = [
  'userId',
  'userName',
  'authToken',
  'sessionId',
  'csrfToken',
  'apiKey',
  'publicKey',
  'lastLogin',
  'theme',
  'locale',
  'password',
  'jwt',
  'accessToken',
  'refreshToken',
  'credential',
  'marketingConsent',
  'gdprConsent',
  'cookie',
  'fingerprint',
  'deviceId',
];

// Current impl (substring match)
function shouldRedactCurrent(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return REDACT_KEYS.some((rk) => lowerKey.includes(rk.toLowerCase()));
}

// Proposed: exact match (precomputed lowercase)
function shouldRedactExact(key: string): boolean {
  return REDACT_SET.has(key.toLowerCase());
}

// Proposed: substring match w/ precomputed lowercase keys
function shouldRedactSubstringOptimized(key: string): boolean {
  const lowerKey = key.toLowerCase();
  for (let i = 0; i < LOWER_REDACT_KEYS.length; i++) {
    if (lowerKey.includes(LOWER_REDACT_KEYS[i])) return true;
  }
  return false;
}

describe('redact key lookup — 20 keys × 7 patterns', () => {
  bench('substring .some + .toLowerCase per iter (current)', () => {
    for (const k of SAMPLE_KEYS) shouldRedactCurrent(k);
  });

  bench('exact match via Set (proposed default)', () => {
    for (const k of SAMPLE_KEYS) shouldRedactExact(k);
  });

  bench('substring optimized (precomputed lowercase)', () => {
    for (const k of SAMPLE_KEYS) shouldRedactSubstringOptimized(k);
  });
});
