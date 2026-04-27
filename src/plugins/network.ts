/**
 * Fetch network collector plugin — intercepts `window.fetch` for
 * telemetry + error capture. Gated upstream by the default-plugin
 * helper when the host wants network coverage.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createNetworkCollector } from '../collectors/network';

export function networkPlugin(): SdkPlugin {
  let collector: ReturnType<typeof createNetworkCollector> | null = null;

  return {
    id: 'network',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      collector = createNetworkCollector({
        onEvent: ctx.emitEvent,
        onTelemetry:
          ctx.config.networkTelemetry && ctx.telemetry
            ? (data) => ctx.telemetry?.add({ category: 'network', data })
            : undefined,
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
