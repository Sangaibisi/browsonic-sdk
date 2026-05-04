// SPDX-License-Identifier: Apache-2.0

/**
 * Runtime environment guard regression suite (Sprint 9 M1).
 * Locks in extension-context detection across browsers, bot
 * pattern matching with case-insensitive substring rules, and
 * the default-vs-custom pattern dispatch.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { isExtensionContext, isBotUserAgent, DEFAULT_BOT_PATTERNS } from './runtime-environment';

const ORIGINAL_LOCATION = typeof window !== 'undefined' ? window.location : null;

afterEach(() => {
  // Reset window.location in happy-dom so tests don't leak.
  if (typeof window !== 'undefined' && ORIGINAL_LOCATION) {
    try {
      window.history.pushState({}, '', '/');
    } catch {
      // ignore
    }
  }
});

describe('isExtensionContext', () => {
  it('returns false on a normal https page', () => {
    expect(isExtensionContext()).toBe(false);
  });

  it('returns true when protocol is chrome-extension:', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'chrome-extension:',
        href: 'chrome-extension://abc/popup.html',
      },
    });
    expect(isExtensionContext()).toBe(true);
  });

  it('returns true when protocol is moz-extension:', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'moz-extension:', href: 'moz-extension://abc/page.html' },
    });
    expect(isExtensionContext()).toBe(true);
  });

  it('returns true for safari-web-extension:', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        protocol: 'safari-web-extension:',
        href: 'safari-web-extension://abc/x',
      },
    });
    expect(isExtensionContext()).toBe(true);
  });

  it('matches via href prefix when protocol field is missing', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: '', href: 'chrome-extension://xyz/popup.html' },
    });
    expect(isExtensionContext()).toBe(true);
  });

  it('protocol matching is case-insensitive', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { protocol: 'CHROME-EXTENSION:', href: '' },
    });
    expect(isExtensionContext()).toBe(true);
  });
});

describe('isBotUserAgent', () => {
  it('returns false for a normal browser UA', () => {
    expect(
      isBotUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      )
    ).toBe(false);
  });

  it('matches Googlebot', () => {
    expect(
      isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')
    ).toBe(true);
  });

  it('matches Bingbot', () => {
    expect(isBotUserAgent('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true);
  });

  it('matches Slackbot regardless of case', () => {
    expect(isBotUserAgent('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true);
  });

  it('matches headless Chrome', () => {
    expect(
      isBotUserAgent('Mozilla/5.0 (X11) AppleWebKit/537.36 HeadlessChrome/130.0.0.0 Safari/537.36')
    ).toBe(true);
  });

  it('matches Puppeteer / Playwright', () => {
    expect(isBotUserAgent('Mozilla/5.0 (X11) Puppeteer/10.0')).toBe(true);
    expect(isBotUserAgent('Mozilla/5.0 (X11) Playwright/1.0')).toBe(true);
  });

  it('returns false for empty UA', () => {
    expect(isBotUserAgent('')).toBe(false);
  });

  it('respects custom patterns and ignores defaults when both are passed', () => {
    expect(isBotUserAgent('Mozilla custom-tester', ['custom-tester'])).toBe(true);
    // Default Googlebot should NOT match when custom list is supplied.
    expect(isBotUserAgent('Googlebot/2.1', ['custom-tester'])).toBe(false);
  });

  it('skips empty pattern entries safely', () => {
    expect(isBotUserAgent('Googlebot', ['', 'googlebot'])).toBe(true);
  });
});

describe('DEFAULT_BOT_PATTERNS', () => {
  it('contains the major search engine crawlers', () => {
    expect(DEFAULT_BOT_PATTERNS).toContain('googlebot');
    expect(DEFAULT_BOT_PATTERNS).toContain('bingbot');
    expect(DEFAULT_BOT_PATTERNS).toContain('duckduckbot');
  });

  it('contains link-preview bots used by major social platforms', () => {
    expect(DEFAULT_BOT_PATTERNS).toContain('slackbot');
    expect(DEFAULT_BOT_PATTERNS).toContain('twitterbot');
    expect(DEFAULT_BOT_PATTERNS).toContain('facebookexternalhit');
    expect(DEFAULT_BOT_PATTERNS).toContain('linkedinbot');
  });

  it('contains headless / automation tooling markers', () => {
    expect(DEFAULT_BOT_PATTERNS).toContain('headlesschrome');
    expect(DEFAULT_BOT_PATTERNS).toContain('puppeteer');
    expect(DEFAULT_BOT_PATTERNS).toContain('playwright');
    expect(DEFAULT_BOT_PATTERNS).toContain('lighthouse');
  });
});
