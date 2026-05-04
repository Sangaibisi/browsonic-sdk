// SPDX-License-Identifier: Apache-2.0

/**
 * `BrowsonicService` — Injectable wrapper around `@browsonic/sdk`
 * for use anywhere in an Angular component / service / directive.
 * Keeps the SDK call-site idiomatic Angular: `inject(BrowsonicService)`
 * + `service.captureError(...)`.
 *
 * The service is a plain TypeScript class with no Angular runtime
 * decorators — Angular's `Injectable` shape is duck-typed at the
 * provider boundary, so wrapping the class in `{ provide: ..., useClass: ... }`
 * (or via {@link provideBrowsonic}) makes it injectable. This keeps
 * `@angular/core` out of the package's runtime graph; the host app
 * already has it.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Breadcrumb, Browsonic, UserContext } from '@browsonic/sdk';
import { resolveSdk } from './resolve-sdk';

export interface BrowsonicServiceOptions {
  /** Explicit SDK instance. Falls back to window singleton lookup. */
  sdk?: Browsonic;
}

export class BrowsonicService {
  private readonly explicitSdk?: Browsonic;

  constructor(options: BrowsonicServiceOptions = {}) {
    if (options.sdk !== undefined) {
      this.explicitSdk = options.sdk;
    }
  }

  /** Resolve the active SDK, or `null` when unreachable. */
  getSdk(): Browsonic | null {
    return resolveSdk(this.explicitSdk);
  }

  setUser(user: UserContext): void {
    const sdk = this.getSdk();
    if (!sdk) return;
    try {
      sdk.setUser(user);
    } catch {
      // Defensive isolation — same contract as the boundary.
    }
  }

  clearUser(): void {
    const sdk = this.getSdk();
    if (!sdk) return;
    try {
      sdk.clearUser();
    } catch {
      // Defensive isolation.
    }
  }

  captureError(error: Error): void {
    const sdk = this.getSdk();
    if (!sdk) return;
    try {
      sdk.captureError(error);
    } catch {
      // Defensive isolation.
    }
  }

  captureMessage(message: string, level: 'info' | 'warn' | 'error' | 'fatal' = 'info'): void {
    const sdk = this.getSdk();
    if (!sdk) return;
    try {
      sdk.captureMessage(message, level);
    } catch {
      // Defensive isolation.
    }
  }

  addBreadcrumb(breadcrumb: Breadcrumb): void {
    const sdk = this.getSdk();
    if (!sdk) return;
    try {
      sdk.addBreadcrumb(breadcrumb);
    } catch {
      // Defensive isolation.
    }
  }

  setTag(key: string, value: string | number | boolean): void {
    const sdk = this.getSdk();
    if (!sdk) return;
    try {
      sdk.setTag(key, value);
    } catch {
      // Defensive isolation.
    }
  }
}
