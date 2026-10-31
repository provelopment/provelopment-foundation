import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { efsShellPresentationConfig } from "@/app/[[...segments]]/server-composition";
import type { EfsView } from "@/app/[[...segments]]/efs-request";
import { StructuredData } from "@/components/site/structured-data";
import type { SiteConfig } from "@/config/site-config";

type Props = Record<string, { value: unknown; public?: boolean } | null>;

const entityId = "e_00000000000000000000000003";

/**
 * A view whose effective property set is exactly the authored bag supplied.
 *
 * Deliberately NEUTRAL and explicitly authored, per the accepted `GEO-01` contract: a generic
 * presentation profile key (`main`), a non-geographic publication prefix, and independently
 * authored QUALIFIED language tags. Nothing here is a country, a market, a region or a bare
 * language, and no retired public address is reproduced.
 */
function view(properties: Props): EfsView {
  const map = new Map(
    Object.entries(properties).map(([key, declaration]) => [
      key,
      declaration === null
        ? { key, value: undefined, state: "suppressed", public: false, provenance: [] }
        : {
            key,
            value: declaration.value,
            state: "declared",
            public: declaration.public === true,
            provenance: [],
          },
    ]),
  );
  return {
    publication: {
      id: "main-publication",
      spokeId: "main-spoke",
      presentationSiteCode: "main",
      entityId,
      facetId: "acme",
      bindings: [],
    },
    binding: {
      host: "portal.example",
      prefix: ["main"],
      locales: ["de-DE", "en-001"],
      defaultLocale: "en-001",
      siteMode: "closed",
    },
    site: { id: "main", pages: [] },
    facet: { id: "acme" },
    page: { id: "about", route: ["about"] },
    properties: {
      get: (key: string) => map.get(key),
      publicEntries: () => [...map.values()].filter((entry) => entry.public),
    },
    canonical: "https://portal.example/main/en-001/about",
  } as unknown as EfsView;
}

function source(): SiteConfig {
  const site = {
    code: "main",
    label: "Main",
    locales: [
      { path: "de-de", canonical: "de-DE" },
      { path: "en-001", canonical: "en-001" },
    ],
    defaultLocale: "en-001",
    fallback: true,
    isDefault: true,
    locationSelection: null,
  };
  return {
    url: "https://legacy.example",
    sites: [site],
    defaultSite: site,
    hubs: [],
    sitePageOverrides: {},
    defaultLocale: "en-001",
    locales: [
      { code: "de-de", label: "Deutsch" },
      { code: "en-001", label: "English" },
    ],
    name: "Configured Brand",
    contact: { email: "deployment@example.com", phone: "+1 555 0100" },
    socialLinks: [],
    navigation: [],
    business: {
      name: "Configured Business",
      contact: { email: "business@example.com", phone: "+1 555 0200" },
      locations: [],
    },
    regions: {},
    pageBindings: [],
  } as unknown as SiteConfig;
}

describe("D40 Decision C — the EFS shell applies source precedence", () => {
  it("lets a public EFS fact win in the shell AND in the metadata it feeds", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({
        "brand.name": { value: "Capsule Brand", public: true },
        "contact.email": { value: "capsule@example.com", public: true },
        "contact.phone": { value: "+44 20 7946 0000", public: true },
      }),
    )!;
    // ONE resolution: the same value reaches the visible shell and the JSON-LD, which reads
    // `siteConfig.name`, `business.name`, `business.contact` and `contact`.
    expect(composed.name).toBe("Capsule Brand");
    expect(composed.business.name).toBe("Capsule Brand");
    expect(composed.business.contact.email).toBe("capsule@example.com");
    expect(composed.business.contact.phone).toBe("+44 20 7946 0000");
    // No contradictory second value anywhere.
    expect(composed.contact.email).toBe("capsule@example.com");
    expect(composed.contact.phone).toBe("+44 20 7946 0000");
  });

  it("keeps today's configured values when the capsule declares nothing", () => {
    const composed = efsShellPresentationConfig(source(), view({}))!;
    expect(composed.name).toBe("Configured Brand");
    expect(composed.business.name).toBe("Configured Business");
    expect(composed.business.contact.email).toBe("business@example.com");
    expect(composed.business.contact.phone).toBe("+1 555 0200");
    expect(composed.contact.email).toBe("deployment@example.com");
  });

  it("blocks a PRIVATE declaration: neither the EFS value nor the configuration appears", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({ "contact.email": { value: "private@example.com", public: false } }),
    )!;
    expect(composed.business.contact.email).toBeUndefined();
    expect(composed.contact.email).toBeUndefined();
    expect(composed.business.contact.email).not.toBe("business@example.com");
    // An unrelated fact is untouched.
    expect(composed.business.contact.phone).toBe("+1 555 0200");
  });

  it("blocks an explicit null suppression the same way", () => {
    const composed = efsShellPresentationConfig(source(), view({ "contact.phone": null }))!;
    expect(composed.business.contact.phone).toBeUndefined();
    expect(composed.contact.phone).toBeUndefined();
  });

  it("falls back to the EFS SiteID when the brand name is denied, as a denied site.label does", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({ "brand.name": { value: "Hidden", public: false } }),
    )!;
    expect(composed.name).toBe("main");
    // `business.name` agrees with `siteConfig.name` rather than contradicting it. Leaving it unset
    // would make the JSON-LD fall back to `siteConfig.name` anyway (`structured-data.tsx`), so the
    // configured business name cannot leak into the blocked fact's place either way.
    expect(composed.business.name).toBe("main");
    expect(composed.business.name).not.toBe("Configured Business");
  });

  it("does not let optional place, timezone or schedule properties move identity or language", () => {
    const baseline = efsShellPresentationConfig(source(), view({}))!;
    const withOptional = efsShellPresentationConfig(
      source(),
      view({
        place: { value: "Riverside", public: true },
        timezone: { value: "Europe/Berlin", public: true },
        openingSchedule: {
          value: { intervals: [{ days: ["mon"], open: "09:00", close: "17:00" }] },
          public: true,
        },
      }),
    )!;
    // Language, route, publication and canonical identities are unchanged.
    expect(withOptional.sites[0].locales).toEqual(baseline.sites[0].locales);
    expect(withOptional.sites[0].defaultLocale).toBe("en-001");
    // The published tags are the AUTHORED qualified tags, independently of the optional facts.
    expect(withOptional.sites[0].locales.map((locale) => locale.canonical)).toEqual([
      "de-DE",
      "en-001",
    ]);
    expect(withOptional.sites[0].publicPathBase).toEqual(baseline.sites[0].publicPathBase);
    expect(withOptional.defaultLocale).toBe(baseline.defaultLocale);
    expect(withOptional.url).toBe(baseline.url);
    // The retired geographic shell fields stay retired.
    expect(withOptional.business.timezone).toBeUndefined();
    expect(withOptional.business.locations).toEqual([]);
    // Branding and contact facts are untouched by those keys.
    expect(withOptional.name).toBe(baseline.name);
    expect(withOptional.business.contact).toEqual(baseline.business.contact);
  });
});


describe("R02-C1 — contact identity and business identity are separate facts", () => {
  it("never promotes a contact name into the business or brand name", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({ "contact.name": { value: "Ada Lovelace", public: true } }),
    )!;
    // The business keeps its configured identity; the brand keeps its configured name.
    expect(composed.business.name).toBe("Configured Business");
    expect(composed.name).toBe("Configured Brand");
    // And the contact person's name does not appear in either slot.
    expect(composed.business.name).not.toBe("Ada Lovelace");
    expect(composed.name).not.toBe("Ada Lovelace");
  });

  it("keeps brand and contact names independent when both are declared", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({
        "brand.name": { value: "Acme", public: true },
        "contact.name": { value: "Ada Lovelace", public: true },
      }),
    )!;
    expect(composed.name).toBe("Acme");
    expect(composed.business.name).toBe("Acme");
  });
});

describe("R02-C2 — a declared fact never re-opens the configuration fallback", () => {
  it("refuses the configured value when a public declaration is not a usable string", () => {
    // Typed validation rejects this at manifest load; the composition must still never treat it as
    // "absent" and reinstate the configured value.
    const composed = efsShellPresentationConfig(
      source(),
      view({ "brand.name": { value: 42, public: true } }),
    )!;
    expect(composed.name).toBe("main");
    expect(composed.name).not.toBe("Configured Brand");
    expect(composed.business.name).not.toBe("Configured Business");
  });

  it("refuses the configured value for a malformed public contact fact", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({ "contact.email": { value: ["not", "a", "string"], public: true } }),
    )!;
    expect(composed.business.contact.email).toBeUndefined();
    expect(composed.contact.email).toBeUndefined();
  });
});

describe("R02-C3 — the same resolved fact reaches the metadata", () => {
  it("publishes the EFS contact and brand in the JSON-LD, not the configured values", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({
        "brand.name": { value: "Capsule Brand", public: true },
        "contact.email": { value: "capsule@example.com", public: true },
        "contact.phone": { value: "+44 20 7946 0000", public: true },
      }),
    )!;
    const markup = renderToStaticMarkup(
      <StructuredData locale="en-001" siteConfig={composed} />,
    );
    expect(markup).toContain("Capsule Brand");
    expect(markup).toContain("capsule@example.com");
    expect(markup).toContain("+44 20 7946 0000");
    // The configured values appear nowhere in the metadata.
    expect(markup).not.toContain("Configured Business");
    expect(markup).not.toContain("business@example.com");
    expect(markup).not.toContain("+1 555 0200");
  });

  it("publishes no contact at all when the declaration is private", () => {
    const composed = efsShellPresentationConfig(
      source(),
      view({ "contact.email": { value: "private@example.com", public: false } }),
    )!;
    const markup = renderToStaticMarkup(
      <StructuredData locale="en-001" siteConfig={composed} />,
    );
    expect(markup).not.toContain("private@example.com");
    expect(markup).not.toContain("business@example.com");
    expect(markup).not.toContain("deployment@example.com");
  });

  it("publishes no contact at all when the declaration is suppressed", () => {
    const composed = efsShellPresentationConfig(source(), view({ "contact.phone": null }))!;
    const markup = renderToStaticMarkup(
      <StructuredData locale="en-001" siteConfig={composed} />,
    );
    expect(markup).not.toContain("+1 555 0200");
    expect(markup).not.toContain("+1 555 0100");
  });
});
