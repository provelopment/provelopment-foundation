/**
 * THE INSTALLATION'S RUNTIME INDEX, AND ONE SPOKE'S RUNTIME CONTEXT (FOUNDATION-MULTISITE-S3F2A)
 * =============================================================================================
 *
 * TWO questions, answered ONCE, for every consumer that must answer them:
 *
 *     installationRuntimeIndex(root)      which Spokes does this Installation declare, COMPLETELY?
 *     runtimeContextForSpoke(index, key)  what is ONE of them, at runtime, from its identity alone?
 *
 * WHY THIS EXISTS, AND WHAT IT DELIBERATELY IS NOT
 * ------------------------------------------------
 * The accepted runtime resolves a deployment by INLINING exactly one Spoke's configuration at build time
 * (`./deployment-build.mjs`), and the application reads it from one module-global. That is correct for a
 * one-Spoke Installation and it is what production serves today — but it cannot describe an Installation
 * with two Spokes, and it cannot let two Spokes be resolved INDEPENDENTLY in the same process.
 *
 * This module adds that description WITHOUT changing which Spoke a public request selects:
 *
 *   · it describes EVERY declared Spoke (1..*), in authored manifest order, completely;
 *   · it never selects one. There is no `spokes[0]` fallback, no "first", no "default" and no implicit
 *     Foundation: selection is hostname dispatch, and that is S3F2B's act, not this one;
 *   · nothing in it is mutable. A context is a value, created from an index and an identity, and N
 *     contexts can exist at once without influencing each other.
 *
 * REUSE, NOT REINVENTION
 * ----------------------
 * Every fact comes from an authority that already owns it:
 *
 *   declared Spoke roots       ./spoke-roots            (`resolveInstallationSpokeRoots`)
 *   a Spoke's configuration    ./spoke-config           (`readSpokeSiteConfig`)
 *   identity + claims          @/core/spoke             (`configureSpoke` → canonical hostname, claims)
 *   a Spoke's authored trees   ./spoke-resources        (`spokeResourceIndexFor`)
 *   its runtime segment        ./spoke-runtime-segment  (`runtimeSegmentForSpokeId`, url/dir bases)
 *   the generated tree         ./deployment-root        (`publicAssetsDirectory`)
 *   the legacy single runtime  @/config                 (the accepted compatibility export)
 *
 * Nothing here parses a manifest, parses a Spoke id, normalizes a hostname, parses a `SiteConfig` or
 * decides where a resource root is — a second authority for any of those is exactly the drift the
 * earlier slices removed.
 *
 * SERVER/BUILD ONLY: it reads files, so it must never become reachable from a client chunk.
 */
import path from "node:path";

import { IMPLICIT_SPOKE_ID, identifiedSpokeHubCollectionIssues, type Hostname, type IdentifiedSpokeRef, type InstallationSpokeHubCollection, type Spoke, type SpokeHubId, type SpokeId } from "@/core/spoke";

import { deploymentPaths, type RuntimeAssetNamespace } from "./deployment-root";
import { readSpokeSiteConfig, spokeConfigFilePath } from "./spoke-config";
import { composeInstallationSpokeHub, configureSpoke } from "./spoke-composition";
import { spokeResourceIndexFor, type SpokeResourcePaths } from "./spoke-resources";
import { resolveInstallationSpokeRoots, type InstallationSpokeRoots, type SpokeRootDescriptor } from "./spoke-roots";
import {
  spokeRuntimeAssetNamespacePath,
  spokeRuntimeAssetUrlBase,
} from "./spoke-runtime-segment.mjs";
// M16/M17 (Defect B) — every context namespace leaves this module carrying the BUILD-TIME inventory the
// catalog published for its URL base, so a page render asks immutable data instead of probing `public/**`
// (which a serverless function does not contain). This module is SERVER-ONLY, so the generated catalog is
// bundled exactly where it is needed and nowhere near a client chunk.
import { withRuntimeAssetInventories } from "./runtime-asset-catalog";
import type { SiteConfig } from "./site-config";

/** How an Installation is authored: `legacy` (no manifest), `explicit` (a flat one) or `hubs` (a nested one). */
export type InstallationRuntimeMode = "legacy" | "explicit" | "hubs";

/**
 * ONE declared Spoke, described COMPLETELY and immutably: its identity, its runtime namespace, the
 * hostnames it answers for, its configuration and its authored resource trees.
 *
 * It carries no request and no "selected" flag, so holding several of them is meaningless rather than
 * dangerous.
 */
export interface InstallationRuntimeSpoke {
  readonly id: SpokeId;
  /** The runtime segment its own asset namespace is built from (`./spoke-runtime-segment`). */
  readonly runtimeSegment: string;
  /** The hostname this Spoke answers for canonically (derived from its own configuration). */
  readonly canonicalHostname: Hostname;
  /** Every hostname it claims EXACTLY — the canonical one plus any authored aliases. */
  readonly hostnameClaims: readonly Hostname[];
  /** Its parsed configuration. */
  readonly config: SiteConfig;
  /** Its authored resource trees. */
  readonly resources: SpokeResourcePaths;
  /**
   * The OWNING Spoke Hub and the COMPOSITE identity — present ONLY for an Installation that IDENTIFIES its
   * Hubs (FOUNDATION-ID-M3-P2). A flat/legacy record carries neither, so its shape is what it always was,
   * and its `runtimeSegment` is still the bare id's own encoding.
   */
  readonly spokeHubId?: SpokeHubId;
  readonly spokeRef?: IdentifiedSpokeRef;
}

/** EVERY Spoke an Installation declares, in authored manifest order, and nothing selected. */
export interface InstallationRuntimeIndex {
  readonly mode: InstallationRuntimeMode;
  readonly spokes: readonly InstallationRuntimeSpoke[];
}

/**
 * ONE Spoke's usable RUNTIME state: the smallest object that can render, localize, resolve content and
 * resolve artwork for exactly one Spoke.
 *
 * It is IMMUTABLE, EXPLICIT and DETERMINISTIC, contains no request state, and may be created for several
 * Spokes simultaneously: two contexts can never see each other's configuration, dictionaries, pages or
 * asset namespaces.
 */
export interface SpokeRuntimeContext {
  readonly id: SpokeId;
  readonly runtimeSegment: string;
  readonly canonicalHostname: Hostname;
  readonly hostnameClaims: readonly Hostname[];
  /** The configuration THIS context renders with. Never a module-global. */
  readonly siteConfig: SiteConfig;
  readonly resources: SpokeResourcePaths;
  /**
   * The generated runtime namespaces THIS Spoke resolves artwork from, in the ONE documented order:
   * the shared platform namespace first (non-shadowable), then this Spoke's own — and never another
   * Spoke's, because a namespace this context does not declare is not in this array.
   */
  readonly runtimeAssetNamespaces: readonly RuntimeAssetNamespace[];
  /**
   * The OWNING Spoke Hub and the COMPOSITE identity — present ONLY for an Installation that identifies its
   * Hubs, and the same pair as the record's (`FOUNDATION-ID-M3-P2`).
   */
  readonly spokeHubId?: SpokeHubId;
  readonly spokeRef?: IdentifiedSpokeRef;
}

/** The generated platform namespace, and (for one segment) that Spoke's own — platform always first. */
/**
 * The generated runtime namespaces ONE Spoke resolves artwork from, in the ONE documented order: the
 * shared platform namespace first (non-shadowable), then that Spoke's own — spelled with the segment
 * authority (`./spoke-runtime-segment`), never composed by hand.
 *
 * `null` means a LEGACY Installation: exactly one namespace, its role artwork mirrored into the platform
 * namespace — the accepted Checkpoint-2 behaviour, preserved.
 */
export function runtimeNamespacesFor(segment: string | null): readonly RuntimeAssetNamespace[] {
  const platformDirectory = deploymentPaths().publicAssetsDirectory;
  if (segment === null) return [{ directory: platformDirectory, urlBase: "/assets" }];

  return [
    { directory: platformDirectory, urlBase: "/assets" },
    {
      directory: path.join(path.dirname(platformDirectory), spokeRuntimeAssetNamespacePath(segment)),
      urlBase: spokeRuntimeAssetUrlBase(segment),
    },
  ];
}

/**
 * The Spoke record of ONE descriptor, from its own configuration and the domain's identity rules.
 *
 * `configureSpoke` is the composition authority (S3D1A): it derives the canonical hostname from the
 * configuration's `site.url` and applies the Hub/claim rules, so this module never normalizes a hostname
 * or invents a claim.
 *
 * `ref` states the COMPOSITE identity when — and only when — the Installation identifies its Spoke Hubs:
 * the runtime segment is then derived from BOTH halves (`spokeResourceIndexFor`), which is what makes two
 * Hubs' Spokes called `docs` two namespaces and two contexts.
 */
function describeSpoke(
  descriptor: { readonly id: SpokeId; readonly root: string },
  ref?: IdentifiedSpokeRef,
): InstallationRuntimeSpoke {
  const config = readSpokeSiteConfig(descriptor);
  const spoke = configureSpoke(descriptor, config);
  const resourceIndex = spokeResourceIndexFor(descriptor, ref);
  // §7 — THE DESCRIPTOR AND THE COMPOSITE REFERENCE MUST NAME THE SAME SPOKE. This is structural (the ref is
  // built FROM the descriptor), and it is asserted anyway: a mismatch would produce a resource context, an
  // asset namespace and a runtime segment under ANOTHER Spoke's identity — the one failure that must never
  // be silently representable.
  if (ref !== undefined && ref.spokeId !== descriptor.id) {
    throw new Error(
      `FOUNDATION-ID-M3-P3: the descriptor declares Spoke "${descriptor.id}" but the composite reference ` +
        `names Spoke "${ref.spokeId}" in Spoke Hub "${ref.spokeHubId}". A context may only ever be composed ` +
        "under the identity its own descriptor states.",
    );
  }

  const record: InstallationRuntimeSpoke = {
    id: descriptor.id,
    runtimeSegment: resourceIndex.runtimeSegment,
    canonicalHostname: spoke.identity.canonicalHostname,
    hostnameClaims: spoke.identity.hostnameClaims,
    config,
    resources: resourceIndex.resources,
  };

  return ref === undefined ? record : { ...record, spokeHubId: ref.spokeHubId, spokeRef: ref };
}

/**
 * The Installation's IDENTIFIED Spoke Hubs, COMPOSED and proved coherent — or a loud failure.
 *
 * It is the nested form's counterpart to `composeInstallationSpokeHub`, and it uses the collection authority
 * (`identifiedSpokeHubCollectionIssues`) rather than a flat Hub: every per-Hub rule stays the `SpokeHub`
 * authority's, the same LOCAL id in two Hubs is ACCEPTED, and the one rule that reaches ACROSS Hubs — no
 * exact hostname claimed in more than one Hub — is the one the collection authority owns.
 */
function composeIdentifiedSpokeHubs(roots: InstallationSpokeRoots): InstallationSpokeHubCollection {
  const failures: string[] = [];
  const collection: { identity: { id: SpokeHubId }; spokes: Spoke[] }[] = [];

  for (const hub of roots.hubs) {
    const spokes: Spoke[] = [];
    for (const descriptor of hub.descriptors) {
      try {
        spokes.push(configureSpoke(descriptor, readSpokeSiteConfig(descriptor)));
      } catch (error) {
        failures.push(hubSpokeFailure(hub.id, descriptor, error));
      }
    }
    collection.push({ identity: { id: hub.id }, spokes });
  }

  if (failures.length > 0) {
    throw new Error(
      `Invalid Installation Spoke configuration (${roots.manifestFile ?? roots.installationRoot}):\n` +
        failures.map((failure) => `  - ${failure}`).join("\n"),
    );
  }

  const issues = identifiedSpokeHubCollectionIssues(collection);
  if (issues.length > 0) {
    throw new Error(
      `Invalid Installation Spoke Hub collection (${roots.manifestFile ?? roots.installationRoot}):\n` +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
  }

  return collection;
}

/** ONE identified Hub's Spoke failure, in the terms its author needs to fix it. */
function hubSpokeFailure(spokeHubId: SpokeHubId, descriptor: SpokeRootDescriptor, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const details = message
    .split(/\r?\n/)
    .map((line) => `      ${line}`)
    .join("\n");

  return (
    `Spoke Hub "${spokeHubId}" > Spoke "${descriptor.id}" authored at "${descriptor.root}" ` +
    `(${spokeConfigFilePath(descriptor)}):\n${details}`
  );
}

/**
 * EVERY Spoke an Installation declares — 1, 2, or more — or a loud failure.
 *
 * The Installation root is an INPUT (the build authority selects it); this function discovers nothing.
 * A LEGACY Installation yields exactly one record: the implicit Spoke, whose resource root IS the
 * Installation root and whose configuration is the accepted single-runtime one.
 */
export function installationRuntimeIndex(installationRoot: string): InstallationRuntimeIndex {
  const roots = resolveInstallationSpokeRoots(installationRoot);

  if (roots.mode === "legacy") {
    const descriptor = { id: IMPLICIT_SPOKE_ID, root: roots.installationRoot };
    return { mode: "legacy", spokes: [composeSpoke(descriptor)] };
  }

  // IDENTIFIED — ONE HUB AT A TIME, and every record addressed by BOTH halves of its identity.
  //
  // Each record's runtime segment is the COMPOSITE one, so the runtime index, the routing description and the
  // generated asset namespace all name the same Spoke the same way, and two Hubs' Spokes called `docs` are
  // two records that neither the other's segment nor the other's local id can reach.
  if (roots.mode === "hubs") {
    const collection = composeIdentifiedSpokeHubs(roots);
    const spokes: InstallationRuntimeSpoke[] = [];

    for (const hub of collection) {
      for (const composed of hub.spokes) {
        const ref: IdentifiedSpokeRef = {
          spokeHubId: hub.identity.id,
          spokeId: composed.identity.id,
        };
        // THE DESCRIPTOR THAT DECLARED THIS SPOKE — and its own identity is what the record is composed
        // under, so a descriptor that disagreed with the composed Hub could never produce a record.
        const descriptor = roots.descriptors.find(
          (candidate) => candidate.spokeHubId === ref.spokeHubId && candidate.id === ref.spokeId,
        );
        if (descriptor === undefined) {
          throw new Error(
            `FOUNDATION-ID-M3-P3: Spoke Hub "${ref.spokeHubId}" > Spoke "${ref.spokeId}" was composed but ` +
              "no declared descriptor names it. A record may only ever describe a Spoke this Installation " +
              "declared.",
          );
        }
        spokes.push(composeSpoke(descriptor, composed, ref));
      }
    }

    if (spokes.length !== roots.descriptors.length) {
      throw new Error(
        "FOUNDATION-ID-M3-P3: the composed Spoke Hub collection does not describe every declared Spoke.",
      );
    }

    return { mode: "hubs", spokes };
  }

  // The composed Hub is the authority for identity and claims; its order is the authored manifest order,
  // so the index is deterministic and reports what an operator actually wrote.
  const hub = composeInstallationSpokeHub(roots);
  if (hub.spokes.length !== roots.descriptors.length) {
    throw new Error(
      "FOUNDATION-MULTISITE-S3F2A: the composed Spoke Hub does not describe every declared Spoke.",
    );
  }

  return {
    mode: "explicit",
    spokes: roots.descriptors.map((descriptor, index) => composeSpoke(descriptor, hub.spokes[index])),
  };
}

/** One record, optionally taking identity/claims from the composed Hub (the authority for both). */
function composeSpoke(
  descriptor: { readonly id: SpokeId; readonly root: string },
  composed?: { readonly identity: { readonly canonicalHostname: Hostname; readonly hostnameClaims: readonly Hostname[] } },
  ref?: IdentifiedSpokeRef,
): InstallationRuntimeSpoke {
  const authored = describeSpoke(descriptor, ref);
  if (composed === undefined) return authored;
  return {
    ...authored,
    canonicalHostname: composed.identity.canonicalHostname,
    hostnameClaims: composed.identity.hostnameClaims,
  };
}

/**
 * ONE Spoke's runtime context, addressed by its IDENTITY or by its RUNTIME SEGMENT, or `null`.
 *
 * `null` is a RESULT, not an error: an identity the Installation does not declare answers nothing, and
 * nothing is guessed for it — there is no default Spoke, no first Spoke and no Foundation fallback. The
 * caller decides what an unknown identity means (S3F2B refuses the request).
 *
 * Accepting EITHER spelling is deliberate: the identity is what a manifest declares, while the runtime
 * segment is what an internal route will carry (`/~spoke/<segment>/…`), and both must resolve to the
 * SAME context without a second lookup table.
 */
export function runtimeContextForSpoke(
  index: InstallationRuntimeIndex,
  key: SpokeId | string,
): SpokeRuntimeContext | null {
  const spoke = index.spokes.find(
    (candidate) =>
      candidate.runtimeSegment === key ||
      // A BARE LOCAL ID NAMES A SPOKE ONLY WHERE THERE IS ONE HUB (FOUNDATION-ID-M3-P2). In an Installation
      // that identifies its Hubs the same local id may be declared in two of them, so a record that carries
      // a Hub is reachable ONLY by its composite segment or reference — never by its local id, which would
      // otherwise select whichever Hub happened to be declared first.
      (candidate.spokeHubId === undefined && candidate.id === key),
  );
  if (spoke === undefined) return null;

  const context: SpokeRuntimeContext = {
    id: spoke.id,
    runtimeSegment: spoke.runtimeSegment,
    canonicalHostname: spoke.canonicalHostname,
    hostnameClaims: spoke.hostnameClaims,
    siteConfig: spoke.config,
    resources: spoke.resources,
    // LEGACY has ONE namespace (its role artwork lives in the platform namespace); an EXPLICIT Spoke adds
    // its own. Platform always first, so a Spoke can never shadow platform artwork.
    runtimeAssetNamespaces: withRuntimeAssetInventories(
      runtimeNamespacesFor(index.mode === "legacy" ? null : spoke.runtimeSegment),
    ),
  };

  return spoke.spokeRef === undefined
    ? context
    : { ...context, spokeHubId: spoke.spokeHubId, spokeRef: spoke.spokeRef };
}

/**
 * The runtime context of ONE COMPOSITE Spoke identity, or `null` (`FOUNDATION-ID-M3-P2`).
 *
 * This is the only way to address a Spoke of an Installation that identifies its Hubs, and it is
 * deliberately not satisfiable by a local id: BOTH halves must match the same record, so two Hubs each
 * declaring `docs` resolve to two different contexts and neither can be reached by spelling the other's id.
 * `null` is a result — an undeclared Hub or an undeclared id inside a declared Hub answers nothing, and no
 * Hub, first-Spoke or cross-Hub fallback exists here.
 */
export function runtimeContextForIdentifiedSpoke(
  index: InstallationRuntimeIndex,
  ref: IdentifiedSpokeRef,
): SpokeRuntimeContext | null {
  const spoke = index.spokes.find(
    (candidate) => candidate.spokeHubId === ref.spokeHubId && candidate.id === ref.spokeId,
  );
  if (spoke === undefined) return null;
  return runtimeContextForSpoke(index, spoke.runtimeSegment);
}

/**
 * THE CURRENT BUILD'S SPOKE — the accepted S3F1 compatibility seam, expressed as a context.
 *
 * This is the ONLY place that knows "the build activated one Spoke", and it is the seam S3F2B replaces
 * with hostname dispatch. It resolves the Installation exactly as the build did:
 *
 *   legacy    → the implicit Spoke (its root is the Installation root)
 *   explicit  → the SOLE declared Spoke — and it REFUSES to guess when more than one is declared, so
 *               "the first declared Spoke" can never become a default by accident.
 */
export function currentBuildRuntimeContext(): SpokeRuntimeContext {
  const paths = deploymentPaths();
  const index = installationRuntimeIndex(paths.root);

  if (index.mode === "legacy") {
    const implicitContext = runtimeContextForSpoke(index, IMPLICIT_SPOKE_ID);
    if (implicitContext === null) {
      throw new Error("FOUNDATION-MULTISITE-S3F2A: a legacy Installation must describe its implicit Spoke.");
    }
    return implicitContext;
  }

  // AN IDENTIFIED INSTALLATION ACTIVATES NO SPOKE — NOT EVEN WHEN IT DECLARES ONE (§6).
  //
  // This compatibility seam exists for a build that activated ONE Spoke by inlining ITS configuration. An
  // Installation authored with identified Spoke Hubs never activates a Spoke that way: it dispatches by
  // EXACT hostname, always, so there is no "the" Spoke for a hostname-less caller to reach — and returning
  // its single member here would hand a build-time caller the identity the request boundary deliberately
  // refuses to guess.
  if (index.mode === "hubs") {
    throw new Error(
      "FOUNDATION-ID-M3-P3: this Installation is authored with IDENTIFIED SPOKE HUBS, so no single Spoke is " +
        "build-activated and none is selected here — not even when the collection declares exactly one. " +
        "Dispatch is EXACT hostname dispatch in this form: select a Spoke context by hostname " +
        "(`./spoke-request`) or by its COMPOSITE identity (`runtimeContextForIdentifiedSpoke`).",
    );
  }

  if (index.spokes.length !== 1) {
    throw new Error(
      "FOUNDATION-MULTISITE-S3F2A: the build compatibility seam activates EXACTLY ONE Spoke, but this " +
        `Installation declares ${index.spokes.length}. Multi-Spoke activation is hostname dispatch, which ` +
        "is S3F2B's act: there is no default Spoke and no manifest-order rule, so nothing is selected here.",
    );
  }

  // Length is ONE here: the sole declared Spoke is the one the build activated — not "the first".
  const soleContext = runtimeContextForSpoke(index, index.spokes[0].id);
  if (soleContext === null) {
    throw new Error("FOUNDATION-MULTISITE-S3F2A: the sole declared Spoke has no runtime context.");
  }
  return soleContext;
}
