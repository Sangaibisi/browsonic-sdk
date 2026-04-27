/**
 * Console collector plugin — intercepts `console.*` calls, pushes them
 * to the shared telemetry store, and emits events for levels whitelisted
 * by `captureLevels`.
 *
 * Core bundle does not import this file; main entry (via default.ts)
 * auto-registers it when the host passes classic config (captureLevels
 * non-empty).
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createConsoleCollector } from '../collectors/console';

export function consolePlugin(): SdkPlugin {
  let collector: ReturnType<typeof createConsoleCollector> | null = null;

  return {
    id: 'console',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      collector = createConsoleCollector({
        captureLevels: ctx.config.captureLevels,
        onEvent: ctx.emitEvent,
        onTelemetry: ctx.telemetry
          ? (data) => ctx.telemetry?.add({ category: 'console', data })
          : undefined,
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
