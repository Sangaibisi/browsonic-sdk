// SPDX-License-Identifier: Apache-2.0

/**
 * instrumentNavigation + trackNavigation regression suite. The engine
 * monkey-patches history.pushState/replaceState to detect programmatic
 * SPA navigation, and listens to popstate for back/forward buttons.
 * Tests verify the breadcrumb emit + ref-counted teardown.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { instrumentNavigation, trackNavigation } from './navigation';

function makeFakeSdk(): Browsonic {
  return {
    addBreadcrumb: vi.fn(),
  } as unknown as Browsonic;
}

afterEach(() => {
  // Belt-and-braces: any test that leaves history patched (e.g. a
  // failed assertion before the unsubscribe ran) gets reset by the
  // next test's setup.
  if (typeof window !== 'undefined') {
    const h = window.history as unknown as {
      __browsonicPatched?: boolean;
      __browsonicRefcount?: number;
    };
    h.__browsonicPatched = false;
    h.__browsonicRefcount = 0;
  }
});

describe('instrumentNavigation', () => {
  beforeEach(() => {
    // Reset URL to a known starting point.
    window.history.replaceState({}, '', '/start');
  });

  it('emits a navigation breadcrumb on history.pushState', () => {
    const sdk = makeFakeSdk();
    const off = instrumentNavigation({ sdk });

    window.history.pushState({}, '', '/dashboard');

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    const arg = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      category: string;
      message: string;
      data: Record<string, unknown>;
    };
    expect(arg.category).toBe('navigation');
    expect(arg.message).toBe('/start → /dashboard');
    expect(arg.data.from).toContain('/start');
    expect(arg.data.to).toContain('/dashboard');

    off();
  });

  it('emits on history.replaceState too', () => {
    const sdk = makeFakeSdk();
    const off = instrumentNavigation({ sdk });

    window.history.replaceState({}, '', '/replaced');

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    off();
  });

  it('emits on popstate (back / forward buttons)', () => {
    const sdk = makeFakeSdk();
    const off = instrumentNavigation({ sdk });

    // Simulate back-button: change URL via the original API path then
    // dispatch popstate by hand (jsdom doesn't fire it on history mutation).
    window.history.replaceState({}, '', '/two');
    (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mockClear();

    window.history.pushState({}, '', '/three');
    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mockClear();

    // Manually fire popstate after rewriting the URL — simulates the
    // browser's behaviour when the user clicks "back".
    window.history.replaceState({}, '', '/two');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    off();
  });

  it('does not emit when URL is unchanged', () => {
    const sdk = makeFakeSdk();
    const off = instrumentNavigation({ sdk });

    window.history.pushState({}, '', '/start'); // same URL as before
    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();
    off();
  });

  it('respects custom category', () => {
    const sdk = makeFakeSdk();
    const off = instrumentNavigation({ sdk, category: 'spa.nav' });

    window.history.pushState({}, '', '/x');
    expect((sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      category: 'spa.nav',
    });
    off();
  });

  it('returned unsubscribe stops further breadcrumbs', () => {
    const sdk = makeFakeSdk();
    const off = instrumentNavigation({ sdk });

    window.history.pushState({}, '', '/a');
    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);

    off();

    window.history.pushState({}, '', '/b');
    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1); // still 1
  });

  it('multiple instrument calls share one history patch (ref-counted)', () => {
    const sdk1 = makeFakeSdk();
    const sdk2 = makeFakeSdk();
    const off1 = instrumentNavigation({ sdk: sdk1 });
    const off2 = instrumentNavigation({ sdk: sdk2 });

    window.history.pushState({}, '', '/shared');

    expect(sdk1.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(sdk2.addBreadcrumb).toHaveBeenCalledTimes(1);

    off1();
    window.history.pushState({}, '', '/after-off1');
    // off1 was disabled, sdk2 still active.
    expect(sdk1.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(sdk2.addBreadcrumb).toHaveBeenCalledTimes(2);

    off2();
    // After both unsubscribed, history is restored — pushState no
    // longer dispatches the synthetic event.
    window.history.pushState({}, '', '/after-off2');
    expect(sdk2.addBreadcrumb).toHaveBeenCalledTimes(2);
  });

  it('swallows breadcrumb errors so navigation never throws', () => {
    const sdk = {
      addBreadcrumb: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as Browsonic;
    const off = instrumentNavigation({ sdk });

    expect(() => window.history.pushState({}, '', '/will-throw')).not.toThrow();
    off();
  });
});

describe('trackNavigation (Svelte action)', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/start');
  });

  it('emits breadcrumbs while mounted, stops after destroy()', () => {
    const sdk = makeFakeSdk();
    const node = document.createElement('div');
    const action = trackNavigation(node, { sdk });

    window.history.pushState({}, '', '/page-1');
    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);

    action.destroy();

    window.history.pushState({}, '', '/page-2');
    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1); // no further emit
  });

  it('update() re-arms with new params', () => {
    const sdk = makeFakeSdk();
    const node = document.createElement('div');
    const action = trackNavigation(node, { sdk });

    action.update({ sdk, category: 'updated' });
    window.history.pushState({}, '', '/after-update');

    expect((sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toMatchObject({
      category: 'updated',
    });
    action.destroy();
  });
});
