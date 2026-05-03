// SPDX-License-Identifier: Apache-2.0

/**
 * Structured debug logger (Sprint P15 / F3.1.E).
 *
 * The original `debugLog: (msg, ...args) => void` signature that every
 * module passes around is kept for backward compatibility — removing
 * it would be a Sprint 3.0 breaking change. This helper adds a
 * structured `{ info, warn, error }` interface for callers that want
 * to attach a namespace + payload and route to a host-app log
 * aggregator (Sentry, Splunk, Datadog) via a plugin.
 *
 * Design goals:
 *
 *   1. Zero overhead when `config.debug === false`. Every call goes
 *      through a gated no-op so minifiers can prove the calls are
 *      unreachable and drop them entirely at build time.
 *   2. Plain `console.*` output in debug mode — no dependency on the
 *      browser's structured cloning (some host apps proxy `console.log`
 *      through their own transport and we don't want to fight them).
 *   3. Namespace prefix so grep'ing host-app logs for SDK noise is
 *      trivial. All messages are prefixed with `[Browsonic:<namespace>]`.
 *
 * Usage (plugin author):
 *
 * ```ts
 * const logger = createDebugLogger(ctx.config, 'my-plugin');
 * logger.info('installed', { pluginVersion: '1.0.0' });
 * logger.warn('endpoint 429', { retryAfter: 60 });
 * logger.error('failed to init', err, { retries: 3 });
 * ```
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { ResolvedConfig } from '../types';

export interface DebugLogger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, err?: unknown, data?: Record<string, unknown>): void;
}

const DEFAULT_NAMESPACE = 'sdk';

/**
 * Build a scoped logger. The `namespace` is emitted as the prefix for
 * every line; pass something like `'widget'` or `'queue'` so host apps
 * can filter SDK chatter in their own log viewer.
 */
export function createDebugLogger(
  config: ResolvedConfig,
  namespace: string = DEFAULT_NAMESPACE
): DebugLogger {
  if (!config.debug) {
    return NOOP_LOGGER;
  }

  const prefix = `[Browsonic:${namespace}]`;

  return {
    info(message, data) {
      console.log(prefix, message, data ?? '');
    },
    warn(message, data) {
      console.warn(prefix, message, data ?? '');
    },
    error(message, err, data) {
      // `err` kept separate from `data` so browsers' default console
      // error rendering still surfaces the stack trace. Inlining into
      // `data` would stringify it on some consoles.

      console.error(prefix, message, err ?? '', data ?? '');
    },
  };
}

const NOOP_LOGGER: DebugLogger = Object.freeze({
  info: () => {},
  warn: () => {},
  error: () => {},
});

/**
 * Back-compat adapter: wrap the legacy {@code (msg, ...args) => void}
 * callback into a {@link DebugLogger}. Preserves existing call sites
 * while letting new plugin code use the structured interface.
 */
export function adaptLegacyDebugLog(
  legacy: (message: string, ...args: unknown[]) => void
): DebugLogger {
  return {
    info(message, data) {
      legacy(message, data);
    },
    warn(message, data) {
      legacy(`[warn] ${message}`, data);
    },
    error(message, err, data) {
      legacy(`[error] ${message}`, err, data);
    },
  };
}
