// SPDX-License-Identifier: Apache-2.0

/**
 * Widget content sanitization.
 *
 * Mitigates CVE-class issues for server-delivered widget notifications:
 *   - `javascript:` / `data:` / `vbscript:` URL XSS on `actionUrl`
 *   - Unbounded title/message from a compromised widget-rules endpoint
 *
 * See TECHNICAL-IMPROVEMENT-PLAN.md §1.1.
 * See PERFORMANCE-STRATEGY.md §1 — sanitize must be < 100μs per notification.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

import type { WidgetNotification } from '../types';

/**
 * URL protocols allowed in widget action links.
 * Anything else — most importantly `javascript:` and `data:` — is dropped.
 */
const ALLOWED_URL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/** Max characters for widget notification title (client-side hard limit). */
export const MAX_TITLE_LENGTH = 120;

/** Max characters for widget notification message. */
export const MAX_MESSAGE_LENGTH = 500;

/** Max characters for the action button label. */
export const MAX_ACTION_LABEL_LENGTH = 40;

/**
 * Parse and validate a URL for use in a widget action link.
 *
 * Returns the normalized absolute URL string if the protocol is in
 * ALLOWED_URL_PROTOCOLS, or `null` if the URL is missing, unparseable,
 * or uses a disallowed protocol (including `javascript:`).
 *
 * Relative URLs are resolved against the document origin when available,
 * falling back to `https://localhost` as a dummy base for Node/worker contexts.
 */
export function sanitizeActionUrl(candidate: string | undefined | null): string | null {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = candidate.trim();
  if (trimmed.length === 0) return null;

  // Reject strings containing control characters / newlines (spec-compliant URLs don't have these).
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F]/.test(trimmed)) return null;

  let base: string;
  try {
    base =
      typeof document !== 'undefined' && document.location
        ? document.location.origin
        : 'https://localhost';
  } catch {
    base = 'https://localhost';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed, base);
  } catch {
    return null;
  }

  if (!ALLOWED_URL_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }

  return parsed.toString();
}

/**
 * Truncate a string to a hard maximum with an ellipsis suffix.
 * Returns the original string if already within bounds.
 */
function clamp(str: string, max: number): string {
  if (typeof str !== 'string') return '';
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

/**
 * Produce a fully-sanitized copy of a widget notification for rendering.
 *
 * Enforced invariants on the returned object:
 *   - title: non-empty, ≤ MAX_TITLE_LENGTH
 *   - message: non-empty, ≤ MAX_MESSAGE_LENGTH
 *   - severity: one of 'info' | 'warning' | 'error' (default 'error')
 *   - actionUrl: either a safe URL string or undefined (never `javascript:` etc.)
 *   - actionLabel: ≤ MAX_ACTION_LABEL_LENGTH, defaulted if missing
 *   - autoDismissMs: finite non-negative integer or 0
 *
 * Returns `null` if the notification cannot yield a safe-to-render result
 * (e.g. empty title AND empty message).
 */
export function sanitizeNotification(n: WidgetNotification): WidgetNotification | null {
  const title = clamp(String(n.title ?? '').trim(), MAX_TITLE_LENGTH);
  const message = clamp(String(n.message ?? '').trim(), MAX_MESSAGE_LENGTH);
  if (!title && !message) return null;

  const severity: WidgetNotification['severity'] =
    n.severity === 'info' || n.severity === 'warning' || n.severity === 'error'
      ? n.severity
      : 'error';

  const safeUrl = sanitizeActionUrl(n.actionUrl ?? null);
  const actionUrl = safeUrl ?? undefined;
  const actionLabel = actionUrl
    ? clamp(String(n.actionLabel ?? 'Learn more').trim() || 'Learn more', MAX_ACTION_LABEL_LENGTH)
    : undefined;

  const rawAutoDismiss = Number(n.autoDismissMs);
  const autoDismissMs =
    Number.isFinite(rawAutoDismiss) && rawAutoDismiss >= 0 ? Math.floor(rawAutoDismiss) : 0;

  return {
    title: title || message, // ensure non-empty
    message,
    severity,
    actionUrl,
    actionLabel,
    autoDismissMs,
  };
}
