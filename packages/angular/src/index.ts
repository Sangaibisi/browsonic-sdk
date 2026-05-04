// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/angular` — Angular adapter for `@browsonic/sdk`.
 *
 * Public surface (0.1):
 * - `BrowsonicErrorHandler` — drop-in for Angular's `ErrorHandler`
 *   provider. Implements the framework's duck-typed shape;
 *   `useClass: BrowsonicErrorHandler` (or `useExisting` via the
 *   factory) wires it into `ErrorHandler`.
 * - `BrowsonicService` — injectable wrapper around the SDK with
 *   `setUser` / `clearUser` / `captureError` / `captureMessage` /
 *   `addBreadcrumb` / `setTag` defensive helpers.
 * - `provideBrowsonic(options?)` — standalone-style provider
 *   factory for Angular 17+ `app.config.ts`.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export { BrowsonicErrorHandler, type BrowsonicErrorHandlerOptions } from './error-handler';
export { BrowsonicService, type BrowsonicServiceOptions } from './service';
export { provideBrowsonic, type ProvideBrowsonicOptions } from './provide';
export { resolveSdk } from './resolve-sdk';
