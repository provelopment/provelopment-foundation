import { describe, expect, it } from "vitest";

import { renderSafeMarkdown } from "@/adapters/markdown/safe-markdown";
import { isHeadingAnchor } from "@/core/heading-anchor";
import {
  MARKDOWN_ALLOWED_SCHEMES,
  MARKDOWN_ALLOWED_TAGS,
  MARKDOWN_FORBIDDEN_ATTRIBUTES,
  MARKDOWN_FORBIDDEN_ELEMENTS,
  MARKDOWN_HEADING_LEVEL_OFFSET,
  MARKDOWN_HEADING_TAGS,
  MARKDOWN_MAX_HEADING_LEVEL,
} from "@/core/markdown-policy";

/**
 * THE SAFE MARKDOWN PRIMITIVE (FOUNDATION-PAGES-A1).
 *
 * The Markdown authoring mode is genuinely safe: ordinary Markdown renders, and
 * author-supplied raw HTML can never become active markup. The two policy layers
 * (`@/core/markdown-policy`, `@/core/safe-url`) are asserted through the real
 * renderer here, so a regression in either is caught.
 */
const tagsIn = (html: string): string[] =>
  [...html.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9]*)/g)].map((match) => match[1].toLowerCase());

const RICH_MARKDOWN = [
  "# Title",
  "",
  "A paragraph with **strong**, *emphasis*, `code`, a [link](/about) and an ![image](/img.png).",
  "",
  "- one",
  "- two",
  "",
  "1. first",
  "",
  "> A quote.",
  "",
  "| a | b |",
  "| - | - |",
  "| 1 | 2 |",
  "",
  "```js",
  "const code = true;",
  "```",
  "",
  "---",
  "",
].join("\n");

const HOSTILE_MARKDOWN = [
  "<script>alert(1)</script>",
  "",
  '<div onclick="steal()">click</div>',
  "",
  '<iframe src="//evil.example"></iframe>',
  "",
  "<style>body{display:none}</style>",
  "",
  '<form action="/x"><input name="a"></form>',
  "",
  '<object data="x"></object>',
  "",
  '<img src=x onerror="alert(1)">',
  "",
  "[click me](javascript:alert(1))",
  "",
  "![alt text](data:text/html;base64,PHNjcmlwdD4=)",
  "",
  "[encode me](jav&#x61;script:alert(1))",
  "",
].join("\n");

describe("the safe Markdown renderer", () => {
  it("renders ordinary Markdown as ordinary Markdown", () => {
    const html = renderSafeMarkdown(RICH_MARKDOWN);

    expect(html).toContain('<h2 id="title">Title</h2>');
    expect(html).toContain("<strong>strong</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain('<a href="/about">link</a>');
    expect(html).toMatch(/<img src="\/img\.png" alt="image" ?\/?>/);
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<table>");
    expect(html).toMatch(/<hr ?\/?>/);
    expect(html).toContain('<code class="language-js">');
  });

  it("turns author-supplied raw HTML into INERT TEXT", () => {
    const html = renderSafeMarkdown(HOSTILE_MARKDOWN);

    for (const forbidden of MARKDOWN_FORBIDDEN_ELEMENTS) {
      expect(html.toLowerCase(), forbidden).not.toContain(`<${forbidden}`);
    }
    // The author's words are still there — as text, never as markup.
    expect(html).toMatch(/script/);
    expect(html).not.toMatch(/<script/i);
  });

  it("carries no event handler and no inline style anywhere", () => {
    const html = renderSafeMarkdown(HOSTILE_MARKDOWN);

    // Assert on the MARKUP, not on the text: the author's escaped HTML legitimately
    // contains the words `onclick=` as inert text, so the check must look inside
    // real tags only.
    const attributes = [
      ...html.matchAll(/<[a-zA-Z][^>]*>/g),
    ].flatMap((tag) => [...tag[0].matchAll(/\s([a-zA-Z-:]+)\s*=/g)].map((match) => match[1].toLowerCase()));

    for (const attribute of attributes) {
      expect(attribute, `unexpected attribute ${attribute}=`).not.toMatch(/^on/i);
      expect(attribute, `unexpected attribute ${attribute}=`).not.toBe("style");
      expect(MARKDOWN_FORBIDDEN_ATTRIBUTES, `forbidden attribute ${attribute}=`).not.toContain(attribute);
    }
    // Every attribute that DOES appear is one the policy allows.
    expect(new Set(attributes)).toEqual(
      new Set(["href", "title", "src", "alt", "class", "id"].filter((name) => attributes.includes(name))),
    );
  });

  it("drops an unsafe destination but keeps the author's words", () => {
    const html = renderSafeMarkdown(HOSTILE_MARKDOWN);

    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    // The link's words survive without a destination; the image becomes its alt text.
    expect(html).toContain("click me");
    expect(html).toContain("alt text");
    expect(html).not.toContain("<img src");
  });

  it("emits ONLY allowlisted elements", () => {
    const html = renderSafeMarkdown(`${RICH_MARKDOWN}\n${HOSTILE_MARKDOWN}`);

    const tags = tagsIn(html);
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      expect(MARKDOWN_ALLOWED_TAGS, `unexpected element <${tag}>`).toContain(tag);
    }
  });

  it("shape-checks the one class a page may set", () => {
    expect(renderSafeMarkdown("```\nplain\n```\n")).toContain("<pre><code>");
    expect(renderSafeMarkdown('```"><script>alert(1)</script>\nx\n```\n')).not.toMatch(/<script/i);
  });

/**
 * THE DOCUMENTED CAPABILITY MATRIX (FOUNDATION-PAGES-A1D).
 *
 * The author-facing guide promises a specific set of Markdown features. Each is
 * asserted against the REAL renderer here, so the documentation cannot drift from
 * behaviour — a feature the parser does not support is never documented, and a
 * feature that stops rendering fails this suite.
 */
describe("the documented Markdown capability matrix", () => {
  const cases: readonly [string, string, string][] = [
    ["headings", "# One\n\n## Two\n", '<h2 id="one">One</h2>'],
    ["paragraphs", "A paragraph.\n", "<p>A paragraph.</p>"],
    ["bold", "**bold**\n", "<strong>bold</strong>"],
    ["italic", "*italic*\n", "<em>italic</em>"],
    ["strikethrough", "~~gone~~\n", "<del>gone</del>"],
    ["unordered lists", "- one\n- two\n", "<ul>"],
    ["ordered lists", "1. one\n2. two\n", "<ol>"],
    ["nested lists", "- one\n  - nested\n", "<ul>\n<li>one<ul>"],
    ["blockquotes", "> quoted\n", "<blockquote>"],
    ["links", "[label](/about)\n", '<a href="/about">label</a>'],
    ["images", "![alt](/photo.png)\n", '<img src="/photo.png" alt="alt"'],
    ["inline code", "`code`\n", "<code>code</code>"],
    ["fenced code blocks", "```js\nconst x = 1;\n```\n", '<code class="language-js">'],
    ["horizontal rules", "a\n\n---\n", "<hr"],
    ["autolinks", "Visit https://example.com today\n", '<a href="https://example.com"'],
    ["tables", "| a | b |\n| - | - |\n| 1 | 2 |\n", "<table>"],
  ];

  for (const [name, markdown, expected] of cases) {
    it(`renders ${name}`, () => {
      expect(renderSafeMarkdown(markdown)).toContain(expected);
    });
  }

  it("renders a table with real table semantics, and only allowlisted cells", () => {
    const html = renderSafeMarkdown("| Header A | Header B |\n| --- | --- |\n| Cell 1 | Cell 2 |\n");

    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>Header A</th>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<td>Cell 1</td>");
    for (const tag of tagsIn(html)) {
      expect(MARKDOWN_ALLOWED_TAGS, `unexpected element <${tag}>`).toContain(tag);
    }
  });

  it("keeps a table's cells inert even when they contain markup and destinations", () => {
    const html = renderSafeMarkdown(
      "| a | b |\n| - | - |\n| <script>alert(1)</script> | [x](javascript:alert(1)) |\n",
    );

    expect(html).toContain("<td>");
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain("javascript:");
    expect(html).toContain("x");
  });
});

/**
 * THE PAGE TITLE IS THE ONLY H1 (FOUNDATION-PAGES-H1).
 *
 * A rendered authored page has exactly one level-1 heading — its page title — so a heading
 * written INSIDE a Markdown body is rendered RELATIVE to it, one level below the level the
 * author typed. Ordinary authoring therefore stays ordinary: `# Services` is still how you
 * write a section, and nobody has to remember to start at `##` or to delete a heading.
 *
 * These assertions are the written contract `content/pages/markdown/README.md` gives authors,
 * so the guide cannot drift from the renderer.
 */
describe("authored headings are relative to the page title", () => {
  /** The documented mapping, as data: authored depth → rendered level. */
  const renderedLevelFor = (authoredDepth: number) =>
    Math.min(authoredDepth + MARKDOWN_HEADING_LEVEL_OFFSET, MARKDOWN_MAX_HEADING_LEVEL);

  it.each([1, 2, 3, 4, 5, 6])("renders an authored level %i heading one level lower", (depth) => {
    const html = renderSafeMarkdown(`${"#".repeat(depth)} Opening hours\n`);

    expect(html).toContain(`<h${renderedLevelFor(depth)} id="opening-hours">Opening hours</h${renderedLevelFor(depth)}>`);
    // …and never the level the author typed: `#` must not stay level 1.
    if (depth === 1) expect(html).not.toContain("<h1");
  });

  it("caps at the deepest level HTML has: `#####` and `######` both render h6", () => {
    expect(renderSafeMarkdown("##### Fine print\n")).toContain('<h6 id="fine-print">');
    expect(renderSafeMarkdown("###### Footnotes\n")).toContain('<h6 id="footnotes">');
    // No `h7` (or any other invented element) can be produced.
    expect(renderSafeMarkdown("####### Seven\n")).not.toMatch(/<h7/);
    expect(tagsIn(renderSafeMarkdown("####### Seven\n")).every((tag) => MARKDOWN_ALLOWED_TAGS.includes(tag))).toBe(true);
  });

  it("produces NO authored h1 anywhere in a real page's Markdown", () => {
    const html = renderSafeMarkdown(`${RICH_MARKDOWN}\n${HOSTILE_MARKDOWN}`);
    const allLevels = Array.from({ length: 6 }, (_, index) => `${"#".repeat(index + 1)} Level ${index + 1}`).join("\n\n");

    // Neither the ordinary fixture (which opens with `# Title`) nor a document that uses
    // every level may emit a level-1 heading: that belongs to the page title alone.
    expect(html).not.toMatch(/<h1[\s>]/i);
    expect(renderSafeMarkdown(allLevels)).not.toMatch(/<h1[\s>]/i);
    // The element the page CANNOT produce is also absent from the allowlist, so layer 2
    // would drop it even if layer 1 were wrong.
    expect(MARKDOWN_ALLOWED_TAGS).not.toContain("h1");
    expect(MARKDOWN_HEADING_TAGS).toEqual(["h2", "h3", "h4", "h5", "h6"]);
  });

  it("keeps the author's fragment target working after the shift", () => {
    const html = renderSafeMarkdown("See [jump](#opening-hours) below.\n\n# Opening Hours\n");

    expect(html).toContain('<h2 id="opening-hours">Opening Hours</h2>');
    expect(html).toContain('<a href="#opening-hours">jump</a>');
    // The id comes from the heading's WORDS, so the level shift does not change it: a page
    // written with `## Opening Hours` before the shift keeps resolving the same fragment.
    expect(renderSafeMarkdown("## Opening Hours\n")).toContain('id="opening-hours"');
  });

  it("allocates duplicate ids deterministically across shifted levels", () => {
    const ids = [
      ...renderSafeMarkdown("# Notes\n\n## Notes\n\n###### Notes\n").matchAll(
        /<[a-zA-Z][^>]*\sid="([^"]*)"/g,
      ),
    ].map((match) => match[1]);

    expect(ids).toEqual(["notes", "notes-2", "notes-3"]);
  });
});

describe("heading fragments", () => {
  it("gives a heading a deterministic id an author's fragment link can reach", () => {
    const html = renderSafeMarkdown("See [hours](#opening-hours) below.\n\n## Opening Hours\n");

    expect(html).toContain('<h3 id="opening-hours">Opening Hours</h3>');
    expect(html).toContain('<a href="#opening-hours">hours</a>');
  });

  it("derives the id from the heading's own words, whatever markup they carry", () => {
    expect(renderSafeMarkdown("## **Bold** and `code`\n")).toContain('<h3 id="bold-and-code">');
    expect(renderSafeMarkdown("## Café Hours\n")).toContain('<h3 id="cafe-hours">');
    expect(renderSafeMarkdown("## !!!\n")).toContain('<h3 id="section">');
  });

  it("disambiguates repeated headings within one document", () => {
    const ids = [
      ...renderSafeMarkdown("## Notes\n\n## Notes\n\n## Notes\n").matchAll(
        /<[a-zA-Z][^>]*\sid="([^"]*)"/g,
      ),
    ].map((match) => match[1]);

    expect(ids).toEqual(["notes", "notes-2", "notes-3"]);
  });

  it("keeps ids unique per DOCUMENT: one page's anchors never leak into another", () => {
    expect(renderSafeMarkdown("## Notes\n")).toContain('id="notes"');
    expect(renderSafeMarkdown("## Notes\n")).toContain('id="notes"');
  });

  it("never lets an author set an id: a typed attribute stays inert text", () => {
    const html = renderSafeMarkdown('## <span id="mine">Heading</span>\n');

    // The author's characters are visible as TEXT (inert): only `<`, `>` and `&` are
    // entity-escaped, so the words the author typed — including the attribute — are
    // readable and carry no meaning.
    expect(html).toContain('&lt;span id="mine"&gt;Heading&lt;/span&gt;');
    expect(html).not.toContain("<span");
    // …and the only id any ELEMENT carries is the generated one, which the author
    // cannot influence beyond the words of the heading itself.
    const elementIds = [...html.matchAll(/<[a-zA-Z][^>]*\sid="([^"]*)"/g)].map((match) => match[1]);
    expect(elementIds).toHaveLength(1);
    expect(elementIds[0]).not.toBe("mine");
    expect(isHeadingAnchor(elementIds[0] ?? ""), elementIds[0]).toBe(true);
  });

  it("emits only ids that match the declared pattern, for hostile headings", () => {
    const html = renderSafeMarkdown(
      ['## "><script>alert(1)</script>', "", "## onclick=steal()", "", "## <img src=x onerror=alert(1)>", ""].join("\n"),
    );

    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/i);
    const ids = [...html.matchAll(/<[a-zA-Z][^>]*\sid="([^"]*)"/g)].map((match) => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(isHeadingAnchor(id), id).toBe(true);
  });
});

describe("the safe Markdown renderer — an empty document", () => {
  it("renders an empty document as an empty string", () => {
    expect(renderSafeMarkdown("")).toBe("");
  });
});});

describe("application-link references (A8 Phase F)", () => {
  it("renders a reserved marker as words until a resolver answers", () => {
    const marker = "[us](#link:contact)";
    expect(renderSafeMarkdown(marker)).not.toContain("<a");
    expect(renderSafeMarkdown(marker, () => null)).not.toContain("<a");
    expect(renderSafeMarkdown(marker, () => "mailto:x@example.test")).toContain(
      'href="mailto:x@example.test"',
    );
  });

  it("never emits an unresolved marker, and never adds a scheme to the allowlist", () => {
    expect(renderSafeMarkdown("[us](#link:contact)")).not.toContain("#link:");
    expect([...MARKDOWN_ALLOWED_SCHEMES].sort()).toEqual(["http", "https", "mailto", "tel"]);
  });
});
