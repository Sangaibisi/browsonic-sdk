# AGENTS.md — @browsonic/angular

> Operating manual for the Angular adapter. Pair with monorepo
> root `AGENTS.md` and the shared
> `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.1)

- `BrowsonicErrorHandler` — duck-typed implementation of Angular's
  `ErrorHandler.handleError(error)`. Forwards to `sdk.captureError`,
  optionally falls back to `console.error`.
- `BrowsonicService` — injectable wrapper around the SDK with
  defensive `setUser` / `clearUser` / `captureError` /
  `captureMessage` / `addBreadcrumb` / `setTag` / `getSdk`.
- `provideBrowsonic(options?)` — Angular 17+ standalone provider
  factory. Returns the providers array that registers the two
  classes as singletons.
- `resolveSdk(explicit?)` — lower-level lookup helper.

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

## Why no Router instrumentation in 0.1

Router instrumentation requires `Router` to be injected, which
needs Angular's DI runtime active. That's straightforward in a
host app but adds another peer dep boundary to test. 0.1 scope
focuses on the universal three primitives (handler / service /
factory). 0.2 adds `withRouterInstrumentation()`.

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
- 23+ tests (error-handler × 7, service × 11, provide × 5).
- Tests don't bootstrap Angular — they instantiate the classes
  directly and verify the public contract.

## Sprint discipline

Sprint 10. Cross-package impacts → single PR. Cross-repo impacts →
top-level `docs/sprint-tracking/CROSS_REPO_IMPACTS.md`.
