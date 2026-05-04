// SPDX-License-Identifier: Apache-2.0

/**
 * Astro integration regression suite. The integration does no
 * runtime work beyond emitting `injectScript` calls during
 * `astro:config:setup`; the test passes a mock setup-params, runs
 * the hook, and inspects the injected code.
 */
import { describe, it, expect, vi } from 'vitest';
import browsonicIntegration, {
  type AstroConfigSetupParamsLike,
  type AstroIntegrationLike,
} from './integration';

function makeMockParams(): {
  params: AstroConfigSetupParamsLike;
  injectScript: ReturnType<typeof vi.fn>;
} {
  const injectScript = vi.fn();
  return {
    params: { injectScript },
    injectScript,
  };
}

function runHook(integration: AstroIntegrationLike): {
  injectScript: ReturnType<typeof vi.fn>;
  injectedCode: string[];
} {
  const { params, injectScript } = makeMockParams();
  integration.hooks['astro:config:setup'](params);
  const injectedCode = injectScript.mock.calls.map((c) => c[1] as string);
  return { injectScript, injectedCode };
}

describe('browsonicIntegration', () => {
  it('returns an integration with the canonical name', () => {
    const integration = browsonicIntegration();
    expect(integration.name).toBe('@browsonic/astro');
    expect(typeof integration.hooks['astro:config:setup']).toBe('function');
  });

  it('injects only the navigation hookup when no config is supplied', () => {
    const integration = browsonicIntegration();
    const { injectScript, injectedCode } = runHook(integration);

    expect(injectScript).toHaveBeenCalledTimes(1);
    expect(injectedCode[0]).toContain('registerNavigationBreadcrumbs');
    expect(injectedCode[0]).not.toContain('window.Browsonic.config');
  });

  it('emits the config snippet when apiEndpoint is provided', () => {
    const integration = browsonicIntegration({
      apiEndpoint: 'https://ingest.example/v1/events',
      appKey: 'astro-site',
      environment: 'production',
    });
    const { injectedCode } = runHook(integration);

    const configSnippet = injectedCode.find((c) => c.includes('window.Browsonic.config'));
    expect(configSnippet).toBeDefined();
    expect(configSnippet).toContain('"apiEndpoint":"https://ingest.example/v1/events"');
    expect(configSnippet).toContain('"appKey":"astro-site"');
    expect(configSnippet).toContain('"environment":"production"');
  });

  it('threads includeIntent into the navigation registration call', () => {
    const integration = browsonicIntegration({ includeIntent: true });
    const { injectedCode } = runHook(integration);
    const navSnippet = injectedCode.find((c) => c.includes('registerNavigationBreadcrumbs'));
    expect(navSnippet).toContain('"includeIntent":true');
  });

  it('skips the navigation hookup when registerNavigation: false', () => {
    const integration = browsonicIntegration({
      apiEndpoint: 'https://x.test',
      registerNavigation: false,
    });
    const { injectedCode } = runHook(integration);
    const hasNav = injectedCode.some((c) => c.includes('registerNavigationBreadcrumbs'));
    expect(hasNav).toBe(false);
    // Config snippet still emitted.
    expect(injectedCode.some((c) => c.includes('window.Browsonic.config'))).toBe(true);
  });

  it('emits both snippets in the page stage when both are requested', () => {
    const integration = browsonicIntegration({
      apiEndpoint: 'https://x.test',
      appKey: 'foo',
    });
    const { injectScript } = runHook(integration);
    expect(injectScript).toHaveBeenCalledTimes(2);
    expect(injectScript.mock.calls[0]![0]).toBe('page');
    expect(injectScript.mock.calls[1]![0]).toBe('page');
  });
});
