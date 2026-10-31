import { existsSync, mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  captureProductionStateManifest,
  productionStateDrift,
} from "../../../tests/support/production-state-manifest";
import { selectDisposableDeploymentCopy } from "../../../tests/support/disposable-deployment";
// M21 — the locale root is proved content-first STRUCTURALLY: the declarative composer's own section
// markers are present, the outline is valid, and the starter homepage is absent. The page's words are
// never read (`AGENTS.md` §14).
import { declarativeSectionCount, headingLevels, headingOutlineIssues } from "../support/rendered-structure";

// DEPLOYMENT SCOPE — this test asserts THIS deployment's own configuration, content and assets, so it
// lives in the deployment capsule (`deployment/tests/**`, FOUNDATION-DEPLOYMENT-ISO-B2A) and runs in the
// `deployment` Vitest project, whose setup selects the REAL installed deployment
// (`tests/setup/real-deployment.ts`, ISO-H2).
//
// WHERE IT WRITES (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
// -------------------------------------------------
// The authoring model is proved by PLANTING pages, so this suite needs writable deployment state — and a
// deployment's shipped configuration, dictionaries, pages and artwork are not writable fixture space
// (ISO-C1 showed why: cleanup is best-effort, and residue in a real page tree is damage, not untidiness).
// The suite therefore selects a DISPOSABLE, byte-identical COPY of the deployment the authority chose
// (`tests/support/disposable-deployment.ts` → the `override` layout, ISO-B1/H2) and plants every fixture
// there. The real deployment stays the SUBJECT — it is read for the copy's source and proved unchanged at
// the end of the run — while the only writable thing in the run is a temp copy that is deleted afterwards.

// A page route signals "nothing answers this URL" through `notFound()`. In a node
// test that is a controlled signal, so it is stubbed — which also lets the
// not-found path be asserted directly.
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  },
}));

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "foundation-template.provelopment.com",
      "x-foundation-spoke-segment": "foundation",
    }),
}));

// The copy must be selected BEFORE anything reads the config surface, and this project's setup file has
// already read it once (it asserted the REAL deployment) — so the app modules are loaded AFTER a module
// reset, which is what makes them describe the copy rather than the instances the setup warmed.
// R04-C14 — the copy keeps its EFS declaration. An EFS authoring proof that removed the publication
// authority would be asking the legacy resolver to answer for EFS, which is the defect this increment ends.
const disposable = selectDisposableDeploymentCopy({ preserveEfs: true });
vi.resetModules();

const page = await import("@/app/[[...segments]]/page");
const PageRoute = page.default;
const { generateMetadata } = page;
// M17 — the discovered PUBLIC route inventory is a DOMAIN capability now, not an App Router static identity:
// the page route generates nothing (the same pathname is rendered per host), and the inventory the sitemap
// publishes is composed from the request-selected Spoke's own configuration.
const publicRouteInventory = async (): Promise<{ segments: string[] }[]> => {
  const { staticParamsForContext, spokeServerComposition } = await import(
    '@/app/[[...segments]]/server-composition'
  );
  const { foundationSpoke } = await import('../support/spoke-contexts');
  return staticParamsForContext(spokeServerComposition(foundationSpoke.context));
};
const sitemap = (await import("@/app/sitemap")).default;
const { createPageSources } = await import("@/adapters/content/page-sources");
// M18 — a multi-Spoke Installation has no installation-wide configuration, so this suite names the Spoke
// whose authored pages it plants fixtures beside: the FOUNDATION Spoke (`ww`). The Germany Spoke's own
// authoring is proved by `deployment/tests/unit/m18-germany-spoke.test.ts`.
const { foundationConfig: siteConfig, foundationSpoke } = await import("../support/spoke-contexts");
const { HOME_CONTENT_SLUG } = await import("@/core/page-content");
const { resolveSites } = await import("@/core/site");

/**
 * R04-C14 — THE EFS AUTHORING FIXTURE
 * =================================================================================================
 *
 * A Page is public for exactly ONE reason: an Entity → Facet → Site DECLARATION names it and its
 * representation sits under THAT owner's capsule path. Nothing here is discovered from a file's presence in
 * the legacy page trees, and the copy's legacy runtime is switched OFF — so an undeclared file has no
 * authority that could publish it.
 *
 * The declaration is written into the COPY's manifest, validated with the PRODUCTION validator before use,
 * and restored byte-for-byte in `afterAll`. The shipped reference deployment is never opened for writing.
 */
const { validateEfsManifest } = await import("@/config/efs/manifest");
const { efsRuntimeDeclared } = await import("@/app/[[...segments]]/efs-request");

const EFS_HOST = "foundation-template.provelopment.com";
const EFS_ORIGIN = `https://${EFS_HOST}`;
const EFS_LOCALE = siteConfig.defaultSite.defaultLocale;
const EFS_FLAT_PAGE_ID = "zz-authoring-flat";
const EFS_FLAT_ROUTE = [EFS_FLAT_PAGE_ID] as const;
const EFS_NESTED_SECTION = "zz-section";
const EFS_NESTED_PAGE_ID = "zz-authoring-nested";
const EFS_NESTED_ROUTE = [EFS_NESTED_SECTION, EFS_NESTED_PAGE_ID] as const;
/** A source that EXISTS under a real owner but is declared by NO Page: it must stay private. */
const EFS_UNDECLARED_PAGE_ID = "zz-undeclared-page";
/** A Page the GERMANY publication declares: the Foundation host must never resolve it. */
const EFS_OTHER_OWNER_PAGE = "berlin";
/** R04-C15 — a nested Page whose capsule holds a JSON document AND a Markdown competitor. */
const EFS_JSON_PAGE_ID = "zz-authoring-json";
const EFS_JSON_ROUTE = [EFS_NESTED_SECTION, EFS_JSON_PAGE_ID] as const;
/** R04-C15 — a Page whose declared source is REFUSED; declared only inside the test that needs it. */
const EFS_INVALID_PAGE_ID = "zz-invalid";

const EFS_MANIFEST_PATH = path.join(disposable.root, "efs", "manifest.json");
const EFS_CAPSULE_ROOT = path.join(disposable.root, "efs", "capsule");

/** A Site-closed EFS URL is `/<locale>/<route…>`: there is no Site segment to spell (D40). */
const efsParams = (...route: readonly string[]) => ({
  params: Promise.resolve({ segments: [EFS_LOCALE, ...route] }),
});

/** The public path of an EFS Page on this binding, without the origin. */
const efsPath = (...route: readonly string[]) => `/${[EFS_LOCALE, ...route].join("/")}`;

/** The subset of the manifest this fixture authors, typed narrowly so no `any` reaches the test. */
interface MutablePage {
  id: string;
  route: string[];
  representations: { locale: string }[];
}
interface MutableSite {
  id: string;
  pages: MutablePage[];
}
interface MutableFacet {
  id: string;
  sites: MutableSite[];
}
interface MutableEntity {
  id: string;
  facets: MutableFacet[];
}
interface MutableManifest {
  entities: MutableEntity[];
  publications: {
    entityId: string;
    facetId: string;
    bindings: {
      readonly host: string;
      readonly siteIds: string[];
      readonly defaultSiteId?: string;
      readonly canonical?: boolean;
    }[];
  }[];
}

/**
 * THE LOCALE ROOT IS CONTENT-FIRST, PROVED STRUCTURALLY (M21).
 *
 * The JSON authoring mode stamps one contiguous `page-section-<n>` id per authored section, so a
 * rendered locale root carrying 1..N proves the DECLARATIVE DOCUMENT was composed — while the starter
 * homepage marker is absent. Not one authored word is read: the page's copy is the owner's business.
 */
function declarativeCompositionIssues(html: string): readonly string[] {
  const issues: string[] = [];
  if (declarativeSectionCount(html) <= 1) issues.push("the declarative document was not composed");
  if (html.includes("home-hero")) issues.push("the starter homepage rendered instead");
  issues.push(...headingOutlineIssues(headingLevels(html)));
  return issues;
}

/**
 * THE POSTCONDITION, TAKEN TWICE (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 *
 * Once here: the REAL deployment's authored state, before any fixture is planted. Once in `afterAll`:
 * the same state, after everything this suite did. The whole `deployment` project is already bracketed
 * by `tests/setup/production-state-integrity.ts`; this file — the one that plants fixtures — asserts it
 * for ITSELF as well, so the file that used to write into the real page tree now proves, locally, that it
 * cannot: every mutable path it touches is inside the copy.
 */
const shippedBefore = captureProductionStateManifest(disposable.sourceRoot);
/**
 * R04-C15 — THE EFS DECLARATION IS PROTECTED TOO, AS A SEPARATE SNAPSHOT.
 *
 * The shared default deliberately excludes `efs/` (it is the publication authority other suites assert
 * against). This file now writes a manifest and a capsule in a DISPOSABLE copy, so it takes the stricter view
 * of its own subject as well: the shipped Installation's manifest, every representation and every asset are
 * compared byte-for-byte, in addition to the authored surfaces above.
 */
const efsDeclarationBefore = captureProductionStateManifest(disposable.sourceRoot, ["efs"]);
/**
 * THE ONE PAGE MODEL, THROUGH THE REAL APPLICATION (FOUNDATION-PAGES-A1/A1E).
 *
 * A1E succeeds only if a REAL file under `content/pages/markdown/<locale>/…`
 * produces a REAL generated page — a static route, its metadata, its sitemap entry —
 * through the normal Foundation application, at ANY depth, without a bespoke route or
 * a second content store. These fixtures prove in particular:
 *
 *   · a NESTED page (`zz-section/website-design.md`) is discovered, statically
 *     generated, served and sitemapped exactly like a top-level one;
 *   · a nested JSON page is ordered above Markdown and stops the build naming the file
 *     (the JSON vocabulary is A2's);
 *   · the document capability an author uses survives routing (a heading fragment on a
 *     NESTED page is reachable);
 *   · a page-shaped file OUTSIDE the two mode roots publishes NOTHING (no route, no
 *     sitemap entry, a 404), and so do an EMPTY locale directory and an UNCONFIGURED
 *     one;
 *   · the locale root still renders the authored home page content-first.
 *
 * Every fixture here is created and removed by THIS suite, inside the DISPOSABLE COPY of the selected
 * deployment it plants them in (see WHERE IT WRITES above); the real deployment's authored reference pages
 * are never opened for writing at all, so a run can neither overwrite nor delete shipped content. Removal
 * is then ASSERTED, not assumed (ISO-C1A1): a run that leaves a fixture file or directory behind FAILS.
 */
/**
 * WHERE THESE FIXTURES GO (FOUNDATION-DEPLOYMENT-ISO-B2A, re-pointed by ISO-B3C2B)
 * ------------------------------------------------------------------------------
 * The deployment's authoring roots are asked of the ONE deployment-root authority
 * (`@/config/deployment-root`, ISO-B1) — never spelled as a repository-root path here — so a run
 * fixture is planted in that deployment's own page tree wherever the deployment is kept, and never in
 * a path this file invented. The authority now answers with the disposable copy this file selected, and
 * the assertion below refuses to continue if it answers with anything else.
 */
const copyPaths = foundationSpoke;
if (path.resolve(copyPaths.root) !== path.resolve(disposable.root)) {
  throw new Error(
    "FOUNDATION-DEPLOYMENT-ISO-B3C2B: this suite plants fixtures into a disposable copy of the selected " +
      `deployment, but the runtime authority answers with "${copyPaths.root}" instead of ` +
      `"${disposable.root}". Refusing to run: a writable authoring experiment must never touch the real ` +
      "deployment.",
  );
}
const PAGES_ROOT = path.dirname(copyPaths.markdownPagesRoot);
const MARKDOWN_PAGES_ROOT = copyPaths.markdownPagesRoot;
const JSON_PAGES_ROOT = copyPaths.jsonPagesRoot;

// S1 - these fixtures live in ONE site tree: the deployment default site.
const SITE = siteConfig.defaultSite.code;
const LOCALE = siteConfig.defaultSite.defaultLocale;
const MARKDOWN_SLUG = "zz-authoring-fixture";
const HOME_FIXTURE = "zz-home-fixture";
// A nested section, so the whole chain (discovery → params → route → sitemap) is
// exercised at a depth greater than one.
const NESTED_SECTION = "zz-section";
const NESTED_SLUG = "website-design";
const NESTED_ROUTE_PATH = `${NESTED_SECTION}/${NESTED_SLUG}`;
const NESTED_JSON_SLUG = "zz-json-only";
// A file planted outside the two mode roots.
const OUTSIDE_ROOT_SLUG = "zz-outside-root-fixture";
const EMPTY_LOCALE_NAME = "zz-empty";
// A well-formed language tag that the site does NOT configure (subtags are 2–8
// characters), holding a page that must therefore never be published.
const UNCONFIGURED_LOCALE_NAME = "zz-unconf";
// Fixture identities a `finally`-cleaned probe needs again as a PATH, so the residue
// postcondition below and the probe itself name the same file (never two literals).
// `gs` is a recognized country code no other suite uses.
const HOME_FIXTURE_SITE = "gs";
const HOME_FIXTURE_LOCALE = "zz-home";
const UNCONFIGURED_LOCALE_PAGE = "a-page.md";
// A declarative document that does NOT satisfy the vocabulary: refused by name.
const INVALID_JSON_SLUG = "zz-invalid";

const MARKDOWN_LOCALE_DIRECTORY = path.join(MARKDOWN_PAGES_ROOT, SITE, LOCALE);
const EMPTY_LOCALE_DIRECTORY = path.join(MARKDOWN_PAGES_ROOT, SITE, EMPTY_LOCALE_NAME);
const UNCONFIGURED_LOCALE_DIRECTORY = path.join(
  MARKDOWN_PAGES_ROOT,
  SITE,
  UNCONFIGURED_LOCALE_NAME,
);

const createdPaths = [
  path.join(MARKDOWN_LOCALE_DIRECTORY, `${MARKDOWN_SLUG}.md`),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_SLUG}.md`),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, "README.md"),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_JSON_SLUG}.md`),
  path.join(JSON_PAGES_ROOT, SITE, LOCALE, NESTED_SECTION, `${NESTED_JSON_SLUG}.json`),
  path.join(PAGES_ROOT, SITE, LOCALE, `${OUTSIDE_ROOT_SLUG}.md`),
];

/**
 * EVERY PATH THIS SUITE CREATES, and therefore every path it must leave nothing of
 * (ISO-C1A1). The fixture files first, then the directory chains only these fixtures ever
 * made — including the C1 residue chains `markdown/gs`, `markdown/main/en-001/zz-section`,
 * `json/main/en-001/zz-section` and `pages/main`.
 *
 * Directories the DEPLOYMENT itself ships are deliberately NOT listed: `markdown/main/en-001`
 * holds `about.md`, so this list is a claim about this suite's residue only. Every entry is
 * derived from the fixture identities above with `path.join`, so no machine-specific path
 * (and no second copy of a fixture name) appears here.
 */
const TEST_OWNED_PATHS = [
  ...createdPaths,
  path.join(MARKDOWN_LOCALE_DIRECTORY, `${HOME_CONTENT_SLUG}.md`),
  path.join(JSON_PAGES_ROOT, SITE, LOCALE, `${INVALID_JSON_SLUG}.json`),
  path.join(UNCONFIGURED_LOCALE_DIRECTORY, UNCONFIGURED_LOCALE_PAGE),
  path.join(
    MARKDOWN_PAGES_ROOT,
    HOME_FIXTURE_SITE,
    HOME_FIXTURE_LOCALE,
    `${HOME_CONTENT_SLUG}.md`,
  ),
  path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION),
  path.join(JSON_PAGES_ROOT, SITE, LOCALE, NESTED_SECTION),
  path.join(PAGES_ROOT, SITE),
  path.join(PAGES_ROOT, SITE, LOCALE),
  EMPTY_LOCALE_DIRECTORY,
  UNCONFIGURED_LOCALE_DIRECTORY,
  path.join(MARKDOWN_PAGES_ROOT, HOME_FIXTURE_SITE),
  path.join(MARKDOWN_PAGES_ROOT, HOME_FIXTURE_SITE, HOME_FIXTURE_LOCALE),
];

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/**
 * DECLARE two Pages on Foundation's own Site, and author their representations under THAT owner's capsule.
 *
 * Flat AND nested are both declared, because the route depth is a DECLARATION (`route: [...]`) rather than a
 * directory convention: the capsule keys a Page by its ID and the manifest owns the URL. A third source is
 * written WITHOUT any declaration, so "the file exists" can be proved to publish nothing at all.
 */
/** Everything the fixture creates, and everything its teardown must undo. */
interface EfsAuthoringFixture {
  readonly restore: () => void;
  readonly owned: readonly string[];
  readonly pagesDirectory: string;
  readonly owner: { readonly entityId: string; readonly facetId: string; readonly siteId: string };
  readonly declarationBefore: ReturnType<typeof captureProductionStateManifest>;
}

function authorEfsPages(): EfsAuthoringFixture {
  const manifestBefore = readFileSync(EFS_MANIFEST_PATH, "utf8");
  // R04-C15 — the whole `efs/` DECLARATION is snapshotted before the fixture writes anything, so restoration
  // can be PROVED afterwards: the manifest's bytes, every representation, every asset, and the absence of
  // anything this fixture added.
  const declarationBefore = captureProductionStateManifest(disposable.root, ["efs"]);
  const manifest = JSON.parse(manifestBefore) as MutableManifest;
  const publication = manifest.publications.find((candidate) =>
    candidate.bindings.some((binding) => binding.host === EFS_HOST),
  );
  if (!publication) throw new Error(`No publication claims ${EFS_HOST}.`);
  // R04-C15 — the Site comes from the BINDING's eligible Site IDs, never from "the first Site the facet
  // happens to declare": ownership and routing are the binding's answer, and this fixture must ask the same
  // authority the request path asks.
  const binding = publication.bindings.find(
    (candidate) => candidate.host === EFS_HOST && candidate.canonical !== false,
  );
  const eligible = binding?.siteIds ?? [];
  const entity = manifest.entities.find((candidate) => candidate.id === publication.entityId);
  const facet = entity?.facets.find((candidate) => candidate.id === publication.facetId);
  const site = facet?.sites.find((candidate) => eligible.includes(candidate.id));
  if (!entity || !facet || !site) {
    throw new Error(
      `The ${EFS_HOST} binding declares no eligible Entity → Facet → Site to author into.`,
    );
  }

  site.pages.push(
    { id: EFS_FLAT_PAGE_ID, route: [...EFS_FLAT_ROUTE], representations: [{ locale: EFS_LOCALE }] },
    { id: EFS_NESTED_PAGE_ID, route: [...EFS_NESTED_ROUTE], representations: [{ locale: EFS_LOCALE }] },
    // R04-C15 — a nested Page with TWO authored formats under one owner-scoped directory. JSON is the
    // declared higher-precedence source; the Markdown beside it must never be served.
    { id: EFS_JSON_PAGE_ID, route: [...EFS_JSON_ROUTE], representations: [{ locale: EFS_LOCALE }] },
  );
  // VALIDATED WITH THE PRODUCTION VALIDATOR. A fixture that wrote a declaration the platform itself would
  // refuse would prove nothing about authoring.
  const validated = validateEfsManifest(manifest);
  if (!validated.ok) throw new Error(`The authored manifest is invalid: ${validated.issues.join(" ")}`);
  writeFileSync(EFS_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const pagesDirectory = path.join(EFS_CAPSULE_ROOT, entity.id, facet.id, site.id, "pages");
  write(
    path.join(pagesDirectory, EFS_FLAT_PAGE_ID, `${EFS_LOCALE}.md`),
    [
      "---",
      "title: Authored fixture page",
      "description: A summary written by the author.",
      "---",
      "",
      "Ordinary **Markdown** with a [link](/about).",
      "",
      "| Day | Opens |",
      "| --- | --- |",
      "| Monday | 9:00 |",
      "",
      "See [details](#details-heading) below.",
      "",
      "## Details heading",
      "",
      "The paragraph the author's fragment link must reach.",
      "",
      "<script>window.__authorScript = true;</script>",
      "",
      '<div onclick="window.__authorHandler = true">raw html text</div>',
      "",
    ].join("\n"),
  );
  write(
    path.join(pagesDirectory, EFS_NESTED_PAGE_ID, `${EFS_LOCALE}.md`),
    [
      "# Nested fixture page",
      "",
      "See [the section](#nested-details).",
      "",
      "## Nested details",
      "",
      "Served at a nested route, with its own fragment target.",
      "",
    ].join("\n"),
  );
  write(
    path.join(pagesDirectory, EFS_UNDECLARED_PAGE_ID, `${EFS_LOCALE}.md`),
    "# Undeclared page\n\nThis must never be published.\n",
  );
  // R04-C15 — ONE Page, TWO authored formats, both owner-scoped. The JSON document is the declaration's
  // higher-precedence source; the Markdown beside it exists only to prove it is never served.
  write(
    path.join(pagesDirectory, EFS_JSON_PAGE_ID, `${EFS_LOCALE}.json`),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        title: "Nested JSON fixture page",
        sections: [{ type: "prose", heading: "Declarative", body: "The declarative page wins." }],
      },
      null,
      2,
    )}\n`,
  );
  write(
    path.join(pagesDirectory, EFS_JSON_PAGE_ID, `${EFS_LOCALE}.md`),
    "# Markdown competitor\n\nThe Markdown file must not be served.\n",
  );

  const owned = [
    EFS_FLAT_PAGE_ID,
    EFS_NESTED_PAGE_ID,
    EFS_UNDECLARED_PAGE_ID,
    EFS_JSON_PAGE_ID,
  ].map((page) => path.join(pagesDirectory, page));
  return {
    declarationBefore,
    pagesDirectory,
    owner: { entityId: entity.id, facetId: facet.id, siteId: site.id },
    restore: () => {
      for (const directory of owned) rmSync(directory, { recursive: true, force: true });
      writeFileSync(EFS_MANIFEST_PATH, manifestBefore, "utf8");
    },
    owned,
  };
}

let efsAuthoring: EfsAuthoringFixture;

/** Rewrite the copy's manifest through one mutation, validating it with the PRODUCTION validator. */
function editEfsManifest(mutate: (manifest: MutableManifest) => void): void {
  const manifest = JSON.parse(readFileSync(EFS_MANIFEST_PATH, "utf8")) as MutableManifest;
  mutate(manifest);
  const validated = validateEfsManifest(manifest);
  if (!validated.ok) throw new Error(`The edited manifest is invalid: ${validated.issues.join(" ")}`);
  writeFileSync(EFS_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

/** The ONE Site this fixture authors into — the binding's eligible Site, never "the first one". */
function authoredSite(manifest: MutableManifest): MutableSite {
  const { entityId, facetId, siteId } = efsAuthoring.owner;
  const site = manifest.entities
    .find((entity) => entity.id === entityId)
    ?.facets.find((facet) => facet.id === facetId)
    ?.sites.find((candidate) => candidate.id === siteId);
  if (!site) throw new Error("The authored Entity → Facet → Site is not in the manifest.");
  return site;
}

/**
 * R04-C15 — declare ONE extra Page for the duration of a single test, owned by the SAME Entity/Facet/Site.
 *
 * The diagnostic case's source is deliberately INVALID, and the sitemap loads every declared representation —
 * so a refused Page must not be in the manifest while any other test runs. It is declared here and removed in
 * the test's `finally`.
 */
function declareTransientEfsPage(pageId: string, route: readonly string[]): void {
  editEfsManifest((manifest) => {
    authoredSite(manifest).pages.push({
      id: pageId,
      route: [...route],
      representations: [{ locale: EFS_LOCALE }],
    });
  });
}

function undeclareTransientEfsPage(pageId: string): void {
  editEfsManifest((manifest) => {
    const site = authoredSite(manifest);
    site.pages = site.pages.filter((page) => page.id !== pageId);
  });
}

/** A minimal VALID declarative document, exactly as an author would write one. */
function jsonDocument(title: string, sections: readonly unknown[]): string {
  return `${JSON.stringify({ schemaVersion: 1, title, sections }, null, 2)}\n`;
}

/**
 * Remove a file, then the folders it needed ONLY while they are empty — never a
 * recursive delete and never past the page roots, so a developer's own pages are safe
 * and a run leaves no fixture directory behind.
 *
 * THE COMPARISON IS NORMALISED (ISO-C1). `@/config/deployment-root` publishes its
 * deployment-owned paths with FORWARD slashes (`${root}/content/pages/markdown`) while the
 * fixture paths above are composed with `path.join`, which uses the platform separator. On
 * Windows the raw `startsWith` therefore never matched, the walk pruned NOTHING, and every
 * directory this suite created stayed behind in the real deployment's page tree
 * (`markdown/gs/zz-home`, `markdown/main/en-001/zz-section`, `json/main/en-001/zz-section`, `ww/en`).
 * Comparing `path.resolve`d paths with an explicit separator boundary is correct on every
 * platform, and cannot match a sibling whose name merely shares a prefix.
 */
function cleanUp(file: string): void {
  rmSync(file, { force: true });
  const rootsDirectory = path.resolve(PAGES_ROOT);
  let directory = path.resolve(path.dirname(file));
  while (directory.startsWith(rootsDirectory + path.sep)) {
    try {
      rmdirSync(directory);
    } catch {
      /* not empty, or already gone: leave it exactly as it is */
    }
    directory = path.dirname(directory);
  }
}

/** The route params for a page URL, from its segments (`/en/a/b` → `["a","b"]`). */
const params = (...segments: string[]) => ({
  params: Promise.resolve({ segments: [SITE, LOCALE, ...segments] }),
});

const urlFor = (routePath: string) => `${siteConfig.url}/${SITE}/en/${routePath}`;

describe("the one page model, through the real application", () => {
  beforeAll(() => {
    // R04-C14 — the EFS declaration comes FIRST: it is the authority every EFS proof below asks, and the
    // legacy fixtures that follow are the remaining (not-yet-migrated) subject.
    efsAuthoring = authorEfsPages();
    // A flat page with hostile fragments in it, and an author's own fragment link.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, `${MARKDOWN_SLUG}.md`),
      [
        "---",
        "title: Authored fixture page",
        "description: A summary written by the author.",
        "---",
        "",
        "Ordinary **Markdown** with a [link](/about).",
        "",
        "| Day | Opens |",
        "| --- | --- |",
        "| Monday | 9:00 |",
        "",
        "See [details](#details-heading) below.",
        "",
        "## Details heading",
        "",
        "The paragraph the author's fragment link must reach.",
        "",
        "<script>window.__authorScript = true;</script>",
        "",
        '<div onclick="window.__authorHandler = true">raw html text</div>',
        "",
      ].join("\n"),
    );
    // A NESTED page: its URL is built from the folder it is authored in.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_SLUG}.md`),
      [
        "# Nested fixture page",
        "",
        "See [the section](#nested-details).",
        "",
        "## Nested details",
        "",
        "Served at a nested route, with its own fragment target.",
        "",
      ].join("\n"),
    );
    // Documentation beside nested pages is inert, not content.
    write(path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, "README.md"), "# Not a page\n");
    // A NESTED JSON page: a valid document, so it wins over the Markdown file with the
    // same route and is served by the declarative composer.
    write(
      path.join(JSON_PAGES_ROOT, SITE, LOCALE, NESTED_SECTION, `${NESTED_JSON_SLUG}.json`),
      jsonDocument("Nested JSON fixture page", [
        { type: "prose", body: "The declarative page wins." },
      ]),
    );
    // A Markdown file at the SAME nested route: never served while the JSON wins.
    write(
      path.join(MARKDOWN_LOCALE_DIRECTORY, NESTED_SECTION, `${NESTED_JSON_SLUG}.md`),
      "# Markdown version\n\nThe Markdown file must not be served.\n",
    );
    // A page-shaped file OUTSIDE the two mode roots: never a page source.
    write(
      path.join(PAGES_ROOT, SITE, LOCALE, `${OUTSIDE_ROOT_SLUG}.md`),
      `---\ntitle: Outside-root page\n---\n\nThis must never be published.\n`,
    );
    // An EMPTY locale directory, and a locale the site does not configure.
    mkdirSync(EMPTY_LOCALE_DIRECTORY, { recursive: true });
    write(path.join(UNCONFIGURED_LOCALE_DIRECTORY, UNCONFIGURED_LOCALE_PAGE), "# Not published\n");
  });

  afterAll(() => {
  // The directory fixtures go FIRST: while they exist their parents are not empty, so the
  // per-file walk below could not prune them.
  rmSync(EMPTY_LOCALE_DIRECTORY, { recursive: true, force: true });
  rmSync(UNCONFIGURED_LOCALE_DIRECTORY, { recursive: true, force: true });
  for (const file of createdPaths) cleanUp(file);

  // THE POSTCONDITION (ISO-C1A1). The cleanup above prunes directory by directory and stops
  // at the first parent that is not empty, swallowing the error that says so — which is
  // exactly how C1's path-comparison bug failed SILENTLY: the files went, the directories
  // stayed, every assertion in this file still passed, and residue accumulated in the real
  // deployment's page tree.
  //
  // So the suite now OBSERVES the result instead of trusting the walk: direct existence
  // checks on the paths it owns, deliberately not a rerun of `cleanUp`'s own arithmetic
  // (which would inherit any future bug in it). A leftover fixture file — or the smallest
  // leftover fixture directory — fails this file, whatever the cause, even though cleanup
  // itself reported success.
  // R04-C14 — undo the EFS declaration FIRST: the copy's manifest returns to its shipped bytes, and the
  // authored capsule directories are removed, before any residue is observed.
  efsAuthoring.restore();

  // R04-C15 — RESTORATION IS PROVED, NOT ASSUMED. The copy's entire `efs/` declaration (manifest bytes, every
  // original representation, every asset) must be byte-identical to what the Installation shipped, and nothing
  // the fixture added may still exist. This is also what proves the refused source and the Home competitor were
  // removed rather than merely unreferenced.
  const restorationDrift = productionStateDrift(
    efsAuthoring.declarationBefore,
    captureProductionStateManifest(disposable.root, ["efs"]),
  );
  expect(
    restorationDrift,
    `the fixture did not restore the copy's EFS declaration: ${restorationDrift.join(", ")}`,
  ).toEqual([]);

  const residue = [
    ...TEST_OWNED_PATHS,
    ...efsAuthoring.owned,
    // The Home Markdown competitor is created and removed by its own test; a leak fails HERE too.
    path.join(efsAuthoring.pagesDirectory, "home", `${EFS_LOCALE}.md`),
  ].filter((candidate) => existsSync(candidate));
  expect(
    residue,
    `fixture residue left in the copy's page tree: ${residue.join(", ")}`,
  ).toEqual([]);

  // AND THE BYTES OF THE REAL DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B3C2B). The copy is disposable, so
  // residue there is untidiness at worst — but the selected deployment is not, and THIS suite is the one
  // that used to write into its page tree. The manifest taken at import time is compared with the same
  // state now: one changed, added or removed authored byte fails this file, whatever caused it.
  const shippedDrift = productionStateDrift(
    shippedBefore,
    captureProductionStateManifest(disposable.sourceRoot),
  );
  expect(
    shippedDrift,
    `this suite mutated the selected deployment's authored state: ${shippedDrift.join(", ")}`,
  ).toEqual([]);

  // …and its EFS DECLARATION, which the shared default does not cover (R04-C15 §5): the shipped manifest's
  // bytes, all fourteen original representations and all four capsule assets must be untouched.
  const declarationDrift = productionStateDrift(
    efsDeclarationBefore,
    captureProductionStateManifest(disposable.sourceRoot, ["efs"]),
  );
  expect(
    declarationDrift,
    `this suite mutated the selected deployment's EFS declaration: ${declarationDrift.join(", ")}`,
  ).toEqual([]);

  // The temp copy is the only writable thing this run had; it goes last, so the assertion above is not
  // affected by its removal.
  disposable.cleanup();
});

  it("publishes a DECLARED flat Page and a DECLARED nested Page at their Site-closed URLs", async () => {
    // R04-C14 — A. The DECLARATION is the identity. Nothing is generated as a static App Router parameter
    // (the same pathname may be served by two hosts, M17), so what is proved is the declaration→route
    // relationship, measured through the real request boundary.
    expect((page as { generateStaticParams?: unknown }).generateStaticParams).toBeUndefined();
    expect(efsRuntimeDeclared()).toBe(true);

    expect(renderToStaticMarkup(await PageRoute(efsParams(...EFS_FLAT_ROUTE)))).toContain(
      "Authored fixture page",
    );
    expect(renderToStaticMarkup(await PageRoute(efsParams(...EFS_NESTED_ROUTE)))).toContain(
      "Nested fixture page",
    );

    // Both publish at exactly those URLs, and a Site-closed binding spells no Site segment.
    const paths = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    expect(paths).toContain(efsPath(...EFS_FLAT_ROUTE));
    expect(paths).toContain(efsPath(...EFS_NESTED_ROUTE));
  });

  it("serves the authored title and summary as the page's metadata", async () => {
    // B — the authored front matter IS the metadata, through the EFS route's own `generateMetadata`.
    const metadata = await generateMetadata(efsParams(...EFS_FLAT_ROUTE));
    expect(metadata.title).toBe("Authored fixture page");
    expect(metadata.description).toBe("A summary written by the author.");
    // The canonical identity is the Site-closed qualified URL, never a Site-prefixed one.
    expect(metadata.alternates?.canonical).toBe(`${EFS_ORIGIN}${efsPath(...EFS_FLAT_ROUTE)}`);

    // A nested page derives its title from its OWN representation, never from another Page's.
    const nested = await generateMetadata(efsParams(...EFS_NESTED_ROUTE));
    expect(nested.title).toBe("Nested fixture page");
    expect(nested.title).not.toBe(metadata.title);
    expect(nested.alternates?.canonical).toBe(`${EFS_ORIGIN}${efsPath(...EFS_NESTED_ROUTE)}`);
  });

  it("renders the authored Markdown page, with raw HTML inert", async () => {
    const html = renderToStaticMarkup(await PageRoute(efsParams(...EFS_FLAT_ROUTE)));

    expect(html).toContain("Authored fixture page");
    expect(html).toContain("<strong>Markdown</strong>");
    expect(html).toContain('<a href="/about">link</a>');
    // The hostile parts of the fixture are shown as TEXT, never as markup.
    //
    // R04-C14 — the EFS page legitimately carries the PLATFORM's own structured-data `<script
    // type="application/ld+json">`, so this asserts about the AUTHOR's payload, which is the obligation,
    // rather than banning every script element on a page the platform composes.
    expect(html).not.toContain("<script>window.__authorScript");
    expect(html).not.toMatch(/<script[^>]*>\s*window\.__authorScript/);
    expect(html).not.toMatch(/<[a-zA-Z][^>]*\son[a-z]+\s*=/i);
    // …and the payload survives as visible TEXT, which is what "inert, not dropped" means.
    expect(html).toContain("window.__authorScript");
  });

  it("renders the authored page's table and its own fragment target", async () => {
    const html = renderToStaticMarkup(await PageRoute(efsParams(...EFS_FLAT_ROUTE)));

    // The documented capability, through the EFS request boundary: a GFM table…
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Day</th>");
    expect(html).toContain("<td>Monday</td>");
    // …and a heading the author's own `[details](#details-heading)` can reach. The id is generated from the
    // heading's WORDS, so this asserts the RELATIONSHIP rather than one rendered level.
    expect(html).toMatch(/<h[1-6] id="details-heading">Details heading<\/h[1-6]>/);
    expect(html).toContain('<a href="#details-heading">details</a>');
  });

  it("serves a NESTED page through the same route, with its fragment target intact", async () => {
    // E — the nested identity is the declared route, resolved segment by segment.
    expect(EFS_NESTED_ROUTE).toHaveLength(2);
    const html = renderToStaticMarkup(await PageRoute(efsParams(...EFS_NESTED_ROUTE)));

    expect(html).toContain("Nested fixture page");
    expect(html).toContain("Served at a nested route, with its own fragment target.");
    // Nesting must not weaken the authoring capability: the generated heading id and the
    // author's fragment link work exactly as they do on a flat page.
    expect(html).toMatch(/<h[1-6] id="nested-details">Nested details<\/h[1-6]>/);
    expect(html).toContain('<a href="#nested-details">the section</a>');
  });

  it("never publishes a source that no Page declares, nor another owner's Page", async () => {
    // R04-C14 §4.11 — the isolation the fixture must guarantee. Both sources are real: one sits under this
    // owner's capsule with no declaration, the other is declared by the GERMANY publication. Neither may
    // become public on the Foundation host, and the legacy runtime is off, so nothing else can answer.
    await expect(PageRoute(efsParams(EFS_UNDECLARED_PAGE_ID))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(efsParams(EFS_OTHER_OWNER_PAGE))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(efsParams(...EFS_FLAT_ROUTE, "deeper"))).rejects.toThrow("NEXT_NOT_FOUND");

    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes(EFS_UNDECLARED_PAGE_ID))).toBe(false);
    expect(urls.some((url) => url.endsWith(`/${EFS_OTHER_OWNER_PAGE}`))).toBe(false);
  });

  it("orders JSON above Markdown at a NESTED route, and serves the JSON document", async () => {
    // R04-C15 — A. ONE Page, ONE owner-scoped directory, TWO authored formats. The declaration's JSON source is
    // the deciding one, and the Markdown beside it must never be served.
    const html = renderToStaticMarkup(await PageRoute(efsParams(...EFS_JSON_ROUTE)));
    expect(html).toContain("Nested JSON fixture page");
    expect(html).toContain("The declarative page wins.");
    expect(html).not.toContain("The Markdown file must not be served.");
    expect(html).not.toContain("Markdown competitor");

    // The multi-segment route resolves at its own canonical Site-closed URL…
    const metadata = await generateMetadata(efsParams(...EFS_JSON_ROUTE));
    expect(metadata.alternates?.canonical).toBe(`${EFS_ORIGIN}${efsPath(...EFS_JSON_ROUTE)}`);

    // …the sitemap advertises exactly that ONE public representation — not the competitor, and not a second
    // entry produced by the extra file…
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.filter((url) => url.includes(EFS_JSON_PAGE_ID))).toEqual([
      `${EFS_ORIGIN}${efsPath(...EFS_JSON_ROUTE)}`,
    ]);
    // …and no Page appears merely because a file exists: the competitor is not addressable in its own right.
    await expect(PageRoute(efsParams(...EFS_JSON_ROUTE, "markdown-competitor"))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("refuses an invalid Page document, naming the localized file and the property", async () => {
    // R04-C15 — B. The refusal comes from the SAME authority a request uses (`loadEfsPageSource`), so this is the
    // production decision, not a test-only check. A present-but-invalid JSON source is REFUSED: it must never be
    // silently abandoned in favour of the Markdown file written beside it.
    const directory = path.join(efsAuthoring.pagesDirectory, EFS_INVALID_PAGE_ID);
    const source = path.join(directory, `${EFS_LOCALE}.json`);
    const fallback = path.join(directory, `${EFS_LOCALE}.md`);
    // Declared inside the test only: the sitemap loads every DECLARED representation, so a refused source must
    // not exist while other tests run.
    declareTransientEfsPage(EFS_INVALID_PAGE_ID, [EFS_INVALID_PAGE_ID]);
    write(source, `${JSON.stringify({ schemaVersion: 2, title: "Wrong version", sections: [] }, null, 2)}\n`);
    write(fallback, "# Fallback\n\nAn invalid JSON source must never fall back to this file.\n");
    try {
      const refusal = await PageRoute(efsParams(EFS_INVALID_PAGE_ID)).then(
        () => null,
        (error: Error) => error.message,
      );
      expect(refusal, "an invalid Page document was served").not.toBeNull();
      // The localized source filename is named…
      expect(refusal).toContain(`${EFS_INVALID_PAGE_ID}/${EFS_LOCALE}.json`);
      // …and so is the property that is wrong.
      expect(refusal).toMatch(/schemaVersion/);
      // The Markdown fallback is never what answered.
      expect(refusal).not.toContain("Fallback");
    } finally {
      // ONLY what this test introduced, removed in an order that cannot leave a declared-but-sourceless Page.
      rmSync(directory, { recursive: true, force: true });
      undeclareTransientEfsPage(EFS_INVALID_PAGE_ID);
    }
    // Restoration is observable: with the declaration gone the route is simply not a Page.
    await expect(PageRoute(efsParams(EFS_INVALID_PAGE_ID))).rejects.toThrow("NEXT_NOT_FOUND");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => url.includes(EFS_INVALID_PAGE_ID))).toBe(false);
  });

  it("never publishes a README, in any shape, and never serves an unknown path", async () => {
    const generated = await publicRouteInventory();
    for (const readme of ["README", "readme"]) {
      expect(generated.some((route) => route.segments.slice(2).join("/") === readme), readme).toBe(false);
    }
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((url) => /\/readme$/i.test(url))).toBe(false);

    // The three documentation files really are present and really are not pages.
    for (const readme of ["README.md", "pages/markdown/README.md", "pages/json/README.md"]) {
      expect(existsSync(path.join(copyPaths.contentRoot, ...readme.split("/"))), readme).toBe(true);
    }

    // An unknown path, a traversal attempt and the reserved home segment are all 404s.
    await expect(PageRoute(params("does-not-exist"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params("README"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params(".."))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(params(NESTED_SECTION, "not a slug"))).rejects.toThrow("NEXT_NOT_FOUND");
    // `/{site}/{locale}/home` is not one of them: it is EXCLUDED from the generated
    // route set (asserted above and in the sitemap test), so with `dynamicParams =
    // false` the deployment never serves it — the home page's URL is the locale root.
  });

  it("publishes no phantom page from an empty or unconfigured locale directory", async () => {
    expect(existsSync(EMPTY_LOCALE_DIRECTORY)).toBe(true);
    const generated = await publicRouteInventory();

    for (const route of generated) {
      expect(route.segments[1], JSON.stringify(route)).not.toBe(EMPTY_LOCALE_NAME);
      expect(route.segments[1], JSON.stringify(route)).not.toBe(UNCONFIGURED_LOCALE_NAME);
    }
    expect(generated.some((route) => route.segments.includes("a-page"))).toBe(false);
  });

  it("lists the authored pages in the sitemap, nested paths included, and nothing else", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    // R04-C14 — A. Both DECLARED Pages publish, at their Site-closed qualified URLs.
    expect(urls).toContain(`${EFS_ORIGIN}${efsPath(...EFS_FLAT_ROUTE)}`);
    expect(urls).toContain(`${EFS_ORIGIN}${efsPath(...EFS_NESTED_ROUTE)}`);
    // A source no Page declares advertises nothing…
    expect(urls.some((url) => url.includes(EFS_UNDECLARED_PAGE_ID))).toBe(false);
    expect(urls.some((url) => url.includes(OUTSIDE_ROOT_SLUG))).toBe(false);
    // …and neither does an unconfigured locale, a prepared-empty one or a README.
    expect(urls.some((url) => url.includes(UNCONFIGURED_LOCALE_NAME))).toBe(false);
    expect(urls.some((url) => url.includes("a-page"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/README"))).toBe(false);
    expect(urls.some((url) => url.endsWith("/home"))).toBe(false);
    // The retired Site segment is not a public identity: no URL is Site-prefixed.
    expect(urls.some((url) => url.includes(`/${SITE}/`))).toBe(false);
  });

  it("serves the repository's authored JSON home page at the locale root (content-first, never the starter)", async () => {
    // R04-C15 — C. NOTHING is created here: the disposable copy already declares Foundation's own `main/home`
    // Page with its `en-001` JSON representation, so this asserts the reference Installation's OWN Home through
    // the real EFS boundary.
    const html = renderToStaticMarkup(await PageRoute(efsParams()));

    expect(html).not.toContain("home-hero");
    // A page only the DECLARATIVE vocabulary can produce: the composer's own section markers are present and
    // contiguous, and the outline is valid — all proved without reading the copy (M21).
    expect(declarativeCompositionIssues(html)).toEqual([]);

    // The identity is the Site-closed LOCALE ROOT…
    const metadata = await generateMetadata(efsParams());
    expect(metadata.alternates?.canonical).toBe(`${EFS_ORIGIN}${efsPath()}`);

    // …and the sitemap advertises the root, never the reserved slug.
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${EFS_ORIGIN}${efsPath()}`);
    expect(urls).not.toContain(`${EFS_ORIGIN}${efsPath("home")}`);

    // …and the reserved slug is not a second public IDENTITY, nor a second address: `home` is the Home Page's
    // INTERNAL identity segment, not a public Page route, so BOTH boundaries refuse it outright.
    //
    // This block used to record the opposite as an observation (R04-C15 §3C: "`/en-001/home` is currently
    // ADDRESSABLE … REPORTED rather than papered over by an assertion that would only pass if it were false").
    // The address has since been closed at the shared resolver boundary (GEO-03 R04-C23), so the observation
    // becomes an assertion: the same request that used to render the Home now refuses. A redirect is NOT
    // accepted here — the boundary must not answer with a 3xx — and the real HTTP proof separately establishes
    // that the response carries no `Location` header.
    await expect(generateMetadata(efsParams("home"))).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(PageRoute(efsParams("home"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("never lets a Markdown file at the home slug displace the JSON home page", async () => {
    // R04-C15 — D. The declared precedence applies at the home slug exactly as everywhere else: a Markdown
    // source beside the Home JSON representation is NOT served, and the representation itself is untouched.
    const homeDirectory = path.join(efsAuthoring.pagesDirectory, "home");
    const homeJson = path.join(homeDirectory, `${EFS_LOCALE}.json`);
    const competitor = path.join(homeDirectory, `${EFS_LOCALE}.md`);
    // The reference Home representation, as BYTES, before the competitor exists.
    const bytesBefore = readFileSync(homeJson);
    write(competitor, "# Markdown home fixture\n\nZZ_HOME_MARKER must never appear on the home page.\n");
    try {
      const html = renderToStaticMarkup(await PageRoute(efsParams()));
      expect(html).not.toContain("ZZ_HOME_MARKER");
      expect(html).not.toContain("Markdown home fixture");
      expect(html).not.toContain("home-hero");
      // The JSON home page is still the one that rendered: the declarative composition stands.
      expect(declarativeCompositionIssues(html)).toEqual([]);
    } finally {
      // ONLY the file this test introduced. The directory and its JSON document are never touched.
      rmSync(competitor, { force: true });
    }
    // …and the representation it competed with is byte-identical, still present, and still the one served.
    expect(readFileSync(homeJson).equals(bytesBefore), "the Home representation was modified").toBe(true);
    expect(existsSync(homeDirectory), "the Home directory was removed").toBe(true);
    expect(declarativeCompositionIssues(renderToStaticMarkup(await PageRoute(efsParams())))).toEqual([]);
  });

  it("lets a Markdown file author the home page when a site authors no JSON home (composition)", async () => {
    // The Markdown-home capability, proved on the SAME composition the locale root
    // uses, with a fixture site (a recognized country code no other suite uses) whose
    // tree holds only `home.md`: the reserved slug resolves to that Markdown page.
    const file = path.join(
      MARKDOWN_PAGES_ROOT,
      HOME_FIXTURE_SITE,
      HOME_FIXTURE_LOCALE,
      `${HOME_CONTENT_SLUG}.md`,
    );
    write(file, `# ${HOME_FIXTURE}\n\nA safe Markdown home page.\n`);
    try {
      const sites = resolveSites({
        input: [{ code: HOME_FIXTURE_SITE }],
        defaultLocale: "en",
        locales: ["en", HOME_FIXTURE_LOCALE],
      }).sites;
      const pages = createPageSources({ sites, roots: foundationSpoke.resources });
      const home = await pages.resolve(
        HOME_FIXTURE_SITE,
        HOME_CONTENT_SLUG,
        HOME_FIXTURE_LOCALE,
      );
      expect(home?.kind).toBe("markdown");
      expect(home?.title).toBe(HOME_FIXTURE);
    } finally {
      cleanUp(file);
    }
  });
});
