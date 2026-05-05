// SPDX-License-Identifier: Apache-2.0

/**
 * Suspense + lazy / async integration suite for `BrowsonicErrorBoundary`.
 *
 * React's `<Suspense>` boundary catches *loading* states — components
 * that throw a Promise. It does **not** catch errors. Errors thrown
 * during render of a Suspense child still bubble up to the nearest
 * error boundary above the Suspense, which is exactly where
 * `BrowsonicErrorBoundary` (a `componentDidCatch` class) lives in
 * a typical wire-up:
 *
 *   <BrowsonicErrorBoundary fallback={...}>
 *     <Suspense fallback={...}>
 *       <LazyChild />
 *     </Suspense>
 *   </BrowsonicErrorBoundary>
 *
 * This file pins the contract: an error thrown from inside a
 * `<Suspense>` subtree (a lazy chunk that fails to load, a render
 * after `use()` rejects, a thrown Error after pending resolves)
 * still reaches `componentDidCatch` on the boundary above.
 *
 * Why a dedicated suite: the existing regression suite covers
 * sync-render throws inside the boundary's direct children. The
 * Suspense relationship is structurally different — the lazy
 * component initially throws a Promise (which Suspense catches and
 * renders the pending fallback), then later renders for real, and
 * THAT real render is what can throw an Error. Without a test, a
 * future React minor version that rewires error propagation
 * through Suspense (or moves it to a separate boundary) could
 * silently break consumers running `<Suspense>` + `lazy()`.
 *
 * Mirrors the Vue 0.3 Suspense + async setup test pattern.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Suspense, lazy, type ReactElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import type { Browsonic } from '@browsonic/sdk';
import { BrowsonicErrorBoundary } from './error-boundary';

afterEach(() => {
  cleanup();
});

function fakeSdk(
  captureError: ReturnType<typeof vi.fn>,
  addMetadata: ReturnType<typeof vi.fn>,
): Browsonic {
  return {
    captureError,
    addMetadata,
  } as unknown as Browsonic;
}

// A lazy component whose chunk-load resolves immediately with a
// component that throws on render. Mirrors the most common Suspense
// failure shape: a route-level lazy split renders successfully past
// the loading state, then crashes inside the loaded module.
const LazyThrow = lazy(async () => {
  await Promise.resolve();
  return {
    default: function ThrowOnRender(): ReactElement {
      throw new Error('lazy-render-failure');
    },
  };
});

// A lazy component that resolves successfully — used to assert the
// boundary stays out of the way when nothing throws.
const LazySafe = lazy(async () => {
  await Promise.resolve();
  return {
    default: function Safe(): ReactElement {
      return <div data-testid="lazy-safe">ok</div>;
    },
  };
});

describe('BrowsonicErrorBoundary — Suspense + lazy() integration', () => {
  it('catches an error thrown from inside a lazy() chunk and forwards it to sdk.captureError', async () => {
    const captureError = vi.fn();
    const addMetadata = vi.fn();
    const { findByText } = render(
      <BrowsonicErrorBoundary
        fallback={(err) => <div data-testid="fallback">{err.message}</div>}
        sdk={fakeSdk(captureError, addMetadata)}
      >
        <Suspense fallback={<div data-testid="pending">loading…</div>}>
          <LazyThrow />
        </Suspense>
      </BrowsonicErrorBoundary>,
    );

    // Wait for the Suspense to resolve + the boundary to commit its
    // error state. `findByText` polls — fine for the async-resolution
    // shape we're testing.
    const fallback = await findByText('lazy-render-failure');
    expect(fallback).toBeTruthy();

    expect(captureError).toHaveBeenCalledTimes(1);
    const err = captureError.mock.calls[0]![0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('lazy-render-failure');
  });

  it('renders the boundary fallback after a lazy() throw, not the Suspense fallback', async () => {
    const captureError = vi.fn();
    const addMetadata = vi.fn();
    const { findByTestId, queryByTestId } = render(
      <BrowsonicErrorBoundary
        fallback={() => <div data-testid="fallback">crashed</div>}
        sdk={fakeSdk(captureError, addMetadata)}
      >
        <Suspense fallback={<div data-testid="pending">loading…</div>}>
          <LazyThrow />
        </Suspense>
      </BrowsonicErrorBoundary>,
    );

    await findByTestId('fallback');
    // After the boundary takes over, Suspense's fallback should be
    // gone — the boundary owns the subtree authoritatively.
    expect(queryByTestId('pending')).toBeNull();
  });

  it('does NOT capture when the lazy() chunk resolves successfully', async () => {
    const captureError = vi.fn();
    const addMetadata = vi.fn();
    const { findByTestId } = render(
      <BrowsonicErrorBoundary fallback={<div>never</div>} sdk={fakeSdk(captureError, addMetadata)}>
        <Suspense fallback={<div data-testid="pending">loading…</div>}>
          <LazySafe />
        </Suspense>
      </BrowsonicErrorBoundary>,
    );

    await findByTestId('lazy-safe');
    expect(captureError).not.toHaveBeenCalled();
  });

  it('forwards the componentStack from a lazy-render error as truncated metadata', async () => {
    const captureError = vi.fn();
    const addMetadata = vi.fn();
    const { findByTestId } = render(
      <BrowsonicErrorBoundary
        fallback={<div data-testid="fallback">x</div>}
        sdk={fakeSdk(captureError, addMetadata)}
      >
        <Suspense fallback={<div>loading…</div>}>
          <LazyThrow />
        </Suspense>
      </BrowsonicErrorBoundary>,
    );

    await findByTestId('fallback');
    // The boundary writes `componentStack` metadata after capture —
    // we don't assert the exact stack content (React's
    // owner-component stack is opaque) but pin the contract that it
    // fires AND stays under the 1024-char cap the boundary documents.
    const stackCall = addMetadata.mock.calls.find((c) => c[0] === 'componentStack');
    expect(stackCall).toBeDefined();
    expect((stackCall![1] as string).length).toBeLessThanOrEqual(1024);
  });
});
