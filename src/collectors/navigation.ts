/**
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { NavigationTelemetryData } from '../telemetry';
import { safeExecute } from '../utils';
import { subscribeToHistoryChanges } from './history-instrumentation';

interface NavigationCollectorOptions {
  onTelemetry: (data: NavigationTelemetryData) => void;
  debugLog: (message: string, ...args: unknown[]) => void;
}

/**
 * Navigation collector — tracks SPA route changes via the shared history
 * instrumentation module. Does NOT wrap history methods directly; see
 * collectors/history-instrumentation.ts for rationale (TEKNIK-IYILESTIRME-PLANI §1.4).
 */
export function createNavigationCollector(options: NavigationCollectorOptions) {
  const { onTelemetry, debugLog } = options;

  let isInstalled = false;
  let unsubscribe: (() => void) | null = null;

  function install() {
    if (isInstalled) return;
    if (typeof window === 'undefined') return;

    safeExecute(
      () => {
        unsubscribe = subscribeToHistoryChanges((evt) => {
          onTelemetry({
            from: evt.from,
            to: evt.to,
            type: evt.type,
          });
          debugLog(`Navigation: ${evt.type} from ${evt.from} to ${evt.to}`);
        });
        isInstalled = true;
        debugLog('Navigation collector installed');
      },
      undefined,
      (error) => debugLog('Failed to install navigation collector:', error)
    );
  }

  function uninstall() {
    if (!isInstalled) return;

    safeExecute(
      () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        isInstalled = false;
        debugLog('Navigation collector uninstalled');
      },
      undefined,
      (error) => debugLog('Failed to uninstall navigation collector:', error)
    );
  }

  return {
    install,
    uninstall,
    isInstalled: () => isInstalled,
  };
}
