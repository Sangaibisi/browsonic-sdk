/**
 * Web Vitals — LCP / INP / CLS delta (baseline vs with-SDK).
 *
 * PERFORMANS-STRATEJISI.md §1 SLO:
 *   - LCP delta ≤ 50 ms
 *   - INP delta ≤ 10 ms
 *   - CLS delta ≤ 0.01
 *
 * Method:
 *   10 iterations per scenario, median reported. The median is more
 *   stable than mean on CI runners where per-run variance can be 30-50%
 *   on short operations. A 10-sample median absorbs a single outlier
 *   without masking a real regression.
 *
 * Each iteration uses a fresh `BrowserContext` to avoid cached module
 * state leaking measurements between runs.
 *
 * CLS is not deterministic per load in this fixture (no dynamic layout
 * shifts are triggered), so the CLS assertion mostly guards against
 * accidental SDK DOM mutations that would shift the product grid.
 */
import { test, expect, type Page } from '@playwright/test';

const ITERATIONS = 10;

interface Vitals {
  lcp: number;
  fcp: number;
  cls: number;
  /**
   * Interaction to Next Paint (Sprint P15 / F3.5.A). Measured as the
   * max `duration` across the small batch of synthetic interactions we
   * fire per iteration. `0` when no entries were observed — the caller
   * drops zeroes from the median to keep environments without INP
   * support from skewing the result.
   */
  inp: number;
}

function median(xs: number[]): number {
  const sorted = [...xs].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
}

async function collectVitals(page: Page): Promise<void> {
  // Wire PerformanceObservers BEFORE navigation so LCP / CLS / INP entries
  // are captured as they arrive. We accumulate in page scope and read at
  // the end; the fixture fires 'app:ready' once the grid is rendered.
  await page.addInitScript(() => {
    const w = window as unknown as {
      __vitals: {
        lcp: number;
        fcp: number;
        cls: number;
        inp: number;
        _clsEntries: { value: number; hadRecentInput: boolean }[];
        _inpDurations: number[];
      };
    };
    w.__vitals = { lcp: 0, fcp: 0, cls: 0, inp: 0, _clsEntries: [], _inpDurations: [] };
    try {
      const lcpObs = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) w.__vitals.lcp = (last as PerformanceEntry).startTime;
      });
      lcpObs.observe({
        type: 'largest-contentful-paint',
        buffered: true,
      } as PerformanceObserverInit);
    } catch {
      // largest-contentful-paint not supported — skip
    }
    try {
      const fcpObs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.name === 'first-contentful-paint') w.__vitals.fcp = e.startTime;
        }
      });
      fcpObs.observe({ type: 'paint', buffered: true } as PerformanceObserverInit);
    } catch {
      // paint timing not supported
    }
    try {
      const clsObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const ls = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
          if (!ls.hadRecentInput) {
            w.__vitals._clsEntries.push({ value: ls.value, hadRecentInput: ls.hadRecentInput });
            w.__vitals.cls += ls.value;
          }
        }
      });
      clsObs.observe({ type: 'layout-shift', buffered: true } as PerformanceObserverInit);
    } catch {
      // layout-shift unsupported
    }
    try {
      // Sprint P15 (F3.5.A) — INP via PerformanceEventTiming. Record
      // every interaction's duration; the iteration driver fires a
      // small batch of clicks/keydowns, and the test takes the max as
      // the per-iteration INP. Default durationThreshold=40 ms is the
      // same as web-vitals.js uses; anything shorter is below the INP
      // SLO noise floor anyway.
      const inpObs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const dur = (entry as PerformanceEntry).duration;
          if (typeof dur === 'number' && dur > 0) {
            w.__vitals._inpDurations.push(dur);
            if (dur > w.__vitals.inp) w.__vitals.inp = dur;
          }
        }
      });
      inpObs.observe({
        type: 'event',
        buffered: true,
        durationThreshold: 40,
      } as PerformanceObserverInit);
    } catch {
      // PerformanceEventTiming unsupported — leave inp at 0, caller
      // drops zeroes from the median so the assertion becomes a no-op
      // rather than a false positive.
    }
  });
}

async function readVitals(page: Page): Promise<Vitals> {
  await page.waitForTimeout(200); // drain observer queue
  return await page.evaluate(() => {
    const w = window as unknown as { __vitals: Vitals };
    return { lcp: w.__vitals.lcp, fcp: w.__vitals.fcp, cls: w.__vitals.cls, inp: w.__vitals.inp };
  });
}

/**
 * Drive a small batch of interactions (Sprint P15 / F3.5.A). Each
 * interaction fires an event the PerformanceEventTiming observer
 * captures; the max `duration` across the batch is the per-iteration
 * INP. Real web-vitals.js computes p75 across the full session — on a
 * 10-iteration test harness the per-iter max is the right proxy.
 */
async function fireInteractions(page: Page): Promise<void> {
  // Use locators rather than coordinates so the test stays stable if
  // the demo app re-layouts. Fall back to body keydown if the grid
  // item isn't there (e.g. app failed to render).
  try {
    const item = page.locator('[data-testid="product-item"]').first();
    if (await item.count()) {
      await item.click({ trial: false, timeout: 500 });
    }
  } catch {
    // swallow — missing interaction target is environment-specific and
    // shouldn't fail the whole iteration.
  }
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('Tab');
  }
  await page.waitForTimeout(120);
}

async function injectSdk(page: Page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      const slot = document.getElementById('sdk-slot');
      if (!slot) return;
      const sdkScript = document.createElement('script');
      sdkScript.src = '/demo-app/sdk.bundle.min.js';
      sdkScript.async = false;
      slot.appendChild(sdkScript);
      const initScript = document.createElement('script');
      initScript.textContent = `
        const sdk = window.BrowsonicSDK.getBrowsonic();
        sdk.init({
          apiEndpoint: 'http://127.0.0.1:4319',
          appKey: 'bench-app',
          apiKey: 'bench-key',
          trackPageViews: false,
        });
        window.__sdkReady = true;
      `;
      sdkScript.addEventListener('load', () => slot.appendChild(initScript));
    });
  });
}

async function runIterations(
  browser: import('@playwright/test').Browser,
  withSdk: boolean
): Promise<{ lcps: number[]; fcps: number[]; clss: number[]; inps: number[] }> {
  const lcps: number[] = [];
  const fcps: number[] = [];
  const clss: number[] = [];
  const inps: number[] = [];

  for (let i = 0; i < ITERATIONS; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await collectVitals(page);
    if (withSdk) {
      await injectSdk(page);
    }

    await page.goto('/');
    await page.waitForFunction(() => (window as unknown as { __appReady: true }).__appReady);
    if (withSdk) {
      await page.waitForFunction(
        () => (window as unknown as { __sdkReady: true }).__sdkReady,
        null,
        {
          timeout: 10_000,
        }
      );
    }
    // Allow LCP to settle — hero banner paint happens early, but
    // buffered entries may still arrive within the first 500-1000 ms.
    await page.waitForTimeout(500);

    // Sprint P15 (F3.5.A): drive a few interactions after LCP has
    // settled so the PerformanceEventTiming observer has data to
    // score INP against. The interactions are synthetic — they don't
    // affect the LCP/CLS numbers gathered above.
    await fireInteractions(page);

    const vitals = await readVitals(page);
    if (vitals.lcp > 0) lcps.push(vitals.lcp);
    if (vitals.fcp > 0) fcps.push(vitals.fcp);
    clss.push(vitals.cls); // 0 counts for CLS
    if (vitals.inp > 0) inps.push(vitals.inp);

    await context.close();
  }

  return { lcps, fcps, clss, inps };
}

test.describe('Web Vitals delta — baseline vs with-SDK', () => {
  test(`LCP / FCP / CLS / INP delta over ${ITERATIONS} iterations`, async ({
    browser,
  }, testInfo) => {
    testInfo.setTimeout(testInfo.timeout + ITERATIONS * 2 * 3000);

    const baseline = await runIterations(browser, false);
    const withSdk = await runIterations(browser, true);

    const lcpDelta =
      baseline.lcps.length > 0 && withSdk.lcps.length > 0
        ? median(withSdk.lcps) - median(baseline.lcps)
        : 0;
    const fcpDelta =
      baseline.fcps.length > 0 && withSdk.fcps.length > 0
        ? median(withSdk.fcps) - median(baseline.fcps)
        : 0;
    const clsDelta = median(withSdk.clss) - median(baseline.clss);
    const inpDelta =
      baseline.inps.length > 0 && withSdk.inps.length > 0
        ? median(withSdk.inps) - median(baseline.inps)
        : 0;

    const report = {
      project: testInfo.project.name,
      iterations: ITERATIONS,
      baseline: {
        lcp_median_ms: baseline.lcps.length ? median(baseline.lcps).toFixed(2) : 'n/a',
        fcp_median_ms: baseline.fcps.length ? median(baseline.fcps).toFixed(2) : 'n/a',
        cls_median: median(baseline.clss).toFixed(4),
        inp_median_ms: baseline.inps.length ? median(baseline.inps).toFixed(2) : 'n/a',
        samples: {
          lcp: baseline.lcps.length,
          fcp: baseline.fcps.length,
          cls: baseline.clss.length,
          inp: baseline.inps.length,
        },
      },
      with_sdk: {
        lcp_median_ms: withSdk.lcps.length ? median(withSdk.lcps).toFixed(2) : 'n/a',
        fcp_median_ms: withSdk.fcps.length ? median(withSdk.fcps).toFixed(2) : 'n/a',
        cls_median: median(withSdk.clss).toFixed(4),
        inp_median_ms: withSdk.inps.length ? median(withSdk.inps).toFixed(2) : 'n/a',
        samples: {
          lcp: withSdk.lcps.length,
          fcp: withSdk.fcps.length,
          cls: withSdk.clss.length,
          inp: withSdk.inps.length,
        },
      },
      delta: {
        lcp_ms: lcpDelta.toFixed(2),
        fcp_ms: fcpDelta.toFixed(2),
        cls: clsDelta.toFixed(4),
        inp_ms: inpDelta.toFixed(2),
      },
    };
    console.log('[web-vitals-delta]', JSON.stringify(report, null, 2));

    // SLOs (§1):
    //   LCP delta ≤ 50 ms
    //   CLS delta ≤ 0.01
    //   INP delta ≤ 10 ms (Sprint P15 / F3.5.A)
    // FCP isn't an SLO; we just report. If an environment doesn't expose
    // a given vital (some headless variants), skip the assertion rather
    // than fail — missing data is not a regression.
    if (baseline.lcps.length > 0 && withSdk.lcps.length > 0) {
      expect(
        lcpDelta,
        `LCP delta (with SDK − baseline) was ${lcpDelta.toFixed(2)} ms; SLO ≤ 50 ms. If this regressed unexpectedly, check whether a collector moved from idle to the sync bootstrap path, or whether the bundle grew past a browser parse threshold.`
      ).toBeLessThan(50);
    } else {
      console.warn('[web-vitals-delta] LCP not observed on this runner — assertion skipped.');
    }

    expect(
      clsDelta,
      `CLS delta (with SDK − baseline) was ${clsDelta.toFixed(4)}; SLO ≤ 0.01. CLS regression usually means the SDK shifted layout — check widget DOM injection, script tag insertion point, or image decode delays.`
    ).toBeLessThan(0.01);

    // INP is the only web vital that requires interaction — environments
    // without PerformanceEventTiming or with no interactions in scope
    // return 0 and are skipped. When both arms have samples, the SDK
    // should add at most 10 ms to the fleet interaction latency.
    if (baseline.inps.length > 0 && withSdk.inps.length > 0) {
      expect(
        inpDelta,
        `INP delta (with SDK − baseline) was ${inpDelta.toFixed(2)} ms; SLO ≤ 10 ms. INP regression is usually a hot-path collector: check the XHR/Fetch interceptor, the widget event handler, or plugin onEvent callbacks — anything that runs synchronously inside the interaction's blocking window.`
      ).toBeLessThan(10);
    } else {
      console.warn(
        '[web-vitals-delta] INP not observed on this runner (no PerformanceEventTiming or no interactions) — assertion skipped.'
      );
    }
  });
});
