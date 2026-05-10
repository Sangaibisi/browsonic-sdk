/**
 * Fingerprint algorithm microbenchmark.
 *
 * Measures hot-path hash function performance for event deduplication.
 *
 * PERFORMANCE-STRATEGY.md §3: Default is cyrb53 (53-bit Number), not BigInt FNV-1a.
 * This bench compares candidate algorithms head-to-head.
 *
 * SLO: fingerprint generation p95 <= 50μs per event.
 */
import { bench, describe } from 'vitest';
import { simpleHash, generateFingerprint } from '../src/utils';

// Sample stack trace — realistic size (~1KB)
const SAMPLE_STACK = `Error: Cannot read property 'foo' of undefined
    at Object.handleClick (https://example.com/app.js:123:45)
    at HTMLButtonElement.onClick (https://example.com/app.js:456:12)
    at dispatch (https://example.com/vendor.js:789:10)
    at runWithPriority (https://example.com/vendor.js:1024:5)
    at batchedUpdates (https://example.com/vendor.js:2048:15)
    at processQueue (https://example.com/vendor.js:4096:20)
    at flushPassiveEffects (https://example.com/vendor.js:8192:25)
    at commitRoot (https://example.com/vendor.js:16384:30)
    at performSyncWorkOnRoot (https://example.com/vendor.js:32768:35)
    at scheduleUpdateOnFiber (https://example.com/vendor.js:65536:40)`;

const SAMPLE_MESSAGE = "Cannot read property 'foo' of undefined";
const SAMPLE_URL = 'https://example.com/checkout?step=payment&session=abc123';

// Candidate: cyrb53 — 53-bit, Number-based, fast (PERFORMANCE-STRATEGY §9 decision)
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Candidate: FNV-1a 32-bit (Number-based)
function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

describe('fingerprint algorithms — short input (~200 chars)', () => {
  const raw = `error|${SAMPLE_MESSAGE}|${SAMPLE_URL}`;

  bench('simpleHash (legacy 0.2.x, kept for comparison)', () => {
    simpleHash(raw);
  });

  bench('cyrb53 (current 0.3.0+)', () => {
    cyrb53(raw);
  });

  bench('fnv1a32', () => {
    fnv1a32(raw);
  });
});

describe('fingerprint algorithms — stack trace (~1KB)', () => {
  const raw = `error|${SAMPLE_MESSAGE}|${SAMPLE_STACK}|${SAMPLE_URL}`;

  bench('simpleHash (legacy 0.2.x, kept for comparison)', () => {
    simpleHash(raw);
  });

  bench('cyrb53 (current 0.3.0+)', () => {
    cyrb53(raw);
  });

  bench('fnv1a32', () => {
    fnv1a32(raw);
  });
});

describe('full generateFingerprint pipeline (current 0.3.0+ — cyrb53)', () => {
  bench('generateFingerprint w/ 10-frame stack', () => {
    generateFingerprint('error', SAMPLE_MESSAGE, SAMPLE_STACK, SAMPLE_URL, 10);
  });

  bench('generateFingerprint w/ null stack', () => {
    generateFingerprint('error', SAMPLE_MESSAGE, null, SAMPLE_URL, 10);
  });
});
