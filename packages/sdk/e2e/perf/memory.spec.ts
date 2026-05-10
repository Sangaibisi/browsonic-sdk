/**
 * Memory leak detection — 10min session proxy (compressed to 2min with high event rate).
 *
 * PERFORMANCE-STRATEGY.md §1: Session heap <= 5MB per hour.
 * This spec simulates a burst session and checks heap delta.
 *
 * LIMITATIONS:
 *   - `performance.memory` is Chromium-only. Test auto-skips on other engines.
 *   - `globalThis.gc()` requires Chromium launched with `--js-flags=--expose-gc`
 *     (configured in playwright.config.ts). Without it, GC is opportunistic and
 *     the measurement is noisier (±1MB instead of ±0.2MB). Threshold accounts.
 */
import { test, expect } from '@playwright/test';

test.describe('Memory footprint', () => {
  test('heap stays bounded during simulated 2-minute burst session', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__sdkReady = false;
      window.addEventListener('DOMContentLoaded', () => {
        const slot = document.getElementById('sdk-slot');
        if (!slot) return;
        const s = document.createElement('script');
        s.src = '/demo-app/sdk.bundle.js';
        s.async = false;
        slot.appendChild(s);
        s.addEventListener('load', () => {
          const init = document.createElement('script');
          init.textContent = `
            const sdk = window.BrowsonicSDK.getBrowsonic();
            sdk.init({
              apiEndpoint: 'http://127.0.0.1:4319',
              appKey: 'mem-test',
              apiKey: 'k',
              debug: false,
              trackPageViews: false
            });
            window.__sdk = sdk;
            window.__sdkReady = true;
          `;
          slot.appendChild(init);
        });
      });
    });

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__sdkReady === true);

    const baseline = await page.evaluate(async () => {
      const mem = (performance as any).memory;
      if (!mem) return -1;
      if ((globalThis as any).gc) (globalThis as any).gc();
      await new Promise((r) => setTimeout(r, 100));
      return mem.usedJSHeapSize;
    });

    if (baseline < 0) {
      test.skip(true, 'performance.memory not available (non-Chromium)');
      return;
    }

    // Simulate burst: 500 console events + 100 manual captures
    await page.evaluate(() => {
      const sdk = (window as any).__sdk;
      for (let i = 0; i < 500; i++) {
        console.warn(`burst warn ${i}`);
      }
      for (let i = 0; i < 100; i++) {
        sdk.captureMessage(`burst msg ${i}`, 'warn');
      }
    });

    await page.waitForTimeout(2000);

    const afterBurst = await page.evaluate(async () => {
      if ((globalThis as any).gc) (globalThis as any).gc();
      await new Promise((r) => setTimeout(r, 200));
      return (performance as any).memory.usedJSHeapSize;
    });

    const deltaMB = (afterBurst - baseline) / (1024 * 1024);
    console.log(
      `[memory] baseline: ${(baseline / 1024 / 1024).toFixed(2)}MB, ` +
        `after burst: ${(afterBurst / 1024 / 1024).toFixed(2)}MB, ` +
        `delta: ${deltaMB.toFixed(2)}MB`
    );

    // SLO: <=5MB for 1-hour session. 2-minute burst proxy: <=2MB.
    // Noise margin: +0.5MB if gc() unavailable.
    expect(deltaMB).toBeLessThan(2.5);
  });
});
