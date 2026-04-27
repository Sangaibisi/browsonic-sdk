/**
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

/**
 * Visitor tracking module — manages the visitor identifier used in
 * pageview telemetry. Supports four storage strategies with consent +
 * Global Privacy Control (GPC) overrides (Sprint P14, F3.1.A).
 *
 * Storage strategies
 *   - `cookie` (legacy default): 1-year cookie {@code browsonic_vid},
 *     persistent across tabs and sessions.
 *   - `localStorage`: cross-session but origin-scoped, no HTTP overhead.
 *   - `session`: `sessionStorage`, resets on tab close — privacy-safe
 *     default for new apps.
 *   - `none`: fresh UUID every call, unlinkable. Used automatically
 *     when GPC is signalled or the consent gate returns false.
 *
 * Consent gates
 *   - `navigator.globalPrivacyControl === true` + `respectGPC`: force `none`.
 *   - `hasConsented?.() === false`: force `none`.
 *
 * The legacy zero-arg {@link getOrCreateVisitorId} signature is kept so
 * older collectors (and external plugins) that haven't migrated to the
 * config-aware variant still work — they fall through to the legacy
 * cookie behaviour.
 */

import { uuid } from '../utils';
import type { ResolvedConfig } from '../types';

type VisitorIdStrategy = ResolvedConfig['visitorIdStrategy'];

const COOKIE_NAME = 'browsonic_vid';
const STORAGE_KEY = 'browsonic_vid';
const SESSION_STORAGE_KEY = 'browsonic_vid';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year in seconds

/**
 * Resolved visitor-consent snapshot evaluated for this call. Split into
 * a pure function so tests can drive the branches without stubbing the
 * global `navigator`.
 */
function resolveEffectiveStrategy(
  strategy: VisitorIdStrategy,
  respectGPC: boolean,
  hasConsented: (() => boolean) | null
): VisitorIdStrategy {
  if (respectGPC && isGpcSignalled()) return 'none';
  if (hasConsented && hasConsented() === false) return 'none';
  return strategy;
}

function isGpcSignalled(): boolean {
  if (typeof navigator === 'undefined') return false;
  // `globalPrivacyControl` is a stage-3 browser field; not in lib.dom
  // yet on older TS versions, so read it via a safe accessor.
  const flag = (navigator as unknown as { globalPrivacyControl?: boolean }).globalPrivacyControl;
  return flag === true;
}

/**
 * Get or create a visitor ID. Config-aware overload (2.3+) — callers
 * that have a {@link ResolvedConfig} should pass it so the strategy +
 * consent gates are honoured. Calling without arguments keeps the
 * legacy cookie behaviour for back-compat with older collectors.
 */
export function getOrCreateVisitorId(config?: ResolvedConfig): string {
  if (!config) {
    // Legacy path — identical to pre-2.3 behaviour.
    return getOrCreateCookieId();
  }

  const effective = resolveEffectiveStrategy(
    config.visitorIdStrategy,
    config.respectGPC,
    config.hasConsented
  );

  switch (effective) {
    case 'cookie':
      return getOrCreateCookieId();
    case 'localStorage':
      return getOrCreateLocalStorageId();
    case 'session':
      return getOrCreateSessionStorageId();
    case 'none':
      return uuid();
  }
}

/**
 * Clear the persistent visitor ID regardless of strategy. Called by the
 * host app on logout + by test suites.
 */
export function clearVisitorId(): void {
  if (typeof document !== 'undefined') {
    try {
      document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    } catch {
      /* ignore cookie errors */
    }
  }
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  }
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  }
}

// --- Strategy implementations -----------------------------------------

function getOrCreateCookieId(): string {
  const existingId = getVisitorIdFromCookie();
  if (existingId) return existingId;
  const newId = uuid();
  setVisitorIdCookie(newId);
  return newId;
}

function getOrCreateLocalStorageId(): string {
  if (typeof localStorage === 'undefined') return uuid();
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const newId = uuid();
    localStorage.setItem(STORAGE_KEY, newId);
    return newId;
  } catch {
    // Storage blocked (Safari private mode, quota exceeded, …) →
    // fall through to an ephemeral ID rather than crashing.
    return uuid();
  }
}

function getOrCreateSessionStorageId(): string {
  if (typeof sessionStorage === 'undefined') return uuid();
  try {
    const existing = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const newId = uuid();
    sessionStorage.setItem(SESSION_STORAGE_KEY, newId);
    return newId;
  } catch {
    return uuid();
  }
}

function getVisitorIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie.match(
      new RegExp('(?:^|;\\s*)' + COOKIE_NAME + '\\s*=\\s*([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

function setVisitorIdCookie(visitorId: string): void {
  if (typeof document === 'undefined') return;
  try {
    const expires = new Date(Date.now() + COOKIE_MAX_AGE * 1000).toUTCString();
    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(visitorId)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    /* ignore cookie errors */
  }
}

/** Testing-only: expose the pure resolver so tests don't need globals. */
export const __test = {
  resolveEffectiveStrategy,
  isGpcSignalled,
};
