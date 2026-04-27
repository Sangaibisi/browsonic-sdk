# AGENTS.md — browsonic-sdk

> Operating manual for AI coding agents (Claude Code, Cursor, Codex,
> Aider, Cascade) and human contributors. Every rule here was learned
> the hard way — a production regression, a failed release, or a CI
> red build. **Do not weaken a rule without a PR that explains what
> replaced it.**

## Purpose

`@browsonic/sdk` is a browser SDK that third-party applications embed
to ship telemetry (errors, navigation, XHR, console, pageview, visitor
context) to an HTTP ingest endpoint. It is the **one piece of code
that runs inside customer applications**, so the bar is
bundle-obsessive, fail-safe, privacy-first, and backwards-compatible.

The ingest endpoint is operator-supplied — there is no hard-coded
backend. The SDK is paired in production with the closed-source
Browsonic SaaS backend, but anything that speaks the documented
`/v1/events` payload works equally well.

Breaking this SDK breaks customer apps. Act accordingly.

## Tech stack (authoritative)

| Layer             | Technology                                                              | Pinned in                                                |
| ----------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| Language          | TypeScript (strict)                                                     | `tsconfig.json`                                          |
| Runtime           | Evergreen browsers + Node ≥18 for tests                                 | `package.json` engines                                   |
| Build (4 targets) | tsc → ESM + CJS + types; esbuild → UMD                                  | `tsconfig.{esm,cjs,types}.json`, `scripts/build-umd.mjs` |
| Test              | Vitest 3.x + happy-dom 20.x                                             | `vitest.config.ts`                                       |
| E2E               | Playwright chromium                                                     | `playwright.config.ts`, `e2e/`                           |
| Bench             | Vitest bench + regression check                                         | `scripts/check-bench-regression.mjs`                     |
| Bundle budget     | size-limit                                                              | `.size-limit.json`                                       |
| Lint              | ESLint 9 flat + typescript-eslint (type-checked src)                    | `eslint.config.mjs`                                      |
| Format            | Prettier + Husky + lint-staged                                          | `.prettierrc.json`, `.husky/pre-commit`                  |
| Publish           | Public npm registry as `@browsonic/sdk` (access: public, provenance on) | `publishConfig` in `package.json`                        |
| Release           | semantic-release on Conventional Commits                                | `.releaserc.json`, `.github/workflows/release.yml`       |
| Supply-chain      | npm provenance + CycloneDX SBOM + SHA-256 checksums on every Release    | `.github/workflows/release.yml`                          |

## Non-negotiables

Break any of these and the PR does not merge.

1. **SDK errors never crash the host application.** Every public API
   path is wrapped; internal failures emit a diagnostic and move on.
   The [circuit breaker](src/sentinel/) pauses collection after
   repeated internal failures. This is the single most load-bearing
   promise in the README. Regressions are critical severity.
2. **`npm run lint` = 0 errors, 0 warnings.** `no-non-null-assertion`,
   `no-explicit-any`, `no-unused-vars`, `no-floating-promises`
   (warn→error in src) are all **error** level. Non-null `!` was a
   regression source in 0.2.x (CRIT-001) — do not reintroduce it.
3. **`npm run typecheck` passes.** Two tsconfig chains — base + emit
   configs — must agree. Broken types in `dist/types/*.d.ts` break
   every downstream consumer silently (their editors lie).
4. **Bundle size budget holds.** `npm run size` must stay within the
   table in `.size-limit.json`. A 200-byte regression is fine; a
   2-KB regression needs a paragraph in the PR explaining why.
   Current ceilings (gzip): main 22 KB, core 15 KB, widget 6 KB,
   CJS 26 KB, raw 60 KB.
5. **Test count does not silently shrink.** A PR that drops the test
   count without naming which tests were removed and why is a smell.
   See `BENCHMARKS.md` for the current floor.
6. **Privacy defaults are masked defaults.** Passwords, tokens, API
   keys, input values are redacted by the collector layer; changing
   that default is a policy call, not a refactor. See `PRIVACY.md`.
7. **No `require()` or Node-only imports in src.** Browser runtime.
   If you need fs/path/node-fetch, you're probably in `scripts/` or
   `bench/`, not `src/`.
8. **Every public symbol carries a TSDoc comment.** Consumers read
   the generated types; unannotated exports leak our internal
   vocabulary into their IDE autocomplete.

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

### Pre-commit simulation

```bash
npx lint-staged                     # what husky runs; mirror exactly
```

### Build (four artefacts)

```bash
npm run build                       # esm + cjs + types + umd in order
npm run build:esm                   # tsc -p tsconfig.esm.json
npm run build:cjs                   # tsc -p tsconfig.cjs.json
npm run build:types                 # tsc -p tsconfig.types.json
npm run build:umd                   # scripts/build-umd.mjs (esbuild)
```

### Size + perf gates

```bash
npm run size                        # size-limit check against .size-limit.json
npm run size:why                    # explain the bundle — where bytes went
npm run bench                       # vitest bench → bench-results.json
npm run bench:check                 # regression gate vs bench-baseline.json (10% tolerance)
```

### E2E (requires chromium)

```bash
npm run build:e2e                   # build IIFE bundle that e2e/ loads
npm run test:e2e                    # playwright test
npm run test:e2e:ui                 # playwright with UI for local debug
```

### Everything (release dress rehearsal)

```bash
npm run perf:all                    # build + bench + size + e2e
```

## Project layout

```
src/
├── index.ts                 # main entry — ESM/CJS
├── core.ts                  # core-only entry (no widget) — slimmer bundle
├── widget-entry.ts          # widget plugin entry (opt-in)
├── plugin.ts                # plugin contract; widgets/collectors implement this
├── sentinel.ts              # legacy class + facade — DO NOT extend
├── sentinel/                # post-split module set (plugin manager, queue, lifecycle)
├── collectors/              # 8 pluggable collectors: error, xhr, network, console,
│                            #   pageview, callback, visitor, navigation
│                            # + helpers: dependencies, history-instrumentation, wrap, index
├── plugins/                 # first-party plugins composed from collectors
├── widget/                  # in-app widget (renderer, manager, rule-matcher,
│                            #   sanitize, safe-regex, styles)
├── config/                  # config validation + defaults
├── context/                 # session/user/tenant propagation
├── transport/               # outbound HTTP to browsonic-service
├── queue/                   # offline-capable event queue
├── telemetry/               # internal SDK metrics (self-monitoring)
├── diagnostics/             # failure surface for host app integration
├── types/                   # shared type surface (public + internal)
├── utils/                   # leaf helpers; keep dep-free
└── visitor/                 # visitor ID + fingerprinting

bench/                       # perf microbenchmarks — vitest bench
e2e/                         # Playwright specs + demo-app fixtures
scripts/                     # build + bench helpers (Node, not src)
docs/                        # public integration docs
dist/                        # build output — NEVER edited by hand
coverage/                    # vitest coverage — gitignored
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
- **`npm audit --audit-level=high --production=false`** is the gate
  in CI. HIGH+CRITICAL break the build; moderate/low go unblocked
  but show up in reports.
- No new runtime deps without a PR-body justification. This SDK
  ships in customer apps; every byte counts.

## Build-target discipline

Four artefact families are shipped:

| Target                            | Consumer                                | Budget                        | Pitfall                                                                                                              |
| --------------------------------- | --------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| ESM (`dist/esm/`)                 | bundler consumers (Webpack/Vite/Rollup) | main 22 KB, core 15 KB (gzip) | Tree-shaking depends on `sideEffects: false` — don't add top-level code with effects                                 |
| CJS (`dist/cjs/`)                 | Node / legacy bundlers                  | main 26 KB (gzip)             | Dual-package hazard: make sure exports map keeps ESM/CJS separate                                                    |
| Types (`dist/types/`)             | TypeScript consumers                    | no budget                     | Broken `.d.ts` is a silent editor-only regression; `npm run typecheck` does NOT catch downstream `.d.ts` drift       |
| UMD (`dist/umd/browsonic.min.js`) | script-tag / CDN / legacy               | ~22 KB gzip target            | esbuild config lives in `scripts/build-umd.mjs` — don't import from `src/index.ts` directly; import the compiled ESM |

### `sideEffects: false`

`package.json` declares `sideEffects: false`. Adding a top-level
`console.log`, `window.addEventListener` at import time, or a
self-registering singleton will break tree-shaking for **every
bundler consumer**. If you need setup, the consumer calls
`Browsonic.init()`. There is no init-on-import path.

### Package `exports` map

Public entry points are `.`, `./core`, `./widget`, `./umd`,
`./umd/unminified`. Add a subpath only when a consumer actually
needs it; each new entry is a forever-API.

## Testing discipline

- Coverage gates: statements ≥80%, branches ≥70%, functions ≥80%.
  Current numbers are well above these; don't regress toward them.
  Latest measurements are in `BENCHMARKS.md`.
- **Test runtime is happy-dom 20.x**, not jsdom. Some jsdom-isms
  (IntersectionObserver polyfills, specific MutationObserver
  timing) behave differently — match what's in existing tests.
- **Network mocking**: tests do not hit the real service. The
  `transport/` tests stub `fetch` directly; respect that pattern.
- **Bench is a gate, not a report.** `bench:check` fails the build
  on >10% regression against `bench-baseline.json`. If you have a
  legitimate perf win, update the baseline **in the same PR**, with
  a diff comment explaining what improved.

## CI gates (`.github/workflows/ci.yml`)

| Job         | Blocking?         | Notes                            |
| ----------- | ----------------- | -------------------------------- |
| `lint`      | yes               | ESLint flat, 0/0 + npm audit     |
| `typecheck` | yes               | matrix node 20, 22               |
| `unit`      | yes               | Vitest one-shot + coverage gate  |
| `bench`     | yes on regression | `bench:check` with 10% tolerance |
| `size`      | yes               | size-limit against JSON budget   |

**E2E** lives in `.github/workflows/e2e.yml` and runs on `main` push +
nightly cron + manual dispatch — **not on every PR**. It's a heavy
~5-minute Playwright bring-up; PR feedback stays fast on the gates
above, e2e is the safety net before release-cut.

**Release** (`.github/workflows/release.yml`) runs on every push to
`main`, `next`, or `release/*.x`:

- Driven by [semantic-release](https://semantic-release.gitbook.io)
  reading `.releaserc.json`. Version is computed from Conventional
  Commits since the last tag — no manual `package.json` bump, no
  manual GitHub Release. `feat:` → minor, `fix:`/`perf:`/`refactor:`/
  `deps:` → patch, `BREAKING CHANGE:` footer → major. `docs:`,
  `chore:`, `ci:`, `test:` → no release.
- Branch policy: `main` → `latest`; `next` → `next` prerelease;
  `release/X.x` → LTS patch line.
- Attaches CycloneDX SBOM + SHA-256 checksums + UMD bundle as
  Release assets, and publishes with `npm --provenance` so the
  registry has cryptographic proof of which workflow built each
  version. **Don't remove the SBOM, checksum, or provenance steps.**
  They are the chain of evidence for everyone who imports the SDK.

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
  2. Update `BENCHMARKS.md` if measurements moved.
  3. `release.yml` runs semantic-release → version bump, tag,
     CHANGELOG, GitHub Release with SBOM + checksums + UMD assets,
     `npm publish --provenance` to the public npm registry.
- **Do not** hand-edit `package.json` `version`, hand-create tags,
  or hand-create Releases — semantic-release owns that surface.

## Commits & PRs

- Convention: `<type>(<scope>): <short>`. Types: `feat`, `fix`,
  `sec`, `chore`, `ci`, `docs`, `refactor`, `test`, `perf`.
- Dependabot commits pass through untouched; don't rewrite them.
- PR bodies for non-trivial changes mention:
  - test count delta (expected: 0 unless you're adding/removing)
  - bundle size delta (from `npm run size`)
  - coverage delta (from `npm run test:coverage`)
  - bench delta (only if it moved)

## Cross-repo contracts

- **Ingest backend** — the SDK posts batches to `POST /v1/events` on
  the operator-supplied `apiEndpoint`. The wire format is documented
  in `INTEGRATION.md` and lives in `src/types/`. Any change to the
  emitted shape is a breaking change to every backend that consumes
  it; bump the SDK major and announce in the GitHub Release notes.
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
5. **"UMD bundle silently broke."** `scripts/build-umd.mjs` uses
   esbuild. It does NOT use the TS compiler; it consumes
   `dist/esm/*.js`. Running `build:umd` without a fresh
   `build:esm` first gives you a stale UMD.
6. **"npm publish failed with 409 already_published."** The
   publish workflow has an idempotent check; re-running the
   Release is safe. If you deleted a version from the registry
   manually (don't), you've created a diverged state that only
   a fresh patch version fixes.
7. **"Coverage dropped for code I didn't touch."** Happy-dom upgrade
   sometimes surfaces previously-shadowed branches. Audit with
   `npm run test:coverage -- --reporter=verbose`.

## What agents specifically should do

- Before editing, skim this file + `BENCHMARKS.md`. Those two carry
  the current policy state.
- When changing `src/`, confirm the affected bundle budget in
  `.size-limit.json` after building. Cite the result in the PR.
- When touching a collector, check its test file. Collectors have
  companion tests named after them (`error.test.ts`,
  `xhr.test.ts`, etc.) — a PR that changes a collector without
  updating the test is incomplete.
- Prefer narrowing `types/` to adding `any`. This library's public
  types are its contract surface.
- Do not touch `dist/`, `coverage/`, `e2e-results/`,
  `playwright-report/`, `bench-results.json` — all generated.

## Updating this document

This file travels with the repo because the rules evolve with the
code. If you land a PR that invalidates a rule here, the same PR
updates this file. Orphan rules rot — reviewers enforce what the
file says, not what it used to say.
