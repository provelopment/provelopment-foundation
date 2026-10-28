import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { renderSafeMarkdown, reservedLinkIds } from "@/adapters/markdown/safe-markdown";
import {
  describePageDocumentIssues,
  pageDocumentSchema,
  pageMarkdownFields,
  parsePageLinkMarker,
  resolvePageLink,
  type PageLinkReference,
} from "@/core/page-document";

/**
 * APPLICATION-LINK REFERENCES (WEB1-CONNECT-WWW-PUBLIC-MAILTO-A8 PHASE F)
 * ======================================================================
 *
 * The generic capability, proven against the design's condition table: a declaration is validated,
 * a marker is found through the parser's own tokens, exactly one destination form is accepted, and the
 * only href that can ever reach an anchor is one a resolver answered AND the existing classifier
 * accepted. Nothing here names a product, an address or a scheme — a `key` is opaque, and these tests
 * keep it that way so the capability cannot quietly become somebody's integration.
 */

/** A complete, valid document that declares one application link and uses it twice. */
function documentWithLink(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    title: "Example page",
    links: { "quotation-email": { reference: "applicationLink", key: "public-contact-email" } },
    sections: [
      { type: "prose", body: "Write to [us](#link:quotation-email) any time." },
      { type: "actions", actions: [{ label: "Ask for a quotation", link: "quotation-email" }] },
    ],
    ...overrides,
  };
}

const issues = (value: unknown): string => {
  const result = pageDocumentSchema.safeParse(value);
  if (result.success) throw new Error("expected the document to be refused");
  return describePageDocumentIssues(result.error);
};

/** A resolver that answers from a table — the host's half of the contract, in a test. */
const answers =
  (table: Readonly<Record<string, string | null>>) =>
  (reference: PageLinkReference): string | null =>
    table[reference.key] ?? null;

describe("the application-link declaration vocabulary", () => {
  it("accepts a document that declares a link and uses it in prose and in an action", () => {
    expect(pageDocumentSchema.safeParse(documentWithLink()).success).toBe(true);
  });

  it("stays additive: a document without declarations is valid, and the envelope stays version 1", () => {
    expect(pageDocumentSchema.safeParse({ schemaVersion: 1, title: "Page", sections: [] }).success).toBe(true);
    const parsed = pageDocumentSchema.parse(documentWithLink());
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.links).toEqual({
      "quotation-email": { reference: "applicationLink", key: "public-contact-email" },
    });
  });

  it("refuses a resolution kind this platform does not declare, instead of guessing at it", () => {
    expect(
      issues(documentWithLink({ links: { contact: { reference: "publicContact", key: "x" } } })),
    ).toContain("links.contact.reference");
  });

  it("refuses an unknown property inside a declaration", () => {
    expect(
      issues(documentWithLink({ links: { contact: { reference: "applicationLink", key: "x", href: "/x" } } })),
    ).toContain("links.contact");
  });

  it("refuses a declaration id outside the one grammar the marker also uses", () => {
    for (const id of ["", "UPPER", "a_b", "a--b", "a".repeat(65)]) {
      expect(
        issues(documentWithLink({ links: { [id]: { reference: "applicationLink", key: "k" } } })),
        id,
      ).toContain("links");
    }
  });

  it("refuses an application key outside its shape grammar", () => {
    for (const key of ["", "UPPER", "a b", "a..b", "a".repeat(97)]) {
      expect(
        issues(documentWithLink({ links: { contact: { reference: "applicationLink", key } } })),
        key,
      ).toContain("links.contact.key");
    }
  });

  it("bounds how many links one document may declare", () => {
    const many = Object.fromEntries(
      Array.from({ length: 33 }, (_, index) => [`link-${index}`, { reference: "applicationLink", key: "k" }]),
    );
    expect(issues(documentWithLink({ links: many }))).toContain("links");
  });

  it("keeps exactly one destination form per action: href, route or link — never two, never none", () => {
    const withAction = (action: Record<string, unknown>) =>
      documentWithLink({ sections: [{ type: "actions", actions: [action] }] });

    expect(pageDocumentSchema.safeParse(withAction({ label: "A", link: "quotation-email" })).success).toBe(true);
    expect(pageDocumentSchema.safeParse(withAction({ label: "A", href: "/contact" })).success).toBe(true);
    expect(pageDocumentSchema.safeParse(withAction({ label: "A", route: "services" })).success).toBe(true);

    expect(issues(withAction({ label: "A" }))).toContain("exactly one of");
    expect(issues(withAction({ label: "A", href: "/contact", link: "quotation-email" }))).toContain("exactly one of");
    expect(issues(withAction({ label: "A", route: "services", link: "quotation-email" }))).toContain("exactly one of");
  });

  it("refuses the reserved marker as a destination, so an authored href cannot bypass resolution", () => {
    const action = documentWithLink({
      sections: [{ type: "actions", actions: [{ label: "A", href: "#link:quotation-email" }] }],
    });
    expect(issues(action)).toContain("reserved");

    const list = documentWithLink({
      sections: [{ type: "list", items: [{ label: "A", href: "#link:quotation-email" }] }],
    });
    expect(issues(list)).toContain("reserved");
  });

  it("reads a marker only when it matches the exact grammar", () => {
    expect(parsePageLinkMarker("#link:quotation-email")).toBe("quotation-email");
    const notMarkers = [
      "#link:",
      "#LINK:x",
      "#link:a_b",
      "#link:a--b",
      `#link:${"a".repeat(65)}`,
      "#anchor",
      "/contact",
      "",
    ];
    for (const value of notMarkers) expect(parsePageLinkMarker(value), value).toBeNull();
  });
});

describe("resolvePageLink — a pure lookup with no way to invent a destination", () => {
  const links = {
    "quotation-email": { reference: "applicationLink", key: "public-contact-email" },
  } as const;
  const reference = links["quotation-email"];

  it("answers the resolver's href when the declaration exists", () => {
    expect(
      resolvePageLink(links, "quotation-email", answers({ "public-contact-email": "mailto:hello@example.test" })),
    ).toBe("mailto:hello@example.test");
  });

  it("refuses an id the document does not declare", () => {
    expect(
      resolvePageLink(links, "other", answers({ "public-contact-email": "mailto:hello@example.test" })),
    ).toBeNull();
  });

  it("refuses when no resolver was supplied at all (a host that wired nothing)", () => {
    expect(resolvePageLink(links, "quotation-email", undefined)).toBeNull();
  });

  it("refuses when the resolver answers nothing", () => {
    expect(resolvePageLink(links, "quotation-email", () => null)).toBeNull();
  });

  it("refuses when the resolver throws, instead of failing the page render", () => {
    expect(
      resolvePageLink(links, "quotation-email", () => {
        throw new Error("host failure");
      }),
    ).toBeNull();
  });

  it("refuses an answer the existing classifier rejects, including an executable scheme", () => {
    for (const answer of ["javascript:alert(1)", "data:text/html,<script>", "vbscript:x", " //evil.test"]) {
      expect(resolvePageLink(links, "quotation-email", () => answer), answer).toBeNull();
    }
  });

  it("refuses a chained answer — a resolver may not answer with another marker", () => {
    expect(resolvePageLink(links, "quotation-email", () => "#link:another")).toBeNull();
  });

  it("hands the resolver the declared reference, never the id alone", () => {
    const seen: PageLinkReference[] = [];
    resolvePageLink(links, "quotation-email", (value) => {
      seen.push(value);
      return null;
    });
    expect(seen).toEqual([reference]);
  });
});

describe("rendering a marker — words without an authorized destination", () => {
  const MARKER = "Write to [us](#link:quotation-email) any time.";
  const resolve = (href: string | null) => () => href;

  it("emits an anchor when the host answers with a classified href", () => {
    const html = renderSafeMarkdown(MARKER, resolve("mailto:hello@example.test"));
    expect(html).toContain('<a href="mailto:hello@example.test">us</a>');
    expect(html).not.toContain("#link:");
  });

  it("keeps the author's words and no anchor when the host answers nothing", () => {
    const html = renderSafeMarkdown(MARKER, resolve(null));
    expect(html).toContain("us");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("#link:");
  });

  it("keeps the words when no resolver was supplied — a Markdown-only page declares nothing", () => {
    const html = renderSafeMarkdown(MARKER);
    expect(html).toContain("us");
    expect(html).not.toContain("<a");
  });

  it("refuses an unsafe or chained answer and never emits the marker as an href", () => {
    for (const answer of ["javascript:alert(1)", "#link:other", "data:text/html,x"]) {
      const html = renderSafeMarkdown(MARKER, resolve(answer));
      expect(html, answer).not.toContain("<a");
      expect(html, answer).not.toContain("#link:");
    }
  });

  it("treats a malformed marker as the ordinary fragment it is, and never resolves it", () => {
    let asked = 0;
    const html = renderSafeMarkdown("[x](#LINK:y) [z](#link:a_b)", () => {
      asked += 1;
      return "mailto:no@example.test";
    });
    expect(html).toContain('href="#LINK:y"');
    expect(html).toContain('href="#link:a_b"');
    expect(asked).toBe(0);
  });

  it("leaves every ordinary destination byte-identical whether or not a resolver is present", () => {
    const ordinary = [
      "[a](/contact)",
      "[b](https://example.test/x)",
      "[c](mailto:hi@example.test)",
      "[d](tel:+441234567890)",
      "[e](#anchor)",
      "[f](relative/path)",
      "![i](/assets/photo.placeholder)",
    ].join(" ");
    expect(renderSafeMarkdown(ordinary, () => "mailto:unused@example.test")).toBe(
      renderSafeMarkdown(ordinary),
    );
  });
});

describe("token-derived marker discovery", () => {
  it("finds markers in emphasis, lists, tables, quotes and nested labels", () => {
    const markdown = [
      "**bold [a](#link:one)**",
      "",
      "- item [b](#link:two)",
      "",
      "| h |",
      "| - |",
      "| [c](#link:three) |",
      "",
      "> quoted [d](#link:four)",
    ].join("\n");
    expect([...reservedLinkIds(markdown)].sort()).toEqual(["four", "one", "three", "two"]);
  });

  it("reports an id once however often it appears", () => {
    expect(reservedLinkIds("[a](#link:x) and [b](#link:x)")).toEqual(["x"]);
  });

  it("is not a text scan: prose that merely mentions the marker is not discovered", () => {
    expect(reservedLinkIds("Write #link:quotation-email in a link destination, not in prose.")).toEqual([]);
  });

  it("discovers nothing in text that links nowhere", () => {
    expect(reservedLinkIds("ordinary [link](/contact) text")).toEqual([]);
  });

  it("reaches every declared Markdown field of a validated document", () => {
    const document = pageDocumentSchema.parse({
      schemaVersion: 1,
      title: "Page",
      links: { declared: { reference: "applicationLink", key: "k" } },
      sections: [
        { type: "hero", lede: "[x](#link:hero-lede)" },
        { type: "prose", body: "[y](#link:prose-body)" },
        { type: "cards", items: [{ title: "Card", body: "[z](#link:card-body)" }] },
      ],
    });
    const found = pageMarkdownFields(document)
      .flatMap((field) => reservedLinkIds(field.text))
      .sort();
    expect(found).toEqual(["card-body", "hero-lede", "prose-body"]);
  });
});

describe("request-local resolution", () => {
  it("threads the resolver per render: two renders with different resolvers never share an answer", () => {
    const markdown = "[us](#link:contact)";
    const first = renderSafeMarkdown(markdown, () => "mailto:first@example.test");
    const second = renderSafeMarkdown(markdown, () => "mailto:second@example.test");
    expect(first).toContain("first@example.test");
    expect(second).toContain("second@example.test");
    expect(first).not.toContain("second@example.test");
    expect(second).not.toContain("first@example.test");
  });

  it("survives a RE-ENTRANT render started from inside a resolver", () => {
    // The inner render runs while the outer one is resolving. The inner answer is HTML, not an href, so
    // the outer marker must fall back to words — proving both that the inner render is independent and
    // that an unusable answer can never reach an href.
    const outer = renderSafeMarkdown("[them](#link:contact)", () =>
      renderSafeMarkdown("[us](#link:contact)", () => "mailto:inner@example.test"),
    );
    expect(outer).toContain("them");
    expect(outer).not.toContain("<a");
    expect(outer).not.toContain("#link:");
  });

  it("holds no module-level resolver state in the adapter or the core contract", () => {
    for (const file of ["src/adapters/markdown/safe-markdown.ts", "src/core/page-document.ts"]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      // Module scope is column 0: a `let` inside a function is local state, which is exactly right.
      expect(source, file).not.toMatch(/^(export )?let /m);
      expect(source, file).not.toMatch(/^(export )?(const|let) .*= new (Map|WeakMap)\(/m);
    }
  });

  it("keeps product vocabulary out of the generic capability", () => {
    for (const file of [
      "src/core/page-document.ts",
      "src/adapters/markdown/safe-markdown.ts",
      "src/adapters/content/json-page.ts",
    ]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      for (const forbidden of ["publicContact", "methodRef", "Connect", "Mailbox"]) {
        expect(source, `${file} must not name ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
