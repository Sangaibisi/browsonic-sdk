// SPDX-License-Identifier: Apache-2.0

/**
 * Astro Integration auto-injection. Drop into `astro.config.mjs`:
 *
 * ```js
 * import browsonic from '@browsonic/astro/integration';
 * export default defineConfig({
 *   integrations: [
 *     browsonic({
 *       apiEndpoint: 'https://your-ingest.example/v1/events',
 *       appKey: 'astro-site',
 *       includeIntent: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * The integration uses Astro's `astro:config:setup` hook to inject a
 * tiny `<script>` block on every page that:
 *   - sets `window.Browsonic.config = { apiEndpoint, appKey, ... }`
 *     (when `apiEndpoint` is supplied), and
 *   - calls `registerNavigationBreadcrumbs()` so View Transitions
 *     navigation lands as breadcrumbs without per-layout wiring.
 *
 * The injected snippet is the bootstrap shape, NOT the full SDK.
 * Consumers still need to load `@browsonic/sdk` separately (UMD
 * `<script async>` or ESM import) — the integration just makes the
 * navigation hookup zero-touch.
 *
 * Why a structural `AstroIntegrationLike` instead of importing
 * `AstroIntegration` from `astro`: the adapter does not bundle Astro
 * (peer-only). The shape below covers the `astro:config:setup` hook
 * fields we use; an `AstroIntegration` from any Astro 4.x+ runtime
 * conforms.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/** Stage at which the script is injected. Astro 4+ supports these. */
export type InjectScriptStage = 'page' | 'page-ssr' | 'before-hydration';

/**
 * Subset of Astro's `astro:config:setup` callback params we use.
 */
export interface AstroConfigSetupParamsLike {
  injectScript: (stage: InjectScriptStage, code: string) => void;
}

/**
 * Subset of Astro's `AstroIntegration` we emit. The full type carries
 * many more optional hooks; we only touch `astro:config:setup`.
 */
export interface AstroIntegrationLike {
  name: string;
  hooks: {
    'astro:config:setup': (params: AstroConfigSetupParamsLike) => void;
  };
}

/**
 * Browsonic SDK config shape consumers can pass to the integration.
 * Mirrors a subset of `BrowsonicConfig` from `@browsonic/sdk`. The
 * integration only writes these onto `window.Browsonic.config` —
 * the SDK reads them at init time. Everything is optional; pass
 * nothing and the integration just wires navigation breadcrumbs.
 */
export interface BrowsonicAstroIntegrationOptions {
  /**
   * Backend ingest URL. When supplied, the integration emits a
   * `window.Browsonic.config = { apiEndpoint, ... }` snippet so the
   * SDK auto-loader picks it up on init. Omit if your app already
   * sets the config inline.
   */
  apiEndpoint?: string;
  /** Application key. Optional; pairs with `apiEndpoint`. */
  appKey?: string;
  /** Environment label (`'production'`, `'staging'`, …). Optional. */
  environment?: string;
  /**
   * Pass-through for `registerNavigationBreadcrumbs({ includeIntent })`.
   * Default `false`; flip to `true` to also emit the intent-phase
   * breadcrumb on `astro:before-preparation`.
   */
  includeIntent?: boolean;
  /**
   * When set to `false`, the integration injects only the config
   * snippet and skips the navigation hookup. Useful when the host
   * already calls `registerNavigationBreadcrumbs()` itself with
   * custom options. Default `true`.
   */
  registerNavigation?: boolean;
}

/**
 * The default export — a factory returning the integration object
 * that Astro consumes. Suggested import shape mirrors how `@sentry/astro`
 * does it.
 */
export default function browsonicIntegration(
  options: BrowsonicAstroIntegrationOptions = {},
): AstroIntegrationLike {
  const registerNavigation = options.registerNavigation ?? true;

  return {
    name: '@browsonic/astro',
    hooks: {
      'astro:config:setup': ({ injectScript }) => {
        // Config snippet (only emitted when an apiEndpoint is supplied
        // — otherwise we'd risk overwriting an inline config the host
        // already set in their layout).
        if (options.apiEndpoint) {
          const configPayload = {
            apiEndpoint: options.apiEndpoint,
            ...(options.appKey ? { appKey: options.appKey } : {}),
            ...(options.environment ? { environment: options.environment } : {}),
          };
          // The snippet is intentionally tiny and forward-compatible:
          // future SDK versions can read additional fields from
          // `window.Browsonic.config` without a code change here.
          injectScript(
            'page',
            `window.Browsonic = window.Browsonic || {}; window.Browsonic.config = Object.assign({}, window.Browsonic.config, ${JSON.stringify(configPayload)});`,
          );
        }

        if (registerNavigation) {
          const includeIntent = options.includeIntent === true;
          // The dynamic import keeps the bundle off the critical path
          // — Astro tree-shakes the navigation-breadcrumbs entry into
          // its own chunk that loads alongside the layout's first
          // paint, not before.
          injectScript(
            'page',
            `import('@browsonic/astro').then((m) => m.registerNavigationBreadcrumbs(${JSON.stringify({ includeIntent })}));`,
          );
        }
      },
    },
  };
}
