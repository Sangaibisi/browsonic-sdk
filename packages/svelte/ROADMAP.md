# @browsonic/svelte — Roadmap

## 0.1 (this milestone)

- `handleErrorWithBrowsonic` SvelteKit hook factory with optional
  chain handler.
- `subscribeUser` Svelte-store user-context bridge.
- `captureError` / `captureMessage` / `addBreadcrumb` ergonomic
  wrappers.
- `resolveSdk` explicit lookup helper.
- 21+ unit tests (handle-error × 8, user-store × 8, capture × 8).
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2 (partial — shipped 2026-05-04)

- **Navigation breadcrumb instrumentation.** Two surfaces over one
  engine: `instrumentNavigation()` returns an unsubscribe handle
  (call once at app init), and `trackNavigation` is a Svelte action
  wrapping the same engine for `<div use:trackNavigation>` ergonomics.
  History API patches (`pushState`/`replaceState`) are ref-counted so
  multiple callers share one set of patches and the last unsubscribe
  restores the originals. Works without a `@sveltejs/kit` peer dep —
  programmatic `goto()` calls fire via the synthetic
  `browsonic:locationchange` event; back/forward fire via popstate.
- **Pre-typed exports for `App.Error`.** `handleErrorWithBrowsonic`
  is now generic: `handleErrorWithBrowsonic<App.Error>({ ... })`
  returns the consumer's `App.Error` shape so
  `HandleClientError`-typed exports flow through unchanged. Default
  generic stays `BrowsonicHandleErrorReturn` so existing consumers
  keep working.
- **Snippet-friendly fallback for Svelte 5 boundaries** — _deferred_.
  Requires Svelte 5 in the test setup + a snippet-aware helper
  that the build chain doesn't currently support without
  `@vue/compiler-sfc`-style additions. Will land alongside
  Suspense / boundary integration in 0.3.

## 0.3

- **SvelteKit form-action capture** — a wrapper that catches throws
  in `actions: {}` handlers and forwards them.
- **`+error.svelte` integration helper** — boilerplate to attach
  the SDK to the page's error page so unhandled framework errors
  also reach Browsonic.

## Later (parking lot)

- A `.svelte` boundary for Svelte 4 holdouts. Adds the Svelte
  compiler to our build chain — only worth it if Svelte 4 demand
  surfaces.

## Out of scope

- **Server-side rendering capture.** SvelteKit's `hooks.server.ts`
  runs in Node; this adapter is browser-only.
- **Svelte 3 / pre-Composition Svelte.** Svelte 3 is end-of-life; no
  back-port.
