// SPDX-License-Identifier: Apache-2.0

/**
 * handleErrorWithBrowsonic regression suite. The factory wraps the
 * SDK call-site for SvelteKit's `handleError` hook; tests cover happy
 * path, defensive isolation, and the optional next-handler chain.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { handleErrorWithBrowsonic } from './handle-error';

function makeFakeSdk(): Browsonic {
  return {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
  } as unknown as Browsonic;
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('handleErrorWithBrowsonic', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('forwards a thrown Error to sdk.captureError', () => {
    const handle = handleErrorWithBrowsonic({ sdk });
    const err = new Error('crashed');
    handle({ error: err });
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('coerces a non-Error into Error before forwarding', () => {
    const handle = handleErrorWithBrowsonic({ sdk });
    handle({ error: 'string-as-error' });
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('string-as-error');
  });

  it('records the SvelteKit URL pathname under sveltekitPath metadata', () => {
    const handle = handleErrorWithBrowsonic({ sdk });
    handle({ error: new Error('x'), event: { url: { pathname: '/checkout' } } });
    expect(sdk.addMetadata).toHaveBeenCalledWith('sveltekitPath', '/checkout');
  });

  it('falls back to window.Browsonic.getBrowsonic() when no sdk is passed', () => {
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const handle = handleErrorWithBrowsonic();
    handle({ error: new Error('x') });
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('is a no-op when the SDK is unreachable', () => {
    const handle = handleErrorWithBrowsonic();
    expect(() => handle({ error: new Error('x') })).not.toThrow();
  });

  it('isolates a thrown captureError so SvelteKit error path stays alive', () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const handle = handleErrorWithBrowsonic({ sdk });
    expect(() => handle({ error: new Error('x') })).not.toThrow();
  });

  it('chains into a user-supplied next handler and returns its payload', () => {
    const chain = vi.fn().mockReturnValue({ message: 'wrapped' });
    const handle = handleErrorWithBrowsonic({ sdk, chain });
    const result = handle({ error: new Error('x') });
    expect(chain).toHaveBeenCalled();
    expect(result).toEqual({ message: 'wrapped' });
  });

  it('isolates a throwing chain handler', () => {
    const chain = vi.fn().mockImplementation(() => {
      throw new Error('chain-broken');
    });
    const handle = handleErrorWithBrowsonic({ sdk, chain });
    expect(() => handle({ error: new Error('x') })).not.toThrow();
  });
});
