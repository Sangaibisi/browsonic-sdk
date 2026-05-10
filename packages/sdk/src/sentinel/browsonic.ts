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
  Breadcrumb,
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
  // Sprint 8 M1 — Sentry-compatible structured context surface
  setContext as setContextImpl,
  removeContext as removeContextImpl,
  clearContexts as clearContextsImpl,
  setExtra as setExtraImpl,
  removeExtra as removeExtraImpl,
  clearExtras as clearExtrasImpl,
} from './user-metadata';
// Sprint 8 M2 — breadcrumb timeline
import { addBreadcrumb as addBreadcrumbImpl } from './breadcrumbs';
// Sprint 8 M3 — transient scope
import { withScope as withScopeImpl, type Scope } from './scope';
// Sprint 9 M2 — session health
import type { SessionHealth } from './session-health';
import { markCrashed } from './session-health';
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
   * @internal Structured context buckets (Sprint 8 M1). Each top-level
   * key is a domain name; the value is an arbitrary object. Cleared on
   * `clearContexts()`; individual buckets cleared on `removeContext(name)`.
   */
  contexts: Record<string, Record<string, unknown>> = {};
  /**
   * @internal Event-level non-indexed extras (Sprint 8 M1). Sibling to
   * `metadata`; differs in that values are `unknown` (any shape allowed)
   * and the backend does not index them.
   */
  extras: Record<string, unknown> = {};
  /**
   * @internal Session health state machine (Sprint 9 M2). Initial
   * value is `'ok'`; bumped by the event pipeline on captured
   * `error` / `fatal` events, and forced to `'crashed'` by the
   * circuit breaker or `markSessionCrashed()`.
   */
  sessionHealth: SessionHealth = 'ok';

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
   * Set an indexable tag on subsequent events. Sentry-compatible alias
   * for {@link addMetadata}; the tag lands in the same backing bucket
   * so backends that already render `metadata` keys get tags for free.
   * Added Sprint 8 M1.
   */
  setTag(key: string, value: string | number | boolean): void {
    addMetadataImpl(this, key, value);
  }

  /**
   * Remove a tag previously set via {@link setTag} or {@link addMetadata}.
   * Symmetric alias for {@link removeMetadata}. Added Sprint 8 M1.
   */
  removeTag(key: string): void {
    removeMetadataImpl(this, key);
  }

  /**
   * Set a structured context bucket on subsequent events. Use for
   * grouping per-event diagnostic data into UI-friendly panels (e.g.
   * `setContext('order', { items: 3, total: 99 })`). Replaces any
   * previous bucket with the same name. Added Sprint 8 M1.
   */
  setContext(name: string, ctx: Record<string, unknown>): void {
    setContextImpl(this, name, ctx);
  }

  /** Remove the named context bucket. Added Sprint 8 M1. */
  removeContext(name: string): void {
    removeContextImpl(this, name);
  }

  /** Clear all context buckets. Added Sprint 8 M1. */
  clearContexts(): void {
    clearContextsImpl(this);
  }

  /**
   * Set an event-level non-indexed extra. Use for large diagnostic
   * blobs (debug snapshots, truncated request bodies). Backends store
   * but do not index extras; prefer {@link setTag} for short
   * searchable values. Added Sprint 8 M1.
   */
  setExtra(key: string, value: unknown): void {
    setExtraImpl(this, key, value);
  }

  /** Remove a previously-set extra. Added Sprint 8 M1. */
  removeExtra(key: string): void {
    removeExtraImpl(this, key);
  }

  /** Clear all extras. Added Sprint 8 M1. */
  clearExtras(): void {
    clearExtrasImpl(this);
  }

  /**
   * Append a breadcrumb to the telemetry timeline (Sprint 8 M2).
   * Breadcrumbs land in `event.telemetry.breadcrumb` for every
   * subsequently-captured event, alongside auto-collected console /
   * network / navigation / visitor entries. `category` is required;
   * `level` defaults to `'info'` and `timestamp` is auto-filled when
   * omitted. No-op while the SDK is uninitialised or while a Critical
   * Path window has paused the telemetry store.
   */
  addBreadcrumb(breadcrumb: Breadcrumb): void {
    addBreadcrumbImpl(this, breadcrumb);
  }

  /**
   * Run a callback against a transient scope (Sprint 8 M3). Tags,
   * contexts, extras, and the current user set inside the callback are
   * visible to events captured during the call but are reverted to
   * their previous values when the callback returns or throws.
   *
   * Sync and async callbacks are both supported; the overload that
   * matches your callback decides whether the return value is `T` or
   * `Promise<T>`. The state is restored even when the callback throws
   * (sync) or its returned promise rejects (async). Breadcrumbs added
   * inside the scope persist in the telemetry timeline — they are not
   * undone, matching the "activity trail" semantic.
   */
  withScope<T>(fn: (scope: Scope) => Promise<T>): Promise<T>;
  withScope<T>(fn: (scope: Scope) => T): T;
  withScope<T>(fn: (scope: Scope) => T | Promise<T>): T | Promise<T> {
    return withScopeImpl(this, fn as (scope: Scope) => T);
  }

  /**
   * Read the current session health state (Sprint 9 M2). One of
   * `'ok'` (no error events captured yet), `'errored'` (at least
   * one `error` / `fatal` event captured), or `'crashed'` (terminal
   * — circuit breaker tripped, or the host called
   * {@link markSessionCrashed}). Each captured event is also
   * stamped with this value at capture time.
   */
  getSessionHealth(): SessionHealth {
    return this.sessionHealth;
  }

  /**
   * Force the session into the terminal `'crashed'` state. Use
   * sparingly: typical usage relies on the event-driven transitions
   * (`'ok'` → `'errored'` on error events, circuit breaker → `'crashed'`).
   * This method is the explicit override for hosts that want to
   * advertise an unrecoverable failure to the backend without waiting
   * for an error event to fire. Once crashed, the state is terminal.
   */
  markSessionCrashed(): void {
    this.sessionHealth = markCrashed();
    this.debugLog('Session marked as crashed');
  }

  /**
   * Update configuration at runtime. Nested objects are deep-merged;
   * arrays are replaced. Runtime-locked keys (apiEndpoint, captureXHR,
   * …) are skipped with a debug warning. See TECHNICAL-IMPROVEMENTS §1.5.
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
