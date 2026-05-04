# @browsonic/remix — Roadmap

## 0.1 (this milestone)

- `BrowsonicRouteErrorBoundary` drop-in component.
- `captureRouteError(error)` imperative companion.
- `withBrowsonicRemixAction` wrapper.
- Full re-export of `@browsonic/react` surface.
- 19+ unit tests.
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2

- **`entry.client.tsx` helper** — `bootstrapBrowsonic({ apiEndpoint })`
  that reads from `<script>window.__browsonic = {…}</script>`
  injected by the server, initialises the SDK, and exposes the
  singleton.
- **Loader instrumentation** — wrap loaders too, not just actions.
  The semantic is identical, but consumers who care can opt in
  per-route.
- **Pages-Router-equivalent companion** — Remix v2 supports both
  the new `vite-based` and the legacy `@remix-run/react` modes;
  cover the legacy variant too.

## 0.3

- **Route hierarchy breadcrumbs.** Subscribe to `useNavigation`
  and emit `category: 'navigation'` breadcrumbs with the route
  hierarchy path, not just the URL.
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
