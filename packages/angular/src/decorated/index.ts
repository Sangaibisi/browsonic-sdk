// SPDX-License-Identifier: Apache-2.0

/**
 * `@browsonic/angular/decorated` — opt-in entry point that depends on
 * `@angular/core` at runtime so it can ship decorated injectables
 * (`@Injectable({ providedIn: 'root' })`) and signal-based
 * composables. The default `@browsonic/angular` entry point stays
 * peer-only — `@angular/core` is type-only there — so the bundle
 * size for consumers who don't need decorators or signals is
 * unchanged.
 *
 * What ships here:
 *
 * - `BrowsonicDecoratedService` — the same surface as
 *   `BrowsonicService` from the main entry, but registered with
 *   `providedIn: 'root'` via the `@Injectable` decorator. Consumers
 *   no longer need to call `provideBrowsonic()` to get a singleton —
 *   `inject(BrowsonicDecoratedService)` works directly. The
 *   underlying behaviour is identical (defensive `try/catch`,
 *   no-op when SDK is unreachable).
 * - `provideBrowsonicUserSignal()` — Angular signals composable that
 *   bridges a `WritableSignal<UserContext | null>` to
 *   `sdk.setUser` / `sdk.clearUser`. Mirrors the Vue adapter's
 *   `useUser` pattern. The signal is stored in the DI tree under
 *   the `BROWSONIC_USER_SIGNAL` token so multiple components share
 *   one instance.
 *
 * Why a separate entry point:
 *
 * The main `@browsonic/angular` entry has `@angular/core` as a
 * type-only peer — the published bundle has zero `@angular/core`
 * imports at runtime. That keeps the install footprint small for
 * apps that wire providers manually. Decorators and signals
 * fundamentally need runtime `@angular/core` (`@Injectable`,
 * `signal`, `effect`, `inject`), so they live behind the explicit
 * `/decorated` import path. Consumers opt in by importing from
 * `@browsonic/angular/decorated` instead of `@browsonic/angular`.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import {
  Injectable,
  InjectionToken,
  signal,
  effect,
  inject,
  type Provider,
  type WritableSignal,
} from '@angular/core';
import type { Browsonic, UserContext } from '@browsonic/sdk';
import { resolveSdk } from '../resolve-sdk';
import { BrowsonicService } from '../service';

/**
 * Drop-in `BrowsonicService` registered as a tree-shakeable
 * `providedIn: 'root'` injectable. The class extends `BrowsonicService`
 * unchanged — the only difference is the `@Injectable` decorator, so
 * `inject(BrowsonicDecoratedService)` resolves without an explicit
 * provider in `app.config.ts`.
 *
 * @example
 * ```ts
 * import { Component, inject } from '@angular/core';
 * import { BrowsonicDecoratedService } from '@browsonic/angular/decorated';
 *
 * @Component({ ... })
 * export class HomeComponent {
 *   private readonly browsonic = inject(BrowsonicDecoratedService);
 * }
 * ```
 */
@Injectable({ providedIn: 'root' })
export class BrowsonicDecoratedService extends BrowsonicService {
  constructor() {
    // BrowsonicService's constructor accepts options with a default
    // of `{}`, so calling `super()` is enough — the parent falls
    // back to `window.Browsonic.getBrowsonic()` lookup at every
    // call site.
    super();
  }
}

/**
 * Injection token for the user signal. Multiple components inject
 * the same instance via `inject(BROWSONIC_USER_SIGNAL)`.
 */
export const BROWSONIC_USER_SIGNAL = new InjectionToken<WritableSignal<UserContext | null>>(
  'BROWSONIC_USER_SIGNAL',
);

export interface ProvideBrowsonicUserSignalOptions {
  /**
   * Initial user. `null` (default) means "no user" — the signal
   * starts in a cleared state and `sdk.setUser` only fires once the
   * consumer assigns a real value.
   */
  initial?: UserContext | null;
  /**
   * Override the SDK lookup. Defaults to
   * `window.Browsonic.getBrowsonic()` via `resolveSdk`. Useful in
   * tests where a fake SDK needs to be injected.
   */
  sdk?: Browsonic;
}

/**
 * Standalone provider factory that wires a `WritableSignal<UserContext | null>`
 * to the SDK's user context. Drop the result into your app's
 * providers; any component can then `inject(BROWSONIC_USER_SIGNAL)`,
 * call `.set(user)` or `.update(prev => …)`, and the SDK is updated
 * on the next effect tick.
 *
 * Setting the signal to `null` clears the SDK's user
 * (`sdk.setUser({})` — the SDK treats an empty object as "no user").
 *
 * @example
 * ```ts
 * // app.config.ts
 * import { provideBrowsonicUserSignal } from '@browsonic/angular/decorated';
 *
 * export const appConfig: ApplicationConfig = {
 *   providers: [
 *     ...provideBrowsonic({ sdk }),
 *     ...provideBrowsonicUserSignal({ initial: null }),
 *   ],
 * };
 *
 * // any component
 * import { Component, inject } from '@angular/core';
 * import { BROWSONIC_USER_SIGNAL } from '@browsonic/angular/decorated';
 *
 * @Component({ ... })
 * export class LoginComponent {
 *   private readonly user = inject(BROWSONIC_USER_SIGNAL);
 *   onLogin(profile: { id: string; email: string }) {
 *     this.user.set(profile);
 *   }
 * }
 * ```
 */
export function provideBrowsonicUserSignal(
  options: ProvideBrowsonicUserSignalOptions = {},
): Provider[] {
  return [
    {
      provide: BROWSONIC_USER_SIGNAL,
      useFactory: () => {
        const userSignal = signal<UserContext | null>(options.initial ?? null);

        // Tie the signal to the SDK's user context. Effects in
        // Angular run inside an injection context (the bootstrap
        // injector provides the change-detection scheduler), so
        // the factory call site here MUST be inside a real Angular
        // bootstrap — `bootstrapApplication` / `AppModule.providers`
        // both meet that contract. Manual `Injector.create` users
        // need to provide their own `ChangeDetectionScheduler` (or
        // `provideZonelessChangeDetection()`).
        //
        // The effect body is delegated to `applyUserToSdk` so unit
        // tests can exercise the SDK-write path without spinning up
        // a full Angular reactivity graph.
        effect(() => {
          const value = userSignal();
          const sdk = resolveSdk(options.sdk);
          if (!sdk) return;
          applyUserToSdk(value, sdk);
        });

        return userSignal;
      },
    },
  ];
}

/**
 * Test-friendly helper that applies a user-signal value to the SDK
 * with the same semantics as the effect inside
 * `provideBrowsonicUserSignal`: `null` clears the user, anything
 * else is forwarded to `sdk.setUser`. Wrapped in try/catch so
 * tests verify the same defensive contract the production effect
 * relies on.
 *
 * Public so consumers running custom signal pipelines (e.g. an
 * RxJS-bridged signal) can call the same shape.
 */
export function applyUserToSdk(value: UserContext | null, sdk: Browsonic): void {
  try {
    if (value === null) {
      sdk.setUser({});
    } else {
      sdk.setUser(value);
    }
  } catch {
    // Defensive isolation — never propagate out of the effect /
    // caller. The host app must not crash because reporting failed.
  }
}

/**
 * Lower-level helper for hand-rolled DI. Returns the user signal
 * for the current injection context. Equivalent to
 * `inject(BROWSONIC_USER_SIGNAL)` but importable from a single
 * symbol name across the adapter's surface.
 */
export function injectBrowsonicUserSignal(): WritableSignal<UserContext | null> {
  return inject(BROWSONIC_USER_SIGNAL);
}
