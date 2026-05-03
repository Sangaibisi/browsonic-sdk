// SPDX-License-Identifier: Apache-2.0

/**
 * useBrowsonic / useUser / useCaptureError regression suite. We mount
 * a tiny Vue component and run the composable inside its setup scope —
 * the only environment where `inject` resolves and `watch` registers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { render, cleanup } from '@testing-library/vue';
import type { Browsonic, UserContext } from '@browsonic/sdk';
import { useBrowsonic, useUser, useCaptureError } from './composables';
import { browsonicInjectionKey } from './inject-key';

function makeFakeSdk(): Browsonic {
  return {
    setUser: vi.fn(),
    clearUser: vi.fn(),
    captureError: vi.fn(),
  } as unknown as Browsonic;
}

function harness(setupFn: () => unknown) {
  return defineComponent({
    setup() {
      setupFn();
      return () => h('div');
    },
  });
}

afterEach(() => {
  cleanup();
  // Restore the happy-dom window without nuking the global itself —
  // happy-dom installs a single window per test file load, so deleting
  // it here would break subsequent tests in the same file.
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('useBrowsonic', () => {
  it('returns the plugin-provided SDK via inject', () => {
    const fakeSdk = makeFakeSdk();
    let captured: Browsonic | null = null;
    const Comp = harness(() => {
      captured = useBrowsonic();
    });
    render(Comp, { global: { provide: { [browsonicInjectionKey as symbol]: fakeSdk } } });
    expect(captured).toBe(fakeSdk);
  });

  it('falls back to the global window singleton when nothing is provided', () => {
    const fakeSdk = makeFakeSdk();
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => fakeSdk,
    };
    let captured: Browsonic | null = null;
    const Comp = harness(() => {
      captured = useBrowsonic();
    });
    render(Comp);
    expect(captured).toBe(fakeSdk);
  });

  it('returns null when neither inject nor window resolves', () => {
    let captured: Browsonic | null = makeFakeSdk();
    const Comp = harness(() => {
      captured = useBrowsonic();
    });
    render(Comp);
    expect(captured).toBeNull();
  });
});

describe('useUser', () => {
  let fakeSdk: Browsonic;

  beforeEach(() => {
    fakeSdk = makeFakeSdk();
  });

  it('calls setUser when given a plain user value', () => {
    const Comp = harness(() => {
      useUser({ id: 'u1' } as UserContext);
    });
    render(Comp, { global: { provide: { [browsonicInjectionKey as symbol]: fakeSdk } } });
    expect(fakeSdk.setUser).toHaveBeenCalledWith({ id: 'u1' });
  });

  it('calls clearUser when given null', () => {
    const Comp = harness(() => {
      useUser(null);
    });
    render(Comp, { global: { provide: { [browsonicInjectionKey as symbol]: fakeSdk } } });
    expect(fakeSdk.clearUser).toHaveBeenCalled();
  });

  it('reapplies setUser when a Ref<UserContext> changes', async () => {
    const userRef = ref<UserContext | null>({ id: 'u1' } as UserContext);
    const Comp = harness(() => {
      useUser(userRef);
    });
    render(Comp, { global: { provide: { [browsonicInjectionKey as symbol]: fakeSdk } } });
    expect(fakeSdk.setUser).toHaveBeenCalledWith({ id: 'u1' });

    userRef.value = { id: 'u2' } as UserContext;
    await new Promise((r) => setTimeout(r, 0));
    expect(fakeSdk.setUser).toHaveBeenCalledWith({ id: 'u2' });
  });

  it('does not throw when SDK is null', () => {
    expect(() => {
      const Comp = harness(() => {
        useUser({ id: 'u1' } as UserContext);
      });
      render(Comp);
    }).not.toThrow();
  });

  it('swallows errors thrown by setUser (defensive isolation)', () => {
    (fakeSdk.setUser as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => {
      const Comp = harness(() => {
        useUser({ id: 'u1' } as UserContext);
      });
      render(Comp, { global: { provide: { [browsonicInjectionKey as symbol]: fakeSdk } } });
    }).not.toThrow();
  });
});

describe('useCaptureError', () => {
  it('forwards to sdk.captureError', () => {
    const fakeSdk = makeFakeSdk();
    let capture: ((error: Error) => void) | null = null;
    const Comp = harness(() => {
      capture = useCaptureError();
    });
    render(Comp, { global: { provide: { [browsonicInjectionKey as symbol]: fakeSdk } } });
    capture!(new Error('x'));
    expect(fakeSdk.captureError).toHaveBeenCalled();
  });

  it('is a no-op when the SDK is unreachable', () => {
    let capture: ((error: Error) => void) | null = null;
    const Comp = harness(() => {
      capture = useCaptureError();
    });
    render(Comp);
    expect(() => capture!(new Error('x'))).not.toThrow();
  });

  it('swallows errors thrown by captureError', () => {
    const fakeSdk = makeFakeSdk();
    (fakeSdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter exploded');
    });
    let capture: ((error: Error) => void) | null = null;
    const Comp = harness(() => {
      capture = useCaptureError();
    });
    render(Comp, { global: { provide: { [browsonicInjectionKey as symbol]: fakeSdk } } });
    expect(() => capture!(new Error('x'))).not.toThrow();
  });
});
