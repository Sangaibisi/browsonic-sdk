/**
 * Plugin architecture regression suite.
 * Covers Sprint 6.1 — register/activate/deactivate lifecycle + widget plugin.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./transport', () => ({
  sendBatch: vi.fn().mockResolvedValue({ success: true, status: 200, quotaRemaining: null }),
  calculateBackoff: (a: number) => Math.min(1000 * 2 ** a, 30_000),
}));

import { Browsonic, resetBrowsonic } from './sentinel';
import type { SdkPlugin } from './plugin';

function makeConfig() {
  return {
    apiEndpoint: 'https://api.test',
    appKey: 'app',
    apiKey: 'k',
    trackPageViews: false,
    sampleRate: 1.0,
    flushIntervalMs: 1000,
  };
}

function makeTestPlugin(id = 'test', overrides: Partial<SdkPlugin> = {}): SdkPlugin {
  return {
    id,
    apiVersion: 1,
    activate: vi.fn(),
    deactivate: vi.fn(),
    ...overrides,
  };
}

describe('Browsonic plugin registration', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    resetBrowsonic();
    sdk = new Browsonic();
  });

  afterEach(() => {
    sdk.destroy();
  });

  it('register before init stores the plugin', () => {
    const p = makeTestPlugin();
    sdk.register(p);
    sdk.init(makeConfig());
    // Activation happens during async bootstrap — will verify below.
    expect(p.activate).not.toHaveBeenCalled();
  });

  it('register after init is rejected (state guard)', () => {
    sdk.init(makeConfig());
    const p = makeTestPlugin();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sdk.register(p);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('activates plugins during bootstrap in registration order', async () => {
    const order: string[] = [];
    const p1 = makeTestPlugin('p1', {
      activate: () => {
        order.push('p1');
      },
    });
    const p2 = makeTestPlugin('p2', {
      activate: () => {
        order.push('p2');
      },
    });

    sdk.register(p1);
    sdk.register(p2);
    sdk.init(makeConfig());
    await sdk.start();

    expect(order).toEqual(['p1', 'p2']);
  });

  it('deactivates plugins in reverse order on destroy', async () => {
    const order: string[] = [];
    const p1 = makeTestPlugin('a', {
      deactivate: () => {
        order.push('a');
      },
    });
    const p2 = makeTestPlugin('b', {
      deactivate: () => {
        order.push('b');
      },
    });

    sdk.register(p1);
    sdk.register(p2);
    sdk.init(makeConfig());
    await sdk.start();

    sdk.destroy();
    expect(order).toEqual(['b', 'a']);
  });

  it('rejects plugins with unsupported apiVersion', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const p = { id: 'old', apiVersion: 0 as unknown as 1, activate: vi.fn(), deactivate: vi.fn() };
    sdk.register(p);
    sdk.init(makeConfig());
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('rejects duplicate registration by id', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sdk.register(makeTestPlugin('same'));
    sdk.register(makeTestPlugin('same'));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('plugin errors during activate do not crash bootstrap', async () => {
    const bad: SdkPlugin = {
      id: 'bad',
      apiVersion: 1,
      activate: () => {
        throw new Error('kaboom');
      },
      deactivate: vi.fn(),
    };
    sdk.register(bad);
    sdk.init(makeConfig());
    const ok = await sdk.start();
    expect(ok).toBe(true); // start() still succeeds
  });

  it('plugin deactivate errors do not block destroy()', async () => {
    const bad: SdkPlugin = {
      id: 'bad',
      apiVersion: 1,
      activate: vi.fn(),
      deactivate: () => {
        throw new Error('teardown failed');
      },
    };
    sdk.register(bad);
    sdk.init(makeConfig());
    await sdk.start();
    expect(() => sdk.destroy()).not.toThrow();
  });
});

describe('PluginContext.onEvent', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    resetBrowsonic();
    sdk = new Browsonic();
  });

  afterEach(() => {
    sdk.destroy();
  });

  it('observer sees events emitted through the SDK', async () => {
    const observed: string[] = [];
    const p: SdkPlugin = {
      id: 'observer',
      apiVersion: 1,
      activate(ctx) {
        ctx.onEvent((event) => observed.push(event.message));
      },
      deactivate: vi.fn(),
    };
    sdk.register(p);
    sdk.init(makeConfig());
    await sdk.start();

    sdk.captureMessage('hello', 'warn');
    await sdk.flush();

    expect(observed).toContain('hello');
  });

  it('unsubscribe removes the observer', async () => {
    const observed: string[] = [];
    let unsub: (() => void) | null = null;
    const p: SdkPlugin = {
      id: 'observer2',
      apiVersion: 1,
      activate(ctx) {
        unsub = ctx.onEvent((event) => observed.push(event.message));
      },
      deactivate: vi.fn(),
    };
    sdk.register(p);
    sdk.init(makeConfig());
    await sdk.start();

    sdk.captureMessage('first', 'warn');
    await sdk.flush();
    expect(observed).toContain('first');

    unsub?.();

    sdk.captureMessage('second', 'warn');
    await sdk.flush();
    expect(observed).not.toContain('second');
  });
});

describe('widgetPlugin — integration', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    resetBrowsonic();
    document.body.innerHTML = '';
    sdk = new Browsonic();
  });

  afterEach(() => {
    sdk.destroy();
    document.body.innerHTML = '';
  });

  it('mounts widget when registered + matching rule fires', async () => {
    const { widgetPlugin } = await import('./widget/plugin');
    sdk.register(widgetPlugin());
    sdk.init({
      ...makeConfig(),
      widgetRules: [
        {
          id: 'match-foo',
          match: { messagePattern: 'foo' },
          notification: { title: 'T', message: 'M' },
        },
      ],
    });
    await sdk.start();

    sdk.captureMessage('foo happened', 'warn');
    // Plugin handler runs synchronously in handleEvent.
    expect(document.getElementById('browsonic-widget-host')).not.toBeNull();
  });

  it('omits widget when NOT registered — no DOM pollution', async () => {
    sdk.init(makeConfig());
    await sdk.start();
    sdk.captureMessage('foo happened', 'warn');
    expect(document.getElementById('browsonic-widget-host')).toBeNull();
  });

  it('destroys widget on sdk.destroy()', async () => {
    const { widgetPlugin } = await import('./widget/plugin');
    sdk.register(widgetPlugin());
    sdk.init({
      ...makeConfig(),
      widgetRules: [
        {
          id: 'r',
          match: { messagePattern: '.*' },
          notification: { title: 'T', message: 'M' },
        },
      ],
    });
    await sdk.start();
    sdk.captureMessage('trigger', 'warn');
    expect(document.getElementById('browsonic-widget-host')).not.toBeNull();
    sdk.destroy();
    expect(document.getElementById('browsonic-widget-host')).toBeNull();
  });

  it('expose.show/dismiss helpers are wired on activation', async () => {
    const { widgetPlugin } = await import('./widget/plugin');
    const expose: { show?: (n: unknown) => void; dismiss?: () => void } = {};
    sdk.register(widgetPlugin({ expose }));
    sdk.init(makeConfig());
    await sdk.start();
    expect(typeof expose.show).toBe('function');
    expect(typeof expose.dismiss).toBe('function');
    expose.show?.({ title: 'manual', message: 'direct call' });
    expect(document.getElementById('browsonic-widget-host')).not.toBeNull();
  });
});
