// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Page View Collector
 *
 * Sends a page-view ping on initial page load and on SPA route changes.
 *
 * IMPORTANT CHANGES in 0.3.0 (TEKNIK-IYILESTIRME-PLANI §1.3, §1.4):
 *   - Transport is now POST with apiKey in X-API-Key header (was: GET pixel
 *     with apiKey in URL query — leaked via Referer, access logs, browser
 *     history, extensions).
 *   - History instrumentation is no longer done in this collector; it
 *     subscribes to the shared history-instrumentation module. Prevents
 *     the double-wrap memory leak we had when navigation + pageview both
 *     hooked history.pushState.
 *   - Uses navigator.sendBeacon when the page is being dismissed, and
 *     fetch(..., keepalive: true) otherwise — never blocks the main thread.
 *
 * Backward compatibility:
 *   The endpoint `/v1/usage` continues to accept GET (pixel) requests for
 *   older SDK versions. New SDKs always POST. Backend must support both
 *   for at least one minor version; GET deprecation will be announced in
 *   CHANGELOG when both paths are telemeterized.
 */

import type { ResolvedConfig } from '../types';
import { resolveEndpoint } from '../utils';
import { getOrCreateVisitorId } from '../visitor';
import { subscribeToHistoryChanges } from './history-instrumentation';

export interface PageViewConfig {
  apiEndpoint: string;
  apiKey: string;
  appKey: string;
  environment: string;
  clientVersion: string | null;
  debugLog: (message: string, ...args: unknown[]) => void;
  getSessionId: () => string;
  /**
   * Visitor-ID resolution inputs. Kept as a slim sub-shape rather than
   * the full {@link ResolvedConfig} so existing callers (tests, older
   * plugin hosts) don't need the entire config graph just to build a
   * page-view ping.
   */
  visitorIdStrategy: ResolvedConfig['visitorIdStrategy'];
  respectGPC: boolean;
  hasConsented: (() => boolean) | null;
}

export interface PageViewData {
  url: string;
  referrer: string;
  title: string;
  timestamp: number;
}

/**
 * Payload body for POST /v1/usage.
 * Backend must accept this shape as of SDK >= 0.3.0.
 */
interface PageViewRequestBody {
  t: 'pv';
  vid: string;
  sid: string;
  app: string;
  env: string;
  url: string;
  ref: string;
  title: string;
  ts: number;
  v: string | null;
}

export function createPageViewCollector(config: PageViewConfig) {
  let isInstalled = false;
  let hasSentInitialPageView = false;
  let unsubscribeHistory: (() => void) | null = null;
  let visibilityHandler: (() => void) | null = null;

  function buildBody(data: PageViewData): PageViewRequestBody {
    // Build a slim ResolvedConfig-compatible shape so the visitor
    // module can honour strategy / GPC / consent without this collector
    // needing the whole config graph.
    const visitorConfig = {
      visitorIdStrategy: config.visitorIdStrategy,
      respectGPC: config.respectGPC,
      hasConsented: config.hasConsented,
    } as ResolvedConfig;
    return {
      t: 'pv',
      vid: getOrCreateVisitorId(visitorConfig),
      sid: config.getSessionId(),
      app: config.appKey,
      env: config.environment,
      url: data.url,
      ref: data.referrer,
      title: data.title,
      ts: data.timestamp,
      v: config.clientVersion,
    };
  }

  /**
   * Send page view.
   *
   * - If document is hidden or being dismissed, prefer navigator.sendBeacon
   *   so the request survives unload.
   * - Otherwise use fetch with keepalive:true and priority:'low' so it
   *   never contends with user-critical requests.
   */
  function send(data: PageViewData, dismissing: boolean = false): void {
    const endpoint = resolveEndpoint(config.apiEndpoint, '/v1/usage');
    const body = buildBody(data);

    try {
      if (
        dismissing &&
        typeof navigator !== 'undefined' &&
        typeof navigator.sendBeacon === 'function'
      ) {
        // sendBeacon cannot set headers. Use a Blob with a content type
        // so the server can parse the body. The API key moves into a
        // query parameter ONLY in the sendBeacon fallback, and only for
        // dismissal — this is the narrowest path possible until the backend
        // supports auth via cookie / POST form with hidden credentials.
        // TODO(backend): support `X-API-Key` on beacon-signed requests.
        const payload = new Blob([JSON.stringify(body)], {
          type: 'application/json',
        });
        const url = `${endpoint}?key=${encodeURIComponent(config.apiKey)}`;
        const ok = navigator.sendBeacon(url, payload);
        config.debugLog('PageView sent via sendBeacon:', data.url, 'ok=', ok);
        return;
      }

      // Primary path: fetch POST with credentials in header.
      const req: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': config.apiKey,
          'X-APP-KEY': config.appKey,
        },
        body: JSON.stringify(body),
        keepalive: true,
        // `priority` is a hint; unsupported browsers ignore it silently.
      };
      try {
        (req as RequestInit & { priority?: string }).priority = 'low';
      } catch {
        // ignore
      }

      fetch(endpoint, req)
        .then((res) => {
          config.debugLog('PageView POST:', data.url, 'status=', res.status);
        })
        .catch((err) => {
          config.debugLog('PageView POST error:', err);
        });
    } catch (err) {
      config.debugLog('PageView send failed:', err);
    }
  }

  function collectPageData(): PageViewData {
    return {
      url: typeof window !== 'undefined' ? window.location.href : '',
      referrer: typeof document !== 'undefined' ? document.referrer || '' : '',
      title: typeof document !== 'undefined' ? document.title || '' : '',
      timestamp: Date.now(),
    };
  }

  function trackPageView(): void {
    send(collectPageData(), false);
  }

  function afterDocumentLoad(callback: () => void): void {
    if (typeof document === 'undefined') return;
    if (document.readyState === 'complete') {
      callback();
    } else {
      window.addEventListener('load', callback, { once: true });
    }
  }

  function install(): void {
    if (isInstalled) return;
    if (typeof window === 'undefined') return;

    isInstalled = true;

    afterDocumentLoad(() => {
      if (!hasSentInitialPageView) {
        hasSentInitialPageView = true;
        trackPageView();
      }
    });

    // Subscribe to shared history instrumentation instead of wrapping
    // history.pushState ourselves (TEKNIK-IYILESTIRME-PLANI §1.4).
    unsubscribeHistory = subscribeToHistoryChanges(() => {
      // Small microtask delay so the URL has propagated and document.title
      // has likely been updated by the framework router.
      queueMicrotask(() => trackPageView());
    });

    // Send a final page view on tab dismissal so late sessions are counted.
    visibilityHandler = () => {
      if (document.visibilityState === 'hidden') {
        send(collectPageData(), true);
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    config.debugLog('Page view collector installed');
  }

  function uninstall(): void {
    if (unsubscribeHistory) {
      unsubscribeHistory();
      unsubscribeHistory = null;
    }
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
    isInstalled = false;
    hasSentInitialPageView = false;
    config.debugLog('Page view collector uninstalled');
  }

  function track(url?: string): void {
    const data = collectPageData();
    if (url) data.url = url;
    send(data, false);
  }

  return {
    install,
    uninstall,
    track,
  };
}
