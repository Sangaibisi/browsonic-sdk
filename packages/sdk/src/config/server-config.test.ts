// SPDX-License-Identifier: Apache-2.0
// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clampSampleRate,
  fetchAppConfig,
  loadCachedAppConfig,
  saveCachedAppConfig,
} from './server-config';

describe('server-config', () => {
  describe('clampSampleRate', () => {
    it('passes through values inside [0.001, 1.0]', () => {
      expect(clampSampleRate(0.05)).toBe(0.05);
      expect(clampSampleRate(0.5)).toBe(0.5);
      expect(clampSampleRate(1.0)).toBe(1.0);
      expect(clampSampleRate(0.001)).toBe(0.001);
    });
    it('clamps below the floor', () => {
      expect(clampSampleRate(0)).toBe(0.001);
      expect(clampSampleRate(-1)).toBe(0.001);
      expect(clampSampleRate(0.0001)).toBe(0.001);
    });
    it('clamps above the ceiling', () => {
      expect(clampSampleRate(1.5)).toBe(1.0);
      expect(clampSampleRate(2)).toBe(1.0);
    });
    it('falls back to default on non-finite input', () => {
      expect(clampSampleRate(NaN)).toBe(0.1);
      expect(clampSampleRate(Infinity)).toBe(0.1);
    });
  });

  describe('fetchAppConfig', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('GETs /v1/sdk/config with X-APP-KEY + X-API-Key headers', async () => {
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockResolvedValue(
          new Response(JSON.stringify({ sampleRate: 0.05, configVersion: 1 }), {
            status: 200,
          })
        );
      const result = await fetchAppConfig({
        apiEndpoint: 'https://api.test/',
        appKey: 'app-1',
        apiKey: 'sk-test',
        fetchImpl: fetchSpy,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0]!;
      // Trailing slash on apiEndpoint is normalised away.
      expect(url).toBe('https://api.test/v1/sdk/config?appKey=app-1');
      expect(init).toMatchObject({
        method: 'GET',
        headers: expect.objectContaining({ 'X-APP-KEY': 'app-1', 'X-API-Key': 'sk-test' }),
      });
      expect(result).toMatchObject({ sampleRate: 0.05, configVersion: 1 });
      expect(result?.fetchedAt).toBeGreaterThan(0);
    });

    it('clamps an out-of-range sampleRate from the server', async () => {
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockResolvedValue(new Response(JSON.stringify({ sampleRate: 2.5 }), { status: 200 }));
      const result = await fetchAppConfig({
        apiEndpoint: 'https://api.test',
        appKey: 'app-1',
        fetchImpl: fetchSpy,
      });
      expect(result?.sampleRate).toBe(1.0);
    });

    it('omits X-API-Key when apiKey is absent', async () => {
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockResolvedValue(new Response(JSON.stringify({ sampleRate: 0.1 }), { status: 200 }));
      await fetchAppConfig({
        apiEndpoint: 'https://api.test',
        appKey: 'app-1',
        fetchImpl: fetchSpy,
      });
      const headers = fetchSpy.mock.calls[0]![1]!.headers as Record<string, string>;
      expect(headers['X-APP-KEY']).toBe('app-1');
      expect(headers['X-API-Key']).toBeUndefined();
    });

    it('returns null on non-2xx', async () => {
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockResolvedValue(new Response('Not Found', { status: 404 }));
      const result = await fetchAppConfig({
        apiEndpoint: 'https://api.test',
        appKey: 'missing',
        fetchImpl: fetchSpy,
      });
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockRejectedValue(new Error('network down'));
      const result = await fetchAppConfig({
        apiEndpoint: 'https://api.test',
        appKey: 'app-1',
        fetchImpl: fetchSpy,
      });
      expect(result).toBeNull();
    });

    it('returns null when the body has no sampleRate field', async () => {
      const fetchSpy = vi
        .fn<(...args: Parameters<typeof fetch>) => Promise<Response>>()
        .mockResolvedValue(new Response(JSON.stringify({ configVersion: 1 }), { status: 200 }));
      const result = await fetchAppConfig({
        apiEndpoint: 'https://api.test',
        appKey: 'app-1',
        fetchImpl: fetchSpy,
      });
      expect(result).toBeNull();
    });

    it('returns null when fetch is unavailable', async () => {
      // No fetchImpl + globalThis.fetch absent (Node 16-, edge
      // runtimes that don't ship fetch).
      vi.stubGlobal('fetch', undefined);
      const result = await fetchAppConfig({
        apiEndpoint: 'https://api.test',
        appKey: 'app-1',
      });
      expect(result).toBeNull();
    });
  });

  describe('loadCachedAppConfig / saveCachedAppConfig', () => {
    // Inline localStorage mock — happy-dom's Storage isn't fully
    // featured across versions (notably `clear()` may be missing),
    // and we want the suite to run cleanly under any environment.
    const stubStorage = (): Storage => {
      const store = new Map<string, string>();
      return {
        get length() {
          return store.size;
        },
        clear: () => store.clear(),
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
      };
    };

    beforeEach(() => {
      vi.stubGlobal('localStorage', stubStorage());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('saves and loads a snapshot round-trip', () => {
      saveCachedAppConfig('app-1', {
        sampleRate: 0.07,
        configVersion: 1,
        fetchedAt: Date.now(),
      });
      const loaded = loadCachedAppConfig('app-1');
      expect(loaded?.sampleRate).toBe(0.07);
      expect(loaded?.configVersion).toBe(1);
    });

    it('returns null when nothing is cached for the key', () => {
      expect(loadCachedAppConfig('missing')).toBeNull();
    });

    it('returns null on stale snapshots (> 24h old)', () => {
      saveCachedAppConfig('app-1', {
        sampleRate: 0.07,
        configVersion: 1,
        fetchedAt: Date.now() - 25 * 60 * 60 * 1000,
      });
      expect(loadCachedAppConfig('app-1')).toBeNull();
    });

    it('returns null on malformed JSON', () => {
      localStorage.setItem('__browsonic_app_config_app-1', '{{{not json');
      expect(loadCachedAppConfig('app-1')).toBeNull();
    });

    it('returns null on missing required fields', () => {
      localStorage.setItem('__browsonic_app_config_app-1', JSON.stringify({ configVersion: 1 }));
      expect(loadCachedAppConfig('app-1')).toBeNull();
    });

    it('clamps a stored out-of-range sampleRate when loading', () => {
      localStorage.setItem(
        '__browsonic_app_config_app-1',
        JSON.stringify({ sampleRate: 5.0, configVersion: 1, fetchedAt: Date.now() })
      );
      expect(loadCachedAppConfig('app-1')?.sampleRate).toBe(1.0);
    });

    it('save silently no-ops when localStorage is unavailable', () => {
      vi.stubGlobal('localStorage', undefined);
      expect(() =>
        saveCachedAppConfig('app-1', {
          sampleRate: 0.1,
          configVersion: 1,
          fetchedAt: Date.now(),
        })
      ).not.toThrow();
      expect(loadCachedAppConfig('app-1')).toBeNull();
    });
  });
});
