// SPDX-License-Identifier: Apache-2.0

/**
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { EventContext, SessionContext, ResolvedConfig } from '../types';
import { safeExecute, truncate } from '../utils';

/**
 * Dependency detection is opt-in at bundle level. The core entry never
 * imports the dependency-detection module; main entry registers a
 * provider via `setDependenciesProvider()` so tree-shake strips the
 * ~2.5 KB library-probe table from core bundles.
 */
let dependenciesProvider: () => Record<string, string> = () => ({});
export function setDependenciesProvider(fn: () => Record<string, string>): void {
  dependenciesProvider = fn;
}

// Store page load time at module initialization
const pageLoadTime =
  typeof performance !== 'undefined' && performance.timing
    ? performance.timing.navigationStart
    : Date.now();

/**
 * Collect lightweight event-level context (called per event)
 * This contains only data specific to the moment the event occurred
 */
export function collectEventContext(): EventContext {
  const defaultContext: EventContext = {
    url: '',
    referrer: '',
    pageAge: 0,
  };

  if (typeof window === 'undefined') {
    return defaultContext;
  }

  return safeExecute(
    () => ({
      url: window.location.href,
      referrer: document.referrer || '',
      pageAge: Date.now() - pageLoadTime,
    }),
    defaultContext
  );
}

/**
 * Collect heavy session-level context (called once per batch)
 * This contains storage, cookies, and other session data
 */
export function collectSessionContext(config: ResolvedConfig): SessionContext {
  const defaultContext: SessionContext = {
    localStorage: {},
    sessionStorage: {},
    cookies: '',
    userAgent: '',
    language: '',
    timezone: '',
    viewport: { width: 0, height: 0 },
    dependencies: {},
  };

  if (typeof window === 'undefined') {
    return defaultContext;
  }

  return safeExecute(
    () => ({
      // 0.3.0: storage capture is opt-in via `captureStorage.local` / `.session`.
      localStorage: config.captureStorage.local ? collectStorage('localStorage', config) : {},
      sessionStorage: config.captureStorage.session ? collectStorage('sessionStorage', config) : {},
      cookies: collectCookies(config),
      userAgent: navigator.userAgent || '',
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      viewport: {
        width: window.innerWidth || 0,
        height: window.innerHeight || 0,
      },
      dependencies: dependenciesProvider(),
    }),
    defaultContext
  );
}

/**
 * Collect and mask storage (localStorage or sessionStorage)
 */
function collectStorage(
  type: 'localStorage' | 'sessionStorage',
  config: ResolvedConfig
): Record<string, string> {
  const result: Record<string, string> = {};

  return safeExecute(() => {
    const storage = type === 'localStorage' ? localStorage : sessionStorage;
    const allKeys = Object.keys(storage);

    // 0.3.0: prefer `captureStorage.keys` allow-list if provided.
    const allowList = config.captureStorage.keys;
    const maxEntries = config.captureStorage.maxEntries;
    const selectedKeys = allowList
      ? allKeys.filter((k) => allowList.includes(k))
      : allKeys.slice(0, maxEntries);

    for (const key of selectedKeys) {
      const value = storage.getItem(key);
      if (value !== null) {
        result[key] = maskValue(key, value, config);
      }
    }

    return result;
  }, result);
}

/**
 * Collect and mask cookies
 */
function collectCookies(config: ResolvedConfig): string {
  return safeExecute(() => {
    const cookies = document.cookie;
    if (!cookies) return '';

    // 0.3.0: default is names-only; values are captured only when
    // `captureCookieValues: true` is explicitly set.
    const includeValues = config.captureCookieValues;

    const maskedParts = cookies.split(';').map((part) => {
      const [name, ...valueParts] = part.trim().split('=');
      const value = valueParts.join('=');

      if (!name) return part;
      const rawName = name.trim();

      if (!includeValues) {
        // Names-only mode — emit bare name, no value.
        return rawName;
      }

      const trimmedName = rawName.toLowerCase();
      // Sprint P15 (F3.1.I): redactKeys is a Set<string> (exact match
      // fast path) and redactKeyPatterns is the substring fallback —
      // both arrive pre-lowercased from resolveConfig. redactCookieNames
      // is a user list so we still lowercase defensively here (cheap,
      // called at most once per cookie per event).
      const shouldRedact =
        config.redactCookieNames.some((r) => trimmedName.includes(r.toLowerCase())) ||
        config.redactKeys.has(trimmedName) ||
        config.redactKeyPatterns.some((k) => trimmedName.includes(k));

      if (shouldRedact) return `${name}=***`;

      const truncatedValue = truncate(value, config.maxValueLength);
      return `${name}=${truncatedValue}`;
    });

    return maskedParts.join('; ');
  }, '');
}

/**
 * Mask sensitive values based on key name
 */
function maskValue(key: string, value: string, config: ResolvedConfig): string {
  const lowerKey = key.toLowerCase();

  // Sprint P15 (F3.1.I): exact-match Set first (~40x faster than the
  // old Array.some-includes loop when the key equals a default like
  // `token`), substring patterns as the fallback that still catches
  // `auth_token` / `user_password` style names.
  const shouldRedact =
    config.redactKeys.has(lowerKey) ||
    config.redactKeyPatterns.some((pattern) => lowerKey.includes(pattern));

  if (shouldRedact) {
    return '***';
  }

  // Truncate long values
  return truncate(value, config.maxValueLength);
}

/**
 * Check if collected session context exceeds size limits and truncate if needed
 */
export function truncateSessionContext(
  context: SessionContext,
  config: ResolvedConfig
): { context: SessionContext; truncated: boolean } {
  let truncated = false;
  const cap = config.captureStorage.maxEntries;

  const localStorageKeys = Object.keys(context.localStorage);
  if (localStorageKeys.length > cap) {
    const limited: Record<string, string> = {};
    localStorageKeys.slice(0, cap).forEach((key) => {
      limited[key] = context.localStorage[key];
    });
    context.localStorage = limited;
    truncated = true;
  }

  const sessionStorageKeys = Object.keys(context.sessionStorage);
  if (sessionStorageKeys.length > cap) {
    const limited: Record<string, string> = {};
    sessionStorageKeys.slice(0, cap).forEach((key) => {
      limited[key] = context.sessionStorage[key];
    });
    context.sessionStorage = limited;
    truncated = true;
  }

  return { context, truncated };
}
