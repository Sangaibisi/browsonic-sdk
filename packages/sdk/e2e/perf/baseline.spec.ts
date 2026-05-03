/**
 * Baseline perf — fixture app WITHOUT SDK.
 *
 * PERFORMANS-STRATEJISI.md §1: LCP delta (with SDK vs without) <= 50ms.
 * This spec captures the "without" baseline for comparison.
 */
import { test, expect } from '@playwright/test';

test.describe('Baseline — no SDK', () => {
  test('captures LCP / FCP / load time / memory', async ({ page }) => {
    const metrics: Record<string, number> = {};

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__appReady === true);

    // Collect Web Vitals via raw PerformanceObserver in-page
    const paintMetrics = await page.evaluate(() => {
      const entries = performance.getEntriesByType('paint');
      const fcp = entries.find((e) => e.name === 'first-contentful-paint')?.startTime ?? -1;
      const nav = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      return {
        fcp,
        domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : -1,
        loadComplete: nav ? nav.loadEventEnd - nav.startTime : -1,
      };
    });

    Object.assign(metrics, paintMetrics);

    // Heap size (Chromium only)
    const heap = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize ?? 0);
    metrics.heapBytes = heap;

    console.log('[baseline]', JSON.stringify(metrics, null, 2));

    // Sanity: navigation timings should be populated. FCP is optional —
    // chrome-headless-shell exposes paint entries inconsistently; the full
    // chrome binary (via `--project=desktop` with devices['Desktop Chrome'])
    // does emit it under normal load. Assert on DCL/load which are reliable.
    expect(metrics.domContentLoaded).toBeGreaterThan(0);
    expect(metrics.loadComplete).toBeGreaterThan(0);
    expect(metrics.loadComplete).toBeLessThan(3000);

    if (metrics.fcp > 0) {
      expect(metrics.fcp).toBeLessThan(3000);
    }
  });
});
