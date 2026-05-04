// SPDX-License-Identifier: Apache-2.0

/**
 * `tagAsAstroIsland` regression suite. happy-dom provides `window`;
 * the SSR short-circuit is exercised by deleting `globalThis.window`
 * for one test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Browsonic } from '@browsonic/sdk';
import { tagAsAstroIsland } from './island';

function makeFakeSdk(): Browsonic {
  return {
    setTag: vi.fn(),
  } as unknown as Browsonic;
}

afterEach(() => {
  if (typeof window !== 'undefined') {
    delete (window as typeof window & { Browsonic?: unknown }).Browsonic;
  }
});

describe('tagAsAstroIsland', () => {
  let sdk: Browsonic;

  beforeEach(() => {
    sdk = makeFakeSdk();
  });

  it('sets `astro.island` tag with the provided name and returns true', () => {
    const result = tagAsAstroIsland('ContactForm', { sdk });
    expect(result).toBe(true);
    expect(sdk.setTag).toHaveBeenCalledWith('astro.island', 'ContactForm');
  });

  it('respects a custom tagKey', () => {
    tagAsAstroIsland('Hero.cta', { sdk, tagKey: 'astro.island.role' });
    expect(sdk.setTag).toHaveBeenCalledWith('astro.island.role', 'Hero.cta');
  });

  it('overwrites the tag when called twice — last island wins', () => {
    // The SDK's tag store is a simple Map overwrite; this is the
    // documented behaviour. Multi-island concurrent errors lose info,
    // but that's a known trade-off for the simple helper shape.
    tagAsAstroIsland('FirstIsland', { sdk });
    tagAsAstroIsland('SecondIsland', { sdk });

    const calls = (sdk.setTag as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toEqual([
      ['astro.island', 'FirstIsland'],
      ['astro.island', 'SecondIsland'],
    ]);
  });

  it('falls back to window.Browsonic when no sdk option is provided', () => {
    (window as typeof window & { Browsonic?: unknown }).Browsonic = {
      getBrowsonic: () => sdk,
    };
    const result = tagAsAstroIsland('ProductCard');
    expect(result).toBe(true);
    expect(sdk.setTag).toHaveBeenCalledWith('astro.island', 'ProductCard');
  });

  it('returns false and skips the tag when no SDK is reachable', () => {
    const result = tagAsAstroIsland('NoSdkIsland');
    expect(result).toBe(false);
  });

  it('returns false during SSR (no window)', () => {
    const originalWindow = globalThis.window;
    delete (globalThis as { window?: unknown }).window;
    try {
      const result = tagAsAstroIsland('SsrIsland', { sdk });
      expect(result).toBe(false);
      expect(sdk.setTag).not.toHaveBeenCalled();
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it('returns false and never throws when sdk.setTag itself throws', () => {
    (sdk.setTag as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('tag-store-exploded');
    });
    expect(() => tagAsAstroIsland('Boom', { sdk })).not.toThrow();
    expect(tagAsAstroIsland('Boom', { sdk })).toBe(false);
  });

  it('is idempotent — calling repeatedly with the same name is safe', () => {
    tagAsAstroIsland('Sticky', { sdk });
    tagAsAstroIsland('Sticky', { sdk });
    tagAsAstroIsland('Sticky', { sdk });
    expect(sdk.setTag).toHaveBeenCalledTimes(3);
    expect(
      (sdk.setTag as ReturnType<typeof vi.fn>).mock.calls.every((c) => c[1] === 'Sticky'),
    ).toBe(true);
  });

  it('accepts an empty-string name (consumer choice — no validation)', () => {
    // The helper does no validation; an empty string is a legitimate
    // way to "clear" the island tag in the consumer's mental model.
    // We document this behaviour with a test so a future "validate
    // non-empty" change lands deliberately.
    const result = tagAsAstroIsland('', { sdk });
    expect(result).toBe(true);
    expect(sdk.setTag).toHaveBeenCalledWith('astro.island', '');
  });
});
