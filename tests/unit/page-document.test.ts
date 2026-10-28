import { describe, expect, it } from "vitest";

import { HOME_CONTENT_SLUG } from "@/core/page-content";
import {
  PAGE_ACTION_VARIANTS,
  PAGE_CALLOUT_TONES,
  PAGE_DEFAULT_VISIBILITY,
  PAGE_DOCUMENT_SCHEMA_VERSION,
  PAGE_HEADING_LEVELS,
  PAGE_ITEM_COLUMNS,
  PAGE_MARKDOWN_FIELDS,
  PAGE_MAX_ITEMS,
  PAGE_MAX_SECTIONS,
  PAGE_MEDIA_POSITIONS,
  PAGE_SECTION_SURFACES,
  PAGE_SECTION_TYPES,
  PAGE_VISIBILITIES,
  describePageDocumentIssues,
  formatPageDocumentIssuePath,
  isUnlistedPage,
  pageDocumentSchema,
  pageVisibilityOf,
  reservedHomeVisibilityIssue,
} from "@/core/page-document";

/** A complete, valid document — the reference for the assertions below. */
function document(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1, title: "Example page", sections: [], ...overrides };
}

/** The issues the schema reports for a document, as one readable string. */
function issues(value: unknown): string {
  const result = pageDocumentSchema.safeParse(value);
  if (result.success) throw new Error("expected the document to be refused");
  return describePageDocumentIssues(result.error);
}

/**
 * THE DECLARATIVE PAGE DOCUMENT (FOUNDATION-PAGES-A2).
 *
 * The vocabulary IS the schema: these assertions pin the envelope, the supported
 * section types, the finite presentation options, the accessibility rules that make an
 * inaccessible page unrepresentable, and the loud refusals (version, unknown type,
 * unknown property, required fields) that keep an author's typo from becoming missing
 * content.
 */
describe("the page document envelope", () => {
  it("declares ONE supported schema version", () => {
    expect(PAGE_DOCUMENT_SCHEMA_VERSION).toBe(1);
    expect(pageDocumentSchema.safeParse(document()).success).toBe(true);
  });

  it("requires a title and accepts an optional description", () => {
    expect(pageDocumentSchema.safeParse({ schemaVersion: 1, sections: [] }).success).toBe(false);
    const parsed = pageDocumentSchema.safeParse(
      document({ description: "What this page is about." }),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.description).toBe("What this page is about.");
  });

  it("refuses an unsupported schema version loudly, naming the supported one", () => {
    for (const version of [2, 0, "1", undefined, null]) {
      const message = issues(document({ schemaVersion: version }));
      expect(message, String(version)).toContain("schemaVersion");
      expect(message, String(version)).toContain(String(PAGE_DOCUMENT_SCHEMA_VERSION));
    }
  });

  it("refuses an unknown envelope property instead of ignoring it", () => {
    expect(issues(document({ titel: "typo" }))).toContain("titel");
  });

  it("bounds the number of sections", () => {
    const many = Array.from({ length: PAGE_MAX_SECTIONS + 1 }, () => ({ type: "divider" }));
    expect(issues(document({ sections: many }))).toContain("sections");
    expect(pageDocumentSchema.safeParse(document({ sections: many.slice(1) })).success).toBe(true);
  });

  /**
   * TEMPLATE-PV-A1 — THE VISIBILITY VOCABULARY. Two publication values, ONE default, and ONE envelope version:
   * a document that declares nothing is public, which is every document authored before the property existed,
   * so an additive optional field cannot move the version.
   */
  it("declares two publication visibilities, defaults to public, and keeps ONE schema version", () => {
    expect([...PAGE_VISIBILITIES]).toEqual(["public", "unlisted"]);
    expect(PAGE_DEFAULT_VISIBILITY).toBe("public");
    expect(PAGE_DOCUMENT_SCHEMA_VERSION).toBe(1);

    // A document that says nothing about visibility IS public — the compatibility guarantee.
    const silent = pageDocumentSchema.parse(document());
    expect(silent.visibility).toBeUndefined();
    expect(pageVisibilityOf(silent)).toBe("public");
    expect(isUnlistedPage(silent)).toBe(false);

    // …and every declared value round-trips, so the vocabulary is usable rather than merely listed.
    for (const visibility of PAGE_VISIBILITIES) {
      const parsed = pageDocumentSchema.parse(document({ visibility }));
      expect(pageVisibilityOf(parsed), visibility).toBe(visibility);
      expect(isUnlistedPage(parsed), visibility).toBe(visibility === "unlisted");
    }
  });

  it("refuses a visibility outside the vocabulary instead of guessing at it", () => {
    // An author who writes something else must be told the words this platform understands: a page is never
    // silently made undiscoverable — or discoverable — by a word the platform did not recognise.
    for (const refused of ["hidden", "draft", "noindex", "Private", "PUBLIC", "Unlisted", "", " ", true, 0, null]) {
      expect(pageDocumentSchema.safeParse(document({ visibility: refused })).success, String(refused)).toBe(
        false,
      );
    }
    const message = issues(document({ visibility: "hidden" }));
    expect(message).toContain("visibility");
    expect(message).toContain("public");
    expect(message).toContain("unlisted");
    // The envelope stays STRICT: the new property did not open the door to undeclared ones.
    expect(issues(document({ visibilty: "unlisted" }))).toContain("visibilty");
  });
});
describe("the section vocabulary", () => {
  it("declares exactly the sixteen supported types", () => {
    expect(PAGE_SECTION_TYPES).toEqual([
      "hero",
      "prose",
      "media",
      "gallery",
      "actions",
      "callout",
      "cards",
      "features",
      "columns",
      "steps",
      "stats",
      "quote",
      "table",
      "faq",
      "list",
      "divider",
    ]);
  });

  it("accepts every declared type (and no other)", () => {
    const samples: Record<string, Record<string, unknown>> = {
      hero: { lede: "Intro words." },
      prose: { body: "Body words." },
      media: { image: { src: "/assets/photo.png", alt: "A photo" } },
      gallery: { items: [{ image: { src: "/assets/a.png", alt: "A" } }] },
      actions: { actions: [{ label: "Contact", href: "/contact" }] },
      callout: { body: "Note words." },
      cards: { items: [{ title: "Card" }] },
      features: { items: [{ title: "Feature" }] },
      columns: { items: [{ title: "You", items: ["One"] }, { title: "Us", items: ["Two"] }] },
      steps: { items: [{ title: "First" }] },
      stats: { items: [{ value: "12", label: "Projects" }] },
      quote: { body: "A quotation." },
      table: { columns: ["Plan", "Price"], rows: [["Starter", "500"]] },
      faq: { items: [{ question: "Is it?", answer: "It is." }] },
      list: { items: ["One", "Two"] },
      divider: {},
    };

    for (const [type, section] of Object.entries(samples)) {
      const result = pageDocumentSchema.safeParse(document({ sections: [{ type, ...section }] }));
      expect(
        result.success,
        `${type}: ${result.success ? "" : describePageDocumentIssues(result.error)}`,
      ).toBe(true);
    }
    expect(Object.keys(samples).sort()).toEqual([...PAGE_SECTION_TYPES].sort());

    const unknown = issues(document({ sections: [{ type: "offerings" }] }));
    // The path points at the section, and the message lists what IS supported. (The
    // reader, `@/adapters/content/json-page`, additionally names the offending value —
    // see the reader's own test: the schema does not echo input values.)
    expect(unknown).toContain("sections[0].type");
    expect(unknown).toContain("hero");
  });

  it("names the offending section index and property for a schema-invalid section", () => {
    const message = issues(
      document({ sections: [{ type: "prose", body: "ok" }, { type: "prose" }, { type: "cards" }] }),
    );
    expect(message).toContain("sections[1].body");
    expect(message).toContain("sections[2].items");
  });

  it("refuses an unknown property inside a section", () => {
    const message = issues(
      document({ sections: [{ type: "prose", body: "ok", class: "text-xl" }] }),
    );
    expect(message).toContain("class");
  });

  it("refuses an unknown property inside an item, and a section inside a section", () => {
    const itemIssue = issues(
      document({ sections: [{ type: "cards", items: [{ title: "T", style: "big" }] }] }),
    );
    expect(itemIssue).toContain("sections[0].items[0]");
    expect(itemIssue).toContain("style");
    // Nesting is bounded: a card is not a page.
    expect(
      issues(document({ sections: [{ type: "cards", items: [{ title: "T", sections: [] }] }] })),
    ).toContain("sections");
    expect(
      issues(
        document({
          sections: [
            {
              type: "columns",
              items: [
                { title: "A", body: "x", sections: [{ type: "divider" }] },
                { title: "B", body: "y" },
              ],
            },
          ],
        }),
      ),
    ).toContain("sections");
  });

  it("bounds items per section and rejects ragged table rows", () => {
    const many = Array.from({ length: PAGE_MAX_ITEMS + 1 }, (_, index) => ({
      title: `Card ${index}`,
    }));
    expect(issues(document({ sections: [{ type: "cards", items: many }] }))).toContain("items");
    expect(
      issues(document({ sections: [{ type: "table", columns: ["A", "B"], rows: [["only-one"]] }] })),
    ).toContain("rows");
  });
});


describe("the finite presentation vocabulary", () => {
  it("declares only token-backed options", () => {
    expect(PAGE_SECTION_SURFACES).toEqual(["plain", "muted", "bordered"]);
    expect(PAGE_ITEM_COLUMNS).toEqual([2, 3, 4]);
    expect(PAGE_CALLOUT_TONES).toEqual(["note", "info", "warning"]);
    expect(PAGE_MEDIA_POSITIONS).toEqual(["start", "end"]);
    expect(PAGE_ACTION_VARIANTS).toEqual(["primary", "secondary", "link"]);
  });

  it("accepts each option, and refuses anything that is not one", () => {
    for (const surface of PAGE_SECTION_SURFACES) {
      expect(
        pageDocumentSchema.safeParse(document({ sections: [{ type: "prose", body: "x", surface }] }))
          .success,
        surface,
      ).toBe(true);
    }
    for (const columns of PAGE_ITEM_COLUMNS) {
      expect(
        pageDocumentSchema.safeParse(
          document({ sections: [{ type: "cards", items: [{ title: "T" }], columns }] }),
        ).success,
        String(columns),
      ).toBe(true);
    }
    for (const tone of PAGE_CALLOUT_TONES) {
      expect(
        pageDocumentSchema.safeParse(document({ sections: [{ type: "callout", body: "x", tone }] }))
          .success,
        tone,
      ).toBe(true);
    }
    for (const position of PAGE_MEDIA_POSITIONS) {
      expect(
        pageDocumentSchema.safeParse(
          document({ sections: [{ type: "media", image: { src: "/assets/a.png", alt: "A" }, position }] }),
        ).success,
        position,
      ).toBe(true);
    }
    for (const variant of PAGE_ACTION_VARIANTS) {
      expect(
        pageDocumentSchema.safeParse(
          document({
            sections: [{ type: "actions", actions: [{ label: "Go", href: "/x", variant }] }],
          }),
        ).success,
        variant,
      ).toBe(true);
    }
  });

  it("refuses arbitrary classes, styles, pixel values and unknown options", () => {
    const refusals: readonly [string, unknown][] = [
      ["a class name", { type: "prose", body: "x", className: "bg-red-500" }],
      ["an inline style", { type: "prose", body: "x", style: { color: "red" } }],
      ["a pixel width", { type: "prose", body: "x", width: "720px" }],
      ["an unknown surface", { type: "prose", body: "x", surface: "gradient" }],
      ["too many columns", { type: "cards", items: [{ title: "T" }], columns: 6 }],
      ["an unknown tone", { type: "callout", body: "x", tone: "danger" }],
      [
        "an unknown media position",
        { type: "media", image: { src: "/assets/a.png", alt: "A" }, position: "left" },
      ],
      [
        "an unknown action variant",
        { type: "actions", actions: [{ label: "Go", href: "/x", variant: "danger" }] },
      ],
      [
        "an unknown column ratio",
        {
          type: "columns",
          ratio: "golden",
          items: [{ title: "A", items: ["x"] }, { title: "B", items: ["y"] }],
        },
      ],
      ["a script key", { type: "prose", body: "x", script: "alert(1)" }],
    ];
    for (const [label, section] of refusals) {
      expect(issues(document({ sections: [section] })), label).toContain("sections[0]");
    }
  });
});

describe("the accessibility contract", () => {
  it("declares one unambiguous heading outline", () => {
    expect(PAGE_HEADING_LEVELS).toEqual({ page: 1, section: 2, item: 3 });
  });

  it("refuses a heading level chosen by the author", () => {
    // Level is a property of WHERE a heading lives, never of author taste.
    expect(issues(document({ sections: [{ type: "prose", body: "x", level: 1 }] }))).toContain("level");
    expect(
      issues(document({ sections: [{ type: "prose", body: "x", headingLevel: 2 }] })),
    ).toContain("headingLevel");
  });

  it("makes an undescribed content image unrepresentable", () => {
    const missingAlt = issues(
      document({ sections: [{ type: "media", image: { src: "/assets/a.png" } }] }),
    );
    expect(missingAlt).toContain("alt");

    const both = issues(
      document({
        sections: [
          { type: "media", image: { src: "/assets/a.png", alt: "Described", decorative: true } },
        ],
      }),
    );
    expect(both).toContain("decorative");

    expect(
      pageDocumentSchema.safeParse(

        document({
          sections: [{ type: "media", image: { src: "/assets/a.png", alt: "Described" } }],
        }),
      ).success,
    ).toBe(true);
    expect(
      pageDocumentSchema.safeParse(
        document({
          sections: [{ type: "media", image: { src: "/assets/a.png", decorative: true } }],
        }),
      ).success,
    ).toBe(true);
  });

  it("requires the accessible pieces of every interactive or structured section", () => {
    // An action without a label has no accessible name.
    expect(
      issues(document({ sections: [{ type: "actions", actions: [{ href: "/x" }] }] })),
    ).toContain("label");
    // A disclosure needs its question and its answer.
    expect(issues(document({ sections: [{ type: "faq", items: [{ question: "Q" }] }] }))).toContain(
      "answer",
    );
    // A table needs its column headings (they become the th cells).
    expect(
      issues(document({ sections: [{ type: "table", columns: [], rows: [["x"]] }] })),
    ).toContain("columns");
    // An image inside a gallery follows the same rule as a standalone one.
    expect(
      issues(
        document({ sections: [{ type: "gallery", items: [{ image: { src: "/assets/a.png" } }] }] }),
      ),
    ).toContain("alt");
  });
});

describe("actions, destinations and Markdown fields", () => {
  it("accepts exactly one destination form and refuses both or neither", () => {
    const action = (value: unknown) => ({ sections: [{ type: "actions", actions: [value] }] });
    expect(pageDocumentSchema.safeParse(document(action({ label: "A", href: "/x" }))).success).toBe(
      true,
    );
    expect(pageDocumentSchema.safeParse(document(action({ label: "A", route: "services" }))).success).toBe(
      true,
    );
    expect(issues(document(action({ label: "A" })))).toContain("href");
    expect(issues(document(action({ label: "A", href: "/x", route: "services" })))).toContain("exactly one");
  });

  it("reuses the platform safe-destination policy", () => {
    const href = (value: string) => ({ sections: [{ type: "actions", actions: [{ label: "A", href: value }] }] });
    for (const allowed of ["/contact", "#section", "https://example.com", "mailto:a@b.example", "tel:+15551234"]) {
      expect(pageDocumentSchema.safeParse(document(href(allowed))).success, allowed).toBe(true);
    }
    for (const refused of [
      "javascript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "//evil.example/path",
      "file:///etc/passwd",
    ]) {
      expect(pageDocumentSchema.safeParse(document(href(refused))).success, refused).toBe(false);
    }
  });

  it("requires a route target to be a real page route path", () => {
    const route = (value: string) => ({ sections: [{ type: "actions", actions: [{ label: "A", route: value }] }] });
    for (const allowed of ["services", "services/web-design", "legal/privacy"]) {
      expect(pageDocumentSchema.safeParse(document(route(allowed))).success, allowed).toBe(true);
    }
    for (const refused of ["../escape", "/services", "services/", "Not A Slug", "services//x"]) {
      expect(pageDocumentSchema.safeParse(document(route(refused))).success, refused).toBe(false);
    }
  });

  it("validates an asset reference's shape, and keeps Markdown fields declarable", () => {
    const src = (value: string) => ({
      sections: [{ type: "media", image: { src: value, alt: "A" } }],
    });
    expect(pageDocumentSchema.safeParse(document(src("/assets/photo.png"))).success).toBe(true);
    expect(pageDocumentSchema.safeParse(document(src("https://cdn.example/photo.png"))).success).toBe(
      true,
    );
    for (const refused of ["photo.png", "javascript:alert(1)", "//cdn.example/x.png"]) {
      expect(pageDocumentSchema.safeParse(document(src(refused))).success, refused).toBe(false);
    }
    expect(PAGE_MARKDOWN_FIELDS).toContain("prose.body");
    expect(PAGE_MARKDOWN_FIELDS).toContain("faq.items[].answer");
  });

  it("accepts Markdown (including raw HTML) as TEXT — inertness is the renderer's job", () => {
    const prose = parse(document({ sections: [{ type: "prose", body: "**bold** <script>x</script>" }] }));
    expect(prose.sections[0]).toMatchObject({ type: "prose", body: "**bold** <script>x</script>" });
  });

  it("formats an issue path the way an author reads it", () => {
    expect(formatPageDocumentIssuePath([])).toBe("(document)");
    expect(formatPageDocumentIssuePath(["sections", 2, "items", 0, "title"])).toBe(
      "sections[2].items[0].title",
    );
  });
});

/** Parse a document, failing the test with the schema's own message when it is refused. */
function parse(value: unknown) {
  const result = pageDocumentSchema.safeParse(value);
  if (!result.success) throw new Error(describePageDocumentIssues(result.error));
  return result.data;
}

/**
 * TEMPLATE-PV-A1 — THE RESERVED ROOT DOCUMENT MAY NOT BE UNLISTED
 * ==============================================================
 *
 * The rule is stated ONCE, purely, in `reservedHomeVisibilityIssue`: given a VALIDATED document and the ROUTE PATH
 * it is authored at, it returns the refusal sentence or `null`. The route path is an argument precisely because
 * the rule is about the document's URL, which the document alone cannot know.
 *
 * `@/adapters/content/json-page` enforces it (naming the file), and `tests/unit/unlisted-visibility-contract.test.ts`
 * proves the refusal through the composition that actually resolves a page — default locale and fallback alike.
 */
describe("the reserved root document's visibility", () => {
  const unlisted = pageDocumentSchema.parse(document({ visibility: "unlisted" }));
  const declaredPublic = pageDocumentSchema.parse(document({ visibility: "public" }));
  const silent = pageDocumentSchema.parse(document());

  it("refuses an unlisted document at the reserved home route, naming the property and the reason", () => {
    const issue = reservedHomeVisibilityIssue(unlisted, HOME_CONTENT_SLUG);
    expect(issue).not.toBeNull();
    expect(issue).toContain("visibility");
    expect(issue).toContain("unlisted");
    expect(issue).toContain(HOME_CONTENT_SLUG);
    // The reason is the URL: that document is served by the locale root, which is always published.
    expect(issue).toContain("locale root");
  });

  it("accepts a public home and a home that declares nothing — the default is untouched", () => {
    expect(reservedHomeVisibilityIssue(declaredPublic, HOME_CONTENT_SLUG)).toBeNull();
    expect(reservedHomeVisibilityIssue(silent, HOME_CONTENT_SLUG)).toBeNull();
  });

  it("is NARROW: an unlisted document at any other route is none of its business", () => {
    // The rule is about the reserved route, never about the WORD `home`: a page merely NAMED `home` inside a
    // folder has its own URL and may be unlisted freely, and `""` is a request's root PATH rather than a
    // document's route path — the reserved document's own route path is `home`, which is what this rule keys on.
    for (const routePath of ["offerings/home", "home-page", "about", "north", "north/quote", ""]) {
      expect(reservedHomeVisibilityIssue(unlisted, routePath), routePath).toBeNull();
    }
    expect(HOME_CONTENT_SLUG).toBe("home");
  });
});

describe("application-link references (A8 Phase F)", () => {
  it("accepts the optional declaration and a link action without moving the envelope version", () => {
    const result = pageDocumentSchema.safeParse(
      document({
        links: { contact: { reference: "applicationLink", key: "public-contact-email" } },
        sections: [{ type: "actions", actions: [{ label: "Email us", link: "contact" }] }],
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.schemaVersion).toBe(PAGE_DOCUMENT_SCHEMA_VERSION);
  });

  it("refuses the reserved marker in a destination position, so resolution cannot be bypassed", () => {
    expect(
      issues(document({ sections: [{ type: "actions", actions: [{ label: "A", href: "#link:contact" }] }] })),
    ).toContain("reserved");
  });
});
