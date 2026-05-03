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

import type { BrowsonicEvent } from '../types';
import type { SdkPlugin, PluginContext } from '../plugin';
import { safeExecute } from '../utils';
import type { Browsonic } from './browsonic';
import { handleEvent } from './event-pipeline';

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
        sdk.debugLog(`Plugin activated: ${plugin.id}`);
      },
      undefined,
      (err) => sdk.debugLog(`Plugin activate error (${plugin.id}):`, err)
    );
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
      (err) => sdk.debugLog(`Plugin deactivate error (${plugin.id}):`, err)
    );
  }
  sdk.pluginEventHandlers = [];
}
