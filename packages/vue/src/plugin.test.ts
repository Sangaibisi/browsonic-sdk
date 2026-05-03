// SPDX-License-Identifier: Apache-2.0

/**
 * browsonicPlugin regression suite. The plugin's two responsibilities
 * are (a) wiring `provide(browsonicInjectionKey, sdk)` so composables
 * can `inject` it, and (b) chaining into `app.config.errorHandler`
 * without stomping on a previously-installed handler.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp } from 'vue';
import type { Browsonic } from '@browsonic/sdk';
import { browsonicPlugin } from './plugin';

function makeFakeSdk(): Browsonic {
  return {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
  } as unknown as Browsonic;
}

describe('browsonicPlugin', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('forwards thrown errors to sdk.captureError via app.config.errorHandler', () => {
    const app = createApp({ render: () => null });
    app.use(browsonicPlugin, { sdk });
    expect(typeof app.config.errorHandler).toBe('function');
    app.config.errorHandler!(new Error('failure'), null, 'render');
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('records the Vue error info under "vueErrorInfo" metadata', () => {
    const app = createApp({ render: () => null });
    app.use(browsonicPlugin, { sdk });
    app.config.errorHandler!(new Error('failure'), null, 'setup function');
    expect(sdk.addMetadata).toHaveBeenCalledWith('vueErrorInfo', 'setup function');
  });

  it('preserves a previously-installed errorHandler (chains, does not replace)', () => {
    const previous = vi.fn();
    const app = createApp({ render: () => null });
    app.config.errorHandler = previous;

    app.use(browsonicPlugin, { sdk });
    app.config.errorHandler!(new Error('x'), null, 'info');

    expect(sdk.captureError).toHaveBeenCalled();
    expect(previous).toHaveBeenCalled();
  });

  it('isolates the previous handler when it throws', () => {
    const previous = vi.fn().mockImplementation(() => {
      throw new Error('previous-broken');
    });
    const app = createApp({ render: () => null });
    app.config.errorHandler = previous;

    app.use(browsonicPlugin, { sdk });

    expect(() => app.config.errorHandler!(new Error('x'), null, 'info')).not.toThrow();
    expect(sdk.captureError).toHaveBeenCalled();
  });

  it('skips the errorHandler chain when chainErrorHandler is false', () => {
    const app = createApp({ render: () => null });
    app.use(browsonicPlugin, { sdk, chainErrorHandler: false });
    expect(app.config.errorHandler ?? null).toBeNull();
  });

  it('still wraps captureError in try/catch (defensive isolation)', () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    const app = createApp({ render: () => null });
    app.use(browsonicPlugin, { sdk });
    expect(() => app.config.errorHandler!(new Error('x'), null, 'info')).not.toThrow();
  });
});
