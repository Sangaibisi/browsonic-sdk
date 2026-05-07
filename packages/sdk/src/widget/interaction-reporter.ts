// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Widget interaction reporter (Sprint 4 / gap B4).
 *
 * Posts a single small beacon per widget interaction
 * (impression / click / dismiss) to
 * `POST /v1/widget-rules/{ruleId}/interactions`. The endpoint is
 * intentionally narrow: it doesn't carry the full event payload —
 * just enough for the dashboard's
 * `<WidgetInteractionStats>` to roll up 24-hour counters.
 *
 * Why a separate beacon vs. piggy-back on the events batch?
 * Widget interactions are dashboard-side aggregation signal, not
 * an SDK event in their own right. Putting them on the events
 * channel would inflate billing-impacting volume; putting them
 * here keeps them cheap, opt-out-friendly via the consent gate,
 * and visibly separable from the error pipeline.
 *
 * Privacy:
 *   - When `config.hasConsented?.() === false`, NO beacon is sent.
 *   - When `navigator.globalPrivacyControl === true` and
 *     `respectGPC` is set, the beacon is also suppressed.
 *   - This mirrors the visitor-identity gate in `visitor/index.ts`.
 */

import type { ResolvedConfig } from '../types';
import { resolveEndpoint } from '../utils';

export type WidgetInteractionType = 'impression' | 'click' | 'dismiss';

interface ReportInteractionArgs {
  config: ResolvedConfig;
  ruleId: string;
  type: WidgetInteractionType;
  /** Optional client-supplied identifier for the impression session. */
  sessionId?: string;
  debugLog: (message: string, ...args: unknown[]) => void;
}

function isGpcSignalled(): boolean {
  if (typeof navigator === 'undefined') return false;
  const flag = (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl;
  return flag === true;
}

function isConsentBlocked(config: ResolvedConfig): boolean {
  if (config.respectGPC && isGpcSignalled()) return true;
  if (config.hasConsented && config.hasConsented() === false) return true;
  return false;
}

/**
 * Send a single interaction beacon. Best-effort:
 *   - Never throws — network failures are logged via debugLog.
 *   - Uses `keepalive: true` so the request survives `pagehide`.
 *   - Uses a low priority where supported so it never competes
 *     with the host app's own fetches.
 */
export async function reportInteraction(args: ReportInteractionArgs): Promise<void> {
  const { config, ruleId, type, sessionId, debugLog } = args;
  if (isConsentBlocked(config)) {
    debugLog(`Widget interaction "${type}" suppressed by consent gate`);
    return;
  }
  if (!ruleId) {
    debugLog(`Widget interaction "${type}" missing ruleId — beacon skipped`);
    return;
  }

  // Allow callers to override the endpoint for self-hosted backends —
  // mirrors the same pattern as widget rules fetch.
  const endpoint = resolveEndpoint(
    config.apiEndpoint,
    `/v1/widget-rules/${encodeURIComponent(ruleId)}/interactions`
  );

  try {
    const req: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
        'X-APP-KEY': config.appKey,
      },
      body: JSON.stringify({
        type,
        ruleId,
        sessionId: sessionId ?? null,
        timestamp: new Date().toISOString(),
      }),
      keepalive: true,
    };
    try {
      (req as RequestInit & { priority?: string }).priority = 'low';
    } catch {
      /* ignore — `priority` is non-standard, we just want it when available. */
    }
    const res = await fetch(endpoint, req);
    debugLog(`Widget interaction "${type}" beacon: ${res.status}`);
  } catch (err) {
    // Never surface a network failure — interaction telemetry is
    // best-effort. Aligns with the diagnostics reporter's stance.
    debugLog(`Widget interaction "${type}" beacon failed (non-fatal):`, err);
  }
}
