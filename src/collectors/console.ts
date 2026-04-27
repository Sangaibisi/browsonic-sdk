/**
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { EventLevel, EventType, BrowsonicEvent } from '../types';
import type { ConsoleTelemetryData } from '../telemetry';
import { uuid, timestamp, safeExecute } from '../utils';

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error';

interface ConsoleCollectorOptions {
  captureLevels: EventLevel[];
  onEvent: (event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>) => void;
  onTelemetry?: (data: ConsoleTelemetryData) => void;
  debugLog: (message: string, ...args: unknown[]) => void;
}

/**
 * Console interceptor - captures console.info, console.warn, console.error
 */
export function createConsoleCollector(options: ConsoleCollectorOptions) {
  const { captureLevels, onEvent, onTelemetry, debugLog } = options;

  // Store original methods
  const originalConsole: Record<ConsoleMethod, typeof console.log> = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };

  let isInstalled = false;

  // Console methods are naturally a subset of EventLevel (no 'fatal' is
  // reachable via console.*). We narrow the type so telemetry's
  // `ConsoleTelemetryData.level` enum (`'log' | 'debug' | ...`) keeps
  // accepting this mapping after 0.3.0 added 'fatal' to EventLevel.
  const methodToLevel: Record<ConsoleMethod, 'info' | 'warn' | 'error'> = {
    log: 'info',
    info: 'info',
    warn: 'warn',
    error: 'error',
  };

  const methodToType: Record<ConsoleMethod, EventType> = {
    log: 'console_info',
    info: 'console_info',
    warn: 'console_warn',
    error: 'console_error',
  };

  function formatArgs(args: unknown[]): string {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg instanceof Error) return arg.message;
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
  }

  function createInterceptor(method: ConsoleMethod) {
    return function (...args: unknown[]) {
      // Always call original first (fail-safe: user sees their logs)
      originalConsole[method].apply(console, args);

      const level = methodToLevel[method];

      // Safely process console call
      safeExecute(
        () => {
          const message = formatArgs(args);

          // Skip empty messages
          if (!message.trim()) return;

          // Get stack trace for error context
          let stack: string | null = null;
          if (method === 'error') {
            const errorArg = args.find((arg) => arg instanceof Error);
            if (errorArg instanceof Error && errorArg.stack) {
              stack = errorArg.stack;
            } else {
              // Create synthetic stack
              stack = new Error().stack?.split('\n').slice(2).join('\n') || null;
            }
          }

          // Always record to telemetry (regardless of captureLevels)
          if (onTelemetry) {
            onTelemetry({
              level: methodToLevel[method],
              message,
              stack,
            });
          }

          // Only emit as error event if level is in captureLevels
          if (!captureLevels.includes(level)) {
            return;
          }

          const event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'> = {
            eventId: uuid(),
            timestamp: timestamp(),
            type: methodToType[method],
            level,
            message,
            stack,
          };

          onEvent(event);
        },
        undefined,
        (error) => debugLog('Console collector error:', error)
      );
    };
  }

  function install() {
    if (isInstalled) return;

    safeExecute(
      () => {
        // Intercept console.log for telemetry only (not emitted as error event)
        console.log = createInterceptor('log');
        console.info = createInterceptor('info');
        console.warn = createInterceptor('warn');
        console.error = createInterceptor('error');
        isInstalled = true;
        debugLog('Console collector installed');
      },
      undefined,
      (error) => debugLog('Failed to install console collector:', error)
    );
  }

  function uninstall() {
    if (!isInstalled) return;

    safeExecute(
      () => {
        // Sprint P15 (F3.1.H): some Safari extensions + iframes mark
        // `console.log` as read-only; a plain `console.log = orig`
        // throws and we'd leak the SDK's wrapped method. Use
        // `Object.defineProperty` with `configurable: true` so the
        // restore succeeds even when the property descriptor is
        // locked down. typeof guard tolerates the edge case where the
        // original was itself replaced mid-session.
        restoreMethod('log', originalConsole.log);
        restoreMethod('info', originalConsole.info);
        restoreMethod('warn', originalConsole.warn);
        restoreMethod('error', originalConsole.error);
        isInstalled = false;
        debugLog('Console collector uninstalled');
      },
      undefined,
      (error) => debugLog('Failed to uninstall console collector:', error)
    );
  }

  function restoreMethod(method: ConsoleMethod, original: typeof console.log): void {
    if (typeof original !== 'function') {
      // Original was already non-function at install time; nothing to
      // do. Skip rather than replace with a junk value.
      return;
    }
    try {
      Object.defineProperty(console, method, {
        value: original,
        writable: true,
        configurable: true,
      });
    } catch {
      // Read-only console (rare: some browser extensions, locked-down
      // iframes). Falling back to plain assignment is no better — and
      // would throw again. Leaving the SDK's wrapper in place is the
      // lesser evil; the user's logs still reach the original via the
      // interceptor's `originalConsole[method].apply(...)` call.
    }
  }

  return {
    install,
    uninstall,
    isInstalled: () => isInstalled,
  };
}
