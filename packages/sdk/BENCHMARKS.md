# Benchmarks

Measured performance of `@browsonic/sdk`. Numbers are from the v2.2.0 release (measured 2026-04-27). The current package version is 2.2.1, a patch with no benchmark-affecting changes; figures have not been re-measured. The methodology and reproduction steps below let you re-run them on your own hardware.

## How to reproduce

```bash
npm ci
npm run build           # all distribution formats
npm run test:coverage   # unit suite + coverage gate
npm run bench           # microbenchmarks → bench-results.json
npm run size            # bundle size budgets
npm run build:e2e       # E2E IIFE bundle for Playwright
npx playwright test     # E2E perf specs
```

## Reference profiles

| Profile             | Description                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| **Desktop**         | macOS arm64 (or CI `ubuntu-latest`), Node 20, vitest 3, Playwright `chromium-headless-shell` 147 |
| **Mid-tier mobile** | Moto G4 emulation: 6× CPU throttle, "Fast 3G" network                                            |
| **Low-end mobile**  | 4× CPU throttle, "Slow 3G" network                                                               |

The CPU throttle is applied via Chrome DevTools Protocol from inside the Playwright spec, so it runs on plain CI hardware and is reproducible.

## Bundle size (gzipped)

Hard budgets enforced by [`size-limit`](https://github.com/ai/size-limit) in CI.

| Artefact                                           | Budget | v2.2.0 (measured 2026-04-27) |
| -------------------------------------------------- | ------ | ---------------------------- |
| `dist/esm/index.js` (main entry, default plugins)  | 22 KB  | 20.96 KB                     |
| `dist/esm/core.js` (no widget, no default plugins) | 15 KB  | 13.95 KB                     |
| `dist/esm/widget-entry.js` (widget plugin)         | 6 KB   | 5.67 KB                      |
| `dist/cjs/index.js`                                | 26 KB  | 24.18 KB                     |

Consumers that do not need the in-app widget should import from `@browsonic/sdk/core` to drop the widget code from their bundle.

## End-to-end performance

Measured against a synthetic test page in Playwright Chromium.

| Spec                       | Metric                                        | Measured | SLO         |
| -------------------------- | --------------------------------------------- | -------- | ----------- |
| `with-sdk.spec.ts`         | `init()` blocking time (desktop)              | 0.30 ms  | ≤ 15 ms p95 |
| `with-sdk.spec.ts`         | Long tasks during 2 s idle                    | 0        | 0           |
| `parse-cost.spec.ts`       | Bundle parse + compile (desktop)              | < 10 ms  | ≤ 50 ms     |
| `parse-cost.spec.ts`       | Bundle parse + compile (Moto G4 6× CPU)       | 5.90 ms  | ≤ 10 ms     |
| `parse-cost.spec.ts`       | `init()` on 6× CPU throttle                   | 2.70 ms  | ≤ 15 ms     |
| `memory.spec.ts`           | Heap delta over 2 min burst                   | 0.00 MB  | ≤ 2.5 MB    |
| `web-vitals-delta.spec.ts` | LCP delta vs no-SDK (desktop, 10-iter median) | -2 ms    | ≤ 50 ms     |
| `web-vitals-delta.spec.ts` | LCP delta vs no-SDK (mobile, 10-iter median)  | -6 ms    | ≤ 50 ms     |
| `web-vitals-delta.spec.ts` | CLS delta                                     | 0        | ≤ 0.01      |

Negative LCP deltas are within measurement noise; the takeaway is that the SDK does not move web vitals.

## Microbenchmarks

Run on a single Desktop profile with `vitest bench`. Numbers in ops/sec, higher is better.

| Path                                            | ops/sec    | p99 (ms) | Notes                                |
| ----------------------------------------------- | ---------- | -------- | ------------------------------------ |
| `queue.enqueue` (warm, unique events)           | 21,130     | 0.20     | Hot path; SLO p95 ≤ 1 ms             |
| `queue.enqueue` (dedup early-return)            | 3,258,475  | 0.0004   | 154× faster than the cold path       |
| Telemetry ring buffer `add()` (full, overwrite) | 1,312,358  | 0.0018   | 9× faster than push-into-empty       |
| `getRecent(5)` from telemetry                   | 18,220,515 | 0.0001   | Effectively free                     |
| Redact key lookup, `Set` exact match            | 22,148,015 | 0.0001   | Used for the first-pass redaction    |
| Redact key lookup, substring fallback           | 900,130    | 0.0015   | Pattern fallback for partial matches |
| `collectEventContext` per event                 | 6,360,099  | 0.0002   |                                      |

## Coverage

Hard gate enforced by `vitest` thresholds.

| Coverage   | Floor | Current |
| ---------- | ----- | ------- |
| Statements | ≥ 80% | ~88%    |
| Branches   | ≥ 70% | ~81%    |
| Functions  | ≥ 80% | ~83%    |
| Lines      | ≥ 80% | ~88%    |

## CI gates

| Gate             | Tool                                 | Action on failure                       |
| ---------------- | ------------------------------------ | --------------------------------------- |
| Type check       | `tsc --noEmit`                       | PR blocked                              |
| Lint             | `eslint .`                           | 0 errors required                       |
| Format           | `prettier --check`                   | PR blocked                              |
| Unit + coverage  | `vitest run --coverage`              | Coverage thresholds enforced            |
| Bench regression | `scripts/check-bench-regression.mjs` | > 10% slowdown vs previous CI run fails |
| Bundle size      | `size-limit`                         | Hard budget per artefact                |
| E2E perf         | Playwright assertions                | SLO thresholds enforced in spec         |
| Pre-commit       | Husky + lint-staged                  | Auto-fix lint and format on commit      |

## Regression policy

A regression of more than 10 % on any SLO blocks the merge. The fix is either a code change to bring the metric back, or a justified budget bump (PR description must explain why) — whichever the reviewer accepts. Budgets and current numbers are tracked in this file so the diff stays explicit.
