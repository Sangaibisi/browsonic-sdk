// SPDX-License-Identifier: Apache-2.0

/**
 * Browsonic — core SDK class. Since Sprint 8 the class is a thin
 * façade: state fields live here, but the business logic for each
 * surface (init/start/destroy, event pipeline, capture API, critical
 * path, user metadata, plugin lifecycle) lives in a sibling module.
 * Class methods are delegations so the public API is a single shape.
 *
 * State fields are marked `@internal`; they are technically `public`
 * for cross-module access, but are NOT part of the supported SDK API.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 *
 */

import type {
  BrowsonicConfig,
  BrowsonicEvent,
  UserContext,
  ResolvedConfig,
  SdkState,
  CriticalPathOptions,
  CriticalPathState,
} from '../types';
import { resolveConfig, mergeConfigUpdate } from '../config';
import { wrapForAsyncStack } from '../collectors/wrap';
import { createEventQueue } from '../queue';
import type { TelemetryStore } from '../telemetry';
import type { SdkPlugin } from '../plugin';
import type { DiagnosticsStore, DiagnosticsReporter } from '../diagnostics';
import { safeExecute } from '../utils';

import { registerPlugin } from './plugins';
import { runInit, runStart, destroy } from './lifecycle';
import { handleEvent } from './event-pipeline';
import {
  captureMessage as captureMessageImpl,
  captureError as captureErrorImpl,
} from './capture-api';
import {
  setUser as setUserImpl,
  clearUser as clearUserImpl,
  addMetadata as addMetadataImpl,
  removeMetadata as removeMetadataImpl,
  clearMetadata as clearMetadataImpl,
} from './user-metadata';
import {
  enterCriticalPath as enterCriticalPathImpl,
  exitCriticalPath as exitCriticalPathImpl,
} from './critical-path';

type PartialEvent = Omit<BrowsonicEvent, 'context' | 'telemetry' | 'metadata'>;

export class Browsonic {
  /** @internal */ config: ResolvedConfig | null = null;
  /** @internal Raw user-provided config, kept for correct deep-merge in updateConfig. */
  rawConfig: BrowsonicConfig | null = null;
  /** @internal */ state: SdkState = 'uninitialized';
  /** @internal */ sessionId: string = '';
  /** @internal */ user: UserContext | null = null;
  /** @internal */ debugLog: (message: string, ...args: unknown[]) => void = () => {};
  /** @internal Head-based session sampling decision, computed once per `init()`. */
  sessionSampled: boolean = true;
  /** @internal Critical Path state — null means normal operation. */
  criticalPath: CriticalPathState | null = null;
  /** @internal */ criticalPathAutoExitTimer: ReturnType<typeof setTimeout> | null = null;
  /** @internal Buffer for events captured via public API during 'initializing' state. */
  preBootstrapBuffer: PartialEvent[] = [];
  /** @internal */ readonly preBootstrapBufferCap = 50;
  /** @internal Resolvers awaiting bootstrap completion. */
  bootstrapDoneResolvers: Array<(ok: boolean) => void> = [];
  /** @internal Handle to the scheduled bootstrap task. */
  bootstrapHandle: { cancel: () => void } | null = null;
  /** @internal Registered plugins — activated during bootstrap. */
  plugins: SdkPlugin[] = [];
  /** @internal Plugin event observers registered via `ctx.onEvent`. */
  pluginEventHandlers: Array<(event: BrowsonicEvent) => void> = [];
  /** @internal */ queue: ReturnType<typeof createEventQueue> | null = null;
  /** @internal */ telemetryStore: TelemetryStore | null = null;
  /** @internal Self-diagnostics store; null unless `internalDiagnostics: true`. */
  diagnostics: DiagnosticsStore | null = null;
  /** @internal Self-diagnostics reporter (periodic POST). */
  diagnosticsReporter: DiagnosticsReporter | null = null;
  /** @internal Timestamp of the sync init() call — used for init_duration_ms. */
  initStartedAt: number | null = null;
  /** @internal */ internalErrorCount = 0;
  /** @internal */ readonly maxInternalErrors = 5;
  /** @internal Custom user-set metadata key→value entries. */
  metadata: Record<string, string | number | boolean> = {};

  /**
   * Register a plugin with the SDK. MUST be called before `init()`.
   * See `src/plugin.ts` for the contract.
   */
  register(plugin: SdkPlugin): void {
    registerPlugin(this, plugin);
  }

  /** Initialize the SDK (sync fast path — heavy work deferred to idle). */
  init(config: BrowsonicConfig): boolean {
    return runInit(this, config);
  }

  /** Await the SDK transitioning from `initializing` to `running`. */
  start(): Promise<boolean> {
    return runStart(this);
  }

  /**
   * Handle an event emitted by a collector/plugin. Kept as a method
   * so collector code that closes over `sdk.handleEvent.bind(sdk)`
   * continues to resolve through the class.
   */
  handleEvent(partial: PartialEvent): void {
    handleEvent(this, partial);
  }

  /** Manually capture a log-style message. Buffered if called during
   * the `initializing` window; replayed on bootstrap complete. */
  captureMessage(message: string, level: 'info' | 'warn' | 'error' | 'fatal' = 'info'): void {
    captureMessageImpl(this, message, level);
  }

  /** Manually capture an Error. Buffered during init window. */
  captureError(error: Error): void {
    captureErrorImpl(this, error);
  }

  setUser(user: UserContext): void {
    setUserImpl(this, user);
  }

  clearUser(): void {
    clearUserImpl(this);
  }

  addMetadata(key: string, value: string | number | boolean): void {
    addMetadataImpl(this, key, value);
  }

  removeMetadata(key: string): void {
    removeMetadataImpl(this, key);
  }

  getMetadata(): Record<string, string | number | boolean> {
    return { ...this.metadata };
  }

  clearMetadata(): void {
    clearMetadataImpl(this);
  }

  /**
   * Update configuration at runtime. Nested objects are deep-merged;
   * arrays are replaced. Runtime-locked keys (apiEndpoint, captureXHR,
   * …) are skipped with a debug warning. See TEKNIK-IYILESTIRME §1.5.
   */
  updateConfig(partialConfig: Partial<BrowsonicConfig>): void {
    const raw = this.rawConfig;
    if (!raw) return;

    safeExecute(
      () => {
        const merged = mergeConfigUpdate(raw, partialConfig, (lockedKey) => {
          this.debugLog(
            `updateConfig: "${lockedKey}" is runtime-locked; call destroy() + init() to change it`
          );
        });
        this.rawConfig = merged;
        this.config = resolveConfig(merged);
        this.debugLog('Config updated:', partialConfig);
      },
      undefined,
      (error) => this.debugLog('updateConfig error:', error)
    );
  }

  /** Force-flush pending events to the server. */
  async flush(): Promise<void> {
    const queue = this.queue;
    if (!queue) return;
    await safeExecute(
      async () => {
        await queue.flush();
        this.debugLog('Manual flush completed');
      },
      undefined,
      (error) => this.debugLog('Flush error:', error)
    );
  }

  pause(): void {
    if (this.state !== 'running') return;
    safeExecute(
      () => {
        this.queue?.pause();
        this.state = 'paused';
        this.debugLog('SDK paused');
      },
      undefined,
      (error) => this.debugLog('Pause error:', error)
    );
  }

  resume(): void {
    if (this.state !== 'paused') return;
    safeExecute(
      () => {
        this.internalErrorCount = 0;
        this.queue?.resume();
        this.state = 'running';
        this.debugLog('SDK resumed');
      },
      undefined,
      (error) => this.debugLog('Resume error:', error)
    );
  }

  enterCriticalPath(options: CriticalPathOptions): void {
    enterCriticalPathImpl(this, options);
  }

  exitCriticalPath(): void {
    exitCriticalPathImpl(this);
  }

  isInCriticalPath(): boolean {
    return this.criticalPath !== null;
  }

  /**
   * Wrap a callback to preserve its registration stack across async
   * boundaries (manual async-stack mode). Static so callers can use
   * `Browsonic.wrap(fn)` without constructing an SDK instance.
   */
  static wrap<T extends (...args: unknown[]) => unknown>(callback: T): T {
    return wrapForAsyncStack(callback);
  }

  destroy(): void {
    destroy(this);
  }

  getState(): SdkState {
    return this.state;
  }

  getPendingCount(): number {
    return this.queue?.length() || 0;
  }
}
