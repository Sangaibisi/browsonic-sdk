// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicErrorBoundary regression suite.
 *
 * Covers the four failure modes that previously slipped past manual
 * testing on similar boundary implementations: silent fallback when
 * SDK is missing, defensive isolation when SDK throws, component
 * stack truncation, and reset.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { Browsonic } from '@browsonic/sdk';
import { BrowsonicErrorBoundary } from './error-boundary';

afterEach(() => {
  cleanup();
});

function Crash({ message }: { message: string }): null {
  throw new Error(message);
}

/**
 * Build a minimal SDK stub with just the methods the boundary calls.
 * Cast through unknown to avoid pulling in the full Browsonic shape
 * for tests — we need `captureError`, `addMetadata`, and `setContext`.
 */
function fakeSdk(
  overrides?: Partial<Pick<Browsonic, 'captureError' | 'addMetadata' | 'setContext'>>,
): Browsonic {
  const stub = {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setContext: vi.fn(),
    ...overrides,
  };
  return stub as unknown as Browsonic;
}

describe('BrowsonicErrorBoundary', () => {
  it('renders children when nothing throws', () => {
    const { getByText } = render(
      <BrowsonicErrorBoundary fallback={<div>fallback</div>}>
        <span>hello world</span>
      </BrowsonicErrorBoundary>,
    );
    expect(getByText('hello world')).toBeTruthy();
  });

  it('renders static fallback when a child throws', () => {
    const { getByText } = render(
      <BrowsonicErrorBoundary fallback={<div>boom caught</div>}>
        <Crash message="explicit boom" />
      </BrowsonicErrorBoundary>,
    );
    expect(getByText('boom caught')).toBeTruthy();
  });

  it('renders function fallback with the captured error', () => {
    const { getByRole, getByText } = render(
      <BrowsonicErrorBoundary
        fallback={(error, reset) => (
          <div role="alert">
            <p>{error.message}</p>
            <button onClick={reset}>retry</button>
          </div>
        )}
      >
        <Crash message="hello error" />
      </BrowsonicErrorBoundary>,
    );
    expect(getByRole('alert')).toBeTruthy();
    expect(getByText('hello error')).toBeTruthy();
  });

  it('reset() clears the error and renders children again', () => {
    let crash = true;
    function Conditional(): ReactNode {
      if (crash) throw new Error('first crash');
      return <span>recovered</span>;
    }
    const { getByText } = render(
      <BrowsonicErrorBoundary
        fallback={(_, reset) => (
          <button
            onClick={() => {
              crash = false;
              reset();
            }}
          >
            retry
          </button>
        )}
      >
        <Conditional />
      </BrowsonicErrorBoundary>,
    );
    fireEvent.click(getByText('retry'));
    expect(getByText('recovered')).toBeTruthy();
  });

  it('reports the captured error to the supplied SDK', () => {
    const captureError = vi.fn();
    const addMetadata = vi.fn();
    const setContext = vi.fn();
    render(
      <BrowsonicErrorBoundary
        sdk={fakeSdk({ captureError, addMetadata, setContext })}
        fallback={<div>fb</div>}
      >
        <Crash message="reported" />
      </BrowsonicErrorBoundary>,
    );
    expect(captureError).toHaveBeenCalledOnce();
    const reported = captureError.mock.calls[0]?.[0] as Error;
    expect(reported.message).toBe('reported');
    // React context bucket feeds the dashboard's ReactCard with the
    // runtime version + component stack.
    expect(setContext).toHaveBeenCalledWith(
      'react',
      expect.objectContaining({
        version: expect.stringMatching(/^\d+\./),
        componentStack: expect.any(String),
      }),
    );
  });

  it('attaches truncated component stack as metadata', () => {
    const addMetadata = vi.fn();
    render(
      <BrowsonicErrorBoundary
        sdk={fakeSdk({ captureError: vi.fn(), addMetadata })}
        fallback={<div>fb</div>}
      >
        <Crash message="m" />
      </BrowsonicErrorBoundary>,
    );
    expect(addMetadata).toHaveBeenCalled();
    const [key, value] = addMetadata.mock.calls[0] ?? [];
    expect(key).toBe('componentStack');
    expect(typeof value).toBe('string');
    expect((value as string).length).toBeLessThanOrEqual(1024);
  });

  it('still renders fallback when the SDK throws inside captureError', () => {
    const sdk = fakeSdk({
      captureError: vi.fn(() => {
        throw new Error('sdk failure');
      }),
    });
    expect(() =>
      render(
        <BrowsonicErrorBoundary sdk={sdk} fallback={<div>survived</div>}>
          <Crash message="caught" />
        </BrowsonicErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it('still renders fallback when no SDK is reachable at all', () => {
    // No `sdk` prop, no `window.Browsonic` global — boundary should
    // fall through cleanly rather than crash.
    expect(() =>
      render(
        <BrowsonicErrorBoundary fallback={<div>silent</div>}>
          <Crash message="silent" />
        </BrowsonicErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it('invokes onError after the SDK is notified', () => {
    const captureError = vi.fn();
    const onError = vi.fn();
    render(
      <BrowsonicErrorBoundary
        sdk={fakeSdk({ captureError })}
        onError={onError}
        fallback={<div>fb</div>}
      >
        <Crash message="ordered" />
      </BrowsonicErrorBoundary>,
    );
    expect(captureError).toHaveBeenCalledBefore(onError);
  });

  it('survives an onError callback that throws', () => {
    const onError = vi.fn(() => {
      throw new Error('onError blew up');
    });
    expect(() =>
      render(
        <BrowsonicErrorBoundary sdk={fakeSdk()} onError={onError} fallback={<div>fb</div>}>
          <Crash message="x" />
        </BrowsonicErrorBoundary>,
      ),
    ).not.toThrow();
  });
});
