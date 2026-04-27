/**
 * shouldIgnoreError — filter rule regression suite.
 *
 * Covers all five ignore branches and the common-patterns exports.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shouldIgnoreError,
  COMMON_THIRD_PARTY_PATTERNS,
  COMMON_IGNORABLE_MESSAGES,
} from './ignore';
import { resolveConfig } from '../config';
import type { BrowsonicEvent } from '../types';

function makeEvent(over: Partial<BrowsonicEvent> = {}): BrowsonicEvent {
  return {
    eventId: 'e',
    timestamp: new Date().toISOString(),
    type: 'error',
    level: 'error',
    message: 'boom',
    stack: null,
    context: { url: 'https://example.com/a', referrer: '', pageAge: 0 },
    telemetry: null,
    ...over,
  };
}

function makeConfig(over: Partial<Parameters<typeof resolveConfig>[0]> = {}) {
  return resolveConfig({
    apiEndpoint: 'https://api.test',
    appKey: 'app',
    apiKey: 'k',
    trackPageViews: false,
    ...over,
  });
}

describe('shouldIgnoreError — ignoreScriptErrors', () => {
  it('drops "Script error." message when enabled (default)', () => {
    const debug = vi.fn();
    expect(shouldIgnoreError(makeEvent({ message: 'Script error.' }), makeConfig(), debug)).toBe(
      true
    );
    expect(shouldIgnoreError(makeEvent({ message: 'Script error' }), makeConfig(), debug)).toBe(
      true
    );
    expect(debug).toHaveBeenCalled();
  });

  it('keeps "Script error." when ignoreScriptErrors=false', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ message: 'Script error.' }),
        makeConfig({ ignoreScriptErrors: false }),
        () => {}
      )
    ).toBe(false);
  });
});

describe('shouldIgnoreError — ignoreExtensions', () => {
  it('drops errors from chrome-extension://', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at chrome-extension://abc123/content.js:5:1' }),
        makeConfig(),
        () => {}
      )
    ).toBe(true);
  });

  it('drops errors from moz-extension://', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at moz-extension://fff/helper.js:1:1' }),
        makeConfig(),
        () => {}
      )
    ).toBe(true);
  });

  it('drops errors from safari-web-extension://', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at safari-web-extension://e/x.js:1:1' }),
        makeConfig(),
        () => {}
      )
    ).toBe(true);
  });

  it('keeps extension errors when ignoreExtensions=false', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at chrome-extension://abc/x.js:1:1' }),
        makeConfig({ ignoreExtensions: false }),
        () => {}
      )
    ).toBe(false);
  });

  it('no-op when stack is null', () => {
    expect(shouldIgnoreError(makeEvent({ stack: null }), makeConfig(), () => {})).toBe(false);
  });
});

describe('shouldIgnoreError — ignorePatterns (stack)', () => {
  it('drops errors matching any stack pattern', () => {
    const config = makeConfig({
      ignorePatterns: ['cdn.mxpnl.com', 'google-analytics.com'],
    });
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at https://cdn.mxpnl.com/mp.js:12:34' }),
        config,
        () => {}
      )
    ).toBe(true);
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at https://www.google-analytics.com/ga.js:1:1' }),
        config,
        () => {}
      )
    ).toBe(true);
  });

  it('keeps errors whose stack does not match any pattern', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at https://app.example.com/main.js:10:1' }),
        makeConfig({ ignorePatterns: ['cdn.mxpnl.com'] }),
        () => {}
      )
    ).toBe(false);
  });

  it('no-op when ignorePatterns is empty', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ stack: 'at https://app.example.com/main.js:1:1' }),
        makeConfig(),
        () => {}
      )
    ).toBe(false);
  });
});

describe('shouldIgnoreError — ignoreMessages', () => {
  it('drops messages matching any substring', () => {
    const config = makeConfig({
      ignoreMessages: ['ResizeObserver loop', 'Loading chunk'],
    });
    expect(
      shouldIgnoreError(
        makeEvent({ message: 'ResizeObserver loop limit exceeded' }),
        config,
        () => {}
      )
    ).toBe(true);
    expect(
      shouldIgnoreError(makeEvent({ message: 'Loading chunk 5 failed' }), config, () => {})
    ).toBe(true);
  });

  it('keeps messages that do not match', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ message: 'Something totally different' }),
        makeConfig({ ignoreMessages: ['ResizeObserver loop'] }),
        () => {}
      )
    ).toBe(false);
  });
});

describe('shouldIgnoreError — ignoreUrls', () => {
  it('drops events whose context URL matches a pattern', () => {
    const config = makeConfig({ ignoreUrls: ['/health', '/ping'] });
    expect(
      shouldIgnoreError(
        makeEvent({ context: { url: 'https://api.test/health', referrer: '', pageAge: 0 } }),
        config,
        () => {}
      )
    ).toBe(true);
  });

  it('keeps events when URL is empty', () => {
    expect(
      shouldIgnoreError(
        makeEvent({ context: { url: '', referrer: '', pageAge: 0 } }),
        makeConfig({ ignoreUrls: ['/x'] }),
        () => {}
      )
    ).toBe(false);
  });
});

describe('common patterns exports', () => {
  it('exports a non-empty list of third-party patterns', () => {
    expect(COMMON_THIRD_PARTY_PATTERNS.length).toBeGreaterThan(10);
    expect(COMMON_THIRD_PARTY_PATTERNS).toContain('googletagmanager.com');
    expect(COMMON_THIRD_PARTY_PATTERNS).toContain('cdn.mxpnl.com');
  });

  it('exports common ignorable messages', () => {
    expect(COMMON_IGNORABLE_MESSAGES).toContain('ResizeObserver loop limit exceeded');
    expect(COMMON_IGNORABLE_MESSAGES).toContain('Loading chunk');
  });
});
