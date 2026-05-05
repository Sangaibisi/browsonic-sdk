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

## 0.2 (shipped 2026-05-04)

- **Pages Router companions.**
  - `browsonicPagesErrorInitialProps(ctx)` — `getInitialProps`
    helper for `pages/_error.tsx`. Captures `ctx.err` to the SDK,
    tags `nextjs.pagePath`, attaches `nextjsStatusCode` /
    `nextjsAsPath` metadata, and returns `{ statusCode, pagePath }`
    for the page component to render.
  - `browsonicPagesAppInit()` — call once from `pages/_app.tsx`'s
    top-level `useEffect`. Wires `window.error` and
    `window.unhandledrejection` listeners that forward to the SDK.
    Returns the teardown so React-Strict / fast-refresh doesn't
    leak duplicate listeners.
- **App Router metadata enrichment.** `BrowsonicErrorPage` now
  accepts optional `pathname` + `params` props. App Router consumers
  thread them in from `usePathname()` / `useParams()` — they land as
  `nextjs.pathname` tag and `nextjs.params` context on the captured
  event. `BrowsonicGlobalErrorPage` forwards the same props through
  the `<html>`/`<body>` shell.

## 0.3 (partial — shipped 2026-05-05)

- **`instrumentation.ts` helper** — shipped 2026-05-05.
  `@browsonic/nextjs/instrumentation` sub-entry exports
  `browsonicInstrumentation(options)` that returns the
  `{ register, onRequestError }` pair Next.js's `instrumentation.ts`
  file convention expects. `register()` validates `apiEndpoint` +
  `appKey` and warns to `console.warn` on missing fields.
  `onRequestError(error, request, context)` forwards the error
  with structured Next.js context (`nextjs.path`,
  `nextjs.routerKind`, `nextjs.routePath`, `nextjs.routeType`,
  etc.) to a configurable report sink. The factory is
  forward-compatible — the entry point is shipped today as a
  console-fallback shim; future versions plug in real
  server-runtime capture without changing the call signature.
  `BROWSONIC_INSTRUMENTATION_VERSION` constant tags the wire-up
  generation. Server-only entry — main `@browsonic/nextjs` bundle
  unaffected.
- **Build-time sourcemap upload** through `withBrowsonicConfig` —
  still deferred until the Sprint 3 / Sprint 4 source-map pipeline
  lands. The wrapper stays a passthrough until then.

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
