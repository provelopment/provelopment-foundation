/**
 * A page of human-authored content.
 *
 * The body is raw Markdown. Converting Markdown to HTML is a presentation
 * concern and must not happen in the domain or application layers.
 */
export interface PageContent {
  readonly slug: string;
  /** The locale of the content actually served (after any fallback). */
  readonly locale: string;
  readonly title: string;
  readonly body: string;
}

/**
 * The RESERVED content slug for a site's HOME page.
 *
 * A site may author its home page as ordinary content —
 * `content/pages/<locale>/home.md` — and the locale-root route (`/{locale}`)
 * renders it. Authoring the home page this way is OPTIONAL: a site with no
 * `home.md` keeps the generic configuration-driven starter homepage.
 *
 * Declaring the slug ONCE here keeps the three consequences in agreement, so no
 * caller can re-derive its own literal and drift:
 *
 *   1. the locale-root route looks the content up by this slug;
 *   2. `/{locale}/home` must NOT also be generated (the `[item]` route treats the
 *      slug as a reserved/static route, exactly as it does `about`/`contact`);
 *   3. the sitemap must NOT advertise `/{locale}/home`, because the home page's
 *      real URL is the locale root — which the sitemap already emits.
 */
export const HOME_CONTENT_SLUG = "home";