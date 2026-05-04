# @browsonic/angular — Roadmap

## 0.1 (this milestone)

- `BrowsonicErrorHandler` Angular `ErrorHandler` drop-in.
- `BrowsonicService` injectable wrapper.
- `provideBrowsonic()` standalone provider factory.
- 23+ unit tests.
- Apache-2.0, npm provenance, CycloneDX SBOM via the monorepo
  release pipeline.

## 0.2 (partial — shipped 2026-05-04)

- **Router instrumentation.** `installRouterInstrumentation(router, options?)`
  subscribes to a `RouterLike.events` Observable, filters for
  NavigationEnd via the `urlAfterRedirects` structural discriminator,
  and emits a `category: 'navigation'` breadcrumb (with optional
  `trigger: 'imperative' | 'popstate' | 'hashchange'` data). Returns
  an unsubscribe handle that calls the upstream
  `Subscription.unsubscribe()` for HMR-friendly teardown. Pure-TS
  structural Router shape — `@angular/router` stays peer-only,
  matches the rest of the adapter's no-runtime-Angular contract.
- **`@Injectable` decorator path** — _deferred to 0.3_. Adding
  `@Injectable({ providedIn: 'root' })` would force `@angular/core`
  into our runtime graph, breaking the type-only-import contract
  documented in `provide.ts`. Re-evaluate when we ship a separate
  `@browsonic/angular/decorated` entry-point that DOES depend on
  `@angular/core`, so consumers can opt in.
- **Pages / Module-NgModule mode docs** — _deferred_. Adding the
  README quickstart needs example NgModule wiring; covered in 0.3
  alongside the HttpInterceptor companion.

## 0.3 (partial — shipped 2026-05-05)

- **HttpInterceptor companion** — shipped 2026-05-05.
  `createBrowsonicHttpReporter(options?)` ships the SDK side as a
  reporter factory: returns `(request, error) => void` that
  consumers call from inside their own 5-line `HttpInterceptor`
  class. The reporter:
  - Filters out URLs / statuses (`ignoreUrls` accepts `string` or
    `RegExp`; `ignoreStatuses` accepts numeric codes).
  - Tags the active scope with `angular.http.method` /
    `angular.http.status` (override namespace via `tagNamespace`).
  - Attaches `httpUrl` + truncated `httpResponseBody` metadata
    (`maxBodyLength` cap, `0` to skip body capture entirely).
  - Coerces non-Error throws into a synthesised
    `<METHOD> <URL> <status> <statusText>` Error.
  - Defensive isolation — a thrown SDK call cannot propagate into
    the interceptor's `catchError` re-throw path.

  Wire-up is intentionally consumer-owned so this adapter stays
  peer-only on `@angular/common/http` and `rxjs`. README example
  shows the interceptor class shape.

- **`@Injectable` decorator path** in a separate
  `@browsonic/angular/decorated` entry-point.
- **Pages / Module-NgModule quickstart** in README.
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
