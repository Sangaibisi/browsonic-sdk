# @browsonic/astro — Roadmap

## 0.1 (this milestone)

- `registerNavigationBreadcrumbs` View Transitions listener.
- `captureError` / `captureMessage` / `addBreadcrumb` standalone
  wrappers.
- `resolveSdk` explicit lookup helper.
- 16+ unit tests (view-transitions × 7, capture × 9).
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2 (partial — shipped 2026-05-04)

- **Astro Integration.** Default export of
  `@browsonic/astro/integration` returning an `AstroIntegrationLike`
  that hooks `astro:config:setup` → `injectScript('page', …)` to
  auto-wire `registerNavigationBreadcrumbs()` on every page. When
  `apiEndpoint`/`appKey`/`environment` are passed, also injects a
  `window.Browsonic.config = { ... }` snippet that the SDK picks up
  at init. Structural Astro types — adapter stays peer-only.
- **Intent breadcrumbs.** `registerNavigationBreadcrumbs({ includeIntent: true })`
  also subscribes to `astro:before-preparation`. Intent-phase
  breadcrumb tags `data.phase: 'intent'`; the existing after-swap
  breadcrumb tags `data.phase: 'completed'` so the dashboard
  renderer can group / de-dupe per phase.
- **Partial hydration awareness** — _deferred to 0.3_. A clean
  cross-adapter island-name tag requires inter-adapter coordination
  (the React/Vue/Svelte adapters would need to know they're inside
  an Astro island). Ship as a standalone helper once the API shape
  is settled.

## 0.3 (partial — shipped 2026-05-05)

- **Astro Actions error wrapper** — shipped 2026-05-05.
  `withBrowsonicAstroAction(handler, options?)` wraps a server-side
  action handler so unhandled throws are reported (with
  `astro.action.name` + `astro.runtime: 'action'` tags) and **then
  re-thrown** so Astro returns the failure unchanged. Re-throw
  order matters — consuming the error here would mask every
  reported failure as a successful return value. Generic over the
  handler's arg tuple so it composes with Astro's typed
  `defineAction({ handler })` and any `(input, context)` shape.
  SDK isolation: a thrown reporter cannot poison the re-throw
  path. Mirrors `withBrowsonicRouteHandler` in the Next.js
  adapter.
- **Partial hydration awareness** — shipped 2026-05-05.
  `tagAsAstroIsland(name, options?)` stamps `astro.island = <name>`
  on the SDK's active scope. Any subsequent `captureError` from a
  per-framework boundary (React / Vue / Svelte) inside that island
  inherits the tag automatically — `setTag` is sticky on the SDK's
  top-level scope, so no cross-adapter coordination is needed.
  Browser-only short-circuit on SSR; defensive try/catch keeps a
  thrown `setTag` from unmounting the island. Custom `tagKey`
  override for multi-dimension setups (e.g. `astro.island.role`).
- **Astro Content Collections** breadcrumbs (page-build → page-load
  identity).

## Later (parking lot)

- Astro DB error instrumentation if the DB feature stabilises.

## Out of scope

- **Server-side rendering capture.** Astro SSR runs in Node; the
  SDK is browser-only. Wire your own server logging.
- **Per-framework boundaries.** React / Vue / Svelte islands use
  their respective `@browsonic/<framework>` adapter inside the
  island.
