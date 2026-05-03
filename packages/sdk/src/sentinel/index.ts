// SPDX-License-Identifier: Apache-2.0

/**
 * Sentinel module barrel — exports the core `Browsonic` class plus the
 * singleton helpers used by every entry (core + main + CJS). The split
 * into per-concern modules happened in Sprint 8; this file keeps the
 * legacy `import { Browsonic } from '@browsonic/sdk/sentinel'`
 * path working while `browsonic.ts` stays small.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export { Browsonic } from './browsonic';

import { Browsonic } from './browsonic';

let instance: Browsonic | null = null;

/** Get the singleton Browsonic instance. */
export function getBrowsonic(): Browsonic {
  if (!instance) {
    instance = new Browsonic();
  }
  return instance;
}

/** Reset singleton (mainly for testing). */
export function resetBrowsonic(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

// 2.0: `Sentinel` / `getSentinel` / `resetSentinel` aliases removed.
// Use `Browsonic` / `getBrowsonic` / `resetBrowsonic` from this module.
