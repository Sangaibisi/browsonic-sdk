// SPDX-License-Identifier: Apache-2.0

/**
 * Widget plugin — wires the notification UI into the SDK via the
 * plugin contract (src/plugin.ts). Core SDK no longer imports this
 * module statically; tree-shake keeps widget code out of the core bundle.
 *
 * Usage:
 *
 *   import { getBrowsonic } from '@browsonic/sdk/core';
 *   import { widgetPlugin } from '@browsonic/sdk/widget';
 *
 *   const sdk = getBrowsonic();
 *   sdk.register(widgetPlugin());
 *   sdk.init({
 *     apiEndpoint: '...',
 *     appKey: '...',
 *     widgetRules: [...],
 *     widgetPosition: 'bottom-right',
 *     widgetRulesEndpoint: true,   // optional server rules
 *   });
 *
 * Rules, position, and endpoint configuration continue to live on
 * `BrowsonicConfig` (widgetRules / widgetPosition / widgetRulesEndpoint).
 * Registering `widgetPlugin()` is the opt-in; the legacy `enableWidget`
 * flag was removed in 2.0.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createWidgetManager, type WidgetManager } from './widget-manager';
import type { WidgetNotification } from '../types';

/**
 * Optional overrides for the widget plugin. When omitted, values are
 * pulled from the SDK config at activation time.
 */
export interface WidgetPluginOptions {
  /**
   * Imperative helper — returns `show`/`dismiss` handles to let the host
   * app manually trigger notifications without waiting for a rule match.
   * The handle is filled in during `activate()`.
   *
   * Example:
   *   const widget = { show: () => {}, dismiss: () => {} };
   *   sdk.register(widgetPlugin({ expose: widget }));
   *   // after init → widget.show(...) available.
   */
  expose?: {
    show?: (notification: WidgetNotification) => void;
    dismiss?: () => void;
  };
}

export function widgetPlugin(options: WidgetPluginOptions = {}): SdkPlugin {
  let manager: WidgetManager | null = null;
  let unsubscribeEvents: (() => void) | null = null;

  return {
    id: 'widget',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      const { config, debugLog, onEvent } = ctx;
      manager = createWidgetManager(config, debugLog);

      // Pre-load server rules in background. Non-critical; failures are
      // swallowed by fetchServerRules itself, but we add .catch defensively.
      void manager.fetchServerRules().catch(() => {
        debugLog('Widget server rules fetch failed (non-critical)');
      });

      // Wire the widget into the SDK event pipeline.
      unsubscribeEvents = onEvent((event) => {
        manager?.handleEvent(event);
      });

      // Expose imperative helpers if the host app requested them.
      const exposed = options.expose;
      if (exposed) {
        exposed.show = (notification) => manager?.showNotification(notification);
        exposed.dismiss = () => manager?.dismiss();
      }
    },

    deactivate() {
      if (unsubscribeEvents) {
        unsubscribeEvents();
        unsubscribeEvents = null;
      }
      manager?.destroy();
      manager = null;
    },
  };
}
