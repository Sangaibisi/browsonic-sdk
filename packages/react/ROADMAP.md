# @browsonic/react — Roadmap

> Public-facing roadmap. The sprint-level breakdown lives upstream in [`browsonic-sdk/docs/sprint-tracking/SPRINT_PLAN.md`](https://github.com/Sangaibisi/browsonic-sdk/blob/main/docs/sprint-tracking/SPRINT_PLAN.md).

## Vision

This adapter exists for one reason: React's Error Boundary primitive catches render exceptions before they reach `window`, so a vanilla `@browsonic/sdk` install never hears about them. We wire that gap, and we add React-shaped helpers (hooks, HOC, router instrumentation) so the integration feels native.

We deliberately stay small. Anything that does not need React-specific knowledge belongs in `@browsonic/sdk`, not here. SSR / server-runtime concerns live in the dedicated `@browsonic/nextjs` and `@browsonic/remix` adapters.

## Next milestone — Routing

- `<BrowsonicRoutes>` and/or `useBrowsonicRouter()` for React Router v6/v7.
- Automatic page-view events on `popstate` / `pushState` / route match, with route pattern attached as event metadata.

## Out of scope

- Server runtime instrumentation. React Server Components, Next.js server actions, and Remix loaders/actions live in `@browsonic/nextjs` and `@browsonic/remix`.
- Suspense / `<ErrorBoundary>` API redesign — the React docs note Suspense + a class ErrorBoundary above is the canonical pattern. We follow that.
- Anything that belongs in `@browsonic/sdk` core (network capture, console capture, etc.).
