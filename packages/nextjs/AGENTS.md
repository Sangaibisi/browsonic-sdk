# AGENTS.md — @browsonic/nextjs

> Operating manual for AI coding agents and humans editing the
> Next.js adapter. Pair with monorepo root `AGENTS.md` and the
> shared `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.1)

- `BrowsonicErrorPage` / `BrowsonicGlobalErrorPage` — drop-ins for
  `app/error.tsx` and `app/global-error.tsx`. Capture on mount via
  `useEffect`, render a minimal UI.
- `withBrowsonicRouteHandler(handler)` — wraps `app/api/*/route.ts`
  handlers. Forwards thrown errors, tags `nextjsRouteHandler: 'true'`,
  re-throws.
- `withBrowsonicConfig(nextConfig, options?)` — Next.js config
  wrapper. 0.1 is a passthrough.
- All `@browsonic/react` exports re-exported (`BrowsonicErrorBoundary`,
  `useBrowsonic`, `useUser`, `useCaptureError`, `withBrowsonic` HOC).

## Naming convention — HOC vs config wrapper

`@browsonic/react` ships a HOC `withBrowsonic`. The Next.js config
wrapper is named `withBrowsonicConfig` (Sentry-style) so both can
exist in the same import surface without collision. Do not rename
either. Do not re-export the React HOC under a different name —
consumers expect `withBrowsonic` to mean the HOC across packages.

## Why depend on @browsonic/react

Next.js apps run React. Re-exporting the React adapter's surface
means a single `npm install @browsonic/nextjs` is enough; users
don't need to also remember `@browsonic/react`. This mirrors
`@sentry/nextjs` (depends on `@sentry/react`) and `@sentry/remix`
(depends on `@sentry/react`).

The peer-dep range on `@browsonic/react` is `^0.1.0 || ^1.0.0` —
accept everything we ship that's API-compatible. Bump it when the
React adapter publishes a major.

## Defensive contract (non-negotiable)

Every adapter MUST:

1. **Never crash the host app.** The error page still renders even
   when the SDK throws inside `captureError`. The route-handler
   wrapper still re-throws even when reporting fails.
2. **Be a no-op when SDK is unreachable.** `resolveSdk()` returns
   `null` in server / edge / sandboxed contexts.
3. **Preserve the route-handler return shape.** The wrapper passes
   the original handler's resolved value through unchanged. Any
   change to that shape would break consumers' typed routes.
4. **Zero runtime dependencies** beyond `@browsonic/sdk`,
   `@browsonic/react`, `next`, and `react` (all peers).

## App Router error.tsx surface

The Next.js docs require `app/error.tsx` to be a Client Component
(`'use client'`). Our drop-ins are Client Components. Consumers
who want a Server Component fallback wire their own — but Next.js
itself won't render Server Components in error boundaries, so the
constraint is structural.

`global-error.tsx` must render `<html>` and `<body>` because the
root layout has crashed; we wrap the inner page in those tags.

## Test discipline

- Vitest + happy-dom + @testing-library/react.
- 17+ unit tests (error-page × 8, route-handler × 7, with-browsonic × 4).
- Tests do NOT instantiate Next.js or boot a Vercel runtime; they
  exercise our wrappers as plain TS / TSX.

## Sprint discipline

Sprint 7. Cross-package impacts (SDK or @browsonic/react API
change) → single PR touching both. Cross-repo impacts → top-level
`docs/sprint-tracking/CROSS_REPO_IMPACTS.md`.

## Divergences from ADAPTER_TEMPLATE

- **Re-exports another adapter's surface.** The first adapter to
  do this; established the pattern that meta-frameworks build on
  the underlying framework's adapter (Next on React, Remix on
  React, Astro on... mostly nothing — Astro is multi-framework).
- **`withBrowsonicConfig` instead of `withBrowsonic`** for the
  config wrapper — collision avoidance.

## Roadmap pointers

- 0.2: `withBrowsonicConfig` gains build-time integration once
  the deferred S3/S4 source-map pipeline lands.
- 0.2: Pages Router `_error.tsx` / `_app.tsx` companion components
  for consumers still on Pages Router (Next.js supports both
  through 14/15).
- 0.3: `instrumentation.ts` auto-registration helper.
