import { describe, expect, it } from "vitest";

import type { PageRegionBinding } from "@/core/region";
import { buildRegionalLanguageAlternates } from "@/core/regional-pages";
import { buildLanguageAlternates } from "@/core/locale";
import { buildOpenGraphData, resolveOgImageUrl } from "@/core/seo-metadata";
import { resolveSites, sitePath } from "@/core/site";

/**
 * STANDARDS-FACING LOCALE METADATA (FOUNDATION-S1E3A)
 * ==================================================
 *
 * The URL keeps the locale PATH KEY (`/ca/fr/about`), while every standards-facing value carries
 * the CANONICAL tag (`fr-CA`). Alternates are SITE-BOUNDED: another site that happens to share the
 * language is never emitted as a translation of this page.
 */
const baseUrl = "https://example.com";

const sites = resolveSites({
  input: [
    { code: "ca", locales: [{ path: "en", canonical: "en-CA" }, { path: "fr", canonical: "fr-CA" }], defaultLocale: "en" },
    // Another site that ALSO serves French — never an alternate of a Canadian page.
    { code: "fr", locales: [{ path: "fr", canonical: "fr-FR" }], defaultLocale: "fr" },
  ],
  defaultLocale: "en",
  locales: ["en", "fr"],
}).sites;

const canada = sites[0]!;
const france = sites[1]!;

describe("hreflang alternates are canonical-tagged and site-bounded", () => {
  const alternates = buildLanguageAlternates({
    baseUrl,
    locales: canada.locales,
    defaultLocale: canada.defaultLocale,
    path: "/about",
    sitePrefix: "/ca",
  });

  it("keys by the canonical tag while the URL keeps the lowercase path key", () => {
    expect(alternates["fr-CA"]).toBe(`${baseUrl}/ca/fr/about`);
    expect(alternates["en-CA"]).toBe(`${baseUrl}/ca/en/about`);
    expect(alternates["fr"]).toBeUndefined();
  });

  it("keeps x-default inside the active site", () => {
    expect(alternates["x-default"]).toBe(`${baseUrl}/ca/en/about`);
  });

  it("never emits another site's same-language page as a translation", () => {
    expect(alternates["fr-FR"]).toBeUndefined();
    for (const url of Object.values(alternates)) {
      expect(url.startsWith(`${baseUrl}/ca/`), url).toBe(true);
    }
  });

  it("applies the same rule to a site that makes no country assumption", () => {
    const worldwide = buildLanguageAlternates({
      baseUrl,
      locales: [{ path: "fr", canonical: "fr" }],
      sitePrefix: "/ww",
      path: "/about",
    });
    expect(worldwide["fr"]).toBe(`${baseUrl}/ww/fr/about`);
    expect(worldwide["fr-CA"]).toBeUndefined();
  });

  it("keys REGIONAL alternates by the canonical tag too", () => {
    const entries: readonly PageRegionBinding[] = [
      { site: "ca", locale: "en", region: "toronto", slug: null },
      { site: "ca", locale: "fr", region: "toronto", slug: null },
    ];
    const regional = buildRegionalLanguageAlternates({
      baseUrl,
      locales: canada.locales,
      defaultLocale: canada.defaultLocale,
      entries,
      region: "toronto",
      slug: null,
      sitePrefix: "/ca",
    });

    expect(regional["fr-CA"]).toBe(`${baseUrl}/ca/fr/toronto`);
    expect(regional["en-CA"]).toBe(`${baseUrl}/ca/en/toronto`);
    expect(regional["x-default"]).toBe(`${baseUrl}/ca/en/toronto`);
  });

  it("does not invent an alternate for a region another site holds", () => {
    const entries: readonly PageRegionBinding[] = [
      { site: "fr", locale: "fr", region: "paris", slug: null },
    ];
    const regional = buildRegionalLanguageAlternates({
      baseUrl,
      locales: france.locales,
      defaultLocale: france.defaultLocale,
      entries,
      region: "paris",
      slug: null,
      sitePrefix: "/fr",
    });
    // The France site's French is `fr-FR`: the key is the canonical tag, the URL keeps `fr`.
    expect(regional["fr-FR"]).toBe(`${baseUrl}/fr/fr/paris`);
    expect(regional["fr"]).toBeUndefined();
  });
});

describe("Open Graph locale metadata and the generated image URL", () => {
  it("carries the canonical tag, not the URL key", () => {
    const data = buildOpenGraphData({
      baseUrl,
      siteName: "Example",
      locale: "fr-CA",
      alternateLocales: ["en-CA"],
      title: "À propos",
      url: `${baseUrl}/ca/fr/about`,
    });
    expect(data.locale).toBe("fr-CA");
    expect(data.alternateLocale).toEqual(["en-CA"]);
  });

  it("points the generated image at the SITE-SCOPED route", () => {
    for (const [site, localeKey] of [
      [canada, "fr"],
      [canada, "en"],
      [france, "fr"],
    ] as const) {
      const ogPath = sitePath(site, localeKey, "opengraph-image");
      expect(ogPath).not.toBeNull();
      expect(resolveOgImageUrl(undefined, baseUrl, ogPath!)).toBe(
        `${baseUrl}/${site.code}/${localeKey}/opengraph-image`,
      );
    }
  });

  it("still prefers a configured image asset over the generated route", () => {
    expect(
      resolveOgImageUrl("https://cdn.example.com/og.png", baseUrl, "/ca/fr/opengraph-image"),
    ).toBe("https://cdn.example.com/og.png");
  });
});