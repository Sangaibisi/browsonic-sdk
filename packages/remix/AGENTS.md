# AGENTS.md — @browsonic/remix

> Operating manual for the Remix adapter. Pair with monorepo root
> `AGENTS.md` and the shared
> `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.1)

- `BrowsonicRouteErrorBoundary` — drop-in for Remix routes'
  `ErrorBoundary` export. Captures the error on mount via
  `useEffect`, renders the default fallback (or custom children).
- `captureRouteError(error)` — imperative companion for consumers
  who already use `useRouteError` from `@remix-run/react` directly.
- `withBrowsonicRemixAction(handler)` — wraps `action` / `loader`
  exports. Mirrors the Next.js adapter's route-handler wrapper.
- All `@browsonic/react` exports re-exported.

## Why depend on @browsonic/react

Remix runs React. Re-exporting the React adapter's surface means
a single `npm install @browsonic/remix` is enough — same DX
contract as `@browsonic/nextjs`. Peer-dep range on
`@browsonic/react` is `^0.1.0 || ^1.0.0`; bump on react adapter
major.

## Why no @remix-run/react runtime dependency

`@remix-run/react`'s `useRouteError` is consumed at the call site
by the host app, not by us — we accept the error as a prop on
`BrowsonicRouteErrorBoundary` and provide `captureRouteError` as
an imperative escape hatch. Keeping `@remix-run/react` out of our
dependency graph means the package's bundle is genuinely small
and there's no version conflict surface with the host's Remix
install.

## Defensive contract (non-negotiable)

1. **Never crash the host app.** Boundary still renders, action
   still re-throws, captureRouteError silently absorbs reporter
   throws.
2. **Be a no-op when SDK is unreachable.** All forwarders branch
   on `if (!sdk) return`.
3. **Preserve action / loader return shape.** The wrapper returns
   the original handler's resolved value unchanged.
4. **Zero runtime dependencies** beyond `@browsonic/sdk`,
   `@browsonic/react`, and `react`.

## Test discipline

- Vitest + happy-dom + @testing-library/react.
- 19+ tests (route-error-boundary × 12, action-wrapper × 7).
- We don't boot Remix; we exercise the public surface as plain
  React + plain TS.

## Sprint discipline

Sprint 10. Cross-package impacts → single PR. Cross-repo impacts →
top-level `docs/sprint-tracking/CROSS_REPO_IMPACTS.md`.

## Roadmap pointers

- 0.2: `entry.client.tsx` helper that auto-initialises the SDK
  with a config object loaded from environment variables
  (Remix-specific bootstrap pattern).
- 0.3: Remix data-loader breadcrumbs — record the route hierarchy
  as breadcrumbs on every navigation.
