// SPDX-License-Identifier: Apache-2.0

/**
 * `browsonicInstrumentation` regression suite. The factory shape
 * matches what Next.js's `instrumentation.ts` file convention
 * expects (a `{ register, onRequestError }` object). Tests inject
 * `warn` + `reportError` sinks so we can assert the call shape
 * without polluting the test runner's stdout.
 */
import { describe, it, expect, vi } from 'vitest';
import { browsonicInstrumentation, BROWSONIC_INSTRUMENTATION_VERSION } from './index';

describe('browsonicInstrumentation', () => {
  it('returns a `{ register, onRequestError }` pair', () => {
    const handlers = browsonicInstrumentation();
    expect(typeof handlers.register).toBe('function');
    expect(typeof handlers.onRequestError).toBe('function');
  });

  it('warns when apiEndpoint is missing', () => {
    const warn = vi.fn();
    const { register } = browsonicInstrumentation({ appKey: 'x', warn });
    void register();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('apiEndpoint');
  });

  it('warns when appKey is missing', () => {
    const warn = vi.fn();
    const { register } = browsonicInstrumentation({
      apiEndpoint: 'https://x.test/v1/events',
      warn,
    });
    void register();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('appKey');
  });

  it('warns once per missing field (both warnings on completely-empty config)', () => {
    const warn = vi.fn();
    const { register } = browsonicInstrumentation({ warn });
    void register();
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('does not warn when both apiEndpoint + appKey are set', () => {
    const warn = vi.fn();
    const { register } = browsonicInstrumentation({
      apiEndpoint: 'https://x.test/v1/events',
      appKey: 'app-key',
      warn,
    });
    void register();
    expect(warn).not.toHaveBeenCalled();
  });

  it('forwards onRequestError to the report sink with structured context', () => {
    const reportError = vi.fn();
    const { onRequestError } = browsonicInstrumentation({
      apiEndpoint: 'https://x.test/v1/events',
      appKey: 'app-key',
      reportError,
    });

    const err = new Error('route-failed');
    void onRequestError(
      err,
      { path: '/api/checkout', method: 'POST' },
      {
        routerKind: 'App Router',
        routePath: '/api/checkout',
        routeType: 'route',
      },
    );

    expect(reportError).toHaveBeenCalledTimes(1);
    const [reportedError, ctx] = reportError.mock.calls[0]!;
    expect(reportedError).toBe(err);
    expect(ctx).toMatchObject({
      'nextjs.instrumentation.version': BROWSONIC_INSTRUMENTATION_VERSION,
      'nextjs.path': '/api/checkout',
      'nextjs.method': 'POST',
      'nextjs.routerKind': 'App Router',
      'nextjs.routePath': '/api/checkout',
      'nextjs.routeType': 'route',
    });
  });

  it('handles missing request fields with null fallbacks', () => {
    const reportError = vi.fn();
    const { onRequestError } = browsonicInstrumentation({ reportError });

    void onRequestError(new Error('x'), {}, {});

    const ctx = reportError.mock.calls[0]![1] as Record<string, unknown>;
    expect(ctx['nextjs.path']).toBeNull();
    expect(ctx['nextjs.method']).toBeNull();
    expect(ctx['nextjs.routerKind']).toBeNull();
    expect(ctx['nextjs.routePath']).toBeNull();
  });

  it('isolates a thrown report sink so onRequestError never propagates', () => {
    const reportError = vi.fn(() => {
      throw new Error('sink-exploded');
    });
    const { onRequestError } = browsonicInstrumentation({ reportError });

    expect(() =>
      onRequestError(new Error('original'), { path: '/x' }, { routerKind: 'App Router' }),
    ).not.toThrow();
  });

  it('exports the version stamp as a string constant', () => {
    expect(typeof BROWSONIC_INSTRUMENTATION_VERSION).toBe('string');
    expect(BROWSONIC_INSTRUMENTATION_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('register() returns void synchronously (Next.js accepts sync register)', () => {
    const { register } = browsonicInstrumentation({
      apiEndpoint: 'https://x.test/v1/events',
      appKey: 'app-key',
      warn: () => {},
    });
    const result = register();
    expect(result).toBeUndefined();
  });

  it('does not require the `request.path` / `request.method` to be defined', () => {
    const reportError = vi.fn();
    const { onRequestError } = browsonicInstrumentation({ reportError });

    // Pages Router callers may not always supply both fields; the
    // type marks them optional. Make sure we don't NPE on missing
    // `path` / `method` — pass an empty object (omitting the key
    // is the contract we want, not `{ path: undefined }`).
    void onRequestError(new Error('x'), {}, {});
    expect(reportError).toHaveBeenCalledTimes(1);
  });

  // ---- 0.3.1 — default reportError fetch-POST bridge -----------------

  describe('default reportError fetch bridge (0.3.1)', () => {
    it('POSTs an EventBatch to /v1/events when apiEndpoint + appKey are set', async () => {
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockResolvedValue({ ok: true } as Response);
      vi.stubGlobal('fetch', fetchSpy);

      try {
        const { onRequestError } = browsonicInstrumentation({
          apiEndpoint: 'https://api.test.example/',
          appKey: 'app-123',
          warn: () => {},
        });
        void onRequestError(
          new Error('server-route-failed'),
          { path: '/api/checkout', method: 'POST' },
          { routerKind: 'App Router', routePath: '/api/checkout', routeType: 'route' },
        );

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0]!;
        // Trailing slash on apiEndpoint is normalised away.
        expect(url).toBe('https://api.test.example/v1/events');
        expect(init).toMatchObject({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-APP-KEY': 'app-123',
          }),
          keepalive: true,
        });
        const body = JSON.parse((init as RequestInit).body as string);
        expect(body).toMatchObject({
          appKey: 'app-123',
          environment: 'production',
          sessionId: 'server',
          events: [
            expect.objectContaining({
              type: 'error',
              level: 'error',
              message: 'server-route-failed',
              extras: expect.objectContaining({
                'nextjs.path': '/api/checkout',
                'nextjs.routerKind': 'App Router',
              }),
            }),
          ],
        });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('falls back to console.error when apiEndpoint is missing', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      try {
        const { onRequestError } = browsonicInstrumentation({
          appKey: 'only-app-key',
          warn: () => {},
        });
        void onRequestError(new Error('x'), {}, {});

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(consoleSpy).toHaveBeenCalledTimes(1);
      } finally {
        consoleSpy.mockRestore();
        vi.unstubAllGlobals();
      }
    });

    it('routes a fetch rejection to warn() instead of throwing', async () => {
      const warn = vi.fn();
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockRejectedValue(new Error('network-down'));
      vi.stubGlobal('fetch', fetchSpy);

      try {
        const { onRequestError } = browsonicInstrumentation({
          apiEndpoint: 'https://api.test.example',
          appKey: 'app-123',
          warn,
        });
        void onRequestError(new Error('orig'), {}, {});
        // Allow the fetch promise + .catch handler to settle.
        await new Promise((r) => setTimeout(r, 0));

        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn.mock.calls[0]![0]).toContain('network-down');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
