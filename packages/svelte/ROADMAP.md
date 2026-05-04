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

## 0.3 (shipped 2026-05-05)

- **SvelteKit form-action capture** — shipped 2026-05-05.
  `withBrowsonicAction(handler, options?)` wraps an `actions: {}`
  handler so unhandled throws are captured (with `sveltekit.action.name`
  / `sveltekit.action.method` tags + `sveltekitPath` metadata) and
  **then re-thrown** so SvelteKit returns the action's failure to
  the client unchanged. Structural `ActionEventLike` shape — no
  `@sveltejs/kit` peerDep. SDK isolation: a thrown reporter cannot
  mask the original error in the re-throw path.
- **`+error.svelte` integration helper** — shipped 2026-05-05.
  `reportErrorPage(error, { status, pathname, sdk?, tagNamespace? })`
  is a one-shot, idempotent capture for the page's `<script>`
  block. Reference-keyed de-dupe via module-scope WeakSet so a
  reactive `$:` binding doesn't re-report on every store tick.
  Browser-only — SSR and "no SDK reachable" cases short-circuit
  to `false` so the helper is safe to call unconditionally.

## Later (parking lot)

- A `.svelte` boundary for Svelte 4 holdouts. Adds the Svelte
  compiler to our build chain — only worth it if Svelte 4 demand
  surfaces.

## Out of scope

- **Server-side rendering capture.** SvelteKit's `hooks.server.ts`
  runs in Node; this adapter is browser-only.
- **Svelte 3 / pre-Composition Svelte.** Svelte 3 is end-of-life; no
  back-port.
