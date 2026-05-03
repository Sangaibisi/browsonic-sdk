// SPDX-License-Identifier: Apache-2.0

/**
 * Vue `provide` / `inject` key for the Browsonic SDK instance.
 *
 * The plugin (`browsonicPlugin`) provides the SDK under this key so
 * `useBrowsonic()` can pick it up via Composition API. We export a
 * Symbol-based InjectionKey so consumers (or app authors mixing in
 * their own DI layer) can hand-provide / hand-inject without going
 * through the plugin if they want to.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { InjectionKey } from 'vue';
import type { Browsonic } from '@browsonic/sdk';

export const browsonicInjectionKey: InjectionKey<Browsonic> = Symbol('browsonic.sdk');
