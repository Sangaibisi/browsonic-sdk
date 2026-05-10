// SPDX-License-Identifier: Apache-2.0

/**
 * Lifecycle — `init()` fast path (sync config resolve + state flip);
 * `start()` awaiter; idle-scheduled `runBootstrap()` that builds the
 * session id, telemetry store, queue, and activates plugins; and
 * `destroy()` teardown with plugin deactivate + queue destroy.
 *
 * See PERFORMANCE-STRATEGY.md §1 (init blocking p95 ≤ 15 ms) and §6
 * (pre-bootstrap buffer for capture-before-running events).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicConfig } from '../types';
import { validateConfig, resolveConfig, createDebugLogger } from '../config';
import { fetchAppConfig, loadCachedAppConfig, saveCachedAppConfig } from '../config/server-config';
import { createEventQueue } from '../queue';
import { createTelemetryStore } from '../telemetry';
import { createDiagnosticsStore, createDiagnosticsReporter } from '../diagnostics';
import { getOrCreateSessionId, safeExecute } from '../utils';
// Sprint 9 M1 — runtime environment guards
import { isExtensionContext, isBotUserAgent } from '../utils/runtime-environment';
import type { Browsonic } from './browsonic';
import { activatePlugins, deactivatePlugins } from './plugins';
import { handleEvent, handleInternalError } from './event-pipeline';
import { replayPreBootstrapBuffer } from './capture-api';
import { SDK_NAME, SDK_VERSION } from './metadata';

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Sync init fast path. Returns `true` once the SDK enters the
 * `initializing` state; heavy work (queue creation, plugin activate)
 * runs asynchronously during the next idle window. Await completion
 * via `sdk.start()`.
 */
export function runInit(sdk: Browsonic, config: BrowsonicConfig): boolean {
  return safeExecute(
    () => {
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.error('[Browsonic] Invalid config:', validation.errors);
        return false;
      }

      if (sdk.state === 'running' || sdk.state === 'initializing') {
        console.warn('[Browsonic] Already initialized. Call destroy() first.');
        return false;
      }

      // Sprint 9 M1 — runtime environment guards. Refuse to initialise
      // inside browser-extension contexts or under known bot user
      // agents so we don't pollute the host's ingest endpoint with
      // off-domain telemetry. Both checks are opt-out via config.
      if (config.abortInExtensionContext !== false && isExtensionContext()) {
        console.warn(
          '[Browsonic] Browser extension context detected — init aborted (set abortInExtensionContext: false to override).'
        );
        return false;
      }
      if (config.abortForBots !== false && isBotUserAgent(undefined, config.botPatterns)) {
        console.warn(
          '[Browsonic] Bot user agent detected — init aborted (set abortForBots: false to override).'
        );
        return false;
      }

      sdk.rawConfig = config;
      sdk.config = resolveConfig(config);
      sdk.debugLog = createDebugLogger(sdk.config);
      sdk.debugLog('Initializing SDK (sync phase)');

      sdk.state = 'initializing';
      sdk.preBootstrapBuffer = [];
      sdk.initStartedAt = now();

      scheduleBootstrap(sdk);
      return true;
    },
    false,
    (error) => {
      console.error('[Browsonic] Init error:', error);
      handleInternalError(sdk);
    }
  );
}

export function runStart(sdk: Browsonic): Promise<boolean> {
  if (sdk.state === 'running') return Promise.resolve(true);
  if (sdk.state === 'uninitialized' || sdk.state === 'destroyed') {
    return Promise.resolve(false);
  }
  if (sdk.state === 'paused') return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    sdk.bootstrapDoneResolvers.push(resolve);
  });
}

/** Schedule the deferred bootstrap work; falls back to setTimeout(0). */
export function scheduleBootstrap(sdk: Browsonic): void {
  const run = () => runBootstrap(sdk);

  const g = globalThis as typeof globalThis & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

  if (typeof g.requestIdleCallback === 'function') {
    const handle = g.requestIdleCallback(run, { timeout: 2000 });
    sdk.bootstrapHandle = {
      cancel: () => g.cancelIdleCallback?.(handle),
    };
  } else {
    const handle = setTimeout(run, 0);
    sdk.bootstrapHandle = {
      cancel: () => clearTimeout(handle),
    };
  }
}

/**
 * Deferred init — session id, telemetry store, queue, plugin activate,
 * state transition to `running`, and replay of any events captured in
 * the pre-bootstrap window.
 */
export function runBootstrap(sdk: Browsonic): void {
  sdk.bootstrapHandle = null;

  if (sdk.state !== 'initializing' || !sdk.config) return;
  const config = sdk.config;

  safeExecute(
    () => {
      sdk.sessionId = getOrCreateSessionId();
      sdk.debugLog('Session ID:', sdk.sessionId);

      // Sprint 40 — server-driven sample rate. If a cached snapshot
      // exists from a previous session it wins over the host-supplied
      // default *for the sampling decision below*. The fresh fetch
      // below settles asynchronously and updates the cache for the
      // *next* session — mid-session decision stays frozen so
      // head-based sampling semantics are preserved (a single session
      // is wholly sampled-in or wholly sampled-out).
      const cached = loadCachedAppConfig(config.appKey);
      if (cached) {
        config.sampleRate = cached.sampleRate;
        sdk.debugLog(`Using cached sample rate: ${cached.sampleRate}`);
      }

      sdk.sessionSampled = Math.random() < config.sampleRate;
      sdk.debugLog(`Session sampled: ${sdk.sessionSampled} (rate: ${config.sampleRate})`);

      // Kick off the fresh fetch asynchronously. The result lands in
      // localStorage so the next session picks it up; if the response
      // arrives during this session the queue's push-header path
      // applies it to the live config (used by stamping sample-rate
      // on every emitted batch).
      void fetchAppConfig({
        apiEndpoint: config.apiEndpoint,
        appKey: config.appKey,
        apiKey: config.apiKey ?? undefined,
      }).then((fresh) => {
        if (!fresh) return;
        saveCachedAppConfig(config.appKey, fresh);
        if (Math.abs(fresh.sampleRate - config.sampleRate) > 1e-4) {
          try {
            sdk.updateConfig({ sampleRate: fresh.sampleRate });
            sdk.debugLog(
              `Cold-start sample rate refresh: ${config.sampleRate.toFixed(4)} → ${fresh.sampleRate.toFixed(4)}`
            );
          } catch (err) {
            sdk.debugLog('Failed to apply fresh sample rate', err);
          }
        }
      });

      sdk.telemetryStore = createTelemetryStore(config.maxTelemetryEntries);

      if (config.internalDiagnostics) {
        sdk.diagnostics = createDiagnosticsStore();
        sdk.diagnosticsReporter = createDiagnosticsReporter({
          config,
          store: sdk.diagnostics,
          getSessionId: () => sdk.sessionId,
          sdkName: SDK_NAME,
          sdkVersion: SDK_VERSION,
          debugLog: sdk.debugLog,
        });
      }

      sdk.queue = createEventQueue({
        config,
        debugLog: sdk.debugLog,
        getSessionId: () => sdk.sessionId,
        getUser: () => sdk.user,
        getSessionSampled: () => sdk.sessionSampled,
        sdkName: SDK_NAME,
        sdkVersion: SDK_VERSION,
        diagnostics: sdk.diagnostics,
        // Sprint 40 — push-update path. The ingest response carries
        // the operator-set sample rate; queue forwards it here so we
        // can mutate the running config without polling. Mid-session
        // `sessionSampled` decision stays frozen — a rate change
        // takes effect on the next session, matching head-based
        // sampling semantics.
        onSampleRateChange: (rate) => {
          try {
            sdk.updateConfig({ sampleRate: rate });
            saveCachedAppConfig(config.appKey, {
              sampleRate: rate,
              configVersion: 1,
              fetchedAt: Date.now(),
            });
          } catch (err) {
            sdk.debugLog('Failed to apply pushed sample rate', err);
          }
        },
      });

      activatePlugins(sdk);

      sdk.state = 'running';
      sdk.debugLog('SDK bootstrap complete — state: running');

      if (sdk.diagnostics && sdk.initStartedAt !== null) {
        sdk.diagnostics.recordInit(now() - sdk.initStartedAt);
      }
      sdk.diagnosticsReporter?.start();

      replayPreBootstrapBuffer(sdk);

      const resolvers = sdk.bootstrapDoneResolvers;
      sdk.bootstrapDoneResolvers = [];
      for (const r of resolvers) r(true);
    },
    undefined,
    (error) => {
      console.error('[Browsonic] Bootstrap error:', error);
      handleInternalError(sdk);
      const resolvers = sdk.bootstrapDoneResolvers;
      sdk.bootstrapDoneResolvers = [];
      for (const r of resolvers) r(false);
    }
  );
}

/**
 * Tear down the SDK — cancel pending bootstrap, deactivate plugins,
 * destroy queue, clear Critical Path state. Plugin registrations are
 * retained so `init()` can be called again on the same instance.
 */
export function destroy(sdk: Browsonic): void {
  safeExecute(
    () => {
      sdk.debugLog('Destroying SDK');

      if (sdk.bootstrapHandle) {
        sdk.bootstrapHandle.cancel();
        sdk.bootstrapHandle = null;
      }
      const pending = sdk.bootstrapDoneResolvers;
      sdk.bootstrapDoneResolvers = [];
      for (const r of pending) r(false);

      deactivatePlugins(sdk);

      // Drain + stop diagnostics reporter before queue destroy so a
      // final report carries in-flight samples.
      if (sdk.diagnosticsReporter) {
        void sdk.diagnosticsReporter.flushNow();
        sdk.diagnosticsReporter.stop();
        sdk.diagnosticsReporter = null;
      }
      sdk.diagnostics = null;

      sdk.queue?.destroy();

      if (sdk.criticalPathAutoExitTimer) {
        clearTimeout(sdk.criticalPathAutoExitTimer);
        sdk.criticalPathAutoExitTimer = null;
      }
      sdk.criticalPath = null;

      sdk.config = null;
      sdk.rawConfig = null;
      sdk.queue = null;
      sdk.telemetryStore = null;
      sdk.user = null;
      sdk.metadata = {};
      sdk.preBootstrapBuffer = [];
      sdk.internalErrorCount = 0;
      sdk.state = 'destroyed';

      sdk.debugLog('SDK destroyed');
    },
    undefined,
    (error) => console.error('[Browsonic] Destroy error:', error)
  );
}

/** Re-route `handleEvent` external binding (used by collector callbacks
 * pre-Sprint 7; kept for backwards internal use). */
export { handleEvent };
