// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicEvent, EventBatch, ResolvedConfig, UserContext } from '../types';
import type { DiagnosticsStore } from '../diagnostics';
import {
  uuid,
  timestamp,
  generateFingerprint,
  getByteSize,
  safeExecute,
  isBrowser,
  compareVersions,
} from '../utils';
import { sendBatch, calculateBackoff } from '../transport';
import { collectEventContext, collectSessionContext, truncateSessionContext } from '../context';
import { getOrCreateVisitorId } from '../visitor';
import { getAdapter } from '../sentinel/adapter-registry';
import { persistToTiers, loadFromTiers, clearTiers } from './storage';
import type { QueueMetricsSnapshot } from '../types';

const STORAGE_KEY = '__browsonic_queue';

/** Debounce delay for persisting queue to localStorage */
const PERSIST_DEBOUNCE_MS = 1000;

/** Maximum retry attempts before giving up */
const MAX_RETRY_ATTEMPTS = 5;

/** Threshold for cleaning expired cooldowns (memory leak prevention) */
const COOLDOWN_CLEANUP_THRESHOLD = 100;

interface QueueOptions {
  config: ResolvedConfig;
  debugLog: (message: string, ...args: unknown[]) => void;
  /** Get current session ID */
  getSessionId: () => string;
  /** Get current user context */
  getUser: () => UserContext | null;
  /**
   * Returns current head-based session sampling decision. When false,
   * non-error events are dropped at enqueue. Errors are always kept.
   * (Added 0.3.0; see PERFORMANS-STRATEJISI.md §3.)
   */
  getSessionSampled?: () => boolean;
  /** SDK package name for batch.sdk.name. */
  sdkName?: string;
  /** SDK version string for batch.sdk.version. */
  sdkVersion?: string;
  /**
   * Self-diagnostics store — populated only when the host passes
   * `internalDiagnostics: true`. The queue feeds flush latency and
   * dropped-event counters into it. Null otherwise.
   */
  diagnostics?: DiagnosticsStore | null;
}

/**
 * Event queue with batching, dedup, and transport
 */
export function createEventQueue(options: QueueOptions) {
  const {
    config,
    debugLog,
    getSessionId,
    getUser,
    getSessionSampled,
    sdkName,
    sdkVersion,
    diagnostics,
  } = options;

  let queue: BrowsonicEvent[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let persistTimer: ReturnType<typeof setTimeout> | null = null; // CRIT-003: Debounced persist
  let retryAttempt = 0;
  let isPaused = false;
  let isDestroyed = false;

  /**
   * Sprint 2 (gap B3): wall-clock of the last successful flush. Stamped
   * on every batch's `queueMetrics.lastFlushTimeMs` so the dashboard's
   * <QueueHealthPanel> can render "stale fleet" gauges. 0 means no
   * successful flush has happened in this session yet.
   */
  let lastFlushTimeMs = 0;

  /**
   * Sprint 2 (gap B3): per-batch drop delta. The diagnostics store holds
   * a cumulative dropped_events counter; this map captures the slice
   * since the previous batch so each batch's queueMetrics.drops is a
   * delta the dashboard can plot directly.
   */
  const dropsSincePreviousBatch = new Map<string, number>();

  /** Internal helper — record a drop both in diagnostics (cumulative)
   *  and in the per-batch delta map (for queueMetrics.drops). Reasons
   *  match the public DroppedReason union. */
  function trackDrop(
    reason: 'sampled_out' | 'storm' | 'oversized' | 'quota' | 'ignored' | 'state' | 'permanent_fail'
  ): void {
    diagnostics?.incDropped(reason);
    dropsSincePreviousBatch.set(reason, (dropsSincePreviousBatch.get(reason) ?? 0) + 1);
  }

  // Fingerprint cooldown map
  const cooldowns: Map<string, number> = new Map();

  // 0.3.0 (Sprint 3): Error storm protection.
  // Rolling window of error-level event timestamps. When the count in the
  // last `errorStormWindowMs` exceeds `errorStormThreshold`, enter storm
  // mode which multiplies dedup cooldown by `errorStormCooldownMultiplier`.
  // See TEKNIK-IYILESTIRME §2.4 + PERFORMANS-STRATEJISI §9.
  const errorTimestamps: number[] = [];
  let inStorm = false;

  // Sprint P15 (F3.2.C): count of events suppressed by the extended
  // dedup cooldown while a storm is active. Reset on every storm entry;
  // on exit the counter is flushed as a synthetic aggregation event so
  // the backend can surface "Storm-suppressed sessions" in the fleet
  // dashboard. Only increments when shouldDedupe() drops an event
  // AND we are currently in storm mode.
  let stormSuppressedCount = 0;

  // 0.3.0 (Sprint 3): Adaptive quality degradation.
  // Effective sample-rate multiplier, driven by backend
  // `X-Browsonic-Quota-Remaining`. Range [0.125, 1.0] — clamped so the
  // SDK never goes fully silent and always eventually recovers.
  // See PERFORMANS-STRATEJISI §3 and Transport §.
  let adaptiveMultiplier = 1.0;
  const ADAPTIVE_MIN = 0.125; // x8 reduction floor
  const ADAPTIVE_MAX = 1.0;

  // Sprint P15 (F3.1.F): once-per-session latch for the unsupported-SDK
  // callback. The backend advertises `X-Browsonic-Min-Sdk-Version` on
  // every response, but we only want to fire the host's callback on the
  // first crossing — otherwise a fleet that is two majors behind would
  // spam the host on every flush.
  let unsupportedVersionNotified = false;

  /** Current effective sample rate after adaptive degradation. */
  function effectiveSampleRate(): number {
    return Math.max(0, Math.min(1, config.sampleRate * adaptiveMultiplier));
  }

  /**
   * Compare the server's advertised minimum version to our running
   * version and fire `config.onUnsupportedVersion` once per session if
   * the running build is older. Silent no-op when the header is absent
   * or the callback is not registered.
   */
  function applyMinSdkVersionSignal(minSdkVersion: string | null): void {
    if (unsupportedVersionNotified) return;
    if (!minSdkVersion) return;
    const current = sdkVersion ?? '';
    if (!current) return;
    if (compareVersions(current, minSdkVersion) >= 0) return;

    unsupportedVersionNotified = true;
    debugLog(`Unsupported SDK version: running ${current}, server requires ≥ ${minSdkVersion}`);
    const callback = config.onUnsupportedVersion;
    if (callback) {
      try {
        callback(minSdkVersion, current);
      } catch (err) {
        // Host callback throwing never propagates — diagnostics will
        // pick it up via the SDK's standard safeExecute path on the
        // next internal-error increment.
        debugLog('onUnsupportedVersion callback threw:', err);
      }
    }
  }

  /**
   * Update adaptive multiplier from the backend's quota signal.
   * - `null` (header absent) → no change.
   * - ≥ 0.8 → recover: multiplier *= 1.5 (capped at 1.0).
   * - ≤ 0.2 → degrade: multiplier *= 0.5 (floored at 0.125).
   * - HTTP 429 → degrade aggressively: multiplier *= 0.25.
   */
  function applyQuotaSignal(quotaRemaining: number | null, isRateLimited: boolean): void {
    if (isRateLimited) {
      adaptiveMultiplier = Math.max(ADAPTIVE_MIN, adaptiveMultiplier * 0.25);
      debugLog(`Adaptive: rate-limited → multiplier ${adaptiveMultiplier.toFixed(3)}`);
      return;
    }
    if (quotaRemaining == null) return;
    if (quotaRemaining <= 0.2) {
      adaptiveMultiplier = Math.max(ADAPTIVE_MIN, adaptiveMultiplier * 0.5);
      debugLog(
        `Adaptive: low quota (${quotaRemaining}) → multiplier ${adaptiveMultiplier.toFixed(3)}`
      );
    } else if (quotaRemaining >= 0.8) {
      const next = Math.min(ADAPTIVE_MAX, adaptiveMultiplier * 1.5);
      if (next !== adaptiveMultiplier) {
        adaptiveMultiplier = next;
        debugLog(
          `Adaptive: healthy quota (${quotaRemaining}) → multiplier ${adaptiveMultiplier.toFixed(3)}`
        );
      }
    }
  }

  // Load persisted queue on init
  if (config.persistQueue) {
    loadPersistedQueue();
  }

  /**
   * Load queue via the tiered storage backend (Sprint P15 / F3.1.G).
   *
   * Stage 1 (localStorage) is tried synchronously first. If empty, we
   * probe IndexedDB asynchronously — events discovered there are
   * merged into the in-memory queue when the promise resolves, and the
   * flush timer kicks in at that point.
   */
  function loadPersistedQueue(): void {
    if (!isBrowser()) return;

    void loadFromTiers(STORAGE_KEY, debugLog).then(
      (stored) => {
        if (!stored) return;
        safeExecute(
          () => {
            const parsed = JSON.parse(stored);
            // IMP-001: Validate that parsed data is an array
            if (!Array.isArray(parsed)) {
              debugLog('Persisted queue data is corrupted, clearing');
              void clearTiers(STORAGE_KEY, debugLog);
              return;
            }
            // Limit to maxQueueSize (ring buffer behavior)
            const restored = (parsed as BrowsonicEvent[]).slice(-config.maxQueueSize);
            queue = queue.concat(restored).slice(-config.maxQueueSize);
            debugLog(`Loaded ${restored.length} events from persistent storage`);

            // Clear storage after loading so we don't replay on next boot
            void clearTiers(STORAGE_KEY, debugLog);

            // Start flush if we have events
            if (queue.length > 0 && !flushTimer && !isPaused && !isDestroyed) {
              startFlushTimer();
            }
          },
          undefined,
          (error) => debugLog('Failed to parse persisted queue:', error)
        );
      },
      (error) => debugLog('Failed to load persisted queue:', error)
    );
  }

  /**
   * Save queue to localStorage (debounced to prevent performance issues - CRIT-003)
   */
  function schedulePersist(): void {
    if (!config.persistQueue || !isBrowser() || isDestroyed) return;

    // Clear existing timer
    if (persistTimer) {
      clearTimeout(persistTimer);
    }

    // Debounce: persist after inactivity period
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistQueueNow();
    }, PERSIST_DEBOUNCE_MS);
  }

  /**
   * Persist the queue via the tiered storage backend.
   *
   * Synchronous callers (destroy, pagehide) see the localStorage path
   * complete before the function returns; the IndexedDB escalation is
   * fire-and-forget because IDB is inherently async. Events that fail
   * both tiers simply stay in memory — the queue itself is the stage-3
   * fallback and will be re-tried on the next `schedulePersist` tick.
   */
  function persistQueueNow(): void {
    if (!config.persistQueue || !isBrowser()) return;

    if (queue.length === 0) {
      void clearTiers(STORAGE_KEY, debugLog);
      return;
    }

    const toStore = queue.slice(-config.maxQueueSize);
    let serialized: string;
    try {
      serialized = JSON.stringify(toStore);
    } catch (err) {
      // A non-serializable event in the queue is an upstream bug; we
      // can't do anything useful except log and skip this tick.
      debugLog('Failed to serialize queue for persist:', err);
      return;
    }

    void persistToTiers(STORAGE_KEY, serialized, debugLog).then((tier) => {
      if (tier) {
        debugLog(`Persisted ${toStore.length} events to ${tier}`);
      } else {
        debugLog(`Persist tiers exhausted; ${toStore.length} events remain in memory`);
      }
    });
  }

  /**
   * Clean expired cooldowns to prevent memory leaks (CRIT-004)
   */
  function cleanExpiredCooldowns(now: number): void {
    if (cooldowns.size > COOLDOWN_CLEANUP_THRESHOLD) {
      const cutoff = now - config.cooldownMs;
      for (const [fp, time] of cooldowns.entries()) {
        if (time < cutoff) {
          cooldowns.delete(fp);
        }
      }
    }
  }

  /**
   * Check if event should be deduplicated.
   * In storm mode the effective cooldown is multiplied to collapse noise.
   */
  function shouldDedupe(event: BrowsonicEvent): boolean {
    const fingerprint = event._fingerprint;
    if (!fingerprint) return false;

    const lastSeen = cooldowns.get(fingerprint);
    const now = Date.now();
    const effectiveCooldown = inStorm
      ? config.cooldownMs * config.errorStormCooldownMultiplier
      : config.cooldownMs;

    if (lastSeen && now - lastSeen < effectiveCooldown) {
      debugLog(`Deduped event with fingerprint ${fingerprint}${inStorm ? ' (storm mode)' : ''}`);
      trackDrop(inStorm ? 'storm' : 'ignored');
      // Sprint P15 (F3.2.C): only the extended-cooldown drops count
      // towards storm suppression; plain dedup drops while healthy do
      // not — those are a normal fingerprint hit and always happened.
      if (inStorm) stormSuppressedCount++;
      return true;
    }

    // Update cooldown
    cooldowns.set(fingerprint, now);

    // Clean old cooldowns periodically (CRIT-004: memory leak prevention)
    cleanExpiredCooldowns(now);

    return false;
  }

  /**
   * Update rolling error-timestamp window and flip storm mode on/off
   * as threshold crossings occur. Called only for error-level events.
   */
  function updateStormState(now: number): void {
    errorTimestamps.push(now);
    const windowStart = now - config.errorStormWindowMs;
    // Drop timestamps older than window (amortized O(1) via shift-while)
    while (errorTimestamps.length > 0 && errorTimestamps[0] < windowStart) {
      errorTimestamps.shift();
    }
    const count = errorTimestamps.length;

    if (!inStorm && count >= config.errorStormThreshold) {
      inStorm = true;
      stormSuppressedCount = 0;
      debugLog(`Error storm ENTERED (count=${count} in ${config.errorStormWindowMs}ms)`);
      try {
        config.onErrorStorm?.('enter', count);
      } catch {
        // never let user callback throw propagate
      }
    } else if (inStorm && count < Math.max(1, config.errorStormThreshold / 2)) {
      // Hysteresis: exit only when count drops to half the threshold.
      // Prevents chattering around the threshold.
      inStorm = false;
      const suppressed = stormSuppressedCount;
      stormSuppressedCount = 0;
      debugLog(`Error storm EXITED (count=${count}, suppressed=${suppressed})`);
      try {
        config.onErrorStorm?.('exit', count);
      } catch {
        // ignore
      }
      // Sprint P15 (F3.2.C): emit one aggregation event per storm so
      // the backend can count masked signal. Zero-suppression exits
      // are still worth reporting on noisy fleets because the storm
      // itself is an observability event.
      if (suppressed > 0) {
        emitStormSuppressedAggregate(suppressed);
      }
    }
  }

  /**
   * Synthesize and enqueue the storm aggregation event (F3.2.C). The
   * synthetic event bypasses the storm/dedup gate (it describes its
   * own storm) but still goes through the normal flush pipeline so
   * the backend receives it via the standard `/v1/events` endpoint.
   */
  function emitStormSuppressedAggregate(count: number): void {
    if (isDestroyed || isPaused) return;
    const event: BrowsonicEvent = {
      eventId: uuid(),
      timestamp: timestamp(),
      // Level `info` keeps it out of the instant-flush path; type
      // `error` keeps it within the existing EventType union so the
      // backend's strict validator doesn't reject it.
      type: 'error',
      level: 'info',
      message: `Error storm suppressed ${count} event${count === 1 ? '' : 's'}`,
      context: collectEventContext(),
      _stormSuppressed: count,
    };
    if (queue.length >= config.maxQueueSize) {
      queue.shift();
      trackDrop('oversized');
    }
    queue.push(event);
    schedulePersist();
    if (!flushTimer) {
      startFlushTimer();
    }
  }

  /**
   * Add event to queue
   */
  function enqueue(event: BrowsonicEvent): void {
    if (isDestroyed || isPaused) return;

    safeExecute(
      () => {
        // Head-based sampling: errors and fatals always captured; non-error
        // events only when session is sampled AND current adaptive multiplier
        // allows it. Decision is session-scoped at the sample gate; adaptive
        // rolls per non-error event based on current effective rate.
        // (0.3.0; see PERFORMANS-STRATEJISI §3.)
        if (event.level !== 'error' && event.level !== 'fatal') {
          if (getSessionSampled && !getSessionSampled()) {
            trackDrop('sampled_out');
            return;
          }
          // Secondary gate: adaptive multiplier. At multiplier=1 this is
          // identity. At <1 it probabilistically drops a fraction of
          // already-session-sampled events.
          if (adaptiveMultiplier < 1 && Math.random() >= adaptiveMultiplier) {
            trackDrop('quota');
            return;
          }
        }

        // Sprint 3: track error-level events to detect storm conditions.
        // Threshold crossings are reported via `onErrorStorm` callback and
        // extend fingerprint dedup cooldown while active.
        if (event.level === 'error') {
          updateStormState(Date.now());
        }

        // Generate fingerprint (use url from event context)
        event._fingerprint = generateFingerprint(
          event.type,
          event.message,
          event.stack,
          event.context.url,
          config.maxStackFrames
        );

        // Check dedup
        if (shouldDedupe(event)) {
          return;
        }

        // Check queue size limit
        if (queue.length >= config.maxQueueSize) {
          debugLog('Queue full, dropping oldest event');
          queue.shift();
          trackDrop('oversized');
        }

        queue.push(event);
        debugLog(`Event queued (${queue.length}/${config.maxQueueSize})`);

        // Persist queue if enabled (debounced)
        schedulePersist();

        // Start flush timer if not running
        if (!flushTimer) {
          startFlushTimer();
        }

        // 0.3.0 (Sprint 3): Instant flush moved from `error` → `fatal` only.
        // Reason: on high-traffic sites, `error` storms can DDoS the ingest
        // endpoint. Errors now batch normally (≤ flushIntervalMs delay,
        // default 10s). `fatal` is reserved for unrecoverable conditions
        // that cannot wait. See CHANGELOG and TEKNIK-IYILESTIRME §2.4.
        if (event.level === 'fatal') {
          debugLog('Fatal event detected - instant flush');
          // Fire-and-forget: caller awaits via sdk.flush() if needed.
          void flushSingleEvent(event);
          const idx = queue.indexOf(event);
          if (idx > -1) queue.splice(idx, 1);
        }
      },
      undefined,
      (error) => debugLog('Enqueue error:', error)
    );
  }

  /**
   * Start the flush timer
   */
  function startFlushTimer(): void {
    if (flushTimer || isDestroyed) return;

    flushTimer = setTimeout(() => {
      flushTimer = null;
      // Fire-and-forget: next tick will start a new timer if queue has events.
      void flush();
    }, config.flushIntervalMs);
  }

  /**
   * Stop the flush timer
   */
  function stopFlushTimer(): void {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
  }

  /**
   * Create a batch from queued events with session context
   * Session context is collected at batch creation time (most current state)
   */
  function createBatch(eventsToSend?: BrowsonicEvent[]): EventBatch | null {
    // Use provided events or take from queue
    const events = eventsToSend || queue.splice(0, config.maxBatchSize);
    if (events.length === 0) return null;

    // Collect session context at batch send time
    let sessionContext = collectSessionContext(config);
    const { context: truncatedContext, truncated } = truncateSessionContext(sessionContext, config);
    sessionContext = truncatedContext;

    // Build batch with session-level data.
    // 0.3.0: include `sampled`, `sampleRate`, and `sdk` metadata so backend
    // can weight aggregates and enforce version-aware ingest.
    // 2.3.0 (Sprint 1, gap A1): carry the visitor identifier on the
    // batch so cross-session journeys can link. Honours the configured
    // visitor strategy + consent gates via `getOrCreateVisitorId`.
    // 2.3.0 (Sprint 2, gap B3): stamp the framework adapter identity
    // (when one registered) and a queue-metrics snapshot. Reset the
    // per-batch drop delta + sync the diagnostics store so the
    // /v1/diagnostics reporter and /v1/events batch agree.
    const adapter = getAdapter();
    const queueMetrics: QueueMetricsSnapshot = {
      depth: queue.length,
      lastFlushTimeMs,
      drops: Array.from(dropsSincePreviousBatch.entries()).map(([reason, count]) => ({
        // Cast is safe because trackDrop only stores known DroppedReason
        // strings; we keep the map's value type permissive (string) to
        // avoid an extra import of the union here.
        reason: reason as QueueMetricsSnapshot['drops'][number]['reason'],
        count,
      })),
      retryAttempts: { p50: 0, p95: retryAttempt, max: retryAttempt },
    };
    dropsSincePreviousBatch.clear();
    diagnostics?.setQueueMetrics(queueMetrics);
    diagnostics?.setAdapter(adapter);

    const batch: EventBatch = {
      batchId: uuid(),
      timestamp: timestamp(),
      appKey: config.appKey,
      environment: config.environment,
      clientVersion: config.clientVersion,
      sessionId: getSessionId(),
      visitorId: getOrCreateVisitorId(config),
      sessionContext,
      user: getUser(),
      events,
      sampled: getSessionSampled ? getSessionSampled() : true,
      sampleRate: config.sampleRate,
      ...(sdkName && sdkVersion ? { sdk: { name: sdkName, version: sdkVersion } } : {}),
      ...(adapter ? { adapter } : {}),
      queueMetrics,
    };

    if (truncated) {
      debugLog('Session context was truncated due to size limits');
    }

    const size = getByteSize(batch);
    if (size > config.maxPayloadBytes) {
      debugLog(`Batch size ${size} exceeds limit ${config.maxPayloadBytes}`);

      // IMP-003: Handle single oversized event
      if (events.length === 1) {
        debugLog('Single event exceeds payload limit, dropping oversized event');
        trackDrop('oversized');
        // Don't put it back - drop it to prevent infinite loop
        return null;
      }

      // Put events back if they were from queue
      if (!eventsToSend) {
        queue.unshift(...events);
      }

      // Try with fewer events (binary reduction)
      const reducedEvents = eventsToSend
        ? events.slice(0, Math.max(1, Math.floor(events.length / 2)))
        : queue.splice(0, Math.max(1, Math.floor(events.length / 2)));

      return createBatch(reducedEvents);
    }

    return batch;
  }

  /**
   * Flush queued events
   */
  async function flush(): Promise<void> {
    if (isDestroyed || isPaused || queue.length === 0) {
      // Restart timer if there are still events
      if (queue.length > 0 && !isPaused && !isDestroyed) {
        startFlushTimer();
      }
      return;
    }

    stopFlushTimer();

    const batch = createBatch();
    if (!batch) {
      startFlushTimer();
      return;
    }

    debugLog(`Flushing batch ${batch.batchId} with ${batch.events.length} events`);

    const flushStart = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const result = await sendBatch(batch, config, debugLog);
    const flushLatency =
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - flushStart;
    diagnostics?.recordFlush(flushLatency);
    applyQuotaSignal(result.quotaRemaining ?? null, result.status === 429);
    applyMinSdkVersionSignal(result.minSdkVersion ?? null);

    if (result.success) {
      // Sprint 2 (gap B2 + B3): stamp the wall-clock for the next batch's
      // queueMetrics.lastFlushTimeMs and feed the final retry-attempt
      // count into the diagnostics retry tracker (0 on first-try success).
      lastFlushTimeMs = Date.now();
      diagnostics?.recordRetryAttempt(retryAttempt);
      retryAttempt = 0;
      // Continue flushing if more events
      if (queue.length > 0) {
        startFlushTimer();
      }
    } else {
      // Handle failure
      if (result.status === 429) {
        // IMP-004: Rate limited - use dedicated state for clarity
        const delay = (result.retryAfter || 60) * 1000;
        debugLog(`Rate limited, waiting ${delay}ms before retry`);

        // Schedule retry without affecting isPaused state (rate limit is temporary)
        setTimeout(() => {
          if (!isDestroyed) {
            debugLog('Rate limit delay complete, retrying flush');
            void flush();
          }
        }, delay);
        // Don't start another timer or process more - wait for rate limit to clear
        return;
      } else if (result.status && result.status >= 400 && result.status < 500) {
        // Client error - drop batch, don't retry
        debugLog('Client error, dropping batch');
        retryAttempt = 0;
        if (queue.length > 0) {
          startFlushTimer();
        }
      } else {
        // Server error or network failure - retry with backoff
        retryAttempt++;
        const delay = calculateBackoff(retryAttempt);
        debugLog(`Retry attempt ${retryAttempt}, waiting ${delay}ms`);

        // Put events back at front of queue
        queue.unshift(...batch.events);

        // Limit retries
        if (retryAttempt < MAX_RETRY_ATTEMPTS) {
          setTimeout(() => void flush(), delay);
        } else {
          // Sprint 2 (gap B2): retry budget exhausted. Mark each event in
          // the failed batch as `permanent_fail` so the dashboard's
          // <RetryOutcomesCard> can surface fleet-level retry pressure.
          // We still keep the events in the queue (a future timer cycle
          // will retry them) — `permanent_fail` is an *observability*
          // signal, not a runtime drop.
          debugLog('Max retries reached, pausing');
          for (let i = 0; i < batch.events.length; i++) {
            trackDrop('permanent_fail');
          }
          diagnostics?.recordRetryAttempt(retryAttempt);
          retryAttempt = 0;
          startFlushTimer();
        }
      }
    }
  }

  /**
   * Get queue length
   */
  function length(): number {
    return queue.length;
  }

  /**
   * Pause the queue
   */
  function pause(): void {
    isPaused = true;
    stopFlushTimer();
    debugLog('Queue paused');
  }

  /**
   * Resume the queue
   */
  function resume(): void {
    isPaused = false;
    if (queue.length > 0) {
      startFlushTimer();
    }
    debugLog('Queue resumed');
  }

  /**
   * Destroy the queue
   */
  function destroy(): void {
    isDestroyed = true;
    stopFlushTimer();

    // Cancel any pending persist timer
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }

    // Persist remaining events immediately before destroying (not debounced)
    if (config.persistQueue && queue.length > 0) {
      persistQueueNow();
    }

    queue = [];
    cooldowns.clear();
    errorTimestamps.length = 0;
    inStorm = false;
    stormSuppressedCount = 0;
    unsupportedVersionNotified = false;
    debugLog('Queue destroyed');
  }

  /**
   * Flush a single error event immediately (bypass batching)
   */
  async function flushSingleEvent(event: BrowsonicEvent): Promise<void> {
    if (isDestroyed || isPaused) return;

    const batch = createBatch([event]);
    if (!batch) return;

    debugLog(`Instant flush: fatal event ${event.eventId}`);

    const result = await sendBatch(batch, config, debugLog);
    applyQuotaSignal(result.quotaRemaining ?? null, result.status === 429);
    applyMinSdkVersionSignal(result.minSdkVersion ?? null);

    if (!result.success) {
      // On failure, re-queue the event for retry via normal batching
      debugLog('Instant flush failed, re-queuing event for retry');
      queue.unshift(event);
      if (!flushTimer) {
        startFlushTimer();
      }
    }
  }

  return {
    enqueue,
    flush,
    flushSingleEvent,
    length,
    pause,
    resume,
    destroy,
    isPaused: () => isPaused,
    // Diagnostics surface (Sprint 3) — used by tests + future dashboards
    getAdaptiveMultiplier: () => adaptiveMultiplier,
    getEffectiveSampleRate: () => effectiveSampleRate(),
    isInStorm: () => inStorm,
    // Sprint P15 (F3.2.C): expose the current storm-suppression counter
    // for tests + diagnostics probes. Resets to 0 on each storm entry
    // and again immediately after the aggregation event is queued on
    // exit — reading while inStorm===false therefore always returns 0.
    getStormSuppressedCount: () => stormSuppressedCount,
  };
}
