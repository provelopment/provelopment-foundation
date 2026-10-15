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
 * THE COMPOSITE RUNTIME SEGMENT (implemented by FOUNDATION-ID-M3-P3, recorded here as the contract it keeps)
 * ----------------------------------------------------------------------------------------------------------
 * When several identified Spoke Hubs are operable — which they now are — the runtime addresses a Spoke by its
 * COMPOSITE identity, and the constraints are:
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
 * The authority itself lives in `../config/spoke-runtime-segment.mjs`
 * (`runtimeSegmentForIdentifiedSpokeRef`): a nested Installation's members, namespaces, routing entries and
 * runtime contexts are all derived from it, while `runtimeSegmentForSpokeId` keeps its contract exactly, so
 * every flat/legacy segment is byte-identical to what it always was.
 *
 * Framework-neutral: pure data and pure functions. No filesystem, no configuration, no request.
 */
import { spokeHubIssues } from "./coherence";
import { normalizeHostname, type Hostname } from "./hostname";
import { resolveSpokeFromHost, type SpokeInspectionPolicy, type SpokeSelectionReason } from "./resolve";
import { spokeHubCollectionIssues } from "./spoke-hub-id";
import type {
  IdentifiedSpokeRef,
  InstallationSpokeHubCollection,
  Spoke,
  SpokeHubId,
  SpokeId,
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

/**
 * ONE identified Spoke Hub's CLAIMS (FOUNDATION-ID-M3-P2): the smallest fact the COMPOSITE request decision
 * needs, and nothing else.
 *
 * It is the `SpokeHub` shape plus the Hub's identity, so a caller holding only the routing data a build
 * inlined (an id, a segment and normalized claims — no Site Hubs, no configuration, no filesystem) can ask
 * the ONE decision without a second hostname-matching rule appearing anywhere. A Site Hub never appears
 * here: Site Hubs stay inside a Spoke, and a request is decided by HOST alone.
 */
export interface IdentifiedHubClaims {
  readonly spokeHubId: SpokeHubId;
  readonly spokes: readonly Spoke[];
}

/**
 * WHICH Spoke answers a request host in an Installation that IDENTIFIES its Spoke Hubs: the COMPOSITE
 * selection — both halves of the identity, so a caller can never resolve a Spoke by its local id alone.
 */
export interface IdentifiedSpokeSelection {
  readonly spokeHubId: SpokeHubId;
  readonly spokeId: SpokeId;
  readonly hostname: Hostname;
  readonly reason: SpokeSelectionReason;
}

/**
 * The Spoke that answers this request host across an Installation's identified Spoke Hubs, or `null`.
 *
 * THE DECISION ORDER IS THE ACCEPTED ONE, unchanged: an EXPLICIT claim wins, and only a hostname no Spoke
 * claims can be answered by the Installation's inspection nomination. The matching step itself is not
 * restated — each Hub is asked through the SAME pure `resolveSpokeFromHost`, so exactness, normalization
 * and the claims-before-inspection order cannot drift between the flat and the composite decision.
 *
 * A COMPOSITE NOMINATION IS COMPOSITE, AND NOTHING ELSE. The inspection policy must name BOTH halves: a
 * policy stating only a local `spokeId` is REFUSED here (it answers nothing), because in an Installation
 * that identifies its Hubs that id may name a Spoke in either Hub, and first-match would be a guess. A
 * nomination naming a Hub or a Spoke this Installation does not declare answers nothing as well — a caller
 * cannot conjure a Spoke by asking for it.
 *
 * `null` is a RESULT, not an error: an unclaimed hostname may not be served another Spoke's content, and
 * there is no first-Hub, first-Spoke or cross-Hub fallback anywhere in this function.
 */
export function resolveSpokeRefFromHost(
  hubs: readonly IdentifiedHubClaims[],
  host: string | null | undefined,
  inspection?: SpokeInspectionPolicy | null,
): IdentifiedSpokeSelection | null {
  const hostname = normalizeHostname(host);
  if (hostname === null) return null;

  for (const hub of hubs) {
    const selection = resolveSpokeFromHost({ spokes: hub.spokes }, hostname, null);
    if (selection !== null) {
      return {
        spokeHubId: hub.spokeHubId,
        spokeId: selection.spokeId,
        hostname: selection.hostname,
        reason: selection.reason,
      };
    }
  }

  if (
    inspection !== null &&
    inspection !== undefined &&
    inspection.spokeHubId !== undefined &&
    inspection.hostnames.includes(hostname)
  ) {
    const hub = hubs.find((candidate) => candidate.spokeHubId === inspection.spokeHubId);
    if (hub !== undefined && hub.spokes.some((spoke) => spoke.identity.id === inspection.spokeId)) {
      return {
        spokeHubId: inspection.spokeHubId,
        spokeId: inspection.spokeId,
        hostname,
        reason: "inspection-hostname",
      };
    }
  }

  return null;
}
