// SPDX-License-Identifier: Apache-2.0

/**
 * installRouterInstrumentation regression suite. We pass a hand-rolled
 * RouterLike with an in-memory event stream so the test doesn't take
 * an `@angular/router` (or RxJS) dependency.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { installRouterInstrumentation, type RouterLike, type RouterEventLike } from './router';

function makeFakeSdk(): Browsonic {
  return {
    addBreadcrumb: vi.fn(),
  } as unknown as Browsonic;
}

function makeFakeRouter(): {
  router: RouterLike;
  emit: (event: RouterEventLike) => void;
  unsubscribe: ReturnType<typeof vi.fn>;
} {
  const subscribers: Array<(event: RouterEventLike) => void> = [];
  const unsubscribe = vi.fn();
  const router: RouterLike = {
    events: {
      subscribe: (observer) => {
        subscribers.push(observer);
        return { unsubscribe };
      },
    },
  };
  const emit = (event: RouterEventLike) => {
    for (const s of subscribers) s(event);
  };
  return { router, emit, unsubscribe };
}

beforeEach(() => {
  delete (globalThis as { window?: unknown }).window;
});
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('installRouterInstrumentation', () => {
  it('emits a navigation breadcrumb on NavigationEnd events', () => {
    const sdk = makeFakeSdk();
    const { router, emit } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk });

    // First navigation: lastUrl was null, fall back to event.url.
    emit({ url: '/', urlAfterRedirects: '/dashboard' });

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({
      category: 'navigation',
      message: '/ → /dashboard',
      data: { from: '/', to: '/dashboard' },
    });
  });

  it('threads lastUrl across consecutive navigations', () => {
    const sdk = makeFakeSdk();
    const { router, emit } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk });

    emit({ url: '/', urlAfterRedirects: '/a' });
    emit({ url: '/a', urlAfterRedirects: '/b' });

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(2);
    const second = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[1]![0] as {
      data: Record<string, unknown>;
    };
    expect(second.data).toMatchObject({ from: '/a', to: '/b' });
  });

  it('ignores non-NavigationEnd events (no urlAfterRedirects)', () => {
    const sdk = makeFakeSdk();
    const { router, emit } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk });

    emit({ url: '/dashboard' }); // NavigationStart-like
    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('attaches the navigationTrigger when present', () => {
    const sdk = makeFakeSdk();
    const { router, emit } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk });

    emit({ url: '/', urlAfterRedirects: '/x', navigationTrigger: 'popstate' });
    expect((sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      data: { trigger: 'popstate' },
    });
  });

  it('respects a custom category', () => {
    const sdk = makeFakeSdk();
    const { router, emit } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk, category: 'router.nav' });

    emit({ url: '/', urlAfterRedirects: '/y' });
    expect((sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      category: 'router.nav',
    });
  });

  it('returns an unsubscribe that calls Subscription.unsubscribe()', () => {
    const sdk = makeFakeSdk();
    const { router, unsubscribe } = makeFakeRouter();
    const off = installRouterInstrumentation(router, { sdk });

    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('falls back to window.Browsonic when sdk is not provided', () => {
    const sdk = makeFakeSdk();
    (globalThis as { window?: unknown }).window = {
      Browsonic: { getBrowsonic: () => sdk },
    };
    const { router, emit } = makeFakeRouter();

    installRouterInstrumentation(router);
    emit({ url: '/', urlAfterRedirects: '/z' });

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no SDK is reachable', () => {
    const { router, emit } = makeFakeRouter();
    installRouterInstrumentation(router);
    expect(() => emit({ url: '/', urlAfterRedirects: '/no-sdk' })).not.toThrow();
  });

  it('swallows addBreadcrumb errors so navigation events keep flowing', () => {
    const sdk = {
      addBreadcrumb: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as Browsonic;
    const { router, emit } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk });

    expect(() => emit({ url: '/', urlAfterRedirects: '/will-throw' })).not.toThrow();
    // The next navigation also goes through cleanly.
    expect(() => emit({ url: '/will-throw', urlAfterRedirects: '/recovered' })).not.toThrow();
    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(2);
  });
});
