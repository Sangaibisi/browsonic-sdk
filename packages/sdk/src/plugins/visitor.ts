// SPDX-License-Identifier: Apache-2.0

/**
 * Visitor collector plugin — captures click + input interactions for
 * telemetry. Gated by `trackVisitor: true` (off by default for privacy).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createVisitorCollector } from '../collectors/visitor';

export function visitorPlugin(): SdkPlugin {
  let collector: ReturnType<typeof createVisitorCollector> | null = null;

  return {
    id: 'visitor',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      collector = createVisitorCollector({
        onTelemetry: (data) => ctx.telemetry?.add({ category: 'visitor', data }),
        debugLog: ctx.debugLog,
        trackClicks: ctx.config.visitor.click,
        trackInputs: ctx.config.visitor.input,
        inputThrottleMs: ctx.config.visitor.inputThrottleMs,
      });
      collector.install();
    },

    deactivate() {
      collector?.uninstall();
      collector = null;
    },
  };
}
