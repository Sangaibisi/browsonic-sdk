// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent } from '../types';
import type { NetworkTelemetryData } from '../telemetry';
import { uuid, timestamp, safeExecute } from '../utils';

interface XHRCollectorOptions {
  onEvent: (event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>) => void;
  onTelemetry: (data: NetworkTelemetryData) => void;
  debugLog: (message: string, ...args: unknown[]) => void;
  /** SDK's own API endpoint - requests to this URL will be ignored */
  sdkEndpoint: string;
}

interface XHRMetadata {
  method: string;
  url: string;
  startTime: number | null;
}

/**
 * XMLHttpRequest interceptor — 0.3.0 rewrite.
 *
 * Leak fixes applied (TEKNIK-IYILESTIRME §2.2):
 *   1. Per-instance metadata now lives in a WeakMap, not a property on
 *      XMLHttpRequest. Previously every XHR instance carried a
 *      `_browsonicMetadata` property even after uninstall — that polluted
 *      the global type and kept references alive.
 *   2. Listeners (loadend/error/timeout) are registered with an AbortSignal
 *      bound to the collector's AbortController. Uninstall calls .abort()
 *      which tears down every registered listener on every live XHR in
 *      one shot — no slow iteration, no forgotten references.
 */
export function createXHRCollector(options: XHRCollectorOptions) {
  const { onEvent, onTelemetry, debugLog, sdkEndpoint } = options;

  let isInstalled = false;
  let originalOpen: typeof XMLHttpRequest.prototype.open | null = null;
  let originalSend: typeof XMLHttpRequest.prototype.send | null = null;
  let abortController: AbortController | null = null;

  // Per-XHR metadata. WeakMap → GC-safe; entries disappear automatically
  // once a given XMLHttpRequest instance is no longer referenced elsewhere.
  const metadataByXhr = new WeakMap<XMLHttpRequest, XHRMetadata>();

  function isSdkRequest(url: string): boolean {
    try {
      return url.startsWith(sdkEndpoint) || url.includes('/v1/events');
    } catch {
      return false;
    }
  }

  function resolveUrl(url: string): string {
    try {
      return new URL(url, window.location.href).href;
    } catch {
      return url;
    }
  }

  function install() {
    if (isInstalled) return;
    if (typeof window === 'undefined' || typeof XMLHttpRequest === 'undefined') return;

    safeExecute(
      () => {
        // Capture into local const refs — wrappers close over these, so
        // they stay valid even if `originalOpen`/`originalSend` module
        // state is cleared during uninstall race. No non-null assertions.
        const capturedOpen = XMLHttpRequest.prototype.open;
        const capturedSend = XMLHttpRequest.prototype.send;
        originalOpen = capturedOpen;
        originalSend = capturedSend;
        abortController = new AbortController();
        const signal = abortController.signal;

        // Intercept open() — capture method+URL into WeakMap.
        XMLHttpRequest.prototype.open = function (
          method: string,
          url: string | URL,
          async: boolean = true,
          username?: string | null,
          password?: string | null
        ) {
          const resolved = resolveUrl(typeof url === 'string' ? url : url.toString());
          metadataByXhr.set(this, {
            method: method.toUpperCase(),
            url: resolved,
            startTime: null,
          });
          return capturedOpen.call(this, method, url, async, username, password);
        };

        // Intercept send() — attach listeners bound to the collector's abort
        // signal so uninstall tears everything down cleanly.
        XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
          const xhr = this;
          const metadata = metadataByXhr.get(xhr);

          if (metadata) {
            metadata.startTime = Date.now();

            if (!isSdkRequest(metadata.url)) {
              const opts: AddEventListenerOptions = { signal };

              xhr.addEventListener(
                'loadend',
                () => {
                  safeExecute(
                    () => {
                      const duration = metadata.startTime ? Date.now() - metadata.startTime : 0;
                      onTelemetry({
                        method: metadata.method,
                        url: metadata.url,
                        statusCode: xhr.status,
                        statusText: xhr.statusText || '',
                        duration,
                        type: 'xhr',
                      });
                      debugLog(
                        `XHR telemetry: ${metadata.method} ${metadata.url} - ${xhr.status} (${duration}ms)`
                      );

                      if (xhr.status >= 400) {
                        onEvent({
                          eventId: uuid(),
                          timestamp: timestamp(),
                          type: 'network_error',
                          level: xhr.status >= 500 ? 'error' : 'warn',
                          message: `${metadata.method} ${metadata.url} - ${xhr.status} ${xhr.statusText}`,
                          stack: null,
                        });
                      }
                    },
                    undefined,
                    (err) => debugLog('XHR collector loadend error:', err)
                  );
                },
                opts
              );

              xhr.addEventListener(
                'error',
                () => {
                  safeExecute(
                    () => {
                      const duration = metadata.startTime ? Date.now() - metadata.startTime : 0;
                      onTelemetry({
                        method: metadata.method,
                        url: metadata.url,
                        statusCode: 0,
                        statusText: 'Network Error',
                        duration,
                        type: 'xhr',
                      });
                      onEvent({
                        eventId: uuid(),
                        timestamp: timestamp(),
                        type: 'network_error',
                        level: 'error',
                        message: `${metadata.method} ${metadata.url} - Network Error`,
                        stack: null,
                      });
                    },
                    undefined,
                    (err) => debugLog('XHR collector error handler error:', err)
                  );
                },
                opts
              );

              xhr.addEventListener(
                'timeout',
                () => {
                  safeExecute(
                    () => {
                      const duration = metadata.startTime ? Date.now() - metadata.startTime : 0;
                      onTelemetry({
                        method: metadata.method,
                        url: metadata.url,
                        statusCode: 0,
                        statusText: 'Timeout',
                        duration,
                        type: 'xhr',
                      });
                      onEvent({
                        eventId: uuid(),
                        timestamp: timestamp(),
                        type: 'network_error',
                        level: 'error',
                        message: `${metadata.method} ${metadata.url} - Timeout`,
                        stack: null,
                      });
                    },
                    undefined,
                    (err) => debugLog('XHR collector timeout handler error:', err)
                  );
                },
                opts
              );
            }
          }

          return capturedSend.call(this, body);
        };

        isInstalled = true;
        debugLog('XHR collector installed (WeakMap metadata + AbortController listeners)');
      },
      undefined,
      (error) => debugLog('Failed to install XHR collector:', error)
    );
  }

  function uninstall() {
    if (!isInstalled) return;
    if (typeof XMLHttpRequest === 'undefined') return;

    safeExecute(
      () => {
        // Tear down every listener we registered, regardless of which XHR
        // instance it's on. This is the payoff of using AbortSignal.
        abortController?.abort();
        abortController = null;

        if (originalOpen) {
          XMLHttpRequest.prototype.open = originalOpen;
          originalOpen = null;
        }
        if (originalSend) {
          XMLHttpRequest.prototype.send = originalSend;
          originalSend = null;
        }
        isInstalled = false;
        debugLog('XHR collector uninstalled');
      },
      undefined,
      (error) => debugLog('Failed to uninstall XHR collector:', error)
    );
  }

  return {
    install,
    uninstall,
    isInstalled: () => isInstalled,
  };
}
