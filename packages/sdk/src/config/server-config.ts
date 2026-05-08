// SPDX-License-Identifier: Apache-2.0

/**
 * Server-driven SDK config (Sprint 40).
 *
 * Pulls per-app config from `GET /v1/sdk/config` once during the
 * SDK's bootstrap so the operator-set `sampleRate` is in effect
 * before the first batch fires. Subsequent updates ride on the
 * `X-Browsonic-Sample-Rate` push header that the ingest endpoint
 * stamps on every successful `/v1/events` response — no polling,
 * no extra round-trip on the hot path.
 *
 * Cache layer: results land in localStorage so a cold start with
 * the backend offline still sees the last-known operator value.
 * 24h TTL because operator changes are pushed via the response
 * header anyway; the cache only matters for the first batch
 * decision in a fresh tab. Cache miss / fetch fail / unsupported
 * environment all fall through to the host-provided default,
 * preserving the SDK's "init never blocks" contract.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

const CACHE_KEY_PREFIX = '__browsonic_app_config_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MIN_RATE = 0.001;
const MAX_RATE = 1.0;

export interface AppConfigSnapshot {
  /** Server's current per-app sample rate, clamped to [0.001, 1.0]. */
  sampleRate: number;
  /** Wire-format version. SDKs branch on this when the response shape grows. */
  configVersion: number;
  /** Wall-clock when the snapshot was fetched. Used for TTL. */
  fetchedAt: number;
}

interface FetchOptions {
  apiEndpoint: string;
  appKey: string;
  apiKey?: string;
  /** Override fetch — tests pass a stub. */
  fetchImpl?: typeof fetch;
}

/**
 * GET `${apiEndpoint}/v1/sdk/config?appKey=...` and return the
 * parsed snapshot. Resolves to `null` on any failure path
 * (non-2xx, network error, malformed body, missing fetch impl)
 * so callers can treat absent server config as "use the host-
 * supplied default" without try/catch on every site.
 */
export async function fetchAppConfig(options: FetchOptions): Promise<AppConfigSnapshot | null> {
  const { apiEndpoint, appKey, apiKey, fetchImpl } = options;
  const f = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!f || !apiEndpoint || !appKey) return null;

  const url = `${apiEndpoint.replace(/\/$/, '')}/v1/sdk/config?appKey=${encodeURIComponent(appKey)}`;
  try {
    const headers: Record<string, string> = { 'X-APP-KEY': appKey };
    if (apiKey) headers['X-API-Key'] = apiKey;
    const resp = await f(url, { method: 'GET', headers });
    if (!resp.ok) return null;
    const body = (await resp.json()) as Partial<{ sampleRate: number; configVersion: number }>;
    if (typeof body.sampleRate !== 'number' || !Number.isFinite(body.sampleRate)) return null;
    return {
      sampleRate: clamp(body.sampleRate),
      configVersion: typeof body.configVersion === 'number' ? body.configVersion : 1,
      fetchedAt: Date.now(),
    };
  } catch {
    return null;
  }
}

/**
 * Read the cached snapshot for `appKey`, returning `null` when
 * absent, malformed, or older than `CACHE_TTL_MS`. Caller decides
 * whether to use the value before the async fetch settles.
 */
export function loadCachedAppConfig(appKey: string): AppConfigSnapshot | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + appKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppConfigSnapshot>;
    if (
      typeof parsed.sampleRate !== 'number' ||
      typeof parsed.fetchedAt !== 'number' ||
      Date.now() - parsed.fetchedAt > CACHE_TTL_MS
    ) {
      return null;
    }
    return {
      sampleRate: clamp(parsed.sampleRate),
      configVersion: typeof parsed.configVersion === 'number' ? parsed.configVersion : 1,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Persist a snapshot for `appKey`. Silently no-ops when
 * localStorage is unavailable (private browsing, Safari ITP, SSR)
 * — the next session falls back to the in-memory default and a
 * fresh server fetch.
 */
export function saveCachedAppConfig(appKey: string, snapshot: AppConfigSnapshot): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY_PREFIX + appKey, JSON.stringify(snapshot));
  } catch {
    /* swallow — quota errors / disabled storage. */
  }
}

/** Clamp any incoming numeric to the [0.001, 1.0] policy floor/ceiling. */
export function clampSampleRate(value: number): number {
  return clamp(value);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0.1;
  if (value < MIN_RATE) return MIN_RATE;
  if (value > MAX_RATE) return MAX_RATE;
  return value;
}
