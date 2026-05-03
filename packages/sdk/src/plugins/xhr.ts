// SPDX-License-Identifier: Apache-2.0

/**
 * XHR collector plugin — intercepts `XMLHttpRequest.prototype.open/send`.
 * Gated by `captureXHR: true`; registered only when that legacy flag
 * is set.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createXHRCollector } from '../collectors/xhr';

export function xhrPlugin(): SdkPlugin {
  let collector: ReturnType<typeof createXHRCollector> | null = null;

  return {
    id: 'xhr',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      const telemetrySink =
        ctx.config.networkTelemetry && ctx.telemetry
          ? (data: import('../telemetry').NetworkTelemetryData) =>
              ctx.telemetry?.add({ category: 'network', data })
          : () => {};

      collector = createXHRCollector({
        onEvent: ctx.emitEvent,
        onTelemetry: telemetrySink,
        debugLog: ctx.debugLog,
        sdkEndpoint: ctx.config.apiEndpoint,
      });
      collector.install();
    },

    deactivate() {
      collector?.uninstall();
      collector = null;
    },
  };
}
