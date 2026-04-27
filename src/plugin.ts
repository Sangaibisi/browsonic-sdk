/**
 * SDK Plugin architecture.
 *
 * A plugin is a self-contained extension that the host app registers
 * explicitly — e.g. the notification widget, an OTel tracing exporter,
 * a session replay recorder. The core SDK never imports plugins directly;
 * this keeps the core bundle small and tree-shake-friendly (see the
 * `./core` entry — core bundle hedef ≤ 8 KB gzip, PERFORMANS-STRATEJISI §1).
 *
 * Lifecycle:
 *   1. `new Browsonic()` or `getBrowsonic()` constructs the instance.
 *   2. `sdk.register(plugin)` — before `init()` — adds the plugin to the
 *      activation list. Must be called synchronously, cannot be added
 *      mid-session.
 *   3. `sdk.init(config)` validates + starts async bootstrap.
 *   4. During bootstrap (idle-scheduled), plugins are activated in
 *      registration order via `plugin.activate(ctx)`.
 *   5. On `sdk.destroy()`, `plugin.deactivate()` is called in reverse order.
 *
 * The plugin receives a narrow `PluginContext` — only the APIs it needs,
 * never direct access to internals. This lets us evolve the SDK internals
 * (e.g. rename queue, refactor state) without breaking plugins.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { BrowsonicEvent, ResolvedConfig } from './types';
import type { TelemetryStore } from './telemetry';

/**
 * Context passed to every plugin at activation time.
 * Narrow on purpose — we want plugins to couple to a contract, not to
 * internal state.
 */
export interface PluginContext {
  /** Resolved runtime config (post-defaults). Read-only for plugins. */
  readonly config: ResolvedConfig;

  /** Debug logger bound to the SDK's `debug` config flag. */
  readonly debugLog: (message: string, ...args: unknown[]) => void;

  /**
   * Event inspection hook — called for every event that passes the
   * ignore/onError gates, BEFORE it enters the queue. Plugins can
   * observe events but MUST NOT mutate them. Return value is ignored.
   *
   * The returned unsubscribe function is optional but plugins SHOULD
   * hold on to it and call it in `deactivate()` to avoid leaks when
   * the SDK re-initializes.
   */
  onEvent(handler: (event: BrowsonicEvent) => void): () => void;

  /**
   * Emit a manual event through the normal SDK pipeline. Useful for
   * plugins that generate SDK events from their own observation sources
   * (e.g. a Web Vitals plugin emitting `web_vital` events).
   */
  emitEvent(partial: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>): void;

  /**
   * Shared telemetry breadcrumb store. Collector-style plugins push
   * category-scoped entries here (`console` / `network` / `navigation` /
   * `visitor`). The store is paused automatically during Critical Path
   * when `suspendTelemetry` is set, so plugins can call `add()` without
   * their own gating — it becomes a no-op in that mode.
   *
   * Null only if the SDK never reached `running` (init failure / destroy
   * race). Plugins MUST check for null before every call.
   */
  readonly telemetry: TelemetryStore | null;

  /**
   * Current SDK session id. Stable for the lifetime of a browsing session
   * (tab), reset on `destroy() + init()`. Used by pageview/beacon plugins
   * that need to correlate events on the backend.
   */
  getSessionId(): string;
}

/**
 * SDK plugin contract.
 *
 * Plugins must be idempotent — `activate` can be called after a
 * previous `deactivate` on the same instance (e.g. `destroy()` then
 * `init()` again). Multiple `activate` calls without intervening
 * `deactivate` are a bug in the caller; plugins MAY throw in that case.
 */
export interface SdkPlugin {
  /** Human-readable id; shown in debug logs + diagnostics. */
  readonly id: string;

  /** SDK plugin API version this plugin is built against. Must equal 1. */
  readonly apiVersion: 1;

  /** Called during SDK bootstrap. Must not throw; errors are logged + swallowed. */
  activate(ctx: PluginContext): void;

  /** Called on `sdk.destroy()`. Cleanup listeners/timers/DOM nodes. */
  deactivate(): void;
}

/**
 * Collector — a plugin category for modules that capture browser-side
 * events (errors, network, user interactions). Used by the upcoming
 * diagnostics endpoint (Sprint 10) to distinguish telemetry producers
 * from UX / export plugins and surface per-collector health.
 *
 * Implementation is opt-in: default-plugin wrappers may implement this
 * interface for richer diagnostics, but the base `SdkPlugin` contract
 * is still sufficient for the runtime.
 */
export interface Collector extends SdkPlugin {
  readonly category: 'collector';

  /** Mirror of the underlying collector factory's `isInstalled()`. */
  isInstalled(): boolean;

  /**
   * Optional health probe — allows diagnostics to report "xhr plugin
   * active but the page has no XHR traffic after 60 s" etc. Returning
   * `{ ok: false, detail }` marks the collector as degraded in the
   * diagnostics UI; it does not affect runtime.
   */
  health?(): { ok: boolean; detail?: string };
}
