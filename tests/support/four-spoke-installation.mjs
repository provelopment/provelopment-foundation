/**
 * THE DISPOSABLE FOUR-SPOKE INSTALLATION — ONE HUB, FOUR MEMBERS (R1 BROWSER PROOF)
 * ================================================================================
 *
 * The fixture the Hub-scoped Spoke switcher is proved with IN A REAL BROWSER. It is deliberately NEUTRAL —
 * `primary`, `docs`, `catalog`, `support` — because the subject is a PLATFORM capability, not any one
 * adopter's organization.
 *
 * ONE INSTALLATION, ONE HUB. Every Spoke this manifest declares is a member of the SAME Hub: that is the
 * membership boundary the switcher is scoped to. Nothing here expresses a relationship between
 * organizations, and no second registry exists — a Spoke is switchable because it is DECLARED HERE and its
 * destination hostname routes back to it.
 *
 * THE FOUR FACTS THE PROOF NEEDS, and where each comes from:
 *
 *   primary   ONE Site, ONE locale, NO Locations, no Layout switcher   → the exact visitor condition that
 *                                                                        hid Web-1's `www` control row
 *   docs      TWO locales and an ENABLED Layout switcher               → a Spoke that DOES have other
 *                                                                        header controls beside the switcher
 *   catalog   an ADDITIONAL hostname claim (`catalog-staging.localhost`)→ canonical → additional-claim
 *                                                                        destination
 *   support   the Installation's INSPECTION Spoke                      → inspection hostname → another Hub
 *                                                                        Spoke
 *
 * The manifest therefore declares `spokeSwitcher` with all four members in AUTHORED order, using all three
 * kinds of routable destination the platform supports.
 *
 * The tree it writes is exactly the authored form the accepted authorities resolve, so
 * `resolveSpokeDeclarations`, `readSpokeSiteConfig`, `composeInstallationSpokeHub` and
 * `installationRuntimeIndex` accept it with no test-only branch.
 *
 * NO SPOKE-SCOPED ARTWORK IS AUTHORED, AND NONE IS NEEDED: no Spoke declares `site.assets` and no navigation
 * item names a Spoke-scoped icon, so nothing addresses `/spokes/<segment>/assets/**` and the platform's own
 * committed namespace serves every page. That keeps this fixture about the SWITCHER (and keeps it out of the
 * generated-namespace write domain the browser harness owns).
 *
 * Plain ESM with JSDoc types: the browser scenario runs under plain `node`.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/** The four Spokes of ONE Hub, in MANIFEST/AUTHORED order. */
export const HUB_SPOKES = [
  {
    id: "primary",
    hostname: "primary.localhost",
    siteName: "Primary Spoke Site",
    tagline: "The primary member of this Hub",
    onlyRoute: "primary-only",
    /** ONE locale, ONE Site, no Locations, no Layout switcher — the Web-1 `www` condition. */
    locales: ["en"],
    layoutSwitcher: false,
  },
  {
    id: "docs",
    hostname: "docs.localhost",
    siteName: "Docs Spoke Site",
    tagline: "The documentation member of this Hub",
    onlyRoute: "docs-only",
    /** TWO locales (a Language control) and an enabled Layout switcher: a Spoke with OTHER controls too. */
    locales: ["en", "de"],
    layoutSwitcher: true,
  },
  {
    id: "catalog",
    hostname: "catalog.localhost",
    siteName: "Catalog Spoke Site",
    tagline: "The catalog member of this Hub",
    onlyRoute: "catalog-only",
    locales: ["en"],
    layoutSwitcher: false,
    /** An ADDITIONAL hostname claim: routing only, never a second canonical origin. */
    hostAliases: ["catalog-staging.localhost"],
  },
  {
    id: "support",
    hostname: "support.localhost",
    siteName: "Support Spoke Site",
    tagline: "The support member of this Hub",
    onlyRoute: "support-only",
    locales: ["en"],
    layoutSwitcher: false,
  },
];

/**
 * THE INSTALLATION'S INSPECTION POLICY: `support` represents this Installation on the inspection hostname,
 * exactly as an operator's deployment URL would. `primary` is deliberately NOT the nominated Spoke, so a
 * proof cannot pass by assuming the first member answers.
 */
export const HUB_INSPECTION = {
  spokeId: "support",
  hostname: "inspection.localhost",
};

/**
 * THE AUTHORED HUB-SCOPED SWITCHER — ONE option per member of this Hub, in this order, covering all three
 * kinds of destination the platform accepts:
 *
 *   primary  → its own canonical origin
 *   docs     → its own canonical origin
 *   catalog  → its ADDITIONAL claim (a staging host serving the same Spoke)
 *   support  → the INSPECTION hostname the policy nominates for it
 */
export const HUB_SWITCHER = {
  options: [
    { spokeId: "primary", label: "Primary", href: "https://primary.localhost" },
    { spokeId: "docs", label: "Documentation", href: "https://docs.localhost" },
    { spokeId: "catalog", label: "Catalog", href: "https://catalog-staging.localhost" },
    { spokeId: "support", label: "Support", href: "https://inspection.localhost" },
  ],
};

/** The committed synthetic deployment: the SOURCE of this Installation's pages and dictionaries. */
function fixtureRoot(repositoryRoot) {
  return path.join(repositoryRoot, "tests", "fixtures", "synthetic-deployment");
}

/** A Spoke's own configuration, authored as the schema expects it. */
function spokeConfig(repositoryRoot, spoke) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "site.config.json"), "utf8"),
  );

  return {
    site: {
      url: `https://${spoke.hostname}`,
      name: spoke.siteName,
      tagline: spoke.tagline,
      description: `${spoke.siteName} — a member of one Hub, declared in one Installation.`,
    },
    i18n: {
      defaultLocale: "en",
      locales: spoke.locales.map((code) =>
        code === "en" ? { code, label: "English", englishLabel: "English" } : { code, label: "Deutsch", englishLabel: "German" },
      ),
    },
    sites: [{ code: "ww", label: "Global" }],
    defaultSite: "ww",
    contact: { email: `hello@${spoke.hostname}` },
    socialLinks: [],
    navigation: [
      { label: "Home", href: "/" },
      { label: "About", href: "/about" },
    ],
    business: { regions: {} },
    ...(spoke.layoutSwitcher ? { ui: { layoutSwitcher: { enabled: true, default: "sidebar" } } } : {}),
    features: {
      analytics: { provider: source.features?.analytics?.provider ?? "none" },
      maps: { provider: "none" },
      booking: { provider: "none" },
      contact: source.features?.contact ?? { provider: "stub" },
    },
  };
}

/**
 * A Spoke's dictionary: the fixture's own English wording, plus the switchover copy the platform requires.
 *
 * `spokeSwitcher.label` is REQUIRED for every locale of every Spoke once the Installation authors a switcher
 * (the build's own lock refuses a build without it), so every locale this fixture declares carries it.
 */
function spokeDictionary(repositoryRoot, spoke, locale) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "config", "i18n", `${locale}.json`), "utf8"),
  );

  return {
    ...source,
    home: { ...source.home, tagline: spoke.tagline },
    navigation: {
      ...source.navigation,
      items: { ...source.navigation.items, ["/"]: `${spoke.id} home`, ["/about"]: `${spoke.id} about` },
    },
    // ONE control, four authored members: the accessible name the header resolves from THIS locale.
    spokeSwitcher: { label: locale === "de" ? "Bereiche dieses Hubs" : "Sections of this Hub" },
  };
}

/** A Spoke's own README, so its content tree is authored the way the accepted contract expects. */
function spokeReadme(spoke) {
  return [
    `# ${spoke.siteName}`,
    "",
    `A member of ONE Hub, declared in one Installation as Spoke \`${spoke.id}\`.`,
    `It answers for \`https://${spoke.hostname}\`, and for nothing else.`,
    `Its own authored route inside this Spoke is \`/${spoke.onlyRoute}\`.`,
    "",
  ].join("\n");
}

/**
 * THE EFS PUBLICATION OF ONE HUB (GEO-04 C09-R16).
 *
 * `spokes.json` and the per-Spoke `site.config.json`/dictionaries/content tree are what the HUB-SCOPED
 * SWITCHER reads: membership, authored order and ownership. They are NOT a publication authority — the
 * request runtime is EFS-only, so an Installation with no authored manifest answers nothing. Until R16 this
 * fixture wrote only the legacy tree, which is why the scenario's readiness probe never answered.
 *
 * The EFS half is explicit in every field that could otherwise be guessed:
 *
 *   ONE PUBLICATION PER SPOKE, naming its OWN `spokeId` — never one generic default Spoke
 *   ONE OPAQUE, DISTINCT ENTITY per Spoke — authored here, never derived from a hostname
 *   SITE ID `main`; `ww` stays the Spoke's PRESENTATION key (one of the fourteen reserved words, so it can
 *     never be an EFS Site ID)
 *   `prefix: []`, `siteMode: "closed"`, `siteIds: ["main"]` — every public address is `/<locale>/<route>`
 *   the catalog STAGING host and the INSPECTION host are EXPLICIT additional bindings of the Spoke that owns
 *     them, not a fallback to whichever Spoke happens to be first
 *   `docs` publishes TWO qualified locales (`en-001`, `de-DE`) with real localized bodies, the others one
 */
export const HUB_EFS_FACET = "site";
/** The EFS Site ID every publication declares. */
export const HUB_EFS_SITE = "main";
/** The EFS locales a Spoke publishes, translated ONCE from its legacy locale codes. */
const HUB_EFS_LOCALE_BY_LEGACY = { en: "en-001", de: "de-DE" };
/** One authored, opaque Entity per Spoke. These are identities of THIS fixture, not of any hostname. */
const HUB_EFS_ENTITY = {
  primary: "e_0000000000000000000000d001",
  docs: "e_0000000000000000000000d002",
  catalog: "e_0000000000000000000000d003",
  support: "e_0000000000000000000000d004",
};
/** The German wording, authored here rather than guessed at read time. */
const HUB_EFS_GERMAN = { primary: "Hauptbereich", docs: "Dokumentation", catalog: "Katalog", support: "Support" };

/** The qualified locale of a legacy Spoke locale code. */
function efsLocale(code) {
  return HUB_EFS_LOCALE_BY_LEGACY[code] ?? code;
}

/** A Home body in the fixture's own JSON page schema, naming the Spoke that publishes it. */
function homeRepresentation(spoke, locale) {
  const german = locale.startsWith("de");
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      title: spoke.siteName,
      description: german
        ? `Startseite von ${spoke.siteName}, veröffentlicht als EFS-Seite.`
        : `The Home Page of ${spoke.siteName}, published as an EFS Page.`,
      sections: [
        {
          type: "prose",
          heading: german ? "Veröffentlicht durch diesen Spoke" : "Published by this Spoke",
          body: german
            ? `Diese Seite gehört zum Spoke \`${spoke.id}\` und zu keinem anderen.`
            : `This page belongs to Spoke \`${spoke.id}\` and to no other.`,
        },
      ],
    },
    null,
    2,
  )}\n`;
}

/** A Markdown page body in the fixture's own schema. */
function markdownRepresentation(title, description, body) {
  return ["---", `title: ${title}`, `description: ${description}`, "---", "", body, ""].join("\n");
}

function aboutRepresentation(spoke, locale) {
  const german = locale.startsWith("de");
  return markdownRepresentation(
    `${spoke.siteName} — ${german ? "Über uns" : "About"}`,
    `${spoke.siteName} ${german ? "Über-uns-Seite." : "About Page."}`,
    german
      ? `Diese Über-uns-Seite wird vom Spoke \`${spoke.id}\` veröffentlicht.`
      : `This About Page is published by Spoke \`${spoke.id}\`.`,
  );
}

function onlyRepresentation(spoke, locale) {
  const german = locale.startsWith("de");
  return markdownRepresentation(
    `${spoke.siteName} — ${spoke.onlyRoute}`,
    `${spoke.siteName} ${german ? "eigene Seite." : "Spoke-owned Page."}`,
    german
      ? `\`${spoke.onlyRoute}\` existiert nur im Spoke \`${spoke.id}\` (${HUB_EFS_GERMAN[spoke.id]}).`
      : `\`${spoke.onlyRoute}\` exists only inside Spoke \`${spoke.id}\`.`,
  );
}

/** One declared Page, with a representation per locale it publishes. */
function efsPage(id, route, locales, label) {
  return {
    id,
    route: [...route],
    fallbackLocaleKey: locales[0],
    representations: locales.map((locale) => ({ locale })),
    properties: { "nav.label": { value: label, public: true } },
  };
}

/** One binding: an explicit Host claim of THIS Spoke, with a closed Site and its declared locales. */
function efsBinding({ id, host, entityId, locales, defaultLocale, canonical, aliasOf = null }) {
  return {
    id,
    host,
    prefix: [],
    entityId,
    facetId: HUB_EFS_FACET,
    siteIds: [HUB_EFS_SITE],
    siteMode: "closed",
    defaultSiteId: HUB_EFS_SITE,
    locales: [...locales],
    defaultLocale,
    canonical,
    // A non-canonical binding is an ALIAS and must NAME the canonical binding it mirrors — the manifest
    // authority refuses an alias that names nothing, points at another alias, or changes Entity/Facet/Site
    // ownership.
    ...(aliasOf === null ? {} : { aliasOf }),
  };
}

/** Write `<root>/efs/manifest.json` and `<root>/efs/capsule/**` for all four Spokes of this Hub. */
function writeEfsInstallation(root) {
  const capsule = path.join(root, "efs", "capsule");
  const manifestPath = path.join(root, "efs", "manifest.json");
  mkdirSync(capsule, { recursive: true });

  const entities = [];
  const publications = [];

  for (const spoke of HUB_SPOKES) {
    const entityId = HUB_EFS_ENTITY[spoke.id];
    const locales = spoke.locales.map(efsLocale);
    const defaultLocale = locales[0];

    const writeRepresentation = (route, locale, extension, body) => {
      const directory = path.join(capsule, entityId, HUB_EFS_FACET, HUB_EFS_SITE, "pages", route);
      mkdirSync(directory, { recursive: true });
      writeFileSync(path.join(directory, `${locale}.${extension}`), body, "utf8");
    };
    for (const locale of locales) {
      writeRepresentation("home", locale, "json", homeRepresentation(spoke, locale));
      writeRepresentation("about", locale, "md", aboutRepresentation(spoke, locale));
      writeRepresentation(spoke.onlyRoute, locale, "md", onlyRepresentation(spoke, locale));
    }

    entities.push({
      id: entityId,
      properties: {
        "brand.name": { value: spoke.siteName, public: true },
        "contact.email": { value: `hello@${spoke.hostname}`, public: true },
      },
      facets: [
        {
          id: HUB_EFS_FACET,
          properties: {},
          sites: [
            {
              id: HUB_EFS_SITE,
              properties: {},
              pages: [
                efsPage("home", ["home"], locales, "Home"),
                efsPage("about", ["about"], locales, "About"),
                efsPage(spoke.onlyRoute, [spoke.onlyRoute], locales, spoke.onlyRoute),
              ],
            },
          ],
        },
      ],
    });

    const bindings = [
      efsBinding({ id: `binding-${spoke.id}`, host: spoke.hostname, entityId, locales, defaultLocale, canonical: true }),
    ];
    // An ADDITIONAL hostname claim (the catalog's staging host) is an explicit binding of the SAME Spoke.
    for (const alias of spoke.hostAliases ?? []) {
      bindings.push(
        efsBinding({
          id: `binding-${spoke.id}-additional`,
          host: alias,
          entityId,
          locales,
          defaultLocale,
          canonical: false,
          aliasOf: `binding-${spoke.id}`,
        }),
      );
    }
    // The INSPECTION hostname is an explicit authorized binding of the Spoke the policy nominates — never a
    // default-Spoke fallback, which is exactly what the routing rule exists to refuse.
    if (HUB_INSPECTION.spokeId === spoke.id) {
      bindings.push(
        efsBinding({
          id: `binding-${spoke.id}-inspection`,
          host: HUB_INSPECTION.hostname,
          entityId,
          locales,
          defaultLocale,
          canonical: false,
          aliasOf: `binding-${spoke.id}`,
        }),
      );
    }

    publications.push({
      id: `switcher-${spoke.id}`,
      spokeId: spoke.id,
      entityId,
      facetId: HUB_EFS_FACET,
      presentationSiteCode: "ww",
      bindings,
    });
  }

  writeFileSync(manifestPath, `${JSON.stringify({ entities, publications }, null, 2)}\n`, "utf8");
  return { manifest: manifestPath, capsule };
}

/**
 * THE DISPOSABLE INSTALLATION, in the caller's own OS-temp domain.
 *
 * @param {string} repositoryRoot the repository root (the committed fixture is READ from it)
 * @returns {{ root: string, manifest: string, capsule: string, spokes: typeof HUB_SPOKES, inspection: typeof HUB_INSPECTION, cleanup: () => void }}
 */
export function materializeFourSpokeInstallation(repositoryRoot) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-four-spoke-"));
  try {
    return buildFourSpokeInstallation(repositoryRoot, root);
  } catch (error) {
    // FAILURE ATOMICITY: a materialisation that throws leaves NOTHING behind.
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "the four-Spoke Installation failed to materialise AND could not be cleaned up",
      );
    }
    throw error;
  }
}

/** Build the tree inside an already-created root; the exported entry point owns failure atomicity. */
function buildFourSpokeInstallation(repositoryRoot, root) {
  const fixture = fixtureRoot(repositoryRoot);

  for (const spoke of HUB_SPOKES) {
    const spokeRoot = path.join(root, "spokes", spoke.id);
    mkdirSync(path.join(spokeRoot, "config", "i18n"), { recursive: true });
    mkdirSync(path.join(spokeRoot, "content", "pages"), { recursive: true });

    writeFileSync(
      path.join(spokeRoot, "site.config.json"),
      `${JSON.stringify(spokeConfig(repositoryRoot, spoke), null, 2)}\n`,
    );
    for (const locale of spoke.locales) {
      writeFileSync(
        path.join(spokeRoot, "config", "i18n", `${locale}.json`),
        `${JSON.stringify(spokeDictionary(repositoryRoot, spoke, locale), null, 2)}\n`,
      );
    }
    writeFileSync(path.join(spokeRoot, "content", "README.md"), spokeReadme(spoke));

    // THE SHARED PUBLIC COORDINATES, copied from the committed fixture: every Spoke answers the SAME
    // pathnames with ITS OWN content, which is what makes a switcher destination observable.
    cpSync(path.join(fixture, "content", "pages"), path.join(spokeRoot, "content", "pages"), {
      recursive: true,
    });
  }

  writeFileSync(
    path.join(root, "spokes.json"),
    `${JSON.stringify(
      {
        spokes: HUB_SPOKES.map((spoke) => ({
          id: spoke.id,
          root: `spokes/${spoke.id}`,
          ...(spoke.hostAliases === undefined ? {} : { hostAliases: [...spoke.hostAliases] }),
        })),
        inspectionSpoke: HUB_INSPECTION.spokeId,
        inspectionHosts: [HUB_INSPECTION.hostname],
        spokeSwitcher: HUB_SWITCHER,
      },
      null,
      2,
    )}\n`,
  );

  // THE EFS PUBLICATION, authored beside the legacy tree: the request runtime is EFS-only, so this is what
  // actually serves each Spoke's Home/About/own-route Pages at `/<locale>/<route>`.
  const efs = writeEfsInstallation(root);

  let removed = false;
  return {
    root,
    manifest: efs.manifest,
    capsule: efs.capsule,
    spokes: HUB_SPOKES,
    inspection: HUB_INSPECTION,
    /** Idempotent. The SCENARIO owns this Installation, so a stopped server never deletes it. */
    cleanup() {
      if (removed) return;
      removed = true;
      rmSync(root, { recursive: true, force: true });
    },
  };
}
