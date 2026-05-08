// SPDX-License-Identifier: Apache-2.0

/**
 * BrowsonicErrorPage / BrowsonicGlobalErrorPage regression suite.
 * Verifies that the App Router error pages capture the supplied
 * error on mount, forward the optional `digest` as metadata, and
 * survive an unreachable / throwing SDK without crashing the page.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import type { Browsonic } from '@browsonic/sdk';
import { BrowsonicErrorPage, BrowsonicGlobalErrorPage } from './error-page';

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
  cleanup();
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('BrowsonicErrorPage', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = installFakeSdk();
  });

  it('captures the error on mount', () => {
    const error = Object.assign(new Error('crashed'), {});
    render(<BrowsonicErrorPage error={error} reset={() => {}} />);
    expect(sdk.captureError).toHaveBeenCalledWith(error);
  });

  it('forwards the Next.js error digest as metadata when present', () => {
    const error = Object.assign(new Error('crashed'), { digest: 'abc123' });
    render(<BrowsonicErrorPage error={error} reset={() => {}} />);
    expect(sdk.addMetadata).toHaveBeenCalledWith('nextjsErrorDigest', 'abc123');
  });

  it('does not record digest metadata when digest is absent', () => {
    const error = new Error('crashed') as Error & { digest?: string };
    render(<BrowsonicErrorPage error={error} reset={() => {}} />);
    const calls = (sdk.addMetadata as ReturnType<typeof vi.fn>).mock.calls;
    const digestCall = calls.find((call) => call[0] === 'nextjsErrorDigest');
    expect(digestCall).toBeUndefined();
  });

  it('renders the error message and a Try Again button', () => {
    const error = new Error('crashed');
    render(<BrowsonicErrorPage error={error} reset={() => {}} />);
    expect(screen.getByText('crashed')).toBeDefined();
    expect(screen.getByRole('button', { name: /try again/i })).toBeDefined();
  });

  it('invokes reset when the button is clicked', () => {
    const reset = vi.fn();
    render(<BrowsonicErrorPage error={new Error('x')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });

  it('still renders when the SDK is unreachable', () => {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
    expect(() =>
      render(<BrowsonicErrorPage error={new Error('x')} reset={() => {}} />),
    ).not.toThrow();
    expect(screen.getByText('x')).toBeDefined();
  });

  it('isolates a thrown captureError so the page still renders', () => {
    (sdk.captureError as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('reporter-exploded');
    });
    expect(() =>
      render(<BrowsonicErrorPage error={new Error('x')} reset={() => {}} />),
    ).not.toThrow();
    expect(screen.getByText('x')).toBeDefined();
  });

  it('lands pathname as a tag when the optional prop is supplied (0.2)', () => {
    render(
      <BrowsonicErrorPage error={new Error('x')} reset={() => {}} pathname="/products/[id]" />,
    );
    expect(sdk.setTag).toHaveBeenCalledWith('nextjs.pathname', '/products/[id]');
  });

  it('lands params under the canonical `nextjs` context bucket (0.3)', () => {
    render(
      <BrowsonicErrorPage
        error={new Error('x')}
        reset={() => {}}
        params={{ id: '42', slug: 'shoe' }}
      />,
    );
    // 0.3 — params now sit on the `nextjs` bucket alongside runtime
    // and source so the dashboard's NextJsCard renders one tailored
    // card. The legacy `nextjs.params` bucket fell into the generic
    // fallback because it was not in `KNOWN_KEYS`.
    expect(sdk.setContext).toHaveBeenCalledWith(
      'nextjs',
      expect.objectContaining({
        runtime: 'browser',
        source: 'app-router-error',
        params: { id: '42', slug: 'shoe' },
      }),
    );
  });

  it('omits the params field on the `nextjs` bucket when params is empty', () => {
    render(<BrowsonicErrorPage error={new Error('x')} reset={() => {}} params={{}} />);
    // The bucket is still set (carries `runtime` + `source`) but the
    // `params` field is suppressed when no keys are present.
    expect(sdk.setContext).toHaveBeenCalledWith('nextjs', {
      runtime: 'browser',
      source: 'app-router-error',
    });
  });

  it('isolates setTag failures from the captureError call', () => {
    (sdk.setTag as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('tag-store-exploded');
    });
    render(
      <BrowsonicErrorPage error={new Error('x')} reset={() => {}} pathname="/products/[id]" />,
    );
    expect(sdk.captureError).toHaveBeenCalledTimes(1);
  });
});

describe('BrowsonicGlobalErrorPage', () => {
  beforeEach(() => {
    installFakeSdk();
  });

  it('renders the html / body shell around BrowsonicErrorPage', () => {
    const error = new Error('global-crash');
    const { container } = render(<BrowsonicGlobalErrorPage error={error} reset={() => {}} />);
    // The shell renders <html><body>... but jsdom-style hosts strip the
    // outer html/body when the test root is a <div>; we assert on
    // content instead.
    expect(container.textContent).toContain('global-crash');
  });
});
