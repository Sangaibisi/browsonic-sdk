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

## Out of scope

- Server runtime instrumentation. React Server Components, Next.js server actions, and similar live in their own (future) adapters.
- Suspense boundary integration beyond what Error Boundary already covers.
- Anything that belongs in `@browsonic/sdk` core (network capture, console capture, etc.).
