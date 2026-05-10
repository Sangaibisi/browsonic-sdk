// SPDX-License-Identifier: Apache-2.0

/**
 * ReDoS mitigation for server-delivered widget rule regexes.
 *
 * The widget-rules endpoint is trusted but not infallible. A malformed or
 * malicious pattern with catastrophic backtracking (e.g. `(a+)+b`) can
 * freeze the main thread for seconds. This module:
 *
 *   1. Rejects patterns exceeding MAX_PATTERN_LENGTH chars.
 *   2. Rejects patterns with trivially detectable nested unbounded quantifiers.
 *   3. Compiles and caches successful patterns (so a hot rule only pays once).
 *
 * Note: Static detection cannot catch every ReDoS shape. For true defense-
 * in-depth we would move regex execution to a web worker with a watchdog
 * timer. That is Epic 2 territory (URUN-YOL-HARITASI Epic 4.X).
 *
 * See TECHNICAL-IMPROVEMENT-PLAN.md §1.2.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/** Absolute character limit on user/server-supplied regex source. */
export const MAX_PATTERN_LENGTH = 200;

/** LRU-ish cap on compiled-pattern cache (per matcher instance). */
const CACHE_MAX = 64;

/**
 * Heuristic: detect textbook catastrophic-backtracking shapes.
 *
 * Matches nested unbounded quantifiers, the classic ReDoS signature, e.g.:
 *   (a+)+    (a*)*    (a+)*    (.+)+
 *   (.+)*    ((a|b)+)+    (?:x+)+
 *
 * This is not exhaustive — sophisticated ReDoS can bypass it. It is a
 * first-line filter that catches the most common foot-guns.
 */
const NESTED_QUANTIFIER = /\([^()]*[+*][^()]*\)\s*[+*]/;

/**
 * Compile a pattern safely, returning the RegExp or `null` if rejected.
 * Rejection reasons are reported via `onReject` if provided.
 */
export function compileSafeRegex(
  pattern: string,
  flags: string = 'i',
  onReject?: (reason: string) => void
): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0) {
    onReject?.('empty or non-string pattern');
    return null;
  }

  if (pattern.length > MAX_PATTERN_LENGTH) {
    onReject?.(`pattern exceeds ${MAX_PATTERN_LENGTH} chars (got ${pattern.length})`);
    return null;
  }

  if (NESTED_QUANTIFIER.test(pattern)) {
    onReject?.('nested unbounded quantifier — potential catastrophic backtracking');
    return null;
  }

  try {
    return new RegExp(pattern, flags);
  } catch (err) {
    onReject?.(`invalid regex: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Create a compile-and-cache wrapper. Each matcher instance holds its own
 * cache so rule reloads do not leak between manager lifecycles.
 */
export function createRegexCache(
  onReject?: (pattern: string, reason: string) => void
): (pattern: string, flags?: string) => RegExp | null {
  const cache = new Map<string, RegExp | null>();

  return function getCached(pattern: string, flags: string = 'i'): RegExp | null {
    const key = `${flags}::${pattern}`;
    if (cache.has(key)) return cache.get(key) ?? null;

    const compiled = compileSafeRegex(pattern, flags, (reason) => {
      onReject?.(pattern, reason);
    });

    // Evict oldest if cache is full (insertion-order Map).
    if (cache.size >= CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }

    cache.set(key, compiled);
    return compiled;
  };
}
