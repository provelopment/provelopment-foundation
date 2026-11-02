/**
 * A DISPOSABLE EXPLICIT EFS INSTALLATION FOR BROWSER SCENARIOS
 * ===========================================================
 *
 * The browser harness used to hand every generic dev server a TEMP COPY of the legacy
 * `tests/fixtures/synthetic-deployment` and let it serve that through `site.config.json` +
 * `content/pages/<site>/<locale>/…`. The request runtime is now EFS-only, so that copy can no longer
 * be served at all: an Installation with no authored EFS manifest authorizes nothing and fails closed.
 * This module is the replacement mechanism, and it is deliberately the ONLY one — a scenario that
 * invents its own public identity would be a second publication authority.
 *
 * Two installations are built here:
 *
 *   `materializeBrowserEfsInstallation`  the small hand-authored runtime-cut fixture, with its four
 *                                        binding shapes (dedicated root, one prefix, two prefixes,
 *                                        Site-open). Used where a scenario proves the PUBLICATION
 *                                        boundary itself.
 *
 *   `materializeGenericEfsInstallation`  the browser TRANSLATION of the legacy synthetic deployment:
 *                                        its Sites, Pages, brand/contact properties, dictionaries and
 *                                        artwork, re-expressed as an EFS manifest + capsule + one
 *                                        explicit Spoke. Its Site-open binding carries the Site
 *                                        segment, so served addresses are `/<site>/<locale>/<route>` —
 *                                        the shape the generic scenarios already drive, with a real
 *                                        EFS Site instead of a country code.
 *
 * Everything a scenario may author is authored THROUGH the returned `authoring` surface, which writes
 * the Page declaration and the capsule representation together: a stray file is not a published page.
 * Nothing here ever touches a real deployment, and every directory created here is owned by the
 * installation that created it.
 */

import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** The host the browser-ready runtime-cut binding answers on. `localhost` is an allowed dev origin. */
export const BROWSER_EFS_HOST = "localhost";
/** The Spoke that owns the runtime-cut publication. */
export const BROWSER_EFS_SPOKE = "runtime-cut-spoke";
/** The locale the runtime-cut browser proofs address. */
export const BROWSER_EFS_LOCALE = "en-001";
/** The dedicated-root binding the browser proofs reach. */
export const BROWSER_BINDING_ID = "runtime-cut-root";

/** The host every GENERIC browser scenario reaches its disposable Installation on. */
export const GENERIC_EFS_HOST = "localhost";
/** The one Spoke a generic Installation declares. */
export const GENERIC_EFS_SPOKE = "browser-spoke";
/** The Site-open binding that owns every generic public address. */
export const GENERIC_BINDING_ID = "browser-open";
/** The Entity and Facet the generic publication names. */
export const GENERIC_EFS_ENTITY = "e_0000000000000000000000b001";
export const GENERIC_EFS_FACET = "browser";

/**
 * THE LEGACY SITE → EFS SITE TRANSLATION, stated once.
 *
 * The synthetic deployment called its Sites `ww` and `ca`. `ww` is one of the fourteen RESERVED Site
 * IDs (it is the legacy default marker, not a public identity), so the generic Installation names its
 * Sites `main` and `outlet` and this table is the only place the correspondence exists. A scenario
 * therefore never writes a reserved word into an EFS Site ID, and no `/ww` address is invented.
 */
export const GENERIC_EFS_SITE_BY_LEGACY_SITE = { ww: "main", ca: "outlet" };
/** The publication id prefix; one publication per Site, so each owns its own presentation facts. */
export const GENERIC_PUBLICATION_ID = "browser-publication";
/**
 * THE EFS SITE → SPOKE PRESENTATION KEY, and the direction that keeps them distinct.
 *
 * `efsShellPresentationConfig()` reads `publication.presentationSiteCode` and looks that key up in the
 * OWNING Spoke's `site.config.json` `sites[]`. It is descriptive configuration identity — dictionary,
 * brand and chrome source — never the EFS Site ID: the reserved word `ww` is refused as an EFS Site ID
 * and is exactly what the copied legacy Spoke still declares as its presentation Site. The generic
 * Installation therefore presents EFS Site `main` with presentation key `ww` and EFS Site `outlet` with
 * `ca`, and no Site ID is inferred from a key or a prefix in either direction.
 */
export const GENERIC_EFS_PRESENTATION_BY_SITE = { main: "ww", outlet: "ca" };

/** The locales every generic binding declares, and its default. */
export const GENERIC_EFS_LOCALES = ["en-001", "de-DE"];
export const GENERIC_EFS_DEFAULT_LOCALE = "en-001";
/**
 * THE LEGACY LOCALE → EFS LOCALE TRANSLATION, stated once.
 *
 * A published EFS representation is qualified by an authored script or region (`en-001`, `de-DE`); the
 * legacy fixture authored bare language preferences (`en`, `de`), which the manifest authority refuses
 * as a representation identity. The address segment follows the qualified tag, so a legacy
 * `/<site>/en/about` becomes `/<site>/en-001/about`.
 */
export const GENERIC_EFS_LOCALE_BY_LEGACY_LOCALE = { en: "en-001", de: "de-DE" };
/** The Site a Site-open address names when it omits one. */
export const GENERIC_EFS_DEFAULT_SITE = "main";

/** Copy a directory tree, creating the destination first (a missing destination is not a copy). */
function copyTree(source, destination) {
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
}

/**
 * Every authored representation under a legacy content tree, as `{ site, locale, route, format, body }`.
 *
 * The legacy tree named its leaves `<site>/<locale>/<slug>.md` (and `…/<section>/<slug>.md` for nested
 * Pages); an EFS Page is named by its ROUTE, so the file's own path below the locale directory becomes
 * the route. Nothing else is inferred: a file that is not a Markdown or JSON leaf is skipped.
 */
function legacyRepresentations(contentRoot) {
  const found = [];
  for (const format of ["markdown", "json"]) {
    const formatRoot = join(contentRoot, format);
    if (!existsSync(formatRoot)) continue;
    const extension = format === "markdown" ? "md" : "json";
    for (const site of readdirSync(formatRoot)) {
      const siteRoot = join(formatRoot, site);
      if (!statSync(siteRoot).isDirectory()) continue;
      for (const locale of readdirSync(siteRoot)) {
        const localeRoot = join(siteRoot, locale);
        if (!statSync(localeRoot).isDirectory()) continue;
        const walk = (directory, segments) => {
          for (const entry of readdirSync(directory)) {
            const absolute = join(directory, entry);
            if (statSync(absolute).isDirectory()) {
              walk(absolute, [...segments, entry]);
              continue;
            }
            const match = /^(.*)\.(md|json)$/.exec(entry);
            if (!match || match[2] !== extension) continue;
            found.push({
              site,
              locale,
              route: [...segments, match[1]],
              format,
              body: readFileSync(absolute, "utf8"),
            });
          }
        };
        walk(localeRoot, []);
      }
    }
  }
  return found;
}

/** The capsule path of one representation: `<entity>/<facet>/<site>/pages/<route>/<locale>.<ext>`. */
function representationPath(capsule, siteId, route, locale, format) {
  const directory = join(capsule, GENERIC_EFS_ENTITY, GENERIC_EFS_FACET, siteId, "pages", route.join("-"));
  mkdirSync(directory, { recursive: true });
  return join(directory, `${locale.toLowerCase()}.${format === "markdown" ? "md" : "json"}`);
}

/** A Page id that names its route, so a fixture is readable and its diffs stay stable. */
function pageId(route) {
  return route.length === 0 ? "home" : route.join("-");
}

/**
 * THE GENERIC EFS INSTALLATION — the legacy synthetic deployment, translated.
 *
 * Sites come from `GENERIC_EFS_SITE_BY_LEGACY_SITE`; Pages come from the legacy fixture's own content
 * tree; the Spoke is a copy of the legacy fixture's configuration and resource trees, because a Spoke's
 * presentation facts are still a Spoke's own configuration. Every generic dev server gets its OWN
 * installation, so two concurrent servers can never answer from one shared fixture.
 */
export function materializeGenericEfsInstallation(repositoryRoot, options = {}) {
  // THE SOURCE the Installation is translated FROM. A generic scenario mutates the harness's own
  // disposable AUTHORING copy, so passing that copy here is what makes a scenario's authored change
  // reach the next server; passing nothing keeps the committed fixture as the source.
  const fixtureRoot =
    options.sourceRoot ?? join(repositoryRoot, "tests", "fixtures", "synthetic-deployment");
  if (!existsSync(fixtureRoot)) {
    throw new Error(`the generic browser EFS fixture is missing at ${fixtureRoot}`);
  }

  const root = mkdtempSync(join(tmpdir(), "foundation-efs-generic-"));
  // FAILURE ATOMICITY: everything after the temp root exists is wrapped, so a throw removes exactly
  // this installation and nothing else, and the original error is what the caller sees.
  try {
    const manifestDir = join(root, "efs");
    const capsule = join(manifestDir, "capsule");
    mkdirSync(capsule, { recursive: true });

    // The Spoke: configuration, dictionaries and artwork, exactly as the legacy fixture authored them.
    //
    // Its locale keys stay the LANGUAGE BASES the Spoke schema requires (`en`, `de`) — each with its own
    // dictionary. A qualified code such as `en-001` is refused there, which is exactly why the EFS
    // presentation projection had to learn the language-base correspondence instead of the fixture
    // renaming its keys (GEO-04 C09-R12, `efsShellPresentationConfig`).
    const spokeRoot = join(root, "spokes", GENERIC_EFS_SPOKE);
    mkdirSync(spokeRoot, { recursive: true });
    const spokeConfig = join(fixtureRoot, "site.config.json");
    if (existsSync(spokeConfig)) cpSync(spokeConfig, join(spokeRoot, "site.config.json"));
    for (const entry of ["config", "content"]) {
      const source = join(fixtureRoot, entry);
      if (existsSync(source)) copyTree(source, join(spokeRoot, entry));
    }
    writeFileSync(
      join(root, "spokes.json"),
      `${JSON.stringify({ spokes: [{ id: GENERIC_EFS_SPOKE, root: `spokes/${GENERIC_EFS_SPOKE}` }] }, null, 2)}\n`,
      "utf8",
    );

    const manifestPath = join(manifestDir, "manifest.json");
    const sites = Object.values(GENERIC_EFS_SITE_BY_LEGACY_SITE).map((siteId) => ({
      id: siteId,
      properties: {},
      pages: [],
    }));
    const manifest = {
      entities: [
        {
          id: GENERIC_EFS_ENTITY,
          properties: {
            "brand.name": { value: "Synthetic Deployment", public: true },
            "contact.email": { value: "fixture@example.test", public: true },
          },
          facets: [{ id: GENERIC_EFS_FACET, properties: {}, sites }],
        },
      ],
      publications: sites.map((entry) => ({
        id: `${GENERIC_PUBLICATION_ID}-${entry.id}`,
        spokeId: GENERIC_EFS_SPOKE,
        entityId: GENERIC_EFS_ENTITY,
        facetId: GENERIC_EFS_FACET,
        // THE SHARED SHELL'S OWN PRECONDITION (GEO-04 C09-R03).
        //
        // `efsShellPresentationConfig()` returns `null` — and `layoutForEfsContext()` therefore renders a
        // deliberately SHELL-FREE document — when a publication omits this key. Every generic scenario
        // asserts the approved shared shell, so each publication names the Spoke-configuration Site whose
        // PRESENTATION facts it renders. That key is descriptive configuration identity, NOT the EFS Site
        // ID: `ww` is refused as an EFS Site ID (one of the fourteen reserved words) and is explicitly
        // legitimate here, while the EFS Site identity stays `main`/`outlet`. A publication that omits the
        // key keeps its shell-free Page — pinned by the negative test.
        presentationSiteCode: GENERIC_EFS_PRESENTATION_BY_SITE[entry.id],
        bindings: [
          {
            id: `${GENERIC_BINDING_ID}-${entry.id}`,
            host: GENERIC_EFS_HOST,
            // ONE EXPLICITLY AUTHORED PREFIX PER SITE, and a CLOSED binding each: the Site of a request
            // is an authored fact of the binding, never inferred from a URL segment. The address is
            // therefore `/<prefix>/<locale>/<route>` — the same shape the generic scenarios already
            // drive, with a declared Site instead of a legacy country code, and no Site-open dispatch.
            prefix: [entry.id],
            entityId: GENERIC_EFS_ENTITY,
            facetId: GENERIC_EFS_FACET,
            siteIds: [entry.id],
            siteMode: "closed",
            defaultSiteId: entry.id,
            locales: [...GENERIC_EFS_LOCALES],
            defaultLocale: GENERIC_EFS_DEFAULT_LOCALE,
            canonical: true,
          },
        ],
      })),

    };

    const siteOf = (siteId) => sites.find((entry) => entry.id === siteId);
    const writeManifest = () =>
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    /**
     * Declare one Page (if absent) and write its representation — the two halves of publication.
     *
     * `navLabel` is authored as the Page's public `nav.label` property, which is where EFS navigation
     * comes from; omitting it declares a Page that is reachable but NOT in the navigation, which is
     * exactly what an unlisted or probe Page is.
     */
    const authorPage = ({
      legacySite = null,
      siteId = null,
      locale,
      route = [],
      format = "markdown",
      body,
      navLabel = null,
      fallbackLocaleKey = null,
    }) => {
      const resolvedSite = siteId ?? GENERIC_EFS_SITE_BY_LEGACY_SITE[legacySite] ?? legacySite;
      const target = siteOf(resolvedSite);
      if (!target) throw new Error(`no EFS Site "${resolvedSite}" in this installation`);
      const id = pageId(route);
      let declared = target.pages.find((page) => page.id === id);
      if (!declared) {
        declared = {
          id,
          route: route.length === 0 ? ["home"] : [...route],
          fallbackLocaleKey: fallbackLocaleKey ?? locale,
          representations: [],
          properties: {},
        };
        target.pages.push(declared);
      }
      if (!declared.representations.some((representation) => representation.locale === locale)) {
        declared.representations.push({ locale });
      }
      if (navLabel !== null) declared.properties["nav.label"] = { value: navLabel, public: true };
      writeManifest();
      if (body !== undefined) {
        writeFileSync(
          representationPath(capsule, resolvedSite, route.length === 0 ? ["home"] : route, locale, format),
          body,
          "utf8",
        );
      }
      return { site: resolvedSite, pageId: id };
    };

    // THE FIXTURE'S OWN CONTENT, DECLARED. The legacy tree is READ, never served: each leaf becomes a
    // Page declaration plus a capsule representation, so the generic Installation publishes exactly the
    // content the fixture authored.
    for (const leaf of legacyRepresentations(join(fixtureRoot, "content", "pages"))) {
      if (!GENERIC_EFS_SITE_BY_LEGACY_SITE[leaf.site]) continue;
      const route = leaf.route[0] === "home" ? [] : leaf.route;
      authorPage({
        siteId: GENERIC_EFS_SITE_BY_LEGACY_SITE[leaf.site],
        locale: GENERIC_EFS_LOCALE_BY_LEGACY_LOCALE[leaf.locale] ?? leaf.locale,
        route,
        format: leaf.format,
        body: leaf.body,
        navLabel:
          route.length === 0
            ? "Home"
            : route
                .join(" ")
                .replace(/(^|\s|-)([a-z])/g, (_, boundary, character) => `${boundary === "-" ? " " : boundary}${character.toUpperCase()}`),
      });
    }
    // A Site's Home must exist in EVERY declared locale: a binding that offers a locale with no Home
    // would serve a 404 at its own entry point, which is not a fixture any scenario should inherit.
    for (const siteId of Object.values(GENERIC_EFS_SITE_BY_LEGACY_SITE)) {
      for (const locale of GENERIC_EFS_LOCALES) {
        const home = siteOf(siteId).pages.find((page) => page.id === "home");
        if (home?.representations.some((representation) => representation.locale === locale)) continue;
        authorPage({
          siteId,
          locale,
          route: [],
          format: "json",
          body: `${JSON.stringify(
            {
              schemaVersion: 1,
              title: `Synthetic Home (${siteId}) — ${locale}`,
              description: "A synthetic Home for generic Foundation tests.",
              sections: [
                {
                  type: "prose",
                  heading: "Synthetic Home",
                  body: "This page exists only in the test fixture.",
                },
              ],
            },
            null,
            2,
          )}\n`,
          navLabel: "Home",
        });
      }
    }
    writeManifest();

    const authoring = {
      authorPage,
      /** Read-modify-write one property on the Entity, a Site, or a Page of this installation. */
      authorProperty({ property, value, siteId = null, page: targetPage = null }) {
        const holder =
          targetPage === null
            ? siteId === null
              ? manifest.entities[0]
              : siteOf(siteId)
            : siteOf(siteId)?.pages.find((entry) => entry.id === targetPage);
        if (!holder) {
          throw new Error(`no EFS holder for "${property}" (site=${siteId} page=${targetPage})`);
        }
        holder.properties = holder.properties ?? {};
        holder.properties[property] = { value, public: true };
        writeManifest();
      },
      /** The installation's own public address for a Page. */
      path: (options = {}) => genericEfsPath(options),
    };

    let removed = false;
    return {
      root,
      manifest: manifestPath,
      capsule,
      host: GENERIC_EFS_HOST,
      binding: GENERIC_BINDING_ID,
      siteOpen: true,
      authoring,
      cleanup() {
        if (removed) return;
        removed = true;
        rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "the generic EFS installation failed to materialise AND could not be cleaned up",
      );
    }
    throw error;
  }
}

/**
 * Materialise one disposable explicit EFS Installation from the runtime-cut fixture, and return its
 * paths, its host and its cleanup. The caller owns the directory from this moment; `cleanup()` is
 * idempotent, and a failed materialisation removes only what it created.
 */
export function materializeBrowserEfsInstallation(repositoryRoot) {
  const fixtureRoot = join(repositoryRoot, "tests", "fixtures", "efs", "runtime-cut");
  const sourceManifest = join(fixtureRoot, "manifest.json");
  const sourceCapsule = join(fixtureRoot, "capsule");
  if (!existsSync(sourceManifest) || !existsSync(sourceCapsule)) {
    throw new Error(`the browser EFS fixture is missing at ${fixtureRoot}`);
  }
  const spokeSource = join(repositoryRoot, "deployment", "spokes", "foundation");
  if (!existsSync(spokeSource)) {
    throw new Error(`the owned Spoke is missing at ${spokeSource}`);
  }

  const root = mkdtempSync(join(tmpdir(), "foundation-efs-browser-"));
  try {
    const manifestDir = join(root, "efs");
    mkdirSync(manifestDir, { recursive: true });
    const capsule = join(manifestDir, "capsule");
    copyTree(sourceCapsule, capsule);

    // The single test-only authoring change: the dedicated-root binding answers on `localhost`, so the
    // dev server and Chrome can reach it. Every other claim is left exactly as the fixture states it.
    const manifest = JSON.parse(readFileSync(sourceManifest, "utf8"));
    let rewritten = 0;
    for (const publication of manifest.publications ?? []) {
      for (const binding of publication.bindings ?? []) {
        if (binding.id === BROWSER_BINDING_ID) {
          binding.host = BROWSER_EFS_HOST;
          rewritten += 1;
        }
      }
    }
    if (rewritten !== 1) {
      throw new Error(`expected exactly one ${BROWSER_BINDING_ID} binding, rewrote ${rewritten}`);
    }
    const manifestPath = join(manifestDir, "manifest.json");
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    // The operational hierarchy is explicit: one Spoke, named exactly as the publication names it.
    copyTree(spokeSource, join(root, "spokes", BROWSER_EFS_SPOKE));
    writeFileSync(
      join(root, "spokes.json"),
      `${JSON.stringify({ spokes: [{ id: BROWSER_EFS_SPOKE, root: `spokes/${BROWSER_EFS_SPOKE}` }] }, null, 2)}\n`,
      "utf8",
    );

    let removed = false;
    return {
      root,
      manifest: manifestPath,
      capsule,
      host: BROWSER_EFS_HOST,
      cleanup() {
        if (removed) return;
        removed = true;
        rmSync(root, { recursive: true, force: true });
      },
    };
  } catch (error) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "the browser EFS installation failed to materialise AND could not be cleaned up",
      );
    }
    throw error;
  }
}

/**
 * THE CHILD ENVIRONMENT OF ONE DEV SERVER, from that server's OWN installation.
 *
 * Every value is passed to `spawn` explicitly rather than written to `process.env`: two dev servers may
 * be alive at once (a surface and a configured one, a scenario and its comparison), and a process-global
 * selection would let one server's Installation answer the other's requests.
 */
export function installationEnvironment(installation, base = process.env) {
  return {
    ...base,
    FOUNDATION_DEPLOYMENT_ROOT: installation.root,
    FOUNDATION_EFS_MANIFEST: installation.manifest,
    FOUNDATION_EFS_CAPSULE: installation.capsule,
    // An explicitly selected Installation must never inherit a stale authoring mode from the parent.
    FOUNDATION_DEPLOYMENT_MODE: "explicit",
    FOUNDATION_DEPLOYMENT_LAYOUT: "override",
  };
}

/**
 * Point the process at an installation for the duration of a serial, in-process scope, and hand back
 * the restore. A dev server must NOT rely on this: use `installationEnvironment()` for that, because
 * `process.env` is shared by every concurrent server.
 */
export function selectBrowserEfs(installation) {
  const previous = {
    manifest: process.env.FOUNDATION_EFS_MANIFEST,
    capsule: process.env.FOUNDATION_EFS_CAPSULE,
  };
  process.env.FOUNDATION_EFS_MANIFEST = installation.manifest;
  process.env.FOUNDATION_EFS_CAPSULE = installation.capsule;
  return function restore() {
    if (previous.manifest === undefined) delete process.env.FOUNDATION_EFS_MANIFEST;
    else process.env.FOUNDATION_EFS_MANIFEST = previous.manifest;
    if (previous.capsule === undefined) delete process.env.FOUNDATION_EFS_CAPSULE;
    else process.env.FOUNDATION_EFS_CAPSULE = previous.capsule;
  };
}

/**
 * The public path of a Page, derived from the binding that publishes it.
 *
 * A dedicated-root or prefixed binding puts the locale first (`/{locale}/{route}`); a Site-open binding
 * carries the Site segment before it (`/{site}/{locale}/{route}`). Nothing else is invented: no country
 * code, no Site code, no legacy alias.
 */
export function efsBrowserPath({
  site = GENERIC_EFS_DEFAULT_SITE,
  locale = BROWSER_EFS_LOCALE,
  route = [],
  siteOpen = false,
} = {}) {
  const segments = siteOpen ? [site, locale, ...route] : [locale, ...route];
  return `/${segments.filter((segment) => segment !== "").join("/")}`;
}

/** The dedicated-root address of a runtime-cut Page. */
export function browserEfsPath(route = [], locale = BROWSER_EFS_LOCALE) {
  return efsBrowserPath({ locale, route });
}

/** The Site-open address of a GENERIC Page. */
export function genericEfsPath({
  site = GENERIC_EFS_DEFAULT_SITE,
  locale = GENERIC_EFS_DEFAULT_LOCALE,
  route = [],
} = {}) {
  return efsBrowserPath({ site, locale, route, siteOpen: true });
}
