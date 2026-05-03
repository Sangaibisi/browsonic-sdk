// SPDX-License-Identifier: Apache-2.0

/**
 * Widget Manager - Orchestrates rule matching, server rule fetching, and rendering.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent, ResolvedConfig, WidgetRule } from '../types';
import { resolveEndpoint } from '../utils';
import { createRuleMatcher, type RuleMatcher } from './rule-matcher';
import { createWidgetRenderer, type WidgetRenderer } from './renderer';

export interface WidgetManager {
  /** Evaluate an event against all rules and show widget if matched */
  handleEvent(event: BrowsonicEvent): void;
  /** Fetch rules from server and merge with local rules */
  fetchServerRules(): Promise<void>;
  /** Manually show a notification (bypass rules) */
  showNotification(notification: import('../types').WidgetNotification): void;
  /** Dismiss current notification */
  dismiss(): void;
  /** Destroy widget and cleanup */
  destroy(): void;
}

export function createWidgetManager(
  config: ResolvedConfig,
  debugLog: (message: string, ...args: unknown[]) => void
): WidgetManager {
  const matcher: RuleMatcher = createRuleMatcher(config.widgetRules);
  const renderer: WidgetRenderer = createWidgetRenderer(config.widgetPosition, config.cspNonce);

  debugLog('Widget manager created with', matcher.ruleCount(), 'local rules');

  function handleEvent(event: BrowsonicEvent): void {
    const currentUrl =
      event.context?.url || (typeof window !== 'undefined' ? window.location.href : '');

    const result = matcher.check(event, currentUrl);
    if (result) {
      debugLog('Widget rule matched:', result.rule.id);
      renderer.show(result.notification);
    }
  }

  async function fetchServerRules(): Promise<void> {
    // Determine endpoint
    const endpointConfig = config.widgetRulesEndpoint;
    if (!endpointConfig) {
      debugLog('Server widget rules disabled');
      return;
    }
    const endpoint =
      typeof endpointConfig === 'string'
        ? endpointConfig
        : resolveEndpoint(config.apiEndpoint, '/v1/widget-rules/sdk');

    try {
      const url = new URL(endpoint);
      url.searchParams.set('appKey', config.appKey);
      if (config.environment) {
        url.searchParams.set('environment', config.environment);
      }

      debugLog('Fetching widget rules from:', url.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {}),
          'X-APP-KEY': config.appKey,
        },
      });

      if (!response.ok) {
        debugLog('Widget rules fetch failed:', response.status);
        return;
      }

      const data = await response.json();
      const serverRules: WidgetRule[] = Array.isArray(data.rules) ? data.rules : [];

      if (serverRules.length > 0) {
        matcher.addRules(serverRules);
        debugLog('Loaded', serverRules.length, 'server widget rules. Total:', matcher.ruleCount());
      } else {
        debugLog('No server widget rules found');
      }
    } catch (error) {
      // Silently fail — widget rules are non-critical
      debugLog('Widget rules fetch error:', error);
    }
  }

  function showNotification(notification: import('../types').WidgetNotification): void {
    renderer.show(notification);
  }

  function dismiss(): void {
    renderer.dismiss();
  }

  function destroy(): void {
    renderer.destroy();
    matcher.reset();
    debugLog('Widget manager destroyed');
  }

  return { handleEvent, fetchServerRules, showNotification, dismiss, destroy };
}
