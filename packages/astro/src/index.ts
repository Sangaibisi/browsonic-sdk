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
 * Public surface (0.1):
 * - `registerNavigationBreadcrumbs` — `astro:after-swap` listener
 *   that emits a navigation breadcrumb on every View Transitions
 *   navigation.
 * - `captureError` / `captureMessage` / `addBreadcrumb` — ergonomic
 *   wrappers around the global SDK singleton.
 * - `resolveSdk` — explicit lookup helper.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export {
  registerNavigationBreadcrumbs,
  type RegisterNavigationBreadcrumbsOptions,
} from './view-transitions';
export { captureError, captureMessage, addBreadcrumb } from './capture';
export { resolveSdk } from './resolve-sdk';
