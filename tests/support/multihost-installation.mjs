/**
 * THE DISPOSABLE TWO-SPOKE INSTALLATION (FOUNDATION-MULTISITE-M16/M17 PROOF)
 * =========================================================================
 *
 * The test-owned Installation the multi-host proof runs: TWO Spokes that answer for two EXACT hostnames and
 * deliberately expose the SAME logical public coordinates with DIFFERENT facts.
 *
 *   Spoke "alpha"   alpha.localhost   /ww/en/about   Alpha name, Alpha words, Alpha page, Alpha asset
 *   Spoke "beta"    beta.localhost    /ww/en/about   Beta  name, Beta  words, Beta  page, Beta  asset
 *
 * WHAT MAKES THIS A REAL INSTALLATION, NOT A STUB
 * ----------------------------------------------
 * The tree it writes is exactly the authored form the accepted authorities resolve:
 *
 *   <root>/spokes.json                            the manifest the Installation declares its Spokes in
 *   <root>/spokes/<dir>/site.config.json          each Spoke's own configuration (origin, Sites, nav)
 *   <root>/spokes/<dir>/config/i18n/en.json       its own dictionary
 *   <root>/spokes/<dir>/content/pages/**          its own authored pages (one SHARED route, one OWN route)
 *   <root>/spokes/<dir>/content/assets/**          its own artwork sources (role files, its own brand artwork)
 *
 * so `resolveSpokeDeclarations`, `readSpokeSiteConfig`, `composeInstallationSpokeHub` and
 * `installationRuntimeIndex` all accept it with no test-only branch, and the application renders it through
 * the ordinary request path.
 *
 * GENERATED RUNTIME NAMESPACES ARE NOT WRITTEN HERE. A Spoke's own artwork is SERVED from
 * `public/spokes/<segment>/assets/**`; this module only REPORTS which files that namespace needs — and it
 * reports them by asking the CANONICAL asset plan (`buildPlan`, `scripts/sync-runtime-assets.mjs`), never by
 * enumerating directories of its own (FOUNDATION-MULTISITE-M16/M17) — because where generated output may be
 * written is the browser harness's write domain (`tests/browser/scratch.mjs`), not a fixture builder's.
 *
 * WHY THAT MATTERS. The plan is the ONE authority for what a namespace owns, and the build-time catalog the
 * runtime reads is derived from that same plan, so "what is generated" and "what the runtime believes exists"
 * cannot disagree. A fixture that enumerated artwork itself could install a file the plan never declared —
 * invisible to an inventoried namespace, and therefore a broken image that no gate explains.
 *
 * THIS SPOKE'S OWN ARTWORK LIVES WHERE THE CONTRACT ACCEPTS IT: `content/assets/branding/<id>-spoke.svg` is a
 * SPOKE-OWNED source directory (`SPOKE_DIRECTORIES`), so the canonical plan mirrors it into that Spoke's own
 * namespace, in the catalog, like every other replaceable brand file. A custom filename dropped into
 * `content/assets/placeholders/**` is NOT part of the supported role inventory and would be installed by
 * nothing.
 *
 * The fixture's dictionaries, pages and role artwork are READ from the committed synthetic deployment
 * (`tests/fixtures/synthetic-deployment/**`), so this Installation is a legitimate one and stays in step with
 * the schema rather than restating it.
 *
 * Plain ESM with JSDoc types: the browser scenario runs under plain `node`, and Vitest can import the SAME
 * builder for the focused multi-Spoke unit proofs.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// THE ONE ASSET AUTHORITY. This fixture describes an Installation; it does not decide what that Installation's
// artwork is. The plan below comes from the canonical asset plan, while the PUBLISHED catalog is the generated
// file the running application actually imports — two DIFFERENT authorities, and the guard keeps them apart.
import {
  buildPlan,
  CATALOG_FILE,
  CATALOG_RELATIVE,
  CATALOG_VERSION,
  runtimeNamespaces,
} from "../../scripts/sync-runtime-assets.mjs";
/**
 * THE INSTALLATION'S EXPLICIT INSPECTION POLICY (FOUNDATION-MULTISITE-M20)
 *
 * A hosting platform publishes deployment/branch URLs for the build it is running, and an operator uses
 * them to check that the deployment actually renders. This Installation therefore NOMINATES one Spoke to
 * represent it on such a hostname — `alpha` here, deliberately NOT the real Installation's `foundation`,
 * so a proof cannot pass by relying on a hard-coded id.
 *
 * The hostnames are Vercel-shaped, and the scenario exports them to the build through the platform's own
 * variables (`VERCEL_URL`, `VERCEL_BRANCH_URL`) — the real mechanism, not a test-only switch.
 */
export const MULTIHOST_INSPECTION = {
  spokeId: "alpha",
  /** The platform's unique-deployment URL for this build (`VERCEL_URL`). */
  hostname: "foundation-multihost-4f2c9d1a-provelopment.vercel.app",
  /** The platform's branch URL, which always points at the branch's latest deployment. */
  branchHostname: "foundation-multihost-git-main-provelopment.vercel.app",
};



/** The two Spokes the Installation declares, in MANIFEST ORDER. */
export const MULTIHOST_SPOKES = [
  {
    id: "alpha",
    directory: "spokes/alpha",
    hostname: "alpha.localhost",
    siteName: "Alpha Spoke Site",
    tagline: "Alpha owns this hostname",
    /** The ONE dictionary wording that differs, rendered in the navigation of EVERY page. */
    navigationLabels: { "/": "Alpha Home", "/about": "Alpha About" },
    aboutTitle: "Alpha About (multihost proof)",
    aboutBody: "Alpha wrote this paragraph for the shared public pathname.",
    onlyRoute: "alpha-only",
    onlyTitle: "Alpha Only Route",
  },
  {
    id: "beta",
    directory: "spokes/beta",
    hostname: "beta.localhost",
    siteName: "Beta Spoke Site",
    tagline: "Beta owns this hostname",
    navigationLabels: { "/": "Beta Home", "/about": "Beta About" },
    aboutTitle: "Beta About (multihost proof)",
    aboutBody: "Beta wrote a different paragraph for the same public pathname.",
    onlyRoute: "beta-only",
    onlyTitle: "Beta Only Route",
  },
];

/**
 * THE EFS PUBLICATION OF THIS TWO-SPOKE INSTALLATION (GEO-04 C09-R19)
 * ==================================================================
 *
 * `spokes.json` and each per-Spoke `site.config.json`/dictionary/content tree are what the Installation's
 * OWNERSHIP and SHELL PRESENTATION are read from. They are NOT a publication authority: the request runtime
 * is EFS-only, so an Installation that authors no manifest answers nothing at `/ww/en/**`. That is exactly
 * why the legacy addresses this scenario used to probe are refused — the fix is to AUTHOR the publication,
 * never to revive the retired grammar.
 *
 * Every field that could otherwise be guessed is explicit:
 *
 *   ONE PUBLICATION PER SPOKE, naming its OWN `spokeId` — never one generic default Spoke
 *   ONE OPAQUE, DISTINCT ENTITY per Spoke — authored here, never derived from a hostname
 *   SITE ID `main`; `ww` stays the Spoke's PRESENTATION key (a reserved word, so it can never be an EFS Site ID)
 *   `prefix: []`, `siteMode: "closed"`, `siteIds: ["main"]` — every public address is `/<locale>/<route>`
 *   the two platform INSPECTION hosts are EXPLICIT non-canonical ALIASES of alpha's canonical binding, so
 *     they share alpha's ownership instead of becoming a second origin
 *   ONE qualified locale (`en-001`) per Spoke, with a real representation for Home, About and its own route
 */
export const MULTIHOST_EFS_FACET = "site";
/** The EFS Site ID every publication declares. */
export const MULTIHOST_EFS_SITE = "main";
/** The one qualified locale each Spoke publishes. */
export const MULTIHOST_EFS_LOCALE = "en-001";
/** One authored, opaque Entity per Spoke: identities of THIS fixture, never of a hostname. */
const MULTIHOST_EFS_ENTITY = {
  alpha: "e_0000000000000000000000e001",
  beta: "e_0000000000000000000000e002",
};

/** The Home representation: a real JSON document naming the Spoke that publishes it. */
function homeRepresentation(spoke) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      title: spoke.siteName,
      description: spoke.tagline,
      sections: [{ type: "prose", heading: "Published by this Spoke", body: spoke.tagline }],
    },
    null,
    2,
  )}\n`;
}

/** One declared Page, with a representation for the locale it publishes. */
function efsPage(id, route, label) {
  return {
    id,
    route: [...route],
    fallbackLocaleKey: MULTIHOST_EFS_LOCALE,
    representations: [{ locale: MULTIHOST_EFS_LOCALE }],
    properties: { "nav.label": { value: label, public: true } },
  };
}

/** One binding: an explicit Host claim, closed Site, one qualified locale. */
function efsBinding({ id, host, entityId, canonical, aliasOf = null }) {
  return {
    id,
    host,
    prefix: [],
    entityId,
    facetId: MULTIHOST_EFS_FACET,
    siteIds: [MULTIHOST_EFS_SITE],
    siteMode: "closed",
    defaultSiteId: MULTIHOST_EFS_SITE,
    locales: [MULTIHOST_EFS_LOCALE],
    defaultLocale: MULTIHOST_EFS_LOCALE,
    canonical,
    // A non-canonical binding is an ALIAS and must NAME the canonical binding it mirrors — the manifest
    // authority refuses an alias that names nothing, points at another alias, or changes ownership.
    ...(aliasOf === null ? {} : { aliasOf }),
  };
}

/** The runtime segment of a Spoke id: these ids are ASCII, so the authority's encoding is the id itself. */
function segmentOf(id) {
  return id;
}

/** The committed synthetic deployment: the SOURCE of this Installation's dictionaries and artwork. */
function fixtureRoot(repositoryRoot) {
  return path.join(repositoryRoot, "tests", "fixtures", "synthetic-deployment");
}

/** A Spoke's own configuration, authored as the schema expects it. */
function spokeConfig(repositoryRoot, spoke) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "site.config.json"), "utf8"),
  );

  return {
    ...source,
    site: {
      ...source.site,
      url: `https://${spoke.hostname}`,
      name: spoke.siteName,
      tagline: spoke.tagline,
      assets: {
        favicon: `https://${spoke.hostname}/spokes/${segmentOf(spoke.id)}/assets/favicon.svg`,
      },
    },
    i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English", englishLabel: "English" }] },
    sites: [{ code: "ww", label: "Global" }],
    defaultSite: "ww",
    // ONE shared route and ONE route this Spoke alone authors: the sitemap inventory therefore differs by
    // CONTENT (not merely by origin), and the shared route proves the same public pathname can be two pages.
      navigation: [
      { label: "Home", href: "/", iconOpen: "icon-home.svg", iconClosed: "icon-home.svg" },
      { label: "About", href: "/about", iconOpen: "icon-about.svg", iconClosed: "icon-about.svg" },
      // This Spoke's OWN mark, addressed by basename exactly as the runtime role artwork is: the rendered
      // page therefore names a PER-HOST Spoke asset URL (`/spokes/<segment>/assets/<id>-spoke.svg`).
      {
        label: "Spoke",
        href: `/${spoke.onlyRoute}`,
        iconOpen: `${spoke.id}-spoke.svg`,
        iconClosed: `${spoke.id}-spoke.svg`,
      },
    ],
    business: { regions: {} },
    socialLinks: [],
    features: {
      analytics: { provider: "none" },
      maps: { provider: "none" },
      booking: { provider: "none" },
      contact: { provider: "stub" },
    },
  };
}

/**
 * A Spoke's dictionary: the fixture's own, with the wording THIS Spoke differs in.
 */
function spokeDictionary(repositoryRoot, spoke) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "config", "i18n", "en.json"), "utf8"),
  );

  return {
    ...source,
    home: { ...source.home, tagline: spoke.tagline },
    navigation: {
      ...source.navigation,
      items: { "/": spoke.navigationLabels["/"], "/about": spoke.navigationLabels["/about"] },
    },
  };
}

/** A Markdown page: the accepted authoring form, one file per route. */
function page(title, body) {
  return `---\ntitle: ${title}\ndescription: ${body}\n---\n\n${body}\n`;
}

/** Writes one Spoke's authored tree beneath the Installation root. */
function writeSpoke(root, repositoryRoot, spoke) {
  const spokeRoot = path.join(root, ...spoke.directory.split("/"));
  const write = (relative, contents) => {
    const target = path.join(spokeRoot, ...relative.split("/"));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, contents, "utf8");
  };

  write("site.config.json", `${JSON.stringify(spokeConfig(repositoryRoot, spoke), null, 2)}\n`);
  write("config/i18n/en.json", `${JSON.stringify(spokeDictionary(repositoryRoot, spoke), null, 2)}\n`);

  // The SHARED public coordinates every Spoke exposes — with THIS Spoke's own content.
  write("content/pages/markdown/ww/en/about.md", page(spoke.aboutTitle, spoke.aboutBody));
  // …and a route only THIS Spoke authors, so the two inventories genuinely differ.
  write(
    `content/pages/markdown/ww/en/${spoke.onlyRoute}.md`,
    page(spoke.onlyTitle, `${spoke.siteName} authors ${spoke.onlyRoute} and no other Spoke does.`),
  );

  // The authored artwork SOURCES (role files + the platform-owned trees), copied from the fixture so this is
  // an Installation the accepted authorities — and the asset installer — accept unchanged.
  cpSync(
    path.join(fixtureRoot(repositoryRoot), "content", "assets"),
    path.join(spokeRoot, "content", "assets"),
    { recursive: true },
  );

  // This Spoke's OWN mark: the one artwork file no other Spoke ships. It is authored in the SUPPORTED
  // Spoke-owned location (`content/assets/branding/**`, see `SPOKE_DIRECTORIES`), so the canonical asset plan
  // installs it into THIS Spoke's own namespace — and into the build-time catalog the runtime reads. A custom
  // filename written into `placeholders/**` would be a file the role inventory does not know and the plan does
  // not install (FOUNDATION-MULTISITE-M16/M17).
  write(
    `content/assets/branding/${spoke.id}-spoke.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><title>${spoke.siteName}</title><circle cx="12" cy="12" r="9" /></svg>\n`,
  );
}

/**
 * The GENERATED files ONE Spoke's OWN namespace needs, as `{ from, to }` pairs to install beneath
 * `public/spokes/<segment>/assets/**` — READ FROM THE CANONICAL PLAN, never enumerated here.
 *
 * The plan (`buildPlan`) is the ONE authority for which authored source becomes which runtime basename in
 * which namespace: a Spoke's replaceable role artwork and its `branding/` belong to the SPOKE, while the shared
 * icon library and the platform marks are installed once into the platform namespace. This function therefore
 * reports only `spoke:<id>` rows — platform-owned artwork is never copied into a Spoke namespace, and no file
 * can be installed that the plan (and so the build-time catalog) does not declare.
 *
 * @param {string} installationRoot the Installation root the plan is asked about
 * @param {string} spokeId the Spoke whose namespace is being materialised
 * @returns {{ from: string, to: string, note: string }[]} absolute source, runtime basename and the plan's reason
 */
export function spokeNamespacePlan(installationRoot, spokeId) {
  const namespace = `spoke:${spokeId}`;
  return buildPlan(installationRoot)
    .filter((row) => row.namespace === namespace)
    .map((row) => {
      const from = path.join(installationRoot, ...row.from.split("/"));
      if (!existsSync(from)) {
        throw new Error(
          `the canonical asset plan installs "${row.to}" into the "${namespace}" namespace from "${row.from}", ` +
            "but this Installation does not author that source. An Installation must ship every source its " +
            "plan mirrors; a plan row with no source is an installation defect, never a namespace the test " +
            "may invent (FOUNDATION-MULTISITE-M16/M17).",
        );
      }
      return { from, to: row.to, note: row.note };
    });
}

/**
 * THE PUBLISHED, RUNTIME-IMPORTED CATALOG — read as data, never recomputed (FOUNDATION-MULTISITE-M16/M17).
 *
 * This is the authority the RUNNING APPLICATION consumes (`src/config/runtime-asset-catalog.ts` imports this
 * same file as a module). A freshly computed catalog describes what the plan WOULD produce; it says nothing
 * about what is published, and comparing two plan-derived copies can hide a stale file. Everything below reads
 * THIS file.
 *
 * @param {string} [catalogFile] the generated catalog's path
 * @returns {{ file: string, present: boolean, version: number | null, namespaces: Record<string, Record<string, unknown>> }}
 */
export function readPublishedCatalog(catalogFile = CATALOG_FILE) {
  if (!existsSync(catalogFile)) return { file: catalogFile, present: false, version: null, namespaces: {} };
  const parsed = JSON.parse(readFileSync(catalogFile, "utf8"));
  return {
    file: catalogFile,
    present: true,
    version: typeof parsed.version === "number" ? parsed.version : null,
    namespaces: parsed.namespaces ?? {},
  };
}

/**
 * THE EXPECTED / PUBLISHED AGREEMENT FOR ONE SPOKE'S NAMESPACE (FOUNDATION-MULTISITE-M16/M17).
 *
 * TWO AUTHORITIES, deliberately kept apart:
 *
 *   EXPECTED  the canonical plan for THIS Installation (`buildPlan`): which authored source each Spoke's
 *             namespace must receive, and which replaceable roles belong to Spokes rather than to the platform.
 *   PUBLISHED the generated catalog FILE the running application imports (see `readPublishedCatalog`). A
 *             namespace that carries a published inventory answers ownership from IMMUTABLE DATA — the key's
 *             presence IS existence, and nothing is read from disk — so a planned file absent from the
 *             published inventory is invisible to the runtime: a broken image, or a 500 while composing.
 *
 * The agreement is therefore never "the plan agrees with a fresh copy of itself": a STALE published catalog is
 * detected as such. A namespace the published catalog does not carry at all is the accepted COMPATIBILITY case
 * — the resolver falls back to the filesystem, which is exactly the situation of a repository whose published
 * catalog belongs to its OWN installed deployment — so it is reported (`inventoried: false`), never failed.
 *
 * In an explicit Installation the shared platform namespace must additionally not CLAIM a replaceable role the
 * plan gives to a Spoke: that is the ownership defect the browser rows observe, detected here by name.
 *
 * @param {string} installationRoot the Installation root
 * @param {string} spokeId the Spoke whose namespace is about to be materialised
 * @param {string} [catalogFile] the PUBLISHED generated catalog to judge (defaults to the runtime's own)
 * @returns {{
 *   installationRoot: string, catalogFile: string, catalogRelative: string, published: boolean,
 *   version: number | null, urlBase: string, planned: string[], publishedInventory: string[] | null,
 *   inventoried: boolean, missing: string[], replaceableRoles: string[], platformUrlBase: string,
 *   platformPublished: string[] | null, platformClaims: string[], consistent: boolean,
 * }}
 */
export function spokeNamespaceAgreement(installationRoot, spokeId, catalogFile = CATALOG_FILE) {
  const namespaces = runtimeNamespaces(installationRoot);
  const namespace = namespaces.find((entry) => entry.key === `spoke:${spokeId}`);
  if (namespace === undefined) {
    throw new Error(
      `the Installation at "${installationRoot}" declares no generated namespace for Spoke "${spokeId}".`,
    );
  }

  /** EXPECTED — the canonical plan for this Installation. */
  const planRows = buildPlan(installationRoot);
  const planned = planRows
    .filter((row) => row.namespace === `spoke:${spokeId}`)
    .map((row) => row.to)
    .sort();
  // The roles this Installation's plan gives to SPOKES: the replaceable material the platform must not claim.
  const replaceableRoles = [
    ...new Set(planRows.filter((row) => row.namespace.startsWith("spoke:")).map((row) => row.to)),
  ].sort();

  /** PUBLISHED — the generated file the runtime imports, never a fresh plan-derived copy. */
  const published = readPublishedCatalog(catalogFile);
  const inventory = published.namespaces[namespace.urlBase];
  const publishedInventory = inventory === undefined ? null : Object.keys(inventory).sort();
  const missing =
    publishedInventory === null ? [] : planned.filter((name) => !publishedInventory.includes(name));

  const platformUrlBase = namespaces.find((entry) => entry.key === "platform").urlBase;
  const platformEntry = published.namespaces[platformUrlBase];
  const platformPublished = platformEntry === undefined ? null : Object.keys(platformEntry).sort();
  const platformClaims =
    platformPublished === null || replaceableRoles.length === 0
      ? []
      : replaceableRoles.filter((name) => platformPublished.includes(name));

  return {
    installationRoot,
    catalogFile,
    catalogRelative: CATALOG_RELATIVE,
    published: published.present,
    version: published.version,
    urlBase: namespace.urlBase,
    planned,
    publishedInventory,
    inventoried: publishedInventory !== null,
    missing,
    replaceableRoles,
    platformUrlBase,
    platformPublished,
    platformClaims,
    consistent: published.present && missing.length === 0 && platformClaims.length === 0,
  };
}

/**
 * Refuses the run when the PUBLISHED catalog and the canonical plan disagree for this Spoke's namespace.
 *
 * Every diagnostic names the Installation, the PUBLISHED catalog file and the canonical preparation, so an
 * operator can tell a stale generated catalog from an incompatible one without re-diagnosing a broken page.
 *
 * @param {string} installationRoot the Installation root
 * @param {string} spokeId the Spoke whose namespace is about to be materialised
 * @param {string} [catalogFile] the PUBLISHED generated catalog to judge
 * @returns {ReturnType<typeof spokeNamespaceAgreement>} the agreement, when there is one
 */
export function assertSpokeNamespaceAgreesWithCatalog(installationRoot, spokeId, catalogFile = CATALOG_FILE) {
  const agreement = spokeNamespaceAgreement(installationRoot, spokeId, catalogFile);
  const prepare =
    `(FOUNDATION_DEPLOYMENT_LAYOUT=override FOUNDATION_DEPLOYMENT_ROOT="${installationRoot}" pnpm assets:sync)`;

  if (!agreement.published) {
    throw new Error(
      `no generated asset catalog is published at "${agreement.catalogRelative}" (asked as ` +
        `"${agreement.catalogFile}"), so the runtime inventory of "${installationRoot}" cannot be established. ` +
        `Prepare it ${prepare} (FOUNDATION-MULTISITE-M16/M17).`,
    );
  }

  if (agreement.version !== CATALOG_VERSION) {
    throw new Error(
      `the published asset catalog "${agreement.catalogRelative}" declares shape version ` +
        `${agreement.version === null ? "(none)" : agreement.version}, but this build reads version ` +
        `${CATALOG_VERSION} — it is stale for "${installationRoot}". Prepare it ${prepare} ` +
        "(FOUNDATION-MULTISITE-M16/M17).",
    );
  }

  if (agreement.missing.length > 0) {
    throw new Error(
      "the PUBLISHED asset catalog and the canonical plan do not describe the same Installation: " +
        `"${agreement.urlBase}" is published in "${agreement.catalogRelative}" without ` +
        `${agreement.missing.join(", ")}, yet the plan installs them for "${installationRoot}". The published ` +
        `catalog is STALE for the Installation being served — prepare it ${prepare}. Never hand-copy artwork ` +
        "into a generated namespace: an inventoried namespace cannot see a file the catalog does not list " +
        "(FOUNDATION-MULTISITE-M16/M17).",
    );
  }

  if (agreement.platformClaims.length > 0) {
    throw new Error(
      "the PUBLISHED asset catalog gives the SHARED platform namespace replaceable role artwork that this " +
        `explicit Installation gives to its Spokes: "${agreement.platformUrlBase}" in ` +
        `"${agreement.catalogRelative}" claims ${agreement.platformClaims.join(", ")}, while the plan installs ` +
        `them per Spoke for "${installationRoot}". That published catalog belongs to a DIFFERENT, ` +
        `legacy-shaped generated state — prepare the state for the Installation being served ${prepare} ` +
        "(FOUNDATION-MULTISITE-M16/M17).",
    );
  }

  return agreement;
}

/** Write `<root>/efs/manifest.json` and `<root>/efs/capsule/**` for both Spokes. */
function writeEfsInstallation(root) {
  const capsule = path.join(root, "efs", "capsule");
  const manifestPath = path.join(root, "efs", "manifest.json");
  mkdirSync(capsule, { recursive: true });

  const entities = [];
  const publications = [];

  for (const spoke of MULTIHOST_SPOKES) {
    const entityId = MULTIHOST_EFS_ENTITY[spoke.id];
    const write = (pageId, extension, body) => {
      const directory = path.join(capsule, entityId, MULTIHOST_EFS_FACET, MULTIHOST_EFS_SITE, "pages", pageId);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, `${MULTIHOST_EFS_LOCALE}.${extension}`), body, "utf8");
    };
    write("home", "json", homeRepresentation(spoke));
    write("about", "md", page(spoke.aboutTitle, spoke.aboutBody));
    // …this Spoke's OWN route, in its own words: the two inventories genuinely differ by CONTENT.
    write(
      spoke.onlyRoute,
      "md",
      page(spoke.onlyTitle, `${spoke.siteName} authors ${spoke.onlyRoute} and no other Spoke does.`),
    );

    entities.push({
      id: entityId,
      properties: {
        "brand.name": { value: spoke.siteName, public: true },
        "contact.email": { value: `hello@${spoke.hostname}`, public: true },
      },
      facets: [
        {
          id: MULTIHOST_EFS_FACET,
          properties: {},
          sites: [
            {
              id: MULTIHOST_EFS_SITE,
              properties: {},
              pages: [
                efsPage("home", ["home"], "Home"),
                efsPage("about", ["about"], spoke.navigationLabels["/about"]),
                efsPage(spoke.onlyRoute, [spoke.onlyRoute], spoke.onlyTitle),
              ],
            },
          ],
        },
      ],
    });

    const bindings = [
      efsBinding({ id: `multihost-${spoke.id}`, host: spoke.hostname, entityId, canonical: true }),
    ];
    // THE PLATFORM'S INSPECTION HOSTS are explicit authorized ALIASES of the nominated Spoke's canonical
    // binding — never a wildcard, never a second canonical origin, never an independent publication.
    if (MULTIHOST_INSPECTION.spokeId === spoke.id) {
      for (const [suffix, host] of [
        ["inspection", MULTIHOST_INSPECTION.hostname],
        ["branch", MULTIHOST_INSPECTION.branchHostname],
      ]) {
        bindings.push(
          efsBinding({
            id: `multihost-${spoke.id}-${suffix}`,
            host,
            entityId,
            canonical: false,
            aliasOf: `multihost-${spoke.id}`,
          }),
        );
      }
    }

    publications.push({
      id: `multihost-${spoke.id}`,
      spokeId: spoke.id,
      entityId,
      facetId: MULTIHOST_EFS_FACET,
      presentationSiteCode: "ww",
      bindings,
    });
  }

  writeFileSync(manifestPath, `${JSON.stringify({ entities, publications }, null, 2)}\n`, "utf8");
  return { manifest: manifestPath, capsule };
}

/**
 * Materialises the two-Spoke Installation into a fresh temporary directory.
 *
 * @param {{ repositoryRoot: string }} options
 * @returns {{
 *   root: string,
 *   manifestFile: string,
 *   manifest: string,
 *   capsule: string,
 *   inspection: { spokeId: string, hostname: string, branchHostname: string },
 *   spokes: { id: string, segment: string, hostname: string, canonicalOrigin: string, directory: string,
 *             root: string, onlyRoute: string, siteName: string, mark: string }[],
 *   cleanup: () => void,
 * }}
 */
export function materializeMultihostInstallation({ repositoryRoot }) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-multihost-"));
  try {
    return buildMultihostInstallation(root, repositoryRoot);
  } catch (error) {
    // FAILURE ATOMICITY: a materialisation that throws leaves NOTHING behind.
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "the two-Spoke Installation failed to materialise AND could not be cleaned up",
      );
    }
    throw error;
  }
}

/** Build the tree inside an already-created root; the exported entry point owns failure atomicity. */
function buildMultihostInstallation(root, repositoryRoot) {
  writeFileSync(
    path.join(root, "spokes.json"),
    `${JSON.stringify(
      {
        spokes: MULTIHOST_SPOKES.map((spoke) => ({ id: spoke.id, root: spoke.directory })),
        // The Installation's EXPLICIT inspection policy: on a hosting platform's own deployment/branch
        // URL, `alpha` represents this Installation (M20 §29 — an explicit nomination, never a fallback).
        inspectionSpoke: MULTIHOST_INSPECTION.spokeId,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  for (const spoke of MULTIHOST_SPOKES) writeSpoke(root, repositoryRoot, spoke);

  // THE EFS PUBLICATION, authored beside the ownership/presentation tree: the request runtime is EFS-only, so
  // this is what actually serves each Spoke's Home/About/own-route Pages at `/<locale>/<route>` on its OWN host.
  const efs = writeEfsInstallation(root);

  let removed = false;
  return {
    root,
    manifestFile: path.join(root, "spokes.json"),
    // `manifest`/`capsule` are the EFS publication the server consumes; `manifestFile` stays the Installation's
    // own Spoke manifest (the ownership/presentation input), so neither silently replaces the other.
    manifest: efs.manifest,
    capsule: efs.capsule,
    inspection: { ...MULTIHOST_INSPECTION },
    spokes: MULTIHOST_SPOKES.map((spoke) => ({
      id: spoke.id,
      segment: segmentOf(spoke.id),
      hostname: spoke.hostname,
      canonicalOrigin: `https://${spoke.hostname}`,
      directory: spoke.directory,
      root: path.join(root, ...spoke.directory.split("/")),
      onlyRoute: spoke.onlyRoute,
      siteName: spoke.siteName,
      mark: `${spoke.id}-spoke.svg`,
    })),
    /** Idempotent. The SCENARIO owns this Installation, so a stopped server never deletes it. */
    cleanup() {
      if (removed) return;
      removed = true;
      rmSync(root, { recursive: true, force: true });
    },
  };
}
