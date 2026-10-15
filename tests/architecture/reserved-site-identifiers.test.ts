import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { RESERVED_SITE_IDS, isSiteId } from "@/core/site-identity";

/**
 * THE IDENTITY CONTRACT'S BOUNDARIES (FOUNDATION-ID-M1)
 * ====================================================
 *
 * FOUNDATION-ID-M1 adds two pure domain modules and their tests. That claim has four checkable
 * parts, and this file checks them:
 *
 *   1. the new modules depend on nothing but the domain (and `business-identity.ts` on nothing at
 *      all), so no framework, filesystem, environment or crypto dependency can have entered them;
 *   2. they are UNWIRED — no module under `src/` imports them — which is what makes "no released
 *      behaviour changes" a property of the code rather than a promise;
 *   3. the reserved vocabulary lives in ONE source module, so it cannot be restated and drift;
 *   4. the reservations that protect a released platform namespace still agree with it, while
 *      framework paths and public resource filenames stay a SEPARATE concern (they are not
 *      expressible as a Site ID at all).
 *
 * WHAT A TEST CANNOT PROVE, stated plainly: which files the milestone ADDED or changed is a Git
 * fact, and it is reported as a diff in the milestone report — not asserted here.
 */
const srcDirectory = path.join(process.cwd(), "src");

/** The two files this milestone adds — the whole of its source surface, spelled once. */
const BUSINESS_ID_MODULE = "core/business-identity.ts";
const SITE_ID_MODULE = "core/site-identity.ts";

/** Every source file under `src/`, as `/`-separated paths relative to it. */
function sourceFiles(directory = srcDirectory, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(path.join(directory, entry.name), relative);
    return /\.(?:ts|tsx|mts|mjs)$/.test(entry.name) ? [relative] : [];
  });
}

function sourceOf(relative: string): string {
  return readFileSync(path.join(srcDirectory, relative), "utf8");
}

/** The import specifiers a source file names — the same reading `boundaries.test.ts` uses. */
function importSpecifiers(source: string): string[] {
  const pattern = /(?:from\s+|import\s+|require\()\s*["']([^"']+)["']/g;
  return [...source.matchAll(pattern)].map((match) => match[1] as string);
}

describe("the two new domain modules", () => {
  it("keeps `business-identity.ts` free of EVERY import, so it is pure data and functions", () => {
    expect(importSpecifiers(sourceOf(BUSINESS_ID_MODULE))).toEqual([]);
  });

  it("lets `site-identity.ts` import the Business-ID authority and nothing else", () => {
    const allowed = new Set(["./business-identity", "@/core/business-identity"]);
    const specifiers = importSpecifiers(sourceOf(SITE_ID_MODULE));

    expect(specifiers.length).toBeGreaterThan(0);
    for (const specifier of specifiers) {
      expect(allowed.has(specifier), `${SITE_ID_MODULE} imports "${specifier}"`).toBe(true);
    }
  });

  it("imports no framework, infrastructure or outer layer in either module", () => {
    const forbidden = [
      "node:",
      "react",
      "react-dom",
      "next",
      "@/config",
      "@/adapters",
      "@/application",
      "@/app",
      "@/components",
      "@/core/spoke",
      "@/core/site",
      "@/core/site-code",
      "@/core/site-locale",
    ];

    for (const relativePath of [BUSINESS_ID_MODULE, SITE_ID_MODULE]) {
      for (const specifier of importSpecifiers(sourceOf(relativePath))) {
        const violation = forbidden.find(
          (prefix) => specifier === prefix || specifier.startsWith(prefix),
        );
        expect(violation, `${relativePath} imports "${specifier}"`).toBeUndefined();
      }
    }
  });

  it("is UNWIRED: no existing module under `src/` imports either one", () => {
    const target = /(?:^|\/)(?:business-identity|site-identity)$/;
    const importers = sourceFiles().filter((relative) => {
      if (relative === BUSINESS_ID_MODULE || relative === SITE_ID_MODULE) return false;
      return importSpecifiers(sourceOf(relative)).some((specifier) => target.test(specifier));
    });

    expect(importers, "a module importing the new identity contract").toEqual([]);
  });
});
describe("the reservation authority", () => {
  it("declares the reserved vocabulary in exactly ONE source module", () => {
    const mentions = sourceFiles().filter((relative) => {
      const source = sourceOf(relative);
      return (
        source.includes("RESERVED_SITE_ID_GROUPS") ||
        source.includes("RESERVED_SITE_IDS") ||
        source.includes("isReservedSiteId") ||
        source.includes("reservedSiteIdIssue")
      );
    });

    // One authority: nothing else under `src/` may name the reservation — a second declaration
    // would eventually disagree with this one about what a Site ID may be.
    expect(mentions).toEqual([SITE_ID_MODULE]);
  });

  it("derives the collection from the groups rather than restating it", () => {
    const source = sourceOf(SITE_ID_MODULE);

    // The words themselves occur once, inside `RESERVED_SITE_ID_GROUPS` (the group declarations);
    // `RESERVED_SITE_IDS` is the spread of those groups.
    expect(source).toContain("export const RESERVED_SITE_ID_GROUPS");
    expect(source).toContain("...RESERVED_SITE_ID_GROUPS.platform");
    expect(source).toContain("...RESERVED_SITE_ID_GROUPS.administration");
    expect(source).toContain("...RESERVED_SITE_ID_GROUPS.routing");
    expect(RESERVED_SITE_IDS).toHaveLength(13);
  });
});

describe("the reservations and the platform artefacts they protect", () => {
  it("reserves the two words a RELEASED platform namespace already uses", () => {
    // `spokes` protects the host-bound Spoke asset namespace the request boundary enforces, and
    // `assets` the platform namespace every generated tree resolves through.
    expect(sourceOf("proxy.ts")).toContain('"/spokes/"');
    expect(sourceOf("config/deployment-root.ts")).toContain('urlBase: "/assets"');

    expect(RESERVED_SITE_IDS).toContain("spokes");
    expect(RESERVED_SITE_IDS).toContain("assets");
  });

  it("leaves framework paths and public resource filenames to their own authorities", () => {
    // A Site ID can never be any of these — not because it is reserved, but because the grammar
    // cannot express it: `_next` and `~spoke` lead with an unusable character, and a resource
    // filename carries a dot. They are a SEPARATE category from the reserved vocabulary.
    for (const value of ["_next", "~spoke", "robots.txt", "sitemap.xml", "favicon.ico", "opengraph-image.png"]) {
      expect(isSiteId(value), value).toBe(false);
      expect(RESERVED_SITE_IDS, value).not.toContain(value);
    }

    // …while a reserved word IS expressible, which is exactly why it needs a semantic rule.
    expect(isSiteId("spokes")).toBe(true);
    expect(RESERVED_SITE_IDS).toContain("spokes");
  });
});