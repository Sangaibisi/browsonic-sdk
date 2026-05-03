// SPDX-License-Identifier: Apache-2.0

/**
 * Event pipeline — the hot path from a collector / plugin emit to the
 * queue. Runs per event:
 *   - Critical Path gate
 *   - context collection (url, referrer, pageAge)
 *   - stack + message truncation
 *   - telemetry timeline snapshot (when `includeTelemetry`)
 *   - ignore rule match
 *   - `onError` user callback
 *   - plugin event observers (widget, exporters)
 *   - queue enqueue (fatal triggers instant flush inside the queue)
 *
 * The hot path is guarded by a single `safeExecute` so a bug in any
 * stage can't break the host app. Repeat internal errors arm the
 * circuit breaker via `handleInternalError`.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent, MetadataEntry } from '../types';
import { collectEventContext } from '../context';
import { safeExecute, truncate, truncateStack, cleanStackTrace, shouldIgnoreError } from '../utils';
import type { Browsonic } from './browsonic';

export function handleEvent(
  sdk: Browsonic,
  partialEvent: Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>
): void {
  if (sdk.state !== 'running') {
    sdk.diagnostics?.incDropped('state');
    return;
  }
  const config = sdk.config;
  const queue = sdk.queue;
  if (!config || !queue) return;

  // Critical Path gate — drop events whose level isn't whitelisted for
  // conversion-critical flows. One branch, <100μs, see §5.
  const cp = sdk.criticalPath;
  if (cp && !cp.captureOnly.includes(partialEvent.level)) {
    sdk.diagnostics?.incDropped('ignored');
    return;
  }

  const processStart =
    sdk.diagnostics && typeof performance !== 'undefined' ? performance.now() : 0;

  safeExecute(
    () => {
      const context = collectEventContext();

      const cleanedStack = cleanStackTrace(partialEvent.stack);
      const { stack, truncated: stackTruncated } = truncateStack(
        cleanedStack,
        config.maxStackFrames
      );
      const message = truncate(partialEvent.message, config.maxValueLength);

      const telemetry =
        config.includeTelemetry && sdk.telemetryStore ? sdk.telemetryStore.getTimeline() : null;

      const metadataEntries: MetadataEntry[] = Object.entries(sdk.metadata).map(([key, value]) => ({
        key,
        value: String(value),
      }));

      // Sprint 8 M1: snapshot contexts + extras at event-creation time.
      // Shallow copy is sufficient — `setContext` already shallow-copies
      // its input on write; `setExtra` stores by reference, but the
      // mutation contract is documented in user-metadata.ts.
      const hasContexts = Object.keys(sdk.contexts).length > 0;
      const hasExtras = Object.keys(sdk.extras).length > 0;

      const event: BrowsonicEvent = {
        ...partialEvent,
        message,
        stack,
        context,
        telemetry,
        metadata: metadataEntries.length > 0 ? metadataEntries : undefined,
        ...(hasContexts ? { contexts: { ...sdk.contexts } } : {}),
        ...(hasExtras ? { extras: { ...sdk.extras } } : {}),
        _truncated: stackTruncated || message !== partialEvent.message,
        // Sprint P14 (F3.2.B): tag events captured during an active
        // critical path window so the backend can group them by flow
        // (checkout / signup / payment). The gate above already
        // dropped non-whitelisted levels; everything that reaches here
        // was admitted with the cp context.
        ...(cp ? { _criticalPath: cp.reason } : {}),
      };

      if (shouldIgnoreError(event, config, sdk.debugLog)) {
        return;
      }

      if (config.onError) {
        const shouldReport = config.onError(event);
        if (shouldReport === false) {
          sdk.debugLog('Event suppressed by onError callback');
          return;
        }
      }

      // Notify plugin event observers (widget, tracing exporters, …).
      // Critical Path `suspendWidget` → skip plugin notifications;
      // queue below still carries the event to transport regardless.
      if (sdk.pluginEventHandlers.length > 0 && !(cp && cp.suspendWidget)) {
        for (const handler of sdk.pluginEventHandlers) {
          try {
            handler(event);
          } catch (err) {
            sdk.debugLog('Plugin event handler threw:', err);
          }
        }
      }

      queue.enqueue(event);
    },
    undefined,
    (error) => {
      sdk.debugLog('Event handling error:', error);
      handleInternalError(sdk);
    }
  );

  if (sdk.diagnostics) {
    const end = typeof performance !== 'undefined' ? performance.now() : 0;
    sdk.diagnostics.recordEventProcess(end - processStart);
  }
}

/**
 * Circuit breaker — after `maxInternalErrors` consecutive SDK-internal
 * failures the SDK pauses itself to avoid runaway error loops.
 */
export function handleInternalError(sdk: Browsonic): void {
  sdk.internalErrorCount++;
  sdk.diagnostics?.incInternalError();
  if (sdk.internalErrorCount >= sdk.maxInternalErrors) {
    sdk.debugLog('Too many internal errors, disabling SDK (circuit breaker)');
    sdk.pause();
  }
}
