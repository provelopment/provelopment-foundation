/**
 * HOSTNAME → SPOKE RESOLUTION (FOUNDATION-MULTISITE-S1)
 * ====================================================
 *
 * THE ONE PURE DECISION of the outer layer: given a raw request host, which Spoke answers — or none.
 *
 *   1. a host claimed EXPLICITLY by a Spoke → that Spoke;
 *   2. otherwise                            → no result (`null`).
 *
 * Ownership is EXACT: a Spoke that claims `example.com` does NOT answer `sub.example.com`, and a
 * Spoke may claim several exact hostnames — its canonical host plus any aliases.
 *
 * `null` is a RESULT, not an error. An unclaimed hostname must eventually be answered with nothing at
 * all rather than with a default domain, because serving one domain's identity, content and assets
 * under another domain's hostname is the failure this layer exists to prevent. This module therefore
 * never guesses and never falls back; the fail-closed answer belongs to whatever calls it, and that
 * caller is a later slice — the request boundary is deliberately untouched here.
 *
 * WHY THERE IS NO DEVELOPMENT/PREVIEW BRANCH
 * ------------------------------------------
 * Whether a development, preview or deployment host should resolve to a particular Spoke is a POLICY
 * decision, and the accepted policy is the Installation's own: a multi-Spoke Installation nominates the
 * Spoke that represents it on hosts no Spoke owns publicly (`inspectionSpoke`, with the hostnames the
 * platform reported for the build plus any aliases the Installation authored). THIS module implements the
 * pure MECHANISM only — it takes that policy as an argument and never reads an environment, so the same
 * function is valid at a request boundary, in a test and at build time.
 *
 * The decision is PURE: no filesystem, no request object, no configuration import — so the same
 * function is valid at a request boundary, in a test and at build time.
 */
import { normalizeHostname, type Hostname } from "./hostname";
import type { Spoke, SpokeHub, SpokeHubId, SpokeId } from "./model";

/**
 * How a Spoke was selected.
 *
 * TWO reasons, in this order, and the order is the policy:
 *
 *   `registered-hostname`  the host is one a Spoke claims EXPLICITLY (its authored canonical origin or an
 *                          alias). This always wins, so an inspection policy can never override a real
 *                          authored hostname;
 *   `inspection-hostname`  the host is one the HOSTING PLATFORM reported for this deployment, and the
 *                          Installation explicitly nominated a Spoke to represent it there.
 *
 * A development/preview reason is still deliberately absent: a preview or deployment host resolves to
 * nothing UNLESS the platform itself reported it for this build or the Installation authored it as an
 * alias, because "any host we do not know" is not a policy.
 */
export type SpokeSelectionReason = "registered-hostname" | "inspection-hostname";

/**
 * The EXPLICIT inspection policy of ONE Installation (M20 §29): which Spoke represents it when reached
 * through a hosting platform's own inspection hostname, and which hostnames those are.
 *
 * Both halves are supplied by the caller — the Spoke id from the Installation's declared collection, the
 * hostnames from the platform's own build/runtime identity — because this module is PURE: it never reads
 * the environment, a file or a project setting, and it never guesses which host is "ours".
 */
export interface SpokeInspectionPolicy {
  readonly spokeId: SpokeId;
  /**
   * The OWNING Spoke Hub, when the Installation IDENTIFIES its Hubs (FOUNDATION-ID-M3-P2).
   *
   * `spokeId` alone is a LOCAL id: two Hubs may each declare a Spoke called `docs`, so in an Installation
   * that identifies its Hubs the nomination is the COMPOSITE `(spokeHubId, spokeId)`. It is optional
   * because the flat/legacy form has exactly one implicit Hub and nothing to disambiguate — an installation
   * that does identify its Hubs states it, and a nomination that states only a local id is refused by the
   * composite decision rather than resolved by a first-match guess.
   */
  readonly spokeHubId?: SpokeHubId;
  readonly hostnames: readonly Hostname[];
}

/** WHICH Spoke answers a request host, and the normalized hostname the decision was made from. */
export interface SpokeSelection {
  readonly spokeId: SpokeId;
  readonly hostname: Hostname;
  readonly reason: SpokeSelectionReason;
  /**
   * The owning Spoke Hub, present ONLY when the Installation identifies its Hubs (FOUNDATION-ID-M3-P2).
   * A flat/legacy decision names no Hub, because its one Spoke Hub is implicit and unnamed.
   */
  readonly spokeHubId?: SpokeHubId;
}

/**
 * The Spoke that answers this request host, or `null` when none does.
 *
 * Total and pure: it never throws and never guesses. The first Spoke with a matching claim wins, and
 * `./coherence` is what guarantees a second can never exist — a hostname claimed by two Spokes is a
 * REPORTED defect, not a race settled here.
 *
 * `inspection` is the Installation's explicit policy, or `null`/absent when it declares none. When it is
 * present, a hostname that NO Spoke claims is answered by the nominated Spoke ONLY if the platform itself
 * reported that hostname for this deployment — never by a suffix rule, a wildcard, or a "development"
 * catch-all. A policy naming a Spoke the hub does not contain answers nothing, so a caller cannot conjure
 * a Spoke by asking for it.
 */
export function resolveSpokeFromHost(
  spokeHub: SpokeHub,
  host: string | null | undefined,
  inspection?: SpokeInspectionPolicy | null,
): SpokeSelection | null {
  const hostname = normalizeHostname(host);
  if (hostname === null) return null;

  for (const spoke of spokeHub.spokes) {
    if (spoke.identity.hostnameClaims.includes(hostname)) {
      return { spokeId: spoke.identity.id, hostname, reason: "registered-hostname" };
    }
  }

  if (
    inspection !== null &&
    inspection !== undefined &&
    inspection.hostnames.includes(hostname) &&
    spokeHub.spokes.some((spoke) => spoke.identity.id === inspection.spokeId)
  ) {
    return { spokeId: inspection.spokeId, hostname, reason: "inspection-hostname" };
  }

  return null;
}

/** The Spoke with this id, or `null` — an undeclared id answers nothing. */
export function spokeById(spokeHub: SpokeHub, id: SpokeId): Spoke | null {
  return spokeHub.spokes.find((spoke) => spoke.identity.id === id) ?? null;
}
