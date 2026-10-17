import { mkdirSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPageSources } from "@/adapters/content/page-sources";
import { deploymentPaths } from "@/config/deployment-root";
import { resolveSites } from "@/core/site";

/**
 * THE COMPOSITION, END TO END (FOUNDATION-PAGES-A1; two-mode contract, A1C).
 *
 * These fixtures live under a test-only locale directory (`zz-srcs`) in the SELECTED deployment's own
 * authoring roots, so the declared precedence is proven on a real layout, not on stubs. A fixture is
 * ALSO planted under `content/pages/<locale>/` to prove the collection path is not a page source at
 * all: it can neither serve a page nor shadow one. Everything is removed afterwards.
 *
 * ISO-H2 — `root` is the deployment authority's answer, never `process.cwd()`: in the generic project
 * that is the SYNTHETIC deployment's disposable temporary tree, so this suite plants, reads and removes
 * its fixtures without touching any committed deployment — and it keeps working after B2B moves the real
 * deployment's content into its capsule.
 */
const root = deploymentPaths().root;
// A locale UNIQUE to this suite: vitest runs test FILES in parallel, so two suites
// sharing one fixture locale would overwrite each other's fixtures.
const SOURCES_LOCALE = "zz-srcs";
// S1 — the SITE segment comes first: `content/pages/<mode>/<siteId>/<locale>/…`.
// S1 — the SITE segment comes first: `content/pages/<mode>/<siteId>/<locale>/…`. This suite uses a
// recognized-but-synthetic country code, so its fixtures can never collide with the other suites'
// fixture sites (`ww`, `aq`, `tf`, `bv`) when vitest runs test files in parallel.
const SOURCES_SITE = "hm";
// TEMPLATE-PV-A1 — the locales the PUBLICATION contract needs, kept apart from this suite's main fixtures so a
// deliberately invalid fixture can never disturb an inventory assertion: a locale that holds only the
// publication fixtures, a locale whose reserved home document is unlisted, and a locale whose Markdown page
// declares a visibility the Markdown mode does not have. All three are valid two-segment locale path keys, and
// none is used by another suite.
const PUBLICATION_LOCALE = "zz-pv";
const UNLISTED_HOME_LOCALE = "zz-hm";
const MARKDOWN_VISIBILITY_LOCALE = "zz-md";
const SOURCES_SITES = resolveSites({
  // S1 — cross-locale fallback is a PER-SITE decision, scoped to that site's own page tree:
  // the fixture site opts in explicitly, which is what the fallback assertions below prove.
  input: [{ code: SOURCES_SITE, fallback: true }],
  defaultLocale: "en",
  locales: ["en", SOURCES_LOCALE, PUBLICATION_LOCALE, UNLISTED_HOME_LOCALE, MARKDOWN_VISIBILITY_LOCALE],
}).sites;
const EMPTY_LOCALE_NAME = "zz-srcs-ez";
const createdDirectories = [
  path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE),
  path.join(root, "content", "pages", "json", SOURCES_SITE, SOURCES_LOCALE),
  path.join(root, "content", "pages", SOURCES_SITE, SOURCES_LOCALE),
];

const sources = createPageSources({
  sites: SOURCES_SITES,
});

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** A minimal VALID declarative document, as an author would write it. */
function jsonDocument(
  title: string,
  sections: readonly unknown[],
  visibility?: "public" | "unlisted",
): string {
  return `${JSON.stringify(
    { schemaVersion: 1, title, ...(visibility === undefined ? {} : { visibility }), sections },
    null,
    2,
  )}\n`;
}

/** A resolved page's Markdown body — the union is narrowed here, once. */
function bodyOf(page: Awaited<ReturnType<typeof sources.resolve>>): string {
  if (page === null || page.kind !== "markdown") throw new Error(`expected a Markdown page`);
  return page.body;
}

describe("the page-sources composition", () => {
  beforeAll(() => {
    // Markdown (first-class) fixtures, flat AND nested.
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE, "about.md"),
      "# About\n\nA safe Markdown page.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE, "both.md"),
      "# Markdown version\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE, "README.md"),
      "# Documentation\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE, "offerings.md"),
      "# Offerings\n\nA nested page.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE, "offerings", "website-design.md"),
      "# Website design\n\nA nested page.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE, "offerings", "shared.md"),
      "# Shared\n\nOnly in the requested locale.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, SOURCES_LOCALE, "offerings", "README.md"),
      "# Not a page\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, "en", "zz-fallback.md"),
      "# Fallback page\n\nAnswered by the default locale.\n",
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, "en", "offerings", "fallback-page.md"),
      "# Nested fallback page\n\nAnswered by the default locale.\n",
    );
    // The default locale also has `offerings/shared`; the REQUESTED locale's page must
    // still win, whatever the other locale holds.
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, "en", "offerings", "shared.md"),
      "# Shared (default locale)\n\nOnly in the default locale.\n",
    );
    // JSON (first-class) fixtures: one shadowing the Markdown page, one alone, one
    // NESTED, one schema-invalid and one syntactically broken. The precedence applies to
    // the complete route path, and every broken file fails loudly naming itself.
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, SOURCES_LOCALE, "both.json"),
      jsonDocument("JSON version", [{ type: "prose", body: "The declarative page wins." }]),
    );
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, SOURCES_LOCALE, "json-only.json"),
      jsonDocument("JSON only", []),
    );
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, SOURCES_LOCALE, "offerings", "json-only.json"),
      jsonDocument("Nested JSON only", [{ type: "divider" }]),
    );
    write(path.join(root, "content", "pages", "json", SOURCES_SITE, SOURCES_LOCALE, "zz-invalid.json"), "{}\n");
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, SOURCES_LOCALE, "zz-broken.json"),
      '{ "schemaVersion": 1, "title": "Broken",\n',
    );
    // NOT page sources: files planted OUTSIDE the two mode roots, one with a route that
    // also exists as a real page (it must not shadow it) and one with a route that
    // exists nowhere else (it must publish nothing at all).
    write(
      path.join(root, "content", "pages", SOURCES_SITE, SOURCES_LOCALE, "about.md"),
      "---\ntitle: Collection-path about\n---\n\nThis must never be served.\n",
    );
    write(
      path.join(root, "content", "pages", SOURCES_SITE, SOURCES_LOCALE, "zz-shadow.md"),
      "---\ntitle: Collection-path only\n---\n\nThis must never be served.\n",
    );
    // An EMPTY locale directory must publish nothing.
    write(path.join(root, "content", "pages", "markdown", SOURCES_SITE, EMPTY_LOCALE_NAME, ".gitkeep"), "");

    // ── TEMPLATE-PV-A1 — THE PUBLICATION CONTRACT (all inside this suite's own site tree) ────────────────
    // An ordinary unlisted page, an explicitly public one, and a NESTED unlisted one: the rule is about the
    // DOCUMENT that answers a route, not about its depth or its filename.
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, PUBLICATION_LOCALE, "unlisted-page.json"),
      jsonDocument("Unlisted page", [{ type: "prose", body: "Served, never advertised." }], "unlisted"),
    );
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, PUBLICATION_LOCALE, "public-page.json"),
      jsonDocument("Declared public", [{ type: "prose", body: "Advertised as always." }], "public"),
    );
    write(
      path.join(
        root,
        "content",
        "pages",
        "json",
        SOURCES_SITE,
        PUBLICATION_LOCALE,
        "offerings",
        "unlisted-nested.json",
      ),
      jsonDocument("Unlisted nested page", [{ type: "divider" }], "unlisted"),
    );
    // PRECEDENCE DECIDES PUBLICATION. Both of these routes exist in BOTH modes, and the WINNER's document
    // decides: a JSON document that is unlisted hides a Markdown page that would have been public, and a JSON
    // document that declares nothing publishes exactly as before.
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, PUBLICATION_LOCALE, "hidden-winner.json"),
      jsonDocument("JSON winner (unlisted)", [{ type: "prose", body: "The declarative page wins." }], "unlisted"),
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, PUBLICATION_LOCALE, "hidden-winner.md"),
      "# Markdown loser\n\nA Markdown page that LOSES to the JSON document above.\n",
    );
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, PUBLICATION_LOCALE, "public-winner.json"),
      jsonDocument("JSON winner (silent)", [{ type: "prose", body: "The declarative page wins." }]),
    );
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, PUBLICATION_LOCALE, "public-winner.md"),
      "# Markdown loser\n\nA Markdown page that loses to the JSON document above.\n",
    );
    // A plain Markdown page: the Markdown mode has no visibility vocabulary, so this is public and carries
    // nothing about publication at all.
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, PUBLICATION_LOCALE, "plain-markdown.md"),
      "# Plain Markdown\n\nAlways public.\n",
    );
    // The RESERVED home document may not be unlisted — refused when it is READ, so discovery fails loudly rather
    // than silently publishing (or hiding) a Site root.
    write(
      path.join(root, "content", "pages", "json", SOURCES_SITE, UNLISTED_HOME_LOCALE, "home.json"),
      jsonDocument("Unlisted home", [], "unlisted"),
    );
    // A Markdown page that declares a visibility: the key is unsupported METADATA in this mode, and the author is
    // told rather than served a page whose publication state nobody declared.
    write(
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, MARKDOWN_VISIBILITY_LOCALE, "notes.md"),
      "# Notes\n\nAlways public.\n",
    );
    write(
      path.join(
        root,
        "content",
        "pages",
        "markdown",
        SOURCES_SITE,
        MARKDOWN_VISIBILITY_LOCALE,
        "declares-visibility.md",
      ),
      "---\ntitle: Declares visibility\nvisibility: unlisted\n---\n\nThis page declares a property its mode does not have.\n",
    );
  });

  afterAll(() => {
    for (const directory of createdDirectories) {
      rmSync(directory, { recursive: true, force: true });
    }
    // The EMPTY locale directory is a fixture too.
    rmSync(path.join(root, "content", "pages", "markdown", SOURCES_SITE, EMPTY_LOCALE_NAME), {
      recursive: true,
      force: true,
    });
    // …then remove the suite's OWN fixture site tree wholesale: `hm` exists only for this suite
    // (no adopter authors Heard-Island pages), so a run can never leave a fixture directory behind.
    for (const directory of [
      path.join(root, "content", "pages", "markdown", SOURCES_SITE),
      path.join(root, "content", "pages", "json", SOURCES_SITE),
      path.join(root, "content", "pages", SOURCES_SITE),
    ]) {
      rmSync(directory, { recursive: true, force: true });
    }
    try {
      rmdirSync(path.join(root, "content", "pages", SOURCES_SITE, SOURCES_LOCALE));
    } catch {
      /* not empty, or already gone: leave it exactly as it is */
    }
    // The default-locale fixtures, flat and nested.
    for (const file of [
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, "en", "zz-fallback.md"),
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, "en", "offerings", "fallback-page.md"),
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, "en", "offerings", "shared.md"),
    ]) {
      rmSync(file, { force: true });
    }
    // Remove a directory ONLY if the fixture left it empty — never a recursive delete,
    // so a developer's own pages in that directory are safe.
    for (const directory of [
      path.join(root, "content", "pages", "markdown", SOURCES_SITE, "en", "offerings"),
      path.join(root, "content", "pages", "markdown", "en"),
    ]) {
      try {
        rmdirSync(directory);
      } catch {
        /* not empty (or already gone): leave it exactly as it is */
      }
    }
  });

  it("resolves a safe Markdown page from the first-class root", async () => {
    const page = await sources.resolve(SOURCES_SITE, "about", SOURCES_LOCALE);
    expect(page).toMatchObject({
      kind: "markdown",
      title: "About",
      locale: SOURCES_LOCALE,
      fallback: false,
    });
    expect(bodyOf(page)).toContain("A safe Markdown page.");
  });

  it("resolves a NESTED page through the same composition", async () => {
    const page = await sources.resolve(SOURCES_SITE, "offerings/website-design", SOURCES_LOCALE);
    expect(page).toMatchObject({
      kind: "markdown",
      routePath: "offerings/website-design",
      title: "Website design",
      locale: SOURCES_LOCALE,
      fallback: false,
    });
    expect(bodyOf(page)).toContain("A nested page.");
  });

  it("publishes NOTHING from an obsolete collection-shaped path, and lets it shadow no page", async () => {
    // The same route exists as a file under `content/pages/<locale>/`; the real page
    // still wins, and a path that is not one of the two mode roots is never consulted.
    const page = await sources.resolve(SOURCES_SITE, "about", SOURCES_LOCALE);
    expect(page?.title).toBe("About");
    expect(bodyOf(page)).toContain("A safe Markdown page.");
    expect(bodyOf(page)).not.toContain("This must never be served.");

    // A route that exists ONLY there is not a page at all.
    expect(await sources.resolve(SOURCES_SITE, "zz-shadow", SOURCES_LOCALE)).toBeNull();
  });

  it("falls back to the default locale last, and marks it — nested routes included", async () => {
    expect(await sources.resolve(SOURCES_SITE, "zz-fallback", SOURCES_LOCALE)).toMatchObject({
      kind: "markdown",
      locale: "en",
      fallback: true,
    });
    expect(await sources.resolve(SOURCES_SITE, "offerings/fallback-page", SOURCES_LOCALE)).toMatchObject({
      kind: "markdown",
      routePath: "offerings/fallback-page",
      locale: "en",
      fallback: true,
    });
  });

  it("lets an exact-locale nested page beat a default-locale one", async () => {
    // `offerings/shared` exists in BOTH locales: the visitor asked for SOURCES_LOCALE,
    // so that locale's page answers even though the default locale has one too.
    const page = await sources.resolve(SOURCES_SITE, "offerings/shared", SOURCES_LOCALE);
    expect(page).toMatchObject({ locale: SOURCES_LOCALE, fallback: false });
    expect(bodyOf(page)).toContain("Only in the requested locale.");
  });

  it("lets a JSON page win over Markdown and serve its validated document", async () => {
    // JSON beats Markdown within a locale, so this route has a JSON winner: the body the
    // Markdown file declares is never served.
    const page = await sources.resolve(SOURCES_SITE, "both", SOURCES_LOCALE);
    expect(page).toMatchObject({ kind: "json", locale: SOURCES_LOCALE, fallback: false });
    if (page === null || page.kind !== "json") throw new Error("expected the JSON page");
    expect(page.title).toBe("JSON version");
    expect(page.document.sections).toHaveLength(1);
    expect(page.document.sections[0]).toMatchObject({ type: "prose", body: "The declarative page wins." });

    // A JSON-only route resolves the same way, as does a NESTED one: the rule is about
    // the route, not its depth.
    expect((await sources.resolve(SOURCES_SITE, "json-only", SOURCES_LOCALE))?.kind).toBe("json");
    const nested = await sources.resolve(SOURCES_SITE, "offerings/json-only", SOURCES_LOCALE);
    expect(nested).toMatchObject({ kind: "json", routePath: "offerings/json-only" });
  });

  it("stops loudly when a JSON file is invalid or malformed, naming the file and the property", async () => {
    // Valid JSON that is not a valid DOCUMENT: the schema says which property is wrong.
    // S1 — the message names the file INSIDE its site tree: `<mode>/<site>/<locale>/<route>`.
    await expect(sources.resolve(SOURCES_SITE, "zz-invalid", SOURCES_LOCALE)).rejects.toThrow(
      new RegExp(
        `json[\\\\/]${SOURCES_SITE}[\\\\/]${SOURCES_LOCALE}[\\\\/]zz-invalid\\.json`,
      ),
    );
    await expect(sources.resolve(SOURCES_SITE, "zz-invalid", SOURCES_LOCALE)).rejects.toThrow(/schemaVersion/);
    // Broken JSON SYNTAX is a different, equally loud failure.
    await expect(sources.resolve(SOURCES_SITE, "zz-broken", SOURCES_LOCALE)).rejects.toThrow(/Invalid JSON in page/);
  });

  it("lists every publishable route for a configured locale, nested paths included", async () => {
    // The inventory is PER LOCALE: a default-locale page (`offerings/fallback-page`,
    // which this locale resolves through fallback) is not listed as this locale's own.
    // Discovery reports what the TREE holds, so a file whose contents are invalid is
    // still a route — validity is decided when it is read, not when it is found.
    expect(await sources.listRoutes(SOURCES_SITE, SOURCES_LOCALE)).toEqual([
      "about",
      "both",
      "json-only",
      "offerings",
      "offerings/json-only",
      "offerings/shared",
      "offerings/website-design",
      "zz-broken",
      "zz-invalid",
    ]);
    // A README (at ANY level), a `.gitkeep`-only directory and an obsolete
    // collection-shaped path are never listed.
    const routes = await sources.listRoutes(SOURCES_SITE, SOURCES_LOCALE);
    expect(routes).not.toContain("zz-shadow");
    expect(routes).not.toContain("README");
    expect(routes).not.toContain("offerings/README");
    expect(await sources.listRoutes(SOURCES_SITE, EMPTY_LOCALE_NAME)).toEqual([]);
  });

  /**
   * TEMPLATE-PV-A1 — SERVABILITY AND PUBLICATION ARE TWO ANSWERS ABOUT THE SAME ROUTE
   * =================================================================================
   *
   * The fixtures above live in the same tree as the precedence fixtures, so the publication rule is proven on the
   * real layout this composition reads — including the case that cannot be decided from filenames at all: a route
   * whose JSON and Markdown sources DISAGREE about publication.
   */
  it("serves an unlisted page at its exact URL and keeps it out of the published inventory", async () => {
    const page = await sources.resolve(SOURCES_SITE, "unlisted-page", PUBLICATION_LOCALE);
    expect(page).toMatchObject({ kind: "json", routePath: "unlisted-page" });
    if (page === null || page.kind !== "json") throw new Error("expected the JSON page");
    expect(page.title).toBe("Unlisted page");
    expect(page.visibility).toBe("unlisted");
    // The page's OWN content is untouched: it is served exactly as authored, not degraded.
    expect(page.document.sections[0]).toMatchObject({ type: "prose", body: "Served, never advertised." });

    // BOTH inventories report it, so existence and publication are genuinely two answers.
    expect(await sources.listRoutes(SOURCES_SITE, PUBLICATION_LOCALE)).toContain("unlisted-page");
    expect(await sources.listPublicRoutes(SOURCES_SITE, PUBLICATION_LOCALE)).not.toContain("unlisted-page");
    expect(await sources.isUnlistedRoute(SOURCES_SITE, "unlisted-page", PUBLICATION_LOCALE)).toBe(true);
  });

  it("publishes the whole inventory MINUS the unlisted documents — and nothing else", async () => {
    // Reported EXACTLY, against the tree this suite authored: `listRoutes` (what EXISTS, and what the route
    // serves) still holds every one of these routes…
    expect(await sources.listRoutes(SOURCES_SITE, PUBLICATION_LOCALE)).toEqual([
      "hidden-winner",
      "offerings/unlisted-nested",
      "plain-markdown",
      "public-page",
      "public-winner",
      "unlisted-page",
    ]);
    // …and the published inventory is the same list MINUS the three documents that asked not to be advertised.
    expect(await sources.listPublicRoutes(SOURCES_SITE, PUBLICATION_LOCALE)).toEqual([
      "plain-markdown",
      "public-page",
      "public-winner",
    ]);

    // `public` is a DECLARATION, not a special case, and a document that declares nothing is public too: both are
    // published, and neither is reported as unlisted — Markdown included, which has no vocabulary at all.
    for (const routePath of ["public-page", "public-winner", "plain-markdown"]) {
      expect(await sources.isUnlistedRoute(SOURCES_SITE, routePath, PUBLICATION_LOCALE), routePath).toBe(false);
    }
    expect((await sources.resolve(SOURCES_SITE, "public-page", PUBLICATION_LOCALE))?.kind).toBe("json");
  });

  it("decides publication by the document that WINS source resolution, never by a filename", async () => {
    // JSON over Markdown, so this route's publication follows the WINNING JSON document…
    expect(await sources.isUnlistedRoute(SOURCES_SITE, "hidden-winner", PUBLICATION_LOCALE)).toBe(true);
    expect((await sources.resolve(SOURCES_SITE, "hidden-winner", PUBLICATION_LOCALE))?.kind).toBe("json");
    // …while a Markdown document that is NOT shadowed keeps the ordinary public behaviour.
    expect(await sources.isUnlistedRoute(SOURCES_SITE, "public-winner", PUBLICATION_LOCALE)).toBe(false);

    // The Markdown mode has no visibility vocabulary at all: there is nothing on a Markdown page to read, so it
    // can never hide itself.
    const markdown = await sources.resolve(SOURCES_SITE, "plain-markdown", PUBLICATION_LOCALE);
    expect(markdown?.kind).toBe("markdown");
    expect(markdown !== null && "visibility" in markdown).toBe(false);
    expect(await sources.isUnlistedRoute(SOURCES_SITE, "plain-markdown", PUBLICATION_LOCALE)).toBe(false);
  });

  it("fails LOUDLY when a route in the inventory cannot be interpreted — never silently publishes it", async () => {
    // This suite deliberately plants a schema-invalid document and a syntactically broken one. `listRoutes`
    // reports both (existence is not validity), so the published inventory MUST refuse to answer rather than
    // advertise a URL it cannot vouch for — the same loud failure a request would get.
    await expect(sources.listPublicRoutes(SOURCES_SITE, SOURCES_LOCALE)).rejects.toThrow(/zz-broken|zz-invalid/);
  });

  it("publishes nothing where the site or the locale is not configured, exactly as `listRoutes` does", async () => {
    const configuredOnly = createPageSources({ sites: [] });
    expect(await configuredOnly.listPublicRoutes(SOURCES_SITE, SOURCES_LOCALE)).toEqual([]);
    expect(await sources.listPublicRoutes(SOURCES_SITE, EMPTY_LOCALE_NAME)).toEqual([]);
    // An unconfigured (site, locale) is not a page request at all, so no publication question is answered.
    expect(await sources.isUnlistedRoute(SOURCES_SITE, "unlisted-page", EMPTY_LOCALE_NAME)).toBe(false);
    expect(await configuredOnly.isUnlistedRoute(SOURCES_SITE, "unlisted-page", SOURCES_LOCALE)).toBe(false);
  });

  it("refuses an unlisted RESERVED home document when it is read — discovery fails loudly, never silently", async () => {
    // The route still EXISTS (validity is decided when a source is read, not when it is found)…
    expect(await sources.listRoutes(SOURCES_SITE, UNLISTED_HOME_LOCALE)).toContain("home");
    // …and reading it fails, naming the FILE and the property, so a Site root can never be hidden from discovery.
    await expect(sources.resolve(SOURCES_SITE, "home", UNLISTED_HOME_LOCALE)).rejects.toThrow(/visibility/);
    await expect(sources.resolve(SOURCES_SITE, "home", UNLISTED_HOME_LOCALE)).rejects.toThrow(
      new RegExp(`json[\\\\/]${SOURCES_SITE}[\\\\/]${UNLISTED_HOME_LOCALE}[\\\\/]home\\.json`),
    );
    // The published inventory asks the same question, so a build FAILS rather than publishing a root it cannot
    // honour — and it never quietly drops the root instead.
    await expect(sources.listPublicRoutes(SOURCES_SITE, UNLISTED_HOME_LOCALE)).rejects.toThrow(/unlisted/);
  });

  it("keeps the Markdown metadata vocabulary exactly as it was — a visibility key there is refused", async () => {
    // A Markdown page is public, and carries no publication property at all.
    expect(await sources.isUnlistedRoute(SOURCES_SITE, "notes", MARKDOWN_VISIBILITY_LOCALE)).toBe(false);
    // Declaring one is unsupported METADATA in that mode: the author is told, rather than served a page whose
    // publication state nobody declared.
    await expect(
      sources.resolve(SOURCES_SITE, "declares-visibility", MARKDOWN_VISIBILITY_LOCALE),
    ).rejects.toThrow(/Unsupported metadata "visibility"/);
  });

  it("publishes NOTHING for a locale the site does not configure", async () => {
    const configuredOnly = createPageSources({ sites: [] });
    expect(await configuredOnly.resolve(SOURCES_SITE, "about", SOURCES_LOCALE)).toBeNull();
    expect(await configuredOnly.listRoutes(SOURCES_SITE, SOURCES_LOCALE)).toEqual([]);
  });

  it("returns null for a page that exists nowhere, and for an unusable route", async () => {
    expect(await sources.resolve(SOURCES_SITE, "does-not-exist", SOURCES_LOCALE)).toBeNull();
    expect(await sources.resolve(SOURCES_SITE, "about", "zz-unknown")).toBeNull();
    for (const attempt of ["../about", "offerings/../../about", "offerings/", "/about", "README"]) {
      expect(await sources.resolve(SOURCES_SITE, attempt, SOURCES_LOCALE), attempt).toBeNull();
    }
  });
});
