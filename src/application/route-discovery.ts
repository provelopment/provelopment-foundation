import { HOME_CONTENT_SLUG } from "@/core/page-content";

/**
 * Route discovery for the sitemap.
 *
 * The sitemap derives routes from the CONTENT MODEL plus feature enablement:
 *  - every page slug present in the default locale, plus the locale root;
 *  - when `features.offerings` is enabled, the offerings listing plus every
 *    canonical (default-locale) offering slug.
 * Navigation config is deliberately NOT consulted here — it controls
 * discoverability in the UI, not route existence. Pure and unit-testable.
 */
export interface SitemapRouteOptions {
  readonly offeringsEnabled: boolean;
  readonly pages: readonly string[];
  readonly canonicalOfferings: readonly string[];
  /** Canonical, configured legal document slugs (config ∧ content). */
  readonly legalSlugs?: readonly string[];
  /** Phase T — trust/content primitives (content-driven, feature-gated). */
  readonly testimonialsEnabled: boolean;
  readonly portfolioEnabled: boolean;
  readonly canonicalPortfolio: readonly string[];
  readonly blogEnabled: boolean;
  readonly publishedBlogSlugs: readonly string[];
}

export function buildSitemapRoutes(options: SitemapRouteOptions): string[] {
  // The RESERVED home slug is excluded: a site's home page may be authored as
  // ordinary content (`content/pages/<locale>/home.md`) but is SERVED by the
  // locale root (the `""` entry below), never at `/{locale}/home`. Route
  // discovery owns this rule so no sitemap caller has to remember it, and so a
  // site can never advertise a URL it does not serve.
  const routes = [
    "",
    ...options.pages
      .filter((slug) => slug !== HOME_CONTENT_SLUG)
      .map((slug) => `/${slug}`),
  ];

  if (options.offeringsEnabled) {
    routes.push(
      "/offerings",
      ...options.canonicalOfferings.map((slug) => `/offerings/${slug}`),
    );
  }

  for (const slug of options.legalSlugs ?? []) {
    routes.push(`/legal/${slug}`);
  }

  if (options.testimonialsEnabled) {
    routes.push("/testimonials");
  }

  if (options.portfolioEnabled) {
    routes.push(
      "/portfolio",
      ...options.canonicalPortfolio.map((slug) => `/portfolio/${slug}`),
    );
  }

  // Blog drafts are excluded upstream (publishedBlogSlugs are published only);
  // RSS feeds are deliberately NOT added to the XML sitemap.
  if (options.blogEnabled) {
    routes.push("/blog", ...options.publishedBlogSlugs.map((slug) => `/blog/${slug}`));
  }

  return routes;
}