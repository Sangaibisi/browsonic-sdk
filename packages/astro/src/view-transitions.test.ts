// SPDX-License-Identifier: Apache-2.0

/**
 * registerNavigationBreadcrumbs regression suite. Verifies the
 * `astro:after-swap` listener wires up correctly, emits a breadcrumb
 * on each event, tolerates a missing SDK, and detaches cleanly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { registerNavigationBreadcrumbs } from './view-transitions';

function installFakeSdk(): Browsonic {
  const sdk = {
    addBreadcrumb: vi.fn(),
  } as unknown as Browsonic;
  (window as typeof window & { Browsonic?: unknown }).Browsonic = {
    getBrowsonic: () => sdk,
  };
  return sdk;
}

// Track per-test subscriptions so they don't leak listener attachments
// onto `document`. happy-dom does not auto-cleanup across tests, so a
// failure to unsubscribe lets the next test's `dispatchEvent` fire
// every previously-registered handler — easy spurious failures.
const subscriptions: Array<() => void> = [];

afterEach(() => {
  for (const off of subscriptions.splice(0)) {
    try {
      off();
    } catch {
      // ignore
    }
  }
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    window.history.pushState({}, '', '/');
  }
});

function track(off: () => void): () => void {
  subscriptions.push(off);
  return off;
}

describe('registerNavigationBreadcrumbs', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('emits a navigation breadcrumb on astro:after-swap', () => {
    track(registerNavigationBreadcrumbs({ sdk }));
    window.history.pushState({}, '', '/about');
    document.dispatchEvent(new Event('astro:after-swap'));

    expect(sdk.addBreadcrumb).toHaveBeenCalled();
    const arg = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      category: string;
      data?: { from: string; to: string; source: string };
    };
    expect(arg.category).toBe('navigation');
    expect(arg.data?.to).toBe('/about');
    expect(arg.data?.source).toBe('astro:view-transitions');
  });

  it('chains from→to across consecutive swaps', () => {
    track(registerNavigationBreadcrumbs({ sdk }));

    window.history.pushState({}, '', '/about');
    document.dispatchEvent(new Event('astro:after-swap'));

    window.history.pushState({}, '', '/contact');
    document.dispatchEvent(new Event('astro:after-swap'));

    const calls = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBe(2);
    expect((calls[1]![0] as { data?: { from: string } }).data?.from).toBe('/about');
  });

  it('falls back to window.Browsonic when no sdk option is passed', () => {
    track(registerNavigationBreadcrumbs());
    window.history.pushState({}, '', '/x');
    document.dispatchEvent(new Event('astro:after-swap'));
    expect(sdk.addBreadcrumb).toHaveBeenCalled();
  });

  it('is a no-op when SDK is unreachable', () => {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    expect(() => {
      track(registerNavigationBreadcrumbs());
      document.dispatchEvent(new Event('astro:after-swap'));
    }).not.toThrow();
  });

  it('isolates a thrown addBreadcrumb', () => {
    (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });
    track(registerNavigationBreadcrumbs({ sdk }));
    expect(() => document.dispatchEvent(new Event('astro:after-swap'))).not.toThrow();
  });

  it('returns an unsubscribe function that detaches the listener', () => {
    const off = registerNavigationBreadcrumbs({ sdk });
    off();
    document.dispatchEvent(new Event('astro:after-swap'));
    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('honours a custom eventName', () => {
    track(registerNavigationBreadcrumbs({ sdk, eventName: 'custom:swap' }));
    document.dispatchEvent(new Event('custom:swap'));
    expect(sdk.addBreadcrumb).toHaveBeenCalled();
  });

  it('emits an intent-phase breadcrumb on astro:before-preparation when includeIntent: true (0.2)', () => {
    track(registerNavigationBreadcrumbs({ sdk, includeIntent: true }));

    // Astro's real before-preparation event carries `from` + `to` URL
    // properties on the event itself. We mimic that shape.
    const intent = Object.assign(new Event('astro:before-preparation'), {
      from: new URL('https://x.test/'),
      to: new URL('https://x.test/destination'),
    });
    document.dispatchEvent(intent);

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      data: Record<string, unknown>;
      message: string;
    };
    expect(arg.data).toMatchObject({
      from: '/',
      to: '/destination',
      phase: 'intent',
      source: 'astro:view-transitions',
    });
    expect(arg.message).toContain('(intent)');
  });

  it('tags both phases when includeIntent: true and a full swap fires (0.2)', () => {
    track(registerNavigationBreadcrumbs({ sdk, includeIntent: true }));

    document.dispatchEvent(
      Object.assign(new Event('astro:before-preparation'), {
        from: new URL('https://x.test/'),
        to: new URL('https://x.test/n'),
      }),
    );
    window.history.pushState({}, '', '/n');
    document.dispatchEvent(new Event('astro:after-swap'));

    const calls = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    expect((calls[0]![0] as { data: { phase: string } }).data.phase).toBe('intent');
    expect((calls[1]![0] as { data: { phase: string } }).data.phase).toBe('completed');
  });
});
