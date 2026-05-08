// SPDX-License-Identifier: Apache-2.0

/**
 * Vue 3 application plugin. Install with:
 *
 * ```ts
 * import { createApp } from 'vue';
 * import { browsonicPlugin } from '@browsonic/vue';
 * import { getBrowsonic } from '@browsonic/sdk';
 *
 * const sdk = getBrowsonic();
 * sdk.init({ apiEndpoint: 'https://...' });
 *
 * const app = createApp(App);
 * app.use(browsonicPlugin, { sdk });
 * app.mount('#app');
 * ```
 *
 * What the plugin wires up
 * ------------------------
 * 1. `provide(browsonicInjectionKey, sdk)` — composables resolve via
 *    `inject` first, falling back to the global window singleton.
 * 2. `app.config.errorHandler` chaining — captures errors that escape
 *    component boundaries (or aren't wrapped in one). Calls the
 *    previously-installed handler afterwards so we coexist with other
 *    plugins (Pinia devtools, custom logging) instead of stomping on
 *    them.
 *
 * Defensive contract
 * ------------------
 * - SDK calls are wrapped in try/catch — a thrown `captureError`
 *   cannot crash the host app's error pipeline.
 * - The previous `errorHandler` is invoked even when our reporting
 *   fails. Order: report → user handler → re-throw policy is set by
 *   the SDK config, not the plugin.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { App, Plugin } from 'vue';
import type { Browsonic } from '@browsonic/sdk';
import { browsonicInjectionKey } from './inject-key';
import { resolveSdk } from './resolve-sdk';

export interface BrowsonicVueOptions {
  /**
   * SDK instance to report errors to. When omitted, the plugin tries
   * `window.Browsonic.getBrowsonic()`. If neither is available the
   * plugin still installs but reports become no-ops.
   */
  sdk?: Browsonic;
  /**
   * Whether to chain into `app.config.errorHandler`. Defaults to
   * `true`. Set to `false` if your application explicitly manages its
   * own errorHandler and wants the boundary alone to be the SDK
   * report site.
   */
  chainErrorHandler?: boolean;
}

export const browsonicPlugin: Plugin<[BrowsonicVueOptions?]> = {
  install(app: App, options?: BrowsonicVueOptions) {
    const sdk = options?.sdk ?? resolveSdk();
    const chain = options?.chainErrorHandler ?? true;

    if (sdk) {
      app.provide(browsonicInjectionKey, sdk);
      // Stamp Vue runtime version onto the `vue` context bucket so
      // every event from this app carries it. Feeds the dashboard's
      // VueCard. App-level scope: set once at install time.
      try {
        sdk.setContext('vue', { version: app.version });
      } catch {
        // setContext may be unavailable on very old SDK builds; the
        // adapter's defensive contract is to keep the install path
        // resilient.
      }
    }

    if (chain) {
      const previous = app.config.errorHandler;
      app.config.errorHandler = (err, instance, info) => {
        if (sdk) {
          try {
            const errorObj = err instanceof Error ? err : new Error(String(err));
            // Refresh the `vue` context bucket with the lifecycle
            // hook hint BEFORE capture so it lands on this event.
            try {
              const ctx: Record<string, unknown> = { version: app.version };
              if (typeof info === 'string' && info.length > 0) {
                ctx.errorInfo = info.length > 64 ? info.slice(0, 64) : info;
              }
              // 0.3.1 — pull the component name from the offending
              // ComponentPublicInstance so VueCard can show "where it
              // happened" without the operator having to read the
              // componentStack metadata blob. Mirrors the boundary's
              // existing logic; the plugin path covers errors that
              // skipped a boundary (event handlers, async,
              // out-of-tree throws).
              const componentName =
                (instance as { $options?: { name?: string; __name?: string } } | null)?.$options
                  ?.name ??
                (instance as { $options?: { name?: string; __name?: string } } | null)?.$options
                  ?.__name;
              if (componentName) ctx.componentName = componentName;
              sdk.setContext('vue', ctx);
            } catch {
              // Context failures must not block captureError.
            }
            sdk.captureError(errorObj);
            if (typeof info === 'string' && info.length > 0) {
              sdk.addMetadata('vueErrorInfo', info);
            }
          } catch {
            // Defensive isolation — never break the host's error
            // pipeline because reporting threw.
          }
        }
        try {
          previous?.(err, instance, info);
        } catch {
          // Same contract for the previous handler.
        }
      };
    }
  },
};
