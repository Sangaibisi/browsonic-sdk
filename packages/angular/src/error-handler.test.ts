// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicErrorHandler regression suite. Tests the `handleError`
 * shape Angular's runtime expects: forwards thrown values to the
 * SDK, never throws itself, optionally falls back to `console.error`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { BrowsonicErrorHandler } from './error-handler';

function makeFakeSdk(): Browsonic {
  return { captureError: vi.fn() } as unknown as Browsonic;
}

let consoleSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleSpy.mockRestore();
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('BrowsonicErrorHandler', () => {
  it('forwards a thrown Error to sdk.captureError', () => {
    const sdk = makeFakeSdk();
    const handler = new BrowsonicErrorHandler({ sdk });
    const err = new Error('crashed');
    handler.handleError(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('coerces non-Error throws into Error', () => {
    const sdk = makeFakeSdk();
    const handler = new BrowsonicErrorHandler({ sdk });
    handler.handleError('string-as-error');
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('string-as-error');
  });

  it('falls back to window.Browsonic.getBrowsonic() when no sdk option is passed', () => {
    const sdk = makeFakeSdk();
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const handler = new BrowsonicErrorHandler();
    handler.handleError(new Error('x'));
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('logs to console.error by default (matches Angular default UX)', () => {
    const sdk = makeFakeSdk();
    const handler = new BrowsonicErrorHandler({ sdk });
    handler.handleError(new Error('x'));
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('skips console.error when consoleFallback is false', () => {
    const sdk = makeFakeSdk();
    const handler = new BrowsonicErrorHandler({ sdk, consoleFallback: false });
    handler.handleError(new Error('x'));
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('still logs to console when no SDK is reachable', () => {
    const handler = new BrowsonicErrorHandler();
    handler.handleError(new Error('x'));
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('isolates a thrown captureError so handleError never escapes', () => {
    const sdk = makeFakeSdk();
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const handler = new BrowsonicErrorHandler({ sdk });
    expect(() => handler.handleError(new Error('x'))).not.toThrow();
  });
});
