# @browsonic/remix — Roadmap

## 0.1 (this milestone)

- `BrowsonicRouteErrorBoundary` drop-in component.
- `captureRouteError(error)` imperative companion.
- `withBrowsonicRemixAction` wrapper.
- Full re-export of `@browsonic/react` surface.
- 19+ unit tests.
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2 (shipped 2026-05-04)

- **`entry.client.tsx` helper.** `bootstrapBrowsonic(options?)`
  reads any existing `window.Browsonic.config` (so the server-side
  `entry.server.tsx` can serialise per-request fields like
  `release` / `environment`), merges the caller's options on top,
  and returns the SDK singleton if one is reachable. SSR-safe —
  Node calls return `null` without touching globals.
- **Loader instrumentation.** New `withBrowsonicRemixLoader` —
  loader-side counterpart to `withBrowsonicRemixAction`. Both
  wrappers share one engine; the captured event is tagged
  `remix.handler: 'action' | 'loader'` so dashboards can
  distinguish data-fetch errors from mutation errors. Legacy
  `remixAction` / new `remixLoader` metadata keys preserved for
  back-compat.
- **vite + `@remix-run/react` parity.** None of the helpers
  import from a runtime-Remix module, so both Remix v2 modes
  (vite-based + legacy `@remix-run/react`) work without a code
  branch. The adapter stays peer-only on `@remix-run/*` types.

## 0.3 (partial — shipped 2026-05-05)

- **Route hierarchy breadcrumbs** — shipped 2026-05-05.
  `useRemixNavigationBreadcrumbs(useNavigation(), useMatches())`
  emits a `category: 'navigation'` breadcrumb each time the
  Remix navigation state transitions from non-`idle` → `'idle'`.
  Each breadcrumb carries `from` / `to` paths plus the route
  hierarchy: `routeId` (leaf) and `routeChain` (parent → leaf
  joined with ›). This makes URLs that look identical across
  shells distinguishable in incident triage. Default skips the
  initial transition, treats `submitting → idle` as a navigation
  (form actions). Structural `NavigationLike` / `MatchLike` shapes
  keep the adapter free of a `@remix-run/react` runtime dep.
- **`<RemoteCatch>` integration.** Pre-Remix-v2 `CatchBoundary` is
  going away; if community demand surfaces, ship a back-port
  helper.

## Later (parking lot)

- Edge runtime support — currently out of scope (multi-runtime is
  in the project's intentional non-goals).

## Out of scope

- **Server-runtime capture.** Remix actions / loaders run in Node
  / Edge; the SDK is browser-only.
- **Auto-injection of the SDK script.** Consumers add the init
  manually to `entry.client.tsx`.
