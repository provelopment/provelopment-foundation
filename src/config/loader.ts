import rawSiteConfig from "../../site.config.json";
import type { z } from "zod";

import { siteConfigFileSchema } from "./schema";
import type { Business, BusinessContact } from "@/core/business";
import { assertValidAddressPresentation } from "@/core/business";
import type { OperationalRegion, PageRegionBinding } from "@/core/region";
import { assertRegionsValid } from "@/core/region";
import type { SiteConfig } from "./site-config";

/** The validated shape of `site.config.json`. */
export type SiteConfigFile = z.infer<typeof siteConfigFileSchema>;

/**
 * Validates a raw configuration object against the schema and maps it to
 * the flattened `SiteConfig` shape consumed by the application.
 *
 * Throws a descriptive error listing every problem when validation fails,
 * so bad edits fail fast at build time.
 */
export function parseSiteConfig(raw: unknown): SiteConfig {
  const result = siteConfigFileSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.join(".") || "(root)";
        return `  - ${path}: ${issue.message}`;
      })
      .join("\n");

    throw new Error(`Invalid site configuration:\n${details}`);
  }

  const json = result.data;

  const business = toNormalizedBusiness(json);
  const regions = toRegions(json);
  const pageBindings = toPageBindings(json.business?.pages);

  // Phase K — cross-reference validation (page→region, duplicate bindings,
  // locale membership, address-presentation invariants). Loud at build time so
  // a regional page never silently falls back to a global/other identity.
  assertRegionsValid(
    regions,
    pageBindings,
    json.i18n.locales.map((locale) => locale.code),
  );

  return {
    url: json.site.url,
    name: json.site.name,
    tagline: json.site.tagline,
    description: json.site.description,
    logo: json.site.logo,
    assets: json.site.assets,
    defaultLocale: json.i18n.defaultLocale,
    locales: json.i18n.locales,
    contact: json.contact,
    socialLinks: json.socialLinks,
    navigation: json.navigation,
    footerNavigation: json.footerNavigation,
    connect: json.connect,
    ui: json.ui,
    business,
    regions,
    pageBindings,
    analytics: json.features?.analytics,
    mapsFeature: json.features?.maps,
    bookingFeature: json.features?.booking,
    contactFeature: json.features?.contact,
    offeringsFeature: json.features?.offerings,
    testimonialsFeature: json.features?.testimonials,
    portfolioFeature: json.features?.portfolio,
    blogFeature: json.features?.blog,
    legal: json.legal,
  };
}

/**
 * Builds the normalized `Business` object consumed by the application.
 *
 * The loader is the ONLY place that knows whether the adopter used the new
 * `business` block or legacy top-level `contact`. Every downstream consumer
 * reads the normalized shape, so the bridge can later be removed cleanly.
 */
function toNormalizedBusiness(json: SiteConfigFile): Business {
  const block = json.business;
  const legacyContact = json.contact;

  const contact: BusinessContact = {
    email: block?.contact?.email ?? legacyContact.email,
    phone: block?.contact?.phone ?? legacyContact.phone,
    locales: block?.contact?.locales ?? legacyContact.locales,
  };

  const business: Business = {
    timezone: block?.timezone,
    type: block?.type,
    name: block?.name ?? json.site.name,
    tagline: block?.tagline ?? json.site.tagline,
    description: block?.description ?? json.site.description,
    contact,
    locations: (block?.locations ?? []).map((loc) => ({
      id: loc.id,
      name: loc.name,
      address: loc.address,
      addressInternational: loc.addressInternational,
      addressMode: loc.addressMode,
      geo: loc.geo,
      phone: loc.phone,
      timezone: loc.timezone,
      hours: loc.hours,
      locales: loc.locales,
    })),
  };

  // A `local-international` presentation mode without an international address
  // is a config error (see core/business.assertValidAddressPresentation). Runs
  // here, at build/parse time, so a bad edit fails fast and descriptively.
  assertValidAddressPresentation(
    business,
    json.i18n.locales.map((locale) => locale.code),
  );

  return business;
}

/**
 * Builds the normalized phase-K region map (id-injected, complete schedule).
 *
 * An absent/empty `business.regions` block yields an empty record — the legacy
 * global model stays untouched. When regions exist, each region is a complete
 * operational identity; days/holidays omitted from config default to "closed"
 * / no holidays.
 */
function toRegions(json: SiteConfigFile): Readonly<Record<string, OperationalRegion>> {
  const rawRegions = json.business?.regions ?? {};
  const regions: Record<string, OperationalRegion> = {};

  for (const [id, raw] of Object.entries(rawRegions)) {
    regions[id] = {
      id,
      timezone: raw.timezone,
      name: raw.name,
      label: raw.label,
      labels: raw.labels,
      defaultLocale: raw.defaultLocale,
      address: raw.address,
      addressInternational: raw.addressInternational,
      addressMode: raw.addressMode,
      geo: raw.geo,
      phone: raw.phone,
      email: raw.email,
      currency: raw.currency,
      currencySymbol: raw.currencySymbol,
      hours: {
        monday: raw.hours.monday ?? [],
        tuesday: raw.hours.tuesday ?? [],
        wednesday: raw.hours.wednesday ?? [],
        thursday: raw.hours.thursday ?? [],
        friday: raw.hours.friday ?? [],
        saturday: raw.hours.saturday ?? [],
        sunday: raw.hours.sunday ?? [],
        holidays: raw.hours.holidays ?? [],
      },
    };
  }

  return regions;
}

/**
 * Normalizes the raw `business.pages` entries to canonical
 * `{ locale, region, slug: string | null }`:
 *
 *  - `{ locale, region }`                      → landing (slug null);
 *  - `{ locale, region, slug }`                → regional page;
 *  - Phase K `{ locale, slug, region }` where `slug === region` → landing
 *    (back-compat: Phase K regional landing pages used their region id as the
 *    content slug).
 */
function toPageBindings(
  raw: readonly { locale: string; region: string; slug?: string }[] | undefined,
): readonly PageRegionBinding[] {
  return (raw ?? []).map((entry) => {
    if (entry.slug === undefined || entry.slug === entry.region) {
      return { locale: entry.locale, region: entry.region, slug: null };
    }
    return { locale: entry.locale, region: entry.region, slug: entry.slug };
  });
}

/**
 * The application's validated configuration.
 *
 * This is the only sanctioned way to read `site.config.json`; importing
 * the JSON directly anywhere else bypasses validation.
 */
export const siteConfig: SiteConfig = parseSiteConfig(rawSiteConfig);