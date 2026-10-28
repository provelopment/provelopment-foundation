/**
 * THE APPLICATION-LINK AUTHORING CONTRACT FOR CONTENT READERS (A8 Phase F, §3B)
 * =============================================================================
 *
 * A JSON page can name a link two ways — an action or list item `link`, and a Markdown `#link:<id>` marker
 * in any declared Markdown field — and BOTH must name something the document actually declares. The
 * `link` half is enforced by the document schema (`undeclaredLinkIssues` in `@/core/page-document`), so
 * every reader inherits it. The MARKDOWN half cannot live in a schema: only a Markdown parser knows where
 * a link token is. That is what this module adds, and it is the ONE implementation of it.
 *
 * WHY IT LIVES IN THE ADAPTER LAYER, AND WHY BOTH READERS CALL IT
 * ---------------------------------------------------------------
 * There are two readers of an authored JSON page: the standalone reader (`json-page`) and the EFS runtime
 * reader (`efs-content`) that actually serves a published representation. If each carried its own marker
 * check, the runtime path could accept what the offline path refuses — the exact drift this module exists
 * to prevent. Both call `pageLinkAuthoringIssues`, so a document is refused for the same reasons whether
 * it is validated ahead of time or read while serving.
 *
 * Detection is token-derived (`reservedLinkReferences`), never a text scan: prose that merely mentions
 * `#link:` is not an error, while a marker inside emphasis, a list, a table cell or a nested label is.
 * Each issue carries the field path (`sections[3].items[0].body`), so the reader can name the file, the
 * property and the marker together.
 */
import { reservedLinkReferences } from "@/adapters/markdown/safe-markdown";
import { pageMarkdownFields, type PageDocument } from "@/core/page-document";

/** One authoring mistake: where it is, and what the author has to do about it. */
export interface PageLinkAuthoringIssue {
  /** `sections[2].items[0].body` — the same path form the schema's issues use. */
  readonly location: string;
  readonly message: string;
}

/**
 * Every application-link authoring mistake in a VALIDATED document.
 *
 * Two mistakes are possible, and both are refused rather than rendered (the renderer's fallback — words,
 * no anchor — is for a HOST that declines a link, not for a document that cannot be right):
 *
 *   malformed   `#link:`, `#LINK:x`, `#link:a_b` — not a declaration id, so it can never resolve;
 *   undeclared  `#link:x` where `links` has no `x` — no host could ever resolve it.
 */
export function pageLinkAuthoringIssues(document: PageDocument): readonly PageLinkAuthoringIssue[] {
  const issues: PageLinkAuthoringIssue[] = [];

  for (const field of pageMarkdownFields(document)) {
    for (const reference of reservedLinkReferences(field.text)) {
      if (reference.linkId === null) {
        issues.push({
          location: field.path,
          message:
            `"${reference.marker}" is a malformed reserved link marker: a declaration id is lowercase ` +
            'words joined by single hyphens, at most 64 characters (e.g. "#link:quotation-email")',
        });
        continue;
      }
      if (document.links?.[reference.linkId] !== undefined) continue;
      issues.push({
        location: field.path,
        message:
          `"#link:${reference.linkId}" is declared nowhere — add ` +
          `"links": { "${reference.linkId}": { "reference": "applicationLink", "key": "…" } } to the document`,
      });
    }
  }

  return issues;
}

/** The issues as the indented lines every reader's error message uses, one per mistake. */
export function describePageLinkAuthoringIssues(issues: readonly PageLinkAuthoringIssue[]): string {
  return issues.map((issue) => `  - ${issue.location}: ${issue.message}`).join("\n");
}
