# AGENTS.md — @browsonic/astro

> Operating manual for the Astro adapter. Pair with monorepo root
> `AGENTS.md` and the shared
> `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.3)

**0.1 bootstrap:**

- `registerNavigationBreadcrumbs(options?)` — `astro:after-swap`
  listener that emits a navigation breadcrumb on every View
  Transitions navigation. Returns unsubscribe handle.
- `captureError` / `captureMessage` / `addBreadcrumb` — standalone
  wrappers around the global SDK singleton.
- `resolveSdk(explicit?)` — lower-level lookup.

**0.2 integration + intent:**

- Default export of `@browsonic/astro/integration` — Astro
  Integration that auto-injects the navigation hookup (and
  optionally `window.Browsonic.config`) on every page via
  `astro:config:setup` → `injectScript('page', …)`. Structural
  Astro types — adapter stays peer-only.
- `registerNavigationBreadcrumbs({ includeIntent: true })` —
  also subscribes to `astro:before-preparation` for an intent
  breadcrumb (`data.phase: 'intent'`); after-swap breadcrumb
  gets `data.phase: 'completed'`.

**0.3 Actions + Islands:**

- `withBrowsonicAstroAction(handler, options?)` — wraps a
  server-side action handler; reports on throw + re-throws so
  Astro's error path runs unchanged. Tags
  `astro.action.name` + `astro.runtime: 'action'`. Generic over
  the handler's arg tuple so it composes with `defineAction`.
- `tagAsAstroIsland(name, options?)` — stamps `astro.island =
<name>` on the SDK's active scope. Sticky on top-level scope,
  so per-framework boundaries inside the island automatically
  inherit the tag on their captured events.

**0.3 (deferred):**

- Astro Content Collections breadcrumbs — needs upstream API
  alignment for the page-build → page-load identity bridge.

## Divergences from ADAPTER_TEMPLATE

- **No boundary component.** Astro runs multiple frameworks on
  the client (React + Vue + Svelte islands coexist); per-framework
  boundaries belong in the framework's own adapter. The Astro
  package's job is the shared client instrumentation that doesn't
  live in any one framework adapter.
- **No `.astro` components shipped.** Pure TS — keeps the build
  chain at `tsc` × 3, no Astro compiler in the package's build
  pipeline. Consumers add a `<script>` block to their layout.

## Defensive contract (non-negotiable)

1. **Never crash the host app.** All SDK calls in try/catch; the
   View Transitions listener swallows reporter throws.
2. **Server-context safe.** `typeof document === 'undefined'` short-
   circuits `registerNavigationBreadcrumbs`. The Astro build runs
   in Node; importing this module at build time must not throw.
3. **Zero runtime dependencies** beyond `@browsonic/sdk` and
   `astro` (peer).

## Test discipline

- Vitest + happy-dom.
- 17+ tests (view-transitions × 7, capture × 9 + extras).
- We don't boot Astro — we exercise the listener factory + capture
  wrappers as plain TS against a `document` shim.

## Sprint discipline

Sprint 7. Cross-package impacts → single PR. Cross-repo impacts →
top-level `docs/sprint-tracking/CROSS_REPO_IMPACTS.md`.

## Roadmap pointers

- 0.2: Astro Integration that auto-injects the `<script>` block
  for `registerNavigationBreadcrumbs` — `astro add @browsonic/astro`
  ergonomics.
- 0.3: SSR-side error capture if the SDK gains a Node build target
  (currently out of scope per project's intentional non-goals).
