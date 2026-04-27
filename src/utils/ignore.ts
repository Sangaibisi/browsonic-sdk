/**
 * @copyright 2024-2026 Browsonic. All rights reserved.
 * @license Proprietary - See LICENSE.md
 */

import type { BrowsonicEvent, ResolvedConfig } from '../types';

/**
 * Browser extension URL patterns
 */
const EXTENSION_PATTERNS = [
  'chrome-extension://',
  'moz-extension://',
  'safari-extension://',
  'safari-web-extension://',
  'ms-browser-extension://',
];

/**
 * Check if error should be ignored based on config rules
 * Returns true if the error should be IGNORED (not reported)
 */
export function shouldIgnoreError(
  event: BrowsonicEvent,
  config: ResolvedConfig,
  debugLog: (msg: string, ...args: unknown[]) => void
): boolean {
  const { message, stack, context } = event;
  const url = context?.url || '';

  // 1. Check ignoreScriptErrors - cross-origin "Script error" messages
  if (config.ignoreScriptErrors) {
    if (message === 'Script error.' || message === 'Script error') {
      debugLog('Ignoring cross-origin Script error');
      return true;
    }
  }

  // 2. Check ignoreExtensions - browser extension errors
  if (config.ignoreExtensions && stack) {
    for (const pattern of EXTENSION_PATTERNS) {
      if (stack.includes(pattern)) {
        debugLog(`Ignoring browser extension error: ${pattern}`);
        return true;
      }
    }
  }

  // 3. Check ignorePatterns - custom stack trace patterns
  if (config.ignorePatterns.length > 0 && stack) {
    for (const pattern of config.ignorePatterns) {
      if (stack.includes(pattern)) {
        debugLog(`Ignoring error matching stack pattern: ${pattern}`);
        return true;
      }
    }
  }

  // 4. Check ignoreMessages - custom message patterns
  if (config.ignoreMessages.length > 0) {
    for (const pattern of config.ignoreMessages) {
      if (message.includes(pattern)) {
        debugLog(`Ignoring error matching message pattern: ${pattern}`);
        return true;
      }
    }
  }

  // 5. Check ignoreUrls - URL patterns
  if (config.ignoreUrls.length > 0 && url) {
    for (const pattern of config.ignoreUrls) {
      if (url.includes(pattern)) {
        debugLog(`Ignoring error from URL pattern: ${pattern}`);
        return true;
      }
    }
  }

  return false;
}

/**
 * Common third-party script patterns that can be used with ignorePatterns
 * Exported for user convenience
 */
export const COMMON_THIRD_PARTY_PATTERNS = [
  // Analytics
  'googletagmanager.com',
  'google-analytics.com',
  'cdn.mxpnl.com', // Mixpanel
  'cdn.segment.com',
  'cdn.heapanalytics.com',
  'cdn.amplitude.com',

  // Social
  'connect.facebook.net',
  'platform.twitter.com',
  'platform.linkedin.com',

  // Ads
  'googlesyndication.com',
  'doubleclick.net',
  'ads.google.com',

  // Chat widgets
  'cdn.intercom.io',
  'js.driftt.com',
  'widget.intercom.io',

  // Other common
  'cdn.cookielaw.org',
  'cdn.onetrust.com',
];

/**
 * Common error messages that can be safely ignored
 */
export const COMMON_IGNORABLE_MESSAGES = [
  'ResizeObserver loop limit exceeded',
  'ResizeObserver loop completed with undelivered notifications',
  'Non-Error promise rejection captured',
  'Loading chunk',
  'ChunkLoadError',
];
