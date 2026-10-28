import { readDeploymentConfig } from "./deployment-root";
import type { z } from "zod";

import { siteConfigFileSchema } from "./schema";
import type { Business, BusinessContact } from "@/core/business";
import { assertValidAddressPresentation } from "@/core/business";
import type { OperationalRegion, PageRegionBinding } from "@/core/region";
import { assertRegionsValid, normalizePageRegionBindings, type AuthoredPageRegionBinding } from "@/core/region";
import { assertLocationSelectionValid } from "@/core/location-selection";
import { resolveSites } from "@/core/site";
import type { SiteConfig, SitePageOverrides } from "./site-config";
import { hubsForAuthoredSites } from "./hub-membership";

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

  // S1 — the deployment's sites, resolved ONCE by the core resolver (the schema already
  // validated coherence through the same function, so this cannot fail here).
  const localeCodes = json.i18n.locales.map((locale) => locale.code);
  const { sites, defaultSite } = resolveSites({
    input: json.sites,
    defaultLocale: json.i18n.defaultLocale,
    locales: localeCodes,
  });

  // S3B — the Hub composition of THAT SAME resolved population. The Site population is resolved ONCE
  // above and merely partitioned here (never re-resolved per Hub), so the single Spoke-wide default
  // and every `ResolvedSite` object stay exactly what `resolveSites` produced. The authored
  // `sites[].hub` leaves are read through the ONE config-layer seam the schema also uses, so
  // validation and normalization cannot disagree.
  const hubs = hubsForAuthoredSites(sites, json.sites);

  const pageBindings = toPageBindings(json.business?.pages, defaultSite.code);

  // S1E2 — the page-facing concerns a site OVERRIDES (navigation, footer navigation, legal, the
  // Connect inventory). An override travels ON its own site's entry, so it can never name a site
  // that does not exist, and a leaf that is absent stays shared. Keyed by site CODE.
  const sitePageOverrides: Record<string, SitePageOverrides> = {};
  for (const entry of json.sites ?? []) {
    const overrides: SitePageOverrides = {
      ...(entry.navigation === undefined ? {} : { navigation: entry.navigation }),
      ...(entry.footerNavigation === undefined
        ? {}
        : { footerNavigation: entry.footerNavigation }),
      ...(entry.legal === undefined ? {} : { legal: entry.legal }),
      ...(entry.connect === undefined ? {} : { connect: entry.connect }),
      ...(entry.ctaHref === undefined ? {} : { ctaHref: entry.ctaHref }),
    };
    if (Object.keys(overrides).length > 0) sitePageOverrides[entry.code] = overrides;
  }

  // Phase K — cross-reference validation (page→region, duplicate bindings,
  // locale membership, address-presentation invariants). Loud at build time so
  // a regional page never silently falls back to a global/other identity.
  assertRegionsValid(regions, pageBindings, localeCodes);

  // LOC1 — a Site that REQUIRES a Location must be able to honour it: the configured default must be an
  // operating Location of THAT Site's own inventory with a usable landing destination, and a Site that
  // binds no Location may not require one. The rules are the core module's — the very functions the
  // schema validates with — so configuration validation and runtime resolution cannot disagree, and an
  // unhonourable policy fails HERE rather than becoming a runtime 404.
  assertLocationSelectionValid({ sites, regions, bindings: pageBindings });

  return {
    url: json.site.url ?? (json.publication ? `https://${json.publication.host}` : ""),
    name: json.site.name,
    tagline: json.site.tagline,
    description: json.site.description,
    logo: json.site.logo,
    assets: json.site.assets,
    sites,
    defaultSite,
    hubs,
    sitePageOverrides,
    defaultLocale: json.i18n.defaultLocale,
    locales: json.i18n.locales,
    contact: json.contact,
    socialLinks: json.socialLinks,
    navigation: json.navigation,
    footerNavigation: json.footerNavigation,
    connect: json.connect,
    // A9 — the Connect-Module communication declarations must survive normalization UNCHANGED. They are
    // keyed by EFS Site id, and they are read from `view.context.siteConfig.communication`, so dropping
    // them here would disable both capabilities with no error anywhere: the schema would accept an
    // author's block, and the runtime simply would not see it.
    communication: json.communication,
    ui: json.ui,
    business,
    regions,
    pageBindings,
    analytics: json.features?.analytics,
    mapsFeature: json.features?.maps,
    bookingFeature: json.features?.booking,
    contactFeature: json.features?.contact,
    legal: json.legal,
    // R1 — the OPTIONAL site-wide notice (authored). Absent stays absent, so a Spoke that presents none
    // renders exactly the chrome it rendered before this capability existed.
    siteNotice: json.siteNotice,
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
 * `{ site, locale, region, slug: string | null }`:
 *
 *  - `{ locale, region }`                      → landing (slug null);
 *  - `{ locale, region, slug }`                → regional page;
 *  - Phase K `{ locale, slug, region }` where `slug === region` → landing
 *    (back-compat: Phase K regional landing pages used their region id as the
 *    content slug);
 *  - S1 `{ site, ... }`                        → the site whose tree carries it; absent →
 *    the DEFAULT site, so a single-site deployment keeps its configuration as it was.
 */
function toPageBindings(
  raw: readonly AuthoredPageRegionBinding[] | undefined,
  defaultSiteId: string,
): readonly PageRegionBinding[] {
  // THE ONE normalization rule, in the domain that owns the binding shape
  // (`@/core/region`): the schema validates with the SAME function, so what the author wrote is
  // understood identically here and there.
  return normalizePageRegionBindings(raw, defaultSiteId);
}

/**
 * The application's validated configuration — the ONE-SPOKE COMPATIBILITY BINDING (M16).
 *
 * A MULTI-SPOKE Installation has NO single configuration to parse, so this function fails LOUDLY when called
 * there (`readDeploymentConfig` refuses it with its own message). It is a FUNCTION rather than a module-level
 * constant precisely so that importing this module — which every consumer of `parseSiteConfig` does — resolves
 * NOTHING: the per-Spoke reader (`./spoke-config`) parses ONE Spoke's configuration in a multi-Spoke
 * Installation, and a module-load failure would make that impossible.
 *
 * The eager binding the application has always had now lives beside the barrel that exports it
 * (`./active-site-config`), unchanged in meaning and failing identically.
 */
export function activeDeploymentSiteConfig(): SiteConfig {
  return parseSiteConfig(readDeploymentConfig());
}