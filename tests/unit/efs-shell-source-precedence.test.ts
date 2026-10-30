import { describe, expect, it } from "vitest";

import { efsShellPresentationConfig } from "@/app/[[...segments]]/server-composition";
import type { EfsView } from "@/app/[[...segments]]/efs-request";
import type { SiteConfig } from "@/config/site-config";

type Props = Record<string, { value: unknown; public?: boolean } | null>;

/** A view whose effective property set is exactly the authored bag supplied. */
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
      id: "north-publication",
      spokeId: "north-spoke",
      presentationSiteCode: "ww",
      entityId: "e_00000000000000000000000003",
      facetId: "north",
      bindings: [],
    },
    binding: {
      host: "north.example",
      prefix: ["de"],
      locales: ["de", "en"],
      defaultLocale: "de",
      siteMode: "closed",
    },
    site: { id: "berlin", pages: [] },
    facet: { id: "germany" },
    page: { id: "frankfurt", route: ["frankfurt"] },
    properties: {
      get: (key: string) => map.get(key),
      publicEntries: () => [...map.values()].filter((entry) => entry.public),
    },
    canonical: "https://north.example/de/en",
  } as unknown as EfsView;
}

function source(): SiteConfig {
  const site = {
    code: "ww",
    label: "Worldwide",
    locales: [{ path: "de", canonical: "de" }],
    defaultLocale: "de",
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
    defaultLocale: "de",
    locales: [{ code: "de", label: "Deutsch" }],
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
    expect(composed.name).toBe("berlin");
    // `business.name` agrees with `siteConfig.name` rather than contradicting it. Leaving it unset
    // would make the JSON-LD fall back to `siteConfig.name` anyway (`structured-data.tsx`), so the
    // configured business name cannot leak into the blocked fact's place either way.
    expect(composed.business.name).toBe("berlin");
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
    expect(withOptional.sites[0].defaultLocale).toBe("de");
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

