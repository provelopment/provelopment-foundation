/**
 * A SPOKE'S AUTHORED RESOURCE PATHS (FOUNDATION-MULTISITE-S3E1A)
 * ============================================================
 *
 * ONE question, answered from an ALREADY-RESOLVED root:
 *
 *     given this Spoke root, where are this Spoke's authored resource trees?
 *
 *     SpokeRootDescriptor  ->  SpokeResourcePaths {
 *                                spokeRoot,
 *                                dictionaryRoot,           <spokeRoot>/config/i18n
 *                                dictionaryOverrideRoot,   <spokeRoot>/config/i18n/sites
 *                                markdownPagesRoot,        <spokeRoot>/content/pages/markdown
 *                                jsonPagesRoot,            <spokeRoot>/content/pages/json
 *                                assetSourceRoot,          <spokeRoot>/content/assets
 *                              }
 *
 * It answers NOTHING else. Not which Installation this is, not which Spoke is active, not which hostname
 * was requested, not which Site is active, and not where any runtime file should be EMITTED: a path model
 * that could choose a Spoke would be a second root authority, which is exactly what S3C1/S3D1A avoided.
 *
 * ROOT IS AN INPUT, AND NOTHING IS DISCOVERED
 * ------------------------------------------
 * The root comes from a `./spoke-roots` descriptor (S3C1 resolved and validated it). This module therefore
 * calls no `process.cwd()`, reads no environment, reads no `spokes.json`, selects no deployment layout and
 * resolves no hostname or request. It also composes with the SAME separator style the path authority uses
 * (`"<root>/<relative>"`), so a legacy descriptor's answer is character-for-character the authority's own.
 *
 * ONE SPELLING AUTHORITY
 * ----------------------
 * Every relative tree comes from `DEPLOYMENT_RESOURCE_PATHS` (`./deployment-root`), which `deploymentPaths()`
 * itself composes from — no segment is restated here, and no guard has to be loosened to allow a second
 * spelling of `config/i18n`, `content/pages/**` or `content/assets`.
 *
 * PATHS ONLY: NO EXISTENCE, NO PUBLICATION, NO RUNTIME NAMESPACE
 * -------------------------------------------------------------
 * Nothing here touches the filesystem, so deriving paths SUCCEEDS for a Spoke whose resource directories are
 * empty, absent or not yet authored — existence is not a publication assertion, and what an absent tree
 * MEANS belongs to later consumers. Nothing here enumerates pages, locales, assets, dictionaries, Sites or
 * routes, and nothing here introduces a runtime asset namespace, a Spoke runtime segment, an `assetBasePath`
 * or a runtime index: those are later slices with their own owner checkpoint.
 *
 * SERVER/BUILD CONFIGURATION, AND UNWIRED (S3E1A)
 * ----------------------------------------------
 * This is infrastructure for later resource consumers; `@/core/**` stays unaware of filesystem paths, of
 * `config/i18n`, `content/pages` and `content/assets`, and of any deployment layout. Nothing in `src/app/**`,
 * `src/components/**`, `src/proxy.ts`, the config barrel or the build imports this module yet, and the
 * legacy/active runtime keeps using `deploymentPaths()` unchanged.
 */
import { DEPLOYMENT_RESOURCE_PATHS } from "./deployment-root";
import {
  runtimeSegmentForIdentifiedSpokeRef,
  runtimeSegmentForSpokeId,
  spokeRuntimeAssetUrlBase,
} from "./spoke-runtime-segment.mjs";
import type { SpokeRootDescriptor } from "./spoke-roots";
import type { IdentifiedSpokeRef, SpokeHubId, SpokeId } from "@/core/spoke";

/**
 * The authored resource trees ONE Spoke owns. AUTHORED ownership only — an entry names where material is
 * written, never a URL, a runtime location or a publication decision.
 */
export interface SpokeResourcePaths {
  /** The Spoke's authored root, exactly as the descriptor declared it (S3C1 resolved it already). */
  readonly spokeRoot: string;
  /** The Spoke's interface-string dictionaries, one file per locale. */
  readonly dictionaryRoot: string;
  /** The Spoke's OPTIONAL site+locale dictionary overrides. */
  readonly dictionaryOverrideRoot: string;
  /** The Spoke's Markdown authoring root. */
  readonly markdownPagesRoot: string;
  /** The Spoke's declarative JSON authoring root. */
  readonly jsonPagesRoot: string;
  /** The Spoke's authored artwork sources. */
  readonly assetSourceRoot: string;
}

/**
 * The authored resource paths of ONE resolved Spoke.
 *
 * The root is taken as INPUT and used verbatim: a Spoke's IDENTITY never influences a path (an id and a
 * directory spelling are independent by design), so the descriptor's `root` is the only thing consulted.
 * No existence check is made, and none is possible here — this function cannot fail for an unauthored or
 * empty Spoke resource tree.
 */
export function spokeResourcePaths(descriptor: SpokeRootDescriptor): SpokeResourcePaths {
  const spokeRoot = descriptor.root;

  return {
    spokeRoot,
    dictionaryRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.dictionary}`,
    dictionaryOverrideRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.dictionaryOverrides}`,
    markdownPagesRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.markdownPages}`,
    jsonPagesRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.jsonPages}`,
    assetSourceRoot: `${spokeRoot}/${DEPLOYMENT_RESOURCE_PATHS.assetSources}`,
  };
}

/**
 * THE SMALLEST RESOURCE RECORD A RUNTIME NEEDS FOR ONE SPOKE (FOUNDATION-MULTISITE-S3E1C)
 * =======================================================================================
 *
 *     SpokeRootDescriptor  ->  SpokeResourceIndex {
 *                                spokeId,
 *                                runtimeSegment,      runtimeSegmentForSpokeId(spokeId)
 *                                assetBasePath,       /spokes/<segment>/assets
 *                                resources,           the authored trees (above)
 *                              }
 *
 * THE ONLY NEW FACTS ARE THE RUNTIME ONES: which IDENTITY this is, which namespace its own artwork is
 * served from, and where its authored trees live. Everything else a Spoke has — its `SiteConfig`, its
 * dictionaries' CONTENTS, its pages, its Hubs, a request — is deliberately ABSENT: a record that carried
 * a configuration would be a second place configuration lives, and one that carried a request would only
 * be meaningful for one of them.
 *
 * The SEGMENT comes from the identity ALONE (`./spoke-runtime-segment`), never from the directory the
 * Spoke happens to be authored in: `spokes/foundation-web` holding the Spoke `foundation` yields
 * `foundation` and `/spokes/foundation/assets/**`, and two Spokes with the same asset basename get two
 * namespaces that cannot collide. The `assetBasePath` is the SAME function the runtime path authority
 * consumes, so a URL this record names is the URL the runtime serves.
 *
 * Pure: no filesystem, no environment, no discovery. An unauthored or empty Spoke resource tree yields
 * this record exactly as a fully authored one does.
 */
export interface SpokeResourceIndex {
  /** The Spoke this record describes. */
  readonly spokeId: SpokeId;
  /** The runtime segment its own asset namespace is derived from (injective, filesystem/URL-safe). */
  readonly runtimeSegment: string;
  /** The same-origin URL base the Spoke's own artwork is served from. */
  readonly assetBasePath: string;
  /** The authored resource trees of the SAME Spoke. */
  readonly resources: SpokeResourcePaths;
  /**
   * The OWNING Spoke Hub, and the COMPOSITE identity — present ONLY when the Installation IDENTIFIES its
   * Hubs (FOUNDATION-ID-M3-P2).
   *
   * They are absent for a flat/legacy Spoke, whose one Spoke Hub is implicit and unnamed, so this record
   * carries exactly the keys it always carried. When they ARE present, `runtimeSegment` is the COMPOSITE
   * segment (`runtimeSegmentForIdentifiedSpokeRef`), which is what makes two Hubs' Spokes called `docs`
   * occupy two namespaces — and what makes a bare local id insufficient to name either.
   */
  readonly spokeHubId?: SpokeHubId;
  readonly spokeRef?: IdentifiedSpokeRef;
}

/**
 * The resource record of ONE resolved Spoke. Root is an INPUT (S3C1 resolved it); the identity is the
 * only other input, and it is what the runtime segment is derived from.
 *
 * `ref` is OPTIONAL and states the COMPOSITE identity when — and only when — the Installation identifies
 * its Spoke Hubs: the flat/legacy call is unchanged, argument for argument, and returns a record with the
 * same keys and the same segment as before.
 */
export function spokeResourceIndexFor(
  descriptor: SpokeRootDescriptor,
  ref?: IdentifiedSpokeRef,
): SpokeResourceIndex {
  const runtimeSegment =
    ref === undefined ? runtimeSegmentForSpokeId(descriptor.id) : runtimeSegmentForIdentifiedSpokeRef(ref);

  const index: SpokeResourceIndex = {
    spokeId: descriptor.id,
    runtimeSegment,
    assetBasePath: spokeRuntimeAssetUrlBase(runtimeSegment),
    resources: spokeResourcePaths(descriptor),
  };

  return ref === undefined ? index : { ...index, spokeHubId: ref.spokeHubId, spokeRef: ref };
}
