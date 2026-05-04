// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/astro` — Astro adapter for `@browsonic/sdk`.
 *
 * Astro's runtime is multi-framework on the client (React + Vue +
 * Svelte islands all coexist in the same project), so this adapter
 * intentionally stays small: View Transitions instrumentation and
 * standalone capture wrappers. For component-framework boundaries,
 * use the corresponding adapter (`@browsonic/react`, `@browsonic/vue`,
 * `@browsonic/svelte`) inside that island.
 *
 * Public surface:
 *
 * 0.1 — bootstrap:
 * - `registerNavigationBreadcrumbs` — `astro:after-swap` listener
 *   that emits a navigation breadcrumb on every View Transitions
 *   navigation.
 * - `captureError` / `captureMessage` / `addBreadcrumb` — ergonomic
 *   wrappers around the global SDK singleton.
 * - `resolveSdk` — explicit lookup helper.
 *
 * 0.2 — integration + intent:
 * - Default export of `@browsonic/astro/integration` — Astro
 *   integration that auto-injects the navigation hookup (and
 *   optionally `window.Browsonic.config`) on every page via
 *   `astro:config:setup` → `injectScript`.
 * - `registerNavigationBreadcrumbs({ includeIntent: true })` also
 *   subscribes to `astro:before-preparation` for an "intent" phase
 *   breadcrumb alongside the existing after-swap breadcrumb.
 *
 * 0.3 — Astro Actions + Islands awareness:
 * - `withBrowsonicAstroAction(handler, options?)` — wraps a
 *   server-side action handler so unhandled throws are reported
 *   (with `astro.action.name` + `astro.runtime: 'action'` tags)
 *   and **then re-thrown** so Astro returns the failure
 *   unchanged. Mirrors the Next.js adapter's
 *   `withBrowsonicRouteHandler`.
 * - `tagAsAstroIsland(name, options?)` — stamps `astro.island =
 *   <name>` on the SDK's active scope so any subsequent captured
 *   event (from the React/Vue/Svelte adapter inside that island)
 *   carries the island name as a filterable tag. Cross-adapter
 *   coordination is implicit — `setTag` is sticky on the SDK
 *   scope.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export {
  registerNavigationBreadcrumbs,
  type RegisterNavigationBreadcrumbsOptions,
} from './view-transitions';
export { captureError, captureMessage, addBreadcrumb } from './capture';
export { withBrowsonicAstroAction, type WithBrowsonicAstroActionOptions } from './actions';
export { tagAsAstroIsland, type TagAsAstroIslandOptions } from './island';
export { resolveSdk } from './resolve-sdk';
// Re-export the integration's default + named types so consumers can
// `import browsonic from '@browsonic/astro'` if they prefer the
// short import; the canonical entry-point is still
// `@browsonic/astro/integration` per the integration's docstring.
export {
  default as browsonicIntegration,
  type BrowsonicAstroIntegrationOptions,
  type AstroIntegrationLike,
  type AstroConfigSetupParamsLike,
  type InjectScriptStage,
} from './integration';
