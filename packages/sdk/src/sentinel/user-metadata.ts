// SPDX-License-Identifier: Apache-2.0

/**
 * User context + custom metadata helpers — split out of browsonic.ts
 * during Sprint 8 so the main class stays under 300 LoC. The Browsonic
 * class keeps thin method delegations; all business logic lives here.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { UserContext } from '../types';
import { safeExecute } from '../utils';
import type { Browsonic } from './browsonic';

/**
 * Set user context. Sensitive fields are masked using the SDK's
 * configured `redactKeys`. Masking is substring-based (legacy behavior
 * kept for backward compat; see TECHNICAL-IMPROVEMENT-PLAN §3.1).
 */
export function setUser(sdk: Browsonic, user: UserContext): void {
  safeExecute(
    () => {
      const masked: UserContext = { ...user };

      if (sdk.config) {
        for (const key of Object.keys(masked)) {
          const lowerKey = key.toLowerCase();
          // Sprint P15 (F3.1.I): Set.has() fast path; redactKeyPatterns
          // substring fallback. Both are already lowercased by
          // resolveConfig, so we skip the per-iteration toLowerCase().
          const shouldRedact =
            sdk.config.redactKeys.has(lowerKey) ||
            sdk.config.redactKeyPatterns.some((rk) => lowerKey.includes(rk));
          if (shouldRedact && typeof masked[key] === 'string') {
            masked[key] = '***';
          }
        }
      }

      sdk.user = masked;
      sdk.debugLog('User set:', masked);
    },
    undefined,
    (error) => sdk.debugLog('setUser error:', error)
  );
}

export function clearUser(sdk: Browsonic): void {
  sdk.user = null;
  sdk.debugLog('User cleared');
}

export function addMetadata(sdk: Browsonic, key: string, value: string | number | boolean): void {
  safeExecute(
    () => {
      sdk.metadata[key] = value;
      sdk.debugLog(`Metadata added: ${key}=${value}`);
    },
    undefined,
    (error) => sdk.debugLog('addMetadata error:', error)
  );
}

export function removeMetadata(sdk: Browsonic, key: string): void {
  safeExecute(
    () => {
      delete sdk.metadata[key];
      sdk.debugLog(`Metadata removed: ${key}`);
    },
    undefined,
    (error) => sdk.debugLog('removeMetadata error:', error)
  );
}

export function clearMetadata(sdk: Browsonic): void {
  sdk.metadata = {};
  sdk.debugLog('Metadata cleared');
}

// ============================================================================
// Sprint 8 M1 — Sentry-compatible structured context surface
// ============================================================================

/**
 * Replace the named context bucket with a shallow copy of `ctx`. Each
 * call overwrites the previous bucket of the same name; partial
 * updates are intentionally NOT supported (callers compose the full
 * bucket once per change to avoid cross-render shared-reference bugs).
 */
export function setContext(sdk: Browsonic, name: string, ctx: Record<string, unknown>): void {
  safeExecute(
    () => {
      // Shallow-copy on write — host code may continue to mutate `ctx`
      // after the call without affecting subsequent events.
      sdk.contexts[name] = { ...ctx };
      sdk.debugLog(`Context set: ${name}`);
    },
    undefined,
    (error) => sdk.debugLog('setContext error:', error)
  );
}

export function removeContext(sdk: Browsonic, name: string): void {
  safeExecute(
    () => {
      delete sdk.contexts[name];
      sdk.debugLog(`Context removed: ${name}`);
    },
    undefined,
    (error) => sdk.debugLog('removeContext error:', error)
  );
}

export function clearContexts(sdk: Browsonic): void {
  sdk.contexts = {};
  sdk.debugLog('Contexts cleared');
}

/**
 * Set an event-level extra. Unlike {@link addMetadata}, the value is
 * `unknown` — any shape, including nested objects and arrays, is
 * allowed. Stored by reference (no clone): callers that mutate the
 * value after setting it WILL leak the mutation into subsequent
 * events. This matches Sentry's `setExtra` semantics; pass a fresh
 * object on every change if isolation matters.
 */
export function setExtra(sdk: Browsonic, key: string, value: unknown): void {
  safeExecute(
    () => {
      sdk.extras[key] = value;
      sdk.debugLog(`Extra set: ${key}`);
    },
    undefined,
    (error) => sdk.debugLog('setExtra error:', error)
  );
}

export function removeExtra(sdk: Browsonic, key: string): void {
  safeExecute(
    () => {
      delete sdk.extras[key];
      sdk.debugLog(`Extra removed: ${key}`);
    },
    undefined,
    (error) => sdk.debugLog('removeExtra error:', error)
  );
}

export function clearExtras(sdk: Browsonic): void {
  sdk.extras = {};
  sdk.debugLog('Extras cleared');
}
