import { describe, expect, it } from "vitest";

import { isContentSlug } from "@/core/page-content";
import {
  RESERVED_SITE_ID_GROUPS,
  RESERVED_SITE_IDS,
  SITE_ID_MAX_LENGTH,
  SITE_ID_MIN_LENGTH,
  isReservedSiteId,
  isSiteId,
  normalizeSiteId,
  reservedSiteIdIssue,
  siteIdIssue,
} from "@/core/site-identity";

/**
 * THE SITE-ID AND RESERVED-IDENTIFIER CONTRACT (FOUNDATION-ID-M1)
 * ==============================================================
 *
 * These assertions exercise the authorities themselves. Two rules are proved separately, because they
 * must stay separate: the GRAMMAR (`siteIdIssue`) and the RESERVATION (`reservedSiteIdIssue`). A
 * reserved word is normally a well-formed Site ID, so a test suite that conflated the two would be
 * unable to show which rule refused what.
 *
 * The Business-scoped composite identity this suite once covered is RETIRED (`GEO-04` C02): the
 * authorities a Site is still authored under are the two above, and
 * `tests/architecture/reserved-site-identifiers.test.ts` guards that the composite is gone.
 */

/** The approved descriptive examples, plus the two- and forty-character boundaries. */
const ACCEPTED_SITE_IDS: readonly string[] = [
  "hr",
  "it",
  "web",
  "app",
  "art",
  "home-office",
  "workshop",
  "main-website",
  "product-support",
  "a".repeat(SITE_ID_MAX_LENGTH),
];

describe("descriptive Site IDs the grammar accepts", () => {
  it("accepts the approved descriptive examples and the boundaries", () => {
    for (const siteId of ACCEPTED_SITE_IDS) {
      expect(siteIdIssue(siteId), siteId).toBeNull();
      expect(isSiteId(siteId), siteId).toBe(true);
    }
  });

  it("keeps locale-like but legitimate words: `web`, `app` and `art` are Site IDs", () => {
    for (const siteId of ["web", "app", "art"]) {
      // The point of the contract: a word is a locale only when a Site DECLARES it as one, so the
      // grammar must not refuse ordinary business words merely because a locale key could match.
      expect(siteIdIssue(siteId), siteId).toBeNull();
      expect(isReservedSiteId(siteId), siteId).toBe(false);
      expect(reservedSiteIdIssue(siteId), siteId).toBeNull();
    }
  });

  it("stays inside the content-slug family, so a Site ID is always a usable slug too", () => {
    for (const siteId of ACCEPTED_SITE_IDS) {
      expect(isContentSlug(siteId), siteId).toBe(true);
    }
    // …and the refinement is real: a leading digit is a slug but NOT a Site ID.
    expect(isContentSlug("2nd-office")).toBe(true);
    expect(isSiteId("2nd-office")).toBe(false);
  });

  it("accepts digits after the first character", () => {
    for (const siteId of ["unit12", "office-2", "warehouse-4b", "a1"]) {
      expect(siteIdIssue(siteId), siteId).toBeNull();
    }
  });
});
describe("the length boundaries", () => {
  it("accepts the shortest and the longest, and refuses either side of them", () => {
    expect(SITE_ID_MIN_LENGTH).toBe(2);
    expect(SITE_ID_MAX_LENGTH).toBe(40);

    expect(siteIdIssue("hr")).toBeNull();
    expect(siteIdIssue("a".repeat(SITE_ID_MAX_LENGTH))).toBeNull();
    // A forty-character id that uses hyphens too, so the cap is about the whole value.
    expect(siteIdIssue(`${"ab".repeat(19)}-c`)).toBeNull();

    for (const value of ["", "a", "."]) {
      expect(siteIdIssue(value), JSON.stringify(value)).toContain("too short");
      expect(isSiteId(value), JSON.stringify(value)).toBe(false);
    }

    for (const value of ["a".repeat(SITE_ID_MAX_LENGTH + 1), "a-".repeat(21)]) {
      expect(siteIdIssue(value), value).toContain(`at most ${SITE_ID_MAX_LENGTH}`);
      expect(isSiteId(value), value).toBe(false);
    }
  });
});

describe("spellings the grammar refuses", () => {
  it("refuses traversal sequences, separators, dots and encoded forms", () => {
    for (const value of [
      "..",
      "...",
      "a/b",
      "a/b/c",
      "a\\b",
      "a.b",
      "a.b.c",
      "a%2e",
      "%2e%2e",
      "..%2f",
      "a%2fb",
    ]) {
      const issue = siteIdIssue(value);
      expect(issue, value).toContain("path separator, a dot or a percent-encoded form");
      expect(isSiteId(value), value).toBe(false);
    }
  });

  it("refuses a leading, trailing or doubled hyphen", () => {
    for (const value of ["-a", "a-", "--", "a--b", "-home-office", "home-office-", "a---b"]) {
      expect(siteIdIssue(value), value).toContain("illegal hyphen");
      expect(isSiteId(value), value).toBe(false);
    }
  });

  it("refuses a leading digit, because a Site ID names a website", () => {
    for (const value of ["2nd-office", "419", "0a", "9lives"]) {
      expect(siteIdIssue(value), value).toContain("must begin with a lowercase letter");
      expect(isSiteId(value), value).toBe(false);
    }
  });

  it("refuses an upper-case spelling, naming the lower-case one", () => {
    for (const value of ["Web", "WEB", "Home-Office", "homeOffice"]) {
      const issue = siteIdIssue(value);
      expect(issue, value).toContain("must be lowercase");
      expect(issue, value).toContain(value.toLowerCase());
      expect(isSiteId(value), value).toBe(false);
    }
  });

  it("refuses underscores, spaces, symbols and non-ASCII letters", () => {
    for (const value of ["home_office", "home office", "home~office", "home@office", "høme", "home,office"]) {
      expect(siteIdIssue(value), value).toContain("must be lowercase letters and digits");
      expect(isSiteId(value), value).toBe(false);
    }
  });

  it("refuses a value that is not a string at all", () => {
    for (const value of [42, null, undefined, {}, [], true]) {
      expect(siteIdIssue(value), String(value)).toContain("must be a string");
      expect(isSiteId(value), String(value)).toBe(false);
    }
  });
});
describe("the reserved Site-ID vocabulary", () => {
  /** The APPROVED vocabulary, stated once here as the thing being reserved. */
  const APPROVED: Readonly<Record<string, readonly string[]>> = {
    platform: ["api", "assets", "system", "internal", "spokes"],
    administration: ["admin", "auth", "account"],
    routing: ["default", "preview", "dashboard", "settings", "status"],
    // The RETIRED group: `ww` was the worldwide Site identity, retired by D28. It stays a grammatical
    // Site ID and becomes an unauthorable one (`C08` row 5).
    retired: ["ww"],
  };

  it("declares exactly the approved groups, and no others", () => {
    expect(Object.keys(RESERVED_SITE_ID_GROUPS)).toEqual(Object.keys(APPROVED));
    for (const [group, words] of Object.entries(APPROVED)) {
      expect(RESERVED_SITE_ID_GROUPS[group as keyof typeof RESERVED_SITE_ID_GROUPS], group).toEqual([
        ...words,
      ]);
    }
  });

  it("DERIVES the complete collection from the groups, with no duplicates", () => {
    const derived = [
      ...RESERVED_SITE_ID_GROUPS.platform,
      ...RESERVED_SITE_ID_GROUPS.administration,
      ...RESERVED_SITE_ID_GROUPS.routing,
      ...RESERVED_SITE_ID_GROUPS.retired,
    ];

    expect(RESERVED_SITE_IDS).toEqual(derived);
    expect(RESERVED_SITE_IDS).toHaveLength(14);
    expect(new Set(RESERVED_SITE_IDS).size).toBe(14);
    for (const word of Object.values(APPROVED).flat()) {
      expect(RESERVED_SITE_IDS, word).toContain(word);
    }
  });

  it("keeps every reserved word SYNTACTICALLY valid, and refuses it semantically", () => {
    for (const [group, words] of Object.entries(APPROVED)) {
      for (const word of words) {
        // 1. The grammar accepts it — a reserved word is normally a perfectly good Site ID.
        expect(siteIdIssue(word), word).toBeNull();
        expect(isSiteId(word), word).toBe(true);

        // 2. The reservation is the ONLY rule that refuses it, and it names the group.
        expect(isReservedSiteId(word), word).toBe(true);
        const issue = reservedSiteIdIssue(word);
        expect(issue, word).not.toBeNull();
        expect(issue, word).toContain(`(${group})`);
        expect(issue, word).toContain("reserved identifier");
      }
    }
  });

  it("refuses `api` although it matches the grammar — the brief's own example", () => {
    expect(isSiteId("api")).toBe(true);
    expect(siteIdIssue("api")).toBeNull();
    expect(reservedSiteIdIssue("api")).toContain("platform");
  });

  it("keeps `health` UNRESERVED — it is an unapproved candidate", () => {
    expect(isReservedSiteId("health")).toBe(false);
    expect(reservedSiteIdIssue("health")).toBeNull();
    expect(siteIdIssue("health")).toBeNull();
    expect(RESERVED_SITE_IDS).not.toContain("health");
  });

  it("answers the reservation for the WORD, and the grammar for the SPELLING", () => {
    // Two separate facts about one authored value, each with its own authority.
    expect(isReservedSiteId(" API ")).toBe(true);
    expect(isSiteId(" API ")).toBe(false);
    expect(siteIdIssue(" API ")).not.toBeNull();
    expect(reservedSiteIdIssue(" API ")).not.toBeNull();
  });

  it("does not reserve ordinary words that merely resemble a locale key", () => {
    for (const word of ["web", "app", "art", "hr", "it", "shop", "spa", "gym"]) {
      expect(isReservedSiteId(word), word).toBe(false);
      expect(siteIdIssue(word), word).toBeNull();
    }
  });
});

describe("the retired composite identity is gone (GEO-04 C02-R02)", () => {
  it("exports NONE of the composite interface, separator, validator or key", async () => {
    // Read the real module object, so the guard cannot pass by finding nothing in a comment: the four
    // retired exports must be absent at runtime, and every surviving authority must still be present.
    const authority = (await import("@/core/site-identity")) as Record<string, unknown>;

    for (const retired of ["SiteIdentity", "SITE_IDENTITY_SEPARATOR", "siteIdentityIssue", "siteIdentityKey"]) {
      expect(authority[retired], retired).toBeUndefined();
    }

    for (const surviving of [
      "SITE_ID_MIN_LENGTH",
      "SITE_ID_MAX_LENGTH",
      "SITE_ID_PATTERN",
      "normalizeSiteId",
      "isSiteId",
      "siteIdIssue",
      "RESERVED_SITE_ID_GROUPS",
      "RESERVED_SITE_IDS",
      "isReservedSiteId",
      "reservedSiteIdIssue",
    ]) {
      expect(authority[surviving], surviving).toBeDefined();
    }
  });

  it("keeps the Page-route, locale-looking and neutral words OUT of the reserved vocabulary", () => {
    for (const word of ["home", "connect", "contact", "opengraph-image", "hr", "it", "de", "web", "main"]) {
      expect(isReservedSiteId(word), word).toBe(false);
      expect(reservedSiteIdIssue(word), word).toBeNull();
      expect(siteIdIssue(word), word).toBeNull();
    }
  });
});
describe("matching-only normalisation of a Site ID", () => {
  it("answers the matching form without ever accepting the authored one", () => {
    expect(isSiteId(" Web ")).toBe(false);
    expect(siteIdIssue(" Web ")).not.toBeNull();

    expect(normalizeSiteId(" Web ")).toBe("web");
    expect(isSiteId(normalizeSiteId(" Web "))).toBe(true);
  });

  it("answers an empty string for a value that is not a string", () => {
    for (const value of [42, null, undefined, {}, []]) {
      expect(normalizeSiteId(value), String(value)).toBe("");
    }
  });
});