// SPDX-License-Identifier: Apache-2.0

/**
 * Breadcrumb helpers (Sprint 8 M2). The public `addBreadcrumb` surface
 * forwards user-supplied breadcrumb entries into the SDK's existing
 * `TelemetryStore` ring buffer under a dedicated `'breadcrumb'` category.
 * The store already owns ordering, capacity, and pause/resume semantics,
 * so this module is a thin defaults + safe-execute wrapper.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { Breadcrumb } from '../types';
import { safeExecute } from '../utils';
import type { Browsonic } from './browsonic';

/**
 * Append a breadcrumb to the telemetry timeline. No-op when the SDK is
 * not yet running (telemetryStore null) or when the store is paused
 * (Critical Path mode). Default `level` is `'info'`; default `timestamp`
 * is filled by the store (`new Date().toISOString()`).
 */
export function addBreadcrumb(sdk: Browsonic, breadcrumb: Breadcrumb): void {
  safeExecute(
    () => {
      const store = sdk.telemetryStore;
      if (!store) return;

      store.add({
        category: 'breadcrumb',
        data: {
          category: breadcrumb.category,
          level: breadcrumb.level ?? 'info',
          ...(breadcrumb.message !== undefined ? { message: breadcrumb.message } : {}),
          ...(breadcrumb.data !== undefined ? { data: breadcrumb.data } : {}),
        },
      });
      sdk.debugLog(`Breadcrumb added: ${breadcrumb.category}`);
    },
    undefined,
    (error) => sdk.debugLog('addBreadcrumb error:', error)
  );
}
