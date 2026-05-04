// SPDX-License-Identifier: Apache-2.0

/**
 * `createBrowsonicHttpReporter` regression suite. We don't import
 * from `@angular/common/http` — the reporter takes plain shapes,
 * so the suite uses hand-rolled fixtures that match what
 * HttpRequest / HttpErrorResponse expose at runtime.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import {
  createBrowsonicHttpReporter,
  type HttpRequestLike,
  type HttpErrorResponseLike,
} from './http-interceptor';

function makeFakeSdk(): Browsonic {
  return {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setTag: vi.fn(),
  } as unknown as Browsonic;
}

const req = (overrides: Partial<HttpRequestLike> = {}): HttpRequestLike => ({
  url: '/api/users',
  method: 'GET',
  ...overrides,
});

const httpError = (overrides: Partial<HttpErrorResponseLike> = {}): HttpErrorResponseLike => ({
  status: 500,
  statusText: 'Internal Server Error',
  url: '/api/users',
  ok: false,
  name: 'HttpErrorResponse',
  ...overrides,
});

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('createBrowsonicHttpReporter', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('captures an HttpErrorResponse-shaped error', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    report(req(), httpError());

    expect(sdk.captureError).toHaveBeenCalledTimes(1);
    expect(sdk.setTag).toHaveBeenCalledWith('angular.http.method', 'GET');
    expect(sdk.setTag).toHaveBeenCalledWith('angular.http.status', '500');
    expect(sdk.addMetadata).toHaveBeenCalledWith('httpUrl', '/api/users');
  });

  it('attaches `urlWithParams` over `url` when both are present', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    report(req({ url: '/api/users', urlWithParams: '/api/users?page=2&size=20' }), httpError());

    expect(sdk.addMetadata).toHaveBeenCalledWith('httpUrl', '/api/users?page=2&size=20');
  });

  it('upper-cases the HTTP method tag', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    report(req({ method: 'patch' }), httpError({ status: 422 }));
    expect(sdk.setTag).toHaveBeenCalledWith('angular.http.method', 'PATCH');
  });

  it('skips capture when URL matches an ignoreUrls string entry', () => {
    const report = createBrowsonicHttpReporter({
      sdk,
      ignoreUrls: ['/api/health'],
    });
    report(req({ url: '/api/health' }), httpError());
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('skips capture when URL matches an ignoreUrls RegExp', () => {
    const report = createBrowsonicHttpReporter({
      sdk,
      ignoreUrls: [/\/v1\/events$/],
    });
    report(req({ url: '/v1/events' }), httpError());
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('skips capture when status is in ignoreStatuses', () => {
    const report = createBrowsonicHttpReporter({
      sdk,
      ignoreStatuses: [401, 404],
    });
    report(req(), httpError({ status: 401 }));
    report(req(), httpError({ status: 404 }));
    report(req(), httpError({ status: 500 }));
    expect(sdk.captureError).toHaveBeenCalledTimes(1);
  });

  it('coerces a non-Error throw to a synthesised Error', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    report(req({ method: 'POST', url: '/api/login' }), httpError({ status: 500 }));
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toContain('POST /api/login 500');
    expect(arg.message).toContain('Internal Server Error');
  });

  it('forwards a thrown Error verbatim', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    const err = new Error('network down');
    report(req(), err);
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBe(err);
  });

  it('attaches truncated response body metadata', () => {
    const report = createBrowsonicHttpReporter({ sdk, maxBodyLength: 32 });
    const big = 'x'.repeat(1000);
    report(req(), httpError({ error: { detail: big } }));
    const calls = (sdk.addMetadata as ReturnType<typeof vi.fn>).mock.calls;
    const bodyCall = calls.find((c) => c[0] === 'httpResponseBody');
    expect(bodyCall).toBeDefined();
    const body = bodyCall![1] as string;
    expect(body.length).toBeLessThanOrEqual(33); // 32 + ellipsis
    expect(body.endsWith('…')).toBe(true);
  });

  it('skips response body when maxBodyLength is 0', () => {
    const report = createBrowsonicHttpReporter({ sdk, maxBodyLength: 0 });
    report(req(), httpError({ error: { detail: 'sensitive' } }));
    const calls = (sdk.addMetadata as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.find((c) => c[0] === 'httpResponseBody')).toBeUndefined();
  });

  it('serialises a circular response body without throwing', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    const circular: { self?: unknown; tag: string } = { tag: 'X' };
    circular.self = circular;
    expect(() => report(req(), httpError({ error: circular }))).not.toThrow();
    const bodyCall = (sdk.addMetadata as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'httpResponseBody',
    );
    expect(bodyCall).toBeDefined();
    expect(bodyCall![1]).toContain('[circular]');
  });

  it('passes a string response body through verbatim (HTML / plain text)', () => {
    const report = createBrowsonicHttpReporter({ sdk, maxBodyLength: 200 });
    report(req(), httpError({ error: '<html>500 Internal Server Error</html>' }));
    const bodyCall = (sdk.addMetadata as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'httpResponseBody',
    );
    expect(bodyCall![1]).toBe('<html>500 Internal Server Error</html>');
  });

  it('respects a custom tagNamespace', () => {
    const report = createBrowsonicHttpReporter({ sdk, tagNamespace: 'admin.http' });
    report(req(), httpError());
    expect(sdk.setTag).toHaveBeenCalledWith('admin.http.method', 'GET');
    expect(sdk.setTag).toHaveBeenCalledWith('admin.http.status', '500');
  });

  it('falls back to window.Browsonic when no sdk option is provided', () => {
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const report = createBrowsonicHttpReporter();
    report(req(), httpError());
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('is a no-op when no SDK is reachable', () => {
    const report = createBrowsonicHttpReporter();
    expect(() => report(req(), httpError())).not.toThrow();
  });

  it('isolates a thrown SDK call so the interceptor pipeline keeps running', () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const report = createBrowsonicHttpReporter({ sdk });
    expect(() => report(req(), httpError())).not.toThrow();
  });

  it('still captures when the error has no status (network failure)', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    // Network failures land with `status: 0` in real Angular; here we
    // simulate a generic "no status" object so the reporter must
    // capture without the status tag.
    report(req(), { ok: false, message: 'Unknown error' });
    expect(sdk.captureError).toHaveBeenCalled();
    const setTagCalls = (sdk.setTag as ReturnType<typeof vi.fn>).mock.calls;
    expect(setTagCalls.find((c) => c[0] === 'angular.http.status')).toBeUndefined();
  });

  it('truncates an extremely long URL to 256 chars', () => {
    const report = createBrowsonicHttpReporter({ sdk });
    const longUrl = '/api/x?' + 'a=b&'.repeat(200);
    report(req({ url: longUrl }), httpError({ status: 500 }));
    const urlCall = (sdk.addMetadata as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'httpUrl',
    );
    expect(urlCall![1] as string).toHaveLength(257); // 256 + ellipsis
  });
});
