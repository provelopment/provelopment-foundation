import { marked } from "marked";

interface MarkdownContentProps {
  markdown: string;
}

/**
 * Renders raw Markdown as HTML.
 *
 * Trust boundary: the Markdown (including any raw HTML it contains) is rendered
 * as-is. Page bodies are adopter-authored content (`content/pages/<locale>/`),
 * NOT untrusted user input — see CUSTOMIZING.md. Do not pipe visitor-supplied
 * text through this component.
 *
 * Presentation-only concern: the Markdown arrives already loaded through an
 * application port; this component knows nothing about where it came from.
 */
export function MarkdownContent({ markdown }: MarkdownContentProps) {
  const html = marked.parse(markdown, { async: false });

  return <div className="prose" dangerouslySetInnerHTML={{ __html: wrapTablesForOverflow(html) }} />;
}

/**
 * Wrap every rendered `<table>` in a LOCAL horizontal-scroll region.
 *
 * A Markdown table's minimum width is fixed by its cells, so on a narrow
 * viewport a wide table would otherwise force PAGE-LEVEL horizontal overflow.
 * Wrapping is the treatment the project already uses for fenced code
 * (`.prose pre { overflow-x: auto }`), and it keeps the table a real `<table>`
 * with real table semantics — unlike changing its `display`, which can alter how
 * assistive technology exposes a table.
 *
 * `tabindex="0"` makes the scroll region keyboard-reachable, so the clipped
 * columns are not pointer-only. Focus styling comes from the single global
 * `:focus-visible` ring; nothing is declared here.
 *
 * Applied ONLY to tables, and only to OUR OWN generated markup (`marked` output
 * for adopter-authored content), so every other Markdown element is untouched.
 * Tables cannot nest in Markdown, so a non-greedy per-table match is sufficient
 * and is stated here rather than assumed.
 */
function wrapTablesForOverflow(html: string): string {
  return html.replace(
    /<table>[\s\S]*?<\/table>/g,
    (table) => `<div class="prose-table-scroll" tabindex="0">${table}</div>`,
  );
}