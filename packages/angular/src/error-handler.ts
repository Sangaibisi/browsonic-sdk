// SPDX-License-Identifier: Apache-2.0

/**
 * `BrowsonicErrorHandler` — drop-in for Angular's `ErrorHandler`
 * provider. Angular's `ErrorHandler` is duck-typed by the framework
 * (only `handleError(error: unknown): void` is required), so this
 * class doesn't need to extend the runtime class — implementing the
 * shape is enough. Keeping it structural avoids importing the
 * runtime `ErrorHandler` class and pulling `@angular/core` into our
 * runtime graph.
 *
 * Wire it from your standalone `app.config.ts`:
 *
 * ```ts
 * import { ErrorHandler } from '@angular/core';
 * import { BrowsonicErrorHandler } from '@browsonic/angular';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     { provide: ErrorHandler, useClass: BrowsonicErrorHandler },
 *   ],
 * };
 * ```
 *
 * Or use the {@link provideBrowsonic} convenience factory.
 *
 * Defensive contract:
 * - `handleError` never throws — a thrown reporter cannot crash the
 *   Angular zone.
 * - Falls back to `console.error` when no SDK is reachable so the
 *   error is still visible in dev tools (Angular's default behaviour).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Browsonic } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

export interface BrowsonicErrorHandlerOptions {
  /**
   * Explicit SDK instance. When omitted, the handler resolves the
   * SDK from `window.Browsonic.getBrowsonic()` on every call (cheap
   * — the function returns the cached singleton).
   */
  sdk?: Browsonic;
  /**
   * Whether to fall back to `console.error` when the SDK is
   * unreachable. Default: `true`. Disable when your app already
   * intercepts console output and you don't want duplicate logs.
   */
  consoleFallback?: boolean;
}

export class BrowsonicErrorHandler {
  private readonly sdk?: Browsonic;
  private readonly consoleFallback: boolean;

  constructor(options: BrowsonicErrorHandlerOptions = {}) {
    if (options.sdk !== undefined) {
      this.sdk = options.sdk;
    }
    this.consoleFallback = options.consoleFallback ?? true;
  }

  /** Angular's `ErrorHandler.handleError` signature. */
  handleError(error: unknown): void {
    const sdk = resolveSdk(this.sdk);
    const errorObj = error instanceof Error ? error : new Error(String(error));

    if (sdk) {
      try {
        sdk.captureError(errorObj);
      } catch {
        // Defensive isolation — Angular's zone must not pick up our
        // reporter's throws.
      }
    }

    if (this.consoleFallback) {
      // Match Angular's default — keep the error visible in dev tools
      // even when the SDK is reachable, so the developer ergonomics
      // don't degrade compared to the framework default.
      try {
        console.error(errorObj);
      } catch {
        // ignore
      }
    }
  }
}
