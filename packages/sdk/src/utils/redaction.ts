// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * PII redaction (Sprint 3 / gap B5).
 *
 * Two surfaces:
 *   1. {@link redactString} — scans free-text values for known PII
 *      patterns (email / JWT / OAuth secret / credit-card-like
 *      sequences) and replaces matches with a fixed `[REDACTED]`
 *      token. Intentionally conservative; we'd rather over-redact a
 *      log line than leak a token.
 *   2. {@link filterHeaders} — applies a strict allowlist + blocklist
 *      over a header map. Keys not in the allowlist are dropped
 *      silently. Keys in the blocklist (e.g. `authorization`) are
 *      dropped even when the consumer "allowed" them — defense in
 *      depth against operator misconfiguration.
 *
 * Both helpers are pure + side-effect-free so they're safe to reuse
 * from collectors that run on every fetch / XHR.
 */

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
// JWT-shaped strings (header.payload.signature, base64url segments).
// 20+ char minimum for each segment so we don't trip on short ids.
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
// OAuth-style bearer tokens / long opaque secrets. 32+ chars is a
// reasonable lower bound — most identifiers are shorter.
const OPAQUE_SECRET_PATTERN = /\b[A-Za-z0-9_-]{32,}\b/g;
// Credit-card-shaped digit groups (12-19 digits with optional spaces /
// dashes). We don't validate Luhn — that's a runtime cost we don't
// want on every fetch. False positives like long order ids are
// acceptable (they're equally non-secret).
const CARD_PATTERN = /\b(?:\d[ -]?){12,19}\b/g;

const REDACTED = '[REDACTED]';

/**
 * Replace common PII shapes with `[REDACTED]`. Order matters — JWT
 * before OPAQUE_SECRET so the `eyJ...` prefix gets the JWT label and
 * the long-secret pattern doesn't fire on the same substring.
 */
export function redactString(value: string): string {
  if (!value) return value;
  return value
    .replace(JWT_PATTERN, REDACTED)
    .replace(OPAQUE_SECRET_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, REDACTED)
    .replace(CARD_PATTERN, REDACTED);
}

/**
 * Default allowlist for HTTP headers we'll transmit on the wire.
 * Anything not in this set is dropped from the captured event.
 *
 * Keep this list short and "obviously non-secret". If a customer
 * needs additional headers they can extend via
 * {@link filterHeaders}'s `extraAllow` argument — explicit opt-in
 * is safer than expanding the default.
 */
export const DEFAULT_HEADER_ALLOWLIST: ReadonlySet<string> = new Set([
  'content-type',
  'content-length',
  'cache-control',
  'etag',
  'x-request-id',
  'x-correlation-id',
  'traceparent',
  'tracestate',
  'server',
  'x-served-by',
]);

/**
 * Hard blocklist — these are dropped even if a consumer adds them
 * to the allowlist. Defense in depth against operator misconfiguration
 * (e.g. someone allow-lists `authorization` "for debugging").
 */
const HEADER_BLOCKLIST_PATTERNS: RegExp[] = [
  /^authorization$/i,
  /^proxy-authorization$/i,
  /cookie/i,
  /^set-cookie$/i,
  /token/i,
  /api[-_]?key/i,
  /secret/i,
  /password/i,
];

export interface FilterHeadersOptions {
  /** Additional header names to permit on top of the default allowlist. */
  extraAllow?: ReadonlyArray<string>;
}

/**
 * Apply the allowlist + blocklist to a Headers map. Returns a fresh
 * object with lowercased keys; original input is not mutated.
 *
 * Header values are also passed through {@link redactString} as a
 * defense-in-depth measure for headers that might smuggle a token
 * via the value side (e.g. `etag: "Bearer xxx"` from a confused
 * server). Cheap and bounded — header values are typically short.
 */
export function filterHeaders(
  headers: Record<string, string> | undefined,
  options: FilterHeadersOptions = {}
): Record<string, string> {
  if (!headers) return {};
  const allow = new Set<string>(DEFAULT_HEADER_ALLOWLIST);
  for (const extra of options.extraAllow ?? []) {
    allow.add(extra.toLowerCase());
  }
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = rawKey.toLowerCase();
    if (!allow.has(key)) continue;
    if (HEADER_BLOCKLIST_PATTERNS.some((re) => re.test(key))) continue;
    out[key] = redactString(String(rawValue));
  }
  return out;
}

/** Test-only export so suite can rotate patterns without re-importing. */
export const __test = {
  EMAIL_PATTERN,
  JWT_PATTERN,
  OPAQUE_SECRET_PATTERN,
  CARD_PATTERN,
  HEADER_BLOCKLIST_PATTERNS,
};
