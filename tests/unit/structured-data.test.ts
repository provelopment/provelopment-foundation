import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RegionStructuredData } from "@/components/site/region-structured-data";
import { OfferingStructuredData } from "@/components/site/offering-structured-data";
import { StructuredData } from "@/components/site/structured-data";
import { siteConfig } from "@/config";
import { resolveRegion } from "@/core/region";
import type { OfferingsContent } from "@/core/offerings";

/** Extracts the first JSON-LD payload from a rendered `<script>` block. */
function jsonLd(html: string): Record<string, unknown> {
  const match = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error("no JSON-LD script found");
  return JSON.parse(match[1]) as Record<string, unknown>;
}

function offering(overrides: Partial<OfferingsContent> = {}): OfferingsContent {
  return {
    slug: "starter-package",
    locale: "en",
    title: "Starter package",
    blurb: "A practical package of essentials.",
    body: "Body.\n",
    price: "$150",
    ...overrides,
  };
}

describe("StructuredData — global organization/local-business JSON-LD (Phase S)", () => {
  it("emits the canonical identity, url and contactPoint", () => {
    const html = renderToStaticMarkup(StructuredData({ locale: "en" }));
    const node = jsonLd(html);

    expect(node["@type"]).toBe(siteConfig.business.type ?? "Organization");
    expect(node.name).toBe(siteConfig.name);
    expect(node.url).toBe(siteConfig.url);
    expect(node.contactPoint).toMatchObject({ "@type": "ContactPoint" });
  });

  it("location @ids and sameAs track the configured inventory (both branches)", () => {
    const node = jsonLd(renderToStaticMarkup(StructuredData({ locale: "en" })));

    // Present branch: every configured location gets a stable fragment @id.
    if (siteConfig.business.locations.length > 0) {
      const locations = node.location as { "@id"?: string }[];
      expect(Array.isArray(locations)).toBe(true);
      for (const location of locations) {
        expect(location["@id"]).toMatch(/^https:\/\/example\.com\/#location-/);
      }
    } else {
      // Absent branch: no locations → no `location` node invented.
      expect(node.location).toBeUndefined();
    }

    // Present branch: sameAs maps the configured social links (never invented).
    if (siteConfig.socialLinks.length > 0) {
      expect(node.sameAs).toEqual(siteConfig.socialLinks.map((link) => link.href));
    } else {
      expect(node.sameAs).toBeUndefined();
    }
  });

  it("emits the canonical asset logo (FS-4: configured via site.assets.logo)", () => {
    const node = jsonLd(renderToStaticMarkup(StructuredData({ locale: "en" })));
    // The canonical reference config defines `site.assets.logo`, so the
    // structured-data JSON-LD logo is present and points at the canonical asset.
    if (siteConfig.assets?.logo || siteConfig.logo) {
      const logo = node.logo as { "@type"?: string; url?: string };
      expect(logo).toMatchObject({ "@type": "ImageObject" });
      expect(logo.url).toBe(siteConfig.assets?.logo ?? siteConfig.logo);
    } else {
      // Absent branch: no logo configured → JSON-LD omits it (never invented).
      expect(node.logo).toBeUndefined();
    }
  });

  it("wires logo (assets-aware), sameAs and contactPoint to configured values (source contract)", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src", "components", "site", "structured-data.tsx"),
      "utf8",
    );
    expect(source).toContain("siteConfig.assets?.logo ?? siteConfig.logo");
    expect(source).toContain("siteConfig.socialLinks.map");
    expect(source).toContain("b.contact.email || b.contact.phone");
  });
});

describe("RegionStructuredData — regional JSON-LD (Phase S enrichment)", () => {
  // FS1 — the generic template configures NO operating regions (regions are
  // adopter data; the private reference site is the one that ships them). The
  // absence case is asserted unconditionally, and the regional rendering contract
  // keeps its coverage whenever a region IS configured.
  const region = resolveRegion(siteConfig.regions, "toronto");

  it("configures no operating regions by default", () => {
    expect(Object.keys(siteConfig.regions)).toEqual([]);
  });

  describe.runIf(Boolean(region))("with a configured region", () => {
    const configured = region!;

    it("emits @id/url from the regional canonical URL plus sameAs (both branches)", () => {
      const html = renderToStaticMarkup(
        RegionStructuredData({ region: configured, canonicalUrl: `${siteConfig.url}/en/toronto` }),
      );
      const node = jsonLd(html);

      expect(node["@type"]).toBe("LocalBusiness");
      expect(node["@id"]).toBe(`${siteConfig.url}/en/toronto`);
      expect(node.url).toBe(`${siteConfig.url}/en/toronto`);
      if (siteConfig.socialLinks.length > 0) {
        expect(node.sameAs).toEqual(siteConfig.socialLinks.map((link) => link.href));
      } else {
        expect(node.sameAs).toBeUndefined();
      }
    });

    it("keeps the pre-existing operational fields intact", () => {
      const html = renderToStaticMarkup(
        RegionStructuredData({ region: configured, canonicalUrl: `${siteConfig.url}/en/toronto` }),
      );
      expect(html).toContain(configured.address.street);
      expect(html).toContain("Monday");
      expect(html).toContain('"@type":"LocalBusiness"');
    });
  });
});
describe("OfferingStructuredData — Service JSON-LD (Phase S)", () => {
  const canonicalUrl = `${siteConfig.url}/en/offerings/starter-package`;

  it("emits a Service with name, description, canonical url and provider", () => {
    const html = renderToStaticMarkup(
      OfferingStructuredData({
        offering: offering(),
        canonicalUrl,
        providerName: "Example",
        providerType: "Organization",
      }),
    );
    const node = jsonLd(html);

    expect(node["@type"]).toBe("Service");
    expect(node["@id"]).toBe(canonicalUrl);
    expect(node.name).toBe("Starter package");
    expect(node.description).toBe("A practical package of essentials.");
    expect(node.url).toBe(canonicalUrl);
    expect(node.provider).toEqual({ "@type": "Organization", name: "Example" });
  });

  it("emits offers.price for a parseable price WITHOUT priceCurrency", () => {
    const html = renderToStaticMarkup(
      OfferingStructuredData({
        offering: offering({ price: "$150" }),
        canonicalUrl,
        providerName: "Example",
        providerType: "Organization",
      }),
    );
    const node = jsonLd(html);

    expect(node.offers).toEqual({ "@type": "Offer", price: "150" });
    expect(JSON.stringify(node)).not.toContain("priceCurrency");
  });

  it("omits offers for a range/descriptive price (From $150)", () => {
    const html = renderToStaticMarkup(
      OfferingStructuredData({
        offering: offering({ price: "From $150" }),
        canonicalUrl,
        providerName: "Example",
        providerType: "Organization",
      }),
    );
    expect(jsonLd(html).offers).toBeUndefined();
  });

  it("omits offers when the price is absent", () => {
    const html = renderToStaticMarkup(
      OfferingStructuredData({
        offering: offering({ price: undefined }),
        canonicalUrl,
        providerName: "Example",
        providerType: "Organization",
      }),
    );
    expect(jsonLd(html).offers).toBeUndefined();
  });

  it("omits offers for suffixed or verbose prices (150 USD / Custom Quote)", () => {
    for (const price of ["150 USD", "Custom Quote"]) {
      const html = renderToStaticMarkup(
        OfferingStructuredData({
          offering: offering({ price }),
          canonicalUrl,
          providerName: "Example",
          providerType: "Organization",
        }),
      );
      expect(jsonLd(html).offers, price).toBeUndefined();
    }
  });
});