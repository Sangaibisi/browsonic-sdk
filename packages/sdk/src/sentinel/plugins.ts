// SPDX-License-Identifier: Apache-2.0

/**
 * Plugin lifecycle plumbing — register, activate, deactivate. The
 * SDK's one extension point. See `src/plugin.ts` for the contract +
 * PluginContext shape. Core bundle never imports a concrete plugin;
 * tree-shake keeps plugin code out of `@browsonic/sdk/core`.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent, PluginHealthSummary } from '../types';
import type { SdkPlugin, PluginContext, Collector } from '../plugin';
import { safeExecute } from '../utils';
import type { Browsonic } from './browsonic';
import { handleEvent } from './event-pipeline';

/**
 * Sprint 2 (gap B1): per-plugin activation timestamps so the health
 * summary can carry a meaningful `activatedAtMs` without forcing
 * plugins to track their own clock. Module-level Map keyed by plugin
 * id; the entry is created during `activatePlugins` and cleared on
 * `deactivatePlugins`.
 */
const pluginActivatedAt = new Map<string, number>();

/** Sprint 2 (gap B1): monotonic error counter per plugin. Incremented
 *  every time an activate / deactivate / event handler call throws.
 *  Read by `collectPluginHealth` and reported on the diagnostics
 *  payload as `PluginHealthSummary.errorCount`. */
const pluginErrorCounts = new Map<string, number>();

function bumpPluginErrors(pluginId: string): void {
  pluginErrorCounts.set(pluginId, (pluginErrorCounts.get(pluginId) ?? 0) + 1);
}

/**
 * Build a per-plugin health snapshot for the diagnostics payload.
 * Plugins that implement the {@link Collector} contract get their
 * `health()` probe called; pure {@link SdkPlugin} entries fall back
 * to `{ ok: true }`. Capped at 50 entries by the diagnostics store.
 *
 * Sprint 2 (gap B1).
 */
export function collectPluginHealth(sdk: Browsonic): PluginHealthSummary[] {
  const out: PluginHealthSummary[] = [];
  for (const plugin of sdk.plugins) {
    let ok = true;
    let detail: string | undefined;
    if (isCollector(plugin) && typeof plugin.health === 'function') {
      try {
        const probe = plugin.health();
        ok = probe.ok;
        detail = probe.detail;
      } catch (err) {
        // A throwing health probe is itself a failure signal.
        ok = false;
        detail = err instanceof Error ? err.message : String(err);
        bumpPluginErrors(plugin.id);
      }
    }
    out.push({
      id: plugin.id,
      ok,
      detail,
      errorCount: pluginErrorCounts.get(plugin.id) ?? 0,
      activatedAtMs: pluginActivatedAt.get(plugin.id) ?? 0,
    });
  }
  return out;
}

function isCollector(plugin: SdkPlugin): plugin is Collector {
  return (plugin as Partial<Collector>).category === 'collector';
}

/**
 * Attach a plugin to the SDK. Must be called before `init()`.
 * Duplicate ids + unsupported `apiVersion` are rejected with a warn.
 */
export function registerPlugin(sdk: Browsonic, plugin: SdkPlugin): void {
  if (sdk.state === 'running' || sdk.state === 'initializing') {
    console.warn(
      `[Browsonic] register(${plugin.id}) ignored — plugins must be registered before init().`
    );
    return;
  }
  if (plugin.apiVersion !== 1) {
    console.error(
      `[Browsonic] plugin "${plugin.id}" requires apiVersion ${plugin.apiVersion}; SDK supports 1.`
    );
    return;
  }
  if (sdk.plugins.some((p) => p.id === plugin.id)) {
    console.warn(`[Browsonic] plugin "${plugin.id}" already registered; ignoring.`);
    return;
  }
  sdk.plugins.push(plugin);
}

/**
 * Call `activate(ctx)` on every registered plugin. Each receives the
 * same narrow context — `config`, `debugLog`, `onEvent`, `emitEvent`,
 * `telemetry`, `getSessionId`. Errors from one plugin do not break
 * the chain; the failure is logged and the next plugin still runs.
 */
export function activatePlugins(sdk: Browsonic): void {
  if (sdk.plugins.length === 0) return;
  const config = sdk.config;
  if (!config) return;

  const ctx: PluginContext = {
    config,
    debugLog: sdk.debugLog,
    onEvent: (handler) => {
      sdk.pluginEventHandlers.push(handler);
      return () => {
        const i = sdk.pluginEventHandlers.indexOf(handler);
        if (i > -1) sdk.pluginEventHandlers.splice(i, 1);
      };
    },
    emitEvent: (partial: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>) => {
      handleEvent(sdk, partial);
    },
    telemetry: sdk.telemetryStore,
    getSessionId: () => sdk.sessionId,
  };

  for (const plugin of sdk.plugins) {
    safeExecute(
      () => {
        plugin.activate(ctx);
        // Sprint 2 (gap B1): stamp activation wall-clock for the
        // health summary surfaced on /v1/diagnostics.
        pluginActivatedAt.set(plugin.id, Date.now());
        sdk.debugLog(`Plugin activated: ${plugin.id}`);
      },
      undefined,
      (err) => {
        bumpPluginErrors(plugin.id);
        sdk.debugLog(`Plugin activate error (${plugin.id}):`, err);
      }
    );
  }

  // Sprint 2 (gap B1): publish the initial plugin-health snapshot to
  // the diagnostics store. Subsequent updates happen on the next
  // diagnostics flush — the reporter pulls a fresh snapshot via
  // `collectPluginHealth` whenever one is requested.
  if (sdk.diagnostics) {
    sdk.diagnostics.setPluginHealth(collectPluginHealth(sdk));
  }
}

/** Reverse-order deactivate on `destroy()`; errors are swallowed. */
export function deactivatePlugins(sdk: Browsonic): void {
  for (let i = sdk.plugins.length - 1; i >= 0; i--) {
    const plugin = sdk.plugins[i];
    safeExecute(
      () => {
        plugin.deactivate();
        sdk.debugLog(`Plugin deactivated: ${plugin.id}`);
      },
      undefined,
      (err) => {
        bumpPluginErrors(plugin.id);
        sdk.debugLog(`Plugin deactivate error (${plugin.id}):`, err);
      }
    );
  }
  sdk.pluginEventHandlers = [];
  // Sprint 2 (gap B1): clear cached activation timestamps so the
  // next init() starts from a clean slate. Error counters persist —
  // they're per-id cumulative and a re-init typically re-uses ids.
  pluginActivatedAt.clear();
  if (sdk.diagnostics) {
    sdk.diagnostics.setPluginHealth([]);
  }
}
