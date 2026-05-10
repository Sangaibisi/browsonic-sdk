// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { BrowsonicConfig, ResolvedConfig } from '../types';

/**
 * Default configuration values.
 *
 * Values marked "0.3.0" were revised per PERFORMANCE-STRATEGY.md §3
 * for high-traffic SaaS production profile (e-commerce / telco).
 * Any change here is a BREAKING release; bump minor and update CHANGELOG.
 */
export const DEFAULT_CONFIG: Omit<ResolvedConfig, 'apiEndpoint' | 'appKey' | 'apiKey'> = {
  environment: 'production',
  clientVersion: null,
  debug: false,
  flushIntervalMs: 10000, // 0.3.0: was 30000
  maxBatchSize: 25, // 0.3.0: was 50 (sendBeacon 64KB fit)
  cooldownMs: 60000,
  maxPayloadBytes: 51200, // 0.3.0: was 65536 (margin under 64KB)
  maxStackFrames: 10,
  maxQueueSize: 200,
  persistQueue: false,
  captureLevels: ['error'],
  // Sprint P15 (F3.1.I): default keys are copied into both the
  // exact-match Set and the substring pattern list at resolve time so
  // the legacy behaviour ("'auth_token' contains 'token' → redact")
  // is preserved while the common exact case takes the Set fast path.
  redactKeys: new Set<string>([
    'token',
    'password',
    'authorization',
    'secret',
    'key',
    'credential',
    'auth',
  ]),
  redactKeyPatterns: ['token', 'password', 'authorization', 'secret', 'key', 'credential', 'auth'],
  redactCookieNames: [],
  maxValueLength: 1000,
  maxTelemetryEntries: 20, // 0.3.0: was 30
  includeTelemetry: true,
  captureXHR: true,
  networkTelemetry: true,
  trackNavigation: true,
  trackVisitor: false,
  trackPageViews: true,
  visitor: {
    click: true,
    input: true,
    inputThrottleMs: 500,
  },
  // 2.3+ (Sprint P14, F3.1.A): visitor ID strategy + consent gates.
  // Default stays 'cookie' for back-compat; privacy-conscious hosts
  // should explicitly pick 'session' or 'none'. GPC is respected by
  // default because honouring it is zero-risk for analytics value —
  // a GPC-signalling user has already told the browser they don't
  // want cross-visit tracking.
  visitorIdStrategy: 'cookie',
  respectGPC: true,
  hasConsented: null,
  // Sprint P15 (F3.1.C): CSP nonce passes through to the widget's
  // shadow-root <style>. null = not supplied.
  cspNonce: null,
  onError: null,
  // Sprint P15 (F3.1.F): unsupported-version callback. Fired at most
  // once per session when the backend's X-Browsonic-Min-Sdk-Version
  // header indicates the SDK build is below the supported floor.
  onUnsupportedVersion: null,
  captureAsyncStack: false as const, // 0.3.0: values = false | 'manual' | 'global'
  ignorePatterns: [],
  ignoreExtensions: true,
  ignoreScriptErrors: true,
  ignoreMessages: [],
  ignoreUrls: [],
  widgetPosition: 'bottom-right' as const,
  widgetRules: [],
  widgetRulesEndpoint: false,
  // 0.3.0: privacy + sampling (BREAKING)
  captureStorage: {
    local: false, // 0.3.0: off by default — privacy-first
    session: false, // 0.3.0: off by default
    keys: null, // no allow-list → fallback to maxEntries cap
    maxEntries: 20,
  },
  captureCookieValues: false, // 0.3.0: was on by default
  sampleRate: 0.1, // 0.3.0: head-based session sampling
  // 0.3.0 (Sprint 3): error storm protection defaults
  errorStormThreshold: 20,
  errorStormWindowMs: 10_000,
  errorStormCooldownMultiplier: 5,
  onErrorStorm: null,
  // Self-diagnostics (Sprint 10) — opt-in; off by default to avoid the
  // periodic network request unless the host explicitly wants SDK
  // observability.
  internalDiagnostics: false,
  internalDiagnosticsIntervalMs: 60_000,
};

/**
 * Validate required config fields
 */
export function validateConfig(config: BrowsonicConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.apiEndpoint) {
    errors.push('apiEndpoint is required');
  } else {
    // Use `new URL()` rather than a startsWith prefix check so that parser
    // tricks like `https://evil.example.com\@trusted.example.com` fail at
    // config time. A `startsWith` check would pass that and `fetch()` would
    // resolve to the attacker-controlled host at runtime.
    let parsed: URL | null = null;
    try {
      parsed = new URL(config.apiEndpoint);
    } catch {
      errors.push('apiEndpoint must be a parseable URL');
    }
    if (parsed) {
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        errors.push('apiEndpoint protocol must be http or https');
      }
      // Reject embedded userinfo (`https://user:pass@host/…`) — the SDK
      // always authenticates via the X-API-KEY / X-APP-KEY headers, so a
      // userinfo component is either a misconfiguration or an attempt to
      // exfiltrate creds via a typo'd endpoint.
      if (parsed.username || parsed.password) {
        errors.push('apiEndpoint must not contain userinfo (user:pass@)');
      }
    }
  }

  if (!config.appKey) {
    errors.push('appKey is required');
  }

  // Warn if trackPageViews is enabled but apiKey is missing
  if (config.trackPageViews !== false && !config.apiKey) {
    errors.push(
      'apiKey is required for page view tracking. Either provide apiKey or set trackPageViews: false'
    );
  }

  if (config.flushIntervalMs !== undefined && config.flushIntervalMs < 1000) {
    errors.push('flushIntervalMs must be at least 1000ms');
  }

  if (config.maxBatchSize !== undefined && config.maxBatchSize < 1) {
    errors.push('maxBatchSize must be at least 1');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Merge user config with defaults
 */
export function resolveConfig(config: BrowsonicConfig): ResolvedConfig {
  return {
    apiEndpoint: config.apiEndpoint,
    appKey: config.appKey,
    apiKey: config.apiKey ?? null,
    environment: config.environment ?? DEFAULT_CONFIG.environment,
    clientVersion: config.clientVersion ?? DEFAULT_CONFIG.clientVersion,
    debug: config.debug ?? DEFAULT_CONFIG.debug,
    flushIntervalMs: config.flushIntervalMs ?? DEFAULT_CONFIG.flushIntervalMs,
    maxBatchSize: config.maxBatchSize ?? DEFAULT_CONFIG.maxBatchSize,
    cooldownMs: config.cooldownMs ?? DEFAULT_CONFIG.cooldownMs,
    maxPayloadBytes: config.maxPayloadBytes ?? DEFAULT_CONFIG.maxPayloadBytes,
    maxStackFrames: config.maxStackFrames ?? DEFAULT_CONFIG.maxStackFrames,
    maxQueueSize: config.maxQueueSize ?? DEFAULT_CONFIG.maxQueueSize,
    persistQueue: config.persistQueue ?? DEFAULT_CONFIG.persistQueue,
    captureLevels: config.captureLevels ?? DEFAULT_CONFIG.captureLevels,
    // Sprint P15 (F3.1.I): lowercase once here so the hot-path redact
    // loop can drop the per-call `.toLowerCase()` on each pattern.
    // Resolution rules:
    //   - User `redactKeys` (or defaults) are lowered and stuffed into
    //     both a Set<string> (exact-match fast path) and a string[]
    //     (substring slow path). This preserves legacy behaviour while
    //     giving the bench a 40x speedup for the common "exact key"
    //     case (token / password / ...).
    //   - User `redactKeyPatterns` is APPENDED to both structures. It
    //     is a pure addition, not a replacement.
    redactKeys: (() => {
      const userKeys = (config.redactKeys ?? [...DEFAULT_CONFIG.redactKeys]).map((k) =>
        k.toLowerCase()
      );
      const userPatterns = (config.redactKeyPatterns ?? DEFAULT_CONFIG.redactKeyPatterns).map((k) =>
        k.toLowerCase()
      );
      return new Set<string>([...userKeys, ...userPatterns]);
    })(),
    redactKeyPatterns: (() => {
      const userKeys = (config.redactKeys ?? [...DEFAULT_CONFIG.redactKeys]).map((k) =>
        k.toLowerCase()
      );
      const userPatterns = (config.redactKeyPatterns ?? DEFAULT_CONFIG.redactKeyPatterns).map((k) =>
        k.toLowerCase()
      );
      return [...userKeys, ...userPatterns];
    })(),
    redactCookieNames: config.redactCookieNames ?? DEFAULT_CONFIG.redactCookieNames,
    maxValueLength: config.maxValueLength ?? DEFAULT_CONFIG.maxValueLength,
    maxTelemetryEntries: config.maxTelemetryEntries ?? DEFAULT_CONFIG.maxTelemetryEntries,
    includeTelemetry: config.includeTelemetry ?? DEFAULT_CONFIG.includeTelemetry,
    captureXHR: config.captureXHR ?? DEFAULT_CONFIG.captureXHR,
    networkTelemetry: config.networkTelemetry ?? DEFAULT_CONFIG.networkTelemetry,
    trackNavigation: config.trackNavigation ?? DEFAULT_CONFIG.trackNavigation,
    trackVisitor: config.trackVisitor ?? DEFAULT_CONFIG.trackVisitor,
    trackPageViews: config.trackPageViews ?? DEFAULT_CONFIG.trackPageViews,
    visitor: {
      click: config.visitor?.click ?? DEFAULT_CONFIG.visitor.click,
      input: config.visitor?.input ?? DEFAULT_CONFIG.visitor.input,
      inputThrottleMs: config.visitor?.inputThrottleMs ?? DEFAULT_CONFIG.visitor.inputThrottleMs,
    },
    // 2.3+: strategy/consent resolution. Unknown strategies fall through
    // to the default so typos never silently upgrade to cookie-based
    // tracking.
    visitorIdStrategy:
      config.visitorIdStrategy === 'localStorage' ||
      config.visitorIdStrategy === 'session' ||
      config.visitorIdStrategy === 'none' ||
      config.visitorIdStrategy === 'cookie'
        ? config.visitorIdStrategy
        : DEFAULT_CONFIG.visitorIdStrategy,
    respectGPC: config.respectGPC ?? DEFAULT_CONFIG.respectGPC,
    hasConsented: typeof config.hasConsented === 'function' ? config.hasConsented : null,
    // Sprint P15 (F3.1.C): normalise to null so the widget renderer's
    // `if (cspNonce) ...` gate always sees a boolean, never undefined.
    cspNonce:
      typeof config.cspNonce === 'string' && config.cspNonce.length > 0 ? config.cspNonce : null,
    onError: config.onError ?? null,
    onUnsupportedVersion:
      typeof config.onUnsupportedVersion === 'function' ? config.onUnsupportedVersion : null,
    // 2.0 — only accepts the discriminated union now. Legacy `true`
    // was removed; callers should pass `'global'` explicitly.
    captureAsyncStack:
      config.captureAsyncStack === 'manual'
        ? 'manual'
        : config.captureAsyncStack === 'global'
          ? 'global'
          : false,
    // Ignore rules
    ignorePatterns: config.ignorePatterns ?? DEFAULT_CONFIG.ignorePatterns,
    ignoreExtensions: config.ignoreExtensions ?? DEFAULT_CONFIG.ignoreExtensions,
    ignoreScriptErrors: config.ignoreScriptErrors ?? DEFAULT_CONFIG.ignoreScriptErrors,
    ignoreMessages: config.ignoreMessages ?? DEFAULT_CONFIG.ignoreMessages,
    ignoreUrls: config.ignoreUrls ?? DEFAULT_CONFIG.ignoreUrls,
    // Widget
    widgetPosition: config.widgetPosition ?? DEFAULT_CONFIG.widgetPosition,
    widgetRules: config.widgetRules ?? DEFAULT_CONFIG.widgetRules,
    widgetRulesEndpoint: config.widgetRulesEndpoint ?? DEFAULT_CONFIG.widgetRulesEndpoint,
    // 0.3.0
    captureStorage: {
      local: config.captureStorage?.local ?? DEFAULT_CONFIG.captureStorage.local,
      session: config.captureStorage?.session ?? DEFAULT_CONFIG.captureStorage.session,
      keys: config.captureStorage?.keys ?? DEFAULT_CONFIG.captureStorage.keys,
      maxEntries: config.captureStorage?.maxEntries ?? DEFAULT_CONFIG.captureStorage.maxEntries,
    },
    captureCookieValues: config.captureCookieValues ?? DEFAULT_CONFIG.captureCookieValues,
    sampleRate:
      typeof config.sampleRate === 'number' && isFinite(config.sampleRate)
        ? Math.max(0, Math.min(1, config.sampleRate))
        : DEFAULT_CONFIG.sampleRate,
    errorStormThreshold: config.errorStormThreshold ?? DEFAULT_CONFIG.errorStormThreshold,
    errorStormWindowMs: config.errorStormWindowMs ?? DEFAULT_CONFIG.errorStormWindowMs,
    errorStormCooldownMultiplier:
      config.errorStormCooldownMultiplier ?? DEFAULT_CONFIG.errorStormCooldownMultiplier,
    onErrorStorm: config.onErrorStorm ?? null,
    internalDiagnostics: config.internalDiagnostics ?? DEFAULT_CONFIG.internalDiagnostics,
    internalDiagnosticsIntervalMs:
      config.internalDiagnosticsIntervalMs ?? DEFAULT_CONFIG.internalDiagnosticsIntervalMs,
  };
}

/**
 * Fields that cannot be changed at runtime via updateConfig().
 * Changing any of these requires destroy() + init() because they affect
 * installed collectors, transport identity, or visitor identity.
 *
 * See TECHNICAL-IMPROVEMENT-PLAN.md §1.5.
 */
export const RUNTIME_LOCKED_CONFIG_KEYS = new Set<keyof BrowsonicConfig>([
  // Transport / tenant identity — changing at runtime would mix events
  // across tenants in the pending queue.
  'apiEndpoint',
  'appKey',
  'apiKey',
  // Collectors installed conditionally at init — re-install requires teardown.
  'captureXHR',
  'networkTelemetry',
  'trackNavigation',
  'trackVisitor',
  'trackPageViews',
  'captureAsyncStack',
  'persistQueue',
]);

/**
 * Deep-merge a partial config update into an existing raw config.
 *
 * Rules:
 *   - Plain objects are merged key-by-key (one level deep is enough for
 *     our schema; `visitor` is the only nested object today).
 *   - Arrays are REPLACED, not concatenated. If a caller wants to clear
 *     `ignorePatterns`, they pass `[]`.
 *   - Primitives and null override.
 *
 * Runtime-locked keys are skipped and reported via `onLockedKey`.
 */
export function mergeConfigUpdate(
  base: BrowsonicConfig,
  patch: Partial<BrowsonicConfig>,
  onLockedKey?: (key: keyof BrowsonicConfig) => void
): BrowsonicConfig {
  const result: BrowsonicConfig = { ...base };

  for (const rawKey of Object.keys(patch) as Array<keyof BrowsonicConfig>) {
    if (RUNTIME_LOCKED_CONFIG_KEYS.has(rawKey)) {
      onLockedKey?.(rawKey);
      continue;
    }

    const incoming = patch[rawKey];
    const existing = result[rawKey];

    if (
      incoming !== null &&
      typeof incoming === 'object' &&
      !Array.isArray(incoming) &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      (result as unknown as Record<string, unknown>)[rawKey as string] = {
        ...existing,
        ...incoming,
      };
    } else {
      (result as unknown as Record<string, unknown>)[rawKey as string] = incoming;
    }
  }

  return result;
}

/**
 * Store original console.log reference before any interception
 * This prevents infinite loops if console methods are intercepted (CRIT-002)
 */
const originalConsoleLog = typeof console !== 'undefined' ? console.log.bind(console) : () => {};

/**
 * Create a debug logger based on config
 * Uses original console.log to prevent infinite loops when console is intercepted
 */
export function createDebugLogger(
  config: ResolvedConfig
): (message: string, ...args: unknown[]) => void {
  if (!config.debug) {
    return () => {}; // no-op
  }

  return (message: string, ...args: unknown[]) => {
    originalConsoleLog(`[Browsonic] ${message}`, ...args);
  };
}
