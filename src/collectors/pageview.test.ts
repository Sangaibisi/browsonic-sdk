/**
 * Page view collector — POST beacon regression suite.
 *
 * Verifies the Sprint 1.3 rewrite (pixel GET → POST beacon with
 * `X-API-Key` header). History subscription is covered by
 * history-instrumentation.test.ts; here we verify the transport switch
 * and install/uninstall lifecycle.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPageViewCollector } from './pageview';
import { __resetHistoryInstrumentationForTests } from './history-instrumentation';

describe('createPageViewCollector', () => {
  let originalFetch: typeof window.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetHistoryInstrumentationForTests();
    originalFetch = window.fetch;
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    window.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    window.fetch = originalFetch;
    __resetHistoryInstrumentationForTests();
  });

  function makeCollector() {
    return createPageViewCollector({
      apiEndpoint: 'https://api.test',
      apiKey: 'secret-key',
      appKey: 'myapp',
      environment: 'production',
      clientVersion: '1.0.0',
      debugLog: () => {},
      getSessionId: () => 'sess-123',
      // Sprint P14 (F3.1.A) visitor-ID resolution inputs. The tests
      // don't exercise strategy switching — visitor.test.ts does that —
      // but the collector now requires these fields to build a ping.
      visitorIdStrategy: 'cookie',
      respectGPC: true,
      hasConsented: null,
    });
  }

  it('sends initial page view via POST with X-API-Key header', async () => {
    const collector = makeCollector();
    collector.install();

    // happy-dom reports readyState 'complete' after initial parse.
    // If still loading, wait for load event.
    if (document.readyState !== 'complete') {
      await new Promise((r) => window.addEventListener('load', r, { once: true }));
    }

    // Wait one tick for the fetch to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalled();
    const [url, init] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://api.test/v1/usage');
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-Key']).toBe('secret-key');
    expect(init.headers['X-APP-KEY']).toBe('myapp');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.keepalive).toBe(true);
    collector.uninstall();
  });

  it('POST body carries pageview fields (no apiKey!)', async () => {
    const collector = makeCollector();
    collector.install();
    await new Promise((r) => setTimeout(r, 10));

    const init = mockFetch.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.t).toBe('pv');
    expect(body.app).toBe('myapp');
    expect(body.env).toBe('production');
    expect(body.sid).toBe('sess-123');
    expect(body.v).toBe('1.0.0');
    // Critical: apiKey must NOT appear anywhere in the body.
    expect(JSON.stringify(body)).not.toContain('secret-key');
    collector.uninstall();
  });

  it('track() manually fires a pageview', async () => {
    const collector = makeCollector();
    collector.install();
    await new Promise((r) => setTimeout(r, 10));
    mockFetch.mockClear();

    collector.track('https://app.test/checkout');
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalled();
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.url).toBe('https://app.test/checkout');
    collector.uninstall();
  });

  it('fires page view on history.pushState (via shared instrumentation)', async () => {
    const collector = makeCollector();
    collector.install();
    await new Promise((r) => setTimeout(r, 10));
    mockFetch.mockClear();

    history.pushState({}, '', '/new-route');
    // queueMicrotask + fetch
    await new Promise((r) => setTimeout(r, 10));

    expect(mockFetch).toHaveBeenCalled();
    collector.uninstall();
  });

  it('uninstall stops history-triggered pageviews', async () => {
    const collector = makeCollector();
    collector.install();
    await new Promise((r) => setTimeout(r, 10));
    collector.uninstall();
    mockFetch.mockClear();

    history.pushState({}, '', '/after-uninstall');
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('install is idempotent (does not send 2 initial pageviews)', async () => {
    const collector = makeCollector();
    collector.install();
    collector.install();
    await new Promise((r) => setTimeout(r, 10));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    collector.uninstall();
  });
});
