/**
 * AN IDENTIFIED MULTI-SPOKE-HUB INSTALLATION (FOUNDATION-ID-M3-P3C)
 * =================================================================
 *
 * ONE disposable Installation, authored in the NESTED form (`spokeHubs`), with TWO identified Spoke Hubs —
 * and a REPEATED local Spoke id across them, which is the whole point: `docs` exists in both Hubs, so no
 * consumer may address either member by its local id alone.
 *
 *   Spoke Hub "one"   docs   https://hub-one-docs.localhost   (+ a Hub-scoped switcher to its sibling)
 *                     news   https://hub-one-news.localhost
 *   Spoke Hub "two"   docs   https://hub-two-docs.localhost   ← the SAME local id, a DIFFERENT Spoke
 *
 * Every member authors its own configuration, dictionary wording, pages and artwork, and the members
 * deliberately SHARE logical coordinates (`ww` / `en` / `about`) so an isolation defect cannot hide behind
 * differing paths.
 *
 * ONE FIXTURE AUTHORITY. This module is the ONLY place this Installation is described, so the runtime suite
 * (`tests/unit/spoke-multi-hub-runtime.test.ts`) and the browser scenario
 * (`tests/browser/multi-hub.scenario.mjs`) are provably the SAME Installation: a scenario that composed its
 * own would prove a different one.
 *
 * The configuration, dictionary and artwork SHAPES are cloned from the accepted synthetic deployment
 * (`tests/fixtures/synthetic-deployment`), so every member's tree passes the REAL Foundation authorities
 * (the configuration schema, the declaration seam, the dictionary registry and the canonical asset plan)
 * without any test-only relaxation.
 *
 * OWNERSHIP: this module writes ONLY under OS temp (the Installation it builds) — never the repository's
 * deployment state. Generated namespaces a caller materialises from it are the GENERATED output the asset
 * installer owns, and are written through the caller's own guarded writers.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { runtimeSegmentForIdentifiedSpokeRef } from "../../src/config/spoke-runtime-segment.mjs";
import { buildPlan, runtimeNamespaces } from "../../scripts/sync-runtime-assets.mjs";
// The AGREEMENT authority is the accepted multi-host one, reused rather than restated: it judges this
// Installation's canonical plan against the PUBLISHED catalog the running application imports, and its
// `spokeId` parameter is really the NAMESPACE SUFFIX — which for an identified member is its composite
// segment.
import { assertSpokeNamespaceAgreesWithCatalog } from "./multihost-installation.mjs";

/**
 * THE COMPOSITE inspection nomination (M3-P2 §8.4): an Installation-scoped policy names a member by BOTH
 * halves of its identity — never a bare local id, which would name a Spoke in either Hub.
 *
 * Hub `two`'s `docs` is nominated deliberately: it is the SECOND Hub, so a proof cannot pass by resolving
 * "the first Hub's Spoke of that name". The hostnames are Vercel-shaped, and the browser scenario exports
 * them to the build through the platform's own variables (`VERCEL_URL`, `VERCEL_BRANCH_URL`).
 */
export const MULTI_HUB_INSPECTION = {
  spokeHubId: "two",
  spokeId: "docs",
  /** The platform's unique-deployment URL for this build (`VERCEL_URL`). */
  hostname: "foundation-multihub-8c1e4d3b-provelopment.vercel.app",
  /** The platform's branch URL, which always points at the branch's latest deployment. */
  branchHostname: "foundation-multihub-git-main-provelopment.vercel.app",
  /**
   * The Installation's OWN inspection aliases, authored beside the nomination — the other half of the policy
   * (a hosting platform's URLs are recognised when the platform reports them; an authored alias is recognised
   * always). The browser scenario drives both.
   */
  hostnames: ["inspect.localhost"],
};

/** The two Spoke Hubs the Installation declares, in MANIFEST order, with their members. */
export const MULTI_HUB_HUBS = [
  {
    id: "one",
    spokeSwitcher: {
      options: [
        { spokeId: "docs", label: "One Docs", href: "https://hub-one-docs.localhost" },
        { spokeId: "news", label: "One News", href: "https://hub-one-news.localhost" },
      ],
    },
    spokes: [
      {
        id: "docs",
        directory: "spokes/hub-one-docs",
        hostname: "hub-one-docs.localhost",
        siteName: "Hub One Docs Site",
        tagline: "Hub One owns this hostname",
        homeLabel: "One Docs Home",
        aboutLabel: "One Docs About",
        aboutBody: "Hub One's docs Spoke wrote this paragraph.",
        onlyRoute: "one-docs-only",
      },
      {
        id: "news",
        directory: "spokes/hub-one-news",
        hostname: "hub-one-news.localhost",
        siteName: "Hub One News Site",
        tagline: "Hub One's second member owns this hostname",
        homeLabel: "One News Home",
        aboutLabel: "One News About",
        aboutBody: "Hub One's news Spoke wrote a different paragraph.",
        onlyRoute: "one-news-only",
      },
    ],
  },
  {
    id: "two",
    spokes: [
      {
        // THE SAME LOCAL ID AS HUB ONE'S FIRST MEMBER — a different Spoke.
        id: "docs",
        directory: "spokes/hub-two-docs",
        hostname: "hub-two-docs.localhost",
        siteName: "Hub Two Docs Site",
        tagline: "Hub Two owns its OWN docs hostname",
        homeLabel: "Two Docs Home",
        aboutLabel: "Two Docs About",
        aboutBody: "Hub Two's docs Spoke wrote the third paragraph.",
        onlyRoute: "two-docs-only",
      },
    ],
  },
];

/** EVERY declared member, each with its OWNING Hub, in authored order. */
export const MULTI_HUB_SPOKES = MULTI_HUB_HUBS.flatMap((hub) =>
  hub.spokes.map((spoke) => ({ hubId: hub.id, ...spoke })),
);

/** The committed synthetic deployment: the SOURCE of this Installation's dictionaries and artwork. */
function fixtureRoot(repositoryRoot) {
  return path.join(repositoryRoot, "tests", "fixtures", "synthetic-deployment");
}

/**
 * The COMPOSITE runtime segment of one member — the ONE identity its namespace, context and asset base
 * derive from, asked of the authority rather than composed here.
 */
export function multiHubSegment(hubId, spokeId) {
  return runtimeSegmentForIdentifiedSpokeRef({ spokeHubId: hubId, spokeId });
}

/**
 * The basename of ONE member's own brand mark, in the spelling the configuration schema accepts.
 *
 * It is deliberately NOT the runtime segment: a composite segment carries the `+` separator, and an accepted
 * `site.assets`/navigation icon basename may not. The author names their own file, and the canonical plan
 * mirrors it into the member's OWN namespace under that name.
 */
export function multiHubSpokeFile(spoke) {
  return `${spoke.onlyRoute}.svg`;
}

/** A member's own configuration, authored as the schema expects it. */
function spokeConfig(repositoryRoot, segment, spoke, hostname) {
  const source = JSON.parse(readFileSync(path.join(fixtureRoot(repositoryRoot), "site.config.json"), "utf8"));

  return {
    ...source,
    site: {
      ...source.site,
      url: `https://${hostname}`,
      name: spoke.siteName,
      tagline: spoke.tagline,
      assets: { favicon: `https://${hostname}/spokes/${segment}/assets/favicon.svg` },
    },
    i18n: { defaultLocale: "en", locales: [{ code: "en", label: "English", englishLabel: "English" }] },
    sites: [{ code: "ww", label: "Global" }],
    defaultSite: "ww",
    navigation: [
      { label: "Home", href: "/", iconOpen: "icon-home.svg", iconClosed: "icon-home.svg" },
      { label: "About", href: "/about", iconOpen: "icon-about.svg", iconClosed: "icon-about.svg" },
      {
        label: "Member",
        href: `/${spoke.onlyRoute}`,
        // The icon basename the schema accepts (letters, digits, `.`, `_`, `-`) — see `multiHubSpokeFile`.
        iconOpen: multiHubSpokeFile(spoke),
        iconClosed: multiHubSpokeFile(spoke),
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

/** A member's dictionary: the fixture's own, with the wording THIS member differs in. */
function spokeDictionary(repositoryRoot, spoke) {
  const source = JSON.parse(
    readFileSync(path.join(fixtureRoot(repositoryRoot), "config", "i18n", "en.json"), "utf8"),
  );

  return {
    ...source,
    home: { ...source.home, tagline: spoke.tagline },
    navigation: { ...source.navigation, items: { "/": spoke.homeLabel, "/about": spoke.aboutLabel } },
    // THE SWITCHER'S ACCESSIBLE NAME, in THIS member's own dictionary. Once an Installation authors a
    // switcher, the build REFUSES to serve a locale that does not name it (R1: the control is never unnamed
    // for a visitor or a screen reader), and the label is resolved from the RENDERING member's own locale —
    // so each member carries its own wording here.
    spokeSwitcher: { label: `Sections of ${spoke.siteName}` },
  };
}

/** A Markdown page: the accepted authoring form, one file per route. */
function page(title, body) {
  return `---\ntitle: ${title}\ndescription: ${body}\n---\n\n${body}\n`;
}

function write(file, contents) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/**
 * Writes ONE member's authored tree beneath an Installation root — the whole of what makes it a Spoke.
 *
 * `member` is the SHARED descriptor shape (`MULTI_HUB_SPOKES` entries: a Spoke's own authored facts plus the
 * `hubId` that OWNS it), and an optional `hostname` override lets a caller author a VARIANT — e.g. two Hubs
 * claiming one hostname, which the declaration seam must refuse.
 */
export function writeMultiHubSpoke(root, repositoryRoot, member) {
  const { hubId, hostname = member.hostname, ...spoke } = member;
  const segment = multiHubSegment(hubId, spoke.id);
  const spokeRoot = path.join(root, ...spoke.directory.split("/"));

  write(
    path.join(spokeRoot, "site.config.json"),
    `${JSON.stringify(spokeConfig(repositoryRoot, segment, spoke, hostname), null, 2)}\n`,
  );
  write(
    path.join(spokeRoot, "config", "i18n", "en.json"),
    `${JSON.stringify(spokeDictionary(repositoryRoot, spoke), null, 2)}\n`,
  );

  // The SHARED public coordinates, with THIS member's own content — plus a route only it authors, so the two
  // inventories genuinely differ.
  write(
    path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", "about.md"),
    page(`${spoke.siteName} About`, spoke.aboutBody),
  );
  write(
    path.join(spokeRoot, "content", "pages", "markdown", "ww", "en", `${spoke.onlyRoute}.md`),
    page(spoke.onlyRoute, `${spoke.siteName} authors ${spoke.onlyRoute} and no other Spoke does.`),
  );

  // The authored artwork SOURCES, copied from the accepted fixture so the asset installer accepts them
  // unchanged — plus THIS member's own mark, in the location the canonical plan mirrors into its OWN
  // namespace (`content/assets/branding/**`).
  cpSync(path.join(fixtureRoot(repositoryRoot), "content", "assets"), path.join(spokeRoot, "content", "assets"), {
    recursive: true,
  });
  write(
    path.join(spokeRoot, "content", "assets", "branding", multiHubSpokeFile(spoke)),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>${spoke.siteName}</title></svg>\n`,
  );
}

/**
 * The nested manifest, exactly as an author would write it.
 *
 * @param {object} [options]
 * @param {readonly object[]} [options.hubs] the Hubs to declare (the fixture's own by default)
 * @param {object|null} [options.inspection] the composite inspection policy, or `null` for none
 */
export function multiHubManifest({ hubs = MULTI_HUB_HUBS, inspection = MULTI_HUB_INSPECTION } = {}) {
  return `${JSON.stringify(
    {
      spokeHubs: hubs.map((hub) => ({
        id: hub.id,
        spokes: hub.spokes.map((spoke) => ({ id: spoke.id, root: spoke.directory })),
        ...("spokeSwitcher" in hub ? { spokeSwitcher: hub.spokeSwitcher } : {}),
      })),
      ...(inspection === null
        ? {}
        : {
            inspectionSpoke: { spokeHubId: inspection.spokeHubId, spokeId: inspection.spokeId },
            ...(Array.isArray(inspection.hostnames) && inspection.hostnames.length > 0
              ? { inspectionHosts: [...inspection.hostnames] }
              : {}),
          }),
    },
    null,
    2,
  )}\n`;
}

/** The descriptor a caller consumes: one member, with everything a proof needs to name it. */
function descriptorOf(root, hubId, spoke) {
  return {
    hubId,
    id: spoke.id,
    segment: multiHubSegment(hubId, spoke.id),
    hostname: spoke.hostname,
    canonicalOrigin: `https://${spoke.hostname}`,
    directory: spoke.directory,
    root: path.join(root, ...spoke.directory.split("/")),
    onlyRoute: spoke.onlyRoute,
    siteName: spoke.siteName,
    tagline: spoke.tagline,
    homeLabel: spoke.homeLabel,
    aboutLabel: spoke.aboutLabel,
    aboutBody: spoke.aboutBody,
    mark: multiHubSpokeFile(spoke),
  };
}

/**
 * ONE member of an Installation, as the fixture's materialisers report it: the authored facts a proof needs to
 * name it, plus the identity the COMPOSITE authorities derive for it.
 *
 * @typedef {object} MultiHubMemberDescriptor
 * @property {string} hubId the Hub that OWNS this member
 * @property {string} id the member's Hub-LOCAL id (which may repeat in another Hub)
 * @property {string} segment its COMPOSITE runtime segment
 * @property {string} hostname its claimed hostname
 * @property {string} canonicalOrigin its authored canonical origin
 * @property {string} directory its authored directory, relative to the Installation root
 * @property {string} root its absolute authored root
 * @property {string} onlyRoute the route ONLY it authors
 * @property {string} siteName its authored site name
 * @property {string} tagline its authored tagline
 * @property {string} homeLabel its authored HOME navigation wording
 * @property {string} aboutLabel its authored ABOUT navigation wording
 * @property {string} aboutBody its authored About page text
 * @property {string} mark its own brand mark's basename
 */

/**
 * A disposable Installation authored with the REAL nested manifest: TWO identified Spoke Hubs, three members,
 * and Hub two's `docs` nominated for inspection.
 *
 * @param {{ repositoryRoot: string }} options the repository the authored SOURCES are cloned from
 * @returns {{
 *   root: string, manifestFile: string, inspection: object|null, hubs: readonly object[],
 *   spokes: readonly MultiHubMemberDescriptor[], cleanup: () => void,
 * }}
 */
export function materializeMultiHubInstallation({ repositoryRoot }) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-multihub-"));
  for (const spoke of MULTI_HUB_SPOKES) writeMultiHubSpoke(root, repositoryRoot, spoke);
  write(path.join(root, "spokes.json"), multiHubManifest());

  return {
    root,
    manifestFile: path.join(root, "spokes.json"),
    inspection: { ...MULTI_HUB_INSPECTION },
    hubs: MULTI_HUB_HUBS.map((hub) => ({ id: hub.id, memberIds: hub.spokes.map((spoke) => spoke.id) })),
    spokes: MULTI_HUB_SPOKES.map((spoke) => descriptorOf(root, spoke.hubId, spoke)),
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * A disposable Installation authored with ONE Hub and ONE Spoke — the §6 case.
 *
 * This form is IDENTIFIED too, so it must dispatch by EXACT hostname: the flat/legacy one-Spoke
 * compatibility rule (an Installation declaring one Spoke answers every host) must NOT reach it.
 *
 * @param {{ repositoryRoot: string }} options the repository the authored SOURCES are cloned from
 * @returns {{
 *   root: string, manifestFile: string, inspection: object|null,
 *   spokes: readonly MultiHubMemberDescriptor[], cleanup: () => void,
 * }}
 */
export function materializeSingleIdentifiedInstallation({ repositoryRoot }) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-multihub-solo-"));
  const spoke = {
    ...MULTI_HUB_HUBS[0].spokes[0],
    hubId: "solo",
    directory: "spokes/solo-docs",
    hostname: "solo-docs.localhost",
    siteName: "Solo Identified Docs Site",
  };
  writeMultiHubSpoke(root, repositoryRoot, spoke);
  write(
    path.join(root, "spokes.json"),
    multiHubManifest({ hubs: [{ id: "solo", spokes: [spoke] }], inspection: null }),
  );

  return {
    root,
    manifestFile: path.join(root, "spokes.json"),
    inspection: null,
    spokes: [descriptorOf(root, "solo", spoke)],
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/**
 * The GENERATED files ONE member's own namespace needs, as `{ from, to }` pairs to install beneath
 * `public/spokes/<segment>/assets/**` — READ FROM THE CANONICAL PLAN, never enumerated here.
 *
 * The plan (`buildPlan`) is the ONE authority for which authored source becomes which runtime basename in
 * which namespace: a member's replaceable role artwork and its `branding/` belong to the MEMBER, while the
 * shared icon library and the platform marks are installed once into the platform namespace. This function
 * therefore reports only this member's OWN namespace's rows.
 *
 * @param {string} installationRoot the Installation root the plan is asked about
 * @param {string} segment the member's COMPOSITE runtime segment — its namespace's identity
 * @returns {{ from: string, to: string, note: string }[]} absolute source, runtime basename and the plan's reason
 */
export function multiHubNamespacePlan(installationRoot, segment) {
  return buildPlan(installationRoot)
    .filter((row) => row.namespace === `spoke:${segment}`)
    .map((row) => ({ ...row, from: path.join(installationRoot, ...row.from.split("/")) }));
}

/** The namespace KEY and URL base of one member — asked of the authority, never spelled here. */
export function multiHubNamespaceIdentity(installationRoot, segment) {
  const namespaces = runtimeNamespaces(installationRoot);
  const namespace = namespaces.find((entry) => entry.key === `spoke:${segment}`);
  if (namespace === undefined) {
    throw new Error(
      `the Installation at "${installationRoot}" declares no generated namespace for the composite segment ` +
        `"${segment}".`,
    );
  }
  return { key: namespace.key, urlBase: namespace.urlBase, directory: namespace.directory };
}

/**
 * Judges ONE member's namespace against the PUBLISHED catalog BEFORE anything writes to disk.
 *
 * A stale inventory, or a shared platform namespace claiming a member-owned replaceable role, stops the run
 * with a diagnostic naming the Installation and the canonical preparation (`pnpm assets:sync`) instead of
 * leaving the failure to a page that cannot compose. This delegates to the accepted agreement authority, so
 * an identified Installation is judged by exactly the rule an explicit one is.
 */
export function assertMultiHubNamespaceAgreesWithCatalog(installationRoot, segment) {
  assertSpokeNamespaceAgreesWithCatalog(installationRoot, segment);
}
