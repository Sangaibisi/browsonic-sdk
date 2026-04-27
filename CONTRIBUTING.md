# Contributing to Browsonic SDK

Thanks for considering a contribution. The repo is under active development and we welcome bug reports, feature suggestions, and pull requests.

## Code of Conduct

This project and everyone participating in it is governed by the [Contributor Covenant Code of Conduct](./CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Reporting bugs

Open an issue using the **Bug report** template. Include:

- A minimal reproduction (CodeSandbox, StackBlitz, or a small repo).
- Expected vs actual behaviour.
- Browser, OS, and SDK version.
- Whether it reproduces with the latest version on `main`.

## Reporting security vulnerabilities

Please do **not** file a public issue. See [SECURITY.md](./SECURITY.md) for the private disclosure path.

## Suggesting features

Open an issue with the **Feature request** template. Briefly: what problem are you trying to solve, what alternatives have you tried, and what would the API look like ideally? A small motivating example beats a long abstract description.

## Development setup

Requirements: Node 20 or newer, npm 10 or newer, a Chromium browser for E2E.

```bash
git clone https://github.com/Sangaibisi/browsonic-sdk.git
cd browsonic-sdk
npm ci
npm run typecheck
npm run lint
npm run test:run
```

You're ready when those four commands pass.

## Architecture

Read [AGENTS.md](./AGENTS.md). It is the operating manual for both human and AI contributors and explains the bundle-size discipline, the privacy defaults, the plugin contract, and the build matrix.

## Pull request workflow

1. Fork the repo and create a feature branch from `main`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/) for every commit message. The release pipeline reads them to compute the next version.
   - `feat: …` for user-facing additions (minor bump)
   - `fix: …`, `perf: …`, `refactor: …` (patch bump)
   - `BREAKING CHANGE:` footer for major bumps
   - `chore:`, `ci:`, `docs:`, `test:` produce no release
3. Run the full local gate before pushing:
   ```bash
   npm run lint
   npm run typecheck
   npm run test:coverage
   npm run size
   ```
4. Open the PR. Fill in the template. If the change touches the bundle, paste the `npm run size` delta. If it changes a benchmark, paste the `npm run bench` delta.
5. CI will run lint, typecheck, unit tests with coverage, microbenchmarks, bundle size, security scans, and dependency review. All must pass.
6. A maintainer will review. Expect the reviewer to push back on:
   - bundle bloat without justification,
   - new runtime dependencies,
   - missing tests on a public API change,
   - any weakening of a privacy default.

## Bundle size discipline

The SDK ships in customer browsers. Every byte costs all consumers. New imports, new exports, and new code paths need to be weighed against bundle impact. `npm run size:why` shows what pulled bytes in. If you cannot justify a > 1 KB regression, the PR will not merge.

## Tests

- Unit tests: `vitest`, happy-dom 20, `src/**/*.test.ts`. Required for every behaviour change.
- E2E: Playwright Chromium under `e2e/`. Required for changes that affect runtime cost (init time, longtasks, web-vitals delta).
- Bench: vitest bench under `bench/`. Required for changes to hot paths (queue enqueue, redaction, telemetry ring buffer).

## Coding style

- TypeScript strict, no `any`, no `!` non-null assertions.
- ESLint flat config (`eslint.config.mjs`); `npm run lint` is the source of truth.
- Prettier formats everything. Husky runs `lint-staged` on commit; `npm run format` does it manually.
- Public symbols carry TSDoc. Internal types are `@internal`.

## License

By submitting a contribution, you agree that your work is licensed under the [Apache License 2.0](./LICENSE).
