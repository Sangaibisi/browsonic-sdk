// SPDX-License-Identifier: Apache-2.0

/**
 * Callback collector — addEventListener / removeEventListener round-trip
 * regression suite. Sprint 3.4-3.6.
 *
 * Pre-0.3.0 the wrap generated a new function per addEventListener call,
 * which silently broke any subsequent removeEventListener using the
 * original listener reference. This test suite codifies the fix.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCallbackCollector, wrapForAsyncStack } from './callback';

describe('wrapForAsyncStack — manual opt-in helper', () => {
  it('returns a function that behaves identically in success case', () => {
    const original = (a: number, b: number) => a + b;
    const wrapped = wrapForAsyncStack(original);
    expect(wrapped(2, 3)).toBe(5);
  });

  it('attaches _bindStack to Errors thrown by the wrapped function', () => {
    const wrapped = wrapForAsyncStack(() => {
      throw new Error('kaboom');
    });
    try {
      wrapped();
    } catch (e) {
      const withBind = e as Error & { _bindStack?: string; _bindTime?: string };
      expect(withBind._bindStack).toBeDefined();
      expect(typeof withBind._bindStack).toBe('string');
      expect(withBind._bindTime).toBeDefined();
    }
  });

  it('returns input untouched if not a function', () => {
    expect(wrapForAsyncStack(null as unknown as () => void)).toBeNull();
    expect(wrapForAsyncStack(undefined as unknown as () => void)).toBeUndefined();
  });
});

describe('callback collector — global mode addEventListener/removeEventListener round-trip', () => {
  let collector: ReturnType<typeof createCallbackCollector> | null = null;

  beforeEach(() => {
    collector = createCallbackCollector({ debugLog: () => {} });
    collector.install();
  });

  afterEach(() => {
    collector?.uninstall();
    collector = null;
  });

  it('removeEventListener(originalRef) actually removes the listener', () => {
    const target = new EventTarget();
    const listener = vi.fn();

    target.addEventListener('x-test', listener);
    target.dispatchEvent(new Event('x-test'));
    expect(listener).toHaveBeenCalledTimes(1);

    target.removeEventListener('x-test', listener);
    target.dispatchEvent(new Event('x-test'));
    // If the fix works, the listener is detached → still 1.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  // NOTE: A capture-flag semantic test (DOM spec: type + listener + capture
  // must all match for remove to succeed) is deliberately omitted here.
  // happy-dom does not implement capture-phase dispatching for bare
  // EventTargets, making this case untestable in unit tests. The logic is
  // covered by inspection: `listenerKey(type, options)` includes the
  // capture bit in the WeakMap key, matching DOM spec behavior in the
  // browser. An e2e Playwright spec could assert this if needed later.

  it('uninstall restores native addEventListener/removeEventListener identity', () => {
    // Fresh collector — beforeEach already installed one, use a fresh
    // snapshot before THIS test's install to verify identity restore.
    collector?.uninstall();
    const nativeAdd = EventTarget.prototype.addEventListener;
    const nativeRemove = EventTarget.prototype.removeEventListener;

    const fresh = createCallbackCollector({ debugLog: () => {} });
    fresh.install();
    expect(EventTarget.prototype.addEventListener).not.toBe(nativeAdd);

    fresh.uninstall();
    expect(EventTarget.prototype.addEventListener).toBe(nativeAdd);
    expect(EventTarget.prototype.removeEventListener).toBe(nativeRemove);

    // Prevent afterEach double-uninstall — already teardown above.
    collector = null;
  });

  it('preserves listener behavior for non-function listener objects', () => {
    const target = new EventTarget();
    const handler = { handleEvent: vi.fn() };
    target.addEventListener('x-test', handler);
    target.dispatchEvent(new Event('x-test'));
    expect(handler.handleEvent).toHaveBeenCalledTimes(1);
  });

  describe('queueMicrotask wrap (Sprint 2 M3)', () => {
    it('overrides window.queueMicrotask while installed', () => {
      // beforeEach already installed a fresh collector; capture the
      // current binding (wrapped) and a clean reference for restore.
      collector?.uninstall();

      const native = window.queueMicrotask;
      const fresh = createCallbackCollector({ debugLog: () => {} });
      fresh.install();
      expect(window.queueMicrotask).not.toBe(native);

      fresh.uninstall();
      expect(window.queueMicrotask).toBe(native);
      collector = null;
    });

    it('still runs the user callback', async () => {
      // Functional smoke: wrapped queueMicrotask must dispatch the
      // callback exactly like the native API.
      const ran = vi.fn();
      window.queueMicrotask(() => ran());
      // Microtasks drain on the next await boundary.
      await Promise.resolve();
      expect(ran).toHaveBeenCalledTimes(1);
    });

    // NOTE: A `_bindStack on thrown microtask error` test was deliberately
    // omitted. happy-dom does not surface microtask exceptions through a
    // listener we can hook in unit tests, and unhandled exceptions inside
    // queueMicrotask propagate as test-runtime errors rather than as
    // window 'error' events. The bind-stack mechanism itself is already
    // covered by `wrapForAsyncStack` tests above; the queueMicrotask
    // override + invocation are validated by the two tests in this block.
  });
});
