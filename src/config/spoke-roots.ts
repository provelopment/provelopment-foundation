/**
 * THE INSTALLATION'S SPOKE COLLECTION (FOUNDATION-MULTISITE-S3C1)
 * ==============================================================
 *
 * WHAT THIS ANSWERS, AND NOTHING ELSE
 * -----------------------------------
 *
 *     which Spokes belong to this Installation?
 *     what stable internal id addresses each one?
 *     where is each one authored?
 *
 * An Installation declares its Spokes in ONE authored manifest at its own root:
 *
 *     <InstallationRoot>/spokes.json     { "spokes": [ { "id": "...", "root": "spokes/..." } ] }
 *     <InstallationRoot>/spokes/…        the declared Spoke roots (the DEDICATED namespace)
 *
 * It deliberately authors NOTHING else — no hostname, no label, no locales, no assets, no
 * configuration facts. A Spoke's own identity data lives in that Spoke's `site.config.json`, and its
 * canonical hostname is DERIVED from that file's `site.url` in a LATER slice (S3D+); authoring it here
 * would create a second authority for one fact.
 *
 * THE NAMESPACE IS AN OWNERSHIP BOUNDARY
 * --------------------------------------
 * A declared Spoke root lives beneath `<InstallationRoot>/spokes/` — lexically AND physically. The
 * boundary is that CONTAINER, not merely the Installation root: a locator that resolves outside
 * `spokes/` (including one that leaves it through a link) is refused, so authored website material can
 * never be planted among the Installation's configuration, content or tooling. The ID stays
 * independent of the directory spelling: `spokes/foundation-web` may hold the Spoke `foundation`.
 *
 * LEGACY IS THE ABSENCE OF A MANIFEST
 * -----------------------------------
 *
 *   no `spokes.json`       LEGACY IMPLICIT: the Installation root IS the implicit Spoke root, and its
 *                          single Spoke carries the reserved `IMPLICIT_SPOKE_ID`. Nothing is authored,
 *                          nothing moves, and today's deployments are untouched.
 *   `spokes.json` present  EXPLICIT: the manifest's entries (1..*) are the Installation's Spokes.
 *   BOTH authored          REFUSED — never a precedence rule, never a silent migration.
 *   NEITHER authored       REFUSED — an Installation root must be authored one way.
 *
 * DIRECTORY PRESENCE IS INERT; A MANIFEST ENTRY IS AN ASSERTION
 * ------------------------------------------------------------
 * A directory under `spokes/` that the manifest does not reference creates nothing and changes no
 * mode: the manifest is the membership authority, exactly as capsule selection already probes a FILE
 * rather than a directory. Conversely an entry asserts that its root exists, is a directory, stays
 * INSIDE the Installation root and carries `site.config.json` — the root-level contract S3C1 needs for
 * safe root resolution, and no more. Loading that Spoke's configuration (its Sites, locales, Hubs,
 * content, dictionaries, assets) is S3D's business: S3C1 resolves AUTHORING ROOTS, not domain Spokes.
 *
 * ONE ROOT AUTHORITY, SHARED WITH THE BUILD SEAM
 * ----------------------------------------------
 * The Installation root is an INPUT here — this module never calls `process.cwd()`, reads an environment
 * variable or selects a layout, so `./deployment-build.mjs` remains the ONE answer to "where is the
 * Installation?" and this is the nested answer to "what does it declare?".
 *
 * The DECLARATION AND ROOT CONTRACT itself (the strict manifest shape, the identity rules, the locator
 * rules and physical containment) lives in `./spoke-declarations.mjs`, plain ESM, because the build
 * selection seam must answer the same question and cannot execute TypeScript: this module is the TYPED
 * view of that ONE implementation, so a build can never select a declared root the configuration/domain
 * layer would refuse. The domain typing stays here; the acceptance rules do not have a second copy.
 *
 * BUILD/SERVER-ONLY: it reads the filesystem, so it must never become reachable from a client chunk.
 * A `SpokeId` is an opaque identity and a root locator is separate data: the id is never a path and the
 * path is never the identity, so the two differ freely (`spokes/foundation-web` may hold the Spoke
 * `foundation`) — while the LOCATOR must still live in the dedicated `spokes/` namespace.
 */
import type { SpokeId } from "@/core/spoke";

import { installationSpokeCollectionSchema, resolveSpokeDeclarations } from "./spoke-declarations.mjs";

export { SPOKE_ROOTS_DIRECTORY_NAME } from "./spoke-declarations.mjs";
export { INSTALLATION_SPOKE_COLLECTION_FILE_NAME } from "./spoke-declarations.mjs";
export {
  INSTALLATION_SPOKE_HUB_COLLECTION_LEAF,
  SPOKE_HUB_RUNTIME_NOT_ENABLED,
} from "./spoke-declarations.mjs";
export { installationSpokeCollectionSchema };

/**
 * The manifest's structural shape, typed for the platform's consumers.
 *
 * The ACCEPTANCE rules live in `./spoke-declarations.mjs` (one implementation, shared with the build
 * selection seam); this is the typed view of the same shape, so a caller can hold a parsed collection
 * without a second definition of what is acceptable.
 */
export interface InstallationSpokeCollectionFile {
  readonly spokes: readonly { readonly id: string; readonly root: string }[];
}

/**
 * THE NESTED AUTHORING FORM, typed — RECOGNISED, VALIDATED AND REFUSED (FOUNDATION-ID-M3-P1).
 *
 * It is the shape an author writes when they want their Spokes grouped into IDENTIFIED Spoke Hubs:
 *
 *     { "spokeHubs": [ { "id": "…", "spokes": [ { "id": "…", "root": "spokes/…" } ] } ] }
 *
 * It is typed here for the same reason the flat shape is — a caller can name what an author may write —
 * and it is NOT a runnable shape in this phase. The declaration seam recognises it, validates it
 * completely (identity, membership and roots, with the same authorities the flat form uses) and then
 * refuses it with `SPOKE_HUB_RUNTIME_NOT_ENABLED`, because multi-Spoke-Hub runtime support is not enabled
 * yet: nothing flattens it, no Hub or Spoke is chosen from it, and no consumer of this module can obtain
 * declarations from one. The permanent compatibility format is the flat `spokes[]` shape above.
 */
export interface InstallationSpokeHubCollectionFile {
  readonly spokeHubs: readonly {
    readonly id: string;
    readonly spokes: readonly {
      readonly id: string;
      readonly root: string;
      /** The Spoke's exact ADDITIONAL hostname claims, routing claims only (WEB-1 requirement 6). */
      readonly hostAliases?: readonly string[];
    }[];
    /** The Hub-scoped switcher: the members of THIS Hub, in authored order. */
    readonly spokeSwitcher?: {
      readonly options: readonly {
        readonly spokeId: string;
        readonly label: string;
        readonly href: string;
      }[];
    };
  }[];
  /**
   * The Installation-wide inspection nomination — a COMPOSITE reference, never a bare local id: where Hubs
   * are identified, a local id may name a Spoke in either Hub (FOUNDATION-ID-M3-P2 §8.4).
   */
  readonly inspectionSpoke?: { readonly spokeHubId: string; readonly spokeId: string } | null;
  /** Exact hostnames no Spoke owns publicly, which select the nominated composite Spoke. */
  readonly inspectionHosts?: readonly string[];
}

/**
 * ONE resolved Spoke root: the authored identity and the ABSOLUTE directory it is authored in.
 *
 * Not a `Spoke` and not a domain descriptor — it carries no configuration, no locales, no hostname
 * and no Hubs, because none of those have been read yet.
 */
export interface SpokeRootDescriptor {
  readonly id: SpokeId;
  /** The resolved absolute directory, proven to be inside the Installation root. */
  readonly root: string;
}

/** How an Installation declares its Spokes: `legacy` (none declared) or `explicit` (a manifest). */
export type SpokeCollectionMode = "legacy" | "explicit";

/** The Installation's declared Spoke roots — 1..* descriptors, in authored manifest order. */
export interface InstallationSpokeRoots {
  readonly mode: SpokeCollectionMode;
  /** The resolved absolute Installation root this answer was made from. */
  readonly installationRoot: string;
  /** `<installationRoot>/spokes.json` when explicit; `null` in legacy mode. */
  readonly manifestFile: string | null;
  /** In authored manifest order; legacy mode yields exactly one, carrying `IMPLICIT_SPOKE_ID`. */
  readonly descriptors: readonly SpokeRootDescriptor[];
}

/**
 * Resolves the Spokes an Installation declares, or throws the seam's descriptive, build-loud error.
 *
 * A TYPED VIEW of `./spoke-declarations.mjs` — the same call the build selection seam makes, so the two
 * cannot disagree: every rule below is enforced by that ONE implementation, not restated here.
 */
export function resolveInstallationSpokeRoots(installationRoot: string): InstallationSpokeRoots {
  const resolved = resolveSpokeDeclarations(installationRoot);

  return {
    mode: resolved.mode,
    installationRoot: resolved.installationRoot,
    manifestFile: resolved.manifestFile,
    descriptors: resolved.declarations.map((declaration) => ({
      id: declaration.id as SpokeId,
      root: declaration.root,
    })),
  };
}
