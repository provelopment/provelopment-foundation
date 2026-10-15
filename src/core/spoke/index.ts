/**
 * THE OUTER DOMAIN VOCABULARY (FOUNDATION-MULTISITE-S1)
 * ====================================================
 *
 * Barrel for the pure Spoke Hub / Spoke / Site Hub vocabulary and the `hostname → Spoke` decision. Import
 * from `@/core/spoke`; the inner modules are not a consumer surface.
 *
 * WIRING: the identity vocabulary (`spoke-id`), the hostname rules (`hostname`) and the coherence /
 * membership rules are consumed by CONFIGURATION (`@/config/spoke-roots`, `@/config/spoke-composition`,
 * `@/config/hub-membership`) and — through the build's inlined routing description — by the BUILD seam
 * (`@/config/spoke-host-routing.mjs`) and the REQUEST BOUNDARY (`@/config/spoke-routing`, `src/proxy.ts`),
 * so the direction is `config → core` and never the reverse. The decision itself is pure and stays here:
 * which host resolves to which Spoke is one equality over normalized values, and no module re-decides it.
 *
 * TWO ORGANISATIONAL LAYERS, TWO NAMES (FOUNDATION-ID-M2). `SpokeHub` is the OUTER layer — the
 * coordinator of an installation's Spokes. `Hub` is the INNER layer — the grouping of Sites inside
 * ONE Spoke — and is exported here ALSO as `SiteHub` (with `SiteHubId` / `SiteHubIdentity`). Those
 * explicit names are compile-time aliases of the same entities, so every name exported before M2 is
 * still exported, unchanged and undeprecated, and no runtime behaviour differs.
 *
 * ONE SPOKE HUB IS NAMED (FOUNDATION-ID-M3-P1). The outer layer gains an IDENTITY — `SpokeHubId`,
 * `SpokeHubIdentity`, `IdentifiedSpokeHub`, `InstallationSpokeHubCollection` and the composite
 * `IdentifiedSpokeRef` — plus its pure collection rules (`identifiedSpokeHubCollectionIssues`,
 * `spokeByRef`) and its reserved implicit marker (`IMPLICIT_SPOKE_HUB_ID`, declared independently of the
 * implicit Spoke and Site Hub markers). `SpokeHub` itself is NOT redefined: an `IdentifiedSpokeHub` IS a
 * `SpokeHub`, so every existing consumer compiles and behaves exactly as before. The collection's
 * coherence is COMPOSED from the existing authorities (`./coherence`, `./spoke-hub-id`) plus the two rules
 * that only exist across Hubs: unique Hub identity, and one Spoke in one Hub per exact hostname.
 */
export { normalizeHostname, hostnameFromOrigin } from "./hostname";
export type { Hostname } from "./hostname";

export type {
  Hub,
  HubId,
  HubIdentity,
  IdentifiedSpokeHub,
  IdentifiedSpokeRef,
  InstallationSpokeHubCollection,
  SiteHub,
  SiteHubId,
  SiteHubIdentity,
  Spoke,
  SpokeHub,
  SpokeHubId,
  SpokeHubIdentity,
  SpokeId,
  SpokeIdentity,
} from "./model";

export { IMPLICIT_SPOKE_ID, spokeCollectionIssues } from "./spoke-id";

export { IMPLICIT_SPOKE_HUB_ID, spokeHubCollectionIssues } from "./spoke-hub-id";

export {
  identifiedSpokeHubCollectionIssues,
  isCoherentIdentifiedSpokeHubCollection,
  spokeByRef,
} from "./spoke-hub-collection";

export { isCoherentSpokeHub, spokeHubIssues } from "./coherence";

export { hubForSiteCode } from "./site-ownership";

export {
  HubMembershipError,
  IMPLICIT_HUB_ID,
  hubMembershipIssues,
  partitionSitesIntoHubs,
} from "./hub-membership";
export type { SiteHubAssignment } from "./hub-membership";

export { resolveSpokeFromHost, spokeById } from "./resolve";
export type { SpokeInspectionPolicy, SpokeSelection, SpokeSelectionReason } from "./resolve";
