# @browsonic/nextjs — Roadmap

## 0.3 (remaining)

- **Build-time sourcemap upload** through `withBrowsonicConfig` —
  deferred until the source-map pipeline backend polish lands.
  The wrapper stays a passthrough until then.

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
