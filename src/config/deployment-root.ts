/**
 * THE DEPLOYMENT ROOT (FOUNDATION-DEPLOYMENT-ISO-B1)
 * =================================================
 *
 * ONE authority for every DEPLOYMENT-OWNED filesystem location. Foundation core never spells those
 * locations itself: a deployment's configuration, dictionaries, authored pages and artwork sources
 * are resolved here — and every consumer asks this module instead of building a path of its own
 * (`tests/architecture/deployment-root-guard.test.ts` keeps it that way).
 *
 * WHY ONE MODULE (and not a helper per consumer)
 * ---------------------------------------------
 * The audit (ISO-A1) found the same root-relative assumption written in four places
 * (`src/config/loader.ts`, `src/config/i18n/index.ts`,
 * `src/adapters/content/authoring-source-discovery.ts`, `src/config/assets.ts`). Spreading the rule
 * further would only move the coupling, so the rule lives here.
 *
 * CLIENT-SAFE BY CONSTRUCTION — the constraint that shapes this module
 * ------------------------------------------------------------------
 * `siteConfig` is imported by CLIENT components (`context-nav-links`, `language-switcher`,
 * `location-switcher`, `context-connect-heading`, `error`), so this module's module-load code must
 * contain NO `node:fs` and NO `process.cwd()`: a filesystem import in a client chunk makes Turbopack
 * refuse to build the app endpoint, and `process.cwd()` does not exist in a browser. Therefore:
 *
 *   · `deploymentLayout()` / `readDeploymentConfig()` are pure — they read BUILD-TIME values the
 *     build itself resolved and inlined (`next.config.ts` → Next's `env`, inlined into BOTH bundles),
 *     so no application module imports a configuration file, whichever layout was selected.
 *   · `deploymentPaths()` is SERVER-ONLY: it computes absolute paths (and may therefore use
 *     `process.cwd()`), and only server modules call it — the i18n registry, authoring discovery and
 *     asset screening. A client module must never call it.
 *
 * THREE LAYOUTS, RESOLVED ONCE PER BUILD
 * --------------------------------------
 *   `capsule`     a real deployment capsule at `<repo>/deployment/` — the accepted long-term source
 *                 write boundary for one deployment (its `site.config.json`, `config/i18n/`,
 *                 `content/pages/` and asset sources).
 *   `repository`  the ROOT layout: those locations sit at the repository root, which is what an
 *                 adopter who authors their website at their own repository root uses. It stays a
 *                 supported layout; the deployment in THIS repository is a `capsule`.
 *   `override`    `FOUNDATION_DEPLOYMENT_ROOT` — the DEV/TEST BUILD-TIME escape hatch that lets a
 *                 generic test point a dev server at a synthetic deployment (see
 *                 `tests/support/synthetic-deployment.ts`). Never a production mechanism.
 *
 * WHAT IS *NOT* HERE
 * ------------------
 * `public/assets/**` is NOT a deployment-owned location: Next.js serves static files from `public/`
 * only, so it is GENERATED build output (`pnpm assets:sync`, byte-verified by
 * `deployment/tests/unit/asset-taxonomy-mirror.test.ts`). It is exposed here so that even the one platform path
 * is spelled in one place, but it is never part of a deployment agent's write boundary.
 */
// NOTE (ISO-B1C) — there is deliberately NO `import … from "../../site.config.json"` here. The build
// selects the deployment and INLINES its configuration (`src/config/deployment-build.mjs` ←
// `next.config.ts` / `vitest.config.mts`), so no application module depends on a file's physical
// location and B2 can move `site.config.json` into a capsule without a module-resolution change.
//
// FOUNDATION-B4A / B4A-A2 — this authority also resolves WHERE the INSTALLATION's own operational record lives (see
// `operationalStateFile`). The file's NAME belongs to that lifecycle contract; the import below is of its
// inner MODEL module, whose own imports are type-only, so this module stays CLIENT-SAFE (see the note
// above) — importing the contract's barrel would pull the release contract and the transitions into a
// client chunk.
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";

// S3E1C — the Spoke runtime NAMESPACE is spelled ONCE, by the module that owns the runtime segment, so
// the URL base the browser fetches and the generated directory the mirror installs into cannot drift.
// The import is a PURE dependency (`./spoke-runtime-segment.mjs` has no `node:fs` and no `process.cwd()`),
// so this authority stays CLIENT-SAFE (see the module note above).
import { spokeRuntimeAssetUrlBase, spokeRuntimeAssetNamespacePath } from "./spoke-runtime-segment.mjs";
// M16 — the declared Spoke runtime segments a MULTI-Spoke build resolves artwork from. Pure (`./spoke-routing`
// reads the build's inlined routing description), so this authority stays CLIENT-SAFE.
import { hostRoutingForBuild } from "./spoke-routing";
// M16/M17 (Defect B) — TYPE-ONLY: the build-time inventory a runtime namespace may carry. A type import is
// erased at compile time, so the generated catalog is never pulled into this (CLIENT-SAFE) module's chunks;
// only the SERVER modules that BIND it (the context builder and the compatibility seam) import its value.
import type { RuntimeAssetInventory } from "./runtime-asset-catalog";

/** Which layout the deployment root resolved to. */
export type DeploymentLayout = "capsule" | "repository" | "override";

/** How the INSTALLATION is authored: a legacy implicit Spoke, a flat declared collection, or identified Hubs. */
export type InstallationAuthoringMode = "legacy" | "explicit" | "multi" | "hubs";

/**
 * Does this authoring mode DISPATCH BY HOSTNAME? (`FOUNDATION-ID-M3-P3 §6`)
 *
 * Two modes do, and for the same reason: a flat Installation declaring several Spokes has no single
 * deployment to activate, and an Installation authored with IDENTIFIED Spoke Hubs dispatches by exact
 * hostname ALWAYS — even when it declares one Hub and one Spoke. Only `legacy` and a ONE-Spoke flat
 * Installation take the permissive single-Spoke path, and `explicit` means exactly that.
 */
export function dispatchesByHostname(mode: InstallationAuthoringMode): boolean {
  return mode === "multi" || mode === "hubs";
}

/**
 * ONE generated runtime asset namespace (FOUNDATION-MULTISITE-S3E1C).
 *
 * The runtime ownership model, frozen: Foundation/platform assets are served from `/assets/**`, and a
 * Spoke's OWN (replaceable) artwork from `/spokes/<runtime-segment>/assets/**`. Both are GENERATED
 * output under `public/`, never deployment source, and they are never nested inside one another — which
 * is what makes one Spoke's artwork unable to collide with another's, or with a platform asset.
 */
export interface RuntimeAssetNamespace {
  /** The absolute GENERATED directory the namespace's files live in. */
  readonly directory: string;
  /** The same-origin URL base those files are served from (`/assets`, `/spokes/<segment>/assets`). */
  readonly urlBase: string;
  /**
   * THE BUILD-TIME INVENTORY this namespace carries (FOUNDATION-MULTISITE-M16/M17 — Defect B), or
   * `undefined` when nobody bound one.
   *
   * PRESENT in the live runtime: the build published exactly which basenames exist in this namespace and
   * how large each one is (`./runtime-asset-catalog`), and the resolver answers ownership and size from that
   * immutable data. That is what makes a page render independent of the generated `public/**` tree, which a
   * serverless function does NOT contain (`public/` is static deployment output served by the CDN).
   *
   * ABSENT for a synthetic namespace — a unit fixture pointing at a temporary directory — where the
   * resolver's accepted filesystem read remains the compatibility mechanism. Nothing about that path's
   * semantics changed.
   */
  readonly inventory?: RuntimeAssetInventory;
}

export interface DeploymentRoot {
  readonly layout: DeploymentLayout;
  /** How the Installation is authored (`legacy` | `explicit`) — S3F1's one-Spoke activation. */
  readonly mode: InstallationAuthoringMode;
  /** The absolute directory a deployment owns (its capsule, the repository root, or the override). */
  readonly root: string;
  /**
   * The directory that owns the deployment's RESOURCES (dictionaries, authored pages, artwork sources).
   *
   * In legacy mode this IS `root`. In explicit mode it is the SOLE declared Spoke's root, because the
   * Installation's authored website material lives in that Spoke — while the Installation's own
   * lifecycle records (`operationalStateFile`) stay at `root`.
   */
  readonly resourceRoot: string;
  /** `<resourceRoot>/content` — the ONE spelling of the authored content tree (B3 narrows its owner). */
  readonly contentRoot: string;
  readonly siteConfigFile: string;
  readonly dictionaryDirectory: string;
  /** The OPTIONAL `sites/<site>/<locale>.json` dictionary overlays (`@/config/i18n/registry`). */
  readonly dictionaryOverrideDirectory: string;
  readonly markdownPagesRoot: string;
  readonly jsonPagesRoot: string;
  /** The deployment's own artwork SOURCES (the `content/assets` tree; B3 narrows this to branding). */
  readonly assetSourceRoot: string;
  /**
   * The INSTALLATION's OWN durable operational record (FOUNDATION-B4A / B4A-A2): what is live, how healthy
   * it is, and how it got here. It is installation-owned state rather than authored content — see
   * `@/core/foundation-installation`, which owns its name, schema and semantics, while this authority owns
   * the only place it may live. It stays at `root` in EVERY mode, so moving a Spoke never moves a record.
   */
  readonly operationalStateFile: string;
  /** Next.js' static-file root — GENERATED output, never deployment source (see the module note). */
  readonly publicAssetsDirectory: string;
  /**
   * The GENERATED runtime namespaces, in RESOLUTION ORDER: the platform namespace first, then (in
   * explicit mode) the sole Spoke's own. A name that exists in more than one namespace therefore
   * resolves to the PLATFORM file — a Spoke may not shadow a platform asset (A2) — while a Spoke's own
   * replaceable artwork is found in its own namespace and nowhere else.
   */
  readonly runtimeAssetNamespaces: readonly RuntimeAssetNamespace[];
}

/** The build-time names the build resolves and inlines (`next.config.ts`). */
const LAYOUT_ENV = "FOUNDATION_DEPLOYMENT_LAYOUT";
const CONFIG_ENV = "FOUNDATION_DEPLOYMENT_CONFIG";
const ROOT_ENV = "FOUNDATION_DEPLOYMENT_ROOT";
/** S3F1 — the authoring mode, the sole Spoke's root (relative) and its runtime segment. */
const MODE_ENV = "FOUNDATION_DEPLOYMENT_MODE";
const SPOKE_ROOT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_ROOT";
const SPOKE_SEGMENT_ENV = "FOUNDATION_DEPLOYMENT_SPOKE_SEGMENT";

/**
 * The authored configuration FILE NAME a deployment root carries (FOUNDATION-MULTISITE-S3C1).
 *
 * Exported so that the spelling lives in ONE place: this authority's `siteConfigFile`, and the
 * Installation's Spoke-resolution module (`./spoke-roots`, which asserts that a declared Spoke root
 * carries this same surface) both consume it rather than restating it.
 */
export const DEPLOYMENT_CONFIG_FILE_NAME = "site.config.json";

/**
 * The AUTHORED resource trees a deployment root owns, RELATIVE to that root (FOUNDATION-MULTISITE-S3E1A).
 *
 * ONE spelling authority for every authored resource location: `deploymentPaths()` composes its own
 * absolute locations from THIS map, and a Spoke-aware consumer composes the very same relative trees
 * beneath a Spoke root it was HANDED (`./spoke-resources`). Neither restates a segment, so the legacy
 * active deployment and a declared Spoke cannot drift apart.
 *
 * These are AUTHORED locations only: they carry no runtime URL meaning, no runtime emission decision and
 * no publication decision — a directory's existence has never meant a page, a dictionary or an asset is
 * published.
 */
export const DEPLOYMENT_RESOURCE_PATHS = Object.freeze({
  /** The user-visible interface strings, one file per declared locale. */
  dictionary: "config/i18n",
  /** The OPTIONAL site+locale overrides BESIDE the shared dictionaries. */
  dictionaryOverrides: "config/i18n/sites",
  /** The Markdown authoring root. */
  markdownPages: "content/pages/markdown",
  /** The declarative JSON authoring root. */
  jsonPages: "content/pages/json",
  /** The authored artwork sources the runtime asset mirror is generated from. */
  assetSources: "content/assets",
});

/**
 * The layout this BUILD resolved. Pure: the value is a build-time string, inlined by Next into both
 * bundles, so it is safe to read at module load from client code. An unset value means the root layout:
 * the build found no authored capsule and no override.
 */
export function deploymentLayout(): DeploymentLayout {
  const layout = process.env[LAYOUT_ENV];
  return layout === "capsule" || layout === "override" ? layout : "repository";
}

/**
 * How the SELECTED Installation is authored, as the BUILD resolved it.
 *
 * Pure and client-safe (the value is inlined by the build), and deliberately NOT a discovery: an
 * unset value means the LEGACY form — the Installation root IS its one implicit Spoke — while
 * `explicit` states that the Installation declares its Spokes and the runtime must read the sole
 * Spoke's resources. The RULES that make an Installation runnable (exactly one Spoke, no default
 * Spoke) live in the build authority (`./deployment-build.mjs`), never here.
 */
export function deploymentMode(): InstallationAuthoringMode {
  const mode = process.env[MODE_ENV];
  if (mode === "explicit" || mode === "multi" || mode === "hubs") return mode;
  return "legacy";
}

/**
 * The raw deployment configuration. Pure and client-safe: the build selected ONE deployment and
 * INLINED its configuration (`next.config.ts` → Next's `env`; `vitest.config.mts` → `test.env`), so
 * this reads an already-selected value and never a file. A missing value means the build seam did not
 * run — a loud failure, never a silent fallback to some other deployment.
 *
 * The value is validated ONCE by `parseSiteConfig` in `./loader`.
 */
export function readDeploymentConfig(): unknown {
  // M16/M3-P3 — a DISPATCHING Installation has NO single configuration: the build inlines none, because
  // selecting one Spoke's configuration would be exactly the "default Spoke" this runtime refuses to have
  // — and an Installation authored with identified Spoke Hubs dispatches ALWAYS, even when it declares one
  // Hub and one Spoke. Every consumer must select a Spoke CONTEXT instead (`./spoke-request`,
  // `./installation-runtime`), so the compatibility answer fails LOUDLY rather than guessing.
  if (dispatchesByHostname(deploymentMode())) {
    throw new Error(
      "FOUNDATION-MULTISITE-M16: this Installation declares SEVERAL Spokes, so there is no single " +
        "deployment configuration to read. Select a Spoke context (hostname dispatch or the internal " +
        "Spoke route) and read ITS configuration — there is no default Spoke and none is guessed.",
    );
  }

  const inlined = process.env[CONFIG_ENV];
  if (inlined === undefined || inlined === "") {
    throw new Error(
      "FOUNDATION-DEPLOYMENT-ISO-B1C: no deployment configuration was inlined into this build. " +
        "The build must resolve the deployment (next.config.ts) or the test run must " +
        "(vitest.config.mts) — both use src/config/deployment-build.mjs.",
    );
  }
  return JSON.parse(inlined) as unknown;
}

/**
 * The ABSOLUTE deployment-owned paths. SERVER-ONLY (see the module note): this is the only place in
 * `src/**` that anchors on `process.cwd()`. The result is cached — the answer cannot change within
 * one process — so server callers may keep using it at module load, exactly as before.
 */
let cachedPaths: DeploymentRoot | null = null;

export function deploymentPaths(): DeploymentRoot {
  if (cachedPaths !== null) return cachedPaths;

  const repositoryRoot = process.cwd();
  const layout = deploymentLayout();
  const mode = deploymentMode();
  const override = process.env[ROOT_ENV]?.trim();
  const root =
    layout === "override" && override !== undefined && override !== ""
      ? override
      : layout === "capsule"
        ? `${repositoryRoot}/deployment`
        : repositoryRoot;

  // S3F1 — WHERE THIS INSTALLATION'S RESOURCES ARE. In legacy mode the Installation root IS the
  // resource root. In explicit mode the build resolved the SOLE declared Spoke, so its root (published
  // RELATIVE to the Installation root, like every other deployment-owned location) owns the
  // configuration, dictionaries, authored pages and artwork sources — while the Installation keeps its
  // own lifecycle records below.
  const spokeRelativeRoot = process.env[SPOKE_ROOT_ENV]?.trim() ?? "";
  if (mode === "explicit" && spokeRelativeRoot === "") {
    throw new Error(
      "FOUNDATION-MULTISITE-S3F1: this build selected an EXPLICIT Installation, but no Spoke root was " +
        "resolved into it. The build authority (`src/config/deployment-build.mjs`) must publish the " +
        "sole Spoke's root; nothing is guessed here.",
    );
  }
  const resourceRoot = dispatchesByHostname(mode)
    ? null
    : mode === "explicit"
      ? `${root}/${spokeRelativeRoot}`
      : root;

  // M16/M3-P3 — an API whose meaning requires "the selected Spoke" cannot answer in a dispatching
  // Installation. The single-Spoke-only locations below are therefore GETTERS that fail loudly when read,
  // naming what is absent, rather than silently answering with one of several Spokes.
  const selectedSpokeOnly = (what: string): string => {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: this Installation declares SEVERAL Spokes, so there is no ${what}. ` +
        "Select a Spoke context (`./spoke-request`, `./installation-runtime`) and read ITS own resources; " +
        "no installation-wide answer exists and none is guessed.",
    );
  };
  const selectedResourceRoot = (): string =>
    resourceRoot ?? selectedSpokeOnly("Installation-wide resource root");

  // …and the RUNTIME NAMESPACES artwork is INSTALLED into (S3E1C). The platform namespace is always
  // present and always `/assets/**`; an explicit Installation adds EACH declared Spoke's own namespace,
  // derived from its runtime SEGMENT — never from a directory name — so a multi-Spoke Installation
  // resolves artwork from one namespace per Spoke while platform files stay non-shadowable.
  const segment = process.env[SPOKE_SEGMENT_ENV]?.trim() ?? "";
  if (mode === "explicit" && segment === "") {
    throw new Error(
      "FOUNDATION-MULTISITE-S3F1: this build selected an EXPLICIT Installation, but no runtime segment " +
        "was resolved for its Spoke. The build authority publishes it (`runtimeSegmentForSpokeId`); " +
        "nothing is derived from a directory name here.",
    );
  }
  const publicAssetsDirectory = `${repositoryRoot}/public/assets`;
  const declaredSegments = dispatchesByHostname(mode)
    ? hostRoutingForBuild().spokes.map((spoke) => spoke.runtimeSegment)
    : [];
  const runtimeAssetNamespaces: readonly RuntimeAssetNamespace[] = [
    // Platform first: a Spoke may not shadow a platform-owned asset (A2).
    { directory: publicAssetsDirectory, urlBase: "/assets" },
    ...(mode === "explicit"
      ? [
          {
            directory: `${repositoryRoot}/public/${spokeRuntimeAssetNamespacePath(segment)}`,
            urlBase: spokeRuntimeAssetUrlBase(segment),
          },
        ]
      : []),
    ...declaredSegments.map((declared) => ({
      directory: `${repositoryRoot}/public/${spokeRuntimeAssetNamespacePath(declared)}`,
      urlBase: spokeRuntimeAssetUrlBase(declared),
    })),
  ];

  cachedPaths = {
    layout,
    mode,
    root,
    get resourceRoot(): string {
      return selectedResourceRoot();
    },
    get contentRoot(): string {
      return `${selectedResourceRoot()}/content`;
    },
    get siteConfigFile(): string {
      return `${selectedResourceRoot()}/${DEPLOYMENT_CONFIG_FILE_NAME}`;
    },
    get dictionaryDirectory(): string {
      return `${selectedResourceRoot()}/${DEPLOYMENT_RESOURCE_PATHS.dictionary}`;
    },
    get dictionaryOverrideDirectory(): string {
      return `${selectedResourceRoot()}/${DEPLOYMENT_RESOURCE_PATHS.dictionaryOverrides}`;
    },
    get markdownPagesRoot(): string {
      return `${selectedResourceRoot()}/${DEPLOYMENT_RESOURCE_PATHS.markdownPages}`;
    },
    get jsonPagesRoot(): string {
      return `${selectedResourceRoot()}/${DEPLOYMENT_RESOURCE_PATHS.jsonPages}`;
    },
    get assetSourceRoot(): string {
      return `${selectedResourceRoot()}/${DEPLOYMENT_RESOURCE_PATHS.assetSources}`;
    },
    // The INSTALLATION's own operational record (FOUNDATION-B4A / B4A-A2). Its NAME is the lifecycle
    // contract's (`@/core/foundation-installation`); this authority owns only WHERE it lives — which is
    // the INSTALLATION root in every mode, so moving website material into a Spoke never moves a record.
    // The inner model module is imported rather than the barrel because this file is CLIENT-SAFE (see the
    // module note): the barrel would pull the release contract and the transitions into a client chunk, while the
    // model module's imports are type-only.
    operationalStateFile: `${root}/${INSTALLATION_OPERATIONAL_STATE_FILE_NAME}`,
    // Platform path: Next.js serves static files from `public/` only (see the module note).
    publicAssetsDirectory,
    runtimeAssetNamespaces,
  };
  return cachedPaths;
}
