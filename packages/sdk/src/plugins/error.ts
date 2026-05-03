// SPDX-License-Identifier: Apache-2.0

/**
 * Error collector plugin — captures `window.onerror` and
 * `unhandledrejection`. Always paired with `errorPlugin()` in the
 * default set; no config knob gates it.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createErrorCollector } from '../collectors/error';

export function errorPlugin(): SdkPlugin {
  let collector: ReturnType<typeof createErrorCollector> | null = null;

  return {
    id: 'error',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      collector = createErrorCollector({
        onEvent: ctx.emitEvent,
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
