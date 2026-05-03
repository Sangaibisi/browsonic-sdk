// SPDX-License-Identifier: Apache-2.0

/**
 * Hook regression suite — useBrowsonic / useUser / useCaptureError.
 *
 * Tests deliberately avoid `renderHook` from @testing-library/react;
 * the `renderHook` API has shifted across RTL major versions and
 * tying tests to it makes upgrades painful. We use a thin
 * `renderHookValue` helper built on `render` instead.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { useBrowsonic, useUser, useCaptureError } from './hooks';
import type { Browsonic } from '@browsonic/sdk';

afterEach(() => {
  cleanup();
  // Clear the global the resolveSdk helper reads from between tests.
  delete (window as { Browsonic?: unknown }).Browsonic;
});

interface FakeSdk {
  captureError: ReturnType<typeof vi.fn>;
  setUser: ReturnType<typeof vi.fn>;
  clearUser: ReturnType<typeof vi.fn>;
}

function installFakeSdk(): FakeSdk {
  const fake: FakeSdk = {
    captureError: vi.fn(),
    setUser: vi.fn(),
    clearUser: vi.fn(),
  };
  (window as { Browsonic?: unknown }).Browsonic = {
    getBrowsonic: () => fake as unknown as Browsonic,
  };
  return fake;
}

/**
 * Render a hook by mounting a thin component that captures the
 * latest hook value into an outer ref. Returns a getter for the
 * latest value plus the render result for unmount/cleanup.
 */
function renderHookValue<T>(useHook: () => T): {
  current: () => T;
  rerender: () => void;
  unmount: () => void;
} {
  let captured!: T;
  function Probe(): null {
    captured = useHook();
    return null;
  }
  const r = render(<Probe />);
  return {
    current: () => captured,
    rerender: () => r.rerender(<Probe />),
    unmount: () => r.unmount(),
  };
}

describe('useBrowsonic', () => {
  it('returns null when no SDK is reachable', () => {
    const h = renderHookValue(useBrowsonic);
    expect(h.current()).toBeNull();
    h.unmount();
  });

  it('resolves the window-attached SDK singleton at mount', () => {
    const fake = installFakeSdk();
    const h = renderHookValue(useBrowsonic);
    expect(h.current()).toBe(fake);
    h.unmount();
  });

  it('returns a stable reference across renders', () => {
    installFakeSdk();
    const h = renderHookValue(useBrowsonic);
    const first = h.current();
    h.rerender();
    expect(h.current()).toBe(first);
    h.unmount();
  });
});

describe('useUser', () => {
  let sdk: FakeSdk;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('calls setUser with the supplied user on mount', () => {
    const user = { id: 'u1', email: 'a@b.com' };
    const h = renderHookValue(() => useUser(user));
    expect(sdk.setUser).toHaveBeenCalledWith(user);
    h.unmount();
  });

  it('calls clearUser when user is null', () => {
    const h = renderHookValue(() => useUser(null));
    expect(sdk.clearUser).toHaveBeenCalledOnce();
    expect(sdk.setUser).not.toHaveBeenCalled();
    h.unmount();
  });

  it('does not retrigger when a new-reference but value-equal user object is passed', () => {
    function Wrapper({ data }: { data: { id: string } }) {
      useUser(data);
      return null;
    }
    const r = render(<Wrapper data={{ id: 'u1' }} />);
    expect(sdk.setUser).toHaveBeenCalledTimes(1);
    // New object reference, same shape — must NOT cause a second
    // setUser call.
    r.rerender(<Wrapper data={{ id: 'u1' }} />);
    expect(sdk.setUser).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it('retriggers when user fields actually change', () => {
    function Wrapper({ data }: { data: { id: string } }) {
      useUser(data);
      return null;
    }
    const r = render(<Wrapper data={{ id: 'u1' }} />);
    r.rerender(<Wrapper data={{ id: 'u2' }} />);
    expect(sdk.setUser).toHaveBeenCalledTimes(2);
    expect(sdk.setUser.mock.calls[1]?.[0]).toEqual({ id: 'u2' });
    r.unmount();
  });

  it('survives an SDK that throws inside setUser', () => {
    sdk.setUser.mockImplementation(() => {
      throw new Error('setUser failed');
    });
    expect(() => {
      const h = renderHookValue(() => useUser({ id: 'u1' }));
      h.unmount();
    }).not.toThrow();
  });

  it('is a no-op when no SDK is reachable', () => {
    delete (window as { Browsonic?: unknown }).Browsonic;
    expect(() => {
      const h = renderHookValue(() => useUser({ id: 'u1' }));
      h.unmount();
    }).not.toThrow();
  });
});

describe('useCaptureError', () => {
  it('returns a stable callback across renders', () => {
    installFakeSdk();
    const h = renderHookValue(useCaptureError);
    const first = h.current();
    h.rerender();
    expect(h.current()).toBe(first);
    h.unmount();
  });

  it('forwards to sdk.captureError', () => {
    const sdk = installFakeSdk();
    function Probe() {
      const captureError = useCaptureError();
      return (
        <button
          onClick={() => {
            captureError(new Error('clicked-error'));
          }}
        >
          click
        </button>
      );
    }
    const r = render(<Probe />);
    fireEvent.click(r.getByText('click'));
    expect(sdk.captureError).toHaveBeenCalledOnce();
    const reported = sdk.captureError.mock.calls[0]?.[0] as Error;
    expect(reported.message).toBe('clicked-error');
    r.unmount();
  });

  it('is a no-op when SDK is unreachable', () => {
    const h = renderHookValue(useCaptureError);
    expect(() => h.current()(new Error('lost'))).not.toThrow();
    h.unmount();
  });

  it('survives an SDK that throws inside captureError', () => {
    const sdk = installFakeSdk();
    sdk.captureError.mockImplementation(() => {
      throw new Error('capture failed');
    });
    const h = renderHookValue(useCaptureError);
    expect(() => h.current()(new Error('original'))).not.toThrow();
    h.unmount();
  });
});
