/**
 * THE IDENTIFIED SPOKE HUB COLLECTION (FOUNDATION-ID-M3-P1)
 * =======================================================
 *
 * The pure rules of a MULTI-SPOKE-HUB Installation: the coherence of the collection itself, and the ONE
 * unambiguous lookup that a composite identity enables.
 *
 * WHAT IS ADDED, AND WHAT IS REUSED
 * ---------------------------------
 * The per-Spoke and per-Hub rules already exist and are NOT restated here: `./coherence` decides the
 * `SpokeHub`'s own coherence (Spoke ids unique, hostname claims, each Spoke's Site Hubs, one default Site,
 * one Site code per Spoke) and `./spoke-hub-id.mjs` decides the identity of a Spoke Hub id list. This
 * module composes those authorities — quoting each per-Hub issue with the Hub that owns it — and adds ONLY
 * the rules that exist at the level of a COLLECTION of Hubs:
 *
 *   · the Installation coordinates at least one Spoke Hub;
 *   · explicit Spoke Hub ids are unique (from the identity authority, never a second list of rules);
 *   · every Spoke Hub owns at least one Spoke (from the `SpokeHub` authority);
 *   · a Spoke id is unique WITHIN its owning Spoke Hub and MAY repeat in another — so "the same id in two
 *     Hubs" is accepted here, which is precisely what makes a composite reference necessary at all;
 *   · an exact hostname is claimed by ONE Spoke in ONE Spoke Hub across the WHOLE Installation, because a
 *     request carries one host and must select exactly one Spoke — never two, never none by ambiguity.
 *
 * A HOSTNAME IS INSTALLATION-WIDE; A SPOKE ID IS HUB-LOCAL
 * -------------------------------------------------------
 * The asymmetry is the point. Spoke ids are scoped to their owning Spoke Hub (so two Hubs may each own a
 * Spoke called `global`), while hostname ownership stays unique across the Installation — exactly as it is
 * today, where the Installation is the boundary that answers requests.
 *
 * PHASE 2 RECORD — THE COMPOSITE RUNTIME SEGMENT (recorded here, NOT implemented)
 * ------------------------------------------------------------------------------
 * When several identified Spoke Hubs become operable, the runtime must address a Spoke by its COMPOSITE
 * identity, and the accepted constraints are:
 *
 *   · ONE atomic URL/filesystem segment — never an inserted slash, so a segment can never be mistaken for
 *     a directory level or a traversal;
 *   · derived INJECTIVELY from the Hub and Spoke ids, so two different references can never collide;
 *   · unambiguous relative to the LEGACY encoded segments, so an existing Spoke's segment can never be
 *     captured by a new one;
 *   · portable across CASE-INSENSITIVE filesystems;
 *   · STABLE for a declared Hub from its first deployment — a segment is an address, not a rendering of
 *     the current ids;
 *   · unchanged for all legacy/flat manifests.
 *
 * Phase 1 changes NO runtime segment, asset URL, mirror, catalog, proxy header or routing decision:
 * `runtimeSegmentForSpokeId` keeps its contract exactly, and nothing in this module is consumed by the
 * build or the request boundary.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no configuration, no request.
 */
import { spokeHubIssues } from "./coherence";
import { spokeHubCollectionIssues } from "./spoke-hub-id";
import type { Hostname } from "./hostname";
import type {
  IdentifiedSpokeRef,
  InstallationSpokeHubCollection,
  Spoke,
  SpokeHubId,
} from "./model";

/**
 * Every coherence issue in an Installation's IDENTIFIED Spoke Hub collection, in reading order — empty
 * when the collection is coherent.
 *
 * The rules are: the Installation coordinates at least one Spoke Hub; explicit Spoke Hub ids are unique;
 * each Spoke Hub satisfies the EXISTING `SpokeHub` contract (at least one Spoke, unique Spoke ids, at least
 * one hostname claim each — its canonical host among them and in the normalized spelling — at least one
 * Site Hub per Spoke, at least one Site per Site Hub, one Site code per Spoke, exactly one default Site
 * per Spoke); the same LOCAL Spoke id in two DIFFERENT Spoke Hubs is accepted; and no exact hostname is
 * claimed in more than one Spoke Hub.
 *
 * Every per-Hub issue is quoted with the Spoke Hub that owns it, because in a collection of Hubs the
 * sentence `Spoke "global" claims no hostname` is ambiguous on its own: two Hubs may each own a `global`.
 */
export function identifiedSpokeHubCollectionIssues(
  collection: InstallationSpokeHubCollection,
): readonly string[] {
  // SPOKE HUB IDENTITY — the ONE authority, never restated here.
  const issues: string[] = [...spokeHubCollectionIssues(collection.map((hub) => hub.identity.id))];

  for (const hub of collection) {
    // REUSE, never restate: every within-Hub rule is the existing `SpokeHub` authority's answer.
    issues.push(...spokeHubIssues(hub).map((issue) => `Spoke Hub "${hub.identity.id}": ${issue}`));
  }

  // ONE EXACT HOSTNAME BELONGS TO ONE SPOKE IN ONE SPOKE HUB. Claims are gathered per Hub (one entry each
  // Hub, whatever it states more than once — a duplicate INSIDE a Hub is already refused by the authority
  // above, and this rule must never misreport it as a collision BETWEEN Hubs), and a hostname claimed by
  // two different Hubs is refused because a request carries one host: it must select exactly one Spoke.
  const claimantsByHostname = new Map<Hostname, Map<SpokeHubId, string>>();
  const alreadyCounted = new Set<SpokeHubId>();

  for (const hub of collection) {
    // A repeated Spoke Hub id is already refused by the identity rules; counting its claims twice would
    // describe one Hub as two.
    if (alreadyCounted.has(hub.identity.id)) continue;
    alreadyCounted.add(hub.identity.id);

    for (const spoke of hub.spokes) {
      const claimant = `Spoke "${spoke.identity.id}" in Spoke Hub "${hub.identity.id}"`;
      for (const hostname of spoke.identity.hostnameClaims) {
        const byHub = claimantsByHostname.get(hostname) ?? new Map<SpokeHubId, string>();
        if (!byHub.has(hub.identity.id)) byHub.set(hub.identity.id, claimant);
        claimantsByHostname.set(hostname, byHub);
      }
    }
  }

  for (const [hostname, byHub] of claimantsByHostname) {
    if (byHub.size < 2) continue;
    issues.push(
      `hostname "${hostname}" is claimed in more than one Spoke Hub (${[...byHub.values()].join(", ")}): ` +
        "a request carries ONE host, so a hostname must select exactly one Spoke in exactly one Spoke Hub " +
        "across the whole Installation",
    );
  }

  return issues;
}

/** True when an identified Spoke Hub collection satisfies every coherence rule. */
export function isCoherentIdentifiedSpokeHubCollection(
  collection: InstallationSpokeHubCollection,
): boolean {
  return identifiedSpokeHubCollectionIssues(collection).length === 0;
}

/**
 * The Spoke a COMPOSITE reference names, or `null`.
 *
 * This is what a local Spoke id alone can never answer: `IdentifiedSpokeRef` names the owning Spoke Hub
 * first, so the same local id in two Hubs resolves to two different Spokes without a guess. An undeclared
 * Hub, or an undeclared id inside a declared Hub, answers nothing — this function never falls back to
 * another Hub, never to the first Spoke and never to a default.
 */
export function spokeByRef(
  collection: InstallationSpokeHubCollection,
  ref: IdentifiedSpokeRef,
): Spoke | null {
  const hub = collection.find((entry) => entry.identity.id === ref.spokeHubId);
  if (hub === undefined) return null;
  return hub.spokes.find((spoke) => spoke.identity.id === ref.spokeId) ?? null;
}
