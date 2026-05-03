# Browsonic — Browser Error Tracking SDK + Adapters

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-3178c6.svg)](./LICENSE)

This is the Browsonic monorepo. It contains the core SDK and the framework adapters that wire the SDK into specific UI runtimes.

## Packages

| Package                                                                       | npm                                                                                                         | Purpose                                                                                                                                     |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@browsonic/sdk`](./packages/sdk)                                            | [![npm](https://img.shields.io/npm/v/@browsonic/sdk.svg)](https://www.npmjs.com/package/@browsonic/sdk)     | The core SDK — privacy-first browser RUM and error tracking, ~14-22 KB gzipped, framework-agnostic.                                         |
| [`@browsonic/react`](./packages/react) _(coming after monorepo migration M2)_ | [![npm](https://img.shields.io/npm/v/@browsonic/react.svg)](https://www.npmjs.com/package/@browsonic/react) | React adapter — `<BrowsonicErrorBoundary>`, hooks, HOC. Catches the render-time errors React boundaries swallow before they reach `window`. |
| `@browsonic/vue` _(planned, S6)_                                              | —                                                                                                           | Vue adapter — Composition API plugin + Vue Router instrumentation.                                                                          |
| `@browsonic/svelte` _(planned, S6)_                                           | —                                                                                                           | SvelteKit adapter — `handleError` hook + `+error.svelte` integration.                                                                       |
| `@browsonic/nextjs` _(planned, S7)_                                           | —                                                                                                           | Next.js adapter — App Router `error.tsx` / `global-error.tsx` integration.                                                                  |
| `@browsonic/astro` _(planned, S7)_                                            | —                                                                                                           | Astro adapter — View Transitions support.                                                                                                   |
| `@browsonic/angular` _(planned, S10)_                                         | —                                                                                                           | Angular adapter — `ErrorHandler` provider + Router instrumentation.                                                                         |
| `@browsonic/remix` _(planned, S10)_                                           | —                                                                                                           | Remix adapter — `entry.client.tsx` integration.                                                                                             |

## Why a monorepo?

Adapter ecosystems are easier to evolve when the SDK and its adapters live in one repo. Cross-package changes (SDK API extension + adapter rev) become single PRs. Tooling — TypeScript, ESLint, Prettier, Vitest, semantic-release — is set up once. Versioning stays per-package; each package publishes independently.

The repo follows the same shape as Sentry's [`getsentry/sentry-javascript`](https://github.com/getsentry/sentry-javascript), TanStack's product monorepos, and Vue's `vuejs/core`. Industry standard for SDK ecosystems.

## Repository layout

```
browsonic-sdk/                       ← this repo (npm workspaces root)
├── packages/
│   ├── sdk/                         → @browsonic/sdk (core SDK)
│   ├── react/                       → @browsonic/react (planned, S5.5 M2)
│   └── ...                          → vue / svelte / nextjs / astro / angular / remix
├── docs/
│   └── sprint-tracking/             → SPRINT_PLAN.md, CROSS_REPO_IMPACTS.md
├── examples/                        → demo apps (per-adapter)
├── .github/workflows/               → CI + release
├── AGENTS.md                        → operating manual for AI agents + contributors
├── ROADMAP.md                       → public-facing milestones
├── SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md
├── LICENSE (Apache-2.0), NOTICE
└── package.json                     → workspaces declaration + monorepo scripts
```

## Getting started (development)

```bash
# Install dependencies for every workspace at once
npm install

# Run common scripts across all workspaces
npm run build           # build every package that ships build artefacts
npm run test:run        # vitest one-shot in every workspace
npm run lint            # eslint per workspace
npm run typecheck       # tsc per workspace

# Or target a single package
npm run test:run --workspace=packages/sdk
npm run build --workspace=packages/sdk
```

For adapter-specific demos see `packages/<framework>/README.md` and the `examples/` directory.

## Documentation

- Public roadmap: [`ROADMAP.md`](./ROADMAP.md)
- Per-package docs: each package's `README.md` and `INTEGRATION.md` (when present)
- Operating manual for agents + humans: [`AGENTS.md`](./AGENTS.md) (root rules) and `packages/<name>/AGENTS.md` (package-specific rules where they exist)
- Sprint tracking: [`docs/sprint-tracking/SPRINT_PLAN.md`](./docs/sprint-tracking/SPRINT_PLAN.md) and [`CROSS_REPO_IMPACTS.md`](./docs/sprint-tracking/CROSS_REPO_IMPACTS.md)

## License

Apache License 2.0 — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
