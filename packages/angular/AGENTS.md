# AGENTS.md — @browsonic/angular

> Operating manual for the Angular adapter. Pair with monorepo
> root `AGENTS.md` and the shared
> `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.3)

**0.1 bootstrap:**

- `BrowsonicErrorHandler` — duck-typed implementation of Angular's
  `ErrorHandler.handleError(error)`. Forwards to `sdk.captureError`,
  optionally falls back to `console.error`.
- `BrowsonicService` — injectable wrapper around the SDK with
  defensive `setUser` / `clearUser` / `captureError` /
  `captureMessage` / `addBreadcrumb` / `setTag` / `getSdk`.
- `provideBrowsonic(options?)` — Angular 17+ standalone provider
  factory. Returns the providers array that registers the two
  classes as singletons. Plain `Provider[]` so it works in
  `AppModule.providers` for pre-standalone consumers too.
- `resolveSdk(explicit?)` — lower-level lookup helper.

**0.2 instrumentation:**

- `installRouterInstrumentation(router, options?)` — subscribes to
  `Router.events`, filters `NavigationEnd` via `urlAfterRedirects`
  structural discriminator, emits `category: 'navigation'`
  breadcrumb. Returns `unsubscribe()` for HMR teardown. Structural
  `RouterLike` / `RouterEventLike` / `ObservableLike` shapes — no
  `@angular/router` runtime dep.

**0.3 HttpClient companion:**

- `createBrowsonicHttpReporter(options?)` — factory returning
  `(request, error) => void` consumers wire into a 5-line
  `HttpInterceptor` class. Filters `ignoreUrls` (string | RegExp) +
  `ignoreStatuses`, tags `<ns>.method` + `<ns>.status`, attaches
  `httpUrl` (truncated 256 chars) + `httpResponseBody`
  (`maxBodyLength: 0` opts out). Coerces non-Error throws into
  `<METHOD> <URL> <status> <statusText>`. Structural
  `HttpRequestLike` / `HttpErrorResponseLike` — no
  `@angular/common/http` or `rxjs` runtime dep.

## Why no `@angular/core` runtime dependency

`@angular/core` is **peer + dev** only — type-only imports are used
in `src/`. The runtime classes don't extend Angular's `ErrorHandler`
or use Angular decorators (`@Injectable()`) because the framework
duck-types both: `useClass` accepts any class with the right shape.
Keeping Angular out of our runtime graph means the package's bundle
is genuinely tiny (~1 KB after gzip) and consumers never see version
conflicts with their own Angular install.

If a future feature genuinely needs the runtime decorator API
(e.g. `@Injectable({ providedIn: 'root' })` for tree-shake-friendly
opt-in), revisit. Until then, the duck-typed approach wins.

## Defensive contract (non-negotiable)

1. **Never crash the host app.** SDK calls in try/catch.
   `BrowsonicErrorHandler.handleError` MUST NEVER throw — Angular's
   error pipeline depends on it being terminal.
2. **Be a no-op when SDK is unreachable.** All service methods
   branch on `if (!sdk) return`.
3. **Preserve `console.error` UX by default.** Angular's default
   `ErrorHandler` logs to `console.error`; our drop-in does the
   same (opt out via `consoleFallback: false`). Migrating apps
   shouldn't lose dev-tools visibility.
4. **Zero runtime dependencies** beyond `@browsonic/sdk` and
   `@angular/core` (both peer; Angular is type-only).

## Test discipline

- Vitest + happy-dom.
- 59 tests across the public surface (error-handler × 7,
  service × 11, provide × 4, router × 9, http-interceptor × 18,
  decorated × 10).
- Tests don't bootstrap Angular — they instantiate the classes
  directly and verify the public contract.

## Change discipline

Cross-package impacts land in a single PR. Cross-repo impacts get
flagged in the monorepo root `AGENTS.md` so dependent repos
(dashboard, landing, services) can sync.
