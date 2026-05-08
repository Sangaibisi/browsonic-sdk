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
 * Coverage:
 *   - LCP  via PerformanceObserver('largest-contentful-paint')
 *   - FCP  via PerformanceObserver('paint') filtered by name
 *   - CLS  via PerformanceObserver('layout-shift')
 *   - TTFB via PerformanceNavigationTiming (responseStart - startTime)
 *   - FID  via PerformanceObserver('first-input') — emits once on first
 *          input then disconnects; processing delay = processingStart -
 *          startTime
 *   - INP  via PerformanceObserver('event') with durationThreshold —
 *          tracks the worst observed interaction duration across the
 *          page lifetime, flushed on visibilitychange / pagehide
 *
 * Rating thresholds match Google's web-vitals reference table
 * (https://web.dev/vitals/) at the time of writing.
 *
 * Why a 16ms `durationThreshold` on the INP observer: anything below
 * a single 60Hz frame is below the threshold of perceptible jank for
 * the user, and including those entries dilutes the worst-case
 * tracking with noise. The observer therefore opts out of sub-frame
 * samples — matching the `web-vitals` lib's default.
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

  // ---- FID (first-input) -------------------------------------------
  // The browser only emits one `first-input` PerformanceEntry per page
  // load, so the observer disconnects itself the moment it sees a
  // sample. Value is the input-processing delay (ms): how long the
  // main thread blocked before the first user interaction's handler
  // started running.
  safeExecute(
    () => {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & {
            processingStart?: number;
            startTime: number;
          };
          if (typeof e.processingStart !== 'number') continue;
          const value = e.processingStart - e.startTime;
          if (value < 0) continue;
          onMetric({
            name: 'FID',
            value,
            delta: value,
            id: makeId('FID'),
            rating: rate('FID', value),
            navigationType: getNavigationType(),
          });
          observer.disconnect();
          return;
        }
      });
      observer.observe({ type: 'first-input', buffered: true });
      cleanups.push(() => observer.disconnect());
    },
    undefined,
    (e) => debugLog('web-vitals: FID observer failed', e)
  );

  // ---- INP (interaction-to-next-paint) ------------------------------
  // INP is the worst observed interaction duration across the page's
  // lifetime — Google's recommendation for a single-number summary
  // when reporting at session boundaries. Pure max() is conservative
  // (a robust P98 needs a sliding window the lib doesn't carry); a
  // future revision can swap in percentile tracking without changing
  // the wire shape. Reported once on tab-hide / pagehide so we don't
  // lose the sample to abandonment.
  safeExecute(
    () => {
      let maxDuration = 0;
      let reported = false;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const e = entry as PerformanceEntry & { duration: number };
          if (e.duration > maxDuration) {
            maxDuration = e.duration;
          }
        }
      });
      // `durationThreshold` is part of `PerformanceObserverInit` for
      // the 'event' entry type; lib.dom doesn't model it on the base
      // type so we cast at the call site to keep the rest of the
      // observer plumbing strictly typed.
      observer.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 16,
      } as PerformanceObserverInit & { durationThreshold: number });

      const flush = () => {
        if (reported || maxDuration === 0) return;
        reported = true;
        const value = +maxDuration.toFixed(2);
        onMetric({
          name: 'INP',
          value,
          delta: value,
          id: makeId('INP'),
          rating: rate('INP', value),
          navigationType: getNavigationType(),
        });
      };

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
    (e) => debugLog('web-vitals: INP observer failed', e)
  );

  // Avoid an unused identifier when only the timestamp helper grows
  // useful in future revisions.
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
