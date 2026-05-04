// SPDX-License-Identifier: Apache-2.0

/**
 * Capture-wrapper regression suite. Mirrors the Svelte adapter's
 * test shape — defensive isolation contract is the load-bearing
 * promise.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { captureError, captureMessage, addBreadcrumb } from './capture';

function installFakeSdk(): Browsonic {
  const sdk = {
    captureError: vi.fn(),
    captureMessage: vi.fn(),
    addBreadcrumb: vi.fn(),
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

describe('captureError', () => {
  it('forwards an error to the resolved SDK', () => {
    const sdk = installFakeSdk();
    const err = new Error('x');
    captureError(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('is a no-op when SDK is unreachable', () => {
    expect(() => captureError(new Error('x'))).not.toThrow();
  });

  it('swallows a thrown sdk.captureError', () => {
    const sdk = installFakeSdk();
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    expect(() => captureError(new Error('x'))).not.toThrow();
  });
});

describe('captureMessage', () => {
  it('forwards message + level', () => {
    const sdk = installFakeSdk();
    captureMessage('hello', 'warn');
    expect(sdk.captureMessage).toHaveBeenCalledWith('hello', 'warn');
  });

  it('defaults level to "info"', () => {
    const sdk = installFakeSdk();
    captureMessage('hi');
    expect(sdk.captureMessage).toHaveBeenCalledWith('hi', 'info');
  });

  it('is a no-op when SDK is unreachable', () => {
    expect(() => captureMessage('x')).not.toThrow();
  });
});

describe('addBreadcrumb', () => {
  it('forwards a breadcrumb', () => {
    const sdk = installFakeSdk();
    addBreadcrumb({ category: 'navigation', message: 'm' });
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({ category: 'navigation', message: 'm' });
  });

  it('is a no-op when SDK is unreachable', () => {
    expect(() => addBreadcrumb({ category: 'navigation' })).not.toThrow();
  });

  it('swallows a thrown addBreadcrumb', () => {
    const sdk = installFakeSdk();
    (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => addBreadcrumb({ category: 'navigation' })).not.toThrow();
  });
});
