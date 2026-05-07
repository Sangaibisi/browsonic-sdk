// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Web Vitals opt-in plugin (Sprint 1 / gap A2).
 *
 * Not part of the default plugin set — consumers add it explicitly:
 *
 * ```ts
 * import { browsonic, webVitalsPlugin } from '@browsonic/sdk';
 * browsonic({ apiEndpoint: '...', appKey: '...' });
 * browsonic.register(webVitalsPlugin());
 * ```
 *
 * Why opt-in: the collector is small (~1KB native PerformanceObserver
 * code), but Web Vitals telemetry is a meaningful product behaviour
 * change — it adds extra event payload and latches into native
 * observers. We want consumers to consciously turn it on.
 */

import type { Collector } from '../plugin';
import { createWebVitalsCollector } from '../collectors/web-vitals';
import type { WebVitalMetric } from '../types';

export interface WebVitalsPluginOptions {
  /**
   * Maximum samples to retain per session before further reports are
   * dropped (defensive cap against runaway observers in long-lived
   * SPAs). Default 30.
   */
  maxSamples?: number;
}

export function webVitalsPlugin(options: WebVitalsPluginOptions = {}): Collector {
  const maxSamples = options.maxSamples ?? 30;
  let teardown: (() => void) | null = null;
  const samples: WebVitalMetric[] = [];

  return {
    id: 'sdk:web-vitals',
    apiVersion: 1,
    category: 'collector',
    isInstalled: () => teardown !== null,
    activate(ctx) {
      teardown = createWebVitalsCollector({
        debugLog: ctx.debugLog,
        onMetric: (metric) => {
          if (samples.length >= maxSamples) {
            ctx.debugLog('web-vitals: sample cap reached, dropping', metric.name);
            return;
          }
          samples.push(metric);

          // Push to telemetry as a breadcrumb so the dashboard's
          // BreadcrumbTimeline (S3 / gap A4) renders the trail.
          // The 'web-vital' breadcrumb category is documented in
          // EVENT_PAYLOAD_SCHEMA.md.
          ctx.telemetry?.add({
            category: 'breadcrumb',
            data: {
              category: 'web-vital',
              level: 'info',
              message: `${metric.name} ${metric.value} (${metric.rating})`,
              data: {
                name: metric.name,
                value: metric.value,
                delta: metric.delta,
                rating: metric.rating,
                navigationType: metric.navigationType,
              },
            },
          });
        },
      });
      ctx.debugLog('web-vitals plugin activated');
    },
    deactivate() {
      if (teardown) {
        teardown();
        teardown = null;
      }
      samples.length = 0;
    },
    health() {
      return { ok: true, detail: `${samples.length} samples` };
    },
  };
}

/**
 * Returns the metrics buffered by the plugin since `activate()`. Used
 * by tests and by the queue's `createBatch` path so the most-recent
 * pageview event can carry the sample list (`event.webVitals`).
 *
 * NOTE: Sprint 1 ships this getter on the plugin instance only;
 * wiring it into the actual createBatch path lands in Sprint 2 as
 * part of the broader observability bundle (B1 + B2 + B3).
 */
export function _readWebVitalsBuffer(plugin: ReturnType<typeof webVitalsPlugin>): WebVitalMetric[] {
  // Plugin internals are private; this helper exists so the queue
  // path can read the buffer via the plugin context in S2 without
  // exporting the inner array. Returns an empty array when the
  // plugin shape is unrecognised (defensive against test mocks).
  return '__samples' in plugin &&
    Array.isArray((plugin as unknown as { __samples: unknown }).__samples)
    ? (plugin as unknown as { __samples: WebVitalMetric[] }).__samples
    : [];
}
