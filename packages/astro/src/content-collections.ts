// SPDX-License-Identifier: Apache-2.0

/**
 * Astro Content Collections breadcrumb bridge. Astro Content
 * Collections are a build-time feature: a `src/content/<collection>/<entry>.md`
 * tree that resolves to typed objects in the page frontmatter.
 * The challenge for client-side observability is that the
 * collection identity (`'blog/post-1'`) lives in the page's
 * frontmatter at build time but evaporates by the time the View
 * Transitions client-side navigates between pages.
 *
 * This module ships a tiny build-time helper +
 * a runtime reader convention so the navigation breadcrumb the
 * adapter already emits can carry the collection / entry identity:
 *
 *   1. **Build-time:** the page (or its layout) calls
 *      `renderContentCollectionMeta({ collection, entry })` in its
 *      frontmatter and inserts the returned HTML string into the
 *      page `<head>` via Astro's `set:html` directive. The helper
 *      writes
 *      `<meta name="browsonic:content-collection" content="<collection>/<entry>">`.
 *   2. **Runtime:** the View Transitions listener
 *      (`registerNavigationBreadcrumbs`) reads the meta tag from
 *      the document on every after-swap and includes the value
 *      under `breadcrumb.data.contentCollection`. No coordination
 *      between the two sides — the meta tag is the bridge.
 *
 * Why a string helper instead of an Astro component:
 *
 * Shipping `.astro` files would force `astro` into our build chain
 * (the `astro` package's compiler) and force consumers' bundlers
 * to load it too. Returning a plain HTML string keeps this
 * adapter pure-TS and portable. Astro's `set:html` directive
 * accepts the returned string verbatim.
 *
 * @copyright 2024-2026 Browsonic
 * @license Apache-2.0
 */

export interface ContentCollectionMetaOptions {
  /**
   * The collection name as defined in `src/content/config.ts`
   * (e.g. `'blog'`, `'docs'`, `'authors'`). Becomes the prefix of
   * the meta value.
   */
  collection: string;
  /**
   * The entry id within the collection — typically the file name
   * without extension (`'post-1'`) or a slug field. Becomes the
   * suffix of the meta value.
   */
  entry: string;
  /**
   * Override the meta tag name. Defaults to
   * `'browsonic:content-collection'`. Custom names let consumers
   * scope multiple collection dimensions on the same page (rare;
   * e.g. a blog post that also belongs to a tag collection).
   */
  metaName?: string;
}

/**
 * Render the build-time meta tag that ties an Astro Content
 * Collection entry to the client-side navigation breadcrumb.
 * Returns an HTML string suitable for Astro's `set:html` directive.
 *
 * The output format is `<meta name="<metaName>" content="<collection>/<entry>">`
 * with all three values HTML-attribute-escaped — quotes, ampersands,
 * angle brackets, and surrogate-pair edge cases handled.
 *
 * @example
 * ```astro
 * ---
 * // src/pages/blog/[slug].astro
 * import { renderContentCollectionMeta } from '@browsonic/astro';
 * import { getCollection } from 'astro:content';
 *
 * export async function getStaticPaths() {
 *   const posts = await getCollection('blog');
 *   return posts.map((post) => ({ params: { slug: post.slug }, props: { post } }));
 * }
 *
 * const { post } = Astro.props;
 * const meta = renderContentCollectionMeta({ collection: 'blog', entry: post.slug });
 * ---
 * <html>
 *   <head>
 *     <Fragment set:html={meta} />
 *     <title>{post.data.title}</title>
 *   </head>
 *   <body><slot /></body>
 * </html>
 * ```
 */
export function renderContentCollectionMeta(options: ContentCollectionMetaOptions): string {
  const metaName = options.metaName ?? 'browsonic:content-collection';
  const value = `${options.collection}/${options.entry}`;
  return `<meta name="${escapeHtmlAttribute(metaName)}" content="${escapeHtmlAttribute(value)}">`;
}

/**
 * Read the content-collection identity from the current document's
 * `<head>`. Returns the meta value (e.g. `'blog/post-1'`) or
 * `null` when the page isn't a content-collection page or hasn't
 * adopted the helper yet. Browser-only — short-circuits in SSR.
 *
 * The View Transitions instrumentation calls this internally on
 * every after-swap; consumers rarely need it directly.
 */
export function readContentCollectionFromDocument(
  metaName = 'browsonic:content-collection',
): string | null {
  if (typeof document === 'undefined') return null;
  // Use a CSS attribute selector rather than `getElementsByTagName('meta')`
  // + filter to keep the lookup O(1) per document — Astro pages can
  // ship many meta tags (Open Graph, Twitter, etc.) and a per-swap
  // linear scan is wasteful.
  const el = document.querySelector<HTMLMetaElement>(`meta[name="${cssEscape(metaName)}"]`);
  if (!el) return null;
  const content = el.content;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

/**
 * Minimal HTML attribute escape. Handles the four characters that
 * matter inside double-quoted attribute values: `&`, `"`, `<`, `>`.
 * Single quotes don't need escaping in double-quoted attributes;
 * we leave them alone so the output stays compact for the common
 * case (kebab-case slugs without special chars).
 */
function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * CSS attribute-selector escape. Quotes inside a `[name="..."]`
 * selector need to be backslash-escaped. We keep the implementation
 * small — full `CSS.escape` semantics aren't needed because meta
 * names should be ASCII identifiers (`browsonic:content-collection`,
 * `og:title`, etc.); the function only protects against quotes
 * and backslashes that would break the selector parser.
 */
function cssEscape(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
