// SPDX-License-Identifier: Apache-2.0

/**
 * `installPiniaIntegration` tests. We pass a hand-rolled `PiniaLike`
 * + `PiniaStoreLike` so the suite doesn't take a `pinia` dependency.
 * The `pinia.use(plugin)` + `store.$onAction(callback)` shape is the
 * only contract the integration cares about, and the same shape is
 * what Pinia 2.x ships in production.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import {
  installPiniaIntegration,
  type PiniaLike,
  type PiniaStoreLike,
  type PiniaActionContextLike,
} from './pinia';

type ActionListener = (context: PiniaActionContextLike) => void;

function makeFakeSdk(): Browsonic {
  return {
    setContext: vi.fn(),
    captureError: vi.fn(),
    addBreadcrumb: vi.fn(),
  } as unknown as Browsonic;
}

interface FakeStoreApi {
  store: PiniaStoreLike;
  /** Simulate the store dispatching an action that throws. */
  dispatchError: (actionName: string, args: unknown[], error: unknown) => void;
}

function makeFakeStore($id: string, $state: unknown = {}): FakeStoreApi {
  const listeners: ActionListener[] = [];
  const store: PiniaStoreLike = {
    $id,
    $state,
    $onAction: (callback) => {
      listeners.push(callback);
      return () => {
        const idx = listeners.indexOf(callback);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
  };

  const dispatchError: FakeStoreApi['dispatchError'] = (actionName, args, error) => {
    for (const listener of listeners) {
      const errorHandlers: ((e: unknown) => void)[] = [];
      listener({
        name: actionName,
        store,
        args,
        after: () => {},
        onError: (cb) => {
          errorHandlers.push(cb);
        },
      });
      for (const cb of errorHandlers) cb(error);
    }
  };

  return { store, dispatchError };
}

interface FakePiniaApi {
  pinia: PiniaLike;
  /** Simulate Pinia registering a store after `app.use(pinia)`. */
  register: (api: FakeStoreApi) => void;
}

function makeFakePinia(): FakePiniaApi {
  const plugins: ((context: { store: PiniaStoreLike }) => void)[] = [];
  const stores: FakeStoreApi[] = [];

  const pinia: PiniaLike = {
    use: (plugin) => {
      plugins.push(plugin);
      // Pinia 2.x calls newly-registered plugins for any pre-existing
      // store. We mirror that so tests can register a plugin first
      // then add stores in either order.
      for (const s of stores) plugin({ store: s.store });
      return pinia;
    },
  };

  const register: FakePiniaApi['register'] = (api) => {
    stores.push(api);
    for (const plugin of plugins) plugin({ store: api.store });
  };

  return { pinia, register };
}

describe('installPiniaIntegration', () => {
  beforeEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it('sets a `pinia` context bucket on action errors', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk });

    const cart = makeFakeStore('cart', { items: [{ sku: 'A1' }] });
    register(cart);

    const err = new Error('checkout failed');
    cart.dispatchError('checkout', [{ couponCode: 'WELCOME' }], err);

    expect(sdk.setContext).toHaveBeenCalledTimes(1);
    const [bucket, ctx] = (sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(bucket).toBe('pinia');
    expect(ctx).toMatchObject({
      storeId: 'cart',
      action: 'checkout',
      errorMessage: 'checkout failed',
    });
    expect(typeof (ctx as { args: unknown }).args).toBe('string');
    expect((ctx as { args: string }).args).toContain('WELCOME');
  });

  it('does not include state by default', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk });

    const auth = makeFakeStore('auth', { token: 'super-secret' });
    register(auth);
    auth.dispatchError('login', [], new Error('bad creds'));

    const ctx = (sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(ctx.state).toBeUndefined();
  });

  it('captures state when captureState: true', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk, captureState: true });

    const cart = makeFakeStore('cart', { items: [{ sku: 'A1', qty: 2 }] });
    register(cart);
    cart.dispatchError('checkout', [], new Error('stripe declined'));

    const ctx = (sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(typeof ctx.state).toBe('string');
    expect(ctx.state as string).toContain('A1');
  });

  it('skips stores listed in ignoreStores', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk, ignoreStores: ['auth'] });

    const auth = makeFakeStore('auth');
    const cart = makeFakeStore('cart');
    register(auth);
    register(cart);

    auth.dispatchError('login', [], new Error('boom'));
    cart.dispatchError('checkout', [], new Error('boom'));

    expect(sdk.setContext).toHaveBeenCalledTimes(1);
    expect((sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]).toMatchObject({
      storeId: 'cart',
    });
  });

  it('uses a custom contextName when provided', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk, contextName: 'pinia.checkout' });

    const cart = makeFakeStore('cart');
    register(cart);
    cart.dispatchError('checkout', [], new Error('boom'));

    expect((sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toBe('pinia.checkout');
  });

  it('truncates serialised args to maxLength', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk, maxLength: 32 });

    const big = 'x'.repeat(1000);
    const cart = makeFakeStore('cart');
    register(cart);
    cart.dispatchError('save', [{ payload: big }], new Error('boom'));

    const ctx = (sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      args: string;
    };
    expect(ctx.args.length).toBeLessThanOrEqual(33); // 32 + ellipsis
    expect(ctx.args.endsWith('…')).toBe(true);
  });

  it('handles non-Error throws by stringifying', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk });

    const cart = makeFakeStore('cart');
    register(cart);
    cart.dispatchError('save', [], 'plain string failure');

    const ctx = (sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      errorMessage: string;
    };
    expect(ctx.errorMessage).toBe('plain string failure');
  });

  it('survives circular references in args / state', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk, captureState: true });

    const circular: { self?: unknown } = {};
    circular.self = circular;

    const cart = makeFakeStore('cart', circular);
    register(cart);
    cart.dispatchError('save', [circular], new Error('boom'));

    const ctx = (sdk.setContext as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as {
      args: string;
      state: string;
    };
    expect(ctx.args).toContain('[circular]');
    expect(ctx.state).toContain('[circular]');
  });

  it('falls back to window.Browsonic when sdk is not provided', () => {
    const sdk = makeFakeSdk();
    (globalThis as { window?: unknown }).window = {
      Browsonic: { getBrowsonic: () => sdk },
    };
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia);

    const cart = makeFakeStore('cart');
    register(cart);
    cart.dispatchError('save', [], new Error('boom'));

    expect(sdk.setContext).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when no SDK is reachable', () => {
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia);

    const cart = makeFakeStore('cart');
    register(cart);

    expect(() => cart.dispatchError('save', [], new Error('boom'))).not.toThrow();
  });

  it('swallows setContext errors so the action error keeps bubbling', () => {
    const sdk = {
      setContext: vi.fn(() => {
        throw new Error('scope full');
      }),
    } as unknown as Browsonic;
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk });

    const cart = makeFakeStore('cart');
    register(cart);

    expect(() => cart.dispatchError('save', [], new Error('boom'))).not.toThrow();
    expect(sdk.setContext).toHaveBeenCalledTimes(1);
  });

  it('wires stores registered after the plugin is installed', () => {
    const sdk = makeFakeSdk();
    const { pinia, register } = makeFakePinia();
    installPiniaIntegration(pinia, { sdk });

    // Registration order is plugin-first, store-after — Pinia's
    // common bootstrap shape (`installPiniaIntegration` runs before
    // any `useXStore()` call resolves a store).
    const cart = makeFakeStore('cart');
    register(cart);

    cart.dispatchError('save', [], new Error('boom'));
    expect(sdk.setContext).toHaveBeenCalledTimes(1);
  });
});
