/**
 * updateConfig deep-merge + runtime-lock regression suite.
 * Covers TEKNIK-IYILESTIRME-PLANI.md §1.5.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  mergeConfigUpdate,
  RUNTIME_LOCKED_CONFIG_KEYS,
  resolveConfig,
  validateConfig,
} from './index';
import type { BrowsonicConfig } from '../types';

const BASE: BrowsonicConfig = {
  apiEndpoint: 'https://api.example.com',
  appKey: 'app',
  apiKey: 'key',
  environment: 'production',
  debug: false,
  captureLevels: ['error'],
  visitor: { click: true, input: true, inputThrottleMs: 500 },
  ignorePatterns: ['pattern-a', 'pattern-b'],
};

describe('mergeConfigUpdate — nested objects', () => {
  it('preserves sibling keys when partial nested object provided', () => {
    const merged = mergeConfigUpdate(BASE, { visitor: { click: false } });
    expect(merged.visitor).toEqual({
      click: false,
      input: true, // preserved
      inputThrottleMs: 500, // preserved
    });
  });

  it('resolveConfig after merge yields all visitor defaults intact', () => {
    const merged = mergeConfigUpdate(BASE, { visitor: { inputThrottleMs: 1000 } });
    const resolved = resolveConfig(merged);
    expect(resolved.visitor.click).toBe(true);
    expect(resolved.visitor.input).toBe(true);
    expect(resolved.visitor.inputThrottleMs).toBe(1000);
  });
});

describe('mergeConfigUpdate — arrays are replaced, not concatenated', () => {
  it('replaces ignorePatterns when new value provided', () => {
    const merged = mergeConfigUpdate(BASE, { ignorePatterns: ['only-this'] });
    expect(merged.ignorePatterns).toEqual(['only-this']);
  });

  it('empty array clears the list', () => {
    const merged = mergeConfigUpdate(BASE, { ignorePatterns: [] });
    expect(merged.ignorePatterns).toEqual([]);
  });

  it('captureLevels replaced', () => {
    const merged = mergeConfigUpdate(BASE, { captureLevels: ['warn', 'info'] });
    expect(merged.captureLevels).toEqual(['warn', 'info']);
  });
});

describe('mergeConfigUpdate — runtime-locked keys', () => {
  it('skips apiEndpoint and reports via onLockedKey', () => {
    const onLocked = vi.fn();
    const merged = mergeConfigUpdate(BASE, { apiEndpoint: 'https://evil.com' }, onLocked);
    expect(merged.apiEndpoint).toBe(BASE.apiEndpoint); // unchanged
    expect(onLocked).toHaveBeenCalledWith('apiEndpoint');
  });

  it('skips all locked keys silently when no callback given', () => {
    const merged = mergeConfigUpdate(BASE, {
      apiEndpoint: 'https://evil.com',
      appKey: 'changed',
      apiKey: 'changed',
      captureXHR: false,
      persistQueue: true,
    });
    expect(merged.apiEndpoint).toBe(BASE.apiEndpoint);
    expect(merged.appKey).toBe(BASE.appKey);
    expect(merged.apiKey).toBe(BASE.apiKey);
    expect(merged.captureXHR).toBeUndefined();
    expect(merged.persistQueue).toBeUndefined();
  });

  it('allows non-locked keys alongside locked ones', () => {
    const onLocked = vi.fn();
    const merged = mergeConfigUpdate(
      BASE,
      { apiEndpoint: 'https://evil.com', debug: true },
      onLocked
    );
    expect(merged.apiEndpoint).toBe(BASE.apiEndpoint);
    expect(merged.debug).toBe(true);
  });

  it('lock list contains expected safety-critical keys', () => {
    // Sanity: if someone removes one by accident, this catches it.
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('apiEndpoint')).toBe(true);
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('appKey')).toBe(true);
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('apiKey')).toBe(true);
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('trackPageViews')).toBe(true);
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('persistQueue')).toBe(true);
  });

  it('non-locked keys can be updated freely', () => {
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('debug')).toBe(false);
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('flushIntervalMs')).toBe(false);
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('captureLevels')).toBe(false);
    expect(RUNTIME_LOCKED_CONFIG_KEYS.has('ignorePatterns')).toBe(false);
  });
});

describe('validateConfig', () => {
  it('requires apiEndpoint and appKey', () => {
    const v = validateConfig({} as BrowsonicConfig);
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThan(0);
  });

  it('rejects non-http(s) endpoints (javascript:)', () => {
    const v = validateConfig({
      apiEndpoint: 'javascript:alert(1)',
      appKey: 'x',
      trackPageViews: false,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('protocol'))).toBe(true);
  });

  it('rejects data: URLs', () => {
    const v = validateConfig({
      apiEndpoint: 'data:text/html,<script>alert(1)</script>',
      appKey: 'x',
      trackPageViews: false,
    });
    expect(v.valid).toBe(false);
  });

  it('rejects file: URLs', () => {
    const v = validateConfig({
      apiEndpoint: 'file:///etc/passwd',
      appKey: 'x',
      trackPageViews: false,
    });
    expect(v.valid).toBe(false);
  });

  it('rejects endpoints with embedded userinfo', () => {
    // Prevents credential leakage via typo'd endpoint and parser-trick
    // hosts like `https://user:pass@trusted.example.com`.
    const v = validateConfig({
      apiEndpoint: 'https://user:pass@api.example.com',
      appKey: 'x',
      trackPageViews: false,
    });
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.includes('userinfo'))).toBe(true);
  });

  it('rejects unparseable endpoints', () => {
    const v = validateConfig({
      apiEndpoint: 'not a url at all!',
      appKey: 'x',
      trackPageViews: false,
    });
    expect(v.valid).toBe(false);
  });

  it('accepts http and https endpoints', () => {
    const a = validateConfig({
      apiEndpoint: 'https://api.test',
      appKey: 'x',
      trackPageViews: false,
    });
    const b = validateConfig({
      apiEndpoint: 'http://api.test',
      appKey: 'x',
      trackPageViews: false,
    });
    expect(a.valid).toBe(true);
    expect(b.valid).toBe(true);
  });

  it('accepts endpoints with path prefix', () => {
    // Multi-tenant setups sometimes point the SDK at a tenant-specific
    // path prefix. The URL parse normalises this and resolveEndpoint()
    // keeps the compose absolute.
    const v = validateConfig({
      apiEndpoint: 'https://api.example.com/tenants/42',
      appKey: 'x',
      trackPageViews: false,
    });
    expect(v.valid).toBe(true);
  });
});
