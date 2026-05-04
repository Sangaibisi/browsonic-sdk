// SPDX-License-Identifier: Apache-2.0

/**
 * subscribeUser regression suite. Mirrors a Svelte-style readable
 * store onto the SDK user context. Tests cover happy path, store
 * value changes, defensive isolation, and tolerance for malformed
 * inputs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic, UserContext } from '@browsonic/sdk';
import { subscribeUser, type ReadableLike } from './user-store';

function makeFakeSdk(): Browsonic {
  return {
    setUser: vi.fn(),
    clearUser: vi.fn(),
  } as unknown as Browsonic;
}

/** Tiny synchronous store stand-in. */
function fakeStore<T>(initial: T): ReadableLike<T> & { set(v: T): void } {
  let value = initial;
  let listener: ((v: T) => void) | null = null;
  return {
    subscribe(run) {
      listener = run;
      run(value);
      return () => {
        listener = null;
      };
    },
    set(next) {
      value = next;
      listener?.(value);
    },
  };
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('subscribeUser', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('calls setUser with the initial store value', () => {
    const store = fakeStore<UserContext | null>({ id: 'u1' } as UserContext);
    subscribeUser(store, { sdk });
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('calls clearUser when the store starts at null', () => {
    const store = fakeStore<UserContext | null>(null);
    subscribeUser(store, { sdk });
    expect(sdk.clearUser).toHaveBeenCalled();
  });

  it('reapplies setUser when the store value changes', () => {
    const store = fakeStore<UserContext | null>({ id: 'u1' } as UserContext);
    subscribeUser(store, { sdk });
    store.set({ id: 'u2' } as UserContext);
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u2' });
  });

  it('returns the unsubscribe function', () => {
    const store = fakeStore<UserContext | null>(null);
    const off = subscribeUser(store, { sdk });
    expect(typeof off).toBe('function');
    off();
    store.set({ id: 'u1' } as UserContext);
    // After unsubscribe, no further setUser calls beyond the initial.
    expect(sdk.setUser).not.toHaveBeenCalled();
  });

  it('falls back to window.Browsonic.getBrowsonic when no sdk option is passed', () => {
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const store = fakeStore<UserContext | null>({ id: 'u1' } as UserContext);
    subscribeUser(store);
    expect(sdk.setUser).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('is a no-op when the SDK is unreachable', () => {
    const store = fakeStore<UserContext | null>({ id: 'u1' } as UserContext);
    expect(() => subscribeUser(store)).not.toThrow();
  });

  it('isolates a thrown setUser so the store keeps emitting', () => {
    (sdk.setUser as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });
    const store = fakeStore<UserContext | null>({ id: 'u1' } as UserContext);
    expect(() => subscribeUser(store, { sdk })).not.toThrow();
  });

  it('returns a no-op unsubscribe when the input is not a store', () => {
    const off = subscribeUser({} as unknown as ReadableLike<UserContext | null>, { sdk });
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
    expect(sdk.setUser).not.toHaveBeenCalled();
  });
});
