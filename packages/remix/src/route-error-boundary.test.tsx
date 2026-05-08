// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicRouteErrorBoundary regression suite. Verifies the
 * useEffect-on-mount capture path, the metadata tag, the no-SDK
 * fallback render, defensive isolation, and the imperative
 * captureRouteError companion.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import type { Browsonic } from '@browsonic/sdk';
import { BrowsonicRouteErrorBoundary, captureRouteError } from './route-error-boundary';

function installFakeSdk(): Browsonic {
  const sdk = {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setContext: vi.fn(),
  } as unknown as Browsonic;
  (window as typeof window & { Browsonic?: unknown }).Browsonic = {
    getBrowsonic: () => sdk,
  };
  return sdk;
}

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('BrowsonicRouteErrorBoundary', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('captures the error on mount', () => {
    const error = new Error('route-failed');
    render(<BrowsonicRouteErrorBoundary error={error} />);
    expect(sdk.captureError).toHaveBeenCalledWith(error);
  });

  it('tags the captured event with remixRouteError metadata', () => {
    render(<BrowsonicRouteErrorBoundary error={new Error('x')} />);
    expect(sdk.addMetadata).toHaveBeenCalledWith('remixRouteError', 'true');
    // Context bucket feeds the dashboard's RemixCard.
    expect(sdk.setContext).toHaveBeenCalledWith('remix', { handler: 'routeError' });
  });

  it('does NOT capture when error is undefined', () => {
    render(<BrowsonicRouteErrorBoundary />);
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('coerces non-Error values into Error before forwarding', () => {
    render(<BrowsonicRouteErrorBoundary error="string-as-error" />);
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
    expect(arg.message).toBe('string-as-error');
  });

  it('renders the default fallback message containing the error', () => {
    render(<BrowsonicRouteErrorBoundary error={new Error('boom')} />);
    expect(screen.getByText('boom')).toBeDefined();
  });

  it('renders custom children when provided instead of the default fallback', () => {
    render(
      <BrowsonicRouteErrorBoundary error={new Error('x')}>
        <div data-testid="custom">Custom</div>
      </BrowsonicRouteErrorBoundary>,
    );
    expect(screen.getByTestId('custom')).toBeDefined();
  });

  it('still renders fallback when SDK is unreachable', () => {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    render(<BrowsonicRouteErrorBoundary error={new Error('x')} />);
    expect(screen.getByText('x')).toBeDefined();
  });

  it('isolates a thrown captureError', () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    expect(() => render(<BrowsonicRouteErrorBoundary error={new Error('x')} />)).not.toThrow();
  });
});

describe('captureRouteError (imperative)', () => {
  it('forwards a thrown Error to sdk.captureError', () => {
    const sdk = installFakeSdk();
    const err = new Error('x');
    captureRouteError(err);
    expect(sdk.captureError).toHaveBeenCalledWith(err);
  });

  it('coerces non-Error into Error', () => {
    const sdk = installFakeSdk();
    captureRouteError('string-as-error');
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(arg).toBeInstanceOf(Error);
  });

  it('is a no-op when SDK is unreachable', () => {
    expect(() => captureRouteError(new Error('x'))).not.toThrow();
  });

  it('isolates a thrown captureError', () => {
    const sdk = installFakeSdk();
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    expect(() => captureRouteError(new Error('x'))).not.toThrow();
  });
});
