/**
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { BrowsonicEvent } from '../types';
import { uuid, timestamp, safeExecute } from '../utils';
import { extractBindStack } from './callback';

interface ErrorCollectorOptions {
  onEvent: (event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>) => void;
  debugLog: (message: string, ...args: unknown[]) => void;
}

/**
 * Global error handler - captures window.onerror and unhandledrejection
 */
export function createErrorCollector(options: ErrorCollectorOptions) {
  const { onEvent, debugLog } = options;

  let isInstalled = false;
  let originalOnError: OnErrorEventHandler | null = null;
  let originalOnUnhandledRejection: ((event: PromiseRejectionEvent) => void) | null = null;

  function handleError(
    message: string | Event,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error
  ) {
    safeExecute(
      () => {
        const errorMessage =
          error?.message || (typeof message === 'string' ? message : 'Unknown error');

        const stack = error?.stack || (source ? `at ${source}:${lineno}:${colno}` : null);

        // Extract bindStack if present (from async callback wrapper)
        const { bindStack, bindTime } = extractBindStack(error);

        const event: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'> = {
          eventId: uuid(),
          timestamp: timestamp(),
          type: 'error',
          level: 'error',
          message: errorMessage,
          stack,
          bindStack,
          bindTime,
        };

        onEvent(event);
      },
      undefined,
      (err) => debugLog('Error collector handler error:', err)
    );

    // IMP-005: Call original handler safely with proper return type handling
    if (originalOnError) {
      try {
        const result = originalOnError(message, source, lineno, colno, error);
        // Ensure we return a boolean as expected by onerror contract
        return result === true ? true : false;
      } catch {
        // If original handler throws, don't propagate - just allow default handling
        return false;
      }
    }

    // Return false to allow default browser handling
    return false;
  }

  function handleUnhandledRejection(event: PromiseRejectionEvent) {
    safeExecute(
      () => {
        const reason = event.reason;
        let message: string;
        let stack: string | null = null;

        if (reason instanceof Error) {
          message = reason.message;
          stack = reason.stack || null;
        } else if (typeof reason === 'string') {
          message = reason;
        } else {
          try {
            message = JSON.stringify(reason);
          } catch {
            message = 'Unhandled promise rejection';
          }
        }

        // Extract bindStack if present (from async callback wrapper)
        const { bindStack, bindTime } = extractBindStack(reason);

        const browsonicEvent: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'> = {
          eventId: uuid(),
          timestamp: timestamp(),
          type: 'unhandledrejection',
          level: 'error',
          message,
          stack,
          bindStack,
          bindTime,
        };

        onEvent(browsonicEvent);
      },
      undefined,
      (err) => debugLog('Unhandled rejection handler error:', err)
    );

    // Call original handler if exists
    if (originalOnUnhandledRejection) {
      originalOnUnhandledRejection(event);
    }
  }

  function install() {
    if (isInstalled) return;
    if (typeof window === 'undefined') return;

    safeExecute(
      () => {
        // Save originals
        originalOnError = window.onerror;
        originalOnUnhandledRejection = window.onunhandledrejection as
          | ((event: PromiseRejectionEvent) => void)
          | null;

        // Install handlers
        window.onerror = handleError;
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        isInstalled = true;
        debugLog('Error collector installed');
      },
      undefined,
      (error) => debugLog('Failed to install error collector:', error)
    );
  }

  function uninstall() {
    if (!isInstalled) return;
    if (typeof window === 'undefined') return;

    safeExecute(
      () => {
        // Restore originals
        window.onerror = originalOnError;
        window.removeEventListener('unhandledrejection', handleUnhandledRejection);

        if (originalOnUnhandledRejection) {
          window.onunhandledrejection = originalOnUnhandledRejection;
        }

        originalOnError = null;
        originalOnUnhandledRejection = null;
        isInstalled = false;
        debugLog('Error collector uninstalled');
      },
      undefined,
      (error) => debugLog('Failed to uninstall error collector:', error)
    );
  }

  return {
    install,
    uninstall,
    isInstalled: () => isInstalled,
  };
}
