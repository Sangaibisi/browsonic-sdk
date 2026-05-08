// SPDX-License-Identifier: Apache-2.0

/**
 * withBrowsonicRouteHandler regression suite. The wrapper passes
 * the original handler's return value through unchanged on the
 * happy path and forwards thrown errors to the SDK before re-
 * throwing them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { withBrowsonicRouteHandler } from './route-handler';

function installFakeSdk(): Browsonic {
  const sdk = {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setContext: vi.fn(),
  } as unknown as Browsonic;
  (window as typeof window & { Browsonic?: unknown }).Browsonic = {
    getBrowsonic: () => sdk,
  };
  return sdk;
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('withBrowsonicRouteHandler', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('returns the handler value unchanged on the happy path', async () => {
    const wrapped = withBrowsonicRouteHandler(async () => 'ok');
    await expect(wrapped()).resolves.toBe('ok');
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('forwards a thrown Error to sdk.captureError', async () => {
    const err = new Error('handler-failed');
    const wrapped = withBrowsonicRouteHandler(async () => {
      throw err;
    });
    await expect(wrapped()).rejects.toThrow('handler-failed');
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('coerces a non-Error throw into Error before forwarding', async () => {
    const wrapped = withBrowsonicRouteHandler(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string-as-error';
    });
    await expect(wrapped()).rejects.toBe('string-as-error');
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('string-as-error');
  });

  it('tags the route-handler origin in metadata', async () => {
    const wrapped = withBrowsonicRouteHandler(async () => {
      throw new Error('x');
    });
    await expect(wrapped()).rejects.toThrow('x');
    expect(sdk.addMetadata).toHaveBeenCalledWith('nextjsRouteHandler', 'true');
  });

  it('re-throws the error even when the SDK is unreachable', async () => {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    const wrapped = withBrowsonicRouteHandler(async () => {
      throw new Error('x');
    });
    await expect(wrapped()).rejects.toThrow('x');
  });

  it('does not poison the handler when captureError throws', async () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const wrapped = withBrowsonicRouteHandler(async () => {
      throw new Error('original');
    });
    // The original error must still propagate, not the reporter's.
    await expect(wrapped()).rejects.toThrow('original');
  });

  it('passes handler arguments through unchanged', async () => {
    const handler = vi.fn().mockResolvedValue('done');
    const wrapped = withBrowsonicRouteHandler(handler);
    await wrapped('arg1', 42, { key: 'value' });
    expect(handler).toHaveBeenCalledWith('arg1', 42, { key: 'value' });
  });
});
