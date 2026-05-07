# Browsonic — Browser Error Tracking SDK + Adapters

[![License: Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-3178c6.svg)](./LICENSE)

This is the Browsonic monorepo. It contains the core SDK and the framework adapters that wire the SDK into specific UI runtimes.

## Packages

All seven framework adapters ship from this monorepo. Pick the package that matches your runtime — peer-only typing on the framework keeps every adapter's published bundle pure-TypeScript.

| Package                                    | npm                                                                                                             | Surface                                                                                                                                                                              |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@browsonic/sdk`](./packages/sdk)         | [![npm](https://img.shields.io/npm/v/@browsonic/sdk.svg)](https://www.npmjs.com/package/@browsonic/sdk)         | Core SDK — privacy-first browser RUM and error tracking, ~14–22 KB gzipped, framework-agnostic. Public scope/breadcrumb/tag API, session-health rollups.                             |
| [`@browsonic/react`](./packages/react)     | [![npm](https://img.shields.io/npm/v/@browsonic/react.svg)](https://www.npmjs.com/package/@browsonic/react)     | `<BrowsonicErrorBoundary>` class component, `useBrowsonic` / `useUser` / `useCaptureError` hooks, `withBrowsonic` HOC.                                                               |
| [`@browsonic/vue`](./packages/vue)         | [![npm](https://img.shields.io/npm/v/@browsonic/vue.svg)](https://www.npmjs.com/package/@browsonic/vue)         | 0.3 — Vue 3 boundary + four composables, plugin install, Vue Router 4 navigation breadcrumbs (with intent phase), Pinia integration.                                                 |
| [`@browsonic/svelte`](./packages/svelte)   | [![npm](https://img.shields.io/npm/v/@browsonic/svelte.svg)](https://www.npmjs.com/package/@browsonic/svelte)   | 0.3 — SvelteKit `handleError` factory (generic over `App.Error`), navigation breadcrumb instrumentation, `withBrowsonicAction`, `+error.svelte` reporter.                            |
| [`@browsonic/nextjs`](./packages/nextjs)   | [![npm](https://img.shields.io/npm/v/@browsonic/nextjs.svg)](https://www.npmjs.com/package/@browsonic/nextjs)   | 0.2 — App Router error pages (with `pathname` / `params` context), Pages Router companions, route-handler wrapper, `withBrowsonicConfig`.                                            |
| [`@browsonic/astro`](./packages/astro)     | [![npm](https://img.shields.io/npm/v/@browsonic/astro.svg)](https://www.npmjs.com/package/@browsonic/astro)     | 0.3 — auto-injecting Astro Integration, View Transitions breadcrumbs (intent + completed), `withBrowsonicAstroAction`, `tagAsAstroIsland`.                                           |
| [`@browsonic/angular`](./packages/angular) | [![npm](https://img.shields.io/npm/v/@browsonic/angular.svg)](https://www.npmjs.com/package/@browsonic/angular) | 0.3 — `ErrorHandler` drop-in, `BrowsonicService`, `provideBrowsonic()`, Router instrumentation, `createBrowsonicHttpReporter` HttpClient companion.                                  |
| [`@browsonic/remix`](./packages/remix)     | [![npm](https://img.shields.io/npm/v/@browsonic/remix.svg)](https://www.npmjs.com/package/@browsonic/remix)     | 0.3 — Route ErrorBoundary drop-in, action + loader wrappers, `bootstrapBrowsonic` entry helper, `useRemixNavigationBreadcrumbs` hook with route hierarchy.                           |
| [`@browsonic/cli`](./packages/cli)         | [![npm](https://img.shields.io/npm/v/@browsonic/cli.svg)](https://www.npmjs.com/package/@browsonic/cli)         | 0.1 — `browsonic upload-sourcemaps` build-time CLI for the source-map pipeline. Pure-TypeScript, zero runtime deps. Ships a `--dry-run` mode for CI smoke tests and local debugging. |

Each adapter ships independently via per-workspace semantic-release. See per-package READMEs for full Quickstart + API surface. The source-map pipeline architecture is documented in [`docs/design/SOURCEMAP_PIPELINE.md`](./docs/design/SOURCEMAP_PIPELINE.md).

## Why a monorepo?

Adapter ecosystems are easier to evolve when the SDK and its adapters live in one repo. Cross-package changes (SDK API extension + adapter rev) become single PRs. Tooling — TypeScript, ESLint, Prettier, Vitest, semantic-release — is set up once. Versioning stays per-package; each package publishes independently.

The repo follows the same shape as Sentry's [`getsentry/sentry-javascript`](https://github.com/getsentry/sentry-javascript), TanStack's product monorepos, and Vue's `vuejs/core`. Industry standard for SDK ecosystems.

## Repository layout

```
browsonic-sdk/                       ← this repo (npm workspaces root)
├── packages/
│   ├── sdk/                         → @browsonic/sdk
│   ├── react/                       → @browsonic/react
│   ├── vue/                         → @browsonic/vue (0.3)
│   ├── svelte/                      → @browsonic/svelte (0.3)
│   ├── nextjs/                      → @browsonic/nextjs (0.2)
│   ├── astro/                       → @browsonic/astro (0.3)
│   ├── angular/                     → @browsonic/angular (0.3)
│   ├── remix/                       → @browsonic/remix (0.3)
│   └── cli/                         → @browsonic/cli (0.1, build-time CLI)
├── docs/
│   └── design/                      → SOURCEMAP_PIPELINE.md
├── examples/                        → demo apps (per-adapter)
├── .github/workflows/               → CI + release.yml (per-workspace semantic-release)
├── AGENTS.md                        → operating manual for AI agents + contributors
├── SECURITY.md, CODE_OF_CONDUCT.md, CONTRIBUTING.md
├── LICENSE (Apache-2.0), NOTICE
└── package.json                     → workspaces + npm overrides for transitive vuln pins
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

- Per-package docs: each package's `README.md` and `ROADMAP.md`; SDK additionally ships [`INTEGRATION.md`](./packages/sdk/INTEGRATION.md), [`PRIVACY.md`](./packages/sdk/PRIVACY.md), [`BENCHMARKS.md`](./packages/sdk/BENCHMARKS.md)
- Operating manual for agents + humans: [`AGENTS.md`](./AGENTS.md) (root rules) and `packages/<name>/AGENTS.md` (package-specific rules where they exist)
- Source-map pipeline architecture: [`docs/design/SOURCEMAP_PIPELINE.md`](./docs/design/SOURCEMAP_PIPELINE.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`SECURITY.md`](./SECURITY.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)

## License

Apache License 2.0 — see [`LICENSE`](./LICENSE) and [`NOTICE`](./NOTICE).
