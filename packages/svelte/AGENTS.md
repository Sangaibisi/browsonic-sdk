# AGENTS.md — @browsonic/svelte

> Operating manual for AI coding agents and humans editing the
> Svelte adapter. Pair with monorepo root `AGENTS.md` and the shared
> `packages/react/docs/ADAPTER_TEMPLATE.md` checklist.

## Public API surface (0.3)

**0.1 bootstrap:**

- `handleErrorWithBrowsonic(options?)` — SvelteKit `handleError` hook
  factory.
- `subscribeUser(store, options?)` — Svelte-store → SDK user context
  bridge. Accepts any `{ subscribe }` shape, returns the unsubscribe
  handle.
- `captureError` / `captureMessage` / `addBreadcrumb` — ergonomic
  standalone wrappers around `resolveSdk` + SDK calls.
- `resolveSdk(explicit?)` — lower-level lookup.

**0.2 instrumentation + typing:**

- `instrumentNavigation(options?)` + `trackNavigation` Svelte action
  — two surfaces over one engine; emits `category: 'navigation'`
  breadcrumb on every URL change. Ref-counted `pushState` /
  `replaceState` patches so multiple callers share one set; popstate
  - synthetic `browsonic:locationchange` event fan-out. No
    `@sveltejs/kit` runtime dep.
- `handleErrorWithBrowsonic<App.Error>` — generic over the
  consumer's `App.Error` shape so `HandleClientError` typing flows
  through unchanged. Default generic stays `BrowsonicHandleErrorReturn`.

**0.3 SvelteKit form + error-page coverage:**

- `withBrowsonicAction(handler, options?)` — wraps `actions: {}`
  handlers; reports + re-throws so SvelteKit returns the failure
  unchanged. Structural `ActionEventLike` shape (no `@sveltejs/kit`
  runtime dep). Custom `tagNamespace`, fallback name = `route.id` →
  `'default'`.
- `reportErrorPage(error, options?)` — one-shot, idempotent capture
  for `+error.svelte`'s `<script>` block. Reference-keyed `WeakSet`
  de-dupe so reactive `$:` doesn't re-report on tick. Browser-only
  short-circuit; returns `boolean` so callers can distinguish
  de-dupe from no-SDK.

## Divergences from ADAPTER_TEMPLATE

This adapter intentionally **does not** ship a boundary component.

**Why:** Svelte 5 introduced `<svelte:boundary>` natively (a real
framework primitive that catches render-time errors). Building a
competing component would either duplicate the framework feature or
ship a half-working shim for Svelte 4 (which has no clean boundary
primitive at all). The README documents the divergence and points
consumers to `<svelte:boundary>` + `captureError` as the
recommended path.

If a future minor release ships a `.svelte` boundary specifically
for Svelte 4 holdouts, document the build chain change here (the
package will need `svelte` + the consumer's bundler to compile
shipped `.svelte` files; we currently ship pure TS).

## Defensive contract (non-negotiable)

Every public surface MUST:

1. **Never crash the host app.** SDK calls wrapped in `try / catch`.
   Hook still returns, store subscriber still emits, capture
   wrappers still resolve.
2. **Be a no-op when SDK is unreachable.** `resolveSdk()` returns
   `null` in server / sandboxed contexts; downstream code branches
   on `if (!sdk) return`.
3. **Tolerate malformed inputs.** `subscribeUser` accepts a no-op
   path when `store?.subscribe` isn't a function — better than
   throwing inside an `onMount`.
4. **Zero runtime dependencies** beyond `@browsonic/sdk` and
   `svelte` (both peer deps). Anything else lives in the SDK or is
   a devDep (testing).

## Why no Svelte component

The adapter ships pure `.ts` modules — no `.svelte` files. Pure-TS
keeps the build chain at `tsc` × 3 (esm/cjs/types), with no Svelte
compiler dependency in our package. Consumers who want boundary
behaviour use `<svelte:boundary>` (Svelte 5+) or wrap risky code
with `captureError` themselves.

## Test discipline

- Vitest one-shot is the gate; coverage thresholds 80/70/80/80.
- `happy-dom` runtime — same as the SDK and the React / Vue
  adapters.
- We do NOT use `@testing-library/svelte`. Our public surface is
  pure-TS — tests exercise the wrappers and the factory directly,
  no component mounting needed. If a future feature ships a
  `.svelte` file, add the testing library at that point.
