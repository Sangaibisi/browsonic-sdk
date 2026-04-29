// SPDX-License-Identifier: Apache-2.0

/**
 * Network collector — fetch interceptor regression suite.
 *
 * Uses a mock of `window.fetch` captured per-test.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNetworkCollector } from './network';

function mockFetchOnce(response: { ok?: boolean; status?: number; statusText?: string }) {
  return vi.fn().mockResolvedValueOnce({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    statusText: response.statusText ?? 'OK',
    headers: new Headers(),
  });
}

describe('createNetworkCollector', () => {
  let onEvent: ReturnType<typeof vi.fn>;
  let onTelemetry: ReturnType<typeof vi.fn>;
  let originalFetch: typeof window.fetch;
  let collector: ReturnType<typeof createNetworkCollector>;

  beforeEach(() => {
    onEvent = vi.fn();
    onTelemetry = vi.fn();
    originalFetch = window.fetch;
    collector = createNetworkCollector({
      onEvent,
      onTelemetry,
      debugLog: () => {},
      sdkEndpoint: 'https://api.browsonic.test',
    });
  });

  afterEach(() => {
    collector.uninstall();
    window.fetch = originalFetch;
  });

  it('install replaces window.fetch', () => {
    const before = window.fetch;
    collector.install();
    expect(window.fetch).not.toBe(before);
    expect(collector.isInstalled()).toBe(true);
  });

  it('uninstall restores window.fetch', () => {
    const before = window.fetch;
    collector.install();
    collector.uninstall();
    expect(window.fetch).toBe(before);
  });

  it('install is idempotent', () => {
    collector.install();
    collector.install();
    expect(collector.isInstalled()).toBe(true);
  });

  it('passes through SDK-own requests without instrumentation', async () => {
    const underlying = mockFetchOnce({});
    window.fetch = underlying as unknown as typeof fetch;
    collector.install();

    await window.fetch('https://api.browsonic.test/v1/events', { method: 'POST' });
    expect(underlying).toHaveBeenCalled();
    // SDK endpoint should not trigger telemetry or events
    expect(onTelemetry).not.toHaveBeenCalled();
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('records telemetry for 2xx responses', async () => {
    window.fetch = mockFetchOnce({ status: 200 }) as unknown as typeof fetch;
    collector.install();
    await window.fetch('https://api.test/users');
    expect(onTelemetry).toHaveBeenCalledOnce();
    const t = onTelemetry.mock.calls[0][0];
    expect(t.type).toBe('fetch');
    expect(t.statusCode).toBe(200);
    expect(t.method).toBe('GET');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('emits network_error event for status >= 400 (4xx → warn)', async () => {
    window.fetch = mockFetchOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }) as unknown as typeof fetch;
    collector.install();
    await window.fetch('https://api.test/missing');
    expect(onTelemetry).toHaveBeenCalled();
    expect(onEvent).toHaveBeenCalled();
    const e = onEvent.mock.calls[0][0];
    expect(e.type).toBe('network_error');
    expect(e.level).toBe('warn'); // 4xx
  });

  it('emits network_error event for status >= 500 (error level)', async () => {
    window.fetch = mockFetchOnce({
      ok: false,
      status: 503,
      statusText: 'Unavailable',
    }) as unknown as typeof fetch;
    collector.install();
    await window.fetch('https://api.test/oops');
    expect(onEvent.mock.calls[0][0].level).toBe('error');
  });

  it('catches thrown fetch errors (offline / timeout)', async () => {
    window.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('network down')) as unknown as typeof fetch;
    collector.install();
    await expect(window.fetch('https://api.test/boom')).rejects.toThrow('network down');
    expect(onEvent).toHaveBeenCalled();
    expect(onEvent.mock.calls[0][0].type).toBe('network_error');
    expect(onEvent.mock.calls[0][0].level).toBe('error');
  });

  it('extracts URL + method from Request object input', async () => {
    window.fetch = mockFetchOnce({ status: 500 }) as unknown as typeof fetch;
    collector.install();
    const req = new Request('https://api.test/foo', { method: 'POST' });
    await window.fetch(req);
    expect(onTelemetry.mock.calls[0][0].method).toBe('POST');
    expect(onTelemetry.mock.calls[0][0].url).toContain('/foo');
  });
});
