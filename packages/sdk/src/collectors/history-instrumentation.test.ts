// SPDX-License-Identifier: Apache-2.0

/**
 * History instrumentation — regression suite.
 *
 * Covers TECHNICAL-IMPROVEMENT-PLAN.md §1.4:
 *   - Single wrap regardless of subscriber count.
 *   - Native methods restored after last unsubscribe.
 *   - Subscriber errors do not break the history API.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  subscribeToHistoryChanges,
  __resetHistoryInstrumentationForTests,
} from './history-instrumentation';

describe('subscribeToHistoryChanges', () => {
  let nativePushState: typeof history.pushState;
  let nativeReplaceState: typeof history.replaceState;

  beforeEach(() => {
    __resetHistoryInstrumentationForTests();
    nativePushState = history.pushState;
    nativeReplaceState = history.replaceState;
  });

  afterEach(() => {
    __resetHistoryInstrumentationForTests();
  });

  it('notifies listener on pushState', () => {
    const listener = vi.fn();
    const unsub = subscribeToHistoryChanges(listener);
    history.pushState({}, '', '/new-page');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: 'pushState',
    });
    unsub();
  });

  it('notifies listener on replaceState', () => {
    const listener = vi.fn();
    const unsub = subscribeToHistoryChanges(listener);
    history.replaceState({}, '', '/replaced');
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].type).toBe('replaceState');
    unsub();
  });

  it('wraps history exactly once for multiple subscribers', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = subscribeToHistoryChanges(a);
    const wrappedAfterA = history.pushState;
    const unsubB = subscribeToHistoryChanges(b);
    const wrappedAfterB = history.pushState;

    // Second subscribe did NOT rewrap
    expect(wrappedAfterA).toBe(wrappedAfterB);

    history.pushState({}, '', '/p');
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();

    unsubA();
    unsubB();
  });

  it('restores native history.pushState after last unsubscribe', () => {
    const unsubA = subscribeToHistoryChanges(() => {});
    const unsubB = subscribeToHistoryChanges(() => {});
    expect(history.pushState).not.toBe(nativePushState);

    unsubA();
    // Still one subscriber left → should still be wrapped
    expect(history.pushState).not.toBe(nativePushState);

    unsubB();
    // Last subscriber gone → restored
    expect(history.pushState).toBe(nativePushState);
    expect(history.replaceState).toBe(nativeReplaceState);
  });

  it('does not re-notify a removed listener', () => {
    const listener = vi.fn();
    const unsub = subscribeToHistoryChanges(listener);
    history.pushState({}, '', '/a');
    expect(listener).toHaveBeenCalledTimes(1);

    unsub();
    history.pushState({}, '', '/b');
    expect(listener).toHaveBeenCalledTimes(1); // unchanged
  });

  it('listener throw does not break history API', () => {
    const badListener = vi.fn(() => {
      throw new Error('subscriber boom');
    });
    const goodListener = vi.fn();
    const unsubA = subscribeToHistoryChanges(badListener);
    const unsubB = subscribeToHistoryChanges(goodListener);

    // Host app's pushState call must not throw
    expect(() => history.pushState({}, '', '/survives')).not.toThrow();
    // Good listener still fires even though bad one threw
    expect(goodListener).toHaveBeenCalled();

    unsubA();
    unsubB();
  });
});
