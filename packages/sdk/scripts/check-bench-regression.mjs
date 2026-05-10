#!/usr/bin/env node
/**
 * Compare current bench-results.json against a baseline and fail CI if
 * any benchmark regressed by more than the threshold.
 *
 * Usage:
 *   node scripts/check-bench-regression.mjs [baseline.json] [threshold]
 *
 * Arguments:
 *   baseline.json  — path to prior bench-results.json (default: bench-baseline.json)
 *   threshold      — max allowed slowdown ratio (default: 0.10 → 10%)
 *
 * CI flow:
 *   1. Download bench-results.json from the previous main build as
 *      `bench-baseline.json` (actions/download-artifact).
 *   2. Run `npm run bench` → writes current bench-results.json.
 *   3. Run this script — fails with non-zero exit on regression.
 *   4. Upload current bench-results.json as artifact for next run.
 *
 * See PERFORMANCE-STRATEGY.md §7.1 + BASELINE.md.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const [, , baselineArg = 'bench-baseline.json', thresholdArg = '0.10'] = process.argv;
const baselinePath = resolve(process.cwd(), baselineArg);
const currentPath = resolve(process.cwd(), 'bench-results.json');
const threshold = Number(thresholdArg);

if (!Number.isFinite(threshold) || threshold < 0) {
  console.error(`[bench-regression] invalid threshold: ${thresholdArg}`);
  process.exit(2);
}

if (!existsSync(currentPath)) {
  console.error(`[bench-regression] missing ${currentPath}. Run "npm run bench" first.`);
  process.exit(2);
}

// No baseline → first CI run; emit baseline and exit 0.
if (!existsSync(baselinePath)) {
  console.log(`[bench-regression] No baseline at ${baselinePath}. Skipping (first run).`);
  process.exit(0);
}

const current = JSON.parse(readFileSync(currentPath, 'utf8'));
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

/**
 * Vitest bench JSON shape (v1.6):
 *   {
 *     files: [
 *       {
 *         filepath: "...",
 *         groups: [
 *           {
 *             fullName: "group > subgroup",
 *             benchmarks: [
 *               { name: "bench label", result: { hz, mean, p99, samples, ... } }
 *             ]
 *           }
 *         ]
 *       }
 *     ]
 *   }
 */
function flatten(report) {
  const map = new Map();
  for (const file of report.files ?? []) {
    for (const group of file.groups ?? []) {
      for (const bench of group.benchmarks ?? []) {
        const key = `${group.fullName}::${bench.name}`;
        const hz = bench.result?.hz ?? bench.hz;
        if (hz == null) continue;
        map.set(key, hz);
      }
    }
  }
  return map;
}

const currentMap = flatten(current);
const baselineMap = flatten(baseline);

const regressions = [];
const improvements = [];
const missing = [];

for (const [key, baselineHz] of baselineMap) {
  const currentHz = currentMap.get(key);
  if (currentHz == null) {
    missing.push(key);
    continue;
  }
  const delta = (currentHz - baselineHz) / baselineHz;
  const label = `${key}: ${baselineHz.toFixed(0)} → ${currentHz.toFixed(0)} hz (${(delta * 100).toFixed(1)}%)`;
  if (delta < -threshold) {
    regressions.push(label);
  } else if (delta > 0.05) {
    improvements.push(label);
  }
}

if (improvements.length) {
  console.log(`\n[bench-regression] Improvements (≥+5%):`);
  for (const l of improvements) console.log(`  ✓ ${l}`);
}

if (missing.length) {
  console.log(`\n[bench-regression] Benchmarks removed since baseline:`);
  for (const l of missing) console.log(`  − ${l}`);
}

if (regressions.length) {
  console.error(`\n[bench-regression] REGRESSIONS (>${(threshold * 100).toFixed(0)}% slower):`);
  for (const l of regressions) console.error(`  ✗ ${l}`);
  console.error(
    `\nFailing CI. To accept these, update bench-baseline.json or explain in PR description.`
  );
  process.exit(1);
}

console.log(`\n[bench-regression] OK — no regressions beyond ${(threshold * 100).toFixed(0)}%.`);
process.exit(0);
