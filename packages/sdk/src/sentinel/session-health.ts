// SPDX-License-Identifier: Apache-2.0

/**
 * Session health signal (Sprint 9 M2). A three-state state machine
 * that summarises whether the current page session has produced
 * errors:
 *
 *   - `'ok'`       — initial. No error / fatal events captured yet.
 *   - `'errored'`  — at least one `error` or `fatal` event has been
 *                    captured during this session. Recoverable
 *                    (the page is still alive).
 *   - `'crashed'`  — terminal. Set when the SDK's own circuit
 *                    breaker trips after repeated internal failures,
 *                    or when the host explicitly marks the session
 *                    crashed. Once crashed, a session never returns
 *                    to `'ok'` / `'errored'`.
 *
 * The transition is monotonic — `'crashed'` outranks `'errored'`,
 * which outranks `'ok'`. Each captured event is stamped with the
 * current session health at capture time so the backend can plot a
 * per-session timeline of state transitions.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { EventLevel } from '../types';

export type SessionHealth = 'ok' | 'errored' | 'crashed';

/**
 * Apply the session-health state machine to a captured event level.
 * Returns the next state. Pure function — does not mutate.
 *
 * Rules:
 * - `'crashed'` is terminal; stays.
 * - `'error'` or `'fatal'` event level upgrades `'ok'` → `'errored'`.
 *   `'errored'` stays `'errored'`.
 * - Any other level (`'info'`, `'warn'`) leaves the state untouched.
 */
export function transitionOnEvent(current: SessionHealth, level: EventLevel): SessionHealth {
  if (current === 'crashed') return 'crashed';
  if (level === 'error' || level === 'fatal') {
    return 'errored';
  }
  return current;
}

/**
 * Force the session into the terminal `'crashed'` state. Called by
 * the SDK's circuit breaker (`handleInternalError`) when repeated
 * internal failures arm the breaker, and by the public
 * `markSessionCrashed()` when the host wants to advertise an
 * unrecoverable failure to the backend.
 */
export function markCrashed(): SessionHealth {
  return 'crashed';
}

/**
 * Numeric severity for compare / sort. `'ok'` = 0, `'errored'` = 1,
 * `'crashed'` = 2. Useful when diffing the state across a batch of
 * events or aggregating across sessions on the backend.
 */
export function severity(state: SessionHealth): number {
  switch (state) {
    case 'ok':
      return 0;
    case 'errored':
      return 1;
    case 'crashed':
      return 2;
  }
}
