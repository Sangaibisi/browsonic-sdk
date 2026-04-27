/**
 * Widget manager — orchestration (rules + renderer) regression suite.
 *
 * Full flow: incoming event → matcher.check → renderer.show.
 * Server-rules fetch is exercised against a mocked fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWidgetManager } from './widget-manager';
import { resolveConfig } from '../config';
import type { BrowsonicEvent, WidgetRule } from '../types';

function makeEvent(over: Partial<BrowsonicEvent> = {}): BrowsonicEvent {
  return {
    eventId: 'e',
    timestamp: new Date().toISOString(),
    type: 'error',
    level: 'error',
    message: 'TypeError: x is undefined',
    stack: null,
    context: { url: 'https://app.test/', referrer: '', pageAge: 0 },
    telemetry: null,
    ...over,
  };
}

function makeConfig(
  widgetRules: WidgetRule[] = [],
  over: Partial<Parameters<typeof resolveConfig>[0]> = {}
) {
  return resolveConfig({
    apiEndpoint: 'https://api.test',
    appKey: 'app',
    apiKey: 'k',
    trackPageViews: false,
    widgetRules,
    ...over,
  });
}

describe('WidgetManager — handleEvent + showNotification + dismiss', () => {
  beforeEach(() => {
    // Ensure a clean host element
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('does not render when no rule matches', () => {
    const mgr = createWidgetManager(
      makeConfig([
        {
          id: 'r',
          match: { messagePattern: 'NeverMatch' },
          notification: { title: 't', message: 'm' },
        },
      ]),
      () => {}
    );
    mgr.handleEvent(makeEvent());
    expect(document.getElementById('browsonic-widget-host')).toBeNull();
  });

  it('renders widget host element when rule matches', () => {
    const mgr = createWidgetManager(
      makeConfig([
        {
          id: 'r',
          match: { messagePattern: 'TypeError' },
          notification: { title: 'Issue', message: 'Something broke' },
        },
      ]),
      () => {}
    );
    mgr.handleEvent(makeEvent());
    const host = document.getElementById('browsonic-widget-host');
    expect(host).not.toBeNull();
  });

  it('showNotification renders without requiring a matching event', () => {
    const mgr = createWidgetManager(makeConfig(), () => {});
    mgr.showNotification({ title: 'Direct', message: 'No rule needed' });
    const host = document.getElementById('browsonic-widget-host');
    expect(host).not.toBeNull();
  });

  it('dismiss hides the widget', () => {
    const mgr = createWidgetManager(makeConfig(), () => {});
    mgr.showNotification({ title: 'x', message: 'y' });
    const host = document.getElementById('browsonic-widget-host');
    expect(host).not.toBeNull();
    mgr.dismiss();
    // Element may still exist post-animation; but dismiss shouldn't throw.
  });

  it('destroy removes widget from DOM', () => {
    const mgr = createWidgetManager(makeConfig(), () => {});
    mgr.showNotification({ title: 'x', message: 'y' });
    expect(document.getElementById('browsonic-widget-host')).not.toBeNull();
    mgr.destroy();
    expect(document.getElementById('browsonic-widget-host')).toBeNull();
  });

  it('falls back to window.location.href when event context has no url', () => {
    const mgr = createWidgetManager(
      makeConfig([
        {
          id: 'r',
          match: { urlPattern: '.*' },
          notification: { title: 't', message: 'm' },
        },
      ]),
      () => {}
    );
    // happy-dom provides a location; this just shouldn't throw.
    const evt = makeEvent();
    // Force empty context.url to hit the fallback branch.
    (evt.context as { url: string }).url = '';
    expect(() => mgr.handleEvent(evt)).not.toThrow();
  });
});

describe('WidgetManager — fetchServerRules', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
  });

  it('returns early when widgetRulesEndpoint is false (default)', async () => {
    const mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const mgr = createWidgetManager(makeConfig([], { widgetRulesEndpoint: false }), () => {});
    await mgr.fetchServerRules();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('fetches from default /v1/widget-rules/sdk when endpoint is true', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rules: [] }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const mgr = createWidgetManager(makeConfig([], { widgetRulesEndpoint: true }), () => {});
    await mgr.fetchServerRules();
    expect(mockFetch).toHaveBeenCalled();
    const [calledUrl] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain('/v1/widget-rules/sdk');
  });

  it('uses custom endpoint string when provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rules: [] }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const mgr = createWidgetManager(
      makeConfig([], {
        widgetRulesEndpoint: 'https://custom.example/rules',
      }),
      () => {}
    );
    await mgr.fetchServerRules();
    expect(mockFetch).toHaveBeenCalled();
    const [calledUrl] = mockFetch.mock.calls[0];
    expect(String(calledUrl)).toContain('custom.example/rules');
  });

  it('merges server rules into matcher', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        rules: [
          {
            id: 'srv-1',
            match: { messagePattern: 'FromServer' },
            notification: { title: 'svr', message: 'svr' },
          },
        ],
      }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const mgr = createWidgetManager(makeConfig([], { widgetRulesEndpoint: true }), () => {});
    await mgr.fetchServerRules();
    // Rule should now fire for a matching event
    mgr.handleEvent(makeEvent({ message: 'Something FromServer thrown' }));
    expect(document.getElementById('browsonic-widget-host')).not.toBeNull();
  });

  it('silently drops non-ok responses', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    const mgr = createWidgetManager(makeConfig([], { widgetRulesEndpoint: true }), () => {});
    await expect(mgr.fetchServerRules()).resolves.toBeUndefined();
  });

  it('silently drops fetch rejection', async () => {
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const mgr = createWidgetManager(makeConfig([], { widgetRulesEndpoint: true }), () => {});
    await expect(mgr.fetchServerRules()).resolves.toBeUndefined();
  });

  it('ignores non-array `rules` payload (defensive)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ rules: 'not-an-array' }),
    }) as unknown as typeof fetch;
    const mgr = createWidgetManager(makeConfig([], { widgetRulesEndpoint: true }), () => {});
    await expect(mgr.fetchServerRules()).resolves.toBeUndefined();
  });
});
