# AGENTS.md — browsonic-sdk (monorepo root)

> Operating manual for AI coding agents (Claude Code, Cursor, Codex,
> Aider, Cascade) and human contributors. Every rule here was learned
> the hard way — a production regression, a failed release, or a CI
> red build. **Do not weaken a rule without a PR that explains what
> replaced it.**

## Repository shape

`browsonic-sdk` is an **npm workspaces monorepo** holding the core
SDK, seven framework adapters, and two build-time tools. Workspaces
under [`packages/`](./packages):

| Workspace                                        | npm name                 | Surface                                                                                           |
| ------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------------------------- |
| [`packages/sdk`](./packages/sdk)                 | `@browsonic/sdk`         | Framework-agnostic core SDK — privacy-first browser RUM + error tracking.                         |
| [`packages/react`](./packages/react)             | `@browsonic/react`       | React adapter — `BrowsonicErrorBoundary`, hooks, HOC.                                             |
| [`packages/vue`](./packages/vue)                 | `@browsonic/vue`         | Vue 3 boundary, composables, plugin, Vue Router 4 + Pinia integration.                            |
| [`packages/svelte`](./packages/svelte)           | `@browsonic/svelte`      | SvelteKit `handleError` factory, navigation breadcrumbs, form-action wrappers, error-page helper. |
| [`packages/angular`](./packages/angular)         | `@browsonic/angular`     | `ErrorHandler` drop-in, `BrowsonicService`, `provideBrowsonic()`, Router + HttpClient companions. |
| [`packages/astro`](./packages/astro)             | `@browsonic/astro`       | Auto-injecting Astro Integration, View Transitions breadcrumbs, Actions wrapper, island tagging.  |
| [`packages/nextjs`](./packages/nextjs)           | `@browsonic/nextjs`      | App Router error pages, Pages Router companions, route-handler wrapper, `instrumentation.ts`.     |
| [`packages/remix`](./packages/remix)             | `@browsonic/remix`       | Route ErrorBoundary, action + loader wrappers, navigation breadcrumb hook, entry helper.          |
| [`packages/build-tools`](./packages/build-tools) | `@browsonic/build-tools` | Bundler plugins for source-map upload (Vite, Webpack, Rollup, esbuild). Zero runtime deps.        |
| [`packages/cli`](./packages/cli)                 | `@browsonic/cli`         | `browsonic upload-sourcemaps` build-time CLI; pure-TypeScript, Node 20+, zero runtime deps.       |

Per-package details (privacy, defensive contracts, framework-specific
pitfalls) live in `packages/<name>/AGENTS.md`. **Read the relevant
package's AGENTS.md before editing inside a package.** This root
file covers cross-package rules; it does NOT replace package-level
agents files. Adding a new adapter starts from
[`packages/react/docs/ADAPTER_TEMPLATE.md`](./packages/react/docs/ADAPTER_TEMPLATE.md).

## Purpose

`@browsonic/sdk` is a browser SDK that third-party applications embed
to ship telemetry (errors, navigation, XHR, console, pageview, visitor
context) to an HTTP ingest endpoint. It is the **one piece of code
that runs inside customer applications**, so the bar is
bundle-obsessive, fail-safe, privacy-first, and backwards-compatible.
The seven adapter packages (`@browsonic/react` … `@browsonic/remix`)
are thin wrappers that inherit the same defensive contracts.
`@browsonic/cli` and `@browsonic/build-tools` are build-time only —
they upload source maps to the ingest backend and never run in the
customer browser.

The ingest endpoint is operator-supplied — there is no hard-coded
backend. The wire contract `POST /v1/events` is documented in
[`packages/sdk/INTEGRATION.md`](./packages/sdk/INTEGRATION.md).
The source-map pipeline contract `POST /v1/sourcemaps` +
`POST /v1/symbolicate` is documented in
[`docs/design/SOURCEMAP_PIPELINE.md`](./docs/design/SOURCEMAP_PIPELINE.md).

Breaking any package breaks customer apps. Act accordingly.

## Documentation map

Use this index when you need to know **where a rule lives**. If you
add a rule that belongs in one of these files, put it there and
reference it from this one — don't duplicate.

**Repo-wide governance**

- [`README.md`](./README.md) — public entry point, package matrix.
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contributor onboarding, PR workflow, coding style.
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — Contributor Covenant 2.1.
- [`SECURITY.md`](./SECURITY.md) — vulnerability disclosure path + scope.
- [`.github/pull_request_template.md`](./.github/pull_request_template.md) — PR checklist (lint, typecheck, test, size, public-API, privacy).
- `LICENSE` (Apache-2.0), `NOTICE` — root-level, covers every workspace.

**Architecture & design**

- [`docs/design/SOURCEMAP_PIPELINE.md`](./docs/design/SOURCEMAP_PIPELINE.md) — source-map upload + symbolication design (v0.1 shipped 2026-05-06).

**SDK package docs (`packages/sdk/`)**

- [`README.md`](./packages/sdk/README.md) — npm-facing quickstart.
- [`INTEGRATION.md`](./packages/sdk/INTEGRATION.md) — config reference, framework integration recipes, wire format.
- [`PRIVACY.md`](./packages/sdk/PRIVACY.md) — redaction defaults, GDPR/CCPA/HIPAA posture, privacy contract.
- [`BENCHMARKS.md`](./packages/sdk/BENCHMARKS.md) — bundle budgets, perf SLOs, microbench numbers.
- [`CHANGELOG.md`](./packages/sdk/CHANGELOG.md) — release history (semantic-release-managed; do not hand-edit).

**Per-adapter docs**

Each `packages/<adapter>/` ships its own `README.md`, `AGENTS.md`,
`ROADMAP.md` (deferred work + parking lot for that adapter), and
(after first release) `CHANGELOG.md`. The bootstrap checklist for
new adapters lives in
[`packages/react/docs/ADAPTER_TEMPLATE.md`](./packages/react/docs/ADAPTER_TEMPLATE.md).

## Monorepo discipline

- **Root-only tooling.** The root `package.json` carries husky,
  lint-staged, prettier, and rimraf — and nothing else. Per-package
  devDeps (TypeScript, ESLint, Vitest, framework-specific) belong
  inside the package.
- **Root scripts are aggregators.** `npm run lint`, `npm run typecheck`,
  `npm run test:run`, `npm run build`, `npm run size`, `npm run bench`
  walk every workspace via `--workspaces --if-present`. The build
  script enforces topological order: sdk → react → other adapters →
  build-tools / cli (so adapters can resolve `@browsonic/sdk` types
  from `dist/` during their own build). Running a script from a
  single package: `npm run <script> --workspace=packages/<name>`.
- **One root lockfile.** `package-lock.json` lives at the repo root.
  Per-package `package-lock.json` files break npm workspaces — never
  commit one inside `packages/`.
- **Root `.npmrc` carries `legacy-peer-deps=true`** because
  `eslint-plugin-react@7.x` peer-range hasn't been bumped to ESLint 10
  yet. Remove the flag once the plugin maintainer updates.
- **Cross-package imports** must come through the published package
  name (`@browsonic/sdk`) so they resolve consistently in dev (via
  workspace symlink) and at consumer install (via npm registry).
  Direct relative imports across packages (`../../sdk/src/...`) are
  forbidden — they break tree-shaking and create circular workspace
  dependencies.
- **Per-package release.** Each package owns its own `.releaserc.json`
  - CHANGELOG + version. semantic-release runs per workspace via the
    release.yml `--workspaces --if-present` invocation.
- **Root npm `overrides`** pin transitive vulnerabilities the bundled
  npm CLI inside `semantic-release@24` can't fix on its own. Don't
  override `brace-expansion` — it cascades into `minimatch` and
  breaks ESLint flat config.

## Tech stack (authoritative)

| Layer             | Technology                                                     | Pinned in                                                          |
| ----------------- | -------------------------------------------------------------- | ------------------------------------------------------------------ |
| Language          | TypeScript (strict)                                            | `tsconfig.json`                                                    |
| Runtime           | Evergreen browsers + Node 20+ for tests / build                | `package.json` engines, `.github/workflows/ci.yml`                 |
| Build (3 targets) | tsc → ESM + CJS + types                                        | `tsconfig.{esm,cjs,types}.json`                                    |
| Test              | Vitest 3.x + happy-dom 20.x                                    | `vitest.config.ts`                                                 |
| E2E               | Playwright chromium                                            | `playwright.config.ts`, `e2e/`                                     |
| Bench             | Vitest bench + regression check                                | `scripts/check-bench-regression.mjs`                               |
| Bundle budget     | size-limit                                                     | `.size-limit.json` (per-package)                                   |
| Lint              | ESLint 10 flat + typescript-eslint (type-checked src)          | `eslint.config.mjs`                                                |
| Format            | Prettier + Husky + lint-staged                                 | `.prettierrc.json`, `.husky/pre-commit`                            |
| Publish           | Public npm registry as `@browsonic/<package>` (access: public) | `publishConfig` in each `package.json`                             |
| Release           | semantic-release on Conventional Commits                       | `.releaserc.json` (per workspace), `.github/workflows/release.yml` |
| Supply-chain      | npm provenance + CycloneDX SBOM on every Release               | `.github/workflows/release.yml`                                    |

## Non-negotiables

Break any of these and the PR does not merge.

1. **SDK errors never crash the host application.** Every public API
   path is wrapped; internal failures emit a diagnostic and move on.
   The [circuit breaker](./packages/sdk/src/sentinel/) pauses
   collection after repeated internal failures. This is the single
   most load-bearing promise in the README. Regressions are critical
   severity.
2. **`npm run lint` = 0 errors, 0 warnings.** `no-non-null-assertion`,
   `no-explicit-any`, `no-unused-vars`, `no-floating-promises`
   (warn→error in src) are all **error** level. Non-null `!` was a
   regression source in 0.2.x (CRIT-001) — do not reintroduce it.
3. **`npm run typecheck` passes.** Two tsconfig chains — base + emit
   configs — must agree. Broken types in `dist/types/*.d.ts` break
   every downstream consumer silently (their editors lie).
4. **Bundle size budget holds.** `npm run size` must stay within the
   per-package `.size-limit.json`. A 200-byte regression is fine; a
   2-KB regression needs a paragraph in the PR explaining why.
   Current SDK ceilings (gzip): main 22 KB, core 15 KB, widget 6 KB,
   CJS 26 KB. Always cite the real numbers from
   [`packages/sdk/BENCHMARKS.md`](./packages/sdk/BENCHMARKS.md).
5. **Test count does not silently shrink.** A PR that drops the test
   count without naming which tests were removed and why is a smell.
   See [`packages/sdk/BENCHMARKS.md`](./packages/sdk/BENCHMARKS.md)
   for the SDK floor; per-adapter tests are tracked in their own
   AGENTS.md files.
6. **Privacy defaults are masked defaults.** Passwords, tokens, API
   keys, input values are redacted by the collector layer; changing
   that default is a policy call, not a refactor. See
   [`packages/sdk/PRIVACY.md`](./packages/sdk/PRIVACY.md).
7. **No `require()` or Node-only imports in src.** Browser runtime.
   If you need fs/path/node-fetch, you're probably in `scripts/` or
   `bench/`, not `src/`. The two exceptions are `@browsonic/cli` and
   `@browsonic/build-tools`, which are build-time only.
8. **Every public symbol carries a TSDoc comment.** Consumers read
   the generated types; unannotated exports leak our internal
   vocabulary into their IDE autocomplete.

## Commands (agent copy-paste)

### Daily loop

```bash
npm ci                              # clean install from lockfile
npm run lint                        # eslint flat, 0 errors/warnings expected (across all workspaces)
npm run lint:fix                    # auto-fix where safe
npm run format                      # prettier write across packages + docs
npm run typecheck                   # tsc --noEmit per workspace
npm run test                        # vitest watch (per workspace)
npm run test:run                    # vitest one-shot (CI equivalent)
npm run test:coverage               # + coverage gate (v8)
```

### Pre-commit simulation

```bash
npx lint-staged                     # what husky runs; mirror exactly
```

### Build (three artefacts per package)

```bash
npm run build                       # esm + cjs + types per workspace, in topological order
```

Inside `packages/sdk`:

```bash
npm run build:esm                   # tsc -p tsconfig.esm.json
npm run build:cjs                   # tsc -p tsconfig.cjs.json
npm run build:types                 # tsc -p tsconfig.types.json
```

### Size + perf gates

```bash
npm run size                        # size-limit check against per-package .size-limit.json
npm run size:why                    # explain the bundle — where bytes went (sdk only)
npm run bench                       # vitest bench → bench-results.json (sdk only)
npm run bench:check                 # regression gate vs bench-baseline.json (10% tolerance)
```

### E2E (requires chromium, sdk only)

```bash
npm run build:e2e --workspace=packages/sdk    # build IIFE bundle that e2e/ loads
npm run test:e2e --workspace=packages/sdk     # playwright test
npm run test:e2e:ui --workspace=packages/sdk  # playwright with UI for local debug
```

### Everything (release dress rehearsal)

```bash
npm run perf:all --workspace=packages/sdk     # build + bench + size + e2e (sdk)
```

## Project layout

```
browsonic-sdk/                ← repo root (npm workspaces)
├── package.json              # workspaces declaration + monorepo aggregator scripts + transitive overrides
├── package-lock.json         # unified lockfile
├── .npmrc                    # legacy-peer-deps=true (root-level)
├── .github/
│   ├── workflows/            # ci.yml, release.yml, e2e.yml, security.yml — workspace-aware
│   └── pull_request_template.md
├── .husky/                   # pre-commit (lint-staged at root)
├── docs/
│   └── design/
│       └── SOURCEMAP_PIPELINE.md     # source-map upload + symbolication design (v0.1 shipped)
├── AGENTS.md                 # this file — monorepo discipline + cross-package rules
├── README.md, ROADMAP.md, CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
├── LICENSE (Apache-2.0), NOTICE
└── packages/
    ├── sdk/                                  → @browsonic/sdk (core)
    │   ├── src/                              # see SDK package layout below
    │   ├── bench/, e2e/, scripts/, dist/, coverage/
    │   ├── package.json, tsconfig.*.json, eslint.config.mjs, vitest.config.ts
    │   ├── playwright.config.ts, .size-limit.json, .releaserc.json
    │   ├── README.md, BENCHMARKS.md, CHANGELOG.md, INTEGRATION.md, PRIVACY.md
    │   └── (no AGENTS.md yet; this root file is canonical for sdk discipline)
    ├── react/                                → @browsonic/react
    │   ├── src/, examples/react-vite/
    │   ├── docs/ADAPTER_TEMPLATE.md          # checklist for the next framework adapter
    │   └── README.md, AGENTS.md, ROADMAP.md, CHANGELOG.md
    ├── vue/                                  → @browsonic/vue
    ├── svelte/                               → @browsonic/svelte
    ├── angular/                              → @browsonic/angular
    ├── astro/                                → @browsonic/astro
    ├── nextjs/                               → @browsonic/nextjs
    ├── remix/                                → @browsonic/remix
    ├── build-tools/                          → @browsonic/build-tools (Vite / Webpack / Rollup / esbuild plugins)
    │   └── README.md
    └── cli/                                  → @browsonic/cli (browsonic upload-sourcemaps)
        └── README.md
```

Every adapter under `packages/<framework>/` ships
`README.md`, `AGENTS.md`, `ROADMAP.md`, `CHANGELOG.md` (after first
release), `package.json`, `tsconfig.*.json`, `eslint.config.mjs`,
`vitest.config.ts`, and `.releaserc.json`. The shape mirrors
`packages/react/`.

### `packages/sdk/src/` layout

```
src/
├── index.ts                 # main entry — ESM/CJS
├── core.ts                  # core-only entry (no widget) — slimmer bundle
├── widget-entry.ts          # widget plugin entry (opt-in)
├── plugin.ts                # plugin contract; widgets/collectors implement this
├── sentinel.ts              # legacy class + facade — DO NOT extend
├── sentinel/                # post-split module set (plugin manager, queue, lifecycle, scope)
├── collectors/              # 8 pluggable collectors: error, xhr, network, console,
│                            #   pageview, callback, visitor, navigation
│                            # + helpers: dependencies, history-instrumentation, wrap, index
├── plugins/                 # first-party plugins composed from collectors
├── widget/                  # in-app widget (renderer, manager, rule-matcher,
│                            #   sanitize, safe-regex, styles)
├── config/                  # config validation + defaults
├── context/                 # session/user/tenant propagation
├── transport/               # outbound HTTP to the operator-supplied ingest endpoint
├── queue/                   # offline-capable event queue
├── telemetry/               # internal SDK metrics (self-monitoring)
├── diagnostics/             # failure surface for host app integration
├── types/                   # shared type surface (public + internal)
├── utils/                   # leaf helpers; keep dep-free
└── visitor/                 # visitor ID + fingerprinting
```

**Directory contract**:

- `src/**` runs in browsers. No Node-only imports. No `!` non-null
  assertions. Type-checked lint.
- `src/**/*.test.ts` runs in happy-dom via Vitest. Non-type-checked
  lint allows `any` / `!` for test ergonomics.
- `bench/`, `scripts/`, `e2e/` use the non-type-checked preset —
  read the existing code before adding new files there.

**A note for AI agents and human contributors alike:** this is a
public, open-source repository. Treat every file as "would I be
comfortable showing this on my CV" — clear naming, no internal
jargon, no references to closed-source counterparts beyond the
abstract `/v1/events` ingest contract. The SaaS backend is not part
of this repo, so do not write code or docs that assume readers have
access to it.

## Dependency management

- **Dependabot** is configured for `npm` (weekly safe-updates
  group) + `github-actions` (monthly). Review the group PRs, don't
  just rubber-stamp — the safe-updates group is constrained to
  patch + minor, but a patch bump in a tool (e.g., vitest) can
  still change reporter output or coverage numbers.
- **Major bumps** (e.g., `vitest 1 → 3`, `happy-dom 14 → 20`) open
  separate PRs. Treat them as migration work. Recent example:
  happy-dom 14 → 20 closed a critical RCE advisory; needed a
  matching `@vitest/coverage-v8` line update because Vitest pins
  which happy-dom majors it supports via the adapter.
- **`npm audit --audit-level=critical --production=false`** is the
  gate in CI (`.github/workflows/ci.yml`). The bundled npm CLI inside
  `semantic-release@24` ships transitive moderate/high advisories we
  can't fix without forking it; rooted at `critical` so the gate
  catches what actually matters for shipped code. Dependabot covers
  the moderate/high band asynchronously.
- **`semantic-release` is pinned to v24** across all workspaces.
  v25 exits non-zero on no-release, which breaks per-workspace
  iteration in the release pipeline — do not bump.
- No new runtime deps without a PR-body justification. This SDK
  ships in customer apps; every byte counts.

## Build-target discipline

Three artefact families are shipped per package:

| Target                | Consumer                                | Budget                        | Pitfall                                                                                                        |
| --------------------- | --------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ESM (`dist/esm/`)     | bundler consumers (Webpack/Vite/Rollup) | main 22 KB, core 15 KB (gzip) | Tree-shaking depends on `sideEffects: false` — don't add top-level code with effects                           |
| CJS (`dist/cjs/`)     | Node / legacy bundlers                  | main 26 KB (gzip)             | Dual-package hazard: make sure exports map keeps ESM/CJS separate                                              |
| Types (`dist/types/`) | TypeScript consumers                    | no budget                     | Broken `.d.ts` is a silent editor-only regression; `npm run typecheck` does NOT catch downstream `.d.ts` drift |

The SDK is npm-only — there is no UMD bundle, no CDN distribution,
no script-tag entry point. Customers install via `npm install
@browsonic/sdk` and let their bundler emit the right format.

### `sideEffects: false`

`packages/sdk/package.json` declares `sideEffects: false`. Adding a
top-level `console.log`, `window.addEventListener` at import time, or
a self-registering singleton will break tree-shaking for **every
bundler consumer**. If you need setup, the consumer calls
`Browsonic.init()`. There is no init-on-import path.

### Package `exports` map

Public SDK entry points are `.`, `./core`, `./widget`. Adapter
packages each expose their own subpaths (e.g. `./integration` for
Astro, `./instrumentation` for Next.js). Add a subpath only when a
consumer actually needs it; each new entry is a forever-API.

## Source-map pipeline

Source-map upload + ingest-side symbolication shipped end-to-end on
2026-05-06 (v0.1). Architecture, decisions, and the v0.2 backlog are
captured in
[`docs/design/SOURCEMAP_PIPELINE.md`](./docs/design/SOURCEMAP_PIPELINE.md).
Two surfaces deliver the build-time half:

- [`packages/cli`](./packages/cli) (`@browsonic/cli`) — `browsonic
upload-sourcemaps` for any build pipeline; reads `BROWSONIC_*` env
  vars and Node 20 built-ins only.
- [`packages/build-tools`](./packages/build-tools) (`@browsonic/build-tools`)
  — Vite / Webpack / Rollup / esbuild plugins, one subpath each.

The runtime SDK does **not** participate in source-map upload. SDK-side
`debugId` injection is queued for 1.x.

## Testing discipline

- Coverage gates: statements ≥80%, branches ≥70%, functions ≥80%,
  lines ≥80%. Current numbers in
  [`packages/sdk/BENCHMARKS.md`](./packages/sdk/BENCHMARKS.md) — well
  above the floor. Don't regress toward the floor.
- **Test runtime is happy-dom 20.x**, not jsdom. Some jsdom-isms
  (IntersectionObserver polyfills, specific MutationObserver
  timing) behave differently — match what's in existing tests.
- **Network mocking**: tests do not hit the real service. The
  `transport/` tests stub `fetch` directly; respect that pattern.
- **Bench is a gate, not a report.** `bench:check` fails the build
  on >10% regression against `bench-baseline.json`. If you have a
  legitimate perf win, update the baseline **in the same PR**, with
  a diff comment explaining what improved.
- Adapter packages set their own per-framework testing-library
  conventions documented in their AGENTS.md.

## CI gates ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml))

| Job         | Blocking? | Notes                                                               |
| ----------- | --------- | ------------------------------------------------------------------- |
| `lint`      | yes       | ESLint flat, 0/0 + npm audit (critical)                             |
| `typecheck` | yes       | Single node 20 run; engine-agnostic                                 |
| `unit`      | yes       | Vitest one-shot + coverage gate (matrix node 20, 22)                |
| `bench`     | advisory  | `bench:check` — runner noise makes hard gating false-positive-prone |
| `size`      | yes       | size-limit against per-package `.size-limit.json`                   |

**E2E** lives in [`.github/workflows/e2e.yml`](./.github/workflows/e2e.yml)
and runs on `main` push + nightly cron + manual dispatch — **not on
every PR**. It's a heavy ~5-minute Playwright bring-up; PR feedback
stays fast on the gates above, e2e is the safety net before
release-cut.

**Release** ([`.github/workflows/release.yml`](./.github/workflows/release.yml))
runs on every push to `main`, `next`, or `release/*.x`:

- Driven by [semantic-release](https://semantic-release.gitbook.io)
  reading per-workspace `.releaserc.json`. Version is computed from
  Conventional Commits since the last tag — no manual `package.json`
  bump, no manual GitHub Release. `feat:` → minor,
  `fix:`/`perf:`/`refactor:`/`deps:` → patch, `BREAKING CHANGE:`
  footer → major. `docs:`, `chore:`, `ci:`, `test:` → no release.
- Branch policy: `main` → `latest`; `next` → `next` prerelease;
  `release/X.x` → LTS patch line.
- Attaches CycloneDX SBOM as a Release asset, and publishes with
  `npm --provenance` so the registry has cryptographic proof of
  which workflow built each version. **Don't remove the SBOM or
  provenance steps.** They are the chain of evidence for everyone
  who imports the SDK.

## Versioning & releases

- Semver strict. Breaking API → **major** bump + BREAKING note in
  the GitHub Release body (auto-generated by semantic-release from
  Conventional Commits; `BREAKING CHANGE:` footer is the source of
  truth).
- Pre-releases live on the `next` branch — semantic-release publishes
  them with npm dist-tag `next`; stable releases on `main` get
  `latest`. LTS lines on `release/X.x` patch the previous major.
- Release flow (fully automated):
  1. Land Conventional Commits on the target branch.
  2. Update [`packages/sdk/BENCHMARKS.md`](./packages/sdk/BENCHMARKS.md) if measurements moved.
  3. `release.yml` runs semantic-release per workspace → version bump,
     tag, CHANGELOG, GitHub Release with SBOM, `npm publish
--provenance` to the public npm registry.
- **Do not** hand-edit a `package.json` `version`, hand-create tags,
  or hand-create Releases — semantic-release owns that surface.

## Commits & PRs

- Convention: `<type>(<scope>): <short>`. Types: `feat`, `fix`,
  `sec`, `chore`, `ci`, `docs`, `refactor`, `test`, `perf`. Scope is
  the package name (`feat(react): …`, `fix(sdk): …`).
- Dependabot commits pass through untouched; don't rewrite them.
- PR bodies follow [`.github/pull_request_template.md`](./.github/pull_request_template.md):
  test count delta, bundle size delta, coverage delta, bench delta
  (when relevant), public-API impact, ingest-contract impact.
- Full contributor flow lives in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## Cross-repo contracts

- **Ingest backend** — the SDK posts batches to `POST /v1/events` on
  the operator-supplied `apiEndpoint`. The wire format is documented
  in [`packages/sdk/INTEGRATION.md`](./packages/sdk/INTEGRATION.md)
  and lives in `packages/sdk/src/types/`. Any change to the emitted
  shape is a breaking change to every backend that consumes it; bump
  the SDK major and announce in the GitHub Release notes.
- **Source-map ingest** — `@browsonic/cli` and `@browsonic/build-tools`
  speak `POST /v1/sourcemaps` (multipart) and the dashboard speaks
  `POST /v1/symbolicate`. Contract details in
  [`docs/design/SOURCEMAP_PIPELINE.md`](./docs/design/SOURCEMAP_PIPELINE.md).
- **Customer apps (third-party consumers)** — the biggest surface,
  invisible to this repo. A breaking change in the public API is a
  major bump, full stop.

## Deployment context

This SDK is a browser library, distributed via the public npm
registry. It runs inside customer browsers regardless of how the
ingest backend is hosted (SaaS, on-prem, or a bespoke implementation
the user wrote). Agents should keep that scope in mind:

- No k8s/helm artefacts, no multi-region config, no cloud-specific
  clients. The SDK has no opinion on how the backend is deployed.
- The bundle budget exists because the SDK loads inside customer
  browsers. Hosting choices on the receiving end do not change the
  budget.

## Common pitfalls

1. **"My bundle grew by 2KB for a one-liner."** Check `size:why`.
   New import paths from deeply shared code often pull in siblings
   through barrel re-exports. Fix: import from the concrete module
   file, not the barrel.
2. **"Tests pass locally, fail in CI."** Usually timing. happy-dom
   is faster than jsdom; `setTimeout(fn, 0)` and microtask ordering
   can differ vs real browsers. `await` the things you're testing,
   don't `setTimeout(done, 100)`-hope.
3. **"Lint says `no-floating-promises` but my function is clearly
   awaited."** The type-checked rule traces types, not runtime. If
   you wrap in a helper that returns `Promise<void>` and caller
   can't await it (e.g. event handler), the correct fix is
   `void fn()` not a lint suppression.
4. **"My `.d.ts` is missing an export."** `tsconfig.types.json`
   controls emit. Adding a new public export means the base
   tsconfig includes it, the types config emits it, and the
   `exports` map references it — three places, not one.
5. **"npm publish failed with 409 already_published."** The
   publish workflow has an idempotent check; re-running the
   Release is safe. If you deleted a version from the registry
   manually (don't), you've created a diverged state that only
   a fresh patch version fixes.
6. **"Coverage dropped for code I didn't touch."** Happy-dom upgrade
   sometimes surfaces previously-shadowed branches. Audit with
   `npm run test:coverage -- --reporter=verbose`.
7. **"Adapter typecheck fails with cannot resolve `@browsonic/sdk`."**
   The build script's topological order matters. Run the root
   `npm run build` (which builds sdk first) or
   `npm run _build:prereq` before iterating on an adapter in
   isolation.

## What agents specifically should do

- Before editing any package, skim this file +
  [`packages/sdk/BENCHMARKS.md`](./packages/sdk/BENCHMARKS.md) +
  the package's own `AGENTS.md`. Those carry the current policy state.
- When changing `src/`, confirm the affected bundle budget in
  the package's `.size-limit.json` after building. Cite the result
  in the PR.
- When touching a collector, check its test file. Collectors have
  companion tests named after them (`error.test.ts`,
  `xhr.test.ts`, etc.) — a PR that changes a collector without
  updating the test is incomplete.
- When changing privacy defaults, update
  [`packages/sdk/PRIVACY.md`](./packages/sdk/PRIVACY.md) in the
  same PR.
- When changing the wire format, update
  [`packages/sdk/INTEGRATION.md`](./packages/sdk/INTEGRATION.md)
  and bump the SDK major.
- When changing source-map upload behaviour, update
  [`docs/design/SOURCEMAP_PIPELINE.md`](./docs/design/SOURCEMAP_PIPELINE.md).
- Prefer narrowing `types/` to adding `any`. This library's public
  types are its contract surface.
- Do not touch `dist/`, `coverage/`, `e2e-results/`,
  `playwright-report/`, `bench-results.json` — all generated.

## SDK ↔ dashboard alignment rules (event-payload schema v2.3, landed S5+ 2026-05-08)

> The wire-format target is the **event-payload schema v2.3** documented
> in [`docs/design/EVENT_PAYLOAD_SCHEMA.md`](./docs/design/EVENT_PAYLOAD_SCHEMA.md).
> The SDK npm release line is independent: `@browsonic/sdk` is at `3.1.2`,
> the alignment commits will land on the next 3.x semantic-release.
> "Schema v2.3" below refers to the wire spec, not the npm version.

These rules came out of the 15-gap SDK ↔ dashboard alignment closure
program (Sprint 0 → Sprint 5+). Don't weaken them without explicit
sign-off from the program.

1. **Adapter identity is build-time stamped.** Each adapter's
   `scripts/stamp-version.mjs` writes `src/__pkg.ts` with
   `PACKAGE_NAME` / `PACKAGE_VERSION` constants from `package.json`
   before tsc. The `prebuild` hook runs it. Never hardcode the
   adapter name or version, and never read `package.json` at
   runtime — semantic-release rewrites only `package.json`, not
   bundled source.
2. **Top-level `registerAdapter()` is mandatory.** Each adapter's
   `src/index.ts` calls `registerAdapter({ name: PACKAGE_NAME, version: PACKAGE_VERSION })`
   at module load. The core SDK queues every batch with the active
   adapter snapshot via the registry (`packages/sdk/src/sentinel/adapter-registry.ts`).
   Don't skip this — `EventBatch.adapter` becomes empty and the
   dashboard's `AdapterBreakdownTable` flatlines.
3. **Web Vitals is opt-in.** `webVitalsPlugin()` is exported but not
   default-included in `defaultPlugins`. Native `PerformanceObserver`
   covers LCP/FCP/CLS/TTFB at ~1 KB; FID/INP need event-handler hooks
   and are deferred. Don't promote to default — Main ESM bundle
   budget is `24 KB gzipped` and we sit at `23.13 KB`
   (`+1.13 KB` of headroom from the pre-alignment baseline).
4. **Network detail goes through `utils/redaction.ts`.** Headers
   pass through `filterHeaders()` (allowlist + blocklist); bodies
   pass through `redactString()` (JWT / email / credit card / oauth
   secret regexes). Never attach raw `Headers` or untransformed body
   text to a `NetworkDetail`. The 11 redaction tests pin behavior;
   add a test for any new pattern.
5. **Diagnostics counters are per-batch deltas, not cumulative.**
   `dropsSincePreviousBatch` resets on every successful flush via
   `recordRetryAttempt()`; `lastFlushTimeMs` updates on success only.
   `permanent_fail` is a `DroppedReason` distinct from `transport_fail`
   — the former means retries exhausted, the latter is a single
   failed attempt. `<RetryOutcomesCard>` distinguishes them.
6. **Console verbs are preserved in telemetry.** `methodToLevel`
   maps `console.debug` → `'info'` for the `ERROR_LEVEL` union;
   `methodToTelemetryLevel` keeps the original verb (`'debug'`) for
   the timeline. Never collapse `debug` into `log` — dashboard
   breadcrumb filter buttons rely on the distinction.
7. **Wire schema is frozen.** Any change to `EventBatch`,
   `BrowsonicEvent`, `NetworkDetail`, `WebVitalMetric`,
   `PluginHealthSummary`, `QueueMetricsSnapshot`, or `AdapterIdentity`
   must update [`docs/design/EVENT_PAYLOAD_SCHEMA.md`](./docs/design/EVENT_PAYLOAD_SCHEMA.md)
   in the same PR. Backend `BatchRequest.java` / `EventRequest.java`
   must accept missing fields as `null` (SDK 2.2 backwards-compat).

## Updating this document

This file travels with the repo because the rules evolve with the
code. If you land a PR that invalidates a rule here, the same PR
updates this file. Orphan rules rot — reviewers enforce what the
file says, not what it used to say.
