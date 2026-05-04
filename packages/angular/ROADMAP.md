# @browsonic/angular — Roadmap

## 0.1 (this milestone)

- `BrowsonicErrorHandler` Angular `ErrorHandler` drop-in.
- `BrowsonicService` injectable wrapper.
- `provideBrowsonic()` standalone provider factory.
- 23+ unit tests.
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2

- **Router instrumentation.** `withRouterInstrumentation()` factory
  that subscribes to `Router.events` and emits navigation
  breadcrumbs.
- **`@Injectable` decorator path.** Optional decorated variant of
  `BrowsonicService` with `providedIn: 'root'` for tree-shake-
  friendly opt-in.
- **Pages / Module-NgModule mode docs.** First-class quickstart
  for non-standalone apps still on Angular 14/15/16.

## 0.3

- **HttpInterceptor companion.** Wrap HttpClient errors via
  `HTTP_INTERCEPTORS` token so failed requests surface as captured
  errors with route + status metadata.
- **Standalone signal integration.** When Angular signals stabilise
  for SDK-style state, mirror the user-context flow as a signal-
  based composable (similar to Vue's `useUser` pattern).

## Later (parking lot)

- SSR / Angular Universal capture path. Currently out of scope
  (server runtime is in the project's intentional non-goals).

## Out of scope

- **Server-side rendering capture.** Angular Universal runs in
  Node; the SDK is browser-only.
- **Angular pre-17 (NgModule-only).** Standalone is the primary
  target. NgModule consumers can still wire the providers in
  `AppModule` providers array — same shape works.
