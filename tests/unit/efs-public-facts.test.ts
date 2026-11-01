import { describe, expect, it } from "vitest";

import { resolveProperties, type PropertyOwner } from "@/core/efs/properties";
import { PUBLIC_FACT_KEYS, ownerAssetReference, resolvePublicFacts } from "@/core/efs/public-facts";

const entity = "e_00000000000000000000000000";

function effective(entityProperties: Record<string, unknown> = {}, representation?: Record<string, unknown>) {
  const chain: PropertyOwner[] = [
    { level: "entity", id: entity, properties: entityProperties as PropertyOwner["properties"] },
    { level: "facet", id: "f" },
    { level: "site", id: "s" },
    { level: "page", id: "p" },
    { level: "representation", id: "en", properties: representation as PropertyOwner["properties"] },
  ];
  return resolveProperties(chain);
}

const configured = {
  "brand.name": "Configured Brand",
  "contact.name": "Configured Contact",
  "contact.email": "config@example.com",
  "contact.phone": "+1 555 0100",
} as const;

describe("D40 Decision C — source precedence, keyed on the cascade", () => {
  it("lets an effective PUBLIC EFS property win over configured values", () => {
    const facts = resolvePublicFacts(
      effective({
        "brand.name": { value: "Capsule Brand", public: true },
        "contact.email": { value: "capsule@example.com", public: true },
      }),
      configured,
    );
    expect(facts.get("brand.name")).toMatchObject({ value: "Capsule Brand", state: "declared" });
    expect(facts.get("contact.email")).toMatchObject({
      value: "capsule@example.com",
      state: "declared",
    });
    // A fact with no declaration at any level still falls back.
    expect(facts.get("contact.phone")).toMatchObject({
      value: "+1 555 0100",
      state: "fallback",
    });
  });

  it("carries provenance for a declared fact", () => {
    const facts = resolvePublicFacts(
      effective({}, { "contact.phone": { value: "+44 20 7946 0000", public: true } }),
      configured,
    );
    expect(facts.get("contact.phone")).toMatchObject({
      value: "+44 20 7946 0000",
      state: "declared",
      originLevel: "representation",
      originId: "en",
    });
  });

  it("blocks BOTH output and fallback for a private declaration", () => {
    const facts = resolvePublicFacts(
      effective({ "contact.email": { value: "private@example.com" } }),
      configured,
    );
    // Privacy is not a gap to be filled: the configured address must NOT appear.
    expect(facts.get("contact.email")).toMatchObject({ value: undefined, state: "private" });
    expect(facts.get("contact.email").value).toBeUndefined();
  });

  it("blocks BOTH output and fallback for explicit null suppression", () => {
    const facts = resolvePublicFacts(effective({}, { "contact.phone": null }), configured);
    expect(facts.get("contact.phone")).toMatchObject({ value: undefined, state: "suppressed" });
  });

  it("invents nothing when there is neither a declaration nor a configured value", () => {
    const facts = resolvePublicFacts(effective(), {});
    for (const key of PUBLIC_FACT_KEYS) {
      expect(facts.get(key), key).toMatchObject({ value: undefined, state: "absent" });
    }
  });

  it("distinguishes 'absent' from 'private' and 'suppressed'", () => {
    const facts = resolvePublicFacts(
      effective({ "contact.name": { value: "Private" }, "contact.email": null }),
      configured,
    );
    expect(facts.get("contact.name").state).toBe("private");
    expect(facts.get("contact.email").state).toBe("suppressed");
    expect(facts.get("contact.phone").state).toBe("fallback");
    expect(facts.get("brand.name").state).toBe("fallback");
  });

  it("does not fall back past a public declaration that carries no usable value", () => {
    // A declaration occupies the precedence slot even when its value is not a string.
    const facts = resolvePublicFacts(
      effective({ "brand.name": { value: 42, public: true } }),
      configured,
    );
    expect(facts.get("brand.name")).toMatchObject({ value: undefined, state: "declared" });
  });

  it("never crosses an ownership or representation boundary", () => {
    const facts = resolvePublicFacts(
      effective({ "contact.email": { value: "entity@example.com", public: true } }),
      configured,
    );
    expect(facts.get("contact.email").originLevel).toBe("entity");
    // A suppressed descendant wins over the ancestor, and nothing leaks from a sibling.
    const suppressed = resolvePublicFacts(
      effective(
        { "contact.email": { value: "entity@example.com", public: true } },
        { "contact.email": null },
      ),
      configured,
    );
    expect(suppressed.get("contact.email").state).toBe("suppressed");
  });
});

/**
 * `D40` DECISION C (`R04-C31`) — THE LOGO'S PRECEDENCE AND ITS FORM
 * =================================================================
 *
 * `brand.logo` is artwork, so it needs two answers: WHETHER anything may be published (the cascade, proved
 * here exactly as for every other fact) and WHETHER the declared bytes are owner-bound artwork at all (the
 * form check). Neither answer may ever produce configured or foreign artwork, and a declaration owns the
 * precedence slot even when it publishes nothing.
 */
describe("D40 Decision C — the logo is a cascade fact with its own form", () => {
  const configuredWithLogo = { ...configured, "brand.logo": "https://www.example.com/assets/logo.svg" };

  it("publishes a declared public logo and refuses the configured artwork", () => {
    const facts = resolvePublicFacts(
      effective({ "brand.logo": { value: "/brand/logo.svg", public: true } }),
      configuredWithLogo,
    );
    expect(facts.get("brand.logo")).toMatchObject({
      value: "/brand/logo.svg",
      state: "declared",
      originLevel: "entity",
    });
  });

  it("refuses the configured logo when the declaration is private or suppressed", () => {
    const priv = resolvePublicFacts(
      effective({ "brand.logo": { value: "/brand/private.svg", public: false } }),
      configuredWithLogo,
    );
    expect(priv.get("brand.logo")).toMatchObject({ value: undefined, state: "private" });
    // A `null` child blocks a public ancestor: the block is inherited suppression, not absence.
    const suppressed = resolvePublicFacts(
      effective(
        { "brand.logo": { value: "/brand/logo.svg", public: true } },
        { "brand.logo": null },
      ),
      configuredWithLogo,
    );
    expect(suppressed.get("brand.logo")).toMatchObject({ value: undefined, state: "suppressed" });
  });

  it("falls back to the configured logo ONLY when no level declares one", () => {
    const facts = resolvePublicFacts(effective({}), configuredWithLogo);
    expect(facts.get("brand.logo")).toMatchObject({
      value: "https://www.example.com/assets/logo.svg",
      state: "fallback",
    });
    const none = resolvePublicFacts(effective({}));
    expect(none.get("brand.logo").state).toBe("absent");
  });

  it("takes the nearest declaration when a child overrides an ancestor", () => {
    const facts = resolvePublicFacts(
      effective(
        { "brand.logo": { value: "/brand/entity.svg", public: true } },
        { "brand.logo": { value: "/brand/page.svg", public: true } },
      ),
      configuredWithLogo,
    );
    expect(facts.get("brand.logo")).toMatchObject({ value: "/brand/page.svg", originLevel: "representation" });
  });
});

describe("D40 Decision C — ownerAssetReference is the ONE form check", () => {
  it("accepts an owner-bound relative reference, with or without a leading separator", () => {
    expect(ownerAssetReference("/brand/logo.svg")).toBe("brand/logo.svg");
    expect(ownerAssetReference("brand/logo.svg")).toBe("brand/logo.svg");
    expect(ownerAssetReference("/brand/nested/mark.svg")).toBe("brand/nested/mark.svg");
  });

  it("refuses anything that is not owner-bound artwork", () => {
    // Another origin, a protocol-relative address, a non-http scheme, a traversal, an encoded separator,
    // a foreign separator, an empty segment, and an empty value: each publishes nothing at all.
    expect(ownerAssetReference("https://www.example.com/assets/logo.svg")).toBeUndefined();
    expect(ownerAssetReference("//www.example.com/logo.svg")).toBeUndefined();
    expect(ownerAssetReference("javascript:alert(1)")).toBeUndefined();
    expect(ownerAssetReference("../../etc/passwd")).toBeUndefined();
    expect(ownerAssetReference("/brand/../logo.svg")).toBeUndefined();
    expect(ownerAssetReference("/brand%2Flogo.svg")).toBeUndefined();
    expect(ownerAssetReference("brand\\logo.svg")).toBeUndefined();
    expect(ownerAssetReference("/brand//logo.svg")).toBeUndefined();
    expect(ownerAssetReference("/")).toBeUndefined();
    expect(ownerAssetReference("")).toBeUndefined();
    expect(ownerAssetReference("   ")).toBeUndefined();
    expect(ownerAssetReference(undefined)).toBeUndefined();
  });
});
