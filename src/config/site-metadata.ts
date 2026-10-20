/**
 * THE SITE'S OWN METADATA WORDING FOR ONE LOCALE (FOUNDATION-R1B)
 * ==============================================================
 *
 * `site.name` and `site.description` are ONE value each, because a single-language
 * deployment — the ordinary adopter — states them once. A site's locale ROOT
 * (`/<site>/<locale>`) is the one URL where no page-level summary speaks for the
 * site: the route deliberately uses the site's own description there, "whatever
 * answers the page itself" (`[[...segments]]/page.tsx`). Without a locale dimension,
 * that meant a translated locale root advertised the deployment's default-language
 * sentence.
 *
 * A locale entry may therefore state its own `description`, and the WHOLE rule lives
 * here, once:
 *
 *     the locale's own description   → used for that locale's root metadata
 *     absent                         → `site.description` (the unchanged behaviour)
 *
 * The rule deliberately does NOT reach `site.name` (a brand name is not translated by
 * configuration), an ordinary page's metadata (a page owns its own title and summary),
 * or any locale's non-root URLs.
 */
import type { SiteConfig } from "./site-config";

/** The description THIS locale advertises where the site's own words stand alone. */
export function siteDescriptionForLocale(
  config: SiteConfig,
  localePath: string,
): string | undefined {
  return (
    config.locales.find((locale) => locale.code === localePath)?.description ?? config.description
  );
}
