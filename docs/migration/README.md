# Migration guides

This directory holds migration paths from existing browser error-tracking SDKs to Browsonic. Each guide documents the API mapping, step-by-step changes, and the deliberate divergences where Browsonic's scope differs.

| From                                             | Guide                                                      | Mapping difficulty                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `@sentry/browser` (or any `@sentry/<framework>`) | [`MIGRATION_FROM_SENTRY.md`](./MIGRATION_FROM_SENTRY.md)   | Mostly one-to-one; intentionally drops tracing / replay / profiling / multi-runtime / AI / feature flags. |
| TrackJS                                          | [`MIGRATION_FROM_TRACKJS.md`](./MIGRATION_FROM_TRACKJS.md) | Almost cosmetic — Browsonic targets the same scope, slightly richer breadcrumb model.                     |

## Codemod

A `jscodeshift` codemod that automates the most common renames is on the roadmap (see [`ROADMAP.md`](../../ROADMAP.md) "Later" section). Until then, the mapping tables in each guide are the source of truth.

## Per-framework quickstarts

For framework-specific install + wiring (React / Vue / Svelte / Next / Astro / Angular / Remix), see the package READMEs:

- [`packages/react/README.md`](../../packages/react/README.md)
- [`packages/vue/README.md`](../../packages/vue/README.md)
- [`packages/svelte/README.md`](../../packages/svelte/README.md)
- [`packages/nextjs/README.md`](../../packages/nextjs/README.md)
- [`packages/astro/README.md`](../../packages/astro/README.md)
- [`packages/angular/README.md`](../../packages/angular/README.md)
- [`packages/remix/README.md`](../../packages/remix/README.md)
