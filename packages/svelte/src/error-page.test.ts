// SPDX-License-Identifier: Apache-2.0

/**
 * `reportErrorPage` regression suite. The helper de-dupes by error
 * reference via a module-scope `WeakSet`; each test mints a fresh
 * error to avoid cross-test pollution. happy-dom provides `window`
 * so the SSR short-circuit never fires here — that path is covered
 * by deleting `globalThis.window` on demand.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { reportErrorPage } from './error-page';

function makeFakeSdk(): Browsonic {
  return {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setTag: vi.fn(),
  } as unknown as Browsonic;
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('reportErrorPage', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('reports a SvelteKit-shaped error object once and returns true', () => {
    const error = { message: 'Internal Error', code: 'OOPS' };
    const result = reportErrorPage(error, { sdk, status: 500, pathname: '/checkout' });
    expect(result).toBe(true);
    expect(sdk.captureError).toHaveBeenCalledTimes(1);
    expect(sdk.setTag).toHaveBeenCalledWith('sveltekit.errorPage.status', '500');
    expect(sdk.addMetadata).toHaveBeenCalledWith('sveltekitPath', '/checkout');
  });

  it('preserves the SvelteKit error message in the captured Error', () => {
    const error = { message: 'Form submission failed' };
    reportErrorPage(error, { sdk });
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('Form submission failed');
  });

  it('coerces a string error to Error', () => {
    reportErrorPage('plain string failure', { sdk });
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('plain string failure');
  });

  it('de-dupes by reference — second call with same error is a no-op', () => {
    const error = { message: 'page error' };
    expect(reportErrorPage(error, { sdk })).toBe(true);
    expect(reportErrorPage(error, { sdk })).toBe(false);
    expect(sdk.captureError).toHaveBeenCalledTimes(1);
  });

  it('reports two distinct error references', () => {
    expect(reportErrorPage({ message: 'a' }, { sdk })).toBe(true);
    expect(reportErrorPage({ message: 'b' }, { sdk })).toBe(true);
    expect(sdk.captureError).toHaveBeenCalledTimes(2);
  });

  it('reports primitive (non-object) errors every call — they cannot be reference-deduped', () => {
    expect(reportErrorPage('boom', { sdk })).toBe(true);
    expect(reportErrorPage('boom', { sdk })).toBe(true);
    // The de-dupe contract is reference-based; primitives can't be in
    // a WeakSet, so they fall through. Documenting the behaviour here
    // so a future change to "value-based dedupe" lands deliberately.
    expect(sdk.captureError).toHaveBeenCalledTimes(2);
  });

  it('returns false and skips capture when no SDK is reachable', () => {
    expect(reportErrorPage({ message: 'no-sdk' })).toBe(false);
  });

  it('falls back to window.Browsonic when no sdk option is provided', () => {
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    expect(reportErrorPage({ message: 'window-fallback' })).toBe(true);
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('respects custom tagNamespace', () => {
    reportErrorPage({ message: 'custom-ns' }, { sdk, status: 404, tagNamespace: 'app1.errPage' });
    expect(sdk.setTag).toHaveBeenCalledWith('app1.errPage.status', '404');
  });

  it('is isolated from a captureError that itself throws', () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    expect(() => reportErrorPage({ message: 'iso' }, { sdk })).not.toThrow();
  });

  it('returns false during SSR (no window)', () => {
    const originalWindow = globalThis.window;
    // happy-dom installs window as a non-configurable property on
    // globalThis; deleting via cast still drops it for our typeof
    // check.
    delete (globalThis as { window?: unknown }).window;
    try {
      expect(reportErrorPage({ message: 'ssr' }, { sdk })).toBe(false);
      expect(sdk.captureError).not.toHaveBeenCalled();
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it('serialises an opaque error object when message is missing', () => {
    reportErrorPage({ code: 'ERR_X', detail: 'something went wrong' }, { sdk });
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toContain('ERR_X');
  });
});
