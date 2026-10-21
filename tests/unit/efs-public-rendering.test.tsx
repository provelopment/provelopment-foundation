import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EfsPageView } from "@/components/efs/efs-page";
import { resolveProperties } from "@/core/efs/properties";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

const entityId = "e_00000000000000000000000000";
const binding = {
  id: "managed",
  host: "www.acme.example",
  prefix: ["acme"],
  entityId,
  facetId: "acme",
  siteIds: ["main"],
  siteMode: "closed" as const,
  defaultSiteId: "main",
  locales: ["en-001"],
  defaultLocale: "en-001",
  canonical: true,
};

function viewWith(logo: string, pageLabelPublic: boolean): EfsView {
  const properties = resolveProperties([
    {
      level: "entity",
      id: entityId,
      properties: {
        "brand.name": { value: "Acme", public: true },
        "brand.logo": { value: logo, public: true },
        "internal.secret": { value: "OWNER-ONLY-SECRET", public: false },
      },
    },
    { level: "facet", id: "acme", properties: {} },
    { level: "site", id: "main", properties: {} },
    {
      level: "page",
      id: "about",
      properties: {
        "nav.label": { value: "PRIVATE-NAV-LABEL", public: pageLabelPublic },
      },
    },
    { level: "representation", id: "en-001", properties: {} },
  ]);
  return {
    binding,
    entity: { id: entityId, properties: {} },
    facet: { id: "acme", properties: {}, sites: [] },
    site: {
      id: "main",
      pages: [
        {
          id: "about",
          route: ["about"],
          representations: [{ locale: "en-001" }],
          properties: { "nav.label": { value: "PRIVATE-NAV-LABEL", public: false } },
        },
        {
          id: "contact",
          route: ["contact"],
          representations: [{ locale: "en-001" }],
          properties: { "nav.label": { value: "Contact", public: true } },
        },
      ],
    },
    page: {
      id: "about",
      route: ["about"],
      representations: [{ locale: "en-001" }],
      properties: { "nav.label": { value: "PRIVATE-NAV-LABEL", public: false } },
    },
    representation: { locale: "en-001" },
    locale: "en-001",
    localeKey: "en-001",
    source: { format: "markdown", path: "about.md", pageId: "about", data: { title: "About" }, body: "Body" },
    properties,
    canonical: "https://www.acme.example/acme/en-001/about",
    alternates: [{ hreflang: "en-001", href: "https://www.acme.example/acme/en-001/about" }],
    navigation: [
      {
        pageId: "about",
        label: "about",
        href: "https://www.acme.example/acme/en-001/about",
        current: true,
      },
      {
        pageId: "contact",
        label: "Contact",
        href: "https://www.acme.example/acme/en-001/contact",
        current: false,
      },
    ],
    home: false,
  } as unknown as EfsView;
}

describe("EFS public rendering boundary (R02)", () => {
  it("never leaks a private inherited property", () => {
    const html = renderToStaticMarkup(<EfsPageView view={viewWith("/brand/logo.svg", false)} />);
    expect(html).not.toContain("OWNER-ONLY-SECRET");
    expect(html).not.toContain("internal.secret");
  });

  it("uses a private nav label only as no label at all", () => {
    const html = renderToStaticMarkup(<EfsPageView view={viewWith("/brand/logo.svg", false)} />);
    expect(html).not.toContain("PRIVATE-NAV-LABEL");
    expect(html).toContain("Contact");
  });

  it("refuses external and malformed logo references", () => {
    for (const logo of ["https://cdn.example.com/logo.svg", "//cdn.example.com/logo.svg", "javascript:alert(1)"]) {
      const html = renderToStaticMarkup(<EfsPageView view={viewWith(logo, true)} />);
      expect(html).not.toContain("cdn.example.com");
      expect(html).not.toContain("javascript:");
      expect(html).not.toContain("owner-assets/https");
    }
  });

  it("does not duplicate the shared shell header when the shell is present", () => {
    const html = renderToStaticMarkup(
      <EfsPageView view={viewWith("/brand/logo.svg", true)} withShell />,
    );
    expect(html).not.toContain("<header");
  });
});
