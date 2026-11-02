import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EfsPageView } from "@/components/efs/efs-page";
import { EfsPageStructuredData } from "@/components/efs/efs-page-links";
import { resolveProperties } from "@/core/efs/properties";

import type { EfsView } from "@/app/[[...segments]]/efs-request";

/**
 * THE PUBLIC JSON-LD PROJECTION (GEO-04 C09-R10)
 * ==============================================
 *
 * `EffectiveProperties` is deny-by-default: `get(key)` answers with the EFFECTIVE declaration whether
 * or not its owner published it, while `publicEntries()` is the only view that contains public,
 * nonsuppressed entries. The structured-data `name` is PUBLIC output, so it must be selected from the
 * public projection — otherwise a private `brand.name` escapes in HTML on every EFS Page.
 *
 * These cases drive REAL `resolveProperties()` chains (never a fake property object that always answers
 * "public") through BOTH renderers that publish the script: the generic page view and the specialised
 * Connect presentation, which emits this very component as its only structured data.
 */
describe("public JSON-LD projection — a private brand name never reaches public output", () => {
  const privateBrand = "PRIVATE-BRAND-DO-NOT-PUBLISH";
  const suppressedBrand = "SUPPRESSED-ANCESTOR-BRAND";

  function viewWithProperties(nodes: Parameters<typeof resolveProperties>[0]): EfsView {
    return { ...viewWith("/assets/logo.svg", true), properties: resolveProperties(nodes) };
  }

  const entityBrand = (value: string, isPublic: boolean) => ({
    level: "entity" as const,
    id: entityId,
    properties: { "brand.name": { value, public: isPublic } },
  });
  const siteBrand = (value: string | null, isPublic: boolean) => ({
    level: "site" as const,
    id: "main",
    properties: { "brand.name": value === null ? null : { value, public: isPublic } },
  });
  const empty = (level: "facet" | "site" | "page" | "representation", id: string) => ({
    level,
    id,
    properties: {},
  });

  /** The JSON-LD payload exactly as it reaches the client, plus the full rendered document. */
  function renderBoth(nodes: Parameters<typeof resolveProperties>[0]) {
    const view = viewWithProperties(nodes);
    const pageHtml = renderToStaticMarkup(<EfsPageView view={view} />);
    const connectHtml = renderToStaticMarkup(<EfsPageStructuredData view={view} />);
    const extract = (html: string): Record<string, unknown> => {
      const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      return match?.[1] === undefined ? {} : (JSON.parse(match[1]) as Record<string, unknown>);
    };
    return { pageHtml, connectHtml, pageData: extract(pageHtml), connectData: extract(connectHtml) };
  }
  it("publishes a publicly declared Entity brand, inherited down the chain", () => {
    const { pageData, connectData } = renderBoth([
      entityBrand("Acme", true),
      empty("facet", "acme"),
      empty("site", "main"),
      empty("page", "about"),
      empty("representation", "en-001"),
    ]);
    expect(pageData.name).toBe("Acme");
    expect(connectData.name).toBe("Acme");
    expect(pageData["@type"]).toBe("WebSite");
    expect(connectData.url).toBe("https://www.acme.example/acme/en-001/about");
  });

  it("refuses a PRIVATE Entity brand and falls back to the Facet identity, in both renderers", () => {
    const { pageHtml, connectHtml, pageData, connectData } = renderBoth([
      entityBrand(privateBrand, false),
      empty("facet", "acme"),
      empty("site", "main"),
      empty("page", "about"),
      empty("representation", "en-001"),
    ]);
    expect(pageData.name).toBe("acme");
    expect(connectData.name).toBe("acme");
    expect(pageHtml).not.toContain(privateBrand);
    expect(connectHtml).not.toContain(privateBrand);
  });

  it("refuses a private DESCENDANT override of a public ancestor", () => {
    const { pageHtml, connectHtml, pageData, connectData } = renderBoth([
      entityBrand("Acme", true),
      empty("facet", "acme"),
      siteBrand(privateBrand, false),
      empty("page", "about"),
      empty("representation", "en-001"),
    ]);
    expect(pageData.name).toBe("acme");
    expect(connectData.name).toBe("acme");
    expect(pageHtml).not.toContain(privateBrand);
    expect(connectHtml).not.toContain(privateBrand);
  });

  it("refuses an ancestor suppressed by a descendant `null`", () => {
    const { pageHtml, connectHtml, pageData, connectData } = renderBoth([
      entityBrand(suppressedBrand, true),
      empty("facet", "acme"),
      siteBrand(null, true),
      empty("page", "about"),
      empty("representation", "en-001"),
    ]);
    expect(pageData.name).toBe("acme");
    expect(connectData.name).toBe("acme");
    expect(pageHtml).not.toContain(suppressedBrand);
    expect(connectHtml).not.toContain(suppressedBrand);
  });
  it("honours a public descendant override", () => {
    const { pageData, connectData } = renderBoth([
      entityBrand("Acme", true),
      empty("facet", "acme"),
      siteBrand("Acme Outlet", true),
      empty("page", "about"),
      empty("representation", "en-001"),
    ]);
    expect(pageData.name).toBe("Acme Outlet");
    expect(connectData.name).toBe("Acme Outlet");
  });

  it("never publishes a private declaration alongside a public one", () => {
    const { pageHtml, connectHtml } = renderBoth([
      {
        level: "entity" as const,
        id: entityId,
        properties: {
          "brand.name": { value: "Acme", public: true },
          "internal.secret": { value: privateBrand, public: false },
        },
      },
      empty("facet", "acme"),
      empty("site", "main"),
      empty("page", "about"),
      empty("representation", "en-001"),
    ]);
    expect(pageHtml).not.toContain(privateBrand);
    expect(connectHtml).not.toContain(privateBrand);
  });

  it("escapes `<` so a public name cannot break out of the JSON-LD script", () => {
    const { pageHtml, connectHtml, pageData, connectData } = renderBoth([
      entityBrand("Acme <script>alert(1)</script>", true),
      empty("facet", "acme"),
      empty("site", "main"),
      empty("page", "about"),
      empty("representation", "en-001"),
    ]);
    expect(pageData.name).toBe("Acme <script>alert(1)</script>");
    expect(connectData.name).toBe("Acme <script>alert(1)</script>");
    expect(pageHtml).not.toContain("</script>alert(1)");
    expect(connectHtml).not.toContain("</script>alert(1)");
    expect(pageHtml).toContain("\\u003c");
  });
});

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
    // A9 — a render ALWAYS has a verified Spoke context: it is the only supplier of the Site's own
    // configuration. This fixture declares none, so it offers no public address and no link resolves,
    // which is exactly what these rendering boundaries assert.
    context: { runtimeSegment: "spoke-foundation", siteConfig: {} },
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
