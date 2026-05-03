# AGENTS.md — @browsonic/vue

> Operating manual for AI coding agents and humans editing the Vue
> adapter. Pair this file with the monorepo root `AGENTS.md` and the
> shared `packages/react/docs/ADAPTER_TEMPLATE.md` checklist — the
> root file covers cross-package rules, the template covers what
> every adapter must do, this file covers the Vue-specific bits.

## Public API surface (0.1)

- `browsonicPlugin` — `app.use(browsonicPlugin, { sdk?, chainErrorHandler? })`.
- `BrowsonicErrorBoundary` — Vue 3 component built with `defineComponent`
  - `setup()` + `onErrorCaptured`. No `.vue` SFC; pure TypeScript render
    function so the build pipeline stays `tsc`-only (no
    `@vue/compiler-sfc`).
- `useBrowsonic()` / `useUser()` / `useCaptureError()` — composables,
  mirror the React adapter's hook names so docs translate one-to-one.
- `browsonicInjectionKey` — `InjectionKey<Browsonic>` for hand-rolled
  DI.

## Defensive contract (non-negotiable)

Every adapter MUST:

1. **Never crash the host app.** SDK calls wrapped in `try / catch`.
   Fallback still renders, composables still resolve, plugin still
   installs.
2. **Be a no-op when SDK is unreachable.** `useBrowsonic()` returns
   `null` when neither `inject` nor `window.Browsonic.getBrowsonic()`
   resolves; downstream code branches on `if (!sdk) return`.
3. **Truncate component stack to 1024 chars** before forwarding to
   `sdk.addMetadata('componentStack', ...)`.
4. **Zero runtime dependencies** beyond `@browsonic/sdk` and `vue`
   (both peer deps). Anything else lives in the SDK or is a devDep
   (testing).

## Why `errorCaptured` returns `false`

Vue's `errorCaptured` propagation is opt-out: returning a non-`false`
value lets the error bubble to ancestor `errorCaptured` hooks AND
`app.config.errorHandler`. Returning `false` keeps the boundary
authoritative for that subtree — same semantic as React's
`componentDidCatch` (which is implicit; React always stops
propagation at the boundary).

We chose `false` so that wrapping a subtree in a boundary means the
SDK reports the error exactly once, regardless of how many nested
plugins also handle errors. If a host wants the error to also reach
their own `errorHandler`, they pass `onError` and re-emit from there.

## Why no Vue SFC

The boundary is implemented as a TS render function, not a `.vue`
SFC, so the build chain stays `tsc` + `tsc` + `tsc` (esm/cjs/types) —
no `@vue/compiler-sfc` step. SFCs ship as `.vue` files in
publishable packages would also force consumers' bundlers to load
the SFC compiler at build time; render functions don't.

If a future feature genuinely needs SFC ergonomics (e.g. CSS
scoping for a built-in default fallback), revisit and add the
compiler then. Until then, don't add `.vue` files.

## Test discipline

- Vitest one-shot is the gate; coverage thresholds 80/70/80/80.
- `@testing-library/vue` for component rendering + effects.
- `happy-dom` runtime — same as `@browsonic/sdk` and
  `@browsonic/react`.
- Each public primitive has a test for: happy path, SDK-unreachable
  fallthrough, SDK-throws-inside-method defensive isolation, reset
  / clear path where applicable.

## Sprint discipline

This adapter's work is tracked in
[`docs/sprint-tracking/SPRINT_PLAN.md`](../../docs/sprint-tracking/SPRINT_PLAN.md)
under Sprint 6. Cross-package impacts (SDK API change forces
adapter rev) become a single PR touching both packages. Cross-repo
impacts (service tolerance, dashboard fields) go in
[`docs/sprint-tracking/CROSS_REPO_IMPACTS.md`](../../docs/sprint-tracking/CROSS_REPO_IMPACTS.md).

## Divergences from ADAPTER_TEMPLATE

None at 0.1 — the Vue adapter follows the template exactly. If a
divergence appears in 0.2+ (router instrumentation, SSR, etc.),
record it here with a reason.
