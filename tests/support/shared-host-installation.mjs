/**
 * A SHARED-HOST, MULTI-SPOKE-HUB INSTALLATION (FOUNDATION-EFS-SHARED-HOST-REMEDIATION-A1)
 * =======================================================================================
 *
 * ONE disposable Installation in which FIVE Spokes, coordinated by TWO identified Spoke Hubs, publish
 * FIVE DIFFERENT Entities at FIVE DIFFERENT path prefixes of ONE hostname:
 *
 *     shared.example.test/ww          Spoke Hub "main"     / Spoke "main-site"
 *     shared.example.test/pbs         Spoke Hub "main"     / Spoke "pbs"
 *     shared.example.test/templates   Spoke Hub "main"     / Spoke "templates"
 *     shared.example.test/tenant-a    Spoke Hub "tenants"  / Spoke "tenant-a"
 *     shared.example.test/tenant-b    Spoke Hub "tenants"  / Spoke "tenant-b"
 *
 * EVERY member authors the SAME `site.url` — `https://shared.example.test` — because that IS the public
 * origin the deployment is served from. On a shared host `site.url` is INFORMATIONAL: the public address of
 * each publication is the explicit EFS binding, exactly as `D31` requires. A request therefore cannot be
 * answered by "which Spoke owns this hostname", because five Spokes legitimately do; it is answered by
 * `host + pathname + explicit validated binding`.
 *
 * WHY THE FIXTURE IS SHAPED THIS WAY
 * ----------------------------------
 * The coordinates are deliberately REPEATED rather than distinct, so an isolation defect cannot hide behind
 * a differing path: every member serves the SAME page route (`about`), the SAME Site code (`main`), the SAME
 * locale (`en-001`) and the SAME asset path (`assets/brand/logo.svg`), while each member's authored material
 * is individually identifiable.
 *
 * ONE FIXTURE AUTHORITY. This module is the ONLY description of this Installation, and it is a `.mjs` module
 * for the reason `./multihost-installation.mjs` and `./multi-hub-installation.mjs` are: the generic Vitest
 * contract and a real production-build HTTP probe (or a browser scenario) must compose the SAME deployment,
 * so a proof can never pass against a fixture nobody else has.
 *
 * OWNERSHIP. Everything this module writes lives inside the root it is given and is removed by the
 * `cleanup()` it returns. When no root is supplied it creates one under OS temp, exactly as the other
 * support modules do; a caller that must keep its artefacts inside its own workspace passes `root`.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SYNTHETIC = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

/** The ONE hostname every member publishes on. */
export const SHARED_HOST = "shared.example.test";

/**
 * THE FIVE MEMBERS. Two Spoke Hubs; `main` carries three publishing Spokes, `tenants` two. Each member's
 * EntityID is test-owned and only has to satisfy the canonical `e_` grammar.
 *
 * @typedef {object} SharedHostMember
 * @property {string} spokeHubId the owning Spoke Hub
 * @property {string} spokeId the LOCAL Spoke id inside that Hub
 * @property {string} prefix the explicit whole-segment public prefix this publication claims
 * @property {string} entityId the Entity the publication publishes
 * @property {string} marker a member-specific marker, so isolation is observable everywhere
 * @property {string} [siteUrlHost] the INFORMATIONAL `site.url` host this Spoke authors (`D31`). Defaults to
 *   the shared host; it is never the publication authority, and two Spokes may name the same one.
 * @property {string} [publicationHost] the host this member's single publication binds (default: shared host)
 * @property {string} [presentationSiteCode] the Site of THIS Spoke a publication selects for its shell
 * @property {readonly { prefix: string, entityId: string, host?: string }[]} [publications] SEVERAL
 *   publications from ONE Spoke, so a many-to-many topology can be expressed
 */

/** @type {readonly SharedHostMember[]} */
export const SHARED_HOST_MEMBERS = [
  { spokeHubId: "main", spokeId: "main-site", prefix: "ww", entityId: "e_00000000000000000000000001", marker: "Main Site" },
  { spokeHubId: "main", spokeId: "pbs", prefix: "pbs", entityId: "e_00000000000000000000000002", marker: "Pbs" },
  { spokeHubId: "main", spokeId: "templates", prefix: "templates", entityId: "e_00000000000000000000000003", marker: "Templates" },
  { spokeHubId: "tenants", spokeId: "tenant-a", prefix: "tenant-a", entityId: "e_00000000000000000000000004", marker: "Tenant A" },
  { spokeHubId: "tenants", spokeId: "tenant-b", prefix: "tenant-b", entityId: "e_00000000000000000000000005", marker: "Tenant B" },
];

/** The Spoke Hub ids this Installation identifies, in authored order. */
export const SHARED_HOST_HUBS = ["main", "tenants"];

/** The locator of one member's authored Spoke root inside the Installation. */
function locatorOf(member) {
  return `spokes/${member.spokeHubId}-${member.spokeId}`;
}

/**
 * Write ONE member's authored Spoke root: the synthetic deployment's own configuration, dictionaries and
 * content, carrying the SHARED public origin. Nothing is relaxed — these are the same authored shapes the
 * published schema validates for any real Spoke.
 */
function writeSpoke(root, member) {
  const target = path.join(root, ...locatorOf(member).split("/"));
  mkdirSync(target, { recursive: true });
  cpSync(path.join(SYNTHETIC, "config"), path.join(target, "config"), { recursive: true });
  cpSync(path.join(SYNTHETIC, "content"), path.join(target, "content"), { recursive: true });
  /** @type {{ site: { url: string } }} */
  const config = JSON.parse(readFileSync(path.join(SYNTHETIC, "site.config.json"), "utf8"));
  // `site.url` is INFORMATIONAL (`D31`): it says which public origin this Spoke is served from. It is never
  // the publication authority, so two Spokes may name the same origin and a Spoke may name one it does not
  // publish on.
  config.site.url = `https://${member.siteUrlHost ?? SHARED_HOST}`;
  writeFileSync(path.join(target, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/** The `spokes.json` document: identified Spoke Hubs and their members, in authored order. */
function spokesDocument(members) {
  const hubs = [];
  for (const member of members) {
    if (!hubs.includes(member.spokeHubId)) hubs.push(member.spokeHubId);
  }
  return {
    spokeHubs: hubs.map((id) => ({
      id,
      spokes: members
        .filter((member) => member.spokeHubId === id)
        .map((member) => ({
          id: member.spokeId,
          root: locatorOf(member),
        })),
    })),
  };
}

/**
 * ONE member's authored Entity content, written into the capsule.
 *
 * The authored facts are all member-specific so a cross-owner leak is visible rather than plausible: the
 * page heading, the page body, the Home document's title and the owner artwork.
 */
function writeCapsuleEntity(capsule, entityId, marker) {
  const facet = path.join(capsule, entityId, "acme");
  const pages = path.join(facet, "main", "pages");
  mkdirSync(path.join(pages, "home"), { recursive: true });
  mkdirSync(path.join(pages, "about"), { recursive: true });
  mkdirSync(path.join(facet, "assets", "brand"), { recursive: true });

  writeFileSync(
    path.join(pages, "home", "en-001.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        title: `${marker} Home`,
        description: `Home page published by ${marker}.`,
        sections: [{ type: "prose", body: `Welcome from ${marker}.` }],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(
    path.join(pages, "about", "en-001.md"),
    `# About ${marker}\n\nThis representation belongs to ${marker}.\n`,
    "utf8",
  );
  writeFileSync(
    path.join(facet, "assets", "brand", "logo.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><title>${marker}</title></svg>\n`,
    "utf8",
  );
}

/** ONE Entity declaration: one Facet `acme`, one Site `main`, the Pages `home` and `about`. */
function entityDeclaration(entityId) {
  return {
    id: entityId,
    facets: [
      {
        id: "acme",
        sites: [
          {
            id: "main",
            pages: [
              { id: "home", route: ["home"], representations: [{ locale: "en-001" }] },
              { id: "about", route: ["about"], representations: [{ locale: "en-001" }] },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * The publications ONE member declares.
 *
 * A member normally publishes ONE Entity at ONE prefix. `member.publications` lets a single Spoke publish
 * SEVERAL Entities (a many-to-many publication topology), which is a shape the ownership rule must answer
 * without borrowing another Spoke's identity.
 */
function publicationDeclarations(member) {
  const entries =
    member.publications ??
    [{ prefix: member.prefix, entityId: member.entityId, host: member.publicationHost }];
  return entries.map((entry, index) => ({
    id: `${member.spokeHubId}-${member.spokeId}-${entry.prefix}`,
    spokeId: member.spokeId,
    spokeHubId: member.spokeHubId,
    entityId: entry.entityId,
    facetId: "acme",
    ...(member.presentationSiteCode === undefined
      ? {}
      : { presentationSiteCode: member.presentationSiteCode }),
    bindings: [
      {
        id: `${entry.prefix}-binding-${index}`,
        host: entry.host ?? SHARED_HOST,
        prefix: [entry.prefix],
        entityId: entry.entityId,
        facetId: "acme",
        siteIds: ["main"],
        siteMode: "closed",
        defaultSiteId: "main",
        locales: ["en-001"],
        defaultLocale: "en-001",
        canonical: true,
      },
    ],
  }));
}

/**
 * Materialise the Installation.
 *
 * Call `selectEfsInstallation(root)` (and then `vi.resetModules()`) before importing any runtime module,
 * so the modules that cache deployment state describe THIS Installation. A caller that must keep its
 * artefacts inside its own workspace passes `root`; otherwise a fresh OS-temp directory is created.
 *
 * @param {{ root?: string, members?: readonly SharedHostMember[] }} [options]
 * @returns {{
 *   root: string, manifestFile: string, efsManifestFile: string, capsule: string,
 *   cleanup: () => void,
 * }}
 */
export function materializeSharedHostInstallation({
  root: suppliedRoot,
  members = SHARED_HOST_MEMBERS,
} = {}) {
  const root = suppliedRoot ?? mkdtempSync(path.join(tmpdir(), "foundation-shared-host-"));

  for (const member of members) writeSpoke(root, member);
  writeFileSync(
    path.join(root, "spokes.json"),
    `${JSON.stringify(spokesDocument(members), null, 2)}\n`,
    "utf8",
  );

  const capsule = path.join(root, "capsule");
  /** @type {string[]} */ const publications = [];
  /** @type {Map<string, string>} */ const entityMarkers = new Map();
  for (const member of members) {
    publications.push(...publicationDeclarations(member));
    const entries = member.publications ?? [{ prefix: member.prefix, entityId: member.entityId }];
    for (const entry of entries) {
      if (entityMarkers.has(entry.entityId)) continue;
      // ONE capsule Entity per published Entity. A member publishing several Entities needs a distinct,
      // member-specific marker per Entity, so a cross-owner leak stays visible.
      entityMarkers.set(
        entry.entityId,
        entries.length === 1 && member.marker !== undefined
          ? member.marker
          : `${member.marker ?? member.spokeId} ${entry.prefix}`,
      );
    }
  }
  for (const [entityId, marker] of entityMarkers) writeCapsuleEntity(capsule, entityId, marker);

  const efsDirectory = path.join(root, "efs");
  mkdirSync(efsDirectory, { recursive: true });
  const efsManifestFile = path.join(efsDirectory, "manifest.json");
  writeFileSync(
    efsManifestFile,
    `${JSON.stringify(
      {
        entities: [...entityMarkers.keys()].map(entityDeclaration),
        publications,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    root,
    manifestFile: path.join(root, "spokes.json"),
    efsManifestFile,
    capsule,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
