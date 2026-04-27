/**
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import { safeExecute } from '../utils';
import { wrapForAsyncStack } from './wrap';

interface CallbackCollectorOptions {
  debugLog: (message: string, ...args: unknown[]) => void;
}

type AnyFn = (...args: unknown[]) => unknown;
type OriginalAEL = typeof EventTarget.prototype.addEventListener;
type OriginalREL = typeof EventTarget.prototype.removeEventListener;

// Re-export for callers that still import the helper from this module.
// Lives in `./wrap.ts` so the core bundle can pull it in without the
// full callback collector.
export { wrapForAsyncStack };

/**
 * Capture stack trace at bind time. Callers strip SDK frames upstream.
 */
function captureBindStack(): string {
  try {
    const stack = new Error().stack;
    if (!stack) return '';
    // Strip 3 leading lines: Error, captureBindStack, calling wrapper.
    return stack.split('\n').slice(3).join('\n');
  } catch {
    return '';
  }
}

/**
 * Wrap a callback to attach `_bindStack` + `_bindTime` to any Error it
 * throws during execution. Re-throws so host behavior is unchanged.
 */
function wrapCallback<T extends AnyFn>(callback: T, bindStack: string): T {
  return ((...args: unknown[]) => {
    try {
      return callback(...args);
    } catch (error) {
      if (error instanceof Error) {
        (error as Error & { _bindStack?: string; _bindTime?: string })._bindStack = bindStack;
        (error as Error & { _bindStack?: string; _bindTime?: string })._bindTime =
          new Date().toISOString();
      }
      throw error;
    }
  }) as T;
}

/**
 * Callback collector — instruments async callbacks so stack traces survive
 * across tick boundaries.
 *
 * 0.3.0 — BREAKING: `captureAsyncStack` now takes `false | 'manual' | 'global'`.
 *
 *   - `false` (default): this collector isn't installed.
 *   - `'manual'`: users import `Browsonic.wrap(fn)` and wrap selected
 *     callbacks. Zero global prototype mutation; zero CPU overhead for
 *     code paths not touched by the user.
 *   - `'global'` (legacy): SDK wraps `setTimeout`, `setInterval`,
 *     `requestAnimationFrame`, and `EventTarget.prototype.addEventListener`
 *     globally. 0.3.0 additionally wraps `removeEventListener` and keeps
 *     a WeakMap<original, wrapped> registry so `removeEventListener(h)`
 *     still finds the wrapped listener and tears it down — prior versions
 *     silently leaked listeners because each wrap produced a new function.
 *
 * See TEKNIK-IYILESTIRME §2.1 and PERFORMANS-STRATEJISI §9.
 */
export function createCallbackCollector(options: CallbackCollectorOptions) {
  const { debugLog } = options;

  let isInstalled = false;
  let originalSetTimeout: typeof setTimeout | null = null;
  let originalSetInterval: typeof setInterval | null = null;
  let originalRAF: typeof requestAnimationFrame | null = null;
  let originalAddEventListener: OriginalAEL | null = null;
  let originalRemoveEventListener: OriginalREL | null = null;

  /**
   * Per-call registry of original → wrapped listener, keyed by the
   * original listener function. Allows `removeEventListener(original)`
   * to locate the wrapped function that was actually attached.
   *
   * WeakMap → automatically GCed when the original listener becomes
   * unreachable in user code.
   */
  const listenerRegistry = new WeakMap<object, Map<string, EventListener>>();

  /**
   * Build the lookup key for listenerRegistry's inner map. We cannot
   * disambiguate by `options` alone (bool vs obj; capture subtly differs)
   * so we flatten to the spec-compliant "capture" signal + event type.
   */
  function listenerKey(type: string, options?: boolean | AddEventListenerOptions): string {
    const capture = typeof options === 'boolean' ? options : options?.capture === true;
    return `${capture ? 'c' : ''}:${type}`;
  }

  function install() {
    if (isInstalled) return;
    if (typeof window === 'undefined') return;

    safeExecute(
      () => {
        // Capture native refs into local consts — wrappers close over them,
        // so no non-null assertions are needed inside the hot path.
        const capturedSetTimeout = window.setTimeout.bind(window);
        const capturedSetInterval = window.setInterval.bind(window);
        const capturedRAF = window.requestAnimationFrame?.bind(window);
        const capturedAdd = EventTarget.prototype.addEventListener;
        const capturedRemove = EventTarget.prototype.removeEventListener;

        originalSetTimeout = capturedSetTimeout;
        originalSetInterval = capturedSetInterval;
        originalRAF = capturedRAF ?? null;
        originalAddEventListener = capturedAdd;
        originalRemoveEventListener = capturedRemove;

        // Wrap setTimeout
        const wrappedSetTimeout = function (
          callback: TimerHandler,
          delay?: number,
          ...args: unknown[]
        ) {
          if (typeof callback === 'function') {
            const bindStack = captureBindStack();
            callback = wrapCallback(callback as AnyFn, bindStack);
          }
          return capturedSetTimeout(callback, delay, ...args);
        };
        (window as { setTimeout: unknown }).setTimeout = wrappedSetTimeout;

        // Wrap setInterval
        const wrappedSetInterval = function (
          callback: TimerHandler,
          delay?: number,
          ...args: unknown[]
        ) {
          if (typeof callback === 'function') {
            const bindStack = captureBindStack();
            callback = wrapCallback(callback as AnyFn, bindStack);
          }
          return capturedSetInterval(callback, delay, ...args);
        };
        (window as { setInterval: unknown }).setInterval = wrappedSetInterval;

        // Wrap requestAnimationFrame
        if (capturedRAF) {
          window.requestAnimationFrame = function (callback: FrameRequestCallback): number {
            const bindStack = captureBindStack();
            const wrapped = wrapCallback(callback as unknown as AnyFn, bindStack);
            return capturedRAF(wrapped);
          };
        }

        // Wrap addEventListener — record original → wrapped mapping so
        // removeEventListener can find the actual attached function.
        EventTarget.prototype.addEventListener = function (
          this: EventTarget,
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | AddEventListenerOptions
        ): void {
          if (typeof listener === 'function') {
            // `listener` is already narrowed to the callable form by typeof.
            const original = listener;
            const bindStack = captureBindStack();
            const wrapped = wrapCallback(
              original as unknown as AnyFn,
              bindStack
            ) as unknown as EventListener;

            // Register mapping keyed by the ORIGINAL function identity,
            // so removeEventListener(originalRef) works.
            const key = listenerKey(type, options);
            let bucket = listenerRegistry.get(original);
            if (!bucket) {
              bucket = new Map();
              listenerRegistry.set(original, bucket);
            }
            bucket.set(key, wrapped);

            return capturedAdd.call(this, type, wrapped, options);
          }
          return capturedAdd.call(this, type, listener, options);
        };

        // Wrap removeEventListener — translate the original-ref back into
        // the wrapped-ref using the registry. If not found, pass through
        // so listeners attached before our install still work.
        EventTarget.prototype.removeEventListener = function (
          this: EventTarget,
          type: string,
          listener: EventListenerOrEventListenerObject | null,
          options?: boolean | EventListenerOptions
        ): void {
          if (typeof listener === 'function') {
            const key = listenerKey(type, options);
            const bucket = listenerRegistry.get(listener);
            const wrapped = bucket?.get(key);
            if (wrapped && bucket) {
              bucket.delete(key);
              if (bucket.size === 0) {
                listenerRegistry.delete(listener);
              }
              return capturedRemove.call(this, type, wrapped, options);
            }
          }
          return capturedRemove.call(this, type, listener, options);
        };

        isInstalled = true;
        debugLog('Callback collector installed (global async stack mode)');
      },
      undefined,
      (error) => debugLog('Failed to install callback collector:', error)
    );
  }

  function uninstall() {
    if (!isInstalled) return;

    safeExecute(
      () => {
        if (originalSetTimeout) {
          (window as { setTimeout: unknown }).setTimeout = originalSetTimeout;
          originalSetTimeout = null;
        }
        if (originalSetInterval) {
          (window as { setInterval: unknown }).setInterval = originalSetInterval;
          originalSetInterval = null;
        }
        if (originalRAF) {
          window.requestAnimationFrame = originalRAF;
          originalRAF = null;
        }
        if (originalAddEventListener) {
          EventTarget.prototype.addEventListener = originalAddEventListener;
          originalAddEventListener = null;
        }
        if (originalRemoveEventListener) {
          EventTarget.prototype.removeEventListener = originalRemoveEventListener;
          originalRemoveEventListener = null;
        }

        isInstalled = false;
        debugLog('Callback collector uninstalled');
      },
      undefined,
      (error) => debugLog('Failed to uninstall callback collector:', error)
    );
  }

  return {
    install,
    uninstall,
    isInstalled: () => isInstalled,
  };
}

/**
 * Extract bindStack from an error if present
 */
export function extractBindStack(error: unknown): {
  bindStack: string | null;
  bindTime: string | null;
} {
  if (error instanceof Error) {
    const errorWithBind = error as Error & { _bindStack?: string; _bindTime?: string };
    return {
      bindStack: errorWithBind._bindStack || null,
      bindTime: errorWithBind._bindTime || null,
    };
  }
  return { bindStack: null, bindTime: null };
}
