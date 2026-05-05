# @browsonic/react — Roadmap

> Public-facing roadmap. The sprint-level breakdown lives upstream in [`browsonic-sdk/docs/sprint-tracking/SPRINT_PLAN.md`](https://github.com/Sangaibisi/browsonic-sdk/blob/main/docs/sprint-tracking/SPRINT_PLAN.md) (Sprint 5).

## Vision

This adapter exists for one reason: React's Error Boundary primitive catches render exceptions before they reach `window`, so a vanilla `@browsonic/sdk` install never hears about them. We wire that gap, and we add React-shaped helpers (hooks, HOC, router instrumentation) so the integration feels native.

We deliberately stay small. Anything that does not need React-specific knowledge belongs in `@browsonic/sdk`, not here.

## Milestones

### 0.1 — Error Boundary + Hooks + HOC + Demo (shipped)

- `<BrowsonicErrorBoundary>` with reset, function-or-element fallback, optional `sdk` prop, `onError` callback, defensive isolation against SDK throws.
- `useBrowsonic()` — lazy mount-time SDK lookup, stable across renders.
- `useUser(user | null)` — sets / clears user context, value-equal-stable dep array.
- `useCaptureError()` — stable callback for event handlers and try/catch.
- `withBrowsonic(Component)` — HOC injection for legacy class components.
- 28 unit tests, coverage thresholds 80/70/80/80.
- `examples/react-vite/` minimal demo exercising every public surface.

### 0.2 — Recipe cookbook + Next.js / Remix integration notes

- Documentation: CRA, Next.js (Pages + App Router), Remix-on-React, React Server Components boundary.
- No new public API expected.

### 0.3 — Routing

- `<BrowsonicRoutes>` and/or `useBrowsonicRouter()` for React Router v6/v7.
- Automatic page-view events on `popstate` / `pushState` / route match, with route pattern attached as event metadata.

## Suspense + lazy() — pinned 2026-05-05

The Error Boundary already catches render-time errors thrown from
inside a `<Suspense>` subtree (a lazy-loaded chunk that fails to
load, a `use()` rejection that surfaces during the post-pending
render). That contract is React-internal — `<Suspense>` only catches
Promises (loading states); errors propagate up to the nearest class
boundary above. With this round we shipped an explicit test suite
(`error-boundary.suspense.test.tsx`) pinning the contract:

- Errors thrown from inside `lazy()` chunks reach `componentDidCatch`
  on the boundary.
- The boundary's fallback replaces Suspense's pending UI after the
  throw — Suspense's fallback is gone.
- Lazy chunks that resolve successfully don't trigger capture.
- The component-stack metadata stays under the documented 1024-char
  cap.

This isn't a public API change — the boundary's behaviour was
correct from day one. The test pins it so a future React minor
version that rewires error propagation through Suspense (or moves
it to a separate boundary) fails loudly. Mirrors the Vue 0.3
Suspense + async setup pinning pattern.

## Out of scope

- Server runtime instrumentation. React Server Components, Next.js server actions, and similar live in their own (future) adapters.
- Suspense / `<ErrorBoundary>` API redesign — the React docs note
  Suspense + a class ErrorBoundary above is the canonical pattern.
  We follow that.
- Anything that belongs in `@browsonic/sdk` core (network capture, console capture, etc.).
