// SPDX-License-Identifier: Apache-2.0

/**
 * bootstrapBrowsonic regression suite. Smoke-tests the
 * `entry.client.tsx` helper: config merge, SDK return, idempotence,
 * SSR no-op.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { bootstrapBrowsonic } from './bootstrap';

interface BrowsonicWindow {
  Browsonic?: {
    config?: Record<string, unknown>;
    getBrowsonic?: () => Browsonic | null;
  };
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as Window & BrowsonicWindow).Browsonic;
  }
});

describe('bootstrapBrowsonic', () => {
  it('sets window.Browsonic.config from the supplied options', () => {
    bootstrapBrowsonic({
      apiEndpoint: 'https://x.test/v1/events',
      appKey: 'remix',
      environment: 'staging',
    });
    const w = window as Window & BrowsonicWindow;
    expect(w.Browsonic?.config).toEqual({
      apiEndpoint: 'https://x.test/v1/events',
      appKey: 'remix',
      environment: 'staging',
    });
  });

  it('merges new options on top of an existing config (idempotent)', () => {
    const w = window as Window & BrowsonicWindow;
    w.Browsonic = { config: { release: 'v1.2.3', clientVersion: 'browsonic-sdk@2.4' } };

    bootstrapBrowsonic({
      apiEndpoint: 'https://x.test/v1/events',
      environment: 'production',
    });

    expect(w.Browsonic?.config).toEqual({
      release: 'v1.2.3',
      clientVersion: 'browsonic-sdk@2.4',
      apiEndpoint: 'https://x.test/v1/events',
      environment: 'production',
    });
  });

  it('preserves an existing config when called with no options', () => {
    const w = window as Window & BrowsonicWindow;
    w.Browsonic = { config: { apiEndpoint: 'https://from-server.test', appKey: 'serverless' } };

    bootstrapBrowsonic();

    expect(w.Browsonic?.config).toEqual({
      apiEndpoint: 'https://from-server.test',
      appKey: 'serverless',
    });
  });

  it('returns the SDK singleton when window.Browsonic.getBrowsonic resolves it', () => {
    const sdk = { captureError: vi.fn() } as unknown as Browsonic;
    (window as Window & BrowsonicWindow).Browsonic = {
      getBrowsonic: () => sdk,
    };

    const result = bootstrapBrowsonic({ apiEndpoint: 'https://x.test' });
    expect(result).toBe(sdk);
  });

  it('returns null when no SDK is reachable yet (SDK loads later)', () => {
    const result = bootstrapBrowsonic({ apiEndpoint: 'https://x.test' });
    expect(result).toBeNull();
  });

  it('does not overwrite a field that the caller did not supply', () => {
    const w = window as Window & BrowsonicWindow;
    w.Browsonic = { config: { apiEndpoint: 'https://existing.test' } };

    bootstrapBrowsonic({ environment: 'staging' });

    expect(w.Browsonic?.config?.apiEndpoint).toBe('https://existing.test');
    expect(w.Browsonic?.config?.environment).toBe('staging');
  });
});
