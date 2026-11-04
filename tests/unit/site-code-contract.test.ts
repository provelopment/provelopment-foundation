import { describe, expect, it } from "vitest";

import * as siteCodeModule from "@/core/site-code";
import {
  WORLDWIDE_SITE_CODE,
  defaultSiteLabel,
  isCanonicalSiteCode,
  isSiteCode,
  isWorldwideSiteCode,
  siteCodeIssue,
} from "@/core/site-code";
import { reservedSiteIdIssue } from "@/core/site-identity";
import { SiteConfigurationError, resolveSites } from "@/core/site";
import { resolveSiteLocale } from "@/core/site-locale";

/**
 * THE SITE-CODE CONTRACT — `GEO-04` STAGE C-A RETIREMENT OF THE GEOGRAPHIC AUTHORITY
 * =================================================================================
 *
 * A configuration Site code is a DESCRIPTIVE key, not a country. This file used to assert a closed ISO
 * 3166-1 alpha-2 list — a second authority that already disagreed with `resolveSites`, where descriptive
 * keys had been accepted since `GEO-03` R04, and that made `pageResolutionCandidates` answer "no such
 * Site" for an authored Site named `main`.
 *
 * What is asserted now is what protects authoring: the grammar (one authority, `@/core/site-identity`),
 * the lowercase requirement, the refusals that matter, `ww` remaining a SEMANTIC reservation in its own
 * module, and the absence of any Site-derived language tag.
 */
const deploymentLocales = ["en", "fr"];

function resolve(input: readonly { code: string }[]) {
  return resolveSites({ input, defaultLocale: "en", locales: deploymentLocales });
}

describe("a Site code is a descriptive configuration key", () => {
  it("accepts arbitrary non-geographic keys (the Stage C requirement)", () => {
    for (const code of ["chickens", "corporate", "workshop", "main", "product-support"]) {
      expect(isSiteCode(code), code).toBe(true);
      expect(siteCodeIssue(code), code).toBeNull();
      expect(isCanonicalSiteCode(code), code).toBe(true);
      expect(() => resolve([{ code }]), code).not.toThrow();
    }
  });

  it("treats a country-shaped word as ONE such key, not as membership of a country list", () => {
    for (const code of ["ca", "fr", "ch", "br", "nz", "zz", "xx"]) {
      expect(isSiteCode(code), code).toBe(true);
      expect(siteCodeIssue(code), code).toBeNull();
      expect(() => resolve([{ code }]), code).not.toThrow();
    }
  });

  it("no longer exports a country-code reference set at all", () => {
    expect("COUNTRY_SITE_CODES" in siteCodeModule).toBe(false);
    expect("SITE_CODES" in siteCodeModule).toBe(false);
  });
});

describe("the reserved worldwide token", () => {
  it("keeps its historical LABEL, because a converted deployment's label must not change meaning", () => {
    expect(WORLDWIDE_SITE_CODE).toBe("ww");
    expect(isWorldwideSiteCode("ww")).toBe(true);
    expect(isWorldwideSiteCode("ca")).toBe(false);
    expect(defaultSiteLabel("ww")).toBe("Worldwide");
  });

  it("labels every other key AS AUTHORED — no country presentation is shouted", () => {
    expect(defaultSiteLabel("ca")).toBe("ca");
    expect(defaultSiteLabel("chickens")).toBe("chickens");
  });

  it("stays a RESERVED Site identity in its own module, while remaining a legal code shape", () => {
    // Two questions, deliberately two answers: the grammar admits `ww`...
    expect(siteCodeIssue("ww")).toBeNull();
    // ...and the reservation refuses it as a Site ID, because it names a retired identity.
    expect(reservedSiteIdIssue("ww")).toContain("reserved");
  });
});


describe("codes the grammar refuses", () => {
  it("refuses an uppercase spelling with an actionable lowercase instruction", () => {
    for (const code of ["CA", "Chickens", "FR"]) {
      const issue = siteCodeIssue(code);
      expect(issue, code).toContain("must be lowercase");
      expect(issue, code).toContain(`"${code.toLowerCase()}"`);
      expect(isCanonicalSiteCode(code), code).toBe(false);
    }
  });

  it("refuses a padded spelling rather than trimming it into a valid code", () => {
    expect(siteCodeIssue(" ca")).toContain("must be lowercase");
    expect(isCanonicalSiteCode(" ca")).toBe(false);
  });

  it("refuses path traversal, separators, punctuation, repeated hyphens and empty keys", () => {
    for (const code of ["..", ".", "../etc", "ca/../fr", "ca\\fr", "my_office", "ca ontario", "", "9lives", "ca-", "-ca", "ca--fr"]) {
      expect(siteCodeIssue(code), code).not.toBeNull();
      expect(isSiteCode(code), code).toBe(false);
    }
  });
});

describe("resolveSites refuses an incoherent site set", () => {
  it("refuses a duplicate site", () => {
    expect(() => resolve([{ code: "ca" }, { code: "ca" }])).toThrowError(SiteConfigurationError);
    expect(() => resolve([{ code: "ca" }, { code: "ca" }])).toThrowError(/duplicate site "ca"/);
    expect(() => resolve([{ code: "chickens" }, { code: "chickens" }])).toThrowError(/duplicate site "chickens"/);
  });

  it("refuses an ill-formed code with the runtime message, not a generic schema error", () => {
    expect(() => resolve([{ code: "CA" }])).toThrowError(/site id "CA"/);
    expect(() => resolve([{ code: "my_office" }])).toThrowError(/site id "my_office"/);
  });
});

describe("no language tag is inferred from a Site code", () => {
  it("resolves a SIMPLE key to the bare language, whatever the Site is called", () => {
    expect(resolveSiteLocale("ca", "en").canonical).toBe("en");
    expect(resolveSiteLocale("corporate", "fr").canonical).toBe("fr");
    expect(resolveSiteLocale("ww", "en").canonical).toBe("en");
    expect(resolveSiteLocale("chickens", "en").canonical).toBe("en");
  });

  it("keeps an explicitly authored canonical tag authoritative", () => {
    expect(resolveSiteLocale("ca", { path: "en", canonical: "en-CA" }).canonical).toBe("en-CA");
    expect(resolveSiteLocale("ww", { path: "en", canonical: "en-US" }).canonical).toBe("en-US");
    // The URL/file key stays lowercase even when the tag is authored with casing.
    expect(resolveSiteLocale("ca", { path: "en", canonical: "en-CA" }).path).toBe("en");
  });

  it("keeps a qualified path key's own canonical casing", () => {
    expect(resolveSiteLocale("ca", "en-ca").canonical).toBe("en-CA");
    expect(resolveSiteLocale("chickens", "fr-ca").canonical).toBe("fr-CA");
    expect(resolveSiteLocale("ca", "zh-hant-tw").canonical).toBe("zh-Hant-TW");
  });

  it("gives two differently named Sites the same canonical for the same authored locale", () => {
    expect(resolveSiteLocale("ca", "en").canonical).toBe(resolveSiteLocale("corporate", "en").canonical);
  });
});
