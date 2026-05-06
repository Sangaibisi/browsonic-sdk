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

**0.3 Content Collections:**

- `renderContentCollectionMeta({ collection, entry })` — emits a
  build-time `<meta>` tag from a `[slug].astro` page. The runtime
  navigation listener reads it on every after-swap and stamps
  `data.contentCollection: '<collection>/<entry>'` onto the
  breadcrumb. Pages that don't render the meta tag simply omit
  the field.
- `readContentCollectionFromDocument(doc?)` — exported helper that
  the listener uses internally; available for consumers wiring
  custom navigation telemetry.

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
- We don't boot Astro — we exercise the listener factory, integration
  factory, action wrapper, island tagger, and content-collections
  helpers as plain TS against a `document` shim.
- Suite covers view-transitions (incl. intent phase), capture wrappers,
  the integration's `astro:config:setup` hook, action wrapper
  re-throw + tag contract, island scope tagging, and content-
  collection meta read/render.

## Cross-package coordination

Cross-package impacts → single PR across `packages/*`. Cross-repo
impacts (dashboard, landing, build-tools) → coordinate in the
shipping PR description; no separate tracker file.

## Roadmap pointers

- SSR-side error capture is out of scope until `@browsonic/sdk` gains
  a Node runtime target. `withBrowsonicAstroAction` is the current
  bridge — it reports through any reachable browser SDK and
  re-throws cleanly when none is present.
- A build-time auto-injector for `renderContentCollectionMeta` would
  remove the per-page opt-in but requires a transform on every
  `astro:content`-using page; left as a consumer-opt-in convention
  for now.
