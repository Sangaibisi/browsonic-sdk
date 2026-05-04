// SPDX-License-Identifier: Apache-2.0

/**
 * Suspense + async setup integration suite for `BrowsonicErrorBoundary`.
 *
 * Why a dedicated suite: Vue 3 supports `<script setup async>` and
 * top-level `await` inside `setup()`. When such a component throws
 * during async resolution, Vue's reconciler routes the error through
 * the same `errorCaptured` path as render-time / lifecycle hook
 * errors — the closest ancestor with `onErrorCaptured` catches it.
 * That's exactly what `BrowsonicErrorBoundary` already implements
 * (the boundary uses `onErrorCaptured` regardless of error origin).
 *
 * The existing regression suite covers sync render + sync lifecycle
 * paths. This file pins the **async / Suspense** contract: an async
 * setup function that throws inside a `<Suspense>` fallback chain
 * must reach the boundary just like any other error. Without an
 * explicit test, a future Vue version that rewires async error
 * propagation could silently break consumers running async setup.
 *
 * Vue 3.0+ Suspense is stable; no flag-gated APIs are used here.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineComponent, h, nextTick, Suspense, type Component } from 'vue';
import { render, cleanup } from '@testing-library/vue';
import type { Browsonic } from '@browsonic/sdk';
import { BrowsonicErrorBoundary } from './error-boundary';

function makeFakeSdk(): Browsonic {
  return {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setTag: vi.fn(),
  } as unknown as Browsonic;
}

const AsyncSetupThrow: Component = defineComponent({
  name: 'AsyncSetupThrow',
  async setup() {
    // Microtask-deferred throw — mimics the most common async-setup
    // failure shape: a fetch() rejects after the component has been
    // committed to the Suspense pending queue. Resolving on the
    // microtask queue is fast enough for happy-dom but still
    // exercises the async error-propagation path.
    await Promise.resolve();
    throw new Error('async-setup-failure');
  },
  render() {
    return h('div', { 'data-testid': 'never-renders' });
  },
});

// We don't test the async-success path here. happy-dom has a known
// edge case where Suspense's commit-on-resolve flow throws
// `insertBefore` errors that aren't reproducible in real browsers,
// and the no-error path is already covered by the main boundary
// suite (`error-boundary.test.ts`'s "renders children when there is
// no error" test). Adding it here would only test happy-dom +
// Suspense interaction, not the boundary contract we care about.

afterEach(() => {
  cleanup();
});

describe('BrowsonicErrorBoundary — Suspense + async setup', () => {
  it('catches an async setup() throw and forwards it to sdk.captureError', async () => {
    const sdk = makeFakeSdk();
    render(BrowsonicErrorBoundary, {
      props: {
        sdk,
        fallback: ({ error }: { error: Error }) =>
          h('div', { 'data-testid': 'fallback' }, error.message),
      },
      slots: {
        default: () =>
          h(Suspense, null, {
            default: () => h(AsyncSetupThrow),
            fallback: () => h('div', { 'data-testid': 'pending' }, 'loading…'),
          }),
      },
    });

    // Drain the microtask queue twice: once for the rejected setup
    // promise, once for the boundary's reactive re-render after
    // `errorCaptured` flips its ref. Without both, the fallback
    // hasn't committed yet and `getByTestId('fallback')` would race.
    await nextTick();
    await nextTick();

    expect(sdk.captureError).toHaveBeenCalled();
    const err = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('async-setup-failure');
  });

  it('renders the boundary fallback after an async setup throw, not the Suspense fallback', async () => {
    const sdk = makeFakeSdk();
    const { getByTestId, queryByTestId } = render(BrowsonicErrorBoundary, {
      props: {
        sdk,
        fallback: ({ error }: { error: Error }) =>
          h('div', { 'data-testid': 'fallback' }, error.message),
      },
      slots: {
        default: () =>
          h(Suspense, null, {
            default: () => h(AsyncSetupThrow),
            fallback: () => h('div', { 'data-testid': 'pending' }, 'loading…'),
          }),
      },
    });

    await nextTick();
    await nextTick();

    expect(getByTestId('fallback').textContent).toBe('async-setup-failure');
    // Suspense's fallback should not be visible after the boundary
    // has taken over — the boundary renders authoritatively for the
    // subtree once `errorCaptured` flips.
    expect(queryByTestId('pending')).toBeNull();
  });

  it('tags the captured event with `vue.errorCaptured.info` for async setup errors too', async () => {
    const sdk = makeFakeSdk();
    render(BrowsonicErrorBoundary, {
      props: { sdk, fallback: () => h('div', 'fallback') },
      slots: {
        default: () =>
          h(Suspense, null, {
            default: () => h(AsyncSetupThrow),
            fallback: () => h('div', 'pending'),
          }),
      },
    });

    await nextTick();
    await nextTick();

    // The `info` string Vue passes for async setup failures is
    // `'setup function'`. We don't assert the exact value (it could
    // shift across Vue minor versions) — only that the tag is set
    // with a non-empty string, matching the parity contract.
    const setTagCalls = (sdk.setTag as ReturnType<typeof vi.fn>).mock.calls;
    const infoTag = setTagCalls.find((c) => c[0] === 'vue.errorCaptured.info');
    expect(infoTag).toBeDefined();
    expect(typeof infoTag![1]).toBe('string');
    expect((infoTag![1] as string).length).toBeGreaterThan(0);
  });
});
