/**
 * THE DEPLOYMENT THE BUILD SELECTS (FOUNDATION-DEPLOYMENT-ISO-B1C)
 * ===============================================================
 *
 * Build/config-harness ONLY. `next.config.ts` and `vitest.config.mts` import this module; NO
 * application module may (the guard in `tests/architecture/deployment-root-guard.test.ts` proves it),
 * because it touches `node:fs` and would drag a filesystem import into a client chunk.
 *
 * It is deliberately the ONE place that answers "which deployment is this build for?" — and the
 * answer is then INLINED (`next.config.ts` → Next's `env`; `vitest.config.mts` → `test.env`) so that:
 *
 *   · `@/config/deployment-root` stays pure and client-safe (no `node:fs`, no `process.cwd()`);
 *   · the loader validates an already-selected configuration rather than reaching for a file;
 *   · and NO application module statically imports `<repo>/site.config.json`, so moving the
 *     deployment into a capsule (B2) cannot break module or build resolution.
 *
 * ISO-B1 resolved repository mode through a static `import` of the root config. That was a
 * compile-time dependency on the file's physical location: with the root `site.config.json` absent,
 * `tsc` failed with TS2307 and Turbopack with "Module not found". This module removes it — the root
 * config is now read HERE, at configuration time, like the capsule's.
 *
 * PLAIN ESM ON PURPOSE — ONE MODULE, THREE RUNTIMES (FOUNDATION-DEPLOYMENT-ISO-H1C)
 * ------------------------------------------------------------------------------
 * The authority is consumed by the build (`next.config.ts`), the test run (`vitest.config.mts`) and
 * the Foundation's own Node tooling (`scripts/sync-runtime-assets.mjs`), and only two of those three
 * run through a TypeScript compiler. A plain `.mjs` module is therefore the smallest stable boundary:
 *
 *   · Node executes it directly — no `--experimental-strip-types`, no loader or warning suppression;
 *   · Next and Vite import it like any other ES module (both already consume ESM);
 *   · TypeScript still sees the whole contract below, because the JSDoc types are part of the file
 *     and `tsc --noEmit` checks every call site (`next.config.ts`, `vitest.config.mts`, the guard).
 *
 * Its sibling `deployment-root.ts` stays TypeScript: that one IS compiled into application bundles and
 * is what the JSDoc `DeploymentLayout` below references — a type-only reference, erased at runtime.
 *
 * TWO AUTHORING MODES, ONE SELECTION (FOUNDATION-MULTISITE-S3F1)
 * --------------------------------------------------------------
 * An Installation is authored ONE of two ways, and this module is the ONE place that decides which:
 *
 *   legacy    `<root>/site.config.json`                the INSTALLATION ROOT is the one implicit Spoke
 *                                                      (the form an Installation authored at its root
 *                                                      uses), and the runtime resource paths are the
 *                                                      root's own.
 *   explicit  `<root>/spokes.json`                     the root DECLARES its Spokes; each one is
 *                                                      authored beneath `spokes/` and owns its own
 *                                                      `site.config.json`, configuration, content and
 *                                                      artwork.
 *
 *   BOTH authored  REFUSED (never a precedence rule).  NEITHER authored  REFUSED.
 *
 * SEVERAL SPOKES ARE SERVED BY HOSTNAME DISPATCH, AND NOTHING INVENTS A DEFAULT
 * ----------------------------------------------------------------------------
 * An explicit Installation may declare several Spokes. The build then inlines NO single configuration
 * and claims NO single resource root: the request boundary answers a request with the Spoke whose
 * EXACT hostname claims match it (`./spoke-host-routing.mjs` gives it that description, and a host no
 * Spoke claims answers nothing). There is deliberately NO "first Spoke", no "default Spoke" and no
 * manifest-order rule — nothing is ever chosen for a caller who did not say which Spoke they meant.
 *
 * WHAT THIS MODULE DOES NOT DO: it resolves DECLARED ROOTS and reads the sole Spoke's configuration so the
 * build can INLINE it. It composes no Spoke, builds no Hub, resolves no Site and validates no cross-Spoke
 * rule — `./spoke-roots`, `./spoke-config` and `./spoke-composition` stay the authorities for those.
 * The DECLARATION AND ROOT CONTRACT itself is not answered twice: `./spoke-declarations.mjs` is the ONE
 * implementation this seam and the TypeScript authority both consume, so a manifest this seam selects can
 * never be one the configuration/domain layer would refuse.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
  INSTALLATION_SPOKE_COLLECTION_FILE_NAME,
  resolveSpokeDeclarations,
  SPOKE_CONFIG_FILE_NAME,
} from "./spoke-declarations.mjs";
import { hostRoutingForInstallation } from "./spoke-host-routing.mjs";
import {
  runtimeSegmentForIdentifiedSpokeRef,
  runtimeSegmentForSpokeId,
} from "./spoke-runtime-segment.mjs";

/**
 * The layouts a build may select. Type-only reference to the client-safe authority's union.
 * @typedef {import("./deployment-root").DeploymentLayout} DeploymentLayout
 */

/**
 * The immutable hostname routing description (M16). Type-only reference to the plain-ESM authority that
 * produces it, so the contract is checked here without this module restating it.
 * @typedef {import("./spoke-host-routing.mjs").InstallationHostRouting} InstallationHostRouting
 */

/**
 * How an Installation is authored: a legacy implicit Spoke, an explicit collection of exactly ONE Spoke
 * (the accepted one-Spoke runtime), an explicit collection of SEVERAL (hostname dispatch, M16), or an
 * IDENTIFIED Spoke Hub collection (hostname dispatch ALWAYS, M3-P3).
 * @typedef {"legacy" | "explicit" | "multi" | "hubs"} InstallationAuthoringMode
 */

/**
 * ONE declared Spoke, at SELECTION level: its identity, where it is authored, and the runtime token
 * its own namespace is built from. No configuration, no Sites, no Hubs — those are later stages' facts.
 * @typedef {object} DeclaredSpoke
 * @property {string} id the manifest's authored identity
 * @property {string} relativeRoot the authored root, POSIX-relative to the Installation root
 * @property {string} root the resolved absolute root
 * @property {string} segment the Spoke's runtime namespace token: `runtimeSegmentForSpokeId(id)` for a
 *   flat/legacy Spoke, and the COMPOSITE `runtimeSegmentForIdentifiedSpokeRef({spokeHubId, id})` when the
 *   Installation IDENTIFIES its Spoke Hubs — because two Hubs may each declare the same local id, and a
 *   bare id would address whichever Hub came first
 * @property {string} [spokeHubId] the OWNING Spoke Hub, present only for an identified collection
 */

/**
 * The deployment a build resolved.
 * @typedef {object} ResolvedDeployment
 * @property {DeploymentLayout} layout the layout the build selected
 * @property {InstallationAuthoringMode} mode how the Installation is authored — `multi` when it declares
 *   SEVERAL Spokes, which is the one mode with NO single resource root and NO single configuration
 * @property {string} root the directory that owns the INSTALLATION: the capsule, the override root, or the repository
 * @property {string|null} resourceRoot the directory that owns the DEPLOYMENT'S RESOURCES: the root itself
 *   in legacy mode, the sole Spoke's root in explicit mode — and `null` in MULTI mode, where no single
 *   directory owns "the" deployment's resources (every Spoke owns its own). Dictionaries, authored pages
 *   and artwork sources are resolved from here, while installation lifecycle records stay at `root`.
 * @property {string} siteConfigFile the configuration file the build inlined (`""` in multi mode: there is
 *   no single configuration to inline)
 * @property {string} config the deployment's raw configuration TEXT, ready to inline into the build
 *   (`""` in multi mode — a Spoke context is what a consumer must select instead)
 * @property {DeclaredSpoke|null} spoke the SOLE declared Spoke in explicit mode; `null` in legacy and in multi mode
 * @property {InstallationHostRouting} hostRouting the immutable request-routing description the build
 *   inlines for the request boundary (`./spoke-host-routing.mjs`) — one entry per declared Spoke
 */

/** The environment names the build inlines for runtime code (`./deployment-root`). */
export const DEPLOYMENT_LAYOUT_ENV = "FOUNDATION_DEPLOYMENT_LAYOUT";
export const DEPLOYMENT_CONFIG_ENV = "FOUNDATION_DEPLOYMENT_CONFIG";
export const DEPLOYMENT_ROOT_ENV = "FOUNDATION_DEPLOYMENT_ROOT";
/**
 * S3F1 — the AUTHORING MODE the build resolved (`legacy` | `explicit`), the sole Spoke's root (relative
 * to the Installation root) and its runtime segment. The runtime authority reads these three so a
 * Spoke's resources can be served without any application module resolving a manifest.
 */
export const DEPLOYMENT_MODE_ENV = "FOUNDATION_DEPLOYMENT_MODE";
export const DEPLOYMENT_SPOKE_ROOT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_ROOT";
export const DEPLOYMENT_SPOKE_SEGMENT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_SEGMENT";
/**
 * M16 — the HOSTNAME ROUTING description (`./spoke-host-routing.mjs`), inlined as compact JSON. The
 * request boundary reads this and NOTHING else, so it never parses a Spoke's `site.config.json`, discovers a
 * Spoke root or restates an identity rule: the build resolved the table from the accepted authorities.
 */
export const DEPLOYMENT_HOST_ROUTING_ENV = "FOUNDATION_DEPLOYMENT_HOST_ROUTING";

/**
 * THE PUBLICATION RIGHTS THE EDGE MAY ASSERT, PROJECTED AT BUILD TIME
 * ==================================================================
 *
 * The request boundary runs where the filesystem and the validated manifest are both unavailable, so it
 * cannot decide whether a Spoke is *published* on a host — only whether a Spoke is *declared*. Those are not
 * the same question, and treating "declared" as "published" let an unpublished Spoke claim a public asset
 * URL on a shared host.
 *
 * This projection answers exactly the question the boundary is allowed to ask:
 *
 *     for THIS public host, which Spokes have an explicit EFS publication binding?
 *
 * It is a DERIVED READ-MODEL of `efs/manifest.json`, never an independent registry: nothing here is authored
 * by hand, and nothing here can GRANT a right the manifest does not declare. It can only be NARROWER than
 * the manifest — a binding that is unparseable, or that names no host, projects nothing — so a projection
 * defect fails closed. The authoritative validation still happens at request time (`@/config/efs/manifest`),
 * which refuses an invalid manifest outright rather than serving a subset of it.
 *
 * Ownership is never taken from `site.url` here: a Spoke's informational origin says which host it is SERVED
 * FROM, not which host it may publish on.
 */
export const DEPLOYMENT_EFS_PUBLICATIONS_ENV = "FOUNDATION_DEPLOYMENT_EFS_PUBLICATIONS";

/**
 * The capsule directory the selector probes: `<repositoryRoot>/deployment`.
 *
 * Exported because the spelling belongs HERE and nowhere else: a caller that needs to know where a
 * deployment's capsule WOULD live (a test guard protecting it from writes, for instance) asks this
 * module rather than composing `…/deployment` for itself. ISO-B3C2A fixes the set of modules that may
 * name the capsule directory; this keeps that set at two.
 *
 * @param {string} [repositoryRoot] the repository the capsule would live in
 * @returns {string} the absolute capsule directory
 */
export function capsuleDirectory(repositoryRoot = process.cwd()) {
  return path.join(repositoryRoot, "deployment");
}

/**
 * The authored manifest an Installation carries when it DECLARES its Spokes (the explicit authoring form),
 * and the dedicated namespace its declared Spoke roots must live in.
 *
 * Both spellings, the identity rules, the locator rules and the physical-containment rules live in ONE
 * implementation, `./spoke-declarations.mjs`, which the S3C1 authority (`./spoke-roots.ts`) consumes as
 * well: a build can therefore never SELECT a declared root the configuration/domain layer would refuse.
 * Re-exported here because this module is where a caller asks a selection-level question.
 */
export { INSTALLATION_SPOKE_COLLECTION_FILE_NAME };
export { SPOKE_ROOTS_DIRECTORY_NAME } from "./spoke-declarations.mjs";

/** The authored configuration file a deployment root — and a declared Spoke root — must carry. */
export const DEPLOYMENT_CONFIG_FILE_NAME = SPOKE_CONFIG_FILE_NAME;

/**
 * The Spokes ONE Installation root declares, WITHOUT deciding how many the RUNTIME may activate.
 *
 *   no `spokes.json`       legacy   → the root is the one implicit Spoke; nothing is declared here
 *   `spokes.json` present  explicit → its entries, resolved and validated (1..*)
 *   BOTH / NEITHER         REFUSED, loudly — an Installation is authored exactly one way
 *
 * SELECTION-level questions only: identity, location, and the runtime segment each identity owns. It
 * reads no Spoke configuration, composes no Spoke and enforces no cardinality:
 * `resolveDeploymentForBuild` applies S3F1's "exactly one" rule, so plan-building tooling (which must
 * describe N Spokes) can ask this question without being refused.
 *
 * The DECLARATION AND ROOT CONTRACT is NOT restated here: `./spoke-declarations.mjs` answers it once for
 * this seam and for the S3C1 authority, so both sides accept and refuse the same manifests by
 * construction rather than by agreement between two copies.
 *
 * @param {string} installationRoot the Installation root to describe
 * @returns {{ mode: InstallationAuthoringMode, manifestFile: string|null, spokes: DeclaredSpoke[],
 *   hubIds?: string[] }}
 */
export function installationSpokes(installationRoot) {
  const resolved = resolveSpokeDeclarations(installationRoot);

  if (resolved.mode === "legacy") return { mode: "legacy", manifestFile: null, spokes: [] };

  // NESTED — AN IDENTIFIED COLLECTION: every Spoke is addressed by BOTH halves of its identity.
  //
  // Each declared Spoke carries its owning Hub, and its runtime SEGMENT is the composite one, so the
  // namespace, the routing entry and the runtime context of the same Spoke are derived from the same fact.
  // The Hubs stay separate (`hubIds`, in authored order) so a consumer that must know the membership — the
  // Hub-scoped switcher above all — never has to reconstruct it from a flattened list.
  if (resolved.mode === "hubs") {
    const hubs = resolved.hubs.map((hub) => hub.id);
    return {
      mode: "hubs",
      manifestFile: resolved.manifestFile,
      hubIds: hubs,
      spokes: resolved.hubs.flatMap((hub) =>
        hub.spokes.map((spoke) => ({
          id: spoke.id,
          relativeRoot: spoke.locator,
          root: spoke.root,
          segment: runtimeSegmentForIdentifiedSpokeRef({ spokeHubId: hub.id, spokeId: spoke.id }),
          spokeHubId: hub.id,
        })),
      ),
    };
  }

  return {
    mode: "explicit",
    manifestFile: resolved.manifestFile,
    spokes: resolved.declarations.map((declaration) => ({
      id: declaration.id,
      relativeRoot: declaration.locator,
      root: declaration.root,
      segment: runtimeSegmentForSpokeId(declaration.id),
    })),
  };
}


/** The manifest override the runtime reads (`@/app/[[...segments]]/efs-request.ts`). Mirrored, not moved. */
const EFS_MANIFEST_ENV = "FOUNDATION_EFS_MANIFEST";

/**
 * Project `efs/manifest.json` into the publication facts the request boundary may assert.
 *
 * DELIBERATELY NARROWER THAN THE MANIFEST: anything this function cannot read confidently projects NOTHING,
 * so a projection defect can only deny access, never grant it. The validated loader remains the authority
 * and refuses a malformed manifest at request time.
 *
 * Every binding counts — canonical AND alias — because both are publication rights. `site.url` is never
 * consulted.
 *
 * @param {string} root the installation root whose `efs/manifest.json` is projected
 * @param {Record<string, string | undefined>} environment the build environment (manifest override)
 * @returns {{ host: string, spokeId: string, spokeHubId?: string }[]}
 */
function efsPublicationClaims(root, environment) {
  const override = environment[EFS_MANIFEST_ENV]?.trim();
  const manifestPath =
    override !== undefined && override !== "" ? override : path.join(root, "efs", "manifest.json");
  if (!existsSync(manifestPath)) return [];

  /** @type {unknown} */
  let document;
  try {
    document = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }
  if (document === null || typeof document !== "object" || Array.isArray(document)) return [];
  const publications = /** @type {{ publications?: unknown }} */ (document).publications;
  if (!Array.isArray(publications)) return [];

  /** @type {{ host: string, spokeId: string, spokeHubId?: string }[]} */
  const claims = [];
  for (const publication of publications) {
    if (publication === null || typeof publication !== "object") continue;
    const { spokeId, spokeHubId, bindings } = /** @type {Record<string, unknown>} */ (publication);
    if (typeof spokeId !== "string" || spokeId.length === 0) continue;
    if (spokeHubId !== undefined && typeof spokeHubId !== "string") continue;
    if (!Array.isArray(bindings)) continue;
    for (const binding of bindings) {
      if (binding === null || typeof binding !== "object") continue;
      const rawHost = /** @type {Record<string, unknown>} */ (binding).host;
      if (typeof rawHost !== "string") continue;
      const host = rawHost.trim().toLowerCase();
      if (host === "") continue;
      claims.push(spokeHubId === undefined ? { host, spokeId } : { host, spokeId, spokeHubId });
    }
  }
  return claims;
}


/**
 * Resolves the deployment this build serves.
 *
 *   override    `FOUNDATION_DEPLOYMENT_ROOT` is set (dev/test) → that directory owns it
 *   capsule     `<repo>/deployment/` is authored (either form) → the capsule owns it
 *   repository  otherwise → `<repo>` itself, the ROOT layout
 *
 * …and then, inside whichever root was selected, the AUTHORING MODE decides what the runtime reads:
 *
 *   legacy      the root's own `site.config.json` and its own resource trees
 *   explicit    the SOLE declared Spoke's `site.config.json` and its resource trees, while the
 *               INSTALLATION root keeps its own lifecycle records
 *
 * An explicit Installation declaring 2+ Spokes is served by hostname dispatch: it inlines no single
 * configuration and no single resource root. A missing configuration is a LOUD failure — the build
 * must never silently fall back to a different deployment than the one selected.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the build reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {ResolvedDeployment}
 */
export function resolveDeploymentForBuild(
  environment = /** @type {Record<string, string | undefined>} */ (process.env),
  repositoryRoot = process.cwd(),
) {
  const override = environment[DEPLOYMENT_ROOT_ENV]?.trim();
  const capsuleRoot = capsuleDirectory(repositoryRoot);
  const capsuleAuthored =
    existsSync(path.join(capsuleRoot, DEPLOYMENT_CONFIG_FILE_NAME)) ||
    existsSync(path.join(capsuleRoot, INSTALLATION_SPOKE_COLLECTION_FILE_NAME));

  /** @type {DeploymentLayout} */
  const layout =
    override !== undefined && override !== ""
      ? "override"
      : capsuleAuthored
        ? "capsule"
        : "repository";

  const root =
    layout === "override"
      ? path.isAbsolute(override)
        ? override
        : path.resolve(repositoryRoot, override)
      : layout === "capsule"
        ? capsuleRoot
        : repositoryRoot;

  const authoring = installationSpokes(root);
  // M16 — the request boundary's routing description, resolved HERE from the same authorities this seam
  // already consumes (never composed by hand and never re-derived from a directory name).
  const hostRouting = hostRoutingForInstallation(root);
  // The request boundary cannot read the filesystem or the manifest, so the build projects the ONE fact it
  // may assert there: which Spokes have an explicit publication binding for a host.
  const efsPublications = efsPublicationClaims(root, environment);

  if (authoring.mode === "legacy") {
    const siteConfigFile = path.join(root, DEPLOYMENT_CONFIG_FILE_NAME);
    return {
      layout,
      mode: "legacy",
      root,
      resourceRoot: root,
      siteConfigFile,
      config: readFileSync(siteConfigFile, "utf8"),
      spoke: null,
      hostRouting,
      efsPublications,
    };
  }

  const declared = authoring.spokes;

  // AN IDENTIFIED SPOKE HUB COLLECTION IS ALWAYS HOSTNAME DISPATCH (§6). Even when the whole nested
  // Installation contains exactly ONE Hub and ONE Spoke, an explicitly identified Spoke uses EXACT hostname
  // dispatch: the one-Spoke compatibility rule below belongs to the LEGACY/FLAT authoring form (a
  // development or preview host has to reach something), and an identified Spoke Hub was authored
  // deliberately enough that "answer any host" would be a lie about what its author declared. It inlines no
  // single configuration and claims no single resource root, so the permissive path cannot be reached
  // through `deploymentMode()` either.
  if (authoring.mode === "hubs") {
    return {
      layout,
      mode: "hubs",
      root,
      resourceRoot: null,
      siteConfigFile: "",
      config: "",
      spoke: null,
      hostRouting,
      efsPublications,
    };
  }

  // EXACTLY ONE declared Spoke: the accepted one-Spoke runtime, unchanged — its resources are the ones
  // dictionaries, pages and artwork resolve from, and its configuration is the one the build inlines.
  if (declared.length === 1) {
    const [spoke] = declared;
    const siteConfigFile = path.join(spoke.root, DEPLOYMENT_CONFIG_FILE_NAME);
    return {
      layout,
      mode: "explicit",
      root,
      resourceRoot: spoke.root,
      siteConfigFile,
      config: readFileSync(siteConfigFile, "utf8"),
      spoke,
      hostRouting,
      efsPublications,
    };
  }

  // SEVERAL declared Spokes: the multi-host runtime. There is NO default Spoke, no first Spoke and no
  // manifest-order selection — a request is answered by the Spoke whose hostname claims match, which is why
  // this mode inlines NO single configuration and claims NO single resource root. Every Spoke owns its own
  // resources, and the runtime index composes one context per declared Spoke.
  return {
    layout,
    mode: "multi",
    root,
    resourceRoot: null,
    siteConfigFile: "",
    config: "",
    spoke: null,
    hostRouting,
    efsPublications,
  };
}

/**
 * The `env`/`test.env` pairs that carry the selected deployment into the build and its tests.
 *
 * The runtime authority (`./deployment-root`) reads these and nothing else, so a Spoke's resources are
 * served without any application module resolving a manifest: the build resolved it ONCE, here.
 *
 * The mode keys are ALWAYS published (empty for a legacy Installation), so a test process that switches
 * between a synthetic legacy deployment and an explicit one cannot inherit a stale answer.
 *
 * @param {ResolvedDeployment} resolved the resolved deployment
 * @returns {Record<string, string>}
 */
export function deploymentEnvironment(resolved) {
  return {
    [DEPLOYMENT_LAYOUT_ENV]: resolved.layout,
    [DEPLOYMENT_MODE_ENV]: resolved.mode,
    [DEPLOYMENT_CONFIG_ENV]: resolved.config,
    [DEPLOYMENT_SPOKE_ROOT_ENV]: resolved.spoke?.relativeRoot ?? "",
    [DEPLOYMENT_SPOKE_SEGMENT_ENV]: resolved.spoke?.segment ?? "",
    [DEPLOYMENT_HOST_ROUTING_ENV]: JSON.stringify(resolved.hostRouting),
    [DEPLOYMENT_EFS_PUBLICATIONS_ENV]: JSON.stringify(resolved.efsPublications),
  };
}
