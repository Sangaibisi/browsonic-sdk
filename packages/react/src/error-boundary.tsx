// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicErrorBoundary — wires React's render-time error capture
 * (componentDidCatch) into the Browsonic SDK's `captureError`.
 *
 * Why this exists
 * ---------------
 * React's reconciler catches render exceptions before they bubble to
 * `window`. The plain `@browsonic/sdk` install therefore never hears
 * about render-time crashes — only event-handler / async errors that
 * reach the global error handlers. This boundary closes that gap.
 *
 * Boundaries do **not** catch errors in event handlers, async code, or
 * during server rendering. For those cases, use the SDK's
 * `captureError` directly (or the upcoming `useCaptureError` hook in
 * @browsonic/react 0.2).
 *
 * Defensive design
 * ----------------
 * - The SDK is invoked inside a try/catch — if reporting throws, the
 *   boundary still renders fallback. The host app must never crash
 *   because the telemetry pipeline failed.
 * - The component stack is truncated to 1024 chars before being
 *   forwarded as metadata, so a deeply-nested tree cannot inflate
 *   event payloads.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

/** Maximum length of the React component stack we forward as metadata. */
const MAX_COMPONENT_STACK_LENGTH = 1024;

/**
 * Fallback render strategy. Either a static React node, or a function
 * that receives the captured error plus a `reset()` callback that
 * clears the boundary's error state and re-renders the children.
 */
export type BrowsonicErrorBoundaryFallback =
  | ReactNode
  | ((error: Error, reset: () => void) => ReactNode);

export interface BrowsonicErrorBoundaryProps {
  /**
   * Browsonic SDK instance to report errors to. When omitted, the
   * boundary tries `window.Browsonic.getBrowsonic()` — the singleton
   * registered by the main entry of `@browsonic/sdk`. If neither is
   * available the boundary still renders fallback but no report is
   * sent.
   */
  sdk?: Browsonic;

  /**
   * What to render when a child throws during render. Either a static
   * element or a function `(error, reset) => ReactNode`.
   */
  fallback: BrowsonicErrorBoundaryFallback;

  /**
   * Called after the SDK has been notified (or attempted). Useful for
   * adding custom telemetry, navigating away, or showing a toast.
   */
  onError?: (error: Error, info: ErrorInfo) => void;

  /** Children to render normally. */
  children: ReactNode;
}

interface BrowsonicErrorBoundaryState {
  error: Error | null;
}

export class BrowsonicErrorBoundary extends Component<
  BrowsonicErrorBoundaryProps,
  BrowsonicErrorBoundaryState
> {
  state: BrowsonicErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BrowsonicErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const sdk = this.props.sdk ?? resolveSdk();
    if (sdk) {
      try {
        sdk.captureError(error);
        const componentStack = info.componentStack ?? '';
        if (componentStack.length > 0) {
          sdk.addMetadata('componentStack', componentStack.slice(0, MAX_COMPONENT_STACK_LENGTH));
        }
      } catch {
        // SDK reporting failures must never bubble. The boundary still
        // renders fallback — the host app continues uninterrupted.
      }
    }
    try {
      this.props.onError?.(error, info);
    } catch {
      // Same defensive contract for user-supplied onError.
    }
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error !== null) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(error, this.reset) : fallback;
    }
    return this.props.children;
  }
}
