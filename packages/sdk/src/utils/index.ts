// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { parseStackString } from './stack-parser';

/**
 * Generate a UUID v4
 */
export function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get current ISO timestamp
 */
export function timestamp(): string {
  return new Date().toISOString();
}

/**
 * Safely execute a function, catching any errors
 * This is the core of our fail-safe guarantee
 */
export function safeExecute<T>(fn: () => T, fallback: T, debugLog?: (error: unknown) => void): T {
  try {
    return fn();
  } catch (error) {
    if (debugLog) {
      debugLog(error);
    }
    return fallback;
  }
}

/**
 * Safely execute an async function
 */
export async function safeExecuteAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  debugLog?: (error: unknown) => void
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (debugLog) {
      debugLog(error);
    }
    return fallback;
  }
}

/**
 * Truncate a string to max length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '...';
}

/**
 * Deep clone an object (simple implementation)
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

/**
 * Legacy 32-bit hash — still exported for back-compat (tests / bench /
 * external callers). New SDK code uses `cyrb53`.
 *
 * @deprecated Use `cyrb53` for 53-bit hashing.
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * cyrb53 — Number-based 53-bit hash.
 *
 * Benchmark-validated replacement for `simpleHash` in the event dedup
 * hot path:
 *   - Short input (~200 chars): ~1.64M ops/s (≈12% slower than simpleHash)
 *   - 1 KB stack trace:         ~520k ops/s  (≈24% slower than simpleHash)
 *   - Tradeoff: ~2^21 × lower collision probability vs simpleHash's 32 bits.
 *
 * Uses two parallel state variables combined into a 53-bit Number via
 * `4294967296 * high + low`. All ops are `Math.imul` (fast 32-bit mul)
 * so there is no `BigInt` overhead (BigInt is ~20x slower in V8).
 *
 * Reference: Bryc's cyrb53 — public domain.
 */
export function cyrb53(str: string, seed = 0): string {
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

/**
 * Generate a fingerprint for an event (for dedup).
 *
 * 0.3.0 (Sprint 5): switched from `simpleHash` (32-bit) to `cyrb53`
 * (53-bit) to reduce false-positive deduplication on high-cardinality
 * error streams (1M+ unique errors/day in large tenants saw measurable
 * dedup mistakes under the 32-bit birthday bound).
 * See BASELINE.md + PERFORMANS-STRATEJISI.md §9.
 *
 * Sprint 2 M3: switched the stack contribution from raw string slice
 * to **parsed-frame `function@filename`** (line/column dropped). Two
 * reasons:
 *
 *   - **Minified rebuild stability.** Production bundles re-emit with
 *     small offset shifts on every release (hot-reloads, vendor splits,
 *     even comment changes). Hashing raw stacks meant the same logical
 *     bug fingerprinted differently across builds, fracturing the
 *     grouped-errors dashboard.
 *   - **In-page route variance.** The same handler called from
 *     `/page1` and `/page2` produced identical line/col values in
 *     stack but the URL part of the fingerprint already collapses
 *     URLs via {@link normalizeUrlForFingerprint}. The stack part now
 *     mirrors that intent.
 *
 * Falls back to the legacy raw-stack hashing path when
 * {@link parseStackString} produces no frames (unparseable input,
 * synthesized `at file:line:col` strings from `window.onerror`'s
 * Error-less path), so behaviour is unchanged on inputs the parser
 * can't resolve.
 */
export function generateFingerprint(
  type: string,
  message: string,
  stack: string | null | undefined,
  url: string,
  maxStackFrames: number
): string {
  const frames = parseStackString(stack);
  let stackPart: string;
  if (frames.length > 0) {
    stackPart = frames
      .slice(0, maxStackFrames)
      .map((f) => `${f.function}@${f.filename}`)
      .join('\n');
  } else {
    // Legacy fallback: raw split. Preserves dedup behaviour on stacks
    // the parser can't recognise (rare in practice).
    stackPart = stack ? stack.split('\n').slice(0, maxStackFrames).join('\n') : '';
  }
  const raw = `${type}|${message}|${stackPart}|${normalizeUrlForFingerprint(url)}`;
  return cyrb53(raw);
}

/**
 * Normalise a URL for fingerprint grouping (Sprint P15 / F3.1.D).
 *
 * Two otherwise-identical errors on {@code /users/123} and
 * {@code /users/456} must fingerprint to the SAME value or the
 * grouped-errors dashboard fractures into thousands of single-event
 * rows. Default placeholders cover the two most common cases:
 *
 *   - UUIDs (any canonical 8-4-4-4-12 form) → {@code :uuid}
 *   - Path-segment integers (e.g. {@code /users/123/orders/456}) → {@code /:id}
 *
 * Query strings and fragments are dropped entirely — they are almost
 * always per-request noise (timestamps, analytics params, auth
 * tokens) and including them would defeat dedup.
 *
 * Falls back to the raw URL when parsing fails (non-absolute input,
 * malformed hostname) so tests and Node callers don't crash.
 */
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_ID_RE = /\/\d+(?=\/|$)/g;

export function normalizeUrlForFingerprint(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    // Use a throwaway base so relative URLs parse; absolute URLs ignore it.
    const parsed = new URL(rawUrl, 'https://__browsonic_fingerprint_base__');
    let path = parsed.pathname;
    path = path.replace(UUID_RE, ':uuid');
    path = path.replace(NUMERIC_ID_RE, '/:id');
    // Keep origin when available (absolute) so cross-host errors don't
    // collapse into one group. Base sentinel origin → relative path only.
    if (parsed.origin === 'https://__browsonic_fingerprint_base__') {
      return path;
    }
    return `${parsed.origin}${path}`;
  } catch {
    return rawUrl;
  }
}

/**
 * Compose an absolute endpoint URL by resolving a relative {@code path}
 * against the configured {@code apiEndpoint} (base). Using
 * {@code new URL()} here (rather than string concatenation) means:
 *
 *   - A base with a trailing slash and a path with a leading slash no
 *     longer produce {@code https://api.example.com//v1/events}.
 *   - A base that itself contains a path prefix
 *     ({@code https://tenant.example.com/api}) correctly prepends the
 *     prefix: {@code /v1/events} resolves to
 *     {@code https://tenant.example.com/v1/events} when the path is
 *     absolute, or {@code https://tenant.example.com/api/v1/events}
 *     when the path is relative.
 *   - Host-spoofing inputs like {@code https://evil.example.com\@trusted}
 *     that slip past a {@code startsWith('https://')} check are rejected
 *     at {@code validateConfig}; this function trusts that contract but
 *     falls back to string concatenation on any runtime URL parse error
 *     so a malformed base cannot crash the SDK mid-flight.
 *
 * @param base   Absolute base URL (the caller has already validated it).
 * @param path   Absolute path on the base (e.g. {@code "/v1/events"}).
 */
export function resolveEndpoint(base: string, path: string): string {
  try {
    // Use an absolute path so the caller's intent survives even if the
    // base itself has a pathname — resolving "/v1/events" against
    // "https://api.example.com/prefix/" still gives
    // "https://api.example.com/v1/events". That matches the pre-2.1
    // string-concat behaviour exactly.
    return new URL(path, base).toString();
  } catch {
    // Defence in depth — validateConfig should already have bounced a
    // malformed base. If it didn't, don't crash the SDK mid-flight;
    // fall back to the legacy concat behaviour.
    return `${base}${path}`;
  }
}

/**
 * Check if we're in a browser environment
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Get or create session ID
 */
export function getOrCreateSessionId(): string {
  if (!isBrowser()) return uuid();

  const storageKey = '__browsonic_session_id';

  // Try sessionStorage first
  try {
    let sessionId = sessionStorage.getItem(storageKey);
    if (sessionId) return sessionId;

    sessionId = uuid();
    sessionStorage.setItem(storageKey, sessionId);
    return sessionId;
  } catch {
    // Fallback to in-memory
    return uuid();
  }
}

/**
 * Calculate approximate byte size of an object.
 *
 * Three-level fallback (important for queue.createBatch size gate —
 * if this throws, batch creation fails and events are lost):
 *   1. `new Blob([JSON.stringify(obj)]).size` — exact, works in browsers + Node 18+.
 *   2. `JSON.stringify(obj).length * 2` — rough estimate if Blob is absent.
 *   3. `0` — if JSON.stringify itself throws (circular ref, BigInt, etc.).
 *
 * A circular or non-serializable object landing in an event payload is
 * a bug upstream; returning 0 here prevents the batch-size gate from
 * crashing — the oversize check naturally under-estimates, so the
 * batch goes through rather than blocking forever in a retry loop.
 */
export function getByteSize(obj: unknown): number {
  try {
    return new Blob([JSON.stringify(obj)]).size;
  } catch {
    try {
      return JSON.stringify(obj).length * 2;
    } catch {
      return 0;
    }
  }
}

/**
 * SDK internal patterns to filter from stack traces
 * These frames are SDK internals and not useful for debugging user code
 *
 * Matches paths like:
 * - /sentinel-sdk/dist/esm/collectors/console.js
 * - /node_modules/@browsonic/sdk/
 * - /dist/esm/collectors/
 */
const SDK_INTERNAL_PATTERNS = [
  // Collector files (main noise sources)
  '/collectors/console.',
  '/collectors/error.',
  '/collectors/callback.',
  '/collectors/network.',
  '/collectors/xhr.',
  // SDK core files
  '/dist/esm/sentinel.',
  '/dist/cjs/sentinel.',
  '/dist/esm/queue/',
  '/dist/cjs/queue/',
];

/**
 * Clean stack trace by removing SDK internal frames
 * This makes stack traces more useful for debugging user code
 * @param stack - Raw stack trace string
 * @returns Cleaned stack trace with SDK frames removed
 */
export function cleanStackTrace(stack: string | null | undefined): string | null {
  if (!stack) return null;

  const lines = stack.split('\n');
  const cleanedLines: string[] = [];

  for (const line of lines) {
    // Keep the error message (first line usually doesn't have 'at' or '@')
    const isStackFrame = line.includes('at ') || line.includes('@');

    if (!isStackFrame) {
      cleanedLines.push(line);
      continue;
    }

    // Check if this frame is from SDK internals
    const isSDKInternal = SDK_INTERNAL_PATTERNS.some((pattern) =>
      line.toLowerCase().includes(pattern.toLowerCase())
    );

    if (!isSDKInternal) {
      cleanedLines.push(line);
    }
  }

  // If we filtered everything, return original (safety fallback)
  if (cleanedLines.length <= 1 && lines.length > 1) {
    return stack;
  }

  return cleanedLines.join('\n');
}

/**
 * Truncate stack trace to a maximum number of frames
 * @param stack - Stack trace string (newline separated)
 * @param maxFrames - Maximum number of frames to keep
 * @returns Truncated stack and flag indicating if truncation occurred
 */
export function truncateStack(
  stack: string | null | undefined,
  maxFrames: number
): { stack: string | null; truncated: boolean } {
  if (!stack) {
    return { stack: null, truncated: false };
  }

  const frames = stack.split('\n');
  if (frames.length > maxFrames) {
    return {
      stack: frames.slice(0, maxFrames).join('\n'),
      truncated: true,
    };
  }

  return { stack, truncated: false };
}

/**
 * Compare two semver-ish version strings (Sprint P15 / F3.1.F).
 *
 * Numeric `major.minor.patch` compare; any pre-release suffix
 * (`-rc.1`, `-beta.3`) is stripped before the compare so a release
 * candidate is treated as equal to the final tag for version-gate
 * purposes (we don't want `2.0.0-rc.1 < 2.0.0` to trip an
 * "unsupported SDK" banner when the host is one patch behind head).
 *
 * Returns a standard comparator result:
 *   - negative when `a < b`
 *   - zero     when `a == b` (or both unparseable)
 *   - positive when `a > b`
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/[-+].*$/, '')
      .split('.')
      .map((p) => {
        const n = parseInt(p, 10);
        return Number.isFinite(n) ? n : 0;
      });
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

// Re-export ignore utilities
export {
  shouldIgnoreError,
  COMMON_THIRD_PARTY_PATTERNS,
  COMMON_IGNORABLE_MESSAGES,
} from './ignore';

// Re-export stack parser (Sprint 2)
export {
  UNKNOWN_FUNCTION,
  DEFAULT_MAX_FRAMES,
  chromiumStackParser,
  geckoStackParser,
  defaultStackParsers,
  parseStackString,
  type StackFrame,
  type StackLineParser,
} from './stack-parser';

// Re-export linked errors (Sprint 2)
export {
  unwindLinkedErrors,
  DEFAULT_LINKED_ERRORS_MAX_DEPTH,
  type LinkedError,
} from './linked-errors';

// Re-export runtime environment guards (Sprint 9 M1)
export { isExtensionContext, isBotUserAgent, DEFAULT_BOT_PATTERNS } from './runtime-environment';
