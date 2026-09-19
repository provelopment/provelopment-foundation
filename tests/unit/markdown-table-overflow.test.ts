import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { marked } from "marked";

import { MarkdownContent } from "@/components/site/markdown-content";

/** Renders the component exactly as a page does (its only prop is the Markdown). */
const render = (markdown: string) =>
  renderToStaticMarkup(createElement(MarkdownContent, { markdown }));

/**
 * Markdown table horizontal-overflow safety (FOUNDATION-WEB-R1C).
 *
 * The DEFECT this locks: a Markdown table's minimum width is fixed by its cells,
 * so on a narrow viewport a wide table used to overflow the ARTICLE COLUMN and
 * therefore the whole PAGE — the document scrolled sideways. R1 browser
 * verification reproduced it twice on real content.
 *
 * These tests assert the actual rendered TREATMENT, not merely that a CSS string
 * exists: the table keeps its real table semantics, a local scroll region wraps
 * it, the region is keyboard-reachable, and Markdown without tables is rendered
 * byte-identically to what `marked` produces (so nothing else changed).
 */

const root = process.cwd();
const globals = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
const component = readFileSync(
  path.join(root, "src", "components", "site", "markdown-content.tsx"),
  "utf8",
);

/** The single `.prose-table-scroll` rule block. */
const scrollRule = /\.prose-table-scroll\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
/** The single `.prose table` rule block. */
const tableRule = /\.prose table\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

const WIDE_TABLE_MARKDOWN = [
  "| Column one heading | Column two heading | Column three heading | Column four heading |",
  "| --- | --- | --- | --- |",
  "| A deliberately long first cell that forces a wide table | Second long cell value | Third long cell value | Fourth long cell value |",
  "| Another long row value | More content here | More content here | More content here |",
].join("\n");

const NO_TABLE_MARKDOWN = [
  "## A heading",
  "",
  "A paragraph with **bold** text and a [link](https://example.com).",
  "",
  "- a list item",
  "- another list item",
  "",
  "```text",
  "a fenced code block",
  "```",
  "",
  "> a blockquote",
].join("\n");

describe("Markdown tables are wrapped in a local horizontal-scroll region", () => {
  it("wraps the rendered table and keeps it a REAL table", () => {
    const html = render(WIDE_TABLE_MARKDOWN);

    expect((html.match(/prose-table-scroll/g) ?? []).length).toBeGreaterThan(0);
    expect(html).toMatch(/<div class="prose-table-scroll" tabindex="0"><table>/);
    expect(html).toMatch(/<\/table><\/div>/);
    // The table's own semantics are untouched: still a real <table> with
    // <thead>/<tr>/<th>/<td> — never converted to a block layout.
    expect(html).toContain("<table>");
    expect(html).toContain("<thead>");
    expect(html).toContain("<th>");
    expect(html).toContain("<td>");
    expect(html).not.toMatch(/table[^>]*style="display:\s*block/);
  });

  it("makes the scroll region keyboard-reachable", () => {
    const html = render(WIDE_TABLE_MARKDOWN);
    const wrappers = [...html.matchAll(/<div class="prose-table-scroll"([^>]*)>/g)];
    expect(wrappers.length).toBeGreaterThan(0);
    for (const [, attrs] of wrappers) {
      // `overflow-x: auto` alone would leave clipped columns pointer-only.
      expect(attrs).toContain('tabindex="0"');
    }
  });

  it("leaves Markdown WITHOUT tables rendered exactly as marked() produces it", () => {
    const html = render(NO_TABLE_MARKDOWN);
    // Byte-identical to the parser output: no wrapper, no other transformation.
    // The component's own `.prose` container is the ONLY other markup.
    const inner = html.replace(/^<div class="prose">/, "").replace(/<\/div>$/, "");
    expect(inner).toBe(marked.parse(NO_TABLE_MARKDOWN, { async: false }));
    expect(html).not.toContain("prose-table-scroll");
    for (const element of ["<h2>", "<p>", "<ul>", "<pre>", "<blockquote>"]) {
      expect(html, element).toContain(element);
    }
  });

  it("wraps each table independently when a document has more than one", () => {
    const html = render(`${WIDE_TABLE_MARKDOWN}\n\n${WIDE_TABLE_MARKDOWN}`);
    expect((html.match(/class="prose-table-scroll"/g) ?? []).length).toBe(2);
    expect((html.match(/<table>/g) ?? []).length).toBe(2);
  });
});

describe("the overflow treatment is CSS-controlled, not hard-coded per page", () => {
  it("gives the scroll region a local horizontal scroll and a bounded width", () => {
    expect(scrollRule).toMatch(/overflow-x:\s*auto/);
    expect(scrollRule).toMatch(/max-width:\s*100%/);
    // It must not hide content globally: no clipping that would make the wide
    // columns unreachable.
    expect(scrollRule).not.toMatch(/overflow(-x)?:\s*hidden/);
  });

  it("keeps the wrapper visually transparent on a wide viewport", () => {
    // The table still fills the column, so no scrollbar appears when it fits.
    expect(tableRule).toMatch(/width:\s*100%/);
    // Vertical rhythm moved to the wrapper, so spacing is unchanged overall.
    expect(tableRule).toMatch(/margin:\s*0/);
    expect(scrollRule).toMatch(/margin:\s*1rem 0/);
  });

  it("does not shrink table text to force a fit", () => {
    // The fix must never trade readability for width.
    expect(scrollRule).not.toMatch(/font-size/);
    expect(tableRule).not.toMatch(/font-size/);
    expect(component).not.toMatch(/font-size/);
  });

  it("reuses the project's existing local-scroll precedent rather than display hacking", () => {
    // Fenced code already scrolls locally; tables now follow the SAME pattern.
    const preRule = /\.prose pre\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(preRule).toMatch(/overflow-x:\s*auto/);
    // The table's own display is never changed (which could alter how assistive
    // technology exposes table semantics).
    expect(tableRule).not.toMatch(/display:/);
    expect(component).not.toMatch(/display:\s*block/);
  });
});