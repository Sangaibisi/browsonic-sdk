// SPDX-License-Identifier: Apache-2.0

/**
 * Runtime environment guards (Sprint 9 M1). Two init-time checks
 * decide whether the SDK should refuse to initialise at all:
 *
 *   1. Browser extension contexts — the SDK is meant for first-party
 *      web pages. Loading inside `chrome-extension://`, `moz-extension://`,
 *      Safari/Edge equivalents would route extension errors to the
 *      consumer's ingest endpoint, polluting their telemetry.
 *
 *   2. Known bot user agents — Googlebot, Bingbot, Slackbot, the
 *      headless preview tools every team has on staging. Telemetry
 *      from bots is rarely actionable and inflates volume.
 *
 * Both checks are advisory: the host app can opt out via config
 * (`ignoreInExtensionContext: false`, `ignoreBots: false`,
 * `botPatterns: [...]`).
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

/**
 * Default bot user-agent fragment list. Substring match (case-
 * insensitive). Conservative — adds known crawlers, OG/preview
 * fetchers, and generic "headless"/"phantom" markers without trying
 * to be exhaustive. Hosts that need more aggressive filtering can
 * extend the list via `BrowsonicConfig.botPatterns`.
 */
export const DEFAULT_BOT_PATTERNS: readonly string[] = [
  'googlebot',
  'bingbot',
  'yandexbot',
  'baiduspider',
  'duckduckbot',
  'applebot',
  'slackbot',
  'twitterbot',
  'facebookexternalhit',
  'linkedinbot',
  'embedly',
  'discordbot',
  'whatsapp',
  'telegrambot',
  'pinterestbot',
  'redditbot',
  'msnbot',
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'phantomjs',
  'headlesschrome',
  'puppeteer',
  'playwright',
  'lighthouse',
  'pagespeed',
  'gtmetrix',
];

/**
 * Browser extension URL protocol prefixes. Match against
 * `window.location.protocol` (with trailing `:`) and against the
 * full URL prefix in `window.location.href` (defensive — older
 * browsers reported the protocol differently).
 */
const EXTENSION_PROTOCOLS: readonly string[] = [
  'chrome-extension:',
  'moz-extension:',
  'safari-extension:',
  'safari-web-extension:',
  'ms-browser-extension:',
  'edge-extension:',
  'opera-extension:',
];

/**
 * Returns true when the current page is loaded inside a browser
 * extension context. Safe in non-browser environments (Node /
 * Web Worker without `location`) — returns false.
 */
export function isExtensionContext(): boolean {
  if (typeof window === 'undefined') return false;
  const loc = window.location;
  if (!loc) return false;

  // Primary check — protocol scheme. Modern browsers expose the
  // extension protocol cleanly here.
  const protocol = (loc.protocol ?? '').toLowerCase();
  if (EXTENSION_PROTOCOLS.includes(protocol)) {
    return true;
  }

  // Defensive check — older Safari and embedded webviews sometimes
  // expose the extension prefix only inside `href`. Match against
  // the protocol prefix forms (`chrome-extension://...`).
  const href = (loc.href ?? '').toLowerCase();
  for (const proto of EXTENSION_PROTOCOLS) {
    if (href.startsWith(`${proto}//`)) return true;
  }

  return false;
}

/**
 * Returns true when `userAgent` matches any of the supplied bot
 * patterns (substring, case-insensitive). When no `userAgent` is
 * supplied, falls back to `navigator.userAgent`.
 *
 * `customPatterns`, when supplied, REPLACES the default list — the
 * caller can compose by spreading {@link DEFAULT_BOT_PATTERNS}:
 *
 * ```ts
 * isBotUserAgent(navigator.userAgent, [...DEFAULT_BOT_PATTERNS, 'mybot'])
 * ```
 */
export function isBotUserAgent(userAgent?: string, customPatterns?: readonly string[]): boolean {
  const ua = userAgent ?? readNavigatorUserAgent();
  if (!ua) return false;

  const lowerUa = ua.toLowerCase();
  const patterns = customPatterns ?? DEFAULT_BOT_PATTERNS;
  for (const pattern of patterns) {
    if (pattern.length > 0 && lowerUa.includes(pattern.toLowerCase())) {
      return true;
    }
  }
  return false;
}

function readNavigatorUserAgent(): string {
  if (typeof navigator === 'undefined') return '';
  try {
    return navigator.userAgent ?? '';
  } catch {
    // Some sandboxed environments throw on navigator access.
    return '';
  }
}
