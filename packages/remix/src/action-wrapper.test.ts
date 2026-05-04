// SPDX-License-Identifier: Apache-2.0

/**
 * withBrowsonicRemixAction regression suite. Mirrors the Next.js
 * route-handler wrapper test shape: pass-through on the happy path,
 * forward + re-throw on failure, defensive isolation when the
 * reporter throws.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { withBrowsonicRemixAction } from './action-wrapper';

import { withBrowsonicRemixLoader } from './action-wrapper';

function installFakeSdk(): Browsonic {
  const sdk = {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setTag: vi.fn(),
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

describe('withBrowsonicRemixAction', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('passes the resolved value through on the happy path', async () => {
    const wrapped = withBrowsonicRemixAction(async () => ({ ok: true }));
    await expect(wrapped()).resolves.toEqual({ ok: true });
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('forwards a thrown Error to sdk.captureError and re-throws', async () => {
    const err = new Error('action-failed');
    const wrapped = withBrowsonicRemixAction(async () => {
      throw err;
    });
    await expect(wrapped()).rejects.toThrow('action-failed');
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('coerces non-Error throws into Error before forwarding', async () => {
    const wrapped = withBrowsonicRemixAction(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string-as-error';
    });
    await expect(wrapped()).rejects.toBe('string-as-error');
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('string-as-error');
  });

  it('tags the captured event with remixAction metadata', async () => {
    const wrapped = withBrowsonicRemixAction(async () => {
      throw new Error('x');
    });
    await expect(wrapped()).rejects.toThrow('x');
    expect(sdk.addMetadata).toHaveBeenCalledWith('remixAction', 'true');
  });

  it('also tags the captured event with the canonical remix.handler tag (0.2)', async () => {
    const wrapped = withBrowsonicRemixAction(async () => {
      throw new Error('x');
    });
    await expect(wrapped()).rejects.toThrow('x');
    expect(sdk.setTag).toHaveBeenCalledWith('remix.handler', 'action');
  });

  it('still re-throws when the SDK is unreachable', async () => {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    const wrapped = withBrowsonicRemixAction(async () => {
      throw new Error('x');
    });
    await expect(wrapped()).rejects.toThrow('x');
  });

  it('does not poison the response when captureError throws', async () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const wrapped = withBrowsonicRemixAction(async () => {
      throw new Error('original');
    });
    await expect(wrapped()).rejects.toThrow('original');
  });

  it('passes handler arguments through unchanged', async () => {
    const handler = vi.fn().mockResolvedValue('done');
    const wrapped = withBrowsonicRemixAction(handler);
    await wrapped('arg1', 42);
    expect(handler).toHaveBeenCalledWith('arg1', 42);
  });
});

describe('withBrowsonicRemixLoader (0.2)', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('passes the resolved value through on the happy path', async () => {
    const wrapped = withBrowsonicRemixLoader(async () => ({ id: 1 }));
    await expect(wrapped()).resolves.toEqual({ id: 1 });
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('forwards a thrown Error to sdk.captureError and re-throws', async () => {
    const err = new Error('loader-failed');
    const wrapped = withBrowsonicRemixLoader(async () => {
      throw err;
    });
    await expect(wrapped()).rejects.toThrow('loader-failed');
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('tags the captured event with remixLoader metadata + remix.handler tag', async () => {
    const wrapped = withBrowsonicRemixLoader(async () => {
      throw new Error('x');
    });
    await expect(wrapped()).rejects.toThrow('x');
    expect(sdk.addMetadata).toHaveBeenCalledWith('remixLoader', 'true');
    expect(sdk.setTag).toHaveBeenCalledWith('remix.handler', 'loader');
  });

  it('does not poison the response when captureError throws', async () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const wrapped = withBrowsonicRemixLoader(async () => {
      throw new Error('original');
    });
    await expect(wrapped()).rejects.toThrow('original');
  });
});
