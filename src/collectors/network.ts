// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent } from '../types';
import type { NetworkTelemetryData } from '../telemetry';
import { uuid, timestamp, safeExecute } from '../utils';

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
              const event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'> = {
                eventId: uuid(),
                timestamp: timestamp(),
                type: 'network_error',
                level: response.status >= 500 ? 'error' : 'warn',
                message: `${method} ${url} - ${response.status} ${response.statusText}`,
                stack: null,
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
            const event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'> = {
              eventId: uuid(),
              timestamp: timestamp(),
              type: 'network_error',
              level: 'error',
              message: `${method} ${url} - ${errorMessage}`,
              stack: error instanceof Error ? error.stack || null : null,
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
