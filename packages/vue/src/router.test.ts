// SPDX-License-Identifier: Apache-2.0

/**
 * `installRouterInstrumentation` tests. We pass a hand-rolled
 * `RouterLike` so the suite doesn't take a vue-router dependency. The
 * shape of `afterEach(guard) → unsubscribe` is the only contract the
 * instrumentation cares about, and the same shape works against Vue
 * Router 4 in production.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { installRouterInstrumentation, type RouterLike, type RouteLocationLike } from './router';

type Guard = (to: RouteLocationLike, from: RouteLocationLike) => void;

function makeFakeSdk(): Browsonic {
  return {
    addBreadcrumb: vi.fn(),
  } as unknown as Browsonic;
}

function makeFakeRouter(): { router: RouterLike; navigate: Guard; off: ReturnType<typeof vi.fn> } {
  const guards: Guard[] = [];
  const off = vi.fn();
  const router: RouterLike = {
    afterEach: (guard) => {
      guards.push(guard);
      return off;
    },
  };
  const navigate: Guard = (to, from) => {
    for (const g of guards) g(to, from);
  };
  return { router, navigate, off };
}

const route = (fullPath: string, name?: string | symbol | null): RouteLocationLike => ({
  fullPath,
  path: fullPath.split('?')[0] ?? fullPath,
  ...(name !== undefined ? { name } : {}),
});

describe('installRouterInstrumentation', () => {
  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('emits a navigation breadcrumb on every route change', () => {
    const sdk = makeFakeSdk();
    const { router, navigate } = makeFakeRouter();

    installRouterInstrumentation(router, { sdk });
    navigate(route('/dashboard'), route('/'));

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(sdk.addBreadcrumb).toHaveBeenCalledWith({
      category: 'navigation',
      message: '/ → /dashboard',
      data: { from: '/', to: '/dashboard' },
    });
  });

  it('attaches `name` to breadcrumb data when the route is named', () => {
    const sdk = makeFakeSdk();
    const { router, navigate } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk });

    navigate(route('/profile/42', 'profile'), route('/'));

    const call = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data).toMatchObject({
      from: '/',
      to: '/profile/42',
      name: 'profile',
    });
  });

  it('respects a custom category', () => {
    const sdk = makeFakeSdk();
    const { router, navigate } = makeFakeRouter();

    installRouterInstrumentation(router, { sdk, category: 'spa.nav' });
    navigate(route('/a'), route('/b'));

    expect((sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      category: 'spa.nav',
    });
  });

  it('skipInitial drops the first guard call only', () => {
    const sdk = makeFakeSdk();
    const { router, navigate } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk, skipInitial: true });

    navigate(route('/'), route('/'));
    navigate(route('/about'), route('/'));

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect((sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      message: '/ → /about',
    });
  });

  it('returns the unsubscribe handle from afterEach', () => {
    const sdk = makeFakeSdk();
    const { router, off } = makeFakeRouter();
    const unsub = installRouterInstrumentation(router, { sdk });
    unsub();
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('falls back to window.Browsonic when sdk is not provided', () => {
    const sdk = makeFakeSdk();
    (globalThis as { window?: unknown }).window = {
      Browsonic: { getBrowsonic: () => sdk },
    };
    const { router, navigate } = makeFakeRouter();

    installRouterInstrumentation(router);
    navigate(route('/x'), route('/y'));

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no SDK is reachable', () => {
    const { router, navigate } = makeFakeRouter();
    // No sdk option, no window.Browsonic.
    installRouterInstrumentation(router);
    expect(() => navigate(route('/a'), route('/b'))).not.toThrow();
  });

  it('swallows addBreadcrumb errors so navigation never throws', () => {
    const sdk = {
      addBreadcrumb: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as Browsonic;
    const { router, navigate } = makeFakeRouter();
    installRouterInstrumentation(router, { sdk });

    expect(() => navigate(route('/a'), route('/b'))).not.toThrow();
    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
  });
});
