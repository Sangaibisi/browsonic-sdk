# @browsonic/svelte — Roadmap

## Deferred

- **Snippet-friendly fallback for Svelte 5 boundaries.** Requires
  Svelte 5 in the test setup + a snippet-aware helper that the
  build chain doesn't currently support without
  `@vue/compiler-sfc`-style additions. Will land alongside
  Suspense / boundary integration.

## Later (parking lot)

- A `.svelte` boundary for Svelte 4 holdouts. Adds the Svelte
  compiler to our build chain — only worth it if Svelte 4 demand
  surfaces.

## Out of scope

- **Server-side rendering capture.** SvelteKit's `hooks.server.ts`
  runs in Node; this adapter is browser-only.
- **Svelte 3 / pre-Composition Svelte.** Svelte 3 is end-of-life; no
  back-port.
