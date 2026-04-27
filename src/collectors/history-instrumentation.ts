/**
 * Singleton history instrumentation — reference-counted.
 *
 * Problem being solved (TEKNIK-IYILESTIRME-PLANI.md §1.4):
 *   Both the navigation collector and the pageview collector wrapped
 *   `history.pushState` / `history.replaceState` independently. Whichever
 *   collector installed first lost its "original" reference when the second
 *   collector wrapped the (already-wrapped) function. Destroy sequences
 *   failed to restore the native functions, leaving zombie closures
 *   running after the SDK was torn down.
 *
 * Solution:
 *   A single shared instrumentation module wraps history exactly once.
 *   Subscribers (navigation, pageview) register a listener and receive
 *   a ref-counted handle. When the last subscriber unsubscribes, the
 *   history methods are restored to their native implementations.
 *
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

export type HistoryChangeType = 'pushState' | 'replaceState' | 'popstate' | 'hashchange';

export interface HistoryChangeEvent {
  type: HistoryChangeType;
  /** Absolute URL the browser navigated to. */
  to: string;
  /** Absolute URL before the change. */
  from: string;
}

export type HistoryChangeListener = (event: HistoryChangeEvent) => void;

interface InstrumentationState {
  originalPushState: typeof history.pushState;
  originalReplaceState: typeof history.replaceState;
  popstateHandler: () => void;
  hashchangeHandler: () => void;
  listeners: Set<HistoryChangeListener>;
  lastUrl: string;
}

let state: InstrumentationState | null = null;

function resolveUrl(candidate: string | URL | null | undefined): string {
  if (typeof window === 'undefined') return '';
  if (candidate == null) return window.location.href;
  try {
    return new URL(String(candidate), window.location.href).href;
  } catch {
    return window.location.href;
  }
}

function notify(type: HistoryChangeType, toUrl: string): void {
  if (!state) return;
  const from = state.lastUrl;
  state.lastUrl = toUrl;
  // Iterate over a snapshot so listener mutation during dispatch is safe.
  const listeners = Array.from(state.listeners);
  for (const listener of listeners) {
    try {
      listener({ type, to: toUrl, from });
    } catch {
      // Never let a subscriber throw propagate — history API must remain
      // reliable for the host app.
    }
  }
}

function installOnce(): void {
  if (state) return;
  if (typeof window === 'undefined' || typeof history === 'undefined') return;

  // Store the UNBOUND references so restore preserves identity across
  // install/uninstall cycles. Using `.bind(history)` here would add a
  // new function layer each cycle; repeated subscribe/unsubscribe would
  // leave `history.pushState` as "bound bound bound native" instead of
  // the original native function. `.call(history, ...)` in the wrapper
  // gives us the right `this` without mutating identity.
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  const popstateHandler = () => {
    notify('popstate', window.location.href);
  };
  const hashchangeHandler = () => {
    notify('hashchange', window.location.href);
  };

  history.pushState = function wrappedPushState(
    data: unknown,
    unused: string,
    url?: string | URL | null
  ) {
    const result = originalPushState.call(history, data, unused, url);
    notify('pushState', url ? resolveUrl(url) : window.location.href);
    return result;
  };

  history.replaceState = function wrappedReplaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null
  ) {
    const result = originalReplaceState.call(history, data, unused, url);
    notify('replaceState', url ? resolveUrl(url) : window.location.href);
    return result;
  };

  window.addEventListener('popstate', popstateHandler);
  window.addEventListener('hashchange', hashchangeHandler);

  state = {
    originalPushState,
    originalReplaceState,
    popstateHandler,
    hashchangeHandler,
    listeners: new Set(),
    lastUrl: window.location.href,
  };
}

function uninstallIfEmpty(): void {
  if (!state) return;
  if (state.listeners.size > 0) return;
  if (typeof window === 'undefined' || typeof history === 'undefined') {
    state = null;
    return;
  }

  // Restore original methods and detach global listeners.
  history.pushState = state.originalPushState;
  history.replaceState = state.originalReplaceState;
  window.removeEventListener('popstate', state.popstateHandler);
  window.removeEventListener('hashchange', state.hashchangeHandler);
  state = null;
}

/**
 * Subscribe to history change events. Returns an unsubscribe function.
 * Safe to call repeatedly; last unsubscribe restores native history methods.
 */
export function subscribeToHistoryChanges(listener: HistoryChangeListener): () => void {
  installOnce();
  if (!state) return () => {}; // non-browser env, no-op

  state.listeners.add(listener);

  return function unsubscribe() {
    if (!state) return;
    state.listeners.delete(listener);
    uninstallIfEmpty();
  };
}

/**
 * Test helper — force full tear-down regardless of subscriber count.
 * Not exported from the SDK public surface.
 */
export function __resetHistoryInstrumentationForTests(): void {
  if (state) {
    state.listeners.clear();
  }
  uninstallIfEmpty();
}
