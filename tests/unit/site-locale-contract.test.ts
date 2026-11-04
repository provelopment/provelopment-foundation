import { describe, expect, it } from "vitest";

import { canonicalTagForPathKey, isLocalePathKey } from "@/core/site-locale";
import { SiteConfigurationError, resolveSites } from "@/core/site";

/**
 * THE LOCALE CONTRACT of a SITE (FOUNDATION-S1/S1E3A)
 * ==================================================
 *
 * A locale is addressed by a LOWERCASE path key (the content directory and the URL segment) and
 * identified by a canonical tag at standards-facing boundaries. `GEO-04` Stage C-A retired the last
 * Site-derived language inference: a SIMPLE key is the bare language in every Site (`ca` + `en` → `en`),
 * a country variant is AUTHORED explicitly or written as a qualified key, and two locale keys of one
 * site that resolve to the SAME canonical tag remain a hard configuration error.
 */
const LOCALES = ["en", "fr", "fr-fr", "de", "pt", "zh-hant", "zh-hant-tw", "sr-latn"];

type LocaleInput = string | { path: string; canonical?: string };

function resolve(
  input: readonly { code: string; locales?: readonly LocaleInput[]; defaultLocale?: string }[],
) {
  return resolveSites({ input, defaultLocale: "en", locales: LOCALES }).sites;
}

describe("locale path-key grammar", () => {
  it("accepts the documented shapes", () => {
    for (const key of ["en", "fr", "fr-ca", "zh-hant", "zh-hant-tw", "sr-latn", "es-419"]) {
      expect(isLocalePathKey(key), key).toBe(true);
    }
  });

  it("refuses spellings outside the Foundation contract (extensions, private use, extra subtags)", () => {
    for (const key of [
      "en-x-private",
      "en-US-u-nu-latn",
      "de-de-u-co-phonebk",
      "zh-hant-tw-extra",
      "EN",
      "Fr-Ca",
      "f",
      "english",
      "fr_ca",
    ]) {
      expect(isLocalePathKey(key), key).toBe(false);
    }
  });
});

describe("canonical casing", () => {
  it("upper-cases the region and title-cases the script", () => {
    expect(canonicalTagForPathKey("fr-ca")).toBe("fr-CA");
    expect(canonicalTagForPathKey("zh-hant")).toBe("zh-Hant");
    expect(canonicalTagForPathKey("zh-hant-tw")).toBe("zh-Hant-TW");
    expect(canonicalTagForPathKey("sr-latn")).toBe("sr-Latn");
    expect(canonicalTagForPathKey("en")).toBe("en");
  });

  it("keeps the URL/file key lowercase while the tag is canonical", () => {
    // A qualified key carries its own region, so the key stays lowercase and the tag is canonical.
    const [ca] = resolve([{ code: "ca", locales: ["fr-fr"], defaultLocale: "fr-fr" }]);
    const french = ca?.locales.find((locale) => locale.path === "fr-fr");
    expect(french?.path).toBe("fr-fr");
    expect(french?.canonical).toBe("fr-FR");
  });
});

describe("no country is derived from the Site code", () => {
  it("resolves a simple key to the bare language (ca/en → en, ch/de → de, br/pt → pt)", () => {
    const [ca] = resolve([{ code: "ca", locales: ["en", "fr"], defaultLocale: "en" }]);
    expect(ca?.locales.map((locale) => locale.canonical)).toEqual(["en", "fr"]);

    const [ch] = resolve([{ code: "ch", locales: ["de"], defaultLocale: "de" }]);
    expect(ch?.locales[0]?.canonical).toBe("de");

    const [br] = resolve([{ code: "br", locales: ["pt"], defaultLocale: "pt" }]);
    expect(br?.locales[0]?.canonical).toBe("pt");
  });

  it("keeps an AUTHORED country variant exactly as declared", () => {
    // The mapping a deployment really wants is a declaration, not an inference from its Site name.
    const [ca] = resolveSites({
      input: [{ code: "ca", locales: [{ path: "en", canonical: "en-CA" }], defaultLocale: "en" }],
      defaultLocale: "en",
      locales: LOCALES,
    }).sites;
    expect(ca?.locales[0]?.canonical).toBe("en-CA");
    expect(ca?.locales[0]?.path).toBe("en");
  });
});

describe("the Worldwide site makes no country assumption", () => {
  it("keeps a simple key simple (ww/fr → fr)", () => {
    const [ww] = resolve([{ code: "ww", locales: ["fr"], defaultLocale: "fr" }]);
    expect(ww?.locales[0]?.canonical).toBe("fr");
  });

  it("honours an explicit canonical mapping (ww/en → en-US)", () => {
    const [ww] = resolveSites({
      input: [{ code: "ww", locales: [{ path: "en", canonical: "en-US" }], defaultLocale: "en" }],
      defaultLocale: "en",
      locales: ["en"],
    }).sites;
    expect(ww?.locales[0]?.canonical).toBe("en-US");
  });
});

describe("duplicate effective locale", () => {
  it("is a HARD error when two keys of one site resolve to the same canonical tag", () => {
    // `en` alone is now bare `en`, so a collision must be AUTHORED: an explicit mapping that lands on the
    // same tag as a qualified key. The refusal itself is unchanged.
    const collide = [{ code: "ca", locales: [{ path: "en", canonical: "en-CA" }, "en-ca"], defaultLocale: "en" }];
    expect(() => resolve(collide)).toThrowError(SiteConfigurationError);
    expect(() => resolve(collide)).toThrowError(/en-CA/);
  });

  it("accepts two EXPLICIT variants whose canonical tags differ (fr-CA and fr-FR)", () => {
    const [ca] = resolveSites({
      input: [{ code: "ca", locales: [{ path: "fr", canonical: "fr-CA" }, "fr-fr"], defaultLocale: "fr" }],
      defaultLocale: "en",
      locales: LOCALES,
    }).sites;
    expect(ca?.locales.map((locale) => locale.path)).toEqual(["fr", "fr-fr"]);
    expect(ca?.locales.map((locale) => locale.canonical)).toEqual(["fr-CA", "fr-FR"]);
  });

  it("normalises a configuration's uppercase spelling into the lowercase path key", () => {
    const [ca] = resolve([{ code: "ca", locales: ["FR"], defaultLocale: "fr" }]);
    expect(ca?.locales[0]?.path).toBe("fr");
    // …and the tag is the bare language, because the Site name supplies no region.
    expect(ca?.locales[0]?.canonical).toBe("fr");
  });
});
