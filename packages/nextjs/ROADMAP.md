# @browsonic/nextjs — Roadmap

## 0.1 (this milestone)

- `BrowsonicErrorPage` / `BrowsonicGlobalErrorPage` drop-in
  components for `app/error.tsx` and `app/global-error.tsx`.
- `withBrowsonicRouteHandler` for `app/api/*/route.ts`.
- `withBrowsonicConfig` config wrapper (passthrough; reserved for
  future build-time integrations).
- Full re-export of `@browsonic/react` surface.
- 19+ unit tests (error-page × 8, route-handler × 7, with-browsonic
  × 4).
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2

- **Pages Router companions.** `_error.tsx` / `_app.tsx` drop-ins
  for consumers still on Pages Router (Next.js 14/15 still ship
  it).
- **App Router metadata enrichment.** Capture rendered route
  segment + dynamic params alongside the error.

## 0.3

- **Build-time sourcemap upload** through `withBrowsonicConfig` —
  unblocked once the deferred Sprint 3 / Sprint 4 source-map
  pipeline lands.
- **`instrumentation.ts` auto-registration** — generate a stub for
  consumers who want zero-touch SDK init.

## Later (parking lot)

- Edge runtime adapter — depends on the SDK gaining an Edge build
  target. Currently out of scope (multi-runtime is in the project's
  intentional non-goals).

## Out of scope

- **Server-runtime telemetry.** The SDK is a browser library;
  Next.js server-rendered errors fall through to the host's own
  logging. The route-handler wrapper opportunistically reports if a
  browser SDK is reachable but does not attempt Node-side capture.
- **Pages Router data layer instrumentation** (`getServerSideProps`
  / `getStaticProps`). Will be revisited only if Pages Router
  consumer demand surfaces.
