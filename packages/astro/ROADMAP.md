# @browsonic/astro — Roadmap

## 0.1 (this milestone)

- `registerNavigationBreadcrumbs` View Transitions listener.
- `captureError` / `captureMessage` / `addBreadcrumb` standalone
  wrappers.
- `resolveSdk` explicit lookup helper.
- 16+ unit tests (view-transitions × 7, capture × 9).
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2

- **Astro Integration.** `astro add @browsonic/astro` ergonomics —
  auto-injects the `<script>` block for navigation breadcrumbs and
  optionally calls `Browsonic.init()` from a config-supplied
  endpoint.
- **`beforeNavigate` instrumentation.** Capture intent breadcrumbs
  before the swap; pair with `after-swap` for richer trails.
- **Partial hydration awareness.** Detect island hydration boundaries
  and tag captures with the island's component name.

## 0.3

- **Astro Content Collections** breadcrumbs (page-build → page-load
  identity).
- **Astro Actions** error wrapper, mirroring `withBrowsonicRouteHandler`
  in the Next.js adapter.

## Later (parking lot)

- Astro DB error instrumentation if the DB feature stabilises.

## Out of scope

- **Server-side rendering capture.** Astro SSR runs in Node; the
  SDK is browser-only. Wire your own server logging.
- **Per-framework boundaries.** React / Vue / Svelte islands use
  their respective `@browsonic/<framework>` adapter inside the
  island.
