// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Web Vitals collector (Sprint 1 / gap A2).
 *
 * Pure native PerformanceObserver implementation — no `web-vitals` lib
 * dependency, so the opt-in plugin doesn't break the SDK's
 * "+0KB-by-default" bundle promise. The library would add ~6KB
 * gzipped; we add ~1KB.
 *
 * Coverage in 2.3.0:
 *   - LCP via PerformanceObserver('largest-contentful-paint')
 *   - FCP via PerformanceObserver('paint') filtered by name
 *   - CLS via PerformanceObserver('layout-shift')
 *   - TTFB via PerformanceNavigationTiming (responseStart - startTime)
 *
 * Deferred to 2.3.1 (S2): FID and INP. Both need event-handler hooks
 * (`PerformanceEventTiming` is gated behind explicit observer setup
 * with `buffered: true` and event-type filters); the implementation
 * is bigger than the core four and needs its own test pass.
 *
 * Rating thresholds match Google's web-vitals reference table
 * (https://web.dev/vitals/) at the time of writing.
 */

import { safeExecute, timestamp } from '../utils';
import type { WebVitalMetric, WebVitalName, WebVitalRating } from '../types';

interface WebVitalsCollectorOptions {
  onMetric: (metric: WebVitalMetric) => void;
  debugLog: (message: string, ...args: unknown[]) => void;
}

interface RatingThresholds {
  good: number;
  poor: number;
}

const RATING: Record<WebVitalName, RatingThresholds> = {
  LCP: { good: 2500, poor: 4000 },
  FID: { good: 100, poor: 300 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  TTFB: { good: 800, poor: 1800 },
  FCP: { good: 1800, poor: 3000 },
};

function rate(name: WebVitalName, value: number): WebVitalRating {
  const t = RATING[name];
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function makeId(name: WebVitalName): string {
  // Loose stability — good enough for client-side dedupe within a
  // session. We don't try to match the `web-vitals` lib's id format
  // since the backend doesn't depend on it.
  return `v1-${name.toLowerCase()}-${Math.floor(performance.now())}`;
}

/**
 * Wire up native PerformanceObservers and emit on each sample.
 * Returns a cleanup function. Safe to call multiple times — the
 * cleanup of a previous install must run first; this function does
 * NOT track install state internally (the plugin wrapper does).
 */
export function createWebVitalsCollector(options: WebVitalsCollectorOptions): () => void {
  const { onMetric, debugLog } = options;
  const cleanups: Array<() => void> = [];

  if (typeof PerformanceObserver === 'undefined') {
    debugLog('web-vitals collector: PerformanceObserver unavailable');
    return () => undefined;
  }

  // ---- LCP ----------------------------------------------------------
  safeExecute(
    () => {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (!last) return;
        const value = last.startTime;
        const metric: WebVitalMetric = {
          name: 'LCP',
          value,
          delta: value,
          id: makeId('LCP'),
          rating: rate('LCP', value),
          navigationType: getNavigationType(),
        };
        onMetric(metric);
      });
      observer.observe({ type: 'largest-contentful-paint', buffered: true });
      cleanups.push(() => observer.disconnect());
    },
    undefined,
    (e) => debugLog('web-vitals: LCP observer failed', e)
  );

  // ---- FCP ----------------------------------------------------------
  safeExecute(
    () => {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name !== 'first-contentful-paint') continue;
          const value = entry.startTime;
          onMetric({
            name: 'FCP',
            value,
            delta: value,
            id: makeId('FCP'),
            rating: rate('FCP', value),
            navigationType: getNavigationType(),
          });
        }
      });
      observer.observe({ type: 'paint', buffered: true });
      cleanups.push(() => observer.disconnect());
    },
    undefined,
    (e) => debugLog('web-vitals: FCP observer failed', e)
  );

  // ---- CLS (cumulative across session, reported on visibilitychange) -
  safeExecute(
    () => {
      let cls = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // PerformanceEntry doesn't carry the layout-shift fields by
          // default; the cast is safe because we filter by entryType.
          const ls = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (ls.hadRecentInput) continue;
          cls += ls.value ?? 0;
        }
      });
      observer.observe({ type: 'layout-shift', buffered: true });

      const flush = () => {
        if (cls === 0) return;
        const value = +cls.toFixed(4);
        onMetric({
          name: 'CLS',
          value,
          delta: value,
          id: makeId('CLS'),
          rating: rate('CLS', value),
        });
      };

      // Report on tab hide and pagehide so we don't lose the sample
      // when the user closes / navigates away.
      const onVis = () => {
        if (document.visibilityState === 'hidden') flush();
      };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('pagehide', flush, { once: true });

      cleanups.push(() => {
        observer.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        flush();
      });
    },
    undefined,
    (e) => debugLog('web-vitals: CLS observer failed', e)
  );

  // ---- TTFB ---------------------------------------------------------
  safeExecute(
    () => {
      const navEntry = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      if (!navEntry) return;
      const value = navEntry.responseStart - navEntry.startTime;
      if (value < 0) return; // back-forward cache restore can produce negatives
      onMetric({
        name: 'TTFB',
        value,
        delta: value,
        id: makeId('TTFB'),
        rating: rate('TTFB', value),
        navigationType: getNavigationType(),
      });
    },
    undefined,
    (e) => debugLog('web-vitals: TTFB read failed', e)
  );

  // FID + INP deferred to 2.3.1 — see file header.

  // Avoid an unused identifier when only the timestamp helper grows
  // useful in S2's INP implementation.
  void timestamp;

  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        /* swallow — cleanup must not throw */
      }
    }
  };
}

function getNavigationType(): WebVitalMetric['navigationType'] | undefined {
  const nav = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  if (!nav) return undefined;
  switch (nav.type) {
    case 'navigate':
    case 'reload':
    case 'back_forward':
    case 'prerender':
      // PerformanceNavigationTiming uses 'back_forward'; the wire
      // schema standardises on the hyphenated 'back-forward' form.
      return nav.type === 'back_forward' ? 'back-forward' : nav.type;
    default:
      return undefined;
  }
}
