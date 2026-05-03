// SPDX-License-Identifier: Apache-2.0

/**
 * withBrowsonic HOC regression suite. Class-component injection
 * regression coverage — the legacy code path that hooks cannot reach.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, type ReactNode } from 'react';
import { render, cleanup } from '@testing-library/react';
import type { Browsonic } from '@browsonic/sdk';
import { withBrowsonic, type WithBrowsonicInjectedProps } from './hoc';

afterEach(() => {
  cleanup();
  delete (window as { Browsonic?: unknown }).Browsonic;
});

function installFakeSdk(): Browsonic {
  const fake = {
    captureError: vi.fn(),
    captureMessage: vi.fn(),
    setUser: vi.fn(),
    clearUser: vi.fn(),
  } as unknown as Browsonic;
  (window as { Browsonic?: unknown }).Browsonic = {
    getBrowsonic: () => fake,
  };
  return fake;
}

interface DashboardProps extends WithBrowsonicInjectedProps {
  title: string;
}

class Dashboard extends Component<DashboardProps> {
  componentDidMount(): void {
    this.props.sdk?.captureMessage(`mounted: ${this.props.title}`);
  }
  render(): ReactNode {
    return <h1>{this.props.title}</h1>;
  }
}

describe('withBrowsonic', () => {
  it('renders the wrapped component with caller-supplied props', () => {
    installFakeSdk();
    const Wrapped = withBrowsonic(Dashboard);
    const r = render(<Wrapped title="Hello" />);
    expect(r.getByText('Hello')).toBeTruthy();
  });

  it('injects the SDK as a `sdk` prop', () => {
    const fake = installFakeSdk();
    const Wrapped = withBrowsonic(Dashboard);
    render(<Wrapped title="Mount log" />);
    expect(
      (fake as unknown as { captureMessage: ReturnType<typeof vi.fn> }).captureMessage,
    ).toHaveBeenCalledWith('mounted: Mount log');
  });

  it('injects null when SDK is unreachable', () => {
    // Sentinel: class component reads `this.props.sdk` and stores it
    // for the test to inspect.
    let received: Browsonic | null | undefined;
    class Probe extends Component<WithBrowsonicInjectedProps> {
      componentDidMount(): void {
        received = this.props.sdk;
      }
      render(): ReactNode {
        return null;
      }
    }
    const Wrapped = withBrowsonic(Probe);
    render(<Wrapped />);
    expect(received).toBeNull();
  });

  it('sets a useful displayName for React DevTools', () => {
    const Wrapped = withBrowsonic(Dashboard);
    expect(Wrapped.displayName).toBe('withBrowsonic(Dashboard)');
  });

  it('respects an explicit displayName on the inner component', () => {
    class Anon extends Component<WithBrowsonicInjectedProps> {
      static displayName = 'CustomLabel';
      render(): ReactNode {
        return null;
      }
    }
    const Wrapped = withBrowsonic(Anon);
    expect(Wrapped.displayName).toBe('withBrowsonic(CustomLabel)');
  });
});
