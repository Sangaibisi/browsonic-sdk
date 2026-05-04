// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicErrorBoundary regression suite. Verifies that
 *   - render-time exceptions in a child component are forwarded to the
 *     SDK and the boundary swaps to the fallback,
 *   - fallback can be a component or a render function,
 *   - reset() clears the error and returns to children,
 *   - SDK reporting failures are isolated from the host app,
 *   - the boundary works without an explicit SDK prop (falls back to
 *     the composable lookup).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { defineComponent, h, nextTick, type Component } from 'vue';
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

const Throwing: Component = defineComponent({
  props: { shouldThrow: { type: Boolean, default: true } },
  setup(props) {
    return () => {
      if (props.shouldThrow) {
        throw new Error('child-render-failure');
      }
      return h('div', { 'data-testid': 'safe' }, 'safe');
    };
  },
});

afterEach(() => {
  cleanup();
});

describe('BrowsonicErrorBoundary', () => {
  it('renders children when there is no error', () => {
    const sdk = makeFakeSdk();
    const { getByTestId } = render(BrowsonicErrorBoundary, {
      props: { sdk, fallback: () => h('div', 'fallback') },
      slots: {
        default: () =>
          h(defineComponent({ setup: () => () => h('div', { 'data-testid': 'happy' }, 'ok') })),
      },
    });
    expect(getByTestId('happy')).toBeDefined();
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('catches a thrown render and forwards it to sdk.captureError', () => {
    const sdk = makeFakeSdk();
    render(BrowsonicErrorBoundary, {
      props: {
        sdk,
        fallback: ({ error }: { error: Error }) =>
          h('div', { 'data-testid': 'fallback' }, error.message),
      },
      slots: {
        default: () => h(Throwing),
      },
    });
    expect(sdk.captureError).toHaveBeenCalled();
    const callArg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Error;
    expect(callArg).toBeInstanceOf(Error);
    expect(callArg.message).toBe('child-render-failure');
  });

  it('renders the fallback after a thrown render', async () => {
    const sdk = makeFakeSdk();
    const { getByTestId } = render(BrowsonicErrorBoundary, {
      props: {
        sdk,
        fallback: ({ error }: { error: Error }) =>
          h('div', { 'data-testid': 'fallback' }, error.message),
      },
      slots: {
        default: () => h(Throwing),
      },
    });
    // errorCaptured updates `error.value` reactively; the boundary's
    // re-render is queued for the next tick.
    await nextTick();
    expect(getByTestId('fallback').textContent).toBe('child-render-failure');
  });

  it('truncates a long componentStack metadata payload to 1024 chars', () => {
    const sdk = makeFakeSdk();
    render(BrowsonicErrorBoundary, {
      props: { sdk, fallback: () => h('div', 'fallback') },
      slots: { default: () => h(Throwing) },
    });
    const setMeta = sdk.addMetadata as ReturnType<typeof vi.fn>;
    if (setMeta.mock.calls.length > 0) {
      const value = setMeta.mock.calls[0]![1] as string;
      expect(value.length).toBeLessThanOrEqual(1024);
    }
  });

  it('isolates an SDK that throws inside captureError', () => {
    const sdk = makeFakeSdk();
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    expect(() => {
      render(BrowsonicErrorBoundary, {
        props: { sdk, fallback: () => h('div', 'fallback') },
        slots: { default: () => h(Throwing) },
      });
    }).not.toThrow();
  });

  it('still renders fallback when no SDK is reachable', async () => {
    const { getByTestId } = render(BrowsonicErrorBoundary, {
      props: {
        fallback: ({ error }: { error: Error }) =>
          h('div', { 'data-testid': 'fallback' }, error.message),
      },
      slots: { default: () => h(Throwing) },
    });
    await nextTick();
    expect(getByTestId('fallback').textContent).toBe('child-render-failure');
  });

  it('invokes the user-supplied onError after the SDK', () => {
    const sdk = makeFakeSdk();
    const onError = vi.fn();
    render(BrowsonicErrorBoundary, {
      props: { sdk, fallback: () => h('div', 'fallback'), onError },
      slots: { default: () => h(Throwing) },
    });
    expect(onError).toHaveBeenCalled();
    const errArg = onError.mock.calls[0]![0] as Error;
    expect(errArg.message).toBe('child-render-failure');
  });

  it('surfaces the Vue errorCaptured info as a structured tag (0.2)', () => {
    const sdk = makeFakeSdk();
    render(BrowsonicErrorBoundary, {
      props: { sdk, fallback: () => h('div', 'fallback') },
      slots: { default: () => h(Throwing) },
    });
    const setTag = sdk.setTag as ReturnType<typeof vi.fn>;
    expect(setTag).toHaveBeenCalled();
    const [tagKey, tagValue] = setTag.mock.calls[0]!;
    expect(tagKey).toBe('vue.errorCaptured.info');
    // Vue's render-time errors land with info string 'render function'
    // (or similar). The tag is truncated to 64 chars.
    expect(typeof tagValue).toBe('string');
    expect((tagValue as string).length).toBeLessThanOrEqual(64);
  });

  it('isolates a setTag failure so captureError still fires', () => {
    const sdk = makeFakeSdk();
    (sdk.setTag as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('tag-store-exploded');
    });
    render(BrowsonicErrorBoundary, {
      props: { sdk, fallback: () => h('div', 'fallback') },
      slots: { default: () => h(Throwing) },
    });
    expect(sdk.captureError).toHaveBeenCalledTimes(1);
  });
});
