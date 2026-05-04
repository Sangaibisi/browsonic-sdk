// SPDX-License-Identifier: Apache-2.0

/**
 * Core entry — Browsonic SDK without the widget UI / rule engine.
 *
 * Use this entry when you only need error/performance capture and do
 * not plan to render in-app notifications. Widget is a plugin since
 * 1.0 — importing from `./core` plus NOT registering `widgetPlugin()`
 * means tree-shake drops the widget module tree entirely.
 *
 * For a minimal core bundle pair this entry with:
 *   - `trackVisitor: false`
 *   - `captureAsyncStack: false`
 *   - `trackPageViews: false`
 *
 * Full surface (with widget) remains available via the main `.` import.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

// Main SDK class + singleton helpers
export { Browsonic, getBrowsonic, resetBrowsonic } from './sentinel';

// Types
export type {
  BrowsonicConfig,
  BrowsonicEvent,
  EventBatch,
  EventContext,
  UserContext,
  EventLevel,
  EventType,
  SdkState,
  CriticalPathOptions,
  TelemetryTimeline,
  ConsoleTelemetryEntry,
  NetworkTelemetryEntry,
  NavigationTelemetryEntry,
  VisitorTelemetryEntry,
  // Sprint 8 M2 — breadcrumb public surface
  Breadcrumb,
  BreadcrumbLevel,
  BreadcrumbTelemetryEntry,
} from './types';

// Convenience helpers
export { COMMON_THIRD_PARTY_PATTERNS, COMMON_IGNORABLE_MESSAGES } from './utils';

// Plugin API — host apps register plugins (widget, tracing, etc.) here.
export type { SdkPlugin, PluginContext } from './plugin';

// Sprint 8 M3 — transient scope (Sentry-compatible)
export type { Scope } from './sentinel/scope';

// Sprint 9 M2 — session health
export type { SessionHealth } from './sentinel/session-health';

// Sprint 9 M1 — runtime environment guards
export {
  isExtensionContext,
  isBotUserAgent,
  DEFAULT_BOT_PATTERNS,
} from './utils/runtime-environment';

// NOTE: no WidgetRule / WidgetManager exports here — import those
// from `@browsonic/sdk/widget` when you need them.
