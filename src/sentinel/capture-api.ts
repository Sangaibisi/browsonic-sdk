// SPDX-License-Identifier: Apache-2.0

/**
 * Public manual-capture API — `captureMessage` / `captureError` — plus
 * the pre-bootstrap buffer that holds events while the SDK is in the
 * `initializing` state (between sync `init()` and the idle-scheduled
 * bootstrap). See PERFORMANS-STRATEJISI.md §6.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent } from '../types';
import { uuid, timestamp, safeExecute } from '../utils';
import type { Browsonic } from './browsonic';
import { handleEvent } from './event-pipeline';

type PartialEvent = Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>;

export function captureMessage(
  sdk: Browsonic,
  message: string,
  level: 'info' | 'warn' | 'error' | 'fatal' = 'info'
): void {
  if (sdk.state === 'uninitialized' || sdk.state === 'destroyed') return;

  safeExecute(
    () => {
      const partial: PartialEvent = {
        eventId: uuid(),
        timestamp: timestamp(),
        type:
          level === 'fatal'
            ? 'fatal'
            : level === 'error'
              ? 'console_error'
              : level === 'warn'
                ? 'console_warn'
                : 'console_info',
        level,
        message,
        stack: null,
      };

      if (sdk.state === 'initializing') {
        bufferPreBootstrap(sdk, partial);
        return;
      }
      handleEvent(sdk, partial);
    },
    undefined,
    (error) => sdk.debugLog('captureMessage error:', error)
  );
}

export function captureError(sdk: Browsonic, error: Error): void {
  if (sdk.state === 'uninitialized' || sdk.state === 'destroyed') return;

  safeExecute(
    () => {
      const partial: PartialEvent = {
        eventId: uuid(),
        timestamp: timestamp(),
        type: 'error',
        level: 'error',
        message: error.message,
        stack: error.stack || null,
      };

      if (sdk.state === 'initializing') {
        bufferPreBootstrap(sdk, partial);
        return;
      }
      handleEvent(sdk, partial);
    },
    undefined,
    (err) => sdk.debugLog('captureError error:', err)
  );
}

/** Push into bounded buffer (drop oldest when full). */
export function bufferPreBootstrap(sdk: Browsonic, partial: PartialEvent): void {
  if (sdk.preBootstrapBuffer.length >= sdk.preBootstrapBufferCap) {
    sdk.preBootstrapBuffer.shift();
  }
  sdk.preBootstrapBuffer.push(partial);
}

/** Replay buffered events once bootstrap reaches `running`. */
export function replayPreBootstrapBuffer(sdk: Browsonic): void {
  const buffered = sdk.preBootstrapBuffer;
  sdk.preBootstrapBuffer = [];
  for (const partial of buffered) {
    handleEvent(sdk, partial);
  }
}
