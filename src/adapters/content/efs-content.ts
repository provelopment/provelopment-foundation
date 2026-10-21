/**
 * OWNER-SCOPED EFS CONTENT ADAPTER (`D31`, Candidate CP-0...CP-5)
 * =============================================================
 *
 * It reads both synthetic and converted Entity-rooted capsules. Paths are explicit ownership
 * paths, never derived from a hostname, SiteID
 * spelling or locale. Reads are confined to the declared capsule root so a traversal, absolute
 * path or cross-Entity request cannot escape the owner boundary.
 *
 * JSON source remains the valid higher-precedence format over Markdown, matching the released
 * authoring contract. This adapter does not implement the full released page schema; it proves
 * the ownership boundary and the two source formats for E1.
 */
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

/** The supported synthetic source formats. */
export type EfsSourceFormat = "json" | "markdown";

/** One loaded source. JSON exposes its parsed object; Markdown exposes its body. */
export interface EfsPageSource {
  readonly format: EfsSourceFormat;
  readonly path: string;
  readonly pageId: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly body?: string;
}

/** A refused read. The reason is safe for diagnostics and contains no filesystem path escape. */
export type EfsContentResult<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "rejected"; readonly reason: string };

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;

/** Parse the simple `key: value` YAML front matter the released Markdown pages use. */
function frontMatter(raw: string): { readonly data: Record<string, string>; readonly body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!match) return { data: {}, body: raw };
  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(key) && value.length > 0) data[key] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

function safeSegment(value: string, label: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error(`${label} must be a lowercase descriptive segment.`);
  }
  return value;
}

function insideRoot(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path.length > 0 && path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
}

/** Load one Page source under its exact Entity/Facet/Site ownership path. */
export function loadEfsPageSource(input: {
  readonly root: string;
  readonly entityId: string;
  readonly facetId: string;
  readonly siteId: string;
  readonly pageId: string;
  /** The actual representation path key. When supplied, only that localized source is eligible. */
  readonly localeKey?: string;
}): EfsContentResult<EfsPageSource> {
  try {
    const root = realpathSync(input.root);
    const entity = safeSegment(input.entityId, "Entity path segment");
    const facet = safeSegment(input.facetId, "Facet path segment");
    const site = safeSegment(input.siteId, "Site path segment");
    const page = safeSegment(input.pageId, "Page path segment");
    const locale = input.localeKey ? safeSegment(input.localeKey, "Locale path segment") : undefined;
    const directory = join(root, entity, facet, site, "pages");
    const pageDirectory = join(directory, page);
    const jsonPath = locale ? join(pageDirectory, `${locale}.json`) : join(directory, `${page}.json`);
    const markdownPath = locale ? join(pageDirectory, `${locale}.md`) : join(directory, `${page}.md`);

    if (!existsSync(jsonPath) && !existsSync(markdownPath)) {
      return { kind: "rejected", reason: `Page "${page}" has no source for the requested representation.` };
    }

    const selected = existsSync(jsonPath) ? jsonPath : markdownPath;
    const canonical = realpathSync(selected);
    if (!insideRoot(root, canonical)) {
      return { kind: "rejected", reason: "The requested source escapes the owner capsule." };
    }

    const raw = readFileSync(canonical, "utf8");
    if (selected === markdownPath) {
      const front = frontMatter(raw);
      const heading = /^#\s+(.+)$/m.exec(front.body);
      return {
        kind: "ok",
        value: {
          format: "markdown",
          path: canonical,
          pageId: page,
          data: {
            ...(heading ? { title: heading[1].trim() } : {}),
            ...front.data,
          },
          body: front.body,
        },
      };
    }

    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "rejected", reason: "A JSON Page source must be an object." };
    }
    return {
      kind: "ok",
      value: {
        format: "json",
        path: canonical,
        pageId: page,
        data: parsed as Readonly<Record<string, unknown>>,
      },
    };
  } catch (error) {
    return {
      kind: "rejected",
      reason: `Cannot read the Page source: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Load one owner-scoped dictionary. Cross-owner and traversal reads are refused. */
export function loadEfsDictionary(input: {
  readonly root: string;
  readonly entityId: string;
  readonly facetId: string;
  readonly siteId: string;
  readonly localeKey: string;
}): EfsContentResult<Readonly<Record<string, string>>> {
  try {
    const root = realpathSync(input.root);
    const path = resolve(
      root,
      safeSegment(input.entityId, "Entity path segment"),
      safeSegment(input.facetId, "Facet path segment"),
      safeSegment(input.siteId, "Site path segment"),
      "dictionaries",
      `${safeSegment(input.localeKey, "Locale path segment")}.json`,
    );
    if (!existsSync(path)) return { kind: "rejected", reason: "The owner dictionary does not exist." };
    const canonical = realpathSync(path);
    if (!insideRoot(root, canonical)) {
      return { kind: "rejected", reason: "The requested dictionary escapes the owner capsule." };
    }
    const parsed: unknown = JSON.parse(readFileSync(canonical, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { kind: "rejected", reason: "A dictionary must be a JSON object of strings." };
    }
    const dictionary: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== "string") {
        return { kind: "rejected", reason: `Dictionary key "${key}" must have a string value.` };
      }
      dictionary[key] = value;
    }
    return { kind: "ok", value: dictionary };
  } catch (error) {
    return {
      kind: "rejected",
      reason: `Cannot read the owner dictionary: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
