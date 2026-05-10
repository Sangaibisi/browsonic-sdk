// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { EventBatch, ResolvedConfig } from '../types';
import { resolveEndpoint, safeExecuteAsync } from '../utils';

export interface TransportResult {
  success: boolean;
  status?: number;
  retryAfter?: number;
  error?: string;
  /**
   * Server-reported remaining quota in range [0.0, 1.0]. Null if the
   * backend did not include the `X-Browsonic-Quota-Remaining` header.
   * See PERFORMANCE-STRATEGY.md §3 (Adaptive Quality Degradation).
   *
   * Consumer (queue) reduces effective sample rate when this drops below
   * ~0.2 and restores it as quota recovers.
   */
  quotaRemaining?: number | null;
  /**
   * Server-advertised minimum supported SDK version, parsed from
   * `X-Browsonic-Min-Sdk-Version` (Sprint P15 / F3.1.F). Null if the
   * header was absent. The queue compares this to the running SDK
   * version and invokes `config.onUnsupportedVersion` once per session
   * if the running build is older than the advertised floor.
   */
  minSdkVersion?: string | null;
  /**
   * Operator-set per-app sample rate, parsed from
   * `X-Browsonic-Sample-Rate` (Sprint 40). Null if the backend did
   * not include the header (legacy services or non-/v1/events
   * responses). Queue-level consumer applies the value to
   * {@code config.sampleRate} so dashboard changes propagate to live
   * SDKs without polling.
   */
  sampleRate?: number | null;
}

/**
 * Parse the optional `X-Browsonic-Quota-Remaining` header into a
 * [0,1]-clamped float. Returns null if absent or unparseable — caller
 * treats null as "no signal", not as "zero quota".
 */
function parseQuotaRemaining(response: Response): number | null {
  const raw = response.headers.get('X-Browsonic-Quota-Remaining');
  if (raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

/**
 * Parse the optional `X-Browsonic-Sample-Rate` header (Sprint 40).
 * Returns a [0.001, 1.0]-clamped float, or null when the header is
 * absent / unparseable. Caller treats null as "no signal", not as
 * "zero" — the operator's intent only changes when the server
 * actively advertises a new value.
 */
function parseSampleRate(response: Response): number | null {
  const raw = response.headers.get('X-Browsonic-Sample-Rate');
  if (raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0.001) return 0.001;
  if (parsed > 1) return 1;
  return parsed;
}

/**
 * Parse the optional `X-Browsonic-Min-Sdk-Version` header
 * (Sprint P15 / F3.1.F). Returns null if absent or malformed. The
 * queue-level consumer compares this to the running SDK version and
 * fires `config.onUnsupportedVersion` once per session when the
 * running build is older than the advertised floor.
 */
function parseMinSdkVersion(response: Response): string | null {
  const raw = response.headers.get('X-Browsonic-Min-Sdk-Version');
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 32) return null;
  // Cheap sanity check — a version string is digits, dots, dashes, and
  // ASCII alphanumerics (for pre-release suffixes). Reject anything
  // with spaces / control chars rather than risk logging attacker
  // input into a host's console.
  if (!/^[0-9A-Za-z.\-+]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Send batch to API endpoint
 */
export async function sendBatch(
  batch: EventBatch,
  config: ResolvedConfig,
  debugLog: (message: string, ...args: unknown[]) => void
): Promise<TransportResult> {
  return safeExecuteAsync(
    async () => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-APP-KEY': config.appKey,
      };
      // Only attach X-API-KEY when we actually have one. Sending an empty
      // string previously gave the backend's RateLimitInterceptor an
      // ambiguous signal — "header present but empty" — that some auth
      // chains treat as a present-but-malformed key. Omitting the header
      // when blank lets the server fall back cleanly to its app-key
      // authenticated path. (Aligns with H1.5 in the readiness audit.)
      if (config.apiKey && config.apiKey.length > 0) {
        headers['X-API-KEY'] = config.apiKey;
      }
      if (batch.sdk?.version) {
        headers['X-Browsonic-Sdk-Version'] = batch.sdk.version;
      }

      // Prefer low-priority hint on supporting browsers so SDK POSTs
      // never contend with user-critical requests. Unsupported browsers
      // ignore silently. (See PERFORMANCE-STRATEGY §2 P4.)
      const init: RequestInit & { priority?: string } = {
        method: 'POST',
        headers,
        body: JSON.stringify(batch),
        keepalive: true,
      };
      try {
        init.priority = 'low';
      } catch {
        // ignore — assigning an unknown property must not throw anyway
      }

      const response = await fetch(resolveEndpoint(config.apiEndpoint, '/v1/events'), init);
      const quotaRemaining = parseQuotaRemaining(response);
      const minSdkVersion = parseMinSdkVersion(response);
      const sampleRate = parseSampleRate(response);

      if (response.ok) {
        debugLog(
          `Batch ${batch.batchId} sent (${batch.events.length} events, quota=${quotaRemaining ?? 'n/a'})`
        );
        return {
          success: true,
          status: response.status,
          quotaRemaining,
          minSdkVersion,
          sampleRate,
        };
      }

      // Rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('Retry-After') || '60', 10);
        debugLog(`Rate limited. Retry after ${retryAfter}s`);
        return {
          success: false,
          status: 429,
          retryAfter,
          quotaRemaining,
          minSdkVersion,
          sampleRate,
        };
      }

      // 4xx — don't retry
      if (response.status >= 400 && response.status < 500) {
        debugLog(`Client error ${response.status} - dropping batch`);
        return {
          success: false,
          status: response.status,
          error: `Client error: ${response.status}`,
          quotaRemaining,
          minSdkVersion,
        };
      }

      // 5xx — retry
      debugLog(`Server error ${response.status} - will retry`);
      return {
        success: false,
        status: response.status,
        error: `Server error: ${response.status}`,
        quotaRemaining,
        minSdkVersion,
      };
    },
    {
      success: false,
      status: 0,
      error: 'Transport error',
      quotaRemaining: null,
      minSdkVersion: null,
    },
    (error) => debugLog('Transport error:', error)
  );
}

/**
 * Calculate backoff delay with jitter
 */
export function calculateBackoff(attempt: number, baseDelayMs: number = 1000): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
  const exponentialDelay = Math.min(baseDelayMs * Math.pow(2, attempt), 30000);
  // Add jitter (0-25% of delay)
  const jitter = Math.random() * 0.25 * exponentialDelay;
  return Math.floor(exponentialDelay + jitter);
}
