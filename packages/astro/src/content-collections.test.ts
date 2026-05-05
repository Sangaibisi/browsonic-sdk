// SPDX-License-Identifier: Apache-2.0

/**
 * `renderContentCollectionMeta` + `readContentCollectionFromDocument`
 * regression suite. happy-dom provides the document for the read
 * path; the render path is a pure string function so it's fully
 * unit-testable.
 *
 * The view-transitions integration that reads the meta on every
 * swap is covered separately in `view-transitions.test.ts` —
 * those tests assert the breadcrumb shape after a content-collection
 * page swap.
 */
import { describe, it, expect, afterEach } from 'vitest';
import {
  renderContentCollectionMeta,
  readContentCollectionFromDocument,
} from './content-collections';

afterEach(() => {
  // Clear any meta tags injected by tests so the next test starts
  // from a known DOM state.
  if (typeof document !== 'undefined') {
    document.head.innerHTML = '';
  }
});

describe('renderContentCollectionMeta', () => {
  it('renders the canonical `browsonic:content-collection` meta tag', () => {
    const html = renderContentCollectionMeta({
      collection: 'blog',
      entry: 'post-1',
    });
    expect(html).toBe('<meta name="browsonic:content-collection" content="blog/post-1">');
  });

  it('uses a custom metaName when provided', () => {
    const html = renderContentCollectionMeta({
      collection: 'blog',
      entry: 'post-1',
      metaName: 'browsonic:content-collection.tag',
    });
    expect(html).toBe('<meta name="browsonic:content-collection.tag" content="blog/post-1">');
  });

  it('escapes HTML-significant chars in the collection name', () => {
    const html = renderContentCollectionMeta({
      collection: 'blog<x>',
      entry: 'post"1',
    });
    expect(html).toBe(
      '<meta name="browsonic:content-collection" content="blog&lt;x&gt;/post&quot;1">',
    );
  });

  it("escapes ampersands so they don't turn into entity references", () => {
    const html = renderContentCollectionMeta({
      collection: 'tags',
      entry: 'cats & dogs',
    });
    expect(html).toContain('content="tags/cats &amp; dogs"');
  });

  it('handles deeply nested entry slugs that contain slashes', () => {
    // The convention is "<collection>/<entry>" — entries with their
    // own slashes still serialise predictably (Astro doesn't really
    // produce them but the helper must not corrupt them).
    const html = renderContentCollectionMeta({
      collection: 'docs',
      entry: 'guides/quickstart',
    });
    expect(html).toContain('content="docs/guides/quickstart"');
  });
});

describe('readContentCollectionFromDocument', () => {
  it('returns the meta value when the page has the canonical tag', () => {
    document.head.innerHTML = '<meta name="browsonic:content-collection" content="blog/post-1">';
    expect(readContentCollectionFromDocument()).toBe('blog/post-1');
  });

  it('returns null when the page has no content-collection meta', () => {
    document.head.innerHTML = '<meta name="og:title" content="Some other meta">';
    expect(readContentCollectionFromDocument()).toBeNull();
  });

  it('returns null when the meta exists but has empty content', () => {
    document.head.innerHTML = '<meta name="browsonic:content-collection" content="">';
    expect(readContentCollectionFromDocument()).toBeNull();
  });

  it('respects a custom metaName', () => {
    document.head.innerHTML = '<meta name="browsonic:content-collection.tag" content="tags/cats">';
    expect(readContentCollectionFromDocument('browsonic:content-collection.tag')).toBe('tags/cats');
  });

  it('returns the first match when multiple meta tags share the name', () => {
    // Astro pages should not ship two of the same meta but if they
    // do, the first one wins — that's standard `querySelector`
    // semantics and the test pins it so future changes are
    // intentional.
    document.head.innerHTML = `
      <meta name="browsonic:content-collection" content="blog/post-1">
      <meta name="browsonic:content-collection" content="blog/post-2">
    `;
    expect(readContentCollectionFromDocument()).toBe('blog/post-1');
  });

  it('round-trips render → read for typical Astro slug shapes', () => {
    // Build-time render produces the meta; runtime read gets the
    // same value back. This pins the contract end-to-end.
    const html = renderContentCollectionMeta({
      collection: 'authors',
      entry: 'jane-doe',
    });
    document.head.innerHTML = html;
    expect(readContentCollectionFromDocument()).toBe('authors/jane-doe');
  });
});
