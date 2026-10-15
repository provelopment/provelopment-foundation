import { describe, expect, it } from "vitest";

import { isContentSlug } from "@/core/page-content";
import { businessIdIssue } from "@/core/business-identity";
import {
  RESERVED_SITE_ID_GROUPS,
  RESERVED_SITE_IDS,
  SITE_IDENTITY_SEPARATOR,
  SITE_ID_MAX_LENGTH,
  SITE_ID_MIN_LENGTH,
  isReservedSiteId,
  isSiteId,
  normalizeSiteId,
  reservedSiteIdIssue,
  siteIdIssue,
  siteIdentityIssue,
  siteIdentityKey,
  type SiteIdentity,
} from "@/core/site-identity";

/**
 * THE SITE-ID, RESERVED-IDENTIFIER AND COMPOSITE-IDENTITY CONTRACT (FOUNDATION-ID-M1)
 * =================================================================================
 *
 * These assertions exercise the authorities themselves. Three rules are proved separately, because
 * they must stay separate: the GRAMMAR (`siteIdIssue`), the RESERVATION (`reservedSiteIdIssue`) and
 * the COMPOSITE that applies both (`siteIdentityIssue`). A reserved word is normally a well-formed
 * Site ID, so a test suite that conflated the two would be unable to show which rule refused what.
 */

/** A real canonical Business ID (its validity is asserted below, not assumed). */
const BUSINESS_A = "b_01j9z6q0q7k3m9v2n4p8r5t1wx";

/** A second Business, so two composites can share one descriptive Site ID. */
const BUSINESS_B = "b_01k2m4x8v6t0r3q7p5n9j1h4fd";

/** One composite, spelled where it is read. */
function identityOf(businessId: string, siteId: string): SiteIdentity {
  return { businessId, siteId };
}

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

describe("the two Businesses used by these tests are canonical", () => {
  it("carries valid Business IDs, so a composite failure is never the Business's fault", () => {
    for (const businessId of [BUSINESS_A, BUSINESS_B]) {
      expect(businessIdIssue(businessId), businessId).toBeNull();
    }
    expect(BUSINESS_A).not.toBe(BUSINESS_B);
  });
});

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
    ];

    expect(RESERVED_SITE_IDS).toEqual(derived);
    expect(RESERVED_SITE_IDS).toHaveLength(13);
    expect(new Set(RESERVED_SITE_IDS).size).toBe(13);
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
describe("the composite Site identity", () => {
  /** Four composites, including two Businesses that both own a `home-office`. */
  const MATRIX: readonly SiteIdentity[] = [
    identityOf(BUSINESS_A, "home-office"),
    identityOf(BUSINESS_B, "home-office"),
    identityOf(BUSINESS_A, "workshop"),
    identityOf(BUSINESS_B, "showroom"),
  ];

  it("keeps two Businesses' `home-office` apart — they are two Sites", () => {
    const first = identityOf(BUSINESS_A, "home-office");
    const second = identityOf(BUSINESS_B, "home-office");

    expect(siteIdentityIssue(first)).toBeNull();
    expect(siteIdentityIssue(second)).toBeNull();
    expect(siteIdentityKey(first)).not.toBe(siteIdentityKey(second));
    expect(siteIdentityKey(first)).toBe(`${BUSINESS_A}${SITE_IDENTITY_SEPARATOR}home-office`);
    expect(siteIdentityKey(second)).toBe(`${BUSINESS_B}${SITE_IDENTITY_SEPARATOR}home-office`);
  });

  it("gives every distinct composite a distinct key, and is deterministic", () => {
    const keys = MATRIX.map((identity) => siteIdentityKey(identity));
    expect(new Set(keys).size).toBe(MATRIX.length);

    for (const identity of MATRIX) {
      expect(siteIdentityIssue(identity), siteIdentityKey(identity)).toBeNull();
      expect(siteIdentityKey(identity)).toBe(siteIdentityKey({ ...identity }));
    }
  });

  it("uses a separator NEITHER component can contain, which is what makes the key unambiguous", () => {
    expect(SITE_IDENTITY_SEPARATOR).toBe("/");

    for (const component of [BUSINESS_A, "home-office"]) {
      expect(component, component).not.toContain(SITE_IDENTITY_SEPARATOR);
    }

    // …and each authority enforces that: a value carrying the separator can never be a component,
    // so the first separator is always the only one.
    expect(businessIdIssue(`${BUSINESS_A}${SITE_IDENTITY_SEPARATOR}extra`)).not.toBeNull();
    expect(siteIdIssue(`home${SITE_IDENTITY_SEPARATOR}office`)).not.toBeNull();
    expect(
      siteIdentityIssue(identityOf(BUSINESS_A, `home${SITE_IDENTITY_SEPARATOR}office`)),
    ).not.toBeNull();
  });

  it("needs no Spoke, Spoke Hub, Site Hub, hostname or locale to establish identity", () => {
    const minimal = identityOf(BUSINESS_A, "home-office");
    expect(siteIdentityIssue(minimal)).toBeNull();

    // The SAME identity carrying hosting facts is the same identity with the same key: those
    // properties are ignored — never required, and never part of what a Site IS.
    const hosted = {
      ...minimal,
      spokeHubId: "spoke-hub-2",
      spokeId: "spoke-a",
      siteHubId: "site-hub-1",
      hostname: "beta.example.test",
      localePath: "en-001",
    };

    expect(siteIdentityIssue(hosted)).toBeNull();
    expect(siteIdentityKey(hosted)).toBe(siteIdentityKey(minimal));
    expect(siteIdentityKey(hosted)).toBe(`${BUSINESS_A}${SITE_IDENTITY_SEPARATOR}home-office`);
  });
});
describe("composites the contract refuses", () => {
  it("refuses a missing, empty or non-canonical Business ID", () => {
    for (const businessId of ["", "nope", `B_${"0".repeat(26)}`, BUSINESS_A.toUpperCase()]) {
      const issue = siteIdentityIssue({ businessId, siteId: "home-office" });
      expect(issue, JSON.stringify(businessId)).not.toBeNull();
      expect(issue, JSON.stringify(businessId)).toContain("businessId:");
    }

    for (const incomplete of [
      { siteId: "home-office" },
      { businessId: undefined, siteId: "home-office" },
      { businessId: null, siteId: "home-office" },
      { businessId: 42, siteId: "home-office" },
    ]) {
      expect(siteIdentityIssue(incomplete), JSON.stringify(incomplete)).not.toBeNull();
    }
  });

  it("refuses an invalid or missing Site ID", () => {
    for (const siteId of ["", "Home-Office", "home/office", "-home", "a", "2nd-office"]) {
      const issue = siteIdentityIssue({ businessId: BUSINESS_A, siteId });
      expect(issue, JSON.stringify(siteId)).not.toBeNull();
      expect(issue, JSON.stringify(siteId)).toContain("siteId:");
    }

    expect(siteIdentityIssue({ businessId: BUSINESS_A })).not.toBeNull();
    expect(siteIdentityIssue({ businessId: BUSINESS_A, siteId: undefined })).not.toBeNull();
  });

  it("refuses a RESERVED Site ID, so it can never form an authorable composite", () => {
    for (const siteId of RESERVED_SITE_IDS) {
      const identity = { businessId: BUSINESS_A, siteId };

      // Well-formed syntactically …
      expect(siteIdIssue(siteId), siteId).toBeNull();
      // … and refused as an identity, naming the reservation rather than the grammar.
      const issue = siteIdentityIssue(identity);
      expect(issue, siteId).not.toBeNull();
      expect(issue, siteId).toContain("reserved identifier");
      expect(isReservedSiteId(siteId), siteId).toBe(true);

      // A key is never produced for an identity the contract refuses.
      expect(() => siteIdentityKey(identity), siteId).toThrowError(/FOUNDATION-ID-M1/);
    }
  });

  it("refuses a composite that is not an object with the two leaves", () => {
    for (const value of [null, undefined, `${BUSINESS_A}/home-office`, 42, [], true]) {
      expect(siteIdentityIssue(value), String(value)).toContain("must be an object");
    }
  });

  it("refuses to build a key from an invalid identity", () => {
    expect(() => siteIdentityKey({ businessId: BUSINESS_A, siteId: "api" })).toThrowError(
      /reserved identifier/,
    );
    expect(() => siteIdentityKey({ businessId: "", siteId: "home-office" })).toThrowError(
      /FOUNDATION-ID-M1/,
    );
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