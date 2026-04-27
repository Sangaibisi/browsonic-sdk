/**
 * Callback collector plugin — 'global' async-stack mode. Wraps
 * setTimeout / setInterval / rAF / addEventListener / removeEventListener
 * so thrown Errors carry a `_bindStack`.
 *
 * Gated by `captureAsyncStack: 'global'` (default is `false`).
 * 'manual' mode does NOT install this plugin; users call `Browsonic.wrap()`
 * directly for selected callbacks.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createCallbackCollector } from '../collectors/callback';

export function callbackPlugin(): SdkPlugin {
  let collector: ReturnType<typeof createCallbackCollector> | null = null;

  return {
    id: 'callback',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      collector = createCallbackCollector({
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
