// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent, NetworkDetail } from '../types';
import type { NetworkTelemetryData } from '../telemetry';
import { uuid, timestamp, safeExecute } from '../utils';
import { filterHeaders } from '../utils/redaction';

/**
 * Sprint 3 (gap B5): build a {@link NetworkDetail} for an outbound
 * fetch. Header allowlisting + PII redaction live in `utils/redaction`
 * so the same logic covers fetch + XHR collectors.
 *
 * Best-effort — every getter is wrapped in try/catch because Headers
 * iteration can throw on locked-down iframe responses.
 */
function buildNetworkDetail(args: {
  init: RequestInit | undefined;
  response?: Response;
  aborted?: boolean;
}): NetworkDetail {
  const detail: NetworkDetail = {};
  // Request size — Content-Length header beats body inspection.
  try {
    const headers = args.init?.headers;
    if (headers) {
      const len = headerValue(headers, 'content-length');
      if (len) {
        const parsed = Number(len);
        if (Number.isFinite(parsed)) detail.requestSize = parsed;
      }
    }
  } catch {
    /* ignore */
  }
  // Response size + headers + traceparent.
  try {
    if (args.response) {
      const lenHeader = args.response.headers.get('content-length');
      if (lenHeader) {
        const parsed = Number(lenHeader);
        if (Number.isFinite(parsed)) detail.responseSize = parsed;
      }
      const headerObj: Record<string, string> = {};
      args.response.headers.forEach((value, key) => {
        headerObj[key] = value;
      });
      const filtered = filterHeaders(headerObj);
      if (Object.keys(filtered).length > 0) detail.headers = filtered;
      const trace = filtered['traceparent'];
      if (trace) detail.traceparent = trace;
    }
  } catch {
    /* ignore */
  }
  if (args.aborted) detail.aborted = true;
  return detail;
}

function headerValue(headers: HeadersInit, name: string): string | undefined {
  const lc = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === lc);
    return found?.[1];
  }
  if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === lc) return String(v);
    }
  }
  return undefined;
}

interface NetworkCollectorOptions {
  onEvent: (event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>) => void;
  onTelemetry?: (data: NetworkTelemetryData) => void;
  debugLog: (message: string, ...args: unknown[]) => void;
  /** SDK's own API endpoint - requests to this URL will be ignored to prevent infinite loops */
  sdkEndpoint: string;
}

/**
 * Network interceptor - captures fetch requests with status >= 400
 */
export function createNetworkCollector(options: NetworkCollectorOptions) {
  const { onEvent, onTelemetry, debugLog, sdkEndpoint } = options;

  let isInstalled = false;
  let originalFetch: typeof fetch | null = null;

  /**
   * Check if URL is SDK's own endpoint (to prevent infinite loops)
   */
  function isSdkRequest(url: string): boolean {
    try {
      // Check if the URL starts with SDK endpoint or contains the events path
      return url.startsWith(sdkEndpoint) || url.includes('/v1/events');
    } catch {
      return false;
    }
  }

  /**
   * Build the interceptor closing over a captured (non-null) fetch ref.
   * Caller guarantees `captured` is the real native fetch at install time;
   * no non-null assertions needed inside the hot path.
   */
  function createFetchInterceptor(captured: typeof fetch): typeof fetch {
    return async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const startTime = Date.now();
      let url: string;
      let method: string;

      // Extract URL and method safely
      try {
        if (typeof input === 'string') {
          url = input;
          method = init?.method || 'GET';
        } else if (input instanceof URL) {
          url = input.toString();
          method = init?.method || 'GET';
        } else {
          url = input.url;
          method = input.method || init?.method || 'GET';
        }
      } catch {
        // If we can't extract URL, just pass through
        return captured.call(window, input, init);
      }

      // Skip SDK's own API calls to prevent infinite loops (CRIT-001)
      if (isSdkRequest(url)) {
        return captured.call(window, input, init);
      }

      try {
        // Call original fetch
        const response = await captured.call(window, input, init);
        const duration = Date.now() - startTime;

        // Always record to telemetry (all requests, not just errors)
        if (onTelemetry) {
          safeExecute(
            () => {
              onTelemetry({
                method,
                url,
                statusCode: response.status,
                statusText: response.statusText,
                duration,
                type: 'fetch',
              });
              debugLog(`Fetch telemetry: ${method} ${url} - ${response.status} (${duration}ms)`);
            },
            undefined,
            (error) => debugLog('Network collector telemetry error:', error)
          );
        }

        // Report as error event if status >= 400
        if (response.status >= 400) {
          safeExecute(
            () => {
              // Sprint 3 (gap B5): attach allowlisted headers + sizes +
              // traceparent so the dashboard can render a "Request
              // detail" panel without an extra round trip.
              const networkDetail = buildNetworkDetail({ init, response });
              const event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'> = {
                eventId: uuid(),
                timestamp: timestamp(),
                type: 'network_error',
                level: response.status >= 500 ? 'error' : 'warn',
                message: `${method} ${url} - ${response.status} ${response.statusText}`,
                stack: null,
                networkDetail,
              };

              onEvent(event);
              debugLog(
                `Network error captured: ${method} ${url} - ${response.status} (${duration}ms)`
              );
            },
            undefined,
            (error) => debugLog('Network collector event creation error:', error)
          );
        }

        return response;
      } catch (error) {
        // Network errors (timeout, connection refused, etc.)
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Network request failed';

        // Record to telemetry
        if (onTelemetry) {
          safeExecute(
            () => {
              onTelemetry({
                method,
                url,
                statusCode: 0,
                statusText: errorMessage,
                duration,
                type: 'fetch',
              });
            },
            undefined,
            (err) => debugLog('Network collector telemetry error:', err)
          );
        }

        // Report as error event
        safeExecute(
          () => {
            // Sprint 3 (gap B5): mark abort + capture request-side
            // detail. Response is unavailable on the failure path so
            // headers / response size stay empty.
            const aborted = error instanceof Error && error.name === 'AbortError';
            const networkDetail = buildNetworkDetail({ init, aborted });
            const event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'> = {
              eventId: uuid(),
              timestamp: timestamp(),
              type: 'network_error',
              level: 'error',
              message: `${method} ${url} - ${errorMessage}`,
              stack: error instanceof Error ? error.stack || null : null,
              networkDetail,
            };

            onEvent(event);
            debugLog(
              `Network failure captured: ${method} ${url} - ${errorMessage} (${duration}ms)`
            );
          },
          undefined,
          (err) => debugLog('Network collector error handler error:', err)
        );

        // Re-throw original error so app's catch handler works
        throw error;
      }
    };
  }

  function install() {
    if (isInstalled) return;
    if (typeof window === 'undefined' || typeof fetch === 'undefined') return;

    safeExecute(
      () => {
        // Preserve identity across install/uninstall cycles: store the
        // UNBOUND reference so uninstall restores `window.fetch` to the
        // exact function the host app started with. `.bind(window)`
        // would add a new wrapper layer each install → history-instrumentation
        // had the same bug in 0.2.x (fixed in Sprint 1). See §1.4.
        const captured = window.fetch;
        originalFetch = captured;
        window.fetch = createFetchInterceptor(captured);
        isInstalled = true;
        debugLog('Network collector installed');
      },
      undefined,
      (error) => debugLog('Failed to install network collector:', error)
    );
  }

  function uninstall() {
    if (!isInstalled) return;
    if (typeof window === 'undefined') return;

    safeExecute(
      () => {
        if (originalFetch) {
          window.fetch = originalFetch;
          originalFetch = null;
        }
        isInstalled = false;
        debugLog('Network collector uninstalled');
      },
      undefined,
      (error) => debugLog('Failed to uninstall network collector:', error)
    );
  }

  return {
    install,
    uninstall,
    isInstalled: () => isInstalled,
  };
}
