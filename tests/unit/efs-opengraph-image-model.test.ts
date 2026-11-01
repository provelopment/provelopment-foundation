import { describe, expect, it } from "vitest";

import { openGraphImageForEfs } from "@/app/efs-opengraph-image-model";

/**
 * THE PURE EFS OPEN GRAPH MODEL (`GEO-03` R04-C21)
 * ===============================================
 *
 * The card's facts are decided here and nothing else is: which brand string may be drawn, which sentence
 * belongs to the site/locale ROOT, and where the image is published. No manifest, no file, no request.
 */
const facts = {
  brandName: "Provelopment Foundation",
  description: "Build a website you own.",
  title: "Home",
  canonicalRoot: "https://foundation-template.provelopment.com/en-001",
};

describe("the EFS Open Graph image model", () => {
  it("draws the public brand, the root's own sentence and the canonical identity", () => {
    const image = openGraphImageForEfs(facts);
    expect(image?.content.siteName).toBe("Provelopment Foundation");
    expect(image?.content.tagline).toBe("Build a website you own.");
    expect(image?.content.imageUrl).toBe("https://foundation-template.provelopment.com/en-001");
    expect(image?.canonicalRoot).toBe("https://foundation-template.provelopment.com/en-001");
  });

  it("publishes the image at exactly <root>/opengraph-image, never a Page path below it", () => {
    expect(openGraphImageForEfs(facts)?.url).toBe(
      "https://foundation-template.provelopment.com/en-001/opengraph-image",
    );
    // A localized root is the identity: the card is not per-Page and the URL says so.
    expect(openGraphImageForEfs({ ...facts, canonicalRoot: "https://example.com/acme-open/main/fr-fr" })?.url).toBe(
      "https://example.com/acme-open/main/fr-fr/opengraph-image",
    );
    // A trailing slash is normalised rather than doubled.
    expect(openGraphImageForEfs({ ...facts, canonicalRoot: "https://example.com/de-de/" })?.url).toBe(
      "https://example.com/de-de/opengraph-image",
    );
  });

  it("falls back from the description to the title, and to nothing — but never invents a sentence", () => {
    expect(openGraphImageForEfs({ ...facts, description: undefined })?.content.tagline).toBe("Home");
    expect(openGraphImageForEfs({ ...facts, description: "   ", title: "Home" })?.content.tagline).toBe("Home");
    expect(openGraphImageForEfs({ ...facts, description: undefined, title: undefined })?.content.tagline).toBe("");
  });

  it("REFUSES when no public brand survived D40-C — privacy is never filled in from configuration", () => {
    // `resolvePublicFacts` yields `undefined` for a private, suppressed or absent declaration; the model must
    // not substitute the Spoke's configured name, because that would relabel a business that chose privacy.
    expect(openGraphImageForEfs({ ...facts, brandName: undefined })).toBeNull();
    expect(openGraphImageForEfs({ ...facts, brandName: "   " })).toBeNull();
  });

  it("refuses a canonical root that is not an absolute https origin", () => {
    expect(openGraphImageForEfs({ ...facts, canonicalRoot: "/en-001" })).toBeNull();
    expect(openGraphImageForEfs({ ...facts, canonicalRoot: "http://example.com/en-001" })).toBeNull();
  });

  it("hands the view exactly the three presentation-neutral strings it draws", () => {
    const image = openGraphImageForEfs(facts);
    expect(Object.keys(image!.content).sort()).toEqual(["imageUrl", "siteName", "tagline"]);
  });
});
