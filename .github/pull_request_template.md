<!--
Keep the PR body honest. Anything you check below is a claim the
reviewer can (and will) spot-check against the diff.

Rules this PR promises to respect live in AGENTS.md at the repo
root. When a rule conflicts with what you're doing, update AGENTS.md
in the same PR and explain why.
-->

## What changed

<!--
One paragraph. WHY, not what. The diff shows what.
If this is a security fix, name the CVE / advisory.
If this is a public-API change, mark it as breaking + name the major
bump it forces.
-->

## How it was verified

- [ ] `npm run lint` — 0 errors, 0 warnings
- [ ] `npm run typecheck` clean
- [ ] `npm run test:run` green (test count: \_\_\_, delta vs `main`: \_\_\_)
- [ ] `npm run test:coverage` — gates still met (statements ≥80%, branches ≥70%, functions ≥80%)
- [ ] `npm run build` succeeds for all 4 targets (esm + cjs + types + umd)
- [ ] `npm run size` within `.size-limit.json` budget
- [ ] `npm run bench:check` no regression (or baseline updated in this PR)
- [ ] `npm run test:e2e` green if the change touches collectors / transport / widget

## Bundle + perf delta

<!--
Required for any change in src/. Grab numbers from `npm run size`.

| Artefact | Before | After | Delta |
|---|---|---|---|
| Main ESM (gzip) | __ KB | __ KB | __ |
| Core ESM (gzip) | __ KB | __ KB | __ |
| Widget plugin (gzip) | __ KB | __ KB | __ |
| CJS (gzip) | __ KB | __ KB | __ |
-->

## Public API impact

<!-- One of: -->

- [ ] No public API change (internal refactor, infra, docs)
- [ ] Additive only — new exported symbol, no break
- [ ] Behavioural change in existing API — needs CHANGELOG entry under "Changed"
- [ ] **BREAKING** — needs major bump + CHANGELOG `BREAKING` entry

## Privacy / security checklist

- [ ] No new top-level side effects (would break `sideEffects: false`)
- [ ] No new non-null `!` assertions in `src/`
- [ ] No new `any` in `src/`
- [ ] No customer PII flowing into collectors without an explicit mask
- [ ] No `console.log`/`debug` left enabled in shipped code paths

## Ingest contract impact

<!--
Tick if this PR changes the wire format the SDK posts to /v1/events.
Operators of self-hosted ingest backends rely on this surface.
-->

- [ ] No change to the `/v1/events` payload shape.
- [ ] Additive change only (new optional fields). Documented in `INTEGRATION.md`.
- [ ] **Breaking** wire-format change — needs major bump and migration notes.

## Release plan

<!-- If this PR will ship in a release: -->

- [ ] Version bump in `package.json` happens in: this PR / a follow-up release PR
- [ ] CHANGELOG entry: \_\_\_
- [ ] Pre-release dist-tag: latest / next
