// SPDX-License-Identifier: Apache-2.0

/**
 * `useRemixNavigationBreadcrumbs` regression suite. We don't import
 * from `@remix-run/react` — the hook takes plain values, so the tests
 * mount a tiny harness component that re-renders with successive
 * `(navigation, matches)` props to simulate a navigation transition.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { Browsonic } from '@browsonic/sdk';
import {
  useRemixNavigationBreadcrumbs,
  type NavigationLike,
  type MatchLike,
  type UseRemixNavigationBreadcrumbsOptions,
} from './use-navigation-breadcrumbs';

function installFakeSdk(): Browsonic {
  const sdk = {
    addBreadcrumb: vi.fn(),
  } as unknown as Browsonic;
  (window as typeof window & { Browsonic?: unknown }).Browsonic = {
    getBrowsonic: () => sdk,
  };
  return sdk;
}

interface HarnessProps {
  navigation: NavigationLike;
  matches: MatchLike[];
  options?: UseRemixNavigationBreadcrumbsOptions;
}

function Harness({ navigation, matches, options }: HarnessProps): null {
  useRemixNavigationBreadcrumbs(navigation, matches, options);
  return null;
}

const idle: NavigationLike = { state: 'idle', location: null };
const loading = (pathname: string): NavigationLike => ({
  state: 'loading',
  location: { pathname },
});

const match = (id: string, pathname: string): MatchLike => ({ id, pathname });

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('useRemixNavigationBreadcrumbs', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
    // Anchor the test browser to a known initial path so the
    // window.location read inside the hook is deterministic.
    window.history.replaceState({}, '', '/');
  });

  it('emits a breadcrumb when navigation transitions from loading → idle (skipInitial: false)', () => {
    const initialMatches = [match('routes/_app', '/')];
    const dashboardMatches = [
      match('routes/_app', '/'),
      match('routes/_app.dashboard', '/dashboard'),
    ];

    const { rerender } = render(
      <Harness navigation={idle} matches={initialMatches} options={{ skipInitial: false }} />,
    );

    // Begin navigation to /dashboard.
    window.history.replaceState({}, '', '/');
    rerender(
      <Harness
        navigation={loading('/dashboard')}
        matches={initialMatches}
        options={{ skipInitial: false }}
      />,
    );

    // Land on /dashboard, idle.
    window.history.replaceState({}, '', '/dashboard');
    rerender(
      <Harness navigation={idle} matches={dashboardMatches} options={{ skipInitial: false }} />,
    );

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
    const call = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      category: string;
      message: string;
      data: Record<string, unknown>;
    };
    expect(call.category).toBe('navigation');
    expect(call.message).toBe('/dashboard → /dashboard');
    expect(call.data.routeId).toBe('routes/_app.dashboard');
    expect(call.data.routeChain).toBe('routes/_app › routes/_app.dashboard');
  });

  it('skips the very first observed transition by default', () => {
    const m = [match('routes/_app', '/')];
    const { rerender } = render(<Harness navigation={idle} matches={m} />);

    window.history.replaceState({}, '', '/');
    rerender(<Harness navigation={loading('/dashboard')} matches={m} />);
    window.history.replaceState({}, '', '/dashboard');
    rerender(<Harness navigation={idle} matches={m} />);

    // First completed transition is the "initial-mount → first
    // landing" pattern — most apps already log a session-start
    // breadcrumb so we suppress this one by default.
    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();

    // A second transition fires.
    window.history.replaceState({}, '', '/dashboard');
    rerender(<Harness navigation={loading('/users')} matches={m} />);
    window.history.replaceState({}, '', '/users');
    rerender(<Harness navigation={idle} matches={m} />);

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
  });

  it('does not fire on idle re-renders (data revalidation, fetcher submits)', () => {
    const m = [match('routes/_app', '/')];
    const { rerender } = render(
      <Harness navigation={idle} matches={m} options={{ skipInitial: false }} />,
    );

    // Re-render twice with idle — Remix re-emits idle on
    // revalidations and unrelated state shifts. The hook must not
    // mistake those for navigations.
    rerender(<Harness navigation={idle} matches={m} options={{ skipInitial: false }} />);
    rerender(<Harness navigation={idle} matches={m} options={{ skipInitial: false }} />);

    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('respects a custom category', () => {
    const m = [match('routes/_app', '/')];
    const { rerender } = render(
      <Harness
        navigation={idle}
        matches={m}
        options={{ skipInitial: false, category: 'remix.nav' }}
      />,
    );

    rerender(
      <Harness
        navigation={loading('/dashboard')}
        matches={m}
        options={{ skipInitial: false, category: 'remix.nav' }}
      />,
    );
    window.history.replaceState({}, '', '/dashboard');
    rerender(
      <Harness
        navigation={idle}
        matches={[match('routes/_app.dashboard', '/dashboard')]}
        options={{ skipInitial: false, category: 'remix.nav' }}
      />,
    );

    const call = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      category: string;
    };
    expect(call.category).toBe('remix.nav');
  });

  it('omits routeId / routeChain when matches is empty', () => {
    const { rerender } = render(
      <Harness navigation={idle} matches={[]} options={{ skipInitial: false }} />,
    );

    rerender(
      <Harness navigation={loading('/anywhere')} matches={[]} options={{ skipInitial: false }} />,
    );
    window.history.replaceState({}, '', '/anywhere');
    rerender(<Harness navigation={idle} matches={[]} options={{ skipInitial: false }} />);

    const call = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.routeId).toBeUndefined();
    expect(call.data.routeChain).toBeUndefined();
    expect(call.data.from).toBeDefined();
    expect(call.data.to).toBeDefined();
  });

  it('uses the leaf match as routeId and joins parents with ›', () => {
    const matches = [
      match('routes/_app', '/'),
      match('routes/_app.dashboard', '/dashboard'),
      match('routes/_app.dashboard.users', '/dashboard/users'),
      match('routes/_app.dashboard.users.$userId', '/dashboard/users/42'),
    ];
    const { rerender } = render(
      <Harness navigation={idle} matches={matches} options={{ skipInitial: false }} />,
    );

    rerender(
      <Harness
        navigation={loading('/dashboard/users/42')}
        matches={matches}
        options={{ skipInitial: false }}
      />,
    );
    window.history.replaceState({}, '', '/dashboard/users/42');
    rerender(<Harness navigation={idle} matches={matches} options={{ skipInitial: false }} />);

    const call = (sdk.addBreadcrumb as ReturnType<typeof vi.fn>).mock.calls[0]![0] as {
      data: { routeId: string; routeChain: string };
    };
    expect(call.data.routeId).toBe('routes/_app.dashboard.users.$userId');
    expect(call.data.routeChain).toBe(
      'routes/_app › routes/_app.dashboard › routes/_app.dashboard.users › routes/_app.dashboard.users.$userId',
    );
  });

  it('is a no-op when no SDK is reachable', () => {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    const m = [match('routes/_app', '/')];

    const { rerender } = render(
      <Harness navigation={idle} matches={m} options={{ skipInitial: false }} />,
    );
    rerender(
      <Harness navigation={loading('/dashboard')} matches={m} options={{ skipInitial: false }} />,
    );

    expect(() => {
      window.history.replaceState({}, '', '/dashboard');
      rerender(<Harness navigation={idle} matches={m} options={{ skipInitial: false }} />);
    }).not.toThrow();
  });

  it('uses the explicit `sdk` option over window.Browsonic when both are present', () => {
    const explicit = { addBreadcrumb: vi.fn() } as unknown as Browsonic;
    const m = [match('routes/_app', '/')];

    const { rerender } = render(
      <Harness navigation={idle} matches={m} options={{ skipInitial: false, sdk: explicit }} />,
    );
    rerender(
      <Harness
        navigation={loading('/x')}
        matches={m}
        options={{ skipInitial: false, sdk: explicit }}
      />,
    );
    window.history.replaceState({}, '', '/x');
    rerender(
      <Harness navigation={idle} matches={m} options={{ skipInitial: false, sdk: explicit }} />,
    );

    expect(explicit.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(sdk.addBreadcrumb).not.toHaveBeenCalled();
  });

  it('isolates a thrown addBreadcrumb so the host tree keeps rendering', () => {
    const throwingSdk = {
      addBreadcrumb: vi.fn(() => {
        throw new Error('reporter-exploded');
      }),
    } as unknown as Browsonic;
    const m = [match('routes/_app', '/')];

    const { rerender } = render(
      <Harness navigation={idle} matches={m} options={{ skipInitial: false, sdk: throwingSdk }} />,
    );
    rerender(
      <Harness
        navigation={loading('/x')}
        matches={m}
        options={{ skipInitial: false, sdk: throwingSdk }}
      />,
    );

    expect(() => {
      window.history.replaceState({}, '', '/x');
      rerender(
        <Harness
          navigation={idle}
          matches={m}
          options={{ skipInitial: false, sdk: throwingSdk }}
        />,
      );
    }).not.toThrow();
  });

  it('handles submitting → idle as a completed transition (form action navigation)', () => {
    const m = [match('routes/_app', '/')];
    const { rerender } = render(
      <Harness navigation={idle} matches={m} options={{ skipInitial: false }} />,
    );

    rerender(
      <Harness
        navigation={{ state: 'submitting', location: { pathname: '/login' } }}
        matches={m}
        options={{ skipInitial: false }}
      />,
    );
    window.history.replaceState({}, '', '/login');
    rerender(<Harness navigation={idle} matches={m} options={{ skipInitial: false }} />);

    expect(sdk.addBreadcrumb).toHaveBeenCalledTimes(1);
  });
});
