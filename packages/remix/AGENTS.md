# AGENTS.md — @browsonic/remix

> Operating manual for the Remix adapter. Pair with monorepo root
> `AGENTS.md` and the shared
> `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.3)

**0.1 bootstrap:**

- `BrowsonicRouteErrorBoundary` — drop-in for Remix routes'
  `ErrorBoundary` export. Captures the error on mount via
  `useEffect`, renders the default fallback (or custom children).
- `captureRouteError(error)` — imperative companion for consumers
  who already use `useRouteError` from `@remix-run/react` directly.
- `withBrowsonicRemixAction(handler)` — wraps `action` exports.
  Mirrors the Next.js adapter's route-handler wrapper.
- All `@browsonic/react` exports re-exported.

**0.2 entry helper + loader instrumentation:**

- `bootstrapBrowsonic(options?)` — `entry.client.tsx` ergonomic
  helper. Reads any pre-existing `window.Browsonic.config` (set by
  the server-side `entry.server.tsx`), merges caller's options on
  top, returns the SDK singleton. Node-side calls return `null`.
- `withBrowsonicRemixLoader(handler)` — loader-side counterpart to
  `withBrowsonicRemixAction`. Both wrappers tag the captured event
  `remix.handler: 'action' | 'loader'` so dashboards can split
  data-fetch errors from mutation errors. Legacy `remixAction` /
  new `remixLoader` metadata keys preserved for back-compat.

**0.3 navigation breadcrumbs with route hierarchy:**

- `useRemixNavigationBreadcrumbs(navigation, matches, options?)` —
  hook that emits `category: 'navigation'` breadcrumb on
  non-`idle` → `'idle'` transitions. Each breadcrumb carries
  `routeId` (leaf) + `routeChain` (parent → leaf joined with `›`).
  Hook takes plain values — consumer calls `useNavigation()` /
  `useMatches()` themselves. Structural `NavigationLike` /
  `MatchLike` shapes — no `@remix-run/react` runtime dep.
  `submitting → idle` counted as a navigation; `skipInitial: true`
  default suppresses the first transition.

**0.3 (deferred):**

- `<RemoteCatch>` / pre-Remix-v2 `CatchBoundary` back-port — waits
  on community demand; the v2 ErrorBoundary path covers the
  common case.

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
