// SPDX-License-Identifier: Apache-2.0

/**
 * `withBrowsonicAction` regression suite. Hand-rolled `ActionEventLike`
 * fixtures stand in for SvelteKit's `RequestEvent` so the suite doesn't
 * pull `@sveltejs/kit` into the build. The wrapper's contract is small
 * enough that this is a 1:1 mapping, not a simplification.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { withBrowsonicAction, type ActionEventLike } from './form-actions';

function makeFakeSdk(): Browsonic {
  return {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setTag: vi.fn(),
  } as unknown as Browsonic;
}

const event = (overrides: Partial<ActionEventLike> = {}): ActionEventLike => ({
  url: { pathname: '/login' },
  request: { method: 'POST' },
  route: { id: '/login' },
  ...overrides,
});

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('withBrowsonicAction', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('returns the handler value untouched on success', async () => {
    const handler = vi.fn(() => Promise.resolve({ ok: true }));
    const wrapped = withBrowsonicAction(handler, { sdk });
    const result = await wrapped(event());
    expect(result).toEqual({ ok: true });
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('reports a thrown Error and re-throws so SvelteKit sees the failure', async () => {
    const err = new Error('login failed');
    const wrapped = withBrowsonicAction(
      () => {
        throw err;
      },
      { sdk },
    );

    await expect(wrapped(event())).rejects.toBe(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('coerces a non-Error throw to Error before reporting', async () => {
    // Deliberately throwing a non-Error here — that's the contract
    // the wrapper has to handle gracefully (legacy code, SvelteKit's
    // `error()` helper output). The test would be pointless if we
    // threw an Error.
    const wrapped = withBrowsonicAction(
      () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw 'plain-string-throw';
      },
      { sdk },
    );

    await expect(wrapped(event())).rejects.toBe('plain-string-throw');
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('plain-string-throw');
  });

  it('attaches sveltekitPath + action.name + action.method tags', async () => {
    const wrapped = withBrowsonicAction(
      () => {
        throw new Error('boom');
      },
      { sdk, actionName: 'login.default' },
    );

    await expect(wrapped(event())).rejects.toThrow();
    expect(sdk.addMetadata).toHaveBeenCalledWith('sveltekitPath', '/login');
    expect(sdk.setTag).toHaveBeenCalledWith('sveltekit.action.name', 'login.default');
    expect(sdk.setTag).toHaveBeenCalledWith('sveltekit.action.method', 'POST');
  });

  it('falls back to route.id when actionName is omitted', async () => {
    const wrapped = withBrowsonicAction(
      () => {
        throw new Error('boom');
      },
      { sdk },
    );

    await expect(wrapped(event())).rejects.toThrow();
    expect(sdk.setTag).toHaveBeenCalledWith('sveltekit.action.name', '/login');
  });

  it('falls back to "default" when no actionName and no route.id', async () => {
    const wrapped = withBrowsonicAction(
      () => {
        throw new Error('boom');
      },
      { sdk },
    );

    // Build the event without `route` at all — exactOptionalPropertyTypes
    // forbids `{ route: undefined }`, but omitting the key means the
    // optional property is genuinely absent.
    const noRoute: ActionEventLike = {
      url: { pathname: '/login' },
      request: { method: 'POST' },
    };
    await expect(wrapped(noRoute)).rejects.toThrow();
    expect(sdk.setTag).toHaveBeenCalledWith('sveltekit.action.name', 'default');
  });

  it('respects custom tagNamespace', async () => {
    const wrapped = withBrowsonicAction(
      () => {
        throw new Error('boom');
      },
      { sdk, tagNamespace: 'app1.action' },
    );

    await expect(wrapped(event())).rejects.toThrow();
    expect(sdk.setTag).toHaveBeenCalledWith('app1.action.name', '/login');
    expect(sdk.setTag).toHaveBeenCalledWith('app1.action.method', 'POST');
  });

  it('falls back to window.Browsonic when no sdk option is provided', async () => {
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const wrapped = withBrowsonicAction(() => {
      throw new Error('boom');
    });

    await expect(wrapped(event())).rejects.toThrow();
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('runs the handler and re-throws even when no SDK is reachable', async () => {
    const err = new Error('no-sdk-still-throws');
    const wrapped = withBrowsonicAction(() => {
      throw err;
    });

    await expect(wrapped(event())).rejects.toBe(err);
  });

  it('is isolated from a captureError that itself throws', async () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const wrapped = withBrowsonicAction(
      () => {
        throw new Error('original');
      },
      { sdk },
    );

    // The user-visible failure must remain the original error, not
    // the reporter's secondary throw.
    await expect(wrapped(event())).rejects.toThrow('original');
  });

  it('supports synchronous handlers', async () => {
    const wrapped = withBrowsonicAction((): { ok: true } => ({ ok: true }), { sdk });
    const result = await wrapped(event());
    expect(result).toEqual({ ok: true });
  });
});
