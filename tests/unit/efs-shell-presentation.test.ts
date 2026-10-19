import { describe, expect, it } from "vitest";

import { efsShellPresentationConfig } from "@/app/[[...segments]]/server-composition";
import type { EfsView } from "@/app/[[...segments]]/efs-request";
import type { SiteConfig } from "@/config/site-config";
import { resolveSiteRequest } from "@/core/site";
import { resolveProperties, type PropertyOwner } from "@/core/efs/properties";

function view(
  overrides: {
    readonly prefix?: readonly string[];
    readonly pageId?: string;
    readonly siteMode?: "closed" | "open";
    readonly presentationSiteCode?: string;
  } = {},
): EfsView {
  const properties = new Map([
    ["site.label", { key: "site.label", value: "North", public: true, provenance: [] }],
  ]);
  return {
    publication: {
      id: "north-publication",
      spokeId: "north-spoke",
      presentationSiteCode: overrides.presentationSiteCode ?? "ww",
      entityId: "e_00000000000000000000000003",
      facetId: "north",
      bindings: [],
    },
    binding: {
      host: "north.example",
      prefix: overrides.prefix ?? ["de"],
      locales: ["de", "en"],
      defaultLocale: "en",
      siteMode: overrides.siteMode ?? "closed",
    },
    site: { id: "berlin", pages: [] },
    facet: { id: "germany" },
    page: { id: overrides.pageId ?? "frankfurt", route: ["frankfurt"] },
    properties: {
      get: (key: string) => properties.get(key),
      publicEntries: () => [...properties.values()],
    },
    canonical: "https://north.example/de/en",
  } as unknown as EfsView;
}

function source(): SiteConfig {
  const site = {
    code: "de",
    label: "Germany",
    locales: [
      { path: "en", canonical: "en-DE" },
      { path: "de", canonical: "de-DE" },
    ],
    defaultLocale: "de",
    fallback: true,
    isDefault: true,
    locationSelection: { mode: "required", default: "berlin" },
  };
  const alternate = { ...site, code: "x", label: "X", isDefault: false };
  const worldwide = {
    ...site,
    code: "ww",
    label: "Worldwide",
    locales: [
      { path: "en", canonical: "en" },
      { path: "de", canonical: "de" },
    ],
    defaultLocale: "en",
    locationSelection: null,
    isDefault: false,
  };
  return {
    url: "https://legacy.example",
    sites: [site, alternate, worldwide],
    defaultSite: site,
    hubs: [],
    sitePageOverrides: { de: { ctaHref: "/de" }, x: { ctaHref: "/x" } },
    defaultLocale: "en",
    locales: [
      { code: "en", label: "English" },
      { code: "de", label: "Deutsch" },
    ],
    name: "Legacy",
    tagline: "",
    description: "",
    contact: {},
    socialLinks: [],
    navigation: [],
    business: {
      timezone: "Europe/Berlin",
      contact: {},
      locations: [{ id: "berlin", address: { street: "Example Street 1", city: "Berlin" } }],
    },
    regions: { berlin: { id: "berlin", latitude: 52.5, longitude: 13.4 } },
    pageBindings: [{ site: "de", locale: "de", region: "berlin", slug: null }],
  } as unknown as SiteConfig;
}

describe("EFS shell presentation is name- and geography-neutral (R03)", () => {
  it("uses only the declared representation tags, never a country-derived tag", () => {
    const result = efsShellPresentationConfig(source(), view())!;
    expect(result.sites[0].locales).toEqual([
      { path: "de", canonical: "de" },
      { path: "en", canonical: "en" },
    ]);
    expect(result.defaultLocale).toBe("en");
    expect(JSON.stringify(result.sites)).not.toMatch(/de-DE|en-DE/);
  });

  it("removes regions, location policy, legacy timezone and location records", () => {
    const result = efsShellPresentationConfig(source(), view())!;
    expect(result.regions).toEqual({});
    expect(result.pageBindings).toEqual([]);
    expect(result.sites[0].locationSelection).toBeNull();
    expect(result.business.timezone).toBeUndefined();
    expect(result.business.locations).toEqual([]);
  });

  it("does not let a Site, Page or Facet name change locale or properties", () => {
    const baseline = efsShellPresentationConfig(source(), view())!;
    const named = efsShellPresentationConfig(source(), view({ pageId: "berlin" }))!;
    expect(named.sites[0].locales).toEqual(baseline.sites[0].locales);
    expect(named.sitePageOverrides).toEqual(baseline.sitePageOverrides);
    expect(named.business).toEqual(baseline.business);
  });

  it("keeps identity/properties when the binding changes between prefixed forms", () => {
    const prefixed = efsShellPresentationConfig(source(), view({ prefix: ["de"] }))!;
    const alternate = efsShellPresentationConfig(source(), view({ prefix: ["x"] }))!;
    expect(alternate.sites[0].locales).toEqual(prefixed.sites[0].locales);
    expect(alternate.sites[0].label).toBe(prefixed.sites[0].label);
    expect(alternate.business).toEqual(prefixed.business);
  });

  it("does not let any ownership ID change effective properties", () => {
    const chain = (entity: string, facet: string, site: string, page: string, representation: string) =>
      [
        { level: "entity", id: entity, properties: { "contact.address": { value: "1 Owner Way", public: true } } },
        { level: "facet", id: facet, properties: { "contact.phone": { value: "+1 555 0100", public: true } } },
        { level: "site", id: site, properties: { contact: { value: "site", public: true } } },
        { level: "page", id: page, properties: { "nav.label": { value: "About", public: true } } },
        { level: "representation", id: representation, properties: { "contact.address": null } },
      ] as PropertyOwner[];
    const baseline = resolveProperties(chain("e_1", "germany", "berlin", "frankfurt", "de"));
    const renamed = resolveProperties(chain("e_2", "north", "place", "city", "de"));
    expect(renamed.toRecord()).toEqual(baseline.toRecord());
    expect(renamed.publicEntries().map((entry) => entry.key)).toEqual(
      baseline.publicEntries().map((entry) => entry.key),
    );
    expect(renamed.get("contact.address")?.state).toBe("suppressed");
  });

  it("takes the presentation Site from the explicit publication, never from a prefix", () => {
    const dedicated = efsShellPresentationConfig(source(), view({ prefix: [] }))!;
    const single = efsShellPresentationConfig(source(), view({ prefix: ["de"] }))!;
    const nested = efsShellPresentationConfig(source(), view({ prefix: ["us", "west"] }))!;
    const open = efsShellPresentationConfig(
      source(),
      view({ prefix: ["us"], siteMode: "open" }),
    )!;

    for (const result of [dedicated, single, nested, open]) {
      expect(result.sites[0].code).toBe("ww");
      expect(result.sites[0].label).toBe("North");
      expect(result.sites[0].locales).toEqual([
        { path: "de", canonical: "de" },
        { path: "en", canonical: "en" },
      ]);
    }
    expect(dedicated.sites[0].publicPathBase).toEqual([]);
    expect(single.sites[0].publicPathBase).toEqual(["de"]);
    expect(nested.sites[0].publicPathBase).toEqual(["us", "west"]);
    expect(open.sites[0].publicPathBase).toEqual(["us", "berlin"]);
  });

  it("fails loudly when an explicit presentation Site is not in the owning Spoke", () => {
    expect(() =>
      efsShellPresentationConfig(source(), view({ presentationSiteCode: "missing" })),
    ).toThrow(/presentation Site "missing" is not declared/);
  });

  it("resolves the shared composition from the EFS public base, not a Site code", () => {
    const nested = efsShellPresentationConfig(source(), view({ prefix: ["us", "west"] }))!;
    const request = resolveSiteRequest({ sites: nested.sites, defaultSite: nested.defaultSite }, [
      "us",
      "west",
      "en",
      "about",
    ]);
    expect(request?.site.code).toBe("ww");
    expect(request?.localePath).toBe("en");
    expect(request?.routePath).toBe("about");
    const dedicated = efsShellPresentationConfig(source(), view({ prefix: [] }))!;
    expect(
      resolveSiteRequest({ sites: dedicated.sites, defaultSite: dedicated.defaultSite }, [
        "de",
        "frankfurt",
      ])?.routePath,
    ).toBe("frankfurt");
  });
});
