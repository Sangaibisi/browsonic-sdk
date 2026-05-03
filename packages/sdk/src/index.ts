// SPDX-License-Identifier: Apache-2.0

/**
 * Browsonic SDK - JavaScript Error Monitoring Agent
 *
 * Main entry — includes the default collector plugin set
 * (error / console / network / xhr / navigation / visitor / callback /
 * pageview) auto-registered from classic config fields.
 *
 * Host apps that want the minimal core (bundle ≤ 8 KB gzip) import from
 * `@browsonic/sdk/core` and register plugins explicitly.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 * @see https://browsonic.io/docs
 *
 */

import type { BrowsonicConfig } from './types';
import { Browsonic as CoreBrowsonic } from './sentinel';
import { applyLegacyPluginsFromConfig } from './plugins/default';
import { setDependenciesProvider } from './context';
import { getDependenciesRecord } from './collectors/dependencies';

/**
 * Main-entry `Browsonic`. Extends the core class so that `init(config)`
 * auto-registers the default collector plugin set before the parent
 * bootstraps. Core entry exports the unextended class — tree-shake
 * keeps plugin code out of that bundle.
 */
export class Browsonic extends CoreBrowsonic {
  private static depsRegistered = false;

  override init(config: BrowsonicConfig): boolean {
    if (!Browsonic.depsRegistered) {
      setDependenciesProvider(getDependenciesRecord);
      Browsonic.depsRegistered = true;
    }
    applyLegacyPluginsFromConfig(this, config);
    return super.init(config);
  }
}

// Singleton instance (main-entry scope). Distinct from the core entry
// singleton — mixing entries in the same app is a bug in the caller.
let instance: Browsonic | null = null;

export function getBrowsonic(): Browsonic {
  if (!instance) {
    instance = new Browsonic();
  }
  return instance;
}

export function resetBrowsonic(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// 2.0: legacy Sentinel-named aliases removed. Migrate to Browsonic /
// getBrowsonic / resetBrowsonic (one-line rename).

// Types
export type {
  BrowsonicConfig,
  BrowsonicEvent,
  // Common types
  EventBatch,
  EventContext,
  UserContext,
  EventLevel,
  EventType,
  SdkState,
  // Critical path (0.3.0)
  CriticalPathOptions,
  // Telemetry types
  TelemetryTimeline,
  ConsoleTelemetryEntry,
  NetworkTelemetryEntry,
  NavigationTelemetryEntry,
  VisitorTelemetryEntry,
  // Sprint 8 M2 — breadcrumb public surface
  Breadcrumb,
  BreadcrumbLevel,
  BreadcrumbTelemetryEntry,
  // Widget types
  WidgetRule,
  WidgetRuleMatch,
  WidgetNotification,
  WidgetSeverity,
  WidgetPosition,
} from './types';

// Telemetry exports
export { createTelemetryStore, type TelemetryStore } from './telemetry';

// Plugin API (1.0)
export type { SdkPlugin, PluginContext } from './plugin';

// Ignore rule utilities - for user convenience
export { COMMON_THIRD_PARTY_PATTERNS, COMMON_IGNORABLE_MESSAGES } from './utils';

// Convenience: default export is the singleton getter
export default getBrowsonic;
