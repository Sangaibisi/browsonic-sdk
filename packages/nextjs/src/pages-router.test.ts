// SPDX-License-Identifier: Apache-2.0

/**
 * Pages Router companion tests. The two helpers (initial-props
 * factory + app-init listener wiring) are pure-TS so the suite skips
 * `@testing-library/react` and just calls them directly with a fake
 * SDK + a hand-rolled NextPageContextLike.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import {
  browsonicPagesErrorInitialProps,
  browsonicPagesAppInit,
  type NextPageContextLike,
} from './pages-router';

function installFakeSdk(): Browsonic {
  const sdk = {
    captureError: vi.fn(),
    addMetadata: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
  } as unknown as Browsonic;
  (window as typeof window & { Browsonic?: unknown }).Browsonic = {
    getBrowsonic: () => sdk,
  };
  return sdk;
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('browsonicPagesErrorInitialProps', () => {
  it('captures the error to the SDK + returns statusCode', () => {
    const sdk = installFakeSdk();
    const ctx: NextPageContextLike = {
      err: new Error('boom') as Error & { statusCode?: number },
      res: { statusCode: 500 },
      pathname: '/products/[id]',
      asPath: '/products/42',
    };
    const props = browsonicPagesErrorInitialProps(ctx);

    expect(props.statusCode).toBe(500);
    expect(props.pagePath).toBe('/products/[id]');
    expect(sdk.captureError).toHaveBeenCalledWith(ctx.err);
    expect(sdk.addMetadata).toHaveBeenCalledWith('nextjsStatusCode', '500');
    expect(sdk.setTag).toHaveBeenCalledWith('nextjs.pagePath', '/products/[id]');
    expect(sdk.addMetadata).toHaveBeenCalledWith('nextjsAsPath', '/products/42');
  });

  it('falls through to status 404 when neither res nor err carries one', () => {
    installFakeSdk();
    const props = browsonicPagesErrorInitialProps({});
    expect(props.statusCode).toBe(404);
  });

  it('coerces a non-Error err value to Error before forwarding', () => {
    const sdk = installFakeSdk();
    const ctx: NextPageContextLike = {
      err: 'plain string err' as unknown as Error,
    };
    browsonicPagesErrorInitialProps(ctx);
    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg).toBeInstanceOf(Error);
    expect((arg as Error).message).toBe('plain string err');
  });

  it('does not call captureError when no err is present', () => {
    const sdk = installFakeSdk();
    browsonicPagesErrorInitialProps({ res: { statusCode: 404 } });
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('swallows reporter failures', () => {
    const sdk = installFakeSdk();
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter exploded');
    });
    expect(() =>
      browsonicPagesErrorInitialProps({
        err: new Error('boom') as Error & { statusCode?: number },
        res: { statusCode: 500 },
      }),
    ).not.toThrow();
  });

  it('is a no-op when SDK is unreachable', () => {
    expect(() =>
      browsonicPagesErrorInitialProps({
        err: new Error('boom') as Error & { statusCode?: number },
      }),
    ).not.toThrow();
  });
});

describe('browsonicPagesAppInit', () => {
  let teardown: () => void = () => {};

  beforeEach(() => {
    teardown();
  });
  afterEach(() => {
    teardown();
  });

  it('captures window error events', () => {
    const sdk = installFakeSdk();
    teardown = browsonicPagesAppInit();

    const event = new ErrorEvent('error', {
      error: new Error('window-error'),
      message: 'window-error',
    });
    window.dispatchEvent(event);

    expect(sdk.captureError).toHaveBeenCalledTimes(1);
    expect((sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeInstanceOf(Error);
  });

  it('captures unhandledrejection events', () => {
    const sdk = installFakeSdk();
    teardown = browsonicPagesAppInit();

    const event = Object.assign(new Event('unhandledrejection'), {
      reason: new Error('rejected-promise'),
    }) as PromiseRejectionEvent;
    window.dispatchEvent(event);

    expect(sdk.captureError).toHaveBeenCalledTimes(1);
  });

  it('coerces non-Error rejection reasons', () => {
    const sdk = installFakeSdk();
    teardown = browsonicPagesAppInit();

    const event = Object.assign(new Event('unhandledrejection'), {
      reason: 'plain-string-reason',
    }) as PromiseRejectionEvent;
    window.dispatchEvent(event);

    const arg = (sdk.captureError as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(arg).toBeInstanceOf(Error);
    expect((arg as Error).message).toBe('plain-string-reason');
  });

  it('returned teardown removes the listeners', () => {
    const sdk = installFakeSdk();
    teardown = browsonicPagesAppInit();
    teardown();
    teardown = () => {};

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after-teardown') }));
    expect(sdk.captureError).not.toHaveBeenCalled();
  });

  it('swallows reporter failures', () => {
    const sdk = installFakeSdk();
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter exploded');
    });
    teardown = browsonicPagesAppInit();

    expect(() =>
      window.dispatchEvent(new ErrorEvent('error', { error: new Error('host') })),
    ).not.toThrow();
  });
});
