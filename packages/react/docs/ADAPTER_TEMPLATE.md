# Adapter Template

> **For agents and humans writing the next framework adapter** —
> Vue, Svelte, Angular, Solid, Astro. This file distills the
> patterns established while building `@browsonic/react`. Treat it
> as a checklist, not a contract: you may diverge where the target
> framework idiom demands, but document the divergence in the new
> package's AGENTS.md.

## Why a template

`@browsonic/react` was built as the **pilot adapter** in Sprint 5
(see [browsonic-sdk SPRINT_PLAN.md](https://github.com/Sangaibisi/browsonic-sdk/blob/main/docs/sprint-tracking/SPRINT_PLAN.md)).
Sprints 6 (Vue + Svelte), 7 (Next + Astro), and 10 (Angular +
Remix) replicate the same shape. Without a template, every adapter
becomes a reinvention; with the template, four adapters take the
time of one and a third.

## 1. Repo bootstrap

### 1.1 GitHub repo

```bash
gh repo create Sangaibisi/browsonic-<framework> \
  --public \
  --description "<framework> adapter for @browsonic/sdk — error boundary, hooks, HOC. Apache-2.0." \
  --license apache-2.0 \
  --gitignore Node
gh repo clone Sangaibisi/browsonic-<framework>
```

`Node` gitignore + `apache-2.0` license seed the repo. Both are
the agreed choices across the Browsonic stack — diverge only with
a written justification.

### 1.2 Files committed in M1 (scaffold milestone)

Mirror `@browsonic/react`:

| File                                              | Purpose                                                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `package.json`                                    | name `@browsonic/<framework>`, peer deps for the framework, devDeps mirror this repo's                     |
| `tsconfig.json` + `tsconfig.{esm,cjs,types}.json` | strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `verbatimModuleSyntax`                |
| `eslint.config.mjs`                               | flat config, type-aware rules scoped to `src/**`, `*.config.{js,mjs,ts}` ignored                           |
| `.prettierrc.json` + `.prettierignore`            | match this repo (singleQuote, trailingComma all, printWidth 100)                                           |
| `vitest.config.ts`                                | `happy-dom` environment, coverage thresholds 80/70/80/80                                                   |
| `.releaserc.json`                                 | conventionalcommits preset, plugins: commit-analyzer, release-notes-generator, changelog, npm, git, github |
| `.npmrc`                                          | `legacy-peer-deps=true` if the framework's lint plugin lags ESLint majors                                  |
| `.husky/pre-commit`                               | `npx lint-staged`                                                                                          |
| `.github/workflows/ci.yml`                        | lint + typecheck + test matrix Node 20/22 + build                                                          |
| `.github/workflows/release.yml`                   | semantic-release on push to `main` / `next`                                                                |
| `.github/dependabot.yml`                          | weekly npm + github-actions, framework runtime pinned out of safe-updates                                  |
| `LICENSE` (Apache-2.0, gh seeded) + `NOTICE`      | `NOTICE` lists copyright + framework attribution                                                           |
| `AGENTS.md`                                       | adapt from this repo (privacy section, defensive contract, pitfalls per framework)                         |
| `README.md`                                       | "what this adapter ships" + compatibility table + privacy section                                          |
| `ROADMAP.md`                                      | milestone breakdown 0.1 / 0.2 / 0.3 mirrors this repo                                                      |

### 1.3 Files NOT committed in M1

- Source maps, `dist/`, `coverage/` — generated.
- A demo app — comes in M3.
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
  match this repo and the SDK.
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

This adapter's work is tracked in the **SDK repo's** SPRINT_PLAN.md
under the matching sprint number — do NOT open a parallel sprint
plan in the adapter repo. Cross-repo impacts (service tolerance,
dashboard fields) go in `browsonic-sdk/docs/sprint-tracking/CROSS_REPO_IMPACTS.md`.

## 6. Release flow

- `semantic-release` on `push` to `main`. First push containing a
  `feat:` commit cuts `0.1.0`.
- Branches: `main` → `latest`, `next` → `next` prerelease. LTS
  patch lines (if needed) live on `release/X.x`.
- `NPM_TOKEN` secret must exist in the GitHub repo settings before
  the first release push, or the workflow fails. Rotate the token
  with the SDK token's cadence.

## 6.1 Demo app pattern (`examples/<framework>-vite/`)

Every adapter ships a minimal demo that exercises every public
surface. The demo lives at `examples/<framework>-vite/` and:

- Consumes the adapter via `file:../..` (no npm publish required to
  try it locally).
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

Before the first `feat:` push to `main` triggers semantic-release:

- [ ] `NPM_TOKEN` repository secret exists (`gh secret list`). The
      release workflow fails loudly if missing — no silent
      half-publish.
- [ ] `npm view @browsonic/<framework>` returns 404 (package name
      not taken). If it returns a record, the org owns the name —
      proceed; otherwise reconcile with the squatter before push.
- [ ] `package.json` `publishConfig.access: "public"` and
      `provenance: true` set. `--provenance` is non-negotiable
      across the Browsonic stack.
- [ ] `peerDependencies` declares the framework version range AND
      `@browsonic/sdk` minimum compatible.
- [ ] CI workflow is green for the previous commit. semantic-release
      replays only on green builds.
- [ ] CHANGELOG entries (`feat:` / `fix:`) since last tag are
      readable and useful — they appear verbatim on the GitHub
      Release notes.

## 7. Migration / divergence checklist

When the target framework idiom forces a deviation from this template:

- [ ] Document the divergence in the adapter's AGENTS.md under a
      "Divergences from ADAPTER_TEMPLATE" section.
- [ ] Cross-link from this template if the divergence reveals a
      gap in the template itself (a PR back to `@browsonic/react`
      updating this file is the right move).
- [ ] Keep the public-API capability table (§2) consistent —
      framework idioms shape the **shape** of the API, not the
      capabilities.

## 8. Files to copy from this repo (literal starting point)

For an agent bootstrapping the next adapter:

```bash
# After repo clone, copy these as starting point and edit:
cp -r ../browsonic-react/.github .github
cp ../browsonic-react/.npmrc .
cp ../browsonic-react/.prettier* .
cp ../browsonic-react/.releaserc.json .
cp ../browsonic-react/.husky/pre-commit .husky/pre-commit
cp ../browsonic-react/tsconfig*.json .
cp ../browsonic-react/eslint.config.mjs .
cp ../browsonic-react/vitest.config.ts .
cp ../browsonic-react/AGENTS.md .          # then edit framework refs
cp ../browsonic-react/NOTICE .
cp ../browsonic-react/ROADMAP.md .
cp ../browsonic-react/README.md .
cp -r ../browsonic-react/docs .            # this template + future entries
```

Then edit:

- `package.json` — adapter name, framework peer deps, devDeps
- `AGENTS.md` — replace React-specific sections (concurrent rendering,
  class boundary, server components) with framework equivalents
- `README.md` — translate the "Why this adapter" section to the
  framework's reconciler / error-handling model
- `eslint.config.mjs` — swap react/react-hooks plugin for the
  framework's plugin

The shipped patterns (defensive contract, truncation, test
discipline, release flow) carry across without edits.
