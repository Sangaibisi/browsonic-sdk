/**
 * Navigation collector plugin — subscribes to the shared history
 * instrumentation module and emits navigation telemetry.
 * Gated by `trackNavigation: true`.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createNavigationCollector } from '../collectors/navigation';

export function navigationPlugin(): SdkPlugin {
  let collector: ReturnType<typeof createNavigationCollector> | null = null;

  return {
    id: 'navigation',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      collector = createNavigationCollector({
        onTelemetry: (data) => ctx.telemetry?.add({ category: 'navigation', data }),
        debugLog: ctx.debugLog,
      });
      collector.install();
    },

    deactivate() {
      collector?.uninstall();
      collector = null;
    },
  };
}
