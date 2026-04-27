/**
 * Page view collector plugin — sends a page-view ping on initial load
 * and on SPA route changes. Gated by `trackPageViews: true` AND a
 * non-null `apiKey` (enforced by validateConfig).
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { SdkPlugin, PluginContext } from '../plugin';
import { createPageViewCollector } from '../collectors/pageview';

export function pageViewPlugin(): SdkPlugin {
  let collector: ReturnType<typeof createPageViewCollector> | null = null;

  return {
    id: 'pageview',
    apiVersion: 1,

    activate(ctx: PluginContext) {
      const { config } = ctx;
      if (!config.apiKey) {
        ctx.debugLog('Page view plugin skipped: apiKey required');
        return;
      }
      collector = createPageViewCollector({
        apiEndpoint: config.apiEndpoint,
        apiKey: config.apiKey,
        appKey: config.appKey,
        environment: config.environment,
        clientVersion: config.clientVersion,
        debugLog: ctx.debugLog,
        getSessionId: () => ctx.getSessionId(),
        visitorIdStrategy: config.visitorIdStrategy,
        respectGPC: config.respectGPC,
        hasConsented: config.hasConsented,
      });
      collector.install();
    },

    deactivate() {
      collector?.uninstall();
      collector = null;
    },
  };
}
