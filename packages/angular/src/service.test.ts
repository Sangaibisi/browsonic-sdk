// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicService regression suite. Each public method is a thin
 * shim that resolves the SDK and forwards — tests lock in the
 * defensive isolation contract: throws inside the SDK never bubble.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Browsonic, UserContext } from '@browsonic/sdk';
import { BrowsonicService } from './service';

function makeFakeSdk(): Browsonic {
  return {
    setUser: vi.fn(),
    clearUser: vi.fn(),
    captureError: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
    setTag: vi.fn(),
  } as unknown as Browsonic;
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('BrowsonicService', () => {
  it('forwards setUser to the SDK', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    service.setUser({ id: 'u1' } as UserContext);
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('forwards clearUser to the SDK', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    service.clearUser();
    expect(sdk.clearUser).toHaveBeenCalled();
  });

  it('forwards captureError to the SDK', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    const err = new Error('x');
    service.captureError(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('forwards captureMessage with default level "info"', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    service.captureMessage('hi');
    expect(sdk.captureMessage).toHaveBeenCalledWith('hi', 'info');
  });

  it('forwards captureMessage with explicit level', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    service.captureMessage('hi', 'error');
    expect(sdk.captureMessage).toHaveBeenCalledWith('hi', 'error');
  });

  it('forwards addBreadcrumb', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    service.addBreadcrumb({ category: 'navigation' });
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({ category: 'navigation' });
  });

  it('forwards setTag', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    service.setTag('plan', 'pro');
    expect(sdk.setTag).toHaveBeenCalledWith('plan', 'pro');
  });

  it('falls back to window.Browsonic.getBrowsonic when no sdk option is passed', () => {
    const sdk = makeFakeSdk();
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const service = new BrowsonicService();
    service.captureError(new Error('x'));
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('all methods are no-ops when SDK is unreachable', () => {
    const service = new BrowsonicService();
    expect(() => {
      service.setUser({ id: 'u1' } as UserContext);
      service.clearUser();
      service.captureError(new Error('x'));
      service.captureMessage('hi');
      service.addBreadcrumb({ category: 'navigation' });
      service.setTag('k', 'v');
    }).not.toThrow();
  });

  it('isolates SDK throws across all forwarders', () => {
    const sdk = makeFakeSdk();
    const fns = [
      sdk.setUser,
      sdk.clearUser,
      sdk.captureError,
      sdk.captureMessage,
      sdk.addBreadcrumb,
      sdk.setTag,
    ];
    for (const fn of fns) {
      (fn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('boom');
      });
    }
    const service = new BrowsonicService({ sdk });
    expect(() => {
      service.setUser({ id: 'u1' } as UserContext);
      service.clearUser();
      service.captureError(new Error('x'));
      service.captureMessage('hi');
      service.addBreadcrumb({ category: 'navigation' });
      service.setTag('k', 'v');
    }).not.toThrow();
  });

  it('getSdk returns the resolved instance', () => {
    const sdk = makeFakeSdk();
    const service = new BrowsonicService({ sdk });
    expect(service.getSdk()).toBe(sdk);
  });
});
