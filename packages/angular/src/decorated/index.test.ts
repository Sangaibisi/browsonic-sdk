// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/angular/decorated` regression suite. We deliberately
 * avoid spinning up a full Angular TestBed (would force
 * `@angular/platform-browser` + `zone.js` / a change-detection
 * scheduler into our test graph). Instead we exercise:
 *
 *   1. `BrowsonicDecoratedService` — the class constructor +
 *      inheritance contract; the decorated service is a subclass
 *      of `BrowsonicService` and inherits every defensive
 *      `try/catch` the parent ships.
 *   2. `applyUserToSdk` — the test-friendly extraction of the
 *      signal-effect's SDK-write path. Calling it directly mirrors
 *      what the effect does each tick, without needing a
 *      change-detection scheduler.
 *   3. The provider shape returned by `provideBrowsonicUserSignal` —
 *      a `Provider[]` with one entry binding `BROWSONIC_USER_SIGNAL`
 *      via `useFactory`. Asserts the wiring contract without
 *      executing the factory (factory needs an injection context).
 *
 * Production usage is unaffected: when the factory runs inside a
 * real `bootstrapApplication` / `AppModule.providers` injector, the
 * effect picks up the bootstrap-provided change-detection scheduler
 * and ticks normally on every signal write.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import {
  BrowsonicDecoratedService,
  BROWSONIC_USER_SIGNAL,
  provideBrowsonicUserSignal,
  applyUserToSdk,
} from './index';

function installFakeSdk(): Browsonic {
  const sdk = {
    setUser: vi.fn(),
    clearUser: vi.fn(),
    captureError: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
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

describe('BrowsonicDecoratedService', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('resolves the SDK from window.Browsonic at construct time', () => {
    const service = new BrowsonicDecoratedService();
    expect(service.getSdk()).toBe(sdk);
  });

  it('forwards captureError to the SDK', () => {
    const service = new BrowsonicDecoratedService();
    const err = new Error('boom');
    service.captureError(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('is a no-op when no SDK is reachable', () => {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    const service = new BrowsonicDecoratedService();
    expect(() => service.captureError(new Error('boom'))).not.toThrow();
  });

  it('inherits the addBreadcrumb / setUser / setTag surface from BrowsonicService', () => {
    const service = new BrowsonicDecoratedService();
    service.setUser({ id: 'u1' });
    service.addBreadcrumb({ category: 'ui.click', message: 'buy' });
    service.setTag('region', 'eu');
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1' });
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({
      category: 'ui.click',
      message: 'buy',
    });
    expect(sdk.setTag).toHaveBeenCalledWith('region', 'eu');
  });
});

describe('applyUserToSdk', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('forwards a non-null user value to sdk.setUser verbatim', () => {
    applyUserToSdk({ id: 'u1', email: 'a@b.test' }, sdk);
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1', email: 'a@b.test' });
  });

  it('clears the user with sdk.setUser({}) when value is null', () => {
    applyUserToSdk(null, sdk);
    expect(sdk.setUser).toHaveBeenCalledWith({});
  });

  it('is isolated from a thrown sdk.setUser', () => {
    (sdk.setUser as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('user-store-exploded');
    });
    expect(() => applyUserToSdk({ id: 'u1' }, sdk)).not.toThrow();
    expect(() => applyUserToSdk(null, sdk)).not.toThrow();
  });

  it('handles repeated calls — every assignment lands once', () => {
    applyUserToSdk({ id: 'u1' }, sdk);
    applyUserToSdk({ id: 'u2' }, sdk);
    applyUserToSdk(null, sdk);
    const calls = (sdk.setUser as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0]?.[0]).toEqual({ id: 'u1' });
    expect(calls[1]?.[0]).toEqual({ id: 'u2' });
    expect(calls[2]?.[0]).toEqual({});
  });
});

describe('provideBrowsonicUserSignal', () => {
  beforeEach(() => {
    installFakeSdk();
  });

  it('returns a Provider[] with one binding under BROWSONIC_USER_SIGNAL', () => {
    const providers = provideBrowsonicUserSignal();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers).toHaveLength(1);
    const entry = providers[0] as { provide: unknown; useFactory: unknown };
    expect(entry.provide).toBe(BROWSONIC_USER_SIGNAL);
    expect(typeof entry.useFactory).toBe('function');
  });

  it('still returns a Provider[] when called with custom options', () => {
    const providers = provideBrowsonicUserSignal({ initial: { id: 'u1' } });
    expect(providers).toHaveLength(1);
  });
});
