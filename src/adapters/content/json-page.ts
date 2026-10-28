/**
 * THE JSON PAGE READER — DECLARATIVE DATA, VALIDATED AND INTERPRETED
 * =================================================================
 *
 * Turns one `content/pages/json/<locale>/<route-path>.json` file into a declarative
 * page. It is deliberately the OPPOSITE of the Markdown reader in one respect: **nothing
 * is optional except `description`**. An advanced author gets a precise contract, a
 * precise refusal, and no guessing — there are no "supported but undocumented" fields,
 * because the schema is the vocabulary.
 *
 * WHAT IT DOES, AND WHAT IT DOES NOT
 * ----------------------------------
 *   read      the raw text (already done by discovery; this module is pure)
 *   parse     JSON syntax, distinguishing a SYNTAX error from a SCHEMA error
 *   validate  the ONE schema (`@/core/page-document`)
 *   report    which file, which property, what was wrong
 *
 * It never renders, never reads the filesystem, never resolves a locale and never
 * knows a React component exists: those belong to the composition and the presentation
 * layers. Interpretation is finished when a `JsonPage` exists.
 *
 * FAIL LOUDLY, NAME THE FILE, NAME THE PROPERTY
 * --------------------------------------------
 * A malformed file, an unsupported `schemaVersion`, an unknown section type, an unknown
 * property and a missing required field are all build-time errors that name the file and
 * the place in it. A JSON page is never silently ignored, never partially rendered and
 * never reinterpreted as something the author did not write.
 */
import type { Locale } from "@/core/locale";
import {
  PAGE_SECTION_TYPES,
  describePageDocumentIssues,
  pageDocumentSchema,
  reservedHomeVisibilityIssue,
  type PageDocument,
} from "@/core/page-document";
import {
  describePageLinkAuthoringIssues,
  pageLinkAuthoringIssues,
} from "@/adapters/content/page-link-integrity";
import { isPageRoutePath } from "@/core/page-route-path";
import { pageSourceFile } from "@/core/page-source";

/** One validated declarative page, ready to be composed into a route. */
export interface JsonPage {
  readonly routePath: string;
  /** The locale of the file that was read (which may be the default locale standing in). */
  readonly locale: Locale;
  /** The page's title: its identity, its metadata title and its ONE h1. */
  readonly title: string;
  /** The validated document, in authoring order. */
  readonly document: PageDocument;
  /** The author-supplied summary, when the document declared one. */
  readonly description?: string;
}

/** The file this page came from, for a diagnostic that an author can act on. */
function fileLabel(siteId: string, routePath: string, locale: string): string {
  return pageSourceFile("json", siteId, locale, routePath) ?? `${routePath}.json`;
}

/**
 * Section types the document names that the vocabulary does not support.
 *
 * The schema refuses these too (a discriminated union reports the expected values), but
 * it cannot echo the VALUE the author wrote — and "which type is wrong" is the single
 * most useful thing to say. So the reader names it explicitly, and the list it prints is
 * the vocabulary itself.
 */
function unknownSectionTypes(value: unknown): string[] {
  if (typeof value !== "object" || value === null) return [];
  const sections = (value as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return [];

  const unknown: string[] = [];
  for (const section of sections) {
    if (typeof section !== "object" || section === null) continue;
    const type = (section as { type?: unknown }).type;
    if (typeof type !== "string") continue;
    if (!(PAGE_SECTION_TYPES as readonly string[]).includes(type)) unknown.push(type);
  }
  return unknown;
}

/**
 * One authored JSON file → one declarative page, or a build-time error naming the file
 * and the property.
 */
export function parseJsonPageFile(
  raw: string,
  siteId: string,
  routePath: string,
  locale: Locale,
): JsonPage {
  if (!isPageRoutePath(routePath)) {
    throw new Error(
      `"${routePath}" is not a usable page route path (lowercase words joined by hyphens, ` +
        "folders allowed).",
    );
  }
  const file = fileLabel(siteId, routePath, locale);

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON in page "${file}": ${detail}. A JSON page is a single JSON object — ` +
        "check for a missing comma, a trailing comma, or an unquoted property name.",
    );
  }

  const unknown = unknownSectionTypes(value);
  if (unknown.length > 0) {
    throw new Error(
      `Unknown section type ${unknown.map((type) => `"${type}"`).join(", ")} in page "${file}": ` +
        `the supported section types are ${PAGE_SECTION_TYPES.join(", ")}. ` +
        "A section type is never guessed at or ignored.",
    );
  }

  const result = pageDocumentSchema.safeParse(value);
  if (!result.success) {
    throw new Error(
      `Invalid page document "${file}":\n${describePageDocumentIssues(result.error)}\n` +
        "Every property must be one the vocabulary declares, and nothing is silently ignored.",
    );
  }

  const document = result.data;

  // TEMPLATE-PV-A1 — A VALID DOCUMENT CAN STILL BE AN UNHONOURABLE ONE. The schema decides the vocabulary;
  // this decides whether the DOCUMENT may make the claim it makes on the ROUTE it is authored at. The reserved
  // home document is served by a locale root, whose URL is always published, so `unlisted` is refused there —
  // by name, through the ONE `reservedHomeVisibilityIssue` (`@/core/page-document`), never by a second spelling
  // of the rule. The refusal travels the same path as every other document error: it names the file and the
  // property, it stops the build, and it is never a silent reinterpretation.
  const reservedIssue = reservedHomeVisibilityIssue(document, routePath);
  if (reservedIssue !== null) {
    throw new Error(
      `Invalid page document "${file}":\n  - ${reservedIssue}\n` +
        "A page is never silently reinterpreted from what its author declared.",
    );
  }

  // A8 PHASE F — THE APPLICATION-LINK AUTHORING CONTRACT.
  //
  // At render time an unresolved marker is harmless (the author's words, no anchor), and that is the right
  // behaviour for a link a HOST declines to offer. A marker that is malformed, or names an id nothing
  // declares, is a different thing: no host could ever resolve it, so it is an author mistake. The rule is
  // the ONE adapter-level contract (`@/adapters/content/page-link-integrity`), shared with the EFS runtime
  // reader so the two can never drift, and it is token-derived rather than a text scan.
  const linkIssues = pageLinkAuthoringIssues(document);
  if (linkIssues.length > 0) {
    throw new Error(
      `Invalid page document "${file}":\n${describePageLinkAuthoringIssues(linkIssues)}\n` +
        "A reserved \"#link:\" marker must name a link the document declares; it is never served as a " +
        "fragment that can only ever fail.",
    );
  }

  return {
    routePath,
    locale,
    title: document.title,
    document,
    ...(document.description === undefined ? {} : { description: document.description }),
  };
}
