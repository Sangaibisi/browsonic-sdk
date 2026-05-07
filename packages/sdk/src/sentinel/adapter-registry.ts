// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Adapter registry (Sprint 2 / gap B3).
 *
 * Module-level singleton recording which framework adapter (if any)
 * bootstrapped the SDK. Stamped on every batch (`EventBatch.adapter`)
 * and on the diagnostics payload so the dashboard's
 * `<AdapterBreakdownTable>` can render fleet composition.
 *
 * Why module singleton vs per-instance: adapter packages register
 * themselves at their entry-point (typically the framework's
 * `setup()` / `provideBrowsonic()` / `BrowsonicErrorBoundary` mount).
 * Adapter identity is global to the page, not to a Browsonic
 * instance. The same Browsonic singleton is shared across the whole
 * page anyway (see `getBrowsonic()`).
 *
 * Thread-safety: browser is single-threaded; multi-adapter scenarios
 * (rare — vendor-bundled SDK + framework adapter) get the
 * last-registered adapter as the effective identity. `clear()` exists
 * for tests; production code never calls it.
 */

import type { AdapterIdentity } from '../types';

let current: AdapterIdentity | null = null;

/**
 * Record this adapter as the active framework wrapper. Adapter
 * packages MUST call this before the host's `browsonic.init()` so the
 * first batch carries the right identity. Called twice → the latter
 * wins; we deliberately don't warn since dynamic re-registration is
 * legitimate during HMR.
 */
export function registerAdapter(adapter: AdapterIdentity): void {
  current = { name: adapter.name, version: adapter.version };
}

/**
 * Read the active adapter identity. Returns `null` when the SDK is
 * embedded directly without a framework wrapper (vanilla TS / JS).
 * Callers in the queue + diagnostics paths use this to decide whether
 * to attach the `adapter` field on the wire payload.
 */
export function getAdapter(): AdapterIdentity | null {
  return current ? { name: current.name, version: current.version } : null;
}

/**
 * Test-only escape hatch. Production code should never call this —
 * adapter identity should be stable for the lifetime of the page.
 */
export function _resetAdapterRegistryForTests(): void {
  current = null;
}
