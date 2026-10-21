import { describe, expect, it } from "vitest";

import {
  ENTITY_ID_PATTERN,
  entityIdIssue,
  isEntityId,
  mintEntityIdForTest,
} from "@/core/efs/identity";
import { resolveProperties, type PropertyOwner } from "@/core/efs/properties";

const entity: PropertyOwner = {
  level: "entity",
  id: "e_00000000000000000000000000",
  properties: {
    "brand.logo": { value: "/brand/corporate.svg", public: true },
    "brand.images": { value: ["corporate-a", "corporate-b"], public: true },
    "contact.address": { value: "1 Corporate Way", public: true },
    "contact.phone": { value: "+1 555 0100" },
  },
};

const facet: PropertyOwner = {
  level: "facet",
  id: "hotels",
  properties: {
    openingHours: { value: ["Mon-Fri 09:00-17:00"], public: true },
  },
};

const site: PropertyOwner = {
  level: "site",
  id: "jakarta",
  properties: {
    "brand.logo": { value: "/brand/jakarta.svg", public: true },
    "brand.images": { value: ["jakarta"], public: true },
  },
};

const page: PropertyOwner = {
  level: "page",
  id: "home",
  properties: {
    "contact.address": null,
    "brand.images": { value: ["page-only"], public: true },
  },
};

const representation: PropertyOwner = {
  level: "representation",
  id: "fr-ca",
  properties: {
    "contact.phone": { value: "+1 555 0199" },
  },
};

describe("EFS EntityID contract (D31 / R-10)", () => {
  it("mints e_ plus 26 Crockford characters with a 0-7 first payload character", () => {
    const id = mintEntityIdForTest(42);
    expect(id).toMatch(ENTITY_ID_PATTERN);
    expect(id.startsWith("e_")).toBe(true);
    expect(id.slice(2)).toHaveLength(26);
    expect(isEntityId(id)).toBe(true);
  });

  it("refuses the retired b_ prefix, uppercase and malformed length", () => {
    expect(entityIdIssue("b_00000000000000000000000000")).toContain("e_");
    expect(entityIdIssue("e_0000000000000000000000000O")).not.toBeNull();
    expect(entityIdIssue("e_0000000000000000000000000")).not.toBeNull();
    expect(isEntityId("e_00000000000000000000000000")).toBe(true);
  });
});

describe("EFS cascade (D31 / O-3)", () => {
  const effective = resolveProperties([entity, facet, site, page, representation]);

  it("resolves the nearest explicit atomic key and inherits absent keys", () => {
    expect(effective.get("brand.logo")?.value).toBe("/brand/jakarta.svg");
    expect(effective.get("openingHours")?.value).toEqual(["Mon-Fri 09:00-17:00"]);
    expect(effective.get("openingHours")?.state).toBe("inherited");
    expect(effective.get("openingHours")?.originLevel).toBe("facet");
  });

  it("suppresses with explicit null and reports provenance", () => {
    const address = effective.get("contact.address");
    expect(address?.state).toBe("suppressed");
    expect(address?.value).toBeUndefined();
    expect(address?.originLevel).toBe("page");
    expect(effective.toRecord()).not.toHaveProperty("contact.address");
  });

  it("replaces composite values atomically rather than merging", () => {
    expect(effective.get("brand.images")?.value).toEqual(["page-only"]);
  });

  it("allows a representation-local override without changing the Page", () => {
    expect(effective.get("contact.phone")?.value).toBe("+1 555 0199");
    expect(effective.get("contact.phone")?.state).toBe("declared");
    expect(effective.get("contact.phone")?.originLevel).toBe("representation");
  });

  it("keeps private inherited data out of public projection", () => {
    const publicKeys = effective.publicEntries().map((entry) => entry.key);
    expect(publicKeys).toContain("brand.logo");
    expect(publicKeys).toContain("openingHours");
    expect(publicKeys).not.toContain("contact.phone");
  });

  it("never mutates ancestor declarations", () => {
    const before = JSON.stringify([entity, facet, site, page, representation]);
    resolveProperties([entity, facet, site, page, representation]);
    expect(JSON.stringify([entity, facet, site, page, representation])).toBe(before);
  });

  it("refuses invalid values rather than treating them as suppression", () => {
    expect(() =>
      resolveProperties([{ ...entity, properties: { "contact.phone": { value: "" } } }]),
    ).toThrow(/must not be empty/);
  });

  it("refuses a non-contiguous ownership chain", () => {
    expect(() => resolveProperties([entity, site])).toThrow(/must be "facet"/);
  });
});
