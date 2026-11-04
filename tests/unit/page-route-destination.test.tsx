/**
 * THE PAGE-ROUTE DESTINATION CLASS (GEO-04 C09-R06)
 * =================================================
 *
 * `route` names another PAGE of this site. Before this seam every renderer built `/<locale>/<route>`,
 * which is correct only for a deployment whose Site is implied. On an EFS binding the same Page lives at
 * `/<prefix…>/<localeKey>/<route>`, so a route resolved the legacy way 404s on the very binding that
 * rendered it.
 *
 * These tests pin BOTH halves of the contract:
 *
 *  - the released locale-first behavior is preserved EXACTLY when no resolver is supplied (every non-EFS
 *    caller, unchanged by construction), and
 *  - an EFS render derives the address from its OWN verified binding — prefix, Site selector when open,
 *    qualified locale key — through the existing `contentSegments` authority, with a refusing resolver
 *    producing a label with no anchor rather than a guessed path.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EfsPageView } from "@/components/efs/efs-page";
import { efsPageLinkContext } from "@/components/efs/efs-page-links";
import { PageDocumentContent } from "@/components/site/page-document-content";
import { destinationHref } from "@/components/site/page-sections/section-support";
import { resolveProperties } from "@/core/efs/properties";

import type { EfsView } from "@/app/[[...segments]]/efs-request";
import type { PageDocument } from "@/core/page-document";

const entityId = "e_00000000000000000000000000";
const facetId = "acme";

/** A closed, single-prefix binding: the shape the browser checkpoint drives. */
const prefixBinding = {
  id: "managed",
  host: "www.acme.example",
  prefix: ["main"],
  entityId,
  facetId,
  siteIds: ["main"],
  siteMode: "closed" as const,
  defaultSiteId: "main",
  locales: ["en-001"],
  defaultLocale: "en-001",
  canonical: true,
};

/** A multi-segment prefix: nothing may assume the prefix is one segment long. */
const multiPrefixBinding = { ...prefixBinding, id: "multi", prefix: ["acme", "shop"] };

/** A Site-OPEN binding: the selector is part of the public path, so it must appear in a route target. */
const openBinding = {
  ...prefixBinding,
  id: "open",
  siteMode: "open" as const,
  siteIds: ["main", "outlet"],
};

/** The document under test: the SAME authored route reached through all four consumers. */
const document = {
  schemaVersion: 1,
  title: "Services",
  sections: [
    { type: "hero", heading: "Hero", actions: [{ label: "Hero route", route: "services" }] },
    { type: "actions", heading: "Actions", actions: [{ label: "Actions route", route: "services" }] },
    {
      type: "cards",
      heading: "Cards",
      items: [{ title: "Card", action: { label: "Card route", route: "services" } }],
    },
    {
      type: "list",
      heading: "List",
      items: [
        { label: "List route", route: "services" },
        { label: "Nested route", route: "offerings/website-design" },
      ],
    },
  ],
} as unknown as PageDocument;

function viewWith(binding: typeof prefixBinding | typeof openBinding): EfsView {
  const properties = resolveProperties([
    { level: "entity", id: entityId, properties: { "brand.name": { value: "Acme", public: true } } },
    { level: "facet", id: facetId, properties: {} },
    { level: "site", id: "main", properties: {} },
    { level: "page", id: "services", properties: {} },
    { level: "representation", id: "en-001", properties: {} },
  ]);
  return {
    binding,
    entity: { id: entityId, properties: {} },
    facet: { id: facetId, properties: {}, sites: [] },
    site: {
      id: "main",
      pages: [
        { id: "services", route: ["services"], representations: [{ locale: "en-001" }], properties: {} },
      ],
    },
    page: { id: "services", route: ["services"], representations: [{ locale: "en-001" }], properties: {} },
    representation: { locale: "en-001" },
    locale: "en-001",
    localeKey: "en-001",
    source: { format: "json", path: "services.json", pageId: "services", data: {}, document },
    properties,
    canonical: "https://www.acme.example/main/en-001/services",
    alternates: [],
    navigation: [],
    home: false,
    context: { runtimeSegment: "spoke-foundation", siteConfig: {} },
  } as unknown as EfsView;
}

describe("EFS Connect JSON — the specialised presentation uses the SAME per-render authorities", () => {
  /** The authored Connect document: a route action, an application link, and an untouched href. */
  const connectDocument = {
    schemaVersion: 1,
    title: "Connect",
    sections: [
      {
        type: "actions",
        heading: "Talk to us",
        actions: [
          { label: "Services route", route: "services" },
          { label: "Nested route", route: "offerings/website-design" },
          { label: "Application link", link: "contact" },
          { label: "External", href: "https://example.test/a?b=1" },
        ],
      },
    ],
  } as unknown as PageDocument;

  function connectHtml(binding: typeof prefixBinding | typeof openBinding): string {
    const view = viewWith(binding);
    const { resolveRoute, resolveLink, renderContactForm } = efsPageLinkContext(view);
    // The EXACT document body and the EXACT three authorities `ConnectPageContent` forwards for a
    // declared JSON Connect Page; the full specialised composition is exercised in real Next by the
    // browser fixture, where a live Spoke dictionary and asset resolver exist.
    return renderToStaticMarkup(
      <PageDocumentContent
        document={connectDocument}
        locale={view.locale}
        withTitle={false}
        resolveRoute={resolveRoute}
        resolveLink={resolveLink}
        renderContactForm={renderContactForm}
      />,
    );
  }

  it("puts an authored route on the BINDING-OWNED address, never the locale-first one", () => {
    const html = connectHtml(prefixBinding);
    expect(html).toContain('href="/main/en-001/services"');
    expect(html).toContain('href="/main/en-001/offerings/website-design"');
    expect(html).not.toContain('href="/en-001/services"');
    expect(html).not.toContain('href="/en-001/offerings/website-design"');
  });

  it("honours a multi-segment prefix rather than assuming one segment", () => {
    const html = connectHtml(multiPrefixBinding as typeof prefixBinding);
    expect(html).toContain('href="/acme/shop/en-001/services"');
    expect(html).not.toContain('href="/en-001/services"');
  });

  it("leaves an authored href verbatim and resolves an undeclared application link to no anchor", () => {
    const html = connectHtml(prefixBinding);
    expect(html).toContain('href="https://example.test/a?b=1"');
    // This installation declares no application for `contact`, so the verified resolver refuses: the
    // label survives with NO guessed destination (never `/en-001/contact`, never a bare `/contact`).
    expect(html).toContain("Application link");
    expect(html).not.toContain('href="/en-001/contact"');
    expect(html).not.toContain('href="/contact"');
  });

  it("keeps no second heading or document frame in the body the composition wraps", () => {
    const html = connectHtml(prefixBinding);
    // `withTitle={false}`: the specialised composition owns the ONE page-level heading (the dictionary's
    // Connect heading), so the authored document contributes none — that is what prevents a duplicate H1.
    expect([...html.matchAll(/<h1\b/g)]).toHaveLength(0);
    // The EFS Site's JSON-LD is composed ONCE by the presentation around this body
    // (`efsConnectPresentation`), never by the body itself — so the specialised path publishes it exactly
    // as the generic view does, and there is no duplicate script.
    expect(html).not.toContain("application/ld+json");
    // No nested document frame: the specialised body is an article inside the shell, never a second main.
    expect(html).not.toContain("<main");
  });
});

const hrefs = (html: string): readonly string[] =>
  [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] as string);

describe("destinationHref — the released behavior, unchanged when no route resolver is supplied", () => {
  it("uses an authored href exactly as written", () => {
    expect(destinationHref({ label: "x", href: "https://example.test/a?b=1" }, "en", undefined)).toBe(
      "https://example.test/a?b=1",
    );
  });

  it("keeps the legacy locale-first route path", () => {
    expect(destinationHref({ label: "x", route: "services" }, "en", undefined)).toBe("/en/services");
  });

  it("keeps the declared application-link resolver as the only `link` authority", () => {
    const resolveLink = (id: string) => (id === "connect" ? "/contact" : null);
    expect(destinationHref({ label: "x", link: "connect" }, "en", resolveLink)).toBe("/contact");
    expect(destinationHref({ label: "x", link: "missing" }, "en", resolveLink)).toBeNull();
  });

  it("lets a supplied route resolver own the answer, including a refusal", () => {
    const resolveRoute = (path: string) => (path === "services" ? "/main/en-001/services" : null);
    expect(destinationHref({ label: "x", route: "services" }, "en", undefined, resolveRoute)).toBe(
      "/main/en-001/services",
    );
    expect(destinationHref({ label: "x", route: "unknown" }, "en", undefined, resolveRoute)).toBeNull();
    // An authored href is never re-resolved, even when a route resolver is present.
    expect(destinationHref({ label: "x", href: "/kept" }, "en", undefined, resolveRoute)).toBe("/kept");
  });
});

describe("the non-EFS composer keeps its released locale-first output", () => {
  it("renders every authored route as /<locale>/<route> when no seam is supplied", () => {
    const html = renderToStaticMarkup(<PageDocumentContent document={document} locale="en" />);
    const rendered = hrefs(html);
    expect(rendered).toContain("/en/services");
    expect(rendered).toContain("/en/offerings/website-design");
    // Nothing acquired a publication prefix it was never given.
    expect(rendered.some((href) => href.startsWith("/main/"))).toBe(false);
  });
});

describe("an EFS render derives route targets from its own verified binding", () => {
  it("addresses the declared Page under the binding prefix, never /<locale>/<route>", () => {
    const html = renderToStaticMarkup(<EfsPageView view={viewWith(prefixBinding)} />);
    const rendered = hrefs(html);
    // hero, actions, card action and list item all answer from the SAME per-render resolver.
    expect(rendered.filter((href) => href === "/main/en-001/services").length).toBe(4);
    expect(rendered).toContain("/main/en-001/offerings/website-design");
    expect(rendered).not.toContain("/en-001/services");
  });

  it("keeps a multi-segment prefix whole", () => {
    const rendered = hrefs(renderToStaticMarkup(<EfsPageView view={viewWith(multiPrefixBinding as never)} />));
    expect(rendered).toContain("/acme/shop/en-001/services");
    expect(rendered).not.toContain("/en-001/services");
  });

  it("includes the Site selector a Site-OPEN binding publishes", () => {
    const rendered = hrefs(renderToStaticMarkup(<EfsPageView view={viewWith(openBinding)} />));
    // publicPathBase carries the selector for an open binding; the target is never a bare locale root.
    expect(rendered.some((href) => href.startsWith("/main/"))).toBe(true);
    expect(rendered.every((href) => !href.startsWith("/en-001/"))).toBe(true);
  });

  it("gives two simultaneous owners their own link context", () => {
    const first = hrefs(renderToStaticMarkup(<EfsPageView view={viewWith(prefixBinding)} />));
    const second = hrefs(renderToStaticMarkup(<EfsPageView view={viewWith(multiPrefixBinding as never)} />));
    expect(first).toContain("/main/en-001/services");
    expect(second).toContain("/acme/shop/en-001/services");
    expect(first).not.toContain("/acme/shop/en-001/services");
    expect(second).not.toContain("/main/en-001/services");
  });
});

describe("a route this publication cannot address renders its label alone", () => {
  it("refuses an invalid route grammar instead of guessing a path", () => {
    const invalid = {
      schemaVersion: 1,
      title: "Invalid",
      sections: [{ type: "actions", actions: [{ label: "Bad route", route: "../escape" }] }],
    } as unknown as PageDocument;
    const view = { ...viewWith(prefixBinding), source: { format: "json", path: "x.json", pageId: "x", data: {}, document: invalid } } as unknown as EfsView;
    const html = renderToStaticMarkup(<EfsPageView view={view} />);
    expect(html).toContain("Bad route");
    expect(hrefs(html).some((href) => href.includes("escape"))).toBe(false);
  });
});
