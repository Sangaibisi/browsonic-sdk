// SPDX-License-Identifier: Apache-2.0

/**
 * provideBrowsonic regression suite. The factory returns Angular
 * provider records; tests verify the shape (no Angular runtime
 * dependency in the test).
 */
import { describe, it, expect } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { provideBrowsonic } from './provide';
import { BrowsonicErrorHandler } from './error-handler';
import { BrowsonicService } from './service';

function makeFakeSdk(): Browsonic {
  return {
    captureError: () => {},
  } as unknown as Browsonic;
}

describe('provideBrowsonic', () => {
  it('returns a providers array with two entries', () => {
    const providers = provideBrowsonic();
    expect(providers.length).toBe(2);
  });

  it('binds BrowsonicErrorHandler', () => {
    const providers = provideBrowsonic();
    const errorHandlerProvider = providers.find(
      (p) => (p as { provide?: unknown }).provide === BrowsonicErrorHandler,
    );
    expect(errorHandlerProvider).toBeDefined();
    expect((errorHandlerProvider as { useValue?: unknown }).useValue).toBeInstanceOf(
      BrowsonicErrorHandler,
    );
  });

  it('binds BrowsonicService', () => {
    const providers = provideBrowsonic();
    const serviceProvider = providers.find(
      (p) => (p as { provide?: unknown }).provide === BrowsonicService,
    );
    expect(serviceProvider).toBeDefined();
    expect((serviceProvider as { useValue?: unknown }).useValue).toBeInstanceOf(BrowsonicService);
  });

  it('passes through the explicit sdk option', () => {
    const sdk = makeFakeSdk();
    const providers = provideBrowsonic({ sdk });
    const serviceProvider = providers.find(
      (p) => (p as { provide?: unknown }).provide === BrowsonicService,
    ) as { useValue: BrowsonicService };
    expect(serviceProvider.useValue.getSdk()).toBe(sdk);
  });
});
