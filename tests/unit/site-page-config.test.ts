/**
 * FOUNDATION-S1E2 — THE EFFECTIVE PAGE-FACING CONFIGURATION OF A SITE.
 *
 * Proves the one merge rule (`@/config/site-page-config`) and the configuration contract behind it:
 * a site with no override is the shared configuration, an override replaces only what it states,
 * another site is untouched, and an invalid site-specific value is refused by the REAL schema.
 */
import { describe, expect, it } from "vitest";

import { parseSiteConfig } from "@/config/loader";
import { effectiveSitePageConfig, mergeSitePageConfig, type SiteConfig } from "@/config";
import { resolveSites } from "@/core/site";
import { partitionSitesIntoHubs } from "@/core/spoke";

const SHARED_NAVIGATION = [
  { label: "Home", href: "/" },
  { label: "Services", href: "/services" },
];

const CANADA_NAVIGATION = [
  { label: "Accueil", href: "/" },
  { label: "Emplacements", href: "/locations" },
];

/** A configuration carrying only what this suite is about; the rest is inert but well-typed. */
function makeConfig(): SiteConfig {
  const { sites, defaultSite } = resolveSites({
    input: [
      { code: "ca", label: "Canada", locales: ["en", "fr"], defaultLocale: "en" },
      { code: "fr", label: "France", locales: ["fr"], defaultLocale: "fr" },
    ],
    defaultLocale: "fr",
    locales: ["en", "fr"],
  });

  return {
    url: "https://example.com",
    sites,
    defaultSite,
    // S3B: the Hub composition of these same Sites. This suite reads the page-facing merge rule
    // only, so the faithful (implicit) composition is produced by the accepted pure partition
    // rather than hand-written.
    hubs: partitionSitesIntoHubs(sites),
    sitePageOverrides: { ca: { navigation: CANADA_NAVIGATION } },
    defaultLocale: "fr",
    locales: [{ code: "en", label: "English" }, { code: "fr", label: "Français" }],
    name: "Test",
    tagline: "Test",
    description: "Test",
    contact: { email: "hello@example.com" },
    socialLinks: [],
    navigation: SHARED_NAVIGATION,
    footerNavigation: { heading: "More", items: [{ label: "About", href: "/about" }] },
    legal: [{ slug: "privacy", label: "Privacy" }],
    business: {} as SiteConfig["business"],
    regions: {},
    pageBindings: [],
  };
}

describe("mergeSitePageConfig (the ONE merge rule)", () => {
  const shared = {
    navigation: SHARED_NAVIGATION,
    footerNavigation: { heading: "More", items: [{ label: "About", href: "/about" }] },
    legal: [{ slug: "privacy", label: "Privacy" }],
  };

  it("uses the shared values when a site overrides nothing", () => {
    expect(mergeSitePageConfig(shared, undefined)).toBe(shared);
    expect(mergeSitePageConfig(shared, {})).toEqual(shared);
  });

  it("replaces only the leaves the site states, inheriting the rest", () => {
    const merged = mergeSitePageConfig(shared, { navigation: CANADA_NAVIGATION });
    expect(merged.navigation).toEqual(CANADA_NAVIGATION);
    // …untouched leaves are still the shared ones, by identity.
    expect(merged.footerNavigation).toBe(shared.footerNavigation);
    expect(merged.legal).toBe(shared.legal);
  });
});

describe("effectiveSitePageConfig", () => {
  it("gives the overriding site its own values", () => {
    const effective = effectiveSitePageConfig(makeConfig(), "ca");
    expect(effective.site.code).toBe("ca");
    expect(effective.navigation).toEqual(CANADA_NAVIGATION);
    // The site inherits what it does not override.
    expect(effective.legal).toEqual([{ slug: "privacy", label: "Privacy" }]);
  });

  it("leaves every other site on the shared values", () => {
    const effective = effectiveSitePageConfig(makeConfig(), "fr");
    expect(effective.site.code).toBe("fr");
    expect(effective.navigation).toEqual(SHARED_NAVIGATION);
  });

  it("resolves an UNDECLARED site code to the default site — and that site's own configuration", () => {
    const config = makeConfig();
    expect(effectiveSitePageConfig(config, config.sites[0]!).site.code).toBe("ca");
    // An undeclared site serves nothing, so it must never borrow another site's overrides: it
    // becomes the DEFAULT site, which serves exactly what that site serves.
    const unknown = effectiveSitePageConfig(config, "jp");
    expect(unknown.site.code).toBe(config.defaultSite.code);
    expect(unknown.navigation).toEqual(
      effectiveSitePageConfig(config, config.defaultSite).navigation,
    );
  });
});

describe("site-specific configuration is refused when it is invalid", () => {
  it("refuses a per-site navigation item that names no label", () => {
    expect(() =>
      parseSiteConfig({
        sites: [{ code: "ca", navigation: [{ label: "", href: "/" }] }],
      }),
    ).toThrowError(/sites\.0\.navigation\.0\.label/);
  });

  it("refuses a per-site navigation item with a leaf the schema does not define", () => {
    expect(() =>
      parseSiteConfig({
        sites: [{ code: "ca", navigation: [{ label: "Home", href: "/", position: "middle-earth" }] }],
      }),
    ).toThrowError(/sites\.0\.navigation\.0\.position/);
  });

  it("accepts a descriptive presentation code and refuses a malformed one", () => {
    // `GEO-03` R04 §6 — a Spoke Site code is a PRESENTATION IDENTITY governed by the one generic
    // descriptive-key grammar, so the reference's own neutral profile `main` is valid here. The
    // retired spellings need no special ban: they are simply ordinary keys.
    // R04-C12 §4 — the old form declared ONLY a Site, so it failed on five unrelated required fields
    // (site, i18n, contact, socialLinks, navigation) and could not establish anything about the identity.
    // A complete configuration now carries the case, and only the Site declaration changes between the
    // acceptance and the refusals, so a rejection here can only be about the Site identity itself.
    const complete = {
      site: { url: "https://example.com", name: "Test", tagline: "Test", description: "Test" },
      i18n: { locales: [{ code: "en", label: "English" }], defaultLocale: "en" },
      contact: { email: "hello@example.com" },
      socialLinks: [],
      navigation: [{ label: "Home", href: "/" }],
    };
    // The control: this very configuration is valid with an ordinary country code, so acceptance below
    // is not an accident of a lax parse.
    expect(() => parseSiteConfig({ ...complete, sites: [{ code: "ca" }] })).not.toThrow();
    expect(() => parseSiteConfig({ ...complete, sites: [{ code: "main" }] })).not.toThrow();
    expect(() => parseSiteConfig({ ...complete, sites: [{ code: "Main" }] })).toThrowError(/site id "Main"/);
    expect(() => parseSiteConfig({ ...complete, sites: [{ code: "my_office" }] })).toThrowError(
      /site id "my_office"/,
    );
  });
});
