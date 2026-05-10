// SPDX-License-Identifier: Apache-2.0

/**
 * Critical Path mode — when the app is running a conversion-critical
 * flow (checkout, payment, signup), the SDK suspends breadcrumb
 * accumulation, skips widget UX, and drops non-whitelisted events at
 * the boundary for minimum overhead.
 *
 * See PERFORMANCE-STRATEGY.md §5.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { CriticalPathOptions } from '../types';
import { safeExecute } from '../utils';
import type { Browsonic } from './browsonic';

/**
 * Enter Critical Path mode. Calling again while already inside
 * replaces the options and resets the auto-exit timer. If
 * `autoExitMs` elapses without `exitCriticalPath()`, the SDK auto-
 * exits to prevent a forgotten lockout.
 */
export function enterCriticalPath(sdk: Browsonic, options: CriticalPathOptions): void {
  if (sdk.state === 'destroyed' || sdk.state === 'uninitialized') return;

  safeExecute(
    () => {
      const suspendTelemetry = options.suspendTelemetry !== false;
      const suspendWidget = options.suspendWidget !== false;
      const captureOnly = options.captureOnly ?? ['error'];
      const autoExitMs = typeof options.autoExitMs === 'number' ? options.autoExitMs : 300_000;

      sdk.criticalPath = {
        reason: String(options.reason || 'unspecified'),
        suspendTelemetry,
        suspendWidget,
        captureOnly,
        enteredAt: Date.now(),
      };

      if (suspendTelemetry) {
        sdk.telemetryStore?.pause();
      }

      if (sdk.criticalPathAutoExitTimer) {
        clearTimeout(sdk.criticalPathAutoExitTimer);
        sdk.criticalPathAutoExitTimer = null;
      }
      if (autoExitMs > 0) {
        sdk.criticalPathAutoExitTimer = setTimeout(() => {
          sdk.debugLog('Critical Path auto-exit triggered after', autoExitMs, 'ms');
          exitCriticalPath(sdk);
        }, autoExitMs);
      }

      sdk.debugLog(
        `Critical Path entered: reason=${sdk.criticalPath.reason}, ` +
          `captureOnly=[${captureOnly.join(',')}]`
      );
    },
    undefined,
    (error) => sdk.debugLog('enterCriticalPath error:', error)
  );
}

/** Idempotent — safe to call when not in critical path. */
export function exitCriticalPath(sdk: Browsonic): void {
  safeExecute(
    () => {
      if (!sdk.criticalPath) return;
      const elapsed = Date.now() - sdk.criticalPath.enteredAt;
      const reason = sdk.criticalPath.reason;

      if (sdk.criticalPath.suspendTelemetry) {
        sdk.telemetryStore?.resume();
      }

      sdk.criticalPath = null;
      if (sdk.criticalPathAutoExitTimer) {
        clearTimeout(sdk.criticalPathAutoExitTimer);
        sdk.criticalPathAutoExitTimer = null;
      }

      sdk.debugLog(`Critical Path exited: reason=${reason}, duration=${elapsed}ms`);
    },
    undefined,
    (error) => sdk.debugLog('exitCriticalPath error:', error)
  );
}
