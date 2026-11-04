import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * THE DECLARATIVE VOCABULARY, RENDERED THROUGH THE REAL EFS ROUTE (`C07-R02`)
 * ==========================================================================
 *
 * The Page document is authored the way the platform actually publishes one: a DECLARATION in a
 * disposable manifest together with its JSON representation in the same disposable capsule. Nothing is
 * planted under the retired `content/pages/json/<site>/<locale>` tree, and the real deployment is never
 * written to — the fixture under OS temp is the only subject.
 */

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (pathname: string) => {
    throw new Error(`REDIRECT:${pathname}`);
  },
  permanentRedirect: (pathname: string) => {
    throw new Error(`PERMANENT_REDIRECT:${pathname}`);
  },
}));

import { PAGE_SECTION_TYPES } from "@/core/page-document";

import {
  authorRuntimeCutRepresentation,
  declareRuntimeCutPage,
  materializeRuntimeCutFixture,
  materializeRuntimeCutInstallation,
  RUNTIME_CUT_HOST,
  selectRuntimeCutFixture,
} from "../support/efs-runtime-cut";
import { selectEfsInstallation } from "../support/efs-installation";


/**
 * THE DECLARATIVE VOCABULARY, RENDERED THROUGH THE REAL ROUTE
 * ===========================================================
 *
 * One JSON page that uses EVERY declared section type is served by the real page route,
 * and the rendered HTML is checked for the things the schema promised:
 *
 *   · ONE h1 (the document's title), section headings at level 2 and item titles at 3;
 *   · real semantic markup (lists, table headings, disclosure, figure/figcaption);
 *   · the image alt contract (content images described, decorative art hidden);
 *   · Markdown fields rendered by the SAFE renderer — raw HTML inert, unsafe
 *     destinations dropped — so JSON prose is exactly as safe as Markdown prose;
 *   · actions as real links, with `route` targets resolved against the locale;
 *   · and no way for the document to inject markup, classes, styles, handlers or scripts.
 *
 * The fixture is built FROM the vocabulary list, so a new section type cannot be added
 * without this proof following it.
 */
// The published coordinates: an EFS address is `<binding prefix>/<locale>/<declared route>`.
const LOCALE = "en-001";
const ROUTE_PATH = "zz-vocabulary-fixture";

const IMAGE = { src: "/assets/photo.png", alt: "A described photograph" };

/** One representative instance of every declared section type. */
const SECTIONS: readonly Record<string, unknown>[] = [
  {
    type: "hero",
    eyebrow: "Eyebrow",
    lede: "Opening **lede**.",
    actions: [{ label: "Contact", href: "/contact" }],
    support: "Supporting line.",
  },
  {
    type: "prose",
    heading: "Prose heading",
    body: "Body with **emphasis**, a [link](/about) and hostile markup:\n\n<script>window.__jsonScript = 1;</script>\n\n<div onclick=\"window.__jsonHandler = 1\">raw html</div>",
  },
  { type: "media", heading: "Media heading", image: IMAGE, caption: "Caption text.", position: "end" },
  {
    type: "gallery",
    heading: "Gallery heading",
    columns: 2,
    items: [{ image: IMAGE, caption: "One" }, { image: { src: "/assets/decor.png", decorative: true } }],
  },
  {
    type: "actions",
    heading: "Actions heading",
    actions: [
      { label: "Internal", route: "services" },
      { label: "External", href: "https://example.com/", variant: "secondary" },
    ],
  },
  { type: "callout", heading: "Callout heading", body: "Note **body**.", tone: "warning" },
  {
    type: "cards",
    heading: "Cards heading",
    columns: 3,
    items: [
      {
        title: "Card one",
        body: "Card body.",
        image: IMAGE,
        meta: "Meta line",
        action: { label: "More", route: "services/web-design" },
      },
    ],
  },
  {
    type: "features",
    heading: "Features heading",
    items: [{ title: "Feature one", body: "Feature body.", icon: "/assets/icon-blog.svg" }],
  },
  {
    type: "columns",
    heading: "Columns heading",
    ratio: "start-wide",
    items: [{ title: "You", items: ["One", "Two"] }, { title: "Us", body: "Our **side**." }],
  },
  { type: "steps", heading: "Steps heading", items: [{ title: "First step", body: "Step body." }, { title: "Second step" }] },
  { type: "stats", heading: "Stats heading", items: [{ value: "120+", label: "Projects", detail: "Since 2019." }] },
  { type: "quote", body: "A **quotation**.", attribution: "A Person", role: "A Role" },
  {
    type: "table",
    heading: "Table heading",
    columns: ["Plan", "Price"],
    rows: [["Starter", "500"], ["Growth", "900"]],
    caption: "Prices from 2026.",
  },
  { type: "faq", heading: "FAQ heading", items: [{ question: "Is it declarative?", answer: "It is — and **safe**." }] },
  {
    type: "list",
    heading: "List heading",
    ordered: true,
    items: ["Plain item", { label: "Linked item", detail: "With **detail**.", route: "about" }],
  },
  { type: "divider" },
  { type: "contactForm", formRef: "foundation-contact" },
];

/**
 * Author-injected script content, as opposed to the platform's own structured data.
 *
 * A safe page may carry the platform's JSON-LD block; nothing the authored document wrote may appear
 * inside executable script text.
 */
function authorScripts(markup: string): string[] {
  return (markup.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) ?? []).filter(
    (block) => !/^<script[^>]*type="application\/ld\+json"/i.test(block) || /window\./.test(block),
  );
}

const installation = materializeRuntimeCutInstallation();
selectEfsInstallation(installation.root);
const fixture = materializeRuntimeCutFixture();
const restoreDeclaration = selectRuntimeCutFixture(fixture);

afterAll(() => {
  restoreDeclaration();
  fixture.cleanup();
  installation.cleanup();
});

describe("the declarative page vocabulary, through the real route", () => {
  let html = "";

  beforeAll(async () => {
    // BOTH halves, together, in the disposable subject: the declaration and its representation. The
    // committed fixture and the real deployment are never written to.
    declareRuntimeCutPage(fixture, {
      id: ROUTE_PATH,
      route: [ROUTE_PATH],
      locales: [LOCALE],
      navLabel: "Vocabulary",
    });
    authorRuntimeCutRepresentation(
      fixture,
      "main",
      ROUTE_PATH,
      LOCALE,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          title: "Vocabulary fixture page",
          description: "A summary.",
          sections: SECTIONS,
        },
        null,
        2,
      )}\n`,
    );

    vi.resetModules();
    state.headers.set("host", RUNTIME_CUT_HOST);
    const { default: PageRoute } = await import("@/app/[[...segments]]/page");
    html = renderToStaticMarkup(
      await PageRoute({ params: Promise.resolve({ segments: [LOCALE, ROUTE_PATH] }) }),
    );
  });

  it("exercises every declared section type", () => {
    expect(SECTIONS.map((section) => section.type).sort()).toEqual([...PAGE_SECTION_TYPES].sort());
  });

  it("renders exactly ONE h1: the document's title", () => {
    const h1s = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toContain("Vocabulary fixture page");
    // Section headings are level 2, item titles level 3 — the declared outline.
    expect(html).toContain("<h2");
    expect(html).toContain("<h3");
  });

  it("renders semantic structure rather than styled containers", () => {
    expect(html).toContain('<th scope="col"');
    expect(html).toContain("<caption");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("<ol");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<figcaption");
    expect(html).toContain("<figure");
    expect(html).toContain("<table");
  });

  it("honours the image alt contract", () => {
    expect(html).toContain('alt="A described photograph"');
    // Decorative art is hidden from assistive technology, never left unnamed.
    expect(html).toContain('alt="" aria-hidden="true"');
    expect(html.match(/<img/g)?.length).toBeGreaterThan(2);
  });

  it("renders Markdown fields through the SAFE renderer", () => {
    // Markdown works…
    expect(html).toContain("<strong>lede</strong>");
    expect(html).toContain("<strong>emphasis</strong>");
    expect(html).toContain('<a href="/about">link</a>');
    expect(html).toContain("<strong>safe</strong>");
    // …and the hostile parts are TEXT, exactly as in the Markdown authoring mode. The platform's OWN
    // structured-data script is not author markup; nothing the author wrote may execute.
    expect(authorScripts(html)).toEqual([]);
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/i);
    expect(html).toContain("window.__jsonScript");
  });

  it("renders actions as real links, resolving `route` against the locale", () => {
    expect(html).toContain('href="/contact"');
    expect(html).toContain(`href="/${LOCALE}/services"`);
    expect(html).toContain(`href="/${LOCALE}/services/web-design"`);
    expect(html).toContain(`href="/${LOCALE}/about"`);
    // An external destination keeps its own href; the platform — never the author —
    // decides the external-link treatment.
    expect(html).toContain('href="https://example.com/"');
  });

  it("cannot inject markup, classes, styles, handlers or scripts", () => {
    // The document may not name a class, a style or a pixel value (the schema refuses
    // them), so no tag in the output can carry an inline style or an event handler. The
    // check is scoped to real TAG text, because the fixture deliberately shows hostile
    // markup as escaped text — which is exactly what inertness means.
    const tags = html.match(/<[a-zA-Z][^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(10);
    for (const tag of tags) {
      expect(tag, tag).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
      expect(tag, tag).not.toMatch(/\sstyle\s*=\s*["']/i);
    }
    expect(html).not.toContain("<style");
    expect(authorScripts(html)).toEqual([]);
  });
});
