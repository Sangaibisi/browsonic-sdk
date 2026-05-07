// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { createConsoleCollector } from './console';

describe('console collector — debug method (Sprint 1, gap A3)', () => {
  let onEvent: Mock;
  let onTelemetry: Mock;
  let collector: ReturnType<typeof createConsoleCollector>;
  const originalDebug = console.debug;
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  beforeEach(() => {
    onEvent = vi.fn();
    onTelemetry = vi.fn();
    collector = createConsoleCollector({
      captureLevels: ['info', 'warn', 'error'],
      onEvent,
      onTelemetry,
      debugLog: () => undefined,
    });
    collector.install();
  });

  afterEach(() => {
    collector.uninstall();
    // Defensive: restore in case install/uninstall failed mid-test.
    console.debug = originalDebug;
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  });

  it('captures console.debug to telemetry with level "debug"', () => {
    console.debug('hydration step %s', 'cart');
    expect(onTelemetry).toHaveBeenCalledTimes(1);
    const entry = onTelemetry.mock.calls[0][0];
    expect(entry.level).toBe('debug');
    expect(entry.message).toContain('hydration step');
  });

  it('emits console_debug events at event level "info" so EventLevel stays narrow', () => {
    console.debug('boot');
    // captureLevels includes 'info', so the debug call surfaces as a
    // console_debug event at level 'info'.
    expect(onEvent).toHaveBeenCalledTimes(1);
    const event = onEvent.mock.calls[0][0];
    expect(event.type).toBe('console_debug');
    expect(event.level).toBe('info');
    expect(event.message).toBe('boot');
  });

  it('preserves original verb in telemetry for log vs info vs debug', () => {
    console.log('one');
    console.info('two');
    console.debug('three');
    const levels = onTelemetry.mock.calls.map((c) => c[0].level);
    expect(levels).toEqual(['log', 'info', 'debug']);
  });

  it('restores console.debug on uninstall', () => {
    expect(console.debug).not.toBe(originalDebug);
    collector.uninstall();
    expect(console.debug).toBe(originalDebug);
  });

  it('skips emission when info level is excluded from captureLevels', () => {
    collector.uninstall();
    onEvent.mockClear();
    onTelemetry.mockClear();
    const restricted = createConsoleCollector({
      captureLevels: ['error'],
      onEvent,
      onTelemetry,
      debugLog: () => undefined,
    });
    restricted.install();
    console.debug('quiet');
    // Telemetry always records (regardless of captureLevels).
    expect(onTelemetry).toHaveBeenCalledTimes(1);
    // But the SDK-event emission honours captureLevels.
    expect(onEvent).not.toHaveBeenCalled();
    restricted.uninstall();
  });
});
