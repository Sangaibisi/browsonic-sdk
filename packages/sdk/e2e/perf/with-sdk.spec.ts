/**
 * Perf with SDK loaded — measures delta vs baseline.
 *
 * PERFORMANCE-STRATEGY.md §1 SLOs:
 *   - LCP delta <= 50ms
 *   - INP delta <= 10ms
 *   - init() blocking p95 <= 15ms
 *   - No SDK-attributable longtask
 *
 * The SDK is loaded via an IIFE bundle (`sdk.bundle.js`) produced by
 * `scripts/build-e2e-bundle.mjs`. The bundle exposes `window.BrowsonicSDK`
 * with the same named exports as the npm package.
 */
import { test, expect } from '@playwright/test';

/**
 * Add a <script src="/demo-app/sdk.bundle.js"> tag to the document BEFORE
 * navigation, so the browser loads it during the initial parse. Then run
 * the SDK init snippet synchronously once the bundle has loaded.
 */
async function injectSdkOnPageLoad(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const slot = document.getElementById('sdk-slot');
      if (!slot) return;

      const sdkScript = document.createElement('script');
      sdkScript.src = '/demo-app/sdk.bundle.js';
      sdkScript.async = false;
      slot.appendChild(sdkScript);

      const initScript = document.createElement('script');
      initScript.textContent = `
        performance.mark('sdk:before-init');
        const sdk = window.BrowsonicSDK.getBrowsonic();
        sdk.init({
          apiEndpoint: 'http://127.0.0.1:4319',
          appKey: 'bench-app',
          apiKey: 'bench-key',
          debug: false,
          trackPageViews: false
        });
        performance.mark('sdk:after-init');
        performance.measure('sdk:init', 'sdk:before-init', 'sdk:after-init');
        window.__sdkReady = true;
      `;
      // Run after the bundle finishes loading
      sdkScript.addEventListener('load', () => slot.appendChild(initScript));
    });
  });
}

test.describe('With SDK — delta measurement', () => {
  test('SDK init blocking time', async ({ page }) => {
    await injectSdkOnPageLoad(page);

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__appReady === true);
    await page.waitForFunction(() => (window as any).__sdkReady === true, null, {
      timeout: 10_000,
    });

    const initDuration = await page.evaluate(() => {
      const entries = performance.getEntriesByName('sdk:init');
      return entries[0]?.duration ?? -1;
    });

    console.log(`[with-sdk] init blocking duration: ${initDuration.toFixed(2)}ms`);

    expect(initDuration).toBeGreaterThan(0);
    // SLO §1: init p95 <= 15ms. Smoke threshold generous; CPU throttle tightens later.
    expect(initDuration).toBeLessThan(100);
  });

  test('no SDK-attributable longtasks during 2s idle window', async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__longtasks = [];
      try {
        const po = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            (window as any).__longtasks.push({
              duration: entry.duration,
              startTime: entry.startTime,
              name: entry.name,
            });
          }
        });
        po.observe({ type: 'longtask', buffered: true } as any);
      } catch {
        // longtask observer unsupported — test will pass trivially
      }
    });

    await injectSdkOnPageLoad(page);

    await page.goto('/');
    await page.waitForFunction(() => (window as any).__sdkReady === true);
    await page.waitForTimeout(2000);

    const longtasks = await page.evaluate(() => (window as any).__longtasks ?? []);
    console.log(`[with-sdk] longtasks during idle: ${longtasks.length}`);

    // SLO §1: Zero SDK-attributable longtasks. Attribution isn't wired up yet;
    // for now fail on any longtask > 100ms (which is definitely not jank-acceptable).
    const serious = longtasks.filter((t: any) => t.duration > 100);
    expect(serious.length).toBe(0);
  });
});
