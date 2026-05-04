// SPDX-License-Identifier: Apache-2.0

/**
 * `withBrowsonicAstroAction` regression suite. We don't import from
 * `astro:actions` (server-only API + injects `astro` runtime); the
 * wrapper takes plain handler signatures so the suite drives
 * fixture handlers directly. happy-dom provides `window`; the
 * server-runtime path is exercised by deleting `globalThis.window`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { withBrowsonicAstroAction } from './actions';

function makeFakeSdk(): Browsonic {
  return {
    captureError: vi.fn(),
    setTag: vi.fn(),
    addMetadata: vi.fn(),
  } as unknown as Browsonic;
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('withBrowsonicAstroAction', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('returns the handler value untouched on success', async () => {
    const handler = vi.fn((_input: { email: string }) => Promise.resolve({ ok: true }));
    const wrapped = withBrowsonicAstroAction(handler, { sdk });
    const result = await wrapped({ email: 'a@b.c' });
    expect(result).toEqual({ ok: true });
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('reports a thrown Error and re-throws so Astro sees the failure', async () => {
    const err = new Error('signup failed');
    const wrapped = withBrowsonicAstroAction(
      () => {
        throw err;
      },
      { sdk, actionName: 'signup' },
    );

    await expect(wrapped()).rejects.toBe(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
    expect(sdk.setTag).toHaveBeenCalledWith('astro.action.name', 'signup');
    expect(sdk.setTag).toHaveBeenCalledWith('astro.runtime', 'action');
  });

  it('coerces a non-Error throw to Error before reporting', async () => {
    const wrapped = withBrowsonicAstroAction(
      () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain-string-throw';
      },
      { sdk },
    );

    await expect(wrapped()).rejects.toBe('plain-string-throw');
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('plain-string-throw');
  });

  it('skips the action.name tag when actionName is omitted', async () => {
    const wrapped = withBrowsonicAstroAction(
      () => {
        throw new Error('boom');
      },
      { sdk },
    );

    await expect(wrapped()).rejects.toThrow();
    const setTagCalls = (sdk.setTag as ReturnType<typeof vi.fn>).mock.calls;
    expect(setTagCalls.find((c) => c[0] === 'astro.action.name')).toBeUndefined();
    // The runtime tag still fires so the dashboard can route the
    // event to the Astro Actions bucket even without a name.
    expect(setTagCalls.find((c) => c[0] === 'astro.runtime')).toBeDefined();
  });

  it('respects a custom tagNamespace', async () => {
    const wrapped = withBrowsonicAstroAction(
      () => {
        throw new Error('boom');
      },
      { sdk, actionName: 'doThing', tagNamespace: 'app1.action' },
    );

    await expect(wrapped()).rejects.toThrow();
    expect(sdk.setTag).toHaveBeenCalledWith('app1.action.name', 'doThing');
  });

  it('forwards an async handler value', async () => {
    const wrapped = withBrowsonicAstroAction(
      async (n: number) => {
        await Promise.resolve();
        return n * 2;
      },
      { sdk },
    );
    expect(await wrapped(21)).toBe(42);
  });

  it('reports an async rejection', async () => {
    const err = new Error('async-failure');
    const wrapped = withBrowsonicAstroAction(
      async () => {
        await Promise.resolve();
        throw err;
      },
      { sdk, actionName: 'asyncOp' },
    );

    await expect(wrapped()).rejects.toBe(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('falls back to window.Browsonic when no sdk option is provided', async () => {
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const wrapped = withBrowsonicAstroAction(() => {
      throw new Error('boom');
    });
    await expect(wrapped()).rejects.toThrow();
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('runs the handler and re-throws even when no SDK is reachable', async () => {
    const err = new Error('no-sdk-still-throws');
    const wrapped = withBrowsonicAstroAction(() => {
      throw err;
    });
    await expect(wrapped()).rejects.toBe(err);
  });

  it('is isolated from a captureError that itself throws', async () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const wrapped = withBrowsonicAstroAction(
      () => {
        throw new Error('original');
      },
      { sdk },
    );

    // The user-visible failure must remain the original error, not
    // the reporter's secondary throw.
    await expect(wrapped()).rejects.toThrow('original');
  });

  it('passes through multi-arg handlers (input + context)', async () => {
    // Astro Actions hand the handler `(input, context)` — make sure
    // our generic wrapper composes cleanly with the 2-arg shape.
    const handler = vi.fn(async (input: { id: string }, ctx: { request?: Request }) => ({
      id: input.id,
      method: ctx.request?.method ?? 'GET',
    }));
    const wrapped = withBrowsonicAstroAction(handler, { sdk });
    const result = await wrapped({ id: 'x' }, { request: new Request('http://localhost/') });
    expect(result).toEqual({ id: 'x', method: 'GET' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('on server-runtime (no window) the wrapper still runs and re-throws', async () => {
    const originalWindow = globalThis.window;
    delete (globalThis as { window?: unknown }).window;
    try {
      const err = new Error('server-side');
      const wrapped = withBrowsonicAstroAction(() => {
        throw err;
      });
      await expect(wrapped()).rejects.toBe(err);
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });
});
