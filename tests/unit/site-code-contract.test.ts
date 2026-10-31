import { describe, expect, it } from "vitest";

import {
  COUNTRY_SITE_CODES,
  SITE_CODES,
  WORLDWIDE_SITE_CODE,
  defaultSiteLabel,
  isCanonicalSiteCode,
  isSiteCode,
  isWorldwideSiteCode,
  siteCodeIssue,
} from "@/core/site-code";
import { SiteConfigurationError, resolveSites } from "@/core/site";

/**
 * THE SITE-CODE CONTRACT (FOUNDATION-S1/S1E3A)
 * ===========================================
 *
 * A site code is simultaneously the content folder name and the first URL segment, so the set of
 * accepted codes is a CLOSED, machine-checked set with ONE runtime authority
 * (`@/core/site-code`). These assertions exercise the authority itself — they never restate the
 * list — so a typo, an invented name, an uppercase spelling or a duplicate site fails loudly
 * instead of quietly publishing a site nobody can reach.
 */
const deploymentLocales = ["en", "fr"];

function resolve(input: readonly { code: string }[]) {
  return resolveSites({ input, defaultLocale: "en", locales: deploymentLocales });
}

describe("the recognized country-code set is the runtime authority", () => {
  it("accepts EVERY recognized country code in the maintained list", () => {
    expect(COUNTRY_SITE_CODES.length).toBeGreaterThan(200);
    for (const code of COUNTRY_SITE_CODES) {
      expect(siteCodeIssue(code), code).toBeNull();
      expect(isCanonicalSiteCode(code), code).toBe(true);
    }
  });

  it("accepts the representative country codes the docs teach (ca, fr, ch, br, nz)", () => {
    for (const code of ["ca", "fr", "ch", "br", "nz"]) {
      expect(isSiteCode(code), code).toBe(true);
      expect(siteCodeIssue(code), code).toBeNull();
    }
  });

  it("keeps the reserved Worldwide code OUT of the country list", () => {
    expect(WORLDWIDE_SITE_CODE).toBe("ww");
    expect(COUNTRY_SITE_CODES).not.toContain(WORLDWIDE_SITE_CODE);
    expect(SITE_CODES).toContain(WORLDWIDE_SITE_CODE);
  });
});

describe("the reserved Worldwide site", () => {
  it("is accepted, and is labelled as Worldwide rather than as a country", () => {
    expect(siteCodeIssue(WORLDWIDE_SITE_CODE)).toBeNull();
    expect(isWorldwideSiteCode("ww")).toBe(true);
    expect(isWorldwideSiteCode("ca")).toBe(false);
    expect(defaultSiteLabel("ww")).toBe("Worldwide");
    expect(defaultSiteLabel("ca")).toBe("CA");
  });

  it("resolves as an ordinary site in a site set", () => {
    const { sites } = resolve([{ code: "ww" }, { code: "ca" }]);
    expect(sites.map((site) => site.code)).toEqual(["ww", "ca"]);
  });
});

describe("codes the contract refuses", () => {
  it("refuses an unknown two-letter code", () => {
    for (const code of ["zz", "xx", "q1"]) {
      const issue = siteCodeIssue(code);
      expect(issue, code).not.toBeNull();
      expect(issue, code).toContain("recognized two-letter country code");
    }
  });

  it("refuses arbitrary prose ids (no `main`, no country names, no invented regions)", () => {
    for (const code of ["main", "canada", "global", "europe", "my-office", "ca-ontario", "ww2"]) {
      expect(siteCodeIssue(code), code).not.toBeNull();
    }
  });

  it("refuses an uppercase spelling with an actionable lowercase instruction", () => {
    for (const code of ["CA", "Ca", "FR"]) {
      const issue = siteCodeIssue(code);
      expect(issue, code).toContain("must be lowercase");
      expect(issue, code).toContain(`"${code.toLowerCase()}"`);
      // The code is not silently normalised: the message is the only outcome.
      expect(isCanonicalSiteCode(code), code).toBe(false);
    }
  });

  it("refuses a padded spelling rather than trimming it into a valid code", () => {
    expect(siteCodeIssue(" ca")).toContain("must be lowercase");
    expect(isCanonicalSiteCode(" ca")).toBe(false);
  });
});

describe("resolveSites refuses an incoherent site set", () => {
  it("refuses a duplicate site", () => {
    expect(() => resolve([{ code: "ca" }, { code: "ca" }])).toThrowError(SiteConfigurationError);
    expect(() => resolve([{ code: "ca" }, { code: "ca" }])).toThrowError(/duplicate site "ca"/);
  });

  it("refuses an invalid code with the runtime message, not a generic schema error", () => {
    // `GEO-03` R04 — A SITE CODE IS A PRESENTATION IDENTITY. Any well-formed descriptive key is an
    // authored choice, and a country-shaped word is simply one of those keys; the closed country list
    // no longer governs authoring. What still governs is the grammar itself.
    expect(() => resolve([{ code: "canada" }])).not.toThrow();
    expect(() => resolve([{ code: "main" }])).not.toThrow();
    expect(() => resolve([{ code: "CA" }])).toThrowError(/site id "CA"/);
    expect(() => resolve([{ code: "my_office" }])).toThrowError(/site id "my_office"/);
  });
});
