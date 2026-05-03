/**
 * Playwright configuration for e2e performance tests.
 *
 * PERFORMANS-STRATEJISI.md §7.2 — E2E perf suite runs in CI on three device profiles:
 *   - Desktop baseline
 *   - Mid-tier mobile (Moto G4 proxy, 6x CPU throttle, Fast 3G)
 *   - Low-end mobile (4x CPU throttle + Slow 3G)
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4319;

export default defineConfig({
  testDir: './e2e/perf',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // perf tests should not contend for CPU
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // serial for deterministic perf numbers
  reporter: [
    ['list'],
    ['json', { outputFile: 'e2e-results/results.json' }],
    ...(process.env.CI ? [['github'] as const] : []),
  ],

  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'on-first-retry',
    video: 'off',
    screenshot: 'only-on-failure',
    // Each test gets a fresh context for deterministic memory measurements
  },

  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1366, height: 768 },
        launchOptions: {
          // Enables globalThis.gc() for memory leak specs.
          args: ['--js-flags=--expose-gc'],
        },
      },
    },
    {
      name: 'mid-tier-mobile',
      use: {
        ...devices['Pixel 5'],
        launchOptions: {
          args: ['--js-flags=--expose-gc'],
        },
        // CPU/network throttling is applied per-test via CDP.
      },
    },
  ],

  webServer: {
    command: 'node e2e/fixtures/server.mjs',
    port: PORT,
    timeout: 15_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
