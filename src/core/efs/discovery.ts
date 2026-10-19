/**
 * DISCOVERY FROM THE EFFECTIVE BINDING (`D31`, E1 CP-5)
 * ===================================================
 *
 * A sitemap is an output of one effective binding, never of an Entity identity or `site.url`.
 * Only `public` Pages appear. Every existing representation gets one canonical URL built from
 * that binding's public base; an `unlisted` Page is served but never advertised. No alternate
 * is invented for a translation that does not exist.
 */
import { canonicalLocaleTag, localePathKey } from "./locales";
import { canonicalUrl, type EfsBinding } from "./publication";

/** The Page facts needed to propose a sitemap entry. */
export interface DiscoveryPage {
  readonly pageId: string;
  readonly siteId: string;
  readonly route: readonly string[];
  readonly visibility: "public" | "unlisted";
  readonly representations: readonly { readonly locale: string }[];
}

/** One discoverable localized URL. */
export interface DiscoveryEntry {
  readonly pageId: string;
  readonly siteId: string;
  readonly locale: string;
  readonly loc: string;
}

/** Public, existing representations only, from the binding's canonical base. */
export function sitemapEntries(
  binding: EfsBinding,
  pages: readonly DiscoveryPage[],
): readonly DiscoveryEntry[] {
  const entries: DiscoveryEntry[] = [];
  for (const page of pages) {
    if (page.visibility !== "public") continue;
    if (!binding.siteIds.includes(page.siteId)) continue;
    for (const representation of page.representations) {
      const locale = canonicalLocaleTag(representation.locale);
      entries.push({
        pageId: page.pageId,
        siteId: page.siteId,
        locale,
        loc: canonicalUrl(binding, {
          siteId: page.siteId,
          locale,
          localeKey: localePathKey(locale),
          pageRoute: page.route,
        }),
      });
    }
  }
  return entries;
}
