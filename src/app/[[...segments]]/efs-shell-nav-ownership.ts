/**
 * EFS owner-verified primary-navigation composition.
 *
 * ONE job: prove that a verified `EfsView` belongs to the runtime Spoke that owns it, take that Spoke's
 * own explicitly-selected presentation Site, read ITS already-approved primary-navigation leaves and its
 * own dictionary/icon answers, and hand them to the accepted R06 `efsPrimaryNavigationModel`.
 *
 * WHAT THIS MODULE DOES NOT DECIDE — each already has exactly one authority:
 *
 *   - the public ADDRESS and the CURRENT-PAGE flag: R04, reached through R06 and emitted verbatim;
 *   - external-destination safety: the released `classifyAuthorUrl` / `AUTHOR_ALLOWED_SCHEMES` policy,
 *     also inside R06;
 *   - the merge of shared and per-Site page configuration: `effectiveSitePageConfig`;
 *   - whether a runtime Spoke owns a publication: `publicationOwnedBy`;
 *   - how a dictionary is selected and how an asset is screened for the owner: the context-bound
 *     dictionary access and asset resolver that the caller supplies.
 *
 * There is no new view constructor, Site set, locale parser, address builder, property cascade, context
 * cache, request resolver or module-global configuration here. Two Site NAMESPACES meet in this function
 * and are never interchanged: `view.publication.presentationSiteCode` names a Site in the owning Spoke's
 * own configuration (labels, icons, appearance), while `view.site.id` is the EFS publication Site whose
 * inventory and binding decide which public Pages exist. They may legitimately differ, and neither may be
 * derived from the other.
 *
 * INVOKED NOWHERE LIVE. This is a non-live server seam: no route, layout, composition module or component
 * imports it. It is pure and deterministic — no header, cookie, Next request API, environment variable,
 * filesystem read, runtime owner discovery, mutable cache, client hook or `window`, and no locale is
 * inferred from a URL.
 */
import type { EfsResolvedNavItem } from "@/components/site/context-nav-links";
import type { RuntimeAssetOwnershipResolver } from "@/config/runtime-asset-resolver";
import type { RuntimeDictionaryAccess } from "@/config/runtime-dictionaries";
import { effectiveSitePageConfig } from "@/config/site-page-config";
import { publicationOwnedBy } from "@/core/efs/publication";

import type { EfsView } from "./efs-request";
import { efsPrimaryNavigationModel } from "./efs-shell-nav-model";

export interface EfsOwnedPrimaryNavigationInput {
  /** The verified EFS view for THIS request. */
  readonly view: EfsView;
  /**
   * The OWNING context's dictionary access — `dictionaryAccessForRuntimeContext(view.context)`.
   *
   * Injected rather than discovered so a caller cannot silently bind another context's answers and this
   * function stays free of runtime owner lookup. The caller supplies the service of the SAME
   * `view.context`; this module cannot prove that an arbitrarily supplied service belongs to that owner,
   * and does not pretend to.
   */
  readonly dictionaries: RuntimeDictionaryAccess;
  /**
   * The OWNING context's screened asset ownership —
   * `createRuntimeAssetOwnershipResolver(view.context.runtimeAssetNamespaces)`.
   *
   * Same precondition as `dictionaries`: the function receives the owner-scoped resolver, it does not
   * acquire one.
   */
  readonly assets: Pick<RuntimeAssetOwnershipResolver, "availableIconUrl">;
}

/**
 * The presentation Site's primary navigation, projected through the accepted R06 model.
 *
 * Returns `null` — touching no service — when the publication declares no presentation Site: that is the
 * ordinary EFS-only document boundary, not a failure. Returns `[]` when a valid presentation Site simply
 * configures no primary navigation, or when every configured entry is correctly refused. A primary
 * navigation never invents a Home entry, a country Site or a `ww` prefix.
 *
 * THROWS, fail-closed and sanitized, in exactly two cases — both Installation/publication defects that
 * must not be softened into a silent downgrade:
 *
 *   1. the publication is not owned by the runtime context (wrong Spoke, or the same Spoke ID under a
 *      different named Hub);
 *   2. the publication names a presentation Site the owning Spoke does not declare.
 *
 * In both cases the message carries only configuration identifiers — never a filesystem path, hostname,
 * capsule location or authored content.
 */
export function efsOwnedPrimaryNavigation(
  input: EfsOwnedPrimaryNavigationInput,
): readonly EfsResolvedNavItem[] | null {
  const { view, dictionaries, assets } = input;

  // ── 1. OWNERSHIP FIRST ───────────────────────────────────────────────────────────────────────────────
  // No dictionary, asset or Site-configuration lookup may happen before this. A publication is owned by an
  // explicit composite runtime identity, never by a hostname, a prefix, a name match or "the first Spoke".
  // `publicationOwnedBy` refuses a missing or mismatched half — including the same local Spoke ID under a
  // different named Hub — so neither half is ever guessed here.
  if (!publicationOwnedBy(view.publication, view.context)) {
    throw new Error(
      `EFS publication "${view.publication.id}" declares Spoke "${view.publication.spokeId}", ` +
        `which runtime context "${view.context.id}" does not own; ` +
        `primary navigation cannot be composed.`,
    );
  }

  // ── 2. THE EXPLICIT PRESENTATION SITE ────────────────────────────────────────────────────────────────
  // Absent means the EFS-only document boundary. Return `null` immediately: no default Site, no dictionary,
  // no asset and no configuration work of any kind.
  const presentationSiteCode = view.publication.presentationSiteCode;
  if (presentationSiteCode === undefined) return null;

  // ── 3. THAT SITE, IN THE OWNING SPOKE'S OWN CONFIGURATION ────────────────────────────────────────────
  // The code is resolved against the OWNING context's declared Sites only. An undeclared code is refused
  // rather than borrowed from `defaultSite`, another Site, another Spoke, another Facet or `view.site`:
  // `effectiveSitePageConfig` answers its documented STRING form with the DEFAULT Site, and that fallback
  // must never become an EFS fallback. Passing the resolved OBJECT is what prevents it.
  const sourceSite = view.context.siteConfig.sites.find(
    (candidate) => candidate.code === presentationSiteCode,
  );
  if (sourceSite === undefined) {
    throw new Error(
      `EFS presentation Site "${presentationSiteCode}" is not declared by the owning Spoke ` +
        `"${view.context.id}"; primary navigation cannot be composed.`,
    );
  }

  // The accepted merge rule decides inheritance: an absent per-Site leaf is inherited from the shared
  // configuration, a present one replaces it wholesale. Only the `navigation` leaf is consumed.
  const effective = effectiveSitePageConfig(view.context.siteConfig, sourceSite);

  // ── 4. THE OWNER'S OWN LABELS AND ICONS ──────────────────────────────────────────────────────────────
  // The locale is the VERIFIED representation key (`de-de`, `en-001`), passed through untouched — no
  // language base, no Site default, no visitor header and no second negotiation is synthesized here, and
  // the owning registry keeps its own documented fallbacks. Labels are keyed by the AUTHORED href inside
  // R06. Icons resolve only for names the configuration actually declares, through the supplied
  // owner-scoped resolver; the arrow preserves that resolver's receiver.
  const words = dictionaries.get(view.localeKey, sourceSite.code);

  // ── 5. THE ACCEPTED PROJECTION ───────────────────────────────────────────────────────────────────────
  // Everything downstream of this call is R06's: destination filtering, current-Page matching, keys,
  // external scheme policy and icon degradation. None of it is restated here, and the returned list is
  // that module's own `readonly EfsResolvedNavItem[]` unchanged — plain, serialisable public leaves only.
  return efsPrimaryNavigationModel({
    view,
    authoredNavigation: effective.navigation,
    dictionaryNavigationLabels: words.navigation.items,
    resolveIcon: (name) => assets.availableIconUrl(name),
  });
}
