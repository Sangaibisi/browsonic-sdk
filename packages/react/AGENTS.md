# AGENTS.md — browsonic-react

> Operating manual for AI coding agents (Claude Code, Cursor, Codex,
> Aider, Cascade) and human contributors. Mirrors the discipline
> established in [browsonic-sdk/AGENTS.md](https://github.com/Sangaibisi/browsonic-sdk/blob/main/AGENTS.md);
> read that file first if you are new to the Browsonic stack.

## Purpose

`@browsonic/react` is a **thin React adapter** on top of
[`@browsonic/sdk`](https://github.com/Sangaibisi/browsonic-sdk). It
exists because React's reconciler catches render-time exceptions
before they bubble to `window`, so the SDK alone never hears about
them. The adapter wires React Error Boundary into the SDK's
`captureError` API and ships React-shaped helpers (hooks, HOC,
router instrumentation).

The adapter is **the second piece of code** that runs inside
customer applications — alongside the SDK. It must not introduce
its own runtime cost beyond what the SDK already pays.

## Tech stack (authoritative)

| Layer             | Technology                                                                          | Pinned in                                          |
| ----------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------- |
| Language          | TypeScript (strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)       | `tsconfig.json`                                    |
| Runtime           | React 18 / 19 (peer-dep)                                                            | `package.json` peerDeps                            |
| Build (3 targets) | tsc → ESM + CJS + types                                                             | `tsconfig.{esm,cjs,types}.json`                    |
| Test              | Vitest 3.x + happy-dom 20.x + @testing-library/react                                | `vitest.config.ts`                                 |
| Lint              | ESLint 9 flat + typescript-eslint + eslint-plugin-react + eslint-plugin-react-hooks | `eslint.config.mjs`                                |
| Format            | Prettier + Husky + lint-staged                                                      | `.prettierrc.json`, `.husky/pre-commit`            |
| Publish           | Public npm registry as `@browsonic/react` (access: public, provenance on)           | `publishConfig` in `package.json`                  |
| Release           | semantic-release on Conventional Commits                                            | `.releaserc.json`, `.github/workflows/release.yml` |

## Non-negotiables

Break any of these and the PR does not merge.

1. **The adapter never crashes the host application.** If the SDK
   throws while reporting, the boundary still renders fallback. The
   SDK's `captureError` calls inside the adapter are wrapped in
   defensive `try { ... } catch {}`.
2. **`npm run lint` = 0 errors, 0 warnings.** Same standard as the
   SDK. Type-checked rules are mandatory, not advisory.
3. **`npm run typecheck` passes.** Strict mode plus
   `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
4. **Test count does not silently shrink.** Coverage gates:
   statements ≥ 80%, branches ≥ 70%, functions ≥ 80%.
5. **Runtime dependencies = 0.** This is an adapter; everything it
   needs comes from React (peer-dep) or the SDK (peer-dep).
6. **No data collection here.** Privacy-relevant code lives in the
   SDK. The adapter only forwards to `captureError` /
   `addMetadata`. The one exception is React's `componentStack`,
   which is React's own diagnostic string and is truncated to 1024
   chars before forwarding.
7. **Every public symbol carries a TSDoc comment.** Consumers read
   the generated types; unannotated exports leak our internal
   vocabulary into their IDE autocomplete.
8. **No closed-source references.** Public OSS — treat every file
   as "would I be comfortable showing this on my CV."

## Commands (agent copy-paste)

### Daily loop

```bash
npm ci                              # clean install from lockfile
npm run lint                        # eslint flat, 0 errors/warnings expected
npm run lint:fix                    # auto-fix where safe
npm run format                      # prettier write
npm run typecheck                   # tsc --noEmit on base config
npm run test                        # vitest watch
npm run test:run                    # vitest one-shot (CI equivalent)
npm run test:coverage               # + coverage gate (v8)
```

### Build (three artefacts)

```bash
npm run build                       # esm + cjs + types in order
npm run build:esm                   # tsc -p tsconfig.esm.json
npm run build:cjs                   # tsc -p tsconfig.cjs.json
npm run build:types                 # tsc -p tsconfig.types.json
```

## Project layout

```
src/
├── index.ts                 # main entry — re-exports public API
├── error-boundary.tsx       # <BrowsonicErrorBoundary>
├── hooks.ts                 # useBrowsonic, useUser, useCaptureError
├── hoc.tsx                  # withBrowsonic
├── resolve-sdk.ts           # shared SDK lookup helper
└── router/                  # (0.3+) React Router instrumentation

docs/
└── ADAPTER_TEMPLATE.md      # checklist for the next framework adapter

dist/                        # build output — NEVER edited by hand
coverage/                    # vitest coverage — gitignored
.github/workflows/           # CI + release
```

**Note**: Hooks and HOC ship as flat files (`hooks.ts`, `hoc.tsx`)
rather than nested directories. The structure stays flat until a
single concern grows past ~250 lines; premature directory split
adds import noise without diagnostic value.

**Directory contract**:

- `src/**` runs in browsers via React. No Node-only imports.
- `src/**/*.test.{ts,tsx}` runs in happy-dom via Vitest.
- Tests use `@testing-library/react`.

## React-specific guidance

- **Class component for the boundary.** `componentDidCatch` is a
  class-only API in React 18/19; do not chase a function-component
  rewrite until React provides a hook equivalent.
- **Function components everywhere else.** Hooks + HOC composition
  is the modern style; class wrappers are anti-pattern outside the
  boundary.
- **Concurrent rendering.** Boundary state must be safe under
  React 18+ concurrent rendering — store the error in `state`, not
  in instance fields.
- **React 19 server components.** This adapter is **client-only**
  for now. RSC integration belongs in a later release; client
  components inside a server tree continue to work.

## Versioning & releases

- Semver strict. Breaking API → major.
- Pre-releases on the `next` branch.
- `release.yml` runs semantic-release → version bump, tag,
  CHANGELOG, GitHub Release, `npm publish --provenance`.
- **Do not** hand-edit `package.json` `version`, hand-create tags,
  or hand-create Releases — semantic-release owns that surface.

## Commits & PRs

- Convention: `<type>(<scope>): <short>`. Types: `feat`, `fix`,
  `sec`, `chore`, `ci`, `docs`, `refactor`, `test`, `perf`.
- PR bodies for non-trivial changes mention:
  - test count delta (expected: 0 unless you're adding/removing)
  - bundle size delta (when we add size-limit, currently unmeasured)
  - coverage delta (from `npm run test:coverage`)

## Cross-repo contracts

- **`@browsonic/sdk`** — this adapter targets the SDK's public API
  surface (`Browsonic` class, `captureError`, `setUser`, `addMetadata`,
  `clearUser`). Any change in those signatures is an SDK breaking
  change and forces this adapter's major bump in lockstep.
- **Sprint planning** — work on this repo is tracked in the SDK's
  [`SPRINT_PLAN.md`](https://github.com/Sangaibisi/browsonic-sdk/blob/main/docs/sprint-tracking/SPRINT_PLAN.md)
  under Sprint 5. Cross-repo impacts go in
  [`CROSS_REPO_IMPACTS.md`](https://github.com/Sangaibisi/browsonic-sdk/blob/main/docs/sprint-tracking/CROSS_REPO_IMPACTS.md).

## Common pitfalls

1. **"Boundary did not catch my error."** Error Boundaries do **not**
   catch errors thrown in event handlers, async code, or during
   server rendering. For event-handler errors use
   `useCaptureError()` (0.2+) or `try/catch` and forward to
   `sdk.captureError()`.
2. **"Tests fail in CI but pass locally."** Usually a happy-dom
   version mismatch or a missing `await` for a state-setter that
   triggers re-render.
3. **"Component stack is huge."** We truncate to 1024 chars before
   forwarding to the SDK; if you see longer values in the event
   payload, the truncation is broken — file a bug.

## What agents specifically should do

- Before editing, skim this file. The non-negotiables are the
  current policy state.
- When adding a new public symbol, update `src/index.ts` and the
  README's "What this adapter ships" section in the same PR.
- When changing component behaviour, update the test suite
  alongside it. A PR that changes a component without updating the
  test is incomplete.
- Prefer narrowing types to adding `any`. The exported types are
  the contract surface React developers consume.
- Do not touch `dist/`, `coverage/`, generated artefacts.

## Updating this document

This file travels with the repo because the rules evolve with the
code. If you land a PR that invalidates a rule here, the same PR
updates this file.
