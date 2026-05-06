# AGENTS.md — @browsonic/nextjs

> Operating manual for AI coding agents and humans editing the
> Next.js adapter. Pair with monorepo root `AGENTS.md` and the
> shared `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.3 partial)

**0.1 bootstrap (shipped):**

- `BrowsonicErrorPage` / `BrowsonicGlobalErrorPage` — drop-ins for
  `app/error.tsx` and `app/global-error.tsx`. Capture on mount via
  `useEffect`, render a minimal UI.
- `withBrowsonicRouteHandler(handler)` — wraps `app/api/*/route.ts`
  handlers. Forwards thrown errors, tags `nextjsRouteHandler: 'true'`,
  re-throws.
- `withBrowsonicConfig(nextConfig, options?)` — Next.js config
  wrapper. Passthrough until build-time sourcemap upload lands.
- All `@browsonic/react` exports re-exported (`BrowsonicErrorBoundary`,
  `useBrowsonic`, `useUser`, `useCaptureError`, `withBrowsonic` HOC).

**0.2 route context + Pages Router (shipped 2026-05-04):**

- `BrowsonicErrorPage` / `BrowsonicGlobalErrorPage` accept optional
  `pathname?: string` + `params?: Record<string, string | string[]>`.
  Consumers thread these from `usePathname()` / `useParams()`; the
  boundary lands them as `nextjs.pathname` tag + `nextjs.params`
  context bucket.
- `browsonicPagesAppInit(options)` — Pages Router `_app.tsx` helper.
  Initialises the SDK once on the client, no-op on the server.
- `browsonicPagesErrorInitialProps(ctx)` — Pages Router `_error.tsx`
  helper inside `getInitialProps`. Captures `ctx.err`, tags
  `nextjs.runtime: 'pages-error'`.

**0.3 (partial):**

- Shipped 2026-05-05 — `@browsonic/nextjs/instrumentation` sub-entry
  exporting `browsonicInstrumentation({...})` factory and
  `BROWSONIC_INSTRUMENTATION_VERSION` constant. Returns the
  `{ register, onRequestError }` shape Next.js's `instrumentation.ts`
  expects. `register()` validates `apiEndpoint` + `appKey` and warns
  on missing fields. `onRequestError` forwards to `console.error`
  with structured `nextjs.*` context. Opt-in (consumer pastes a
  5-line wire-up) — no auto-injection.
- Open — Build-time sourcemap upload through `withBrowsonicConfig`,
  pending the source-map pipeline backend polish.

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
- Unit tests cover error-page, route-handler, with-browsonic,
  pages-router, and the instrumentation sub-entry.
- Tests do NOT instantiate Next.js or boot a Vercel runtime; they
  exercise our wrappers as plain TS / TSX.

## Cross-package change discipline

Cross-package impacts (SDK or @browsonic/react API change) →
single PR touching both. Cross-repo impacts → coordinate via the
monorepo root `AGENTS.md`.

## Divergences from ADAPTER_TEMPLATE

- **Re-exports another adapter's surface.** The first adapter to
  do this; established the pattern that meta-frameworks build on
  the underlying framework's adapter (Next on React, Remix on
  React, Astro on... mostly nothing — Astro is multi-framework).
- **`withBrowsonicConfig` instead of `withBrowsonic`** for the
  config wrapper — collision avoidance.
- **Server-runtime sub-entry** (`./instrumentation`) — the only
  framework adapter that ships a non-default export path, because
  Next.js's `instrumentation.ts` convention is server-only and
  must not pull React / DOM code into the server bundle.

## Roadmap pointers

See `ROADMAP.md` for the open 0.3 item (build-time sourcemap upload
through `withBrowsonicConfig`).
