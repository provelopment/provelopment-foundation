#!/usr/bin/env node
/**
 * RUNTIME ASSET MIRROR — the ONE deterministic relationship between the
 * authoritative SOURCE asset tree (`content/assets/**`) and the runtime delivery
 * directory (`public/assets/**`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Next.js serves static files from `public/` only, so every graphic the running
 * site fetches must exist as a real file under `public/assets/`. The Foundation
 * therefore ships the artwork TWICE by necessity — but never as two independent
 * authorities:
 *
 *   <deployment>/content/assets/**  →  the SOURCE OF TRUTH: the ONE place a human adds or
 *                           replaces authored site artwork, beside the rest of the
 *                           site's content. It belongs to the SELECTED DEPLOYMENT,
 *                           so this script resolves it through the platform's
 *                           deployment seam and the tree moves with the deployment
 *                           (see "DEPLOYMENT-SCOPED SOURCE" below)
 *   public/assets/**     →  a GENERATED, byte-identical DERIVATIVE (what the browser
 *                           fetches). NEVER edit it by hand: an edit there is
 *                           overwritten by the next `assets:sync`, and `assets:check`
 *                           fails in the meantime.
 *
 * NOT VERSION-CONTROLLED (FOUNDATION-DEPLOYMENT-ISO-B3C1)
 * ------------------------------------------------------
 * The mirror is DERIVED state, so it is not tracked: `.gitignore` excludes it, and every workflow
 * installs it deterministically — `pnpm install` (postinstall), `pnpm dev` and `pnpm build` each run
 * this script, so a fresh clone needs no undocumented step. `pnpm assets:sync` re-installs on demand
 * and `pnpm assets:check` verifies without repairing. Tracking it would put a second copy of every
 * artwork byte in version control, able to disagree with the source it was derived from — the
 * ambiguity this ownership model exists to remove.
 *
 * This script is the only sanctioned writer of those derivatives. It is
 * idempotent, it reports every create/update, and `--check` fails (exit 1) when
 * the two trees drift — which is what `deployment/tests/unit/asset-taxonomy-mirror.test.ts`
 * and the `assets:check` script both assert.
 *
 * OWNERSHIP MODEL (see BRAND_ASSETS.md "Source assets vs runtime assets"):
 *   content/assets/branding/        deployment/business-specific artwork
 *   content/assets/icon-library/    reusable, non-business-specific generic icons
 *   content/assets/placeholders/    blank/generic defaults for a fresh installation
 *   content/assets/platform-marks/  royalty-free platform/social-service marks
 *
 * DEPLOYMENT-SCOPED SOURCE (FOUNDATION-DEPLOYMENT-ISO-H1)
 * ------------------------------------------------------
 * The source tree is DEPLOYMENT state, so this script spells no location of its own: it asks the
 * ONE build/deployment seam (`src/config/deployment-build.mjs`) which deployment this run serves —
 * the same answer `next.config.ts` and `vitest.config.mts` receive — and mirrors from whichever
 * root that deployment owns:
 *
 *   repository layout   <repo>/content/assets/**
 *   capsule layout      <repo>/deployment/content/assets/**
 *   override layout     <override-root>/content/assets/**
 *
 * The GENERATED mirror is NOT deployment state — Next.js serves static files from `public/` only
 * — so `public/assets/**` stays repository build output in every layout. Accordingly the
 * `MIRRORED` / `MIRRORED_DIRECTORIES` `from` paths are relative to the SELECTED DEPLOYMENT's root,
 * while the runtime target is always `<repo>/public/assets/`. This script never inspects which
 * customer or deployment it is processing: swap the deployment and the pipeline follows it.
 *
 * The seam is PLAIN ESM (`src/config/deployment-build.mjs`), so this script imports it directly and
 * Node runs both natively: `package.json` needs no TypeScript execution flag and no loader or
 * warning suppression for the asset commands (FOUNDATION-DEPLOYMENT-ISO-H1C).
 *
 * USAGE
 *   node scripts/sync-runtime-assets.mjs                  # install the runtime mirror (create, update, remove)
 *   node scripts/sync-runtime-assets.mjs --check          # verify only, exit 1 on drift/absence/unauthorized output
 *   node scripts/sync-runtime-assets.mjs --if-deployment  # install only if a deployment exists (the postinstall hook)
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// THE ONE DEPLOYMENT-SELECTION SEAM (FOUNDATION-DEPLOYMENT-ISO-H1 / H1C)
// The asset SOURCE tree is deployment-owned state, so this build-tool script asks the same
// authority `next.config.ts` and `vitest.config.mts` ask (`src/config/deployment-build.mjs`)
// instead of implementing a second deployment-root mechanism or hard-coding a location. That
// module is plain ESM with JSDoc types, so `node` loads it natively — exactly as Next and Vitest do.
//
// S3E1C/S3F1 — the SAME seam also answers which authored form the Installation uses and, when it is
// EXPLICIT, which Spokes it declares: every declared Spoke owns a runtime namespace of its own, and those
// answers must come from the authority rather than from a second manifest reader here.
import { installationSpokes, resolveDeploymentForBuild } from "../src/config/deployment-build.mjs";
import {
  SPOKE_RUNTIME_CONTAINER,
  spokeRuntimeAssetNamespacePath,
  spokeRuntimeAssetUrlBase,
} from "../src/config/spoke-runtime-segment.mjs";
// M16/M17 (Defect B) — the SAME header decoder the resolver uses for a namespace that carries no catalog,
// so the sizes this build PUBLISHES and the sizes a compatibility read derives cannot drift. Plain ESM with
// JSDoc types, loaded natively by `node` (see the module note in that file).
import { MAX_HEADER_BYTES, dimensionsFromBytes } from "../src/config/runtime-asset-dimensions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIR = "public/assets";
/** The GENERATED runtime tree — repository build output, never deployment state (see above). */
const RUNTIME_ROOT = path.join(ROOT, RUNTIME_DIR);
/** The deployment-owned source tree, relative to whichever root the deployment owns. */
const SOURCE_DIRECTORY = path.join("content", "assets");

/**
 * THE RUNTIME NAMESPACE MODEL (FOUNDATION-MULTISITE-S3E1C)
 * --------------------------------------------------------
 * Every generated runtime file belongs to exactly ONE namespace, and a namespace is a SEPARATE runtime
 * root with its own URL base:
 *
 *   platform   `<runtime base>/assets`                  →  `/assets/**`
 *              Foundation/platform-owned artwork: the reusable icon library and the platform marks.
 *              Shared by every Spoke, never duplicated into one.
 *   spoke      `<runtime base>/spokes/<segment>/assets` →  `/spokes/<segment>/assets/**`
 *              ONE Spoke's own replaceable artwork (its role files and its `branding/`), in a namespace
 *              derived from that Spoke's IDENTITY — so two Spokes may ship the same asset basename
 *              without either being able to overwrite the other.
 *
 * The two are never nested inside one another, and no Spoke namespace ever appears beneath
 * `public/assets/**`. `runtimeNamespaces()` is the only place either is spelled.
 */

/** The platform namespace's directory, relative to the runtime base (`public/`). */
const PLATFORM_NAMESPACE_PATH = path.basename(RUNTIME_DIR);
/** The platform namespace's same-origin URL base. */
const PLATFORM_URL_BASE = "/assets";
/** The stable report key of the platform namespace. */
const PLATFORM_NAMESPACE_KEY = "platform";

/**
 * WHERE THIS RUN READS ITS SOURCE ASSETS FROM (FOUNDATION-DEPLOYMENT-ISO-H1)
 * -------------------------------------------------------------------------
 * One answer, asked of the seam — never guessed here:
 *
 *   repository  the seam finds no authored capsule at `<repo>/deployment/`  →  <repo>/content/assets/**
 *   capsule     `<repo>/deployment/` is authored (either form)             →  that root's asset sources
 *   override    `FOUNDATION_DEPLOYMENT_ROOT` is set (dev/test)             →  that root's asset sources
 *
 * …and, inside whichever root was selected, the AUTHORING MODE decides WHICH SPOKE supplies the artwork:
 * the legacy root itself, or (explicit) each Spoke the manifest declares.
 *
 * `runtimeRoot` is deliberately NOT a deployment location: Next.js serves static files from `public/`
 * only, so the generated mirror stays `<repository>/public/assets/**` in every layout. Exported and
 * parameterised so a generic test can prove all three layouts on synthetic trees.
 *
 * @param {Record<string, string | undefined>} [environment] the process environment the build reads
 *   (the same shape `resolveDeploymentForBuild` consumes), so a test can pass a synthetic one
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 */
export function resolveAssetDeployment(environment = process.env, repositoryRoot = ROOT) {
  const { layout, mode, root, resourceRoot } = resolveDeploymentForBuild(environment, repositoryRoot);
  return {
    layout,
    mode,
    /** The Installation root the plan's SOURCE paths are relative to. */
    deploymentRoot: root,
    /**
     * The root this deployment's RESOURCES live in (the sole Spoke's root in explicit mode), or `null`
     * for a MULTI-Spoke Installation.
     *
     * `null` is the honest answer rather than a missing one: an Installation declaring several Spokes has
     * no single resource root — that is exactly what "multi" means (see `./deployment-build.mjs`) — and the
     * plan already reads each declared Spoke's OWN tree (`installationSpokes`). Reaching for "the first
     * Spoke" here would invent the default/precedence rule the multi-Spoke runtime refuses.
     */
    resourceRoot,
    /**
     * Where this run reads its authored artwork from: the single resource root's `content/assets/**`, or
     * `null` in multi mode, where the sources are PER SPOKE and the plan names each one itself.
     */
    sourceRoot: resourceRoot === null ? null : path.join(resourceRoot, SOURCE_DIRECTORY),
    runtimeRoot: path.join(repositoryRoot, RUNTIME_DIR),
  };
}

/**
 * Is there a deployment to install for at all?
 *
 * The explicit asset commands and `pnpm dev`/`pnpm build` require one: a missing configuration is a
 * LOUD failure there, because a build must never silently serve a different deployment. `pnpm install`
 * is the one caller that must not assume it — a checkout with no deployment installed (the physical
 * separation B4 will make real, and any stripped-down clone today) still has to be installable — so
 * the postinstall hook asks THIS question first and reports "nothing to install" instead of failing.
 *
 * @param {Record<string, string | undefined>} [environment] the environment the seam reads
 * @param {string} [repositoryRoot] the repository the deployment is resolved inside
 * @returns {boolean} whether a deployment is resolvable here
 */
export function deploymentAvailable(environment = process.env, repositoryRoot = ROOT) {
  try {
    resolveAssetDeployment(environment, repositoryRoot);
    return true;
  } catch {
    // The seam's own message is the diagnostic a BUILD needs; here it only answers this question.
    return false;
  }
}

/** The deployment this run serves, resolved through the seam. Never cached across calls. */
function selectedDeploymentRoot() {
  return resolveAssetDeployment().deploymentRoot;
}

/**
 * ONE generated runtime namespace.
 * @typedef {object} RuntimeNamespace
 * @property {string} key the stable report key ("platform", "spoke:<id>")
 * @property {string} directory the generated directory, RELATIVE to the runtime base (`public/`)
 * @property {string} urlBase the same-origin URL base its files are served from
 * @property {string|null} spokeId the Spoke this namespace belongs to (`null` = the platform)
 */

/**
 * Every runtime namespace an Installation's artwork is installed into, in REPORT order: the platform
 * namespace first, then one per declared Spoke (in manifest order), each carrying the segment derived
 * from that Spoke's IDENTITY.
 *
 * A legacy Installation declares no Spoke and therefore has exactly ONE namespace — which is why its
 * runtime tree stays exactly what it has always been.
 *
 * @param {string} deploymentRoot the selected Installation root
 * @returns {RuntimeNamespace[]}
 */
export function runtimeNamespaces(deploymentRoot = selectedDeploymentRoot()) {
  const authoring = installationSpokes(deploymentRoot);
  /** @type {RuntimeNamespace[]} */
  const namespaces = [
    {
      key: PLATFORM_NAMESPACE_KEY,
      directory: PLATFORM_NAMESPACE_PATH,
      urlBase: PLATFORM_URL_BASE,
      spokeId: null,
    },
  ];
  // EVERY declared Spoke that owns a namespace of its own: a flat/explicit Installation's Spokes, and the
  // members of an IDENTIFIED collection — where the segment is COMPOSITE, so two Hubs' Spokes called `docs`
  // occupy two directories and can never mirror onto one another (FOUNDATION-ID-M3-P3 §7).
  if (authoring.mode !== "legacy") {
    for (const spoke of authoring.spokes) {
      namespaces.push({
        key: spokeNamespaceKey(spoke),
        directory: spokeRuntimeAssetNamespacePath(spoke.segment),
        urlBase: spokeRuntimeAssetUrlBase(spoke.segment),
        spokeId: spoke.spokeHubId === undefined ? spoke.id : `${spoke.spokeHubId}/${spoke.id}`,
      });
    }
  }
  return namespaces;
}

/**
 * THE KEY that ties ONE Spoke's plan rows to its namespace — the ONE spelling both `buildPlan` and
 * `runtimeNamespaces` use, so a row can never install into another Spoke's directory.
 *
 * For a flat/legacy Spoke it is `spoke:<id>`, exactly as it has always been. For an IDENTIFIED collection it
 * is `spoke:<segment>` (the COMPOSITE encoding), because a local id alone may name a Spoke in either Hub.
 *
 * @param {{ id: string, segment: string, spokeHubId?: string }} spoke a declared Spoke
 * @returns {string}
 */
function spokeNamespaceKey(spoke) {
  return `spoke:${spoke.spokeHubId === undefined ? spoke.id : spoke.segment}`;
}

/**
 * The REPLACEABLE ROLE ARTWORK: one source file per runtime ROLE the engine addresses by name (the
 * favicon, the two logo roles, the decorative header/footer layers, the sidebar disclosure icons and
 * the nav-item fallback icons).
 *
 * `from` is relative to the SELECTED INSTALLATION's root (repository, capsule or override), and `to` is
 * a FILENAME inside the namespace the row is installed into: the platform namespace for a legacy
 * Installation, and the SPOKE'S OWN namespace for each declared Spoke — because role artwork is exactly
 * the material a Spoke replaces. Two Spokes may therefore ship the same role basename without either
 * being able to overwrite the other's output.
 */
export const MIRRORED = [
  // ── Identity roles: NEUTRAL placeholders are the template's shipped default ─
  // The generic template ships no brand of its own: the identity roles resolve to
  // `content/assets/placeholders/**`, so a fresh clone renders a neutral, un-branded
  // site that an adopter replaces. Replace these files in place, or point the role
  // at your own absolute URL in `site.assets` (see BRAND_ASSETS.md).
  //
  // The header and footer logo ROLES share ONE source: both runtime basenames must
  // exist because the roles are addressed by basename (`site.assets.logo` /
  // `site.assets.logoFooter`).
  { from: "content/assets/placeholders/favicon.svg", to: "favicon.svg", note: "favicon role — neutral default" },
  { from: "content/assets/placeholders/logo-header.svg", to: "logo-header.svg", note: "header logo role — neutral default" },
  { from: "content/assets/placeholders/logo-header.svg", to: "logo-footer.svg", note: "footer logo role — same source as the header" },

  // ── Placeholders: the BLANK/GENERIC defaults a fresh install renders ─────
  { from: "content/assets/placeholders/header-graphic.svg", to: "header-graphic.svg", note: "decorative header band — blank default" },
  { from: "content/assets/placeholders/footer-graphic.svg", to: "footer-graphic.svg", note: "decorative footer layer — blank default" },
  { from: "content/assets/placeholders/sidebar-open.svg", to: "sidebar-open.svg", note: "sidebar show control icon" },
  { from: "content/assets/placeholders/sidebar-close.svg", to: "sidebar-close.svg", note: "sidebar hide control icon" },
  { from: "content/assets/placeholders/sidebar-default-icon-open.svg", to: "sidebar-default-icon-open.svg", note: "nav-item icon fallback (expanded)" },
  { from: "content/assets/placeholders/sidebar-default-icon-closed.svg", to: "sidebar-default-icon-closed.svg", note: "nav-item icon fallback (collapsed)" },
];

/**
 * The PLATFORM-OWNED directories: the reusable, non-business-specific icon library and the
 * platform/social marks. They are installed into the SHARED platform namespace (`/assets/**`) — never
 * duplicated into a Spoke's namespace, and never shadowable by one — so every Spoke on an Installation
 * serves the same platform artwork from the same URLs.
 *
 * In explicit mode the SOURCE is read from each declared Spoke's authored tree (that is where an
 * Installation's material lives once its website content has moved into a Spoke), but the TARGET stays
 * the one platform namespace: two Spokes offering the same platform basename is a plan the installer
 * REFUSES rather than resolves.
 */
export const MIRRORED_DIRECTORIES = [
  { from: "content/assets/icon-library/icons", note: "generic icon library" },
  { from: "content/assets/platform-marks", note: "platform/social marks" },
];

/**
 * The SPOKE-OWNED directories: an Installation's REPLACEABLE brand artwork, mirrored into the namespace
 * of the Spoke that authored it. One entry names the source tree; the namespace is that Spoke's.
 *
 * Flat and extension-filtered exactly like the platform directories (a subdirectory is not a role), and
 * deliberately OPTIONAL: a Spoke that ships no brand artwork of its own is the ordinary case — and the
 * canonical reference Installation is exactly that (`deployment/tests/unit/asset-install.test.ts`
 * asserts it ships none).
 */
export const SPOKE_DIRECTORIES = [
  { from: "content/assets/branding", note: "replaceable brand artwork (flat)" },
];

/**
 * Runtime files with NO in-repository source. Each entry must be an explicit, justified exception: an
 * undeclared runtime file is a manifest error, which is what keeps a second, uncontrolled asset library
 * from appearing in a generated namespace.
 *
 * EMPTY BY DESIGN (2026-09 closure pass): the ten `banner-*.png` files used to be the only entries here.
 * Persistent branded artwork must have an authoritative source beneath `content/assets/`, so a banner
 * family belongs in a Spoke's `content/assets/branding/` and is mirrored deterministically like every
 * other runtime graphic. A genuinely runtime-ONLY (generated, source-less) asset may still be declared
 * here with its reason — but nothing is kept here merely because it already was.
 */
export const RUNTIME_ONLY = [];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/**
 * One planned mirror row.
 * @typedef {object} MirrorRow
 * @property {string} from the source path, relative to the SELECTED INSTALLATION's root
 * @property {string} to the runtime filename the mirror installs, RELATIVE to its namespace
 * @property {string} note why this file is mirrored
 * @property {string} namespace the namespace key this row installs into (`platform`, `spoke:<id>`)
 */

/** Deliverable artwork extensions — documentation (e.g. `README.md`) is not mirrored. */
const MIRRORED_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

/** The artwork filenames ONE source directory contributes: regular files, deliverable extensions, sorted. */
function directoryFiles(deploymentRoot, from) {
  return readdirSync(path.join(deploymentRoot, from), { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIRRORED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort();
}

/**
 * REFUSE a plan in which two rows would install the SAME runtime file.
 *
 * Namespaces exist precisely so that two Spokes may ship the same basename; within ONE namespace,
 * however, a duplicate target would mean one entry silently overwriting another — a Spoke's artwork
 * replacing a platform asset, or one Spoke's replacing another's. That is never resolved by precedence:
 * the plan is rejected and both sources are named.
 *
 * @param {MirrorRow[]} rows the planned rows
 * @returns {MirrorRow[]} the same rows when every target is unique
 */
function assertUniqueTargets(rows) {
  /** @type {Map<string, MirrorRow>} */
  const seen = new Map();
  for (const row of rows) {
    const target = `${row.namespace}::${row.to}`;
    const previous = seen.get(target);
    if (previous !== undefined) {
      throw new Error(
        `the asset plan installs "${row.to}" TWICE into the "${row.namespace}" namespace ` +
          `(from "${previous.from}" and "${row.from}"). One runtime target must have exactly one ` +
          "source: give the files distinct names, or let each Spoke own its artwork in its own namespace.",
      );
    }
    seen.set(target, row);
  }
  return rows;
}

/**
 * The full, deterministic plan of mirrored files (sorted, extension-filtered), read from the SELECTED
 * INSTALLATION. `deploymentRoot` is a parameter so a generic test can substitute a synthetic deployment;
 * the CLI uses the installation the seam resolved.
 *
 * LEGACY mode is unchanged, byte for byte: every row installs into the platform namespace, from the
 * Installation root's own `content/assets/**` — the tree `public/assets/**` has always been.
 *
 * EXPLICIT mode gives EVERY declared Spoke its own namespace: its role artwork and its `branding/` are
 * installed THERE, while the platform-owned trees are installed once, into the shared platform namespace.
 *
 * @param {string} [deploymentRoot] the selected Installation root
 * @returns {MirrorRow[]}
 */
export function buildPlan(deploymentRoot = selectedDeploymentRoot()) {
  const authoring = installationSpokes(deploymentRoot);
  /** @type {MirrorRow[]} */
  const rows = [];
  const push = (from, to, note, namespace) => rows.push({ from, to, note, namespace });

  /**
   * M17 — A PLATFORM TARGET IS AUTHORED ONCE, SHARED BY EVERY SPOKE.
   *
   * The platform namespace is ONE generated tree, while a multi-Spoke Installation is authored as N complete
   * Spoke roots — each of which legitimately authors the platform-owned artwork. Two Spokes shipping the SAME
   * bytes for the same platform basename is therefore not a conflict: it is the same shared asset, and the
   * namespace gets ONE row for it. Genuinely DIFFERENT bytes for one platform target remain REFUSED (the
   * caller's own uniqueness check reports both sources), because the platform namespace cannot hold two
   * versions of an asset and "which Spoke's copy wins" is exactly the precedence this installer refuses.
   *
   * @param {string} from the candidate source, relative to the Installation root
   * @param {string} to the runtime target basename
   * @param {string} note why the file is mirrored
   * @returns {boolean} whether the row was added
   */
  const pushPlatform = (from, to, note) => {
    const existing = rows.find((row) => row.namespace === PLATFORM_NAMESPACE_KEY && row.to === to);
    if (existing === undefined) {
      push(from, to, note, PLATFORM_NAMESPACE_KEY);
      return true;
    }

    const same =
      sha256(readFileSync(path.join(deploymentRoot, existing.from))) ===
      sha256(readFileSync(path.join(deploymentRoot, from)));
    if (same) return true;

    // DIFFERENT bytes for one shared platform target: BOTH rows stay, so the uniqueness rule refuses the plan
    // and names the two sources. Silently dropping one would be exactly the precedence this installer refuses.
    push(from, to, note, PLATFORM_NAMESPACE_KEY);
    return false;
  };

  if (authoring.mode === "legacy") {
    for (const { from, to, note } of MIRRORED) push(from, to, note, PLATFORM_NAMESPACE_KEY);
    for (const { from, note } of MIRRORED_DIRECTORIES) {
      for (const name of directoryFiles(deploymentRoot, from)) {
        push(`${from}/${name}`, name, note, PLATFORM_NAMESPACE_KEY);
      }
    }
    return assertUniqueTargets(rows);
  }

  // INSTALLATION-LEVEL platform artwork (M17): the one location that is not any Spoke's, and therefore the
  // installation's own shared artwork — installed FIRST, so no Spoke can shadow it.
  for (const { from, note } of MIRRORED_DIRECTORIES) {
    if (!existsSync(path.join(deploymentRoot, from))) continue;
    for (const name of directoryFiles(deploymentRoot, from)) {
      pushPlatform(`${from}/${name}`, name, note);
    }
  }

  for (const spoke of authoring.spokes) {
    const namespace = spokeNamespaceKey(spoke);

    // This Spoke's OWN replaceable role artwork → its own namespace.
    for (const { from, to, note } of MIRRORED) {
      push(`${spoke.relativeRoot}/${from}`, to, note, namespace);
    }

    // …and its replaceable brand artwork, when it authors any.
    for (const { from, note } of SPOKE_DIRECTORIES) {
      const directory = `${spoke.relativeRoot}/${from}`;
      if (!existsSync(path.join(deploymentRoot, directory))) continue;
      for (const name of directoryFiles(deploymentRoot, directory)) {
        push(`${directory}/${name}`, name, note, namespace);
      }
    }

    // Platform-owned artwork stays SHARED: read from the Spoke's authored tree, installed ONCE into the ONE
    // platform namespace — identical copies from two Spokes are the same asset, different ones are refused.
    for (const { from, note } of MIRRORED_DIRECTORIES) {
      const directory = `${spoke.relativeRoot}/${from}`;
      if (!existsSync(path.join(deploymentRoot, directory))) continue;
      for (const name of directoryFiles(deploymentRoot, directory)) {
        pushPlatform(`${directory}/${name}`, name, note);
      }
    }
  }

  return assertUniqueTargets(rows);
}

/**
 * The runtime regions this installer OWNS, as `{ relative, absolute }` pairs relative to the generated
 * runtime base (`public/`): the platform namespace, and the container every Spoke namespace lives in
 * (which is also where a namespace a manifest no longer declares is found).
 *
 * Deliberately NOT the whole base: `public/` is Next.js' static directory, where an adopter may keep
 * files this installer knows nothing about. Only these two regions are generated output, so only these
 * two may be converged.
 *
 * @param {string} runtimeBase the generated runtime base (`<repo>/public`)
 * @returns {{ relative: string, absolute: string }[]} the regions that exist
 */
function runtimeRegions(runtimeBase) {
  return [PLATFORM_NAMESPACE_PATH, SPOKE_RUNTIME_CONTAINER]
    .map((relative) => ({ relative, absolute: path.join(runtimeBase, relative) }))
    .filter((region) => existsSync(region.absolute));
}

/**
 * Every entry under ONE runtime region, as a path RELATIVE TO THE RUNTIME BASE — files and directories
 * alike, directories suffixed `/`, deepest last.
 *
 * A namespace installs FLAT filenames, so any directory at all (and any file the plan does not declare)
 * is unauthorized output. That is what stops a second, uncontrolled asset library from appearing in a
 * generated namespace, what makes a STALE file — a source that was removed, or a Spoke a manifest no
 * longer declares — detectable instead of permanent, and what keeps one Spoke's namespace from being
 * mistaken for another's.
 *
 * An absent runtime tree is not an error: it is the state a fresh checkout starts in, and `syncMirrors`
 * is what bootstraps it.
 *
 * @param {string} directory the region's absolute directory
 * @param {string} prefix the region's base-relative directory
 * @returns {string[]} base-relative paths; a directory ends with `/`
 */
function entriesUnder(directory, prefix) {
  const found = [];
  const walk = (current, relative) => {
    const entries = readdirSync(current, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of entries) {
      const path_ = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        found.push(`${path_}/`);
        walk(path.join(current, entry.name), path_);
      } else {
        // Anything that is not a directory (including a symbolic link) is treated as a file.
        found.push(path_);
      }
    }
  };
  walk(directory, prefix);
  return found;
}

/**
 * Classify every planned pair: created / updated / current (+ missing sources), and list every runtime
 * entry the plan does NOT account for — in EVERY runtime namespace the Installation generates.
 *
 * `runtimeRoot` is a parameter for the same reason `deploymentRoot` is: a generic test proves this
 * generated-output lifecycle on disposable trees under the OS temp directory and must never touch the
 * repository's real `public/assets/**`. It is the PLATFORM namespace's directory, and it is what the
 * runtime base — the directory the namespaces live in — is derived from, so a test can exercise a whole
 * multi-namespace tree inside its own disposable root. Every command uses the defaults.
 *
 * Paths in the report are RELATIVE TO THE RUNTIME BASE, so a namespace is visible in the path itself
 * (`assets/favicon.svg`, `spokes/foundation/assets/favicon.svg`) — which is what makes two Spokes'
 * identical basenames distinguishable in a report.
 *
 * @param {string} [deploymentRoot] the selected Installation's root
 * @param {string} [runtimeRoot] the generated PLATFORM namespace directory
 * @returns {{ created: MirrorRow[], updated: MirrorRow[], current: MirrorRow[], missingSources: MirrorRow[], unexpected: string[] }}
 */
export function checkMirrors(deploymentRoot = selectedDeploymentRoot(), runtimeRoot = RUNTIME_ROOT) {
  const runtimeBase = path.dirname(runtimeRoot);
  const rows = buildPlan(deploymentRoot);
  /** @type {Map<string, RuntimeNamespace>} */
  const byKey = new Map(runtimeNamespaces(deploymentRoot).map((ns) => [ns.key, ns]));

  const created = [];
  const updated = [];
  const current = [];
  const missingSources = [];
  /** @type {Set<string>} */
  const plannedFiles = new Set();
  /** @type {Set<string>} */
  const plannedDirectories = new Set();

  for (const row of rows) {
    const namespace = byKey.get(row.namespace);
    const source = path.join(deploymentRoot, row.from);
    const target = path.join(runtimeBase, namespace.directory, row.to);

    const relativeTarget = `${namespace.directory}/${row.to}`;
    plannedFiles.add(relativeTarget);
    const parts = relativeTarget.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      plannedDirectories.add(`${parts.slice(0, index).join("/")}/`);
    }

    if (!existsSync(source)) {
      missingSources.push(row);
      continue;
    }
    const sourceHash = sha256(readFileSync(source));
    if (!existsSync(target)) created.push(row);
    else if (sha256(readFileSync(target)) !== sourceHash) updated.push(row);
    else current.push(row);
  }

  const allowlisted = (name) =>
    RUNTIME_ONLY.some((entry) => entry.pattern.test(name) || entry.pattern.test(path.basename(name)));

  const unexpected = [];
  for (const region of runtimeRegions(runtimeBase)) {
    for (const entry of entriesUnder(region.absolute, region.relative)) {
      const legitimate = entry.endsWith("/")
        ? plannedDirectories.has(entry)
        : plannedFiles.has(entry) || allowlisted(entry);
      if (!legitimate) unexpected.push(entry);
    }
  }

  return { created, updated, current, missingSources, unexpected: unexpected.sort() };
}

/**
 * Make every runtime namespace EQUAL the plan: create, update, and REMOVE unauthorized output
 * (idempotent).
 *
 * Removal is the half that keeps a generated tree honest. A source that no longer exists, a file
 * someone placed directly in a namespace, or a whole namespace belonging to a Spoke the manifest no
 * longer declares must not survive merely because it is already on disk — the PLAN decides what is
 * legitimate, never "what was already there". Only paths discovered INSIDE the generated runtime
 * regions are ever removed, only empty directories are unlinked (never a recursive delete), and nothing
 * is removed recursively from a path this function did not list itself.
 *
 * ONE SPOKE CANNOT TOUCH ANOTHER'S OUTPUT: every row names the namespace it installs into, the write
 * boundary is the runtime BASE (so no row can escape it), and a Spoke's namespace is only ever removed
 * when the plan does not declare that Spoke at all.
 *
 * @param {string} [deploymentRoot] the selected Installation's root
 * @param {string} [runtimeRoot] the generated PLATFORM namespace directory
 * @returns {{ created: MirrorRow[], updated: MirrorRow[], current: MirrorRow[], missingSources: MirrorRow[], unexpected: string[], removed: string[] }}
 */
export function syncMirrors(deploymentRoot = selectedDeploymentRoot(), runtimeRoot = RUNTIME_ROOT) {
  // Bootstrap FIRST: an absent platform namespace is the fresh-checkout state, not an error — and the
  // plan is what decides every namespace, so there is nothing to preserve from a previous install.
  mkdirSync(runtimeRoot, { recursive: true });
  const report = checkMirrors(deploymentRoot, runtimeRoot);
  /** @type {Map<string, RuntimeNamespace>} */
  const byKey = new Map(runtimeNamespaces(deploymentRoot).map((ns) => [ns.key, ns]));

  const base = path.resolve(path.dirname(runtimeRoot));
  /** A path inside the runtime base, or a refusal — this function's own write boundary. */
  const inside = (relative) => {
    const full = path.resolve(base, relative);
    if (full !== base && !full.startsWith(base + path.sep)) {
      throw new Error(`refusing to touch a path outside the runtime base: ${relative}`);
    }
    return full;
  };

  for (const row of [...report.created, ...report.updated]) {
    const namespace = byKey.get(row.namespace);
    const source = path.join(deploymentRoot, row.from);
    const target = inside(`${namespace.directory}/${row.to}`);
    mkdirSync(path.dirname(target), { recursive: true });
    const expected = sha256(readFileSync(source));
    copyFileSync(source, target);
    if (sha256(readFileSync(target)) !== expected) throw new Error(`mirror write failed: ${row.to}`);
  }

  const removed = [];
  const depth = (relative) => relative.split("/").filter((part) => part !== "").length;
  for (const relative of report.unexpected.filter((entry) => !entry.endsWith("/"))) {
    rmSync(inside(relative), { force: true });
    removed.push(relative);
  }
  // Deepest first, so a directory that only held unauthorized material goes once it is empty.
  const directories = report.unexpected
    .filter((entry) => entry.endsWith("/"))
    .sort((a, b) => depth(b) - depth(a));
  for (const relative of directories) {
    const full = inside(relative);
    if (existsSync(full) && readdirSync(full).length === 0) {
      rmdirSync(full);
      removed.push(relative);
    }
  }
  // …then a REGION that no longer holds a namespace: the container itself is the region root, so the
  // deepest-first pass above cannot see it. An empty SPOKE container is stale output like any other, and
  // removing it is what makes an abandoned Spoke namespace leave no trace. The PLATFORM namespace is
  // never removed: it is the generated tree's own root, and `mkdirSync` above bootstraps it every run.
  for (const region of runtimeRegions(base)) {
    if (region.relative === PLATFORM_NAMESPACE_PATH) continue;
    const directory = inside(region.relative);
    if (existsSync(directory) && readdirSync(directory).length === 0) {
      rmdirSync(directory);
      removed.push(`${region.relative}/`);
    }
  }
  return { ...report, removed: removed.sort() };
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// THE RUNTIME ASSET CATALOG (FOUNDATION-MULTISITE-M16/M17 — DEFECT B)
// ───────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY IT EXISTS. A page request re-composed the site and asked whether each configured icon had a matching
// file by calling `existsSync`/`statSync`/`openSync`/`readSync` under `public/assets/**`. In a serverless
// function that tree is NOT there: `public/` is static deployment output served by the CDN, and the
// function bundle carries only what the file tracer could see — so the check answered "missing" for files
// the deployment was serving perfectly well, and every page route failed loudly (500) while the
// sitemap/robots/OpenGraph routes kept working. Asset ownership and intrinsic sizes are BUILD knowledge,
// and this build already computes both deterministically from the same plan that installs the mirror.
//
// WHAT IT IS. The immutable answer to exactly the questions the resolver asks — per runtime namespace,
// which basenames exist and how large each one is — derived from `buildPlan()` (the SAME plan
// `assets:sync` installs and `assets:check` verifies), so "what is generated" and "what the runtime
// believes exists" cannot disagree by construction. It is written as a source module
// (`src/config/generated/runtime-asset-catalog.json`), so it is bundled into every server function — a
// module import is always traced — and it is COMMITTED, with `--check` failing on drift.
//
// WHAT IT IS NOT. Not a second inventory: the plan is the only source. Not a URL authority: the namespaces
// keep their accepted bases (`/assets`, `/spokes/<segment>/assets`). Not a runtime filesystem substitute
// for SERVING files: the browser still fetches the real static asset from `public/`.

/** The catalog's declared shape version — a consumer refuses a shape it does not know. */
export const CATALOG_VERSION = 1;
/** The GENERATED catalog, as a repository source module (bundled, committed, drift-checked). */
export const CATALOG_FILE = path.join(ROOT, "src", "config", "generated", "runtime-asset-catalog.json");
/** The same file, spelled for diagnostics (a message never carries an absolute path). */
export const CATALOG_RELATIVE = "src/config/generated/runtime-asset-catalog.json";

/**
 * The intrinsic size of a SOURCE asset, or `null` when the container is unsupported — a value, never an
 * exception (the accepted fallback), read through the ONE shared decoder.
 *
 * @param {string} file the source file's absolute path
 * @returns {{ width: number, height: number } | null}
 */
function sourceDimensions(file) {
  try {
    const descriptor = openSync(file, "r");
    try {
      const head = Buffer.alloc(MAX_HEADER_BYTES);
      const read = readSync(descriptor, head, 0, MAX_HEADER_BYTES, 0);
      const dimensions = dimensionsFromBytes(head.subarray(0, read));
      return dimensions === undefined ? null : { width: dimensions.width, height: dimensions.height };
    } finally {
      closeSync(descriptor);
    }
  } catch {
    return null;
  }
}


/**
 * The catalog derived from the PLAN — one entry per declared runtime file, keyed by the namespace's
 * accepted URL base, with namespace keys and filenames sorted so the file is byte-stable run to run.
 *
 * @param {string} [deploymentRoot] the selected Installation's root
 * @returns {{ version: number, namespaces: Record<string, Record<string, { width: number, height: number } | null>> }}
 */
export function buildRuntimeAssetCatalog(deploymentRoot = selectedDeploymentRoot()) {
  /** @type {Map<string, RuntimeNamespace>} */
  const byKey = new Map(runtimeNamespaces(deploymentRoot).map((namespace) => [namespace.key, namespace]));
  /** The declared files per namespace URL base. */
  const collected = new Map();
  for (const row of buildPlan(deploymentRoot)) {
    const namespace = byKey.get(row.namespace);
    if (namespace === undefined) {
      throw new Error(`the plan installs into a namespace the runtime does not declare: ${row.namespace}`);
    }
    const files = collected.get(namespace.urlBase) ?? new Map();
    files.set(row.to, sourceDimensions(path.join(deploymentRoot, row.from)));
    collected.set(namespace.urlBase, files);
  }
  const namespaces = Object.fromEntries(
    [...collected.keys()].sort().map((urlBase) => {
      const files = collected.get(urlBase);
      return [
        urlBase,
        Object.fromEntries([...files.keys()].sort().map((name) => [name, files.get(name)])),
      ];
    }),
  );
  return { version: CATALOG_VERSION, namespaces };
}

/**
 * The catalog's exact file text — LF, two-space indented, trailing newline: ONE spelling only, so
 * "unchanged" is a byte comparison and a reformat cannot pass as a change.
 *
 * @param {ReturnType<typeof buildRuntimeAssetCatalog>} catalog
 * @returns {string}
 */
export function catalogText(catalog) {
  return `${JSON.stringify(catalog, null, 2)}\n`;
}

/**
 * Verifies the committed catalog against the plan WITHOUT writing (the `--check` half).
 *
 * A missing catalog is stale, not an error: a fresh checkout has none until `assets:sync` runs, exactly as
 * the mirror itself is absent until then. Line endings are normalized before comparing, so a checkout that
 * stores LF as CRLF reports no drift it does not have (the rule the country-code reference check applies).
 *
 * @param {string} [deploymentRoot] the selected Installation's root
 * @param {string} [catalogFile] the generated catalog's path
 * @returns {{ file: string, catalog: object, expected: string, current: string, present: boolean, stale: boolean }}
 */
export function checkRuntimeAssetCatalog(deploymentRoot = selectedDeploymentRoot(), catalogFile = CATALOG_FILE) {
  const catalog = buildRuntimeAssetCatalog(deploymentRoot);
  const expected = catalogText(catalog);
  const present = existsSync(catalogFile);
  const current = present ? readFileSync(catalogFile, "utf8") : "";
  return {
    file: catalogFile,
    catalog,
    expected,
    current,
    present,
    stale: current.replace(/\r\n/g, "\n") !== expected,
  };
}

/**
 * Writes the catalog when — and only when — it differs from the plan (idempotent; the `assets:sync` half).
 * It runs in the SAME invocation as the mirror, so the tree and the belief about it are installed together
 * or not at all.
 *
 * @param {string} [deploymentRoot] the selected Installation's root
 * @param {string} [catalogFile] the generated catalog's path
 * @returns {{ file: string, catalog: object, expected: string, current: string, present: boolean, stale: boolean, changed: boolean }}
 */
export function syncRuntimeAssetCatalog(deploymentRoot = selectedDeploymentRoot(), catalogFile = CATALOG_FILE) {
  const report = checkRuntimeAssetCatalog(deploymentRoot, catalogFile);
  if (!report.stale) return { ...report, changed: false };
  mkdirSync(path.dirname(catalogFile), { recursive: true });
  writeFileSync(catalogFile, report.expected, "utf8");
  return { ...report, changed: true };
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const checkOnly = process.argv.includes("--check");
  const optional = process.argv.includes("--if-deployment");
  // The ONE tolerant caller: `pnpm install` must succeed in a checkout that has no deployment yet
  // (a stripped-down clone, or a Foundation repository after the B4 separation). Every other caller
  // keeps the seam's loud failure — a build must never silently serve a different deployment.
  if (optional && !deploymentAvailable()) {
    console.log(
      "runtime asset mirror — no deployment is installed in this repository, so there is no mirror to install.",
    );
    process.exit(0);
  }
  const installation = resolveAssetDeployment();
  const namespaces = runtimeNamespaces();
  const report = checkOnly ? checkMirrors() : syncMirrors();
  // The CATALOG is installed/verified in the SAME invocation as the tree it describes, so the runtime
  // never believes in a file this build did not install (and never disbelieves one it did).
  const catalog = checkOnly ? checkRuntimeAssetCatalog() : syncRuntimeAssetCatalog();
  const noun = (n) => `${n} file${n === 1 ? "" : "s"}`;
  console.log(
    `runtime asset mirror — ${RUNTIME_DIR} (${noun(buildPlan().length)} declared in ` +
      `${namespaces.length} namespace${namespaces.length === 1 ? "" : "s"})`,
  );
  console.log(`  source:   ${installation.sourceRoot ?? installation.deploymentRoot}  (${installation.layout}/${installation.mode})`);
  console.log(`  target:   ${installation.runtimeRoot}`);
  for (const namespace of namespaces) {
    console.log(
      `    namespace ${namespace.key.padEnd(18)} ${namespace.urlBase}  (${
        namespace.spokeId === null ? "platform-owned" : `Spoke "${namespace.spokeId}"`
      })`,
    );
  }
  console.log(
    `  catalog:  ${CATALOG_RELATIVE} (${noun(buildPlan().length)} across ${
      Object.keys(catalog.catalog.namespaces).length
    } namespace(s))`,
  );
  console.log(`  ${checkOnly ? "drifted" : "updated"}: ${noun(report.updated.length)}`);
  console.log(`  absent:   ${noun(report.created.length)}`);
  console.log(`  current:  ${noun(report.current.length)}`);
  if (!checkOnly) console.log(`  removed:  ${noun(report.removed.length)}`);
  for (const row of [...report.updated, ...report.created]) {
    console.log(`    ${checkOnly ? "drift" : "write"}  ${row.from} → ${row.namespace}/${row.to}`);
  }
  if (!checkOnly) for (const relative of report.removed) console.log(`    remove ${relative}`);

  const failures = [];
  if (report.missingSources.length > 0) {
    failures.push(
      `declared source asset(s) are missing:\n${report.missingSources.map((row) => `    ${row.from}`).join("\n")}`,
    );
  }
  // In CHECK mode unauthorized output is a failure: nothing may be accepted merely because it exists.
  // In SYNC mode it is an action already taken — reported above as `remove …` — because the plan, not
  // the previous contents of the tree, decides what is legitimate.
  if (checkOnly && report.unexpected.length > 0) {
    failures.push(
      "unauthorized runtime file(s) — the plan does not declare them, so nobody derived them. Mirror " +
        "them from a source, or declare them in RUNTIME_ONLY with a reason:\n" +
        report.unexpected.map((name) => `    ${name}`).join("\n"),
    );
  }
  if (checkOnly && (report.created.length > 0 || report.updated.length > 0)) {
    failures.push(
      report.created.length === buildPlan().length
        ? `the runtime mirror is NOT INSTALLED in ${RUNTIME_DIR}/ — run \`pnpm assets:sync\` (or \`pnpm install\`, which installs it).`
        : "runtime assets are not byte-identical to their sources — run `pnpm assets:sync`.",
    );
  }
  if (checkOnly && catalog.stale) {
    failures.push(
      `${CATALOG_RELATIVE} does not match the plan — the plan, not a stale file, decides what the runtime ` +
        "believes exists. Run `pnpm assets:sync` and commit the result.",
    );
  }
  if (failures.length > 0) {
    console.error(
      `\n${checkOnly ? "RUNTIME ASSET MIRROR CHECK FAILED" : "RUNTIME ASSET MIRROR INSTALL FAILED"}\n${failures.join("\n")}`,
    );
    process.exit(1);
  }
  console.log(
    "\nruntime asset mirror OK — every runtime file is byte-identical to its source, and nothing else is " +
      "present in any declared namespace.",
  );
}
