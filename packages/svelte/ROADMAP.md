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

## 0.2

- **`navigation` breadcrumb action** — `use:trackNavigation` Svelte
  action that emits `addBreadcrumb({ category: 'navigation', ... })`
  on every SvelteKit `afterNavigate`.
- **Snippet-friendly fallback for Svelte 5 boundaries** — a small
  helper that returns a snippet for `{#snippet failed(...)}` blocks
  with a configurable component.
- **Pre-typed exports for `App.Error`** — generic over the
  consumer's `App.Error` shape so `handleErrorWithBrowsonic` returns
  the exact framework type.

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
