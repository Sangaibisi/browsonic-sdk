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

interface FakeRouterWithIntent {
  router: RouterLike;
  navigateIntent: Guard;
  navigateAfter: Guard;
  offAfter: ReturnType<typeof vi.fn>;
  offBefore: ReturnType<typeof vi.fn>;
}

function makeFakeRouterWithIntent(): FakeRouterWithIntent {
  const beforeGuards: Guard[] = [];
  const afterGuards: Guard[] = [];
  const offAfter = vi.fn();
  const offBefore = vi.fn();
  const router: RouterLike = {
    afterEach: (guard) => {
      afterGuards.push(guard);
      return offAfter;
    },
    beforeEach: (guard) => {
      beforeGuards.push(guard);
      return offBefore;
    },
  };
  const navigateIntent: Guard = (to, from) => {
    for (const g of beforeGuards) g(to, from);
  };
  const navigateAfter: Guard = (to, from) => {
    for (const g of afterGuards) g(to, from);
  };
  return { router, navigateIntent, navigateAfter, offAfter, offBefore };
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

  describe('includeIntent (0.3)', () => {
    it('emits intent + completed breadcrumbs across a navigation when enabled', () => {
      const sdk = makeFakeSdk();
      const { router, navigateIntent, navigateAfter } = makeFakeRouterWithIntent();
      installRouterInstrumentation(router, { sdk, includeIntent: true });

      navigateIntent(route('/dashboard'), route('/'));
      navigateAfter(route('/dashboard'), route('/'));

      const calls = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]).toMatchObject({
        category: 'navigation',
        message: '/ → /dashboard (intent)',
        data: { from: '/', to: '/dashboard', phase: 'intent' },
      });
      expect(calls[1]?.[0]).toMatchObject({
        category: 'navigation',
        message: '/ → /dashboard',
        data: { from: '/', to: '/dashboard', phase: 'completed' },
      });
    });

    it('intent breadcrumb still fires when the after-each guard never runs (cancelled navigation)', () => {
      // Simulates the failure mode the flag exists for: an error fires
      // mid-navigation so `afterEach` is skipped — only the intent
      // breadcrumb makes it into the trail.
      const sdk = makeFakeSdk();
      const { router, navigateIntent } = makeFakeRouterWithIntent();
      installRouterInstrumentation(router, { sdk, includeIntent: true });

      navigateIntent(route('/profile/42', 'profile'), route('/'));

      const calls = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toMatchObject({
        message: '/ → /profile/42 (intent)',
        data: { phase: 'intent', name: 'profile' },
      });
    });

    it('does not subscribe to beforeEach when includeIntent is false (default)', () => {
      const sdk = makeFakeSdk();
      const { router, navigateIntent, navigateAfter } = makeFakeRouterWithIntent();
      installRouterInstrumentation(router, { sdk });

      navigateIntent(route('/a'), route('/b'));
      navigateAfter(route('/a'), route('/b'));

      const calls = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).not.toHaveProperty('data.phase');
    });

    it('returns a combined unsubscribe that calls both before+after handles', () => {
      const sdk = makeFakeSdk();
      const { router, offAfter, offBefore } = makeFakeRouterWithIntent();
      const unsub = installRouterInstrumentation(router, { sdk, includeIntent: true });
      unsub();
      expect(offAfter).toHaveBeenCalledTimes(1);
      expect(offBefore).toHaveBeenCalledTimes(1);
    });

    it('falls back to afterEach-only when the router lacks beforeEach', () => {
      // Older RouterLike doubles that only implement `afterEach` must
      // keep working — the intent channel silently no-ops.
      const sdk = makeFakeSdk();
      const { router, navigate } = makeFakeRouter();
      const unsub = installRouterInstrumentation(router, { sdk, includeIntent: true });

      expect(() => navigate(route('/a'), route('/b'))).not.toThrow();
      expect((sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
        data: { phase: 'completed' },
      });
      expect(() => unsub()).not.toThrow();
    });

    it('swallows beforeEach addBreadcrumb errors', () => {
      const sdk = {
        addBreadcrumb: vi.fn(() => {
          throw new Error('boom');
        }),
      } as unknown as Browsonic;
      const { router, navigateIntent } = makeFakeRouterWithIntent();
      installRouterInstrumentation(router, { sdk, includeIntent: true });

      expect(() => navigateIntent(route('/a'), route('/b'))).not.toThrow();
      expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    });
  });
});
