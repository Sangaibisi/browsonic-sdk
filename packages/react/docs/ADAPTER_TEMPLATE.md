# Adapter Template

> **For agents and humans writing the next framework adapter** —
> Vue, Svelte, Angular, Solid, Astro. This file distills the
> patterns established while building `@browsonic/react`. Treat it
> as a checklist, not a contract: you may diverge where the target
> framework idiom demands, but document the divergence in the new
> package's `AGENTS.md`.

## Why a template

`@browsonic/react` was built as the **pilot adapter** in Sprint 5
(see [SPRINT_PLAN.md](../../../docs/sprint-tracking/SPRINT_PLAN.md)).
After the **S5.5 monorepo migration** (2026-05-04), every framework
adapter ships as a new workspace inside the `browsonic-sdk` monorepo
under `packages/<framework>/`. Sprints 6 (Vue + Svelte), 7 (Next +
Astro), and 10 (Angular + Remix) replicate the same shape.

Without a template, every adapter becomes a reinvention. With the
template — and the workspace flow below — adding an adapter takes
30 minutes instead of 2 hours.

## 0. Monorepo workflow (post-S5.5)

**No new GitHub repository is created.** The adapter is a new
workspace inside `browsonic-sdk`'s `packages/` directory. Skeleton:

```bash
# from the browsonic-sdk repo root
mkdir -p packages/<framework>/src packages/<framework>/docs
cd packages/<framework>
# copy starter files (see §8 below) from packages/react and edit
# framework-specific bits.
cd ../..
npm install            # workspaces resolve the new package automatically
```

`node_modules/@browsonic/<framework>` symlinks back to
`packages/<framework>` so other packages can import it via
`@browsonic/<framework>` (registry-style name) and the resolution
works identically in dev (workspace symlink) and at consumer
install (npm registry).

## 1. Package bootstrap (M1 milestone)

Mirror `@browsonic/react`. Files committed in M1:

| File                                              | Purpose                                                                                                                                                                        |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                    | name `@browsonic/<framework>`, peer deps for the framework + `@browsonic/sdk: ^2.x`, devDeps mirror `packages/react`                                                           |
| `tsconfig.json` + `tsconfig.{esm,cjs,types}.json` | strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`                                                                                    |
| `eslint.config.mjs`                               | flat config, type-aware rules scoped to `src/**`, `*.config.{js,mjs,ts}` + `examples/**` ignored                                                                               |
| `.prettierrc.json` + `.prettierignore`            | match `packages/react`                                                                                                                                                         |
| `vitest.config.ts`                                | `happy-dom` environment, coverage thresholds 80/70/80/80                                                                                                                       |
| `.releaserc.json`                                 | conventionalcommits preset, plugins: commit-analyzer, release-notes-generator, changelog, npm, git, github                                                                     |
| `.npmrc`                                          | `legacy-peer-deps=true` if the framework's lint plugin lags ESLint majors (root `.npmrc` already carries this — only override if you need different behaviour for the package) |
| `NOTICE`                                          | copyright + framework attribution                                                                                                                                              |
| `AGENTS.md`                                       | adapt from `packages/react/AGENTS.md` (privacy section, defensive contract, framework-specific pitfalls)                                                                       |
| `README.md`                                       | "what this adapter ships" + compatibility table + privacy section                                                                                                              |
| `ROADMAP.md`                                      | milestone breakdown 0.1 / 0.2 / 0.3 mirrors `packages/react/ROADMAP.md`                                                                                                        |

**Files NOT in the package:**

- `LICENSE` — the monorepo root carries one Apache-2.0 LICENSE that covers every workspace.
- `.github/`, `.husky/`, `.gitignore` — root-level, inherited by every workspace.
- A demo app — comes in M3 under `packages/<framework>/examples/<framework>-vite/`.
- `CHANGELOG.md` — semantic-release generates it on first release.

## 2. Public API surface

Every adapter ships these four primitives, named for the framework's
idiom:

| Capability     | React                      | Vue                              | Svelte                            | Angular                           |
| -------------- | -------------------------- | -------------------------------- | --------------------------------- | --------------------------------- |
| Error boundary | `<BrowsonicErrorBoundary>` | `<BrowsonicErrorBoundary>` SFC   | `<svelte:options>` + `setContext` | `ErrorHandler` provider           |
| SDK lookup     | `useBrowsonic()` hook      | `useBrowsonic()` Composition API | `getBrowsonic()` from store       | `BrowsonicService` injectable     |
| User context   | `useUser(user \| null)`    | `useUser(ref)`                   | `setUser(user)` action            | `BrowsonicService.setUser()`      |
| Manual capture | `useCaptureError()`        | `useCaptureError()`              | `captureError()` action           | `BrowsonicService.captureError()` |

The semantics are **identical** — only the binding to the host
framework's reactivity model differs. Documentation copy can
parallel-translate the React README sections.

## 3. Defensive contract (non-negotiable)

Every adapter MUST:

1. **Never crash the host app.** SDK methods are wrapped in
   `try { sdk.xyz() } catch {}` at every adapter call site. If
   reporting fails, the boundary still renders fallback, the hook
   still runs, the service method still returns.
2. **Be a no-op when SDK is unreachable.** `resolveSdk()` returns
   `null` in server / sandboxed / not-yet-initialised contexts.
   Adapter code paths must check for null and skip silently.
3. **Truncate component / element stack to 1024 chars** before
   forwarding to `sdk.addMetadata`. Frameworks often produce
   verbose nested-component diagnostics; uncapped, they bloat
   event payloads.
4. **Zero runtime dependencies** beyond `@browsonic/sdk` and the
   target framework (both peerDeps). Anything else lives in the
   SDK.

## 4. Test discipline

- Vitest one-shot is the CI gate; coverage thresholds 80/70/80/80
  match the SDK and the React adapter.
- Use the **framework's official testing library**:
  - React → `@testing-library/react`
  - Vue → `@testing-library/vue`
  - Svelte → `@testing-library/svelte`
  - Angular → `@angular/core/testing` + `@testing-library/angular`
- Tests cover **at least** these failure modes per primitive:
  - normal happy-path render / call
  - SDK-unreachable fallthrough (no crash)
  - SDK-throws-inside-method defensive isolation
  - reset / clear / unmount paths

## 5. Sprint discipline

This adapter's work is tracked in the monorepo's
[`docs/sprint-tracking/SPRINT_PLAN.md`](../../../docs/sprint-tracking/SPRINT_PLAN.md)
under the matching sprint number — do NOT open a parallel sprint
plan inside the package. Cross-package impacts (e.g. SDK API
change forces adapter rev) become a **single PR** touching both
packages — that is the whole point of the monorepo. Cross-repo
impacts (service tolerance, dashboard fields) go in
[`docs/sprint-tracking/CROSS_REPO_IMPACTS.md`](../../../docs/sprint-tracking/CROSS_REPO_IMPACTS.md).

## 6. Release flow

- `semantic-release` runs **per package** via the root
  `release.yml` invocation `npm run semantic-release --workspaces
--if-present`. Each workspace owns its own `.releaserc.json` +
  CHANGELOG + version, decided independently from commit messages
  scoped to that package's path.
- Branches: `main` → `latest`, `next` → `next` prerelease. LTS
  patch lines (if needed) on `release/X.x`.
- `NPM_TOKEN` lives at the **monorepo root** GitHub secret. One
  token covers every workspace publish — no per-package secret
  setup. Rotate alongside the SDK token.

## 6.1 Demo app pattern (`examples/<framework>-vite/`)

Every adapter ships a minimal demo that exercises every public
surface. The demo lives at `packages/<framework>/examples/<framework>-vite/`
and:

- Consumes the parent adapter via `file:../..` (no npm publish
  required to try it locally).
- Initialises the SDK in the bootstrap module and exposes it on
  `window.Browsonic.getBrowsonic()` so the adapter's `resolveSdk()`
  helper finds it.
- Renders **at least one** of every public primitive: error
  boundary, SDK lookup, user context, manual capture, HOC. Each
  primitive should be reachable from the page (button → trigger,
  visible state → "SDK reachable: yes/no").
- Inline styles only. The demo doubles as documentation; a styling
  system would obscure the SDK surface.
- README explains "Run it locally" and "What this demo deliberately
  does NOT do" — explicit non-goals avoid scope creep PRs.

The demo is **not** in CI. It is browsed and run by humans
evaluating the adapter; CI matters for adapter correctness.

## 6.2 First publish checklist

Before the first `feat:` push to `main` triggers semantic-release
for a new adapter:

- [ ] `NPM_TOKEN` repository secret already exists at the monorepo
      root (it does — set during S5 / S5.5).
- [ ] `npm view @browsonic/<framework>` returns 404 (package name
      not taken).
- [ ] Package's `package.json` `publishConfig.access: "public"` and
      `provenance: true` set. `--provenance` is non-negotiable.
- [ ] `peerDependencies` declares the framework version range AND
      `@browsonic/sdk` minimum compatible.
- [ ] Root CI is green for the previous commit. semantic-release
      only replays on green builds.
- [ ] CHANGELOG entries (`feat:` / `fix:`) since last package tag
      are readable and useful.

## 7. Migration / divergence checklist

When the target framework idiom forces a deviation from this template:

- [ ] Document the divergence in the adapter's AGENTS.md under a
      "Divergences from ADAPTER_TEMPLATE" section.
- [ ] Cross-link from this template if the divergence reveals a
      gap in the template itself (a PR back to this file is the
      right move; it lives in the same monorepo).
- [ ] Keep the public-API capability table (§2) consistent —
      framework idioms shape the **shape** of the API, not the
      capabilities.

## 8. Files to copy from this package (literal starting point)

For an agent bootstrapping the next adapter:

```bash
# from the browsonic-sdk repo root, scaffolding packages/<framework>:
cd packages/<framework>
cp ../react/.prettierrc.json .
cp ../react/.prettierignore .
cp ../react/.releaserc.json .
cp ../react/tsconfig.json ../react/tsconfig.cjs.json ../react/tsconfig.esm.json ../react/tsconfig.types.json .
cp ../react/eslint.config.mjs .
cp ../react/vitest.config.ts .
cp ../react/AGENTS.md .          # then edit framework refs
cp ../react/NOTICE .
cp ../react/ROADMAP.md .
cp ../react/README.md .
mkdir -p docs && cp ../react/docs/ADAPTER_TEMPLATE.md docs/   # propagate this file
```

CI workflows + dependabot live at the **monorepo root**
(`.github/workflows/`); the adapter inherits them automatically by
being a workspace. **Do not create per-package `.github/`
directories.**

`.npmrc` is also at the monorepo root — only put a per-package
`.npmrc` if the package needs different behaviour from the rest of
the monorepo.

Then edit:

- `package.json` — adapter name (`@browsonic/<framework>`),
  framework peer deps (`peerDependencies` includes the framework
  - `@browsonic/sdk: ^2.x`), devDeps for the framework's testing
    library
- `AGENTS.md` — replace React-specific sections (concurrent
  rendering, class boundary, server components) with the target
  framework's equivalents
- `README.md` — translate the "Why this adapter" section to the
  framework's reconciler / error-handling model
- `eslint.config.mjs` — swap react/react-hooks plugin for the
  framework's plugin

The shipped patterns (defensive contract, truncation, test
discipline, release flow, file:../.. demo linking) carry across
without edits — workspaces resolve `@browsonic/sdk` and the
sibling adapters via symlinks at install time.

## 9. Closing the old standalone repo (S5.5 + transitional)

If the adapter previously lived in its own GitHub repo (the React
adapter did, before S5.5), archive that repo **after** the content
has been imported into the monorepo and the first monorepo-side
release has shipped. Use:

```bash
gh repo archive Sangaibisi/browsonic-<framework>
```

`gh repo archive` keeps every commit reachable read-only; do NOT
`gh repo delete`. Outbound links to commit hashes from CHANGELOG,
GitHub Releases, npm provenance, and external blogs must keep
resolving — deletion breaks all of those silently.

For adapters opened directly in the monorepo (S6 onwards), this
section does not apply.
