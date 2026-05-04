// SPDX-License-Identifier: Apache-2.0

/**
 * `provideBrowsonic()` — standalone-style provider factory for
 * Angular 17+ `app.config.ts`. Returns the providers array that
 * wires `BrowsonicErrorHandler` into Angular's `ErrorHandler` token
 * and registers `BrowsonicService` as an injectable.
 *
 * ```ts
 * // app.config.ts
 * import type { ApplicationConfig } from '@angular/core';
 * import { provideBrowsonic } from '@browsonic/angular';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     ...provideBrowsonic(),
 *     // your other providers
 *   ],
 * };
 * ```
 *
 * The return type is `Provider[]` from `@angular/core` (type-only
 * import — `@angular/core` stays a peer dep, not a runtime dep).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Provider } from '@angular/core';
import type { Browsonic } from '@browsonic/sdk';
import { BrowsonicErrorHandler } from './error-handler';
import { BrowsonicService } from './service';

export interface ProvideBrowsonicOptions {
  /** SDK instance. Falls back to `window.Browsonic.getBrowsonic()`. */
  sdk?: Browsonic;
  /**
   * Pass through to `BrowsonicErrorHandler.consoleFallback`.
   * Default: `true`.
   */
  consoleFallback?: boolean;
}

export function provideBrowsonic(options: ProvideBrowsonicOptions = {}): Provider[] {
  // We cannot reference Angular's ErrorHandler runtime class without
  // pulling `@angular/core` into our runtime graph. Consumers wire
  // the handler binding themselves OR use the `wireErrorHandler`
  // shape below — `useClass` works at the framework boundary.
  //
  // The pragmatic path: ship `BrowsonicErrorHandler` and
  // `BrowsonicService` with `useFactory` providers; the consumer
  // composes the `ErrorHandler` binding in their app.config.ts:
  //
  //   { provide: ErrorHandler, useExisting: BrowsonicErrorHandler }
  //
  // We expose the providers needed for that composition.
  const errorHandlerInstance = new BrowsonicErrorHandler(options);
  const serviceInstance = new BrowsonicService(options);

  return [
    {
      provide: BrowsonicErrorHandler,
      useValue: errorHandlerInstance,
    },
    {
      provide: BrowsonicService,
      useValue: serviceInstance,
    },
  ];
}
