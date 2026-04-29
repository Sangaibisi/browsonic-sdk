// SPDX-License-Identifier: Apache-2.0

/**
 * Default-plugin bridge — translates classic `BrowsonicConfig` fields
 * into plugin registrations. This suite guards the contract so a future
 * rename of a config field (e.g. `captureXHR` → `network.xhr`) can't
 * silently drop a default collector.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../transport', () => ({
  sendBatch: vi.fn().mockResolvedValue({ success: true, status: 200, quotaRemaining: null }),
  calculateBackoff: (a: number) => Math.min(1000 * 2 ** a, 30_000),
}));

import { Browsonic as CoreBrowsonic } from '../sentinel';
import type { BrowsonicConfig } from '../types';
import { applyLegacyPluginsFromConfig } from './default';

type PluginSummary = { id: string };

function pluginIds(sdk: CoreBrowsonic): string[] {
  // Plugins are private — reach in via a typed cast to keep tests focused
  // on observable behavior (registration outcome) without widening API.
  const plugins = (sdk as unknown as { plugins: PluginSummary[] }).plugins;
  return plugins.map((p) => p.id);
}

function makeConfig(overrides: Partial<BrowsonicConfig> = {}): BrowsonicConfig {
  return {
    apiEndpoint: 'https://api.test',
    appKey: 'app',
    apiKey: 'k',
    ...overrides,
  };
}

describe('applyLegacyPluginsFromConfig', () => {
  let sdk: CoreBrowsonic;

  beforeEach(() => {
    sdk = new CoreBrowsonic();
  });

  it('registers the mandatory trio (error + console + network) even on empty config', () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig());
    const ids = pluginIds(sdk);
    expect(ids).toContain('error');
    expect(ids).toContain('console');
    expect(ids).toContain('network');
  });

  it('registers xhr by default; skips when captureXHR: false', () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig());
    expect(pluginIds(sdk)).toContain('xhr');

    const sdk2 = new CoreBrowsonic();
    applyLegacyPluginsFromConfig(sdk2, makeConfig({ captureXHR: false }));
    expect(pluginIds(sdk2)).not.toContain('xhr');
  });

  it('registers navigation by default; skips when trackNavigation: false', () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig());
    expect(pluginIds(sdk)).toContain('navigation');

    const sdk2 = new CoreBrowsonic();
    applyLegacyPluginsFromConfig(sdk2, makeConfig({ trackNavigation: false }));
    expect(pluginIds(sdk2)).not.toContain('navigation');
  });

  it('omits visitor by default; registers when trackVisitor: true', () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig());
    expect(pluginIds(sdk)).not.toContain('visitor');

    const sdk2 = new CoreBrowsonic();
    applyLegacyPluginsFromConfig(sdk2, makeConfig({ trackVisitor: true }));
    expect(pluginIds(sdk2)).toContain('visitor');
  });

  it("registers callback plugin only when captureAsyncStack === 'global'", () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig());
    expect(pluginIds(sdk)).not.toContain('callback');

    const sdk2 = new CoreBrowsonic();
    applyLegacyPluginsFromConfig(sdk2, makeConfig({ captureAsyncStack: 'manual' }));
    expect(pluginIds(sdk2)).not.toContain('callback');

    const sdk3 = new CoreBrowsonic();
    applyLegacyPluginsFromConfig(sdk3, makeConfig({ captureAsyncStack: 'global' }));
    expect(pluginIds(sdk3)).toContain('callback');
  });

  it('registers pageview when trackPageViews !== false AND apiKey is present', () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig());
    expect(pluginIds(sdk)).toContain('pageview');
  });

  it('skips pageview when apiKey is missing (even if trackPageViews default true)', () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig({ apiKey: undefined }));
    expect(pluginIds(sdk)).not.toContain('pageview');
  });

  it('skips pageview when trackPageViews is explicitly false', () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig({ trackPageViews: false }));
    expect(pluginIds(sdk)).not.toContain('pageview');
  });
});

describe('default plugins — activate + deactivate lifecycle', () => {
  let sdk: CoreBrowsonic;

  beforeEach(() => {
    sdk = new CoreBrowsonic();
  });

  it('activates every default collector plugin through bootstrap then deactivates on destroy', async () => {
    // Opt-in everything except pageview (no beacon endpoint in happy-dom).
    applyLegacyPluginsFromConfig(
      sdk,
      makeConfig({
        trackPageViews: false,
        trackVisitor: true,
        captureAsyncStack: 'global',
      })
    );

    // Silence the global-async-stack console.warn.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      sdk.init(
        makeConfig({
          trackPageViews: false,
          trackVisitor: true,
          captureAsyncStack: 'global',
        })
      );
      await sdk.start();
      expect(sdk.getState()).toBe('running');
      // Every registered plugin's activate() ran — deactivate must run in destroy.
      sdk.destroy();
      expect(sdk.getState()).toBe('destroyed');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('activates pageview plugin when apiKey is present (deactivates on destroy)', async () => {
    applyLegacyPluginsFromConfig(sdk, makeConfig());
    sdk.init(makeConfig());
    await sdk.start();
    expect(pluginIds(sdk)).toContain('pageview');
    sdk.destroy();
  });

  it('pageview plugin activate() early-returns without apiKey (still destroy-safe)', async () => {
    // Build with apiKey for validateConfig to pass, then simulate a
    // deployment where the plugin was manually registered but apiKey
    // was stripped at activate-time — covers the early-return branch.
    applyLegacyPluginsFromConfig(sdk, makeConfig({ trackPageViews: false }));
    // Register pageview directly with apiKey=null resolved downstream.
    const { pageViewPlugin } = await import('./pageview');
    sdk.register(pageViewPlugin());
    sdk.init({ ...makeConfig(), apiKey: undefined, trackPageViews: false });
    await sdk.start();
    sdk.destroy();
  });
});
