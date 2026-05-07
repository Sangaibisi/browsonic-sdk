// SPDX-License-Identifier: Apache-2.0

/**
 * Periodic diagnostics reporter — POSTs the current ring snapshot to
 * `POST /v1/diagnostics` on a fixed interval. Low-priority fetch with
 * `keepalive: true` so reports survive `visibilitychange → hidden`.
 *
 * Backend contract (sentinel-service `DiagnosticsController`):
 *   {
 *     sdk: { name: "@browsonic/sdk", version: "1.1.0-rc.4" },
 *     session_id: "…",
 *     app_key: "…",
 *     environment: "production",
 *     timestamp: <ms since epoch>,
 *     metrics: <DiagnosticsSnapshot>
 *   }
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { ResolvedConfig } from '../types';
import { resolveEndpoint } from '../utils';
import type { DiagnosticsStore } from './store';

interface ReporterOptions {
  config: ResolvedConfig;
  store: DiagnosticsStore;
  getSessionId: () => string;
  sdkName: string;
  sdkVersion: string;
  debugLog: (message: string, ...args: unknown[]) => void;
}

export interface DiagnosticsReporter {
  start(): void;
  stop(): void;
  /** Send a report immediately (force). Used on destroy to drain. */
  flushNow(): Promise<void>;
}

export function createDiagnosticsReporter(opts: ReporterOptions): DiagnosticsReporter {
  const { config, store, getSessionId, sdkName, sdkVersion, debugLog } = opts;
  const endpoint = resolveEndpoint(config.apiEndpoint, '/v1/diagnostics');
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  async function send(): Promise<void> {
    if (stopped) return;
    const snap = store.drain();
    // Skip entirely empty reports — if nothing moved in an interval we
    // don't need to waste a request. Sprint 2: a report is also "not
    // empty" when retry attempts were recorded, plugin health changed,
    // or queue metrics moved. Adapter alone is a steady-state value
    // (set once at adapter init) so it doesn't trigger sends on its own.
    const empty =
      snap.init_duration_ms.count === 0 &&
      snap.event_process_duration_ms.count === 0 &&
      snap.flush_latency_ms.count === 0 &&
      snap.internal_error_count === 0 &&
      Object.keys(snap.dropped_events).length === 0 &&
      snap.retry_attempts.count === 0 &&
      snap.plugins.length === 0 &&
      snap.queue_metrics === null;
    if (empty) return;

    // The wire schema for /v1/diagnostics is documented in
    // browsonic-sdk/docs/design/EVENT_PAYLOAD_SCHEMA.md. The Sprint 2
    // additions live alongside the existing `metrics` object (no shape
    // breakage) plus three new top-level fields the dashboard's
    // <PluginHealthPanel> / <RetryOutcomesCard> / <QueueHealthPanel>
    // consume directly without having to climb the metrics tree.
    const body = {
      sdk: { name: sdkName, version: sdkVersion },
      session_id: getSessionId(),
      app_key: config.appKey,
      environment: config.environment,
      timestamp: Date.now(),
      metrics: snap,
      // Sprint 2 (gap B1) — top-level for the dashboard's plugin panel.
      plugins: snap.plugins,
      // Sprint 2 (gap B3) — adapter identity stamped once per session.
      adapter: snap.adapter,
      // Sprint 2 (gap B3) — queue depth + drop counters at snapshot time.
      queue_metrics: snap.queue_metrics,
      // Sprint 2 (gap B2) — retry-attempt percentiles for transport flushes.
      retry_attempts: snap.retry_attempts,
    };

    try {
      const req: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
          'X-APP-KEY': config.appKey,
        },
        body: JSON.stringify(body),
        keepalive: true,
      };
      try {
        (req as RequestInit & { priority?: string }).priority = 'low';
      } catch {
        /* ignore */
      }
      const res = await fetch(endpoint, req);
      debugLog('Diagnostics POST:', res.status);
    } catch (err) {
      // Never surface a network failure — diagnostics are best-effort.
      debugLog('Diagnostics POST failed (non-fatal):', err);
    }
  }

  return {
    start() {
      if (timer) return;
      const interval = Math.max(5_000, config.internalDiagnosticsIntervalMs);
      timer = setInterval(() => {
        void send();
      }, interval);
      debugLog(`Diagnostics reporter active (every ${interval} ms)`);
    },
    stop() {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    async flushNow() {
      await send();
    },
  };
}
