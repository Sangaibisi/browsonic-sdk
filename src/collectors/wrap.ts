/**
 * Minimal `wrapForAsyncStack` utility — lives in its own module so the
 * core bundle can import just this helper for `Browsonic.wrap()` without
 * pulling in the full (~9 KB) callback collector.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

type AnyFn = (...args: unknown[]) => unknown;

function captureBindStack(): string {
  try {
    const stack = new Error().stack;
    if (!stack) return '';
    return stack.split('\n').slice(3).join('\n');
  } catch {
    return '';
  }
}

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

export function wrapForAsyncStack<T extends AnyFn>(callback: T): T {
  if (typeof callback !== 'function') return callback;
  const bindStack = captureBindStack();
  return wrapCallback(callback, bindStack);
}
