import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/**
 * STAGE A OF THE GEOGRAPHIC RETIREMENT (`FOUNDATION-GEO-04-GEOGRAPHIC-RETIREMENT-STAGE-A-R01`)
 * ==========================================================================================
 *
 * WHAT THESE TESTS PROVE, AND WHAT THEY DO NOT
 * --------------------------------------------
 * They prove a bounded IMPORT fact: no application module under `src/` imports the retired public-destination
 * entrypoint, its two exported helpers, or the legacy completion/selection modules those helpers lived in. That
 * is the structural half of the Stage A delivery, and it is the whole of what these assertions claim.
 *
 * They do NOT prove that the repository has exactly one URL authority. It does not: the live shared shell still
 * composes Site paths for presentation (`layoutForEfsContext` → `spokeServerComposition`/`layoutForContext`,
 * reserved for Stage B), `src/app/sitemap-context.ts` still exists, and the legacy `[site]/[locale]` OpenGraph and
 * owner-asset routes are still built. A ban on those names would be a ban on Stage B, so no such ban is written
 * here. The one address CONTRACT (`src/core/efs/publication.ts`, D31 §3) is asserted only as a delegation fact —
 * that the EFS request adapter imports it — never as repository-wide uniqueness.
 *
 * The behavioural half of the Stage A proof is real served HTTP, not source text: see
 * `tests/browser/shared-host-production.mjs` section 9.
 */
const RETIRED_SYMBOLS = [
  "completePublicPath",
  "requestPublicDestination",
  "requestSpokeContext",
] as const;
const RETIRED_MODULES = ["request-context", "spoke-navigation"] as const;

/** Every `.ts`/`.tsx` module under `src/`, recursively. */
function applicationModules(directory: string = SRC): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...applicationModules(absolute));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      found.push(absolute);
    }
  }
  return found;
}

/**
 * Comments are stripped FIRST. Several modules legitimately NAME the retired entrypoint in prose to explain why
 * it is gone; a text search that counted those would report a dependency that the compiler never sees.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Every import statement, including multi-line specifier lists. */
function importStatements(source: string): string[] {
  return withoutComments(source).match(/\bimport\b[\s\S]*?from\s+["'][^"']+["']/g) ?? [];
}

describe("Stage A — the retired public-destination entrypoint has no application importer", () => {
  it("keeps the orphaned legacy entrypoint retired", () => {
    expect(
      applicationModules().some((sourceFile) =>
        sourceFile.endsWith(join("[[...segments]]", "request-context.ts")),
      ),
      "the legacy request-context module must stay retired",
    ).toBe(false);
  });

  it("leaves no application module importing it, its helpers, or the legacy completion modules", () => {
    const violations: string[] = [];
    for (const sourceFile of applicationModules()) {
      for (const statement of importStatements(readFileSync(sourceFile, "utf8"))) {
        for (const symbol of RETIRED_SYMBOLS) {
          if (new RegExp(`\\b${symbol}\\b`).test(statement)) {
            violations.push(`${relative(ROOT, sourceFile)} imports ${symbol}`);
          }
        }
        for (const retired of RETIRED_MODULES) {
          if (statement.includes(retired)) {
            violations.push(`${relative(ROOT, sourceFile)} imports ${retired}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("serves sitemap and robots from the EFS request boundary, never the legacy context module", () => {
    for (const file of ["app/sitemap.ts", "app/robots.ts"]) {
      const statements = importStatements(readFileSync(join(SRC, file), "utf8")).join("\n");
      expect(statements, `${file} must ask the EFS boundary`).toContain("efs-request");
      expect(statements, `${file} must not import the legacy sitemap context`).not.toContain(
        "sitemap-context",
      );
    }
  });

  it("delegates address construction to the D31 publication module (a delegation fact, not uniqueness)", () => {
    const request = importStatements(
      readFileSync(join(SRC, "app", "[[...segments]]", "efs-request.ts"), "utf8"),
    );
    const fromPublication = request.filter((statement) =>
      statement.includes("@/core/efs/publication"),
    );
    expect(fromPublication.length, "efs-request.ts must import the address contract").toBeGreaterThan(0);
    for (const symbol of [
      "canonicalUrl",
      "contentSegments",
      "matchBinding",
      "parseContentRoute",
      "caseCorrectedAddress",
      "entryRedirectPath",
    ]) {
      expect(fromPublication.join("\n"), `efs-request.ts must import ${symbol}`).toContain(symbol);
    }
  });
});
