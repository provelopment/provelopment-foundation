import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { RESERVED_SITE_IDS, isReservedSiteId, isSiteId, reservedSiteIdIssue } from "@/core/site-identity";

/**
 * THE IDENTITY CONTRACT'S BOUNDARIES (FOUNDATION-ID-M1, corrected by FOUNDATION-ID-M1R, reduced by
 * `GEO-04` C02 and `GEO-04` C04)
 * ============================================================================================
 *
 * FOUNDATION-ID-M1 added two pure domain modules and their tests. That claim has four checkable
 * parts, and this file checks them:
 *
 *   1. the module depends on nothing but the domain, so no framework, filesystem, environment or
 *      crypto dependency can have entered it;
 *   2. it is a LEAF of the import graph — everything it reaches is inside `src/core/` — so the
 *      dependency can only ever run `src/**` → contracts. Wiring it into configuration and
 *      runtime composition is a USE of the contract, never a change to its boundary;
 *   3. the reserved vocabulary has ONE canonical DECLARATION, so it cannot be restated and drift —
 *      while any module may IMPORT and CALL it;
 *   4. the reservations that protect a released platform namespace still agree with it, while
 *      framework paths, public resource filenames and page-route names stay SEPARATE concerns.
 *
 * WHAT `GEO-04` C02 CHANGED HERE: the Business-scoped composite Site identity is retired, so
 * `core/site-identity.ts` now imports NOTHING and the reachable set below is that one module. The
 * composite interface, separator, validator and key are guarded as ABSENT rather than as present,
 * because a contract that is deleted must not be able to reappear beside the authority that
 * replaced it.
 *
 * WHAT `GEO-04` C04 CHANGED HERE: the legacy `BusinessId` nominal (`core/business-identity.ts`) is
 * retired too. It was the geographically associated `b_` identity that `D27` replaced with the
 * independent EFS `EntityID`; after C02 removed the composite it had no consumer left. Its purity
 * proof therefore becomes an ABSENCE proof: the module must not exist, no `src/**` module may import
 * or re-export it, and none of its exported nominal, constants or `mintBusinessId` may be declared
 * anywhere in the source tree. The EFS `EntityID` authority (`core/efs/identity.ts`) is a different
 * module with its own format, entropy and tests, and it neither imports that nominal nor delegates
 * its shape to it.
 *
 * ADOPTION-SAFE, DELIBERATELY (FOUNDATION-ID-M1R). An earlier revision of parts 2 and 3 asserted
 * that NOTHING under `src/` imported these modules, and that nothing outside the authority so much
 * as NAMED the reservation symbols. Both described M1's temporary staging state rather than an
 * architectural invariant, and both would have had to be deleted — or worked around — the moment a
 * later milestone legitimately wired the contracts in. A guard that fails on adoption is a guard
 * against the milestone rather than for the architecture, so these two now assert the PERMANENT
 * facts instead: the DIRECTION of the dependency, and the UNIQUENESS of the declaration.
 *
 * WHAT A TEST CANNOT PROVE, stated plainly: which files a milestone ADDED or changed is a Git fact,
 * and it is reported as a diff in the milestone report — not asserted here.
 */
const srcDirectory = path.join(process.cwd(), "src");

/** The retired `BusinessId` nominal, and the surviving Site-ID vocabulary, spelled once each. */
const RETIRED_BUSINESS_ID_MODULE = "core/business-identity.ts";
const SITE_ID_MODULE = "core/site-identity.ts";

/**
 * Every name the retired nominal exported (`GEO-04` C04). Guarded as ABSENT, and by DECLARATION
 * rather than by mention: prose may still explain what was retired — `core/efs/identity.ts` says
 * plainly that the `b_` prefix is gone — but no module may declare the nominal again.
 */
const RETIRED_BUSINESS_ID_SYMBOLS = [
  "BusinessId",
  "BusinessIdEntropySource",
  "BUSINESS_ID_PREFIX",
  "BUSINESS_ID_PAYLOAD_LENGTH",
  "BUSINESS_ID_LENGTH",
  "BUSINESS_ID_ENTROPY_BITS",
  "BUSINESS_ID_ENTROPY_BYTES",
  "BUSINESS_ID_BITS_PER_CHARACTER",
  "BUSINESS_ID_PADDING_BITS",
  "BUSINESS_ID_ALPHABET",
  "BUSINESS_ID_FIRST_CHARACTERS",
  "BUSINESS_ID_EXCLUDED_LETTERS",
  "normalizeBusinessId",
  "isBusinessId",
  "businessIdIssue",
  "mintBusinessId",
];

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

/** The binding keywords a DECLARATION uses. A USE — an import, a call, a type reference — uses none. */
const DECLARATION_KEYWORDS = ["const", "let", "var", "function", "class", "interface", "type", "enum"];

/**
 * The four names the reservation authority owns (FOUNDATION-ID-M1R).
 *
 * They are guarded against DUPLICATION, not against ADOPTION: any module may import and call them,
 * and that must never be a failure. What may never exist is a SECOND declaration — two lists, or
 * two functions deciding, would eventually disagree about what a Site ID may be.
 */
const RESERVATION_DECLARATIONS = [
  "RESERVED_SITE_ID_GROUPS",
  "RESERVED_SITE_IDS",
  "isReservedSiteId",
  "reservedSiteIdIssue",
];

/** The page-route names the GRAMMAR accepts and the reserved vocabulary must NOT contain. */
const PAGE_ROUTE_NAMES = ["home", "connect", "contact", "opengraph-image"];

/** The shape a DECLARATION of `name` has: `export const NAME`, `export function NAME`, … */
function declarationPattern(name: string): RegExp {
  const bindings = DECLARATION_KEYWORDS.join("|");
  return new RegExp(`^\\s*export\\s+(?:declare\\s+)?(?:${bindings})\\s+${name}\\b`, "m");
}

/** Which modules under `src/` DECLARE `name`. Naming it anywhere else is a USE, not an authority. */
function declarationModules(name: string): string[] {
  const pattern = declarationPattern(name);
  return sourceFiles().filter((relative) => pattern.test(sourceOf(relative)));
}

/**
 * Where a specifier READ FROM `fromRelative` lands inside `src/`, or `null` when it leaves `src/`.
 *
 * Only the two shapes a domain module may use are resolved: `@/…` (the source root) and `./…`
 * (a sibling). A package specifier resolves nowhere, which is how the leaf check in this file
 * reports a dependency that escaped the domain.
 */
function resolvedSourceFile(specifier: string, fromRelative: string): string | null {
  const base = specifier.startsWith("@/")
    ? specifier.slice(2)
    : specifier.startsWith(".")
      ? path.posix.join(path.posix.dirname(fromRelative), specifier)
      : null;
  if (base === null) return null;

  const candidate = /\.(?:ts|tsx|mts|mjs)$/.test(base) ? base : `${base}.ts`;
  return sourceFiles().includes(candidate) ? candidate : null;
}

describe("the surviving domain module", () => {
  it("lets `site-identity.ts` import NOTHING at all — the vocabulary stands alone", () => {
    // `GEO-04` C02 retired the composite, and with it the module's only import. What remains — the
    // grammar and the reservation vocabulary — is self-contained data and functions, so no second
    // authority can change what a Site ID may be from outside this file.
    expect(importSpecifiers(sourceOf(SITE_ID_MODULE))).toEqual([]);
  });

  it("imports no framework, infrastructure or outer layer", () => {
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

    for (const specifier of importSpecifiers(sourceOf(SITE_ID_MODULE))) {
      const violation = forbidden.find(
        (prefix) => specifier === prefix || specifier.startsWith(prefix),
      );
      expect(violation, `${SITE_ID_MODULE} imports "${specifier}"`).toBeUndefined();
    }
  });

  it("stays a LEAF of the import graph: everything it reaches is inside the pure domain", () => {
    // FOUNDATION-ID-M1R. The permanent invariant is DIRECTION, not quarantine. M2 will import these
    // contracts from configuration and runtime composition, and that must stay possible for ever,
    // so "nothing imports them" was the wrong check: it described the day the milestone landed.
    // What may never happen is the REVERSE — a contract reaching a framework, an adapter, an
    // environment or an operator surface — so every module the contracts depend on is resolved
    // recursively and the whole reachable set must remain inside the pure domain.
    const reached = new Set<string>([SITE_ID_MODULE]);
    const pending = [SITE_ID_MODULE];

    while (pending.length > 0) {
      const relative = pending.pop() as string;

      for (const specifier of importSpecifiers(sourceOf(relative))) {
        const resolved = resolvedSourceFile(specifier, relative);

        expect(
          resolved,
          `${relative} imports "${specifier}", which is not a module under \`src/\``,
        ).not.toBeNull();
        if (resolved === null || reached.has(resolved)) continue;

        expect(resolved.startsWith("core/"), `${relative} reaches "${resolved}"`).toBe(true);
        reached.add(resolved);
        pending.push(resolved);
      }
    }

    // NON-VACUOUS, and stable under adoption: `site-identity.ts` imports nothing at all, so no
    // consumer can ever invert the direction and no contract can quietly acquire a dependency.
    expect([...reached].sort()).toEqual([SITE_ID_MODULE]);
  });
});
describe("the reservation authority", () => {
  it("DECLARES the reserved vocabulary in exactly ONE module — a USE elsewhere is not an authority", () => {
    // FOUNDATION-ID-M1R. The revision this replaces forbade any MENTION of these four names outside
    // `core/site-identity.ts`, which conflated a DECLARATION with a USE: the moment a milestone
    // imported the reservation and called it, the guard would have reported the ADOPTION of the
    // contract as a violation of it. What must be unique is the BINDING, because two lists — or two
    // functions deciding — would eventually disagree about what a Site ID may be. Consumption is
    // therefore unrestricted: import these names, call them, hold them in a map, pass them around.
    for (const name of RESERVATION_DECLARATIONS) {
      expect(declarationModules(name), `a second declaration of ${name}`).toEqual([SITE_ID_MODULE]);
    }

    // Non-vacuous: each name really is DECLARED there, so the check above cannot pass by finding
    // nothing anywhere — which is what it would do if a symbol were renamed or removed.
    const authority = sourceOf(SITE_ID_MODULE);
    for (const name of RESERVATION_DECLARATIONS) {
      expect(authority, name).toMatch(declarationPattern(name));
    }
  });

  it("derives the collection from the groups rather than restating it", () => {
    const source = sourceOf(SITE_ID_MODULE);

    // The words themselves occur once, inside `RESERVED_SITE_ID_GROUPS` (the group declarations);
    // `RESERVED_SITE_IDS` is the spread of those groups.
    expect(source).toContain("export const RESERVED_SITE_ID_GROUPS");
    expect(source).toContain("...RESERVED_SITE_ID_GROUPS.platform");
    expect(source).toContain("...RESERVED_SITE_ID_GROUPS.administration");
    expect(source).toContain("...RESERVED_SITE_ID_GROUPS.routing");
    expect(source).toContain("...RESERVED_SITE_ID_GROUPS.retired");
    expect(RESERVED_SITE_IDS).toHaveLength(14);
  });

  it("reserves `ww` as a RETIRED Site identity, and keeps the one-way SOURCE conversion", () => {
    // D28 retired the worldwide Site. The word is therefore not a Site any author may re-adopt — and
    // refusing it here is what makes `ww` unusable as an EFS Site identity without inventing an alias
    // such as `001` or a new public `/ww` claim.
    expect(RESERVED_SITE_IDS).toContain("ww");
    expect(isSiteId("ww")).toBe(true); // reserved, NOT malformed — the two answers stay two answers
    expect(isReservedSiteId("ww")).toBe(true);
    expect(isReservedSiteId("WW")).toBe(true); // case-insensitive, like every reservation
    expect(reservedSiteIdIssue("ww")).toMatch(/retired/i);
    expect(reservedSiteIdIssue("main")).toBeNull();
    // A descriptive Site that merely LOOKS geographic is still a valid Site ID: the reservation is one
    // word, not a geography classifier.
    expect(reservedSiteIdIssue("germany")).toBeNull();
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

  it("accepts the page-route names as Site IDs while keeping them OUT of the reserved vocabulary", () => {
    // FOUNDATION-ID-M1R. `home`, `connect`, `contact` and `opengraph-image` are ordinary lowercase
    // words, so the Site-ID GRAMMAR expresses every one of them: they are NOT in the category
    // above, whose members a Site ID cannot spell at all. They stay out of `RESERVED_SITE_IDS`
    // because what they collide with is a PAGE ROUTE, not a Site: a page is addressed BELOW the
    // site segment (`/<site>/<locale>/<route>`), so a route name never claims the site segment, and
    // `home`'s second URL is prevented by the route rule that skips the home content slug — an
    // authority of its own, asserted in `tests/architecture/boundaries.test.ts`. Reserving them
    // here would push a routing concern into the identity vocabulary for no identity reason.
    for (const routeName of PAGE_ROUTE_NAMES) {
      expect(isSiteId(routeName), routeName).toBe(true);
      expect(RESERVED_SITE_IDS, routeName).not.toContain(routeName);
      expect(isReservedSiteId(routeName), routeName).toBe(false);
      expect(reservedSiteIdIssue(routeName), routeName).toBeNull();
    }
  });
});

describe("the retired composite Site identity (GEO-04 C02)", () => {
  /**
   * The retired symbols, named once here so the guard cannot be satisfied by a rename.
   *
   * `GEO-04` C02 removed the Business-scoped `(businessId, siteId)` composite: the EFS declaration is
   * the one place a Site is declared, and it declares a Site ID, not a pair. A contract that has been
   * deleted must stay deleted — a re-added `SiteIdentity` beside the surviving vocabulary would be a
   * second identity authority, which is exactly what the retirement removed.
   */
  const RETIRED_COMPOSITE = [
    "SiteIdentity",
    "SITE_IDENTITY_SEPARATOR",
    "siteIdentityIssue",
    "siteIdentityKey",
  ];

  it("leaves none of the composite, its separator, its validator or its key in the identity module", () => {
    const authority = sourceOf(SITE_ID_MODULE);
    for (const name of RETIRED_COMPOSITE) {
      expect(declarationPattern(name).test(authority), name).toBe(false);
      expect(authority.includes(name), name).toBe(false);
    }
  });

  it("leaves no composite declaration anywhere under `src/`", () => {
    for (const relative of sourceFiles()) {
      const text = sourceOf(relative);
      for (const name of RETIRED_COMPOSITE) {
        expect(declarationPattern(name).test(text), `${relative} declares ${name}`).toBe(false);
      }
    }
  });

  it("keeps the `business-identity` authority OUT of the Site-ID vocabulary", () => {
    // The import that existed solely for the composite is what `GEO-04` C02 removed, and `C04` then
    // retired the nominal itself. What must hold for ever is that the Site-ID vocabulary still does
    // not depend on — or even name — the retired specifier.
    expect(importSpecifiers(sourceOf(SITE_ID_MODULE))).toEqual([]);
    expect(sourceOf(SITE_ID_MODULE)).not.toContain("business-identity");
  });
});

describe("the retired `BusinessId` nominal (GEO-04 C04)", () => {
  it("no longer exists in the source tree", () => {
    // `D27` retired the `b_`-prefixed nominal and kept only the opaque generation STRUCTURE for the
    // independent EFS `EntityID`. `C02` then removed its last production consumer, so the module is
    // gone: a retired authority that is merely unused is a trap for the next reader.
    expect(sourceFiles()).not.toContain(RETIRED_BUSINESS_ID_MODULE);
    expect(() => sourceOf(RETIRED_BUSINESS_ID_MODULE)).toThrow();
  });

  it("is not imported, required or re-exported by any active `src/**` module", () => {
    // Non-vacuous by construction: the scan is over every source file, and the specifier is asserted
    // per file so a single reintroduction names its own path in the failure message.
    const mentions = sourceFiles().filter((relative) =>
      sourceOf(relative).includes("business-identity"),
    );
    expect(mentions).toEqual([]);
  });

  it("is not DECLARED again anywhere under `src/` — by name, constant or minter", () => {
    // Declarations rather than mentions: prose may still explain what was retired, but a second
    // `BusinessId`, format constant or `mintBusinessId` would be a new identity authority.
    for (const name of RETIRED_BUSINESS_ID_SYMBOLS) {
      expect(declarationModules(name), `${name} is declared again`).toEqual([]);
    }

    // Non-vacuous: the same detector DOES find a name that is still declared, so an empty result
    // above means absence rather than a broken pattern.
    expect(declarationModules("RESERVED_SITE_IDS")).toEqual([SITE_ID_MODULE]);
    expect(declarationModules("ENTITY_ID_PREFIX")).toEqual(["core/efs/identity.ts"]);
  });
});


/**
 * THE DEFERRED `ww` PROHIBITION — OPEN, NOT WAIVED (`GEO-04` C02-R02).
 *
 * The retired worldwide Site word is deliberately NOT in the reservation vocabulary yet: the legacy
 * establishment inputs still author it as an EFS Site, so reserving it before that seam is reconciled
 * would make the platform's own establishment output invalid. Enforcing it is a MANDATORY open
 * `GEO-04` dependency and a later order's work; it is recorded here so the deferral cannot be mistaken
 * for a decision that the word may stay authorable, and this file asserts nothing about it either way.
 */
