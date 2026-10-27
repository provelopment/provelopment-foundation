/**
 * THE CURRENT BUILD'S HOSTNAME ROUTING, AND WHICH SPOKE ANSWERS A HOST (FOUNDATION-MULTISITE-M16)
 * ==============================================================================================
 *
 * The REQUEST BOUNDARY's authority — and, deliberately, a PURE one: it reads the routing description the
 * build resolved and inlined (`./spoke-host-routing.mjs` ← `./deployment-build.mjs` ← `next.config.ts`),
 * derives each Spoke's exact hostname claims through the ONE pure `origin → hostname` step
 * (`@/core/spoke`'s `hostnameFromOrigin`), and answers the ONE question a request has:
 *
 *     given a raw `Host` header, which Spoke answers — or none?
 *
 * NO FILESYSTEM, NO CONFIGURATION PARSE, NO REQUEST OBJECT. That is what makes this module usable from the
 * proxy: the boundary never parses `site.config.json`, never discovers a Spoke root, never reads a
 * dictionary and never needs a page. It holds no mutable selection state either — the table is a value and a
 * decision is a pure function of it — so two Spokes cannot influence each other's answer.
 *
 * NO DEFAULT SPOKE, ANYWHERE. `spokeSelectionForHost` reuses the accepted exact-match decision
 * (`@/core/spoke`'s `resolveSpokeFromHost`) over the claims derived above: a host no Spoke claims answers
 * `null`. `single` mode means "the Installation declares exactly ONE Spoke" — the same fact the accepted
 * `currentBuildRuntimeContext()` relies on — never "the first Spoke".
 */
import {
  hostnameFromOrigin,
  normalizeHostname,
  resolveSpokeFromHost,
  resolveSpokeRefFromHost,
  sharedHostnamesIn,
  type Hostname,
  type IdentifiedSpokeRef,
  type Spoke,
  type SpokeHub,
  type SpokeInspectionPolicy,
  type SpokeSelection,
} from "@/core/spoke";

import { runtimeSegmentForIdentifiedSpokeRef } from "./spoke-runtime-segment.mjs";

/**
 * The build-time environment name this module READS, spelled here exactly as the build publishes it
 * (`./deployment-build.mjs`'s `DEPLOYMENT_HOST_ROUTING_ENV`). It is declared locally rather than imported
 * because that module is the FILESYSTEM-using build harness: importing it would drag `node:fs` into this
 * client-safe, request-boundary module.
 */
const DEPLOYMENT_HOST_ROUTING_ENV = "FOUNDATION_DEPLOYMENT_HOST_ROUTING";

/**
 * How this build serves its Spokes, and WHICH RULE decides: the ONE-Spoke compatibility runtime, hostname
 * dispatch for a flat Installation of several Spokes, or hostname dispatch for an Installation AUTHORED with
 * identified Spoke Hubs.
 *
 *   single      the ONLY permissive mode: a legacy/flat Installation declaring exactly ONE Spoke, which
 *               answers EVERY host (the accepted development/preview behaviour, §6)
 *   multi       a flat Installation declaring SEVERAL Spokes: exact hostname dispatch
 *   identified  an Installation authored with `spokeHubs`: exact hostname dispatch ALWAYS — including when
 *               the whole Installation contains one Hub and one Spoke, because that authoring form never
 *               takes the permissive path
 */
export type HostRoutingMode = "single" | "multi" | "identified";

/** ONE Spoke's request-routing identity: who it is, its internal segment, and the hosts it claims. */
export interface SpokeHostRoutingEntry {
  readonly id: string;
  readonly runtimeSegment: string;
  /** The authored absolute origin its claims derive from. */
  readonly canonicalOrigin: string;
  /** The EXACT normalized hostnames it answers for (never a wildcard, never a suffix rule). */
  readonly hostnameClaims: readonly Hostname[];
  /**
   * The OWNING Spoke Hub, present ONLY when the Installation IDENTIFIES its Hubs (FOUNDATION-ID-M3-P2).
   *
   * When it is present, `runtimeSegment` is the COMPOSITE segment of `(spokeHubId, id)` and this entry is
   * addressed by BOTH halves: the same local id may be declared in another Hub, so a lookup by `id` alone
   * would name whichever Hub came first. A flat/legacy installation publishes neither key, so its entries
   * are exactly what they always were.
   */
  readonly spokeHubId?: string;
  /** The COMPOSITE identity, present exactly when `spokeHubId` is. */
  readonly spokeRef?: IdentifiedSpokeRef;
}

/** ONE option of the CROSS-SPOKE SWITCHER: the Spoke it offers, the label a visitor reads and its origin. */
export interface SpokeSwitcherOption {
  readonly spokeId: string;
  readonly label: string;
  readonly href: string;
}

/**
 * The Installation's authored SPOKE-HUB-SCOPED SPOKE SWITCHER (R1).
 *
 * THE SWITCHER MOVES BETWEEN THE SPOKES OF ONE SPOKE HUB. The CURRENT implementation composes exactly ONE
 * Spoke Hub per Installation — the OUTER coordinator of its Spokes — and every Spoke the manifest declares
 * is a MEMBER of it. The APPROVED TARGET (SEVERAL independently identified Spoke Hubs per Installation, with
 * Spoke ids scoped to their owning Spoke Hub) is NOT implemented here and is not pretended here. These
 * options are that ONE Spoke Hub's members — never an arbitrary link list, never another organization's
 * site, and never a template/provisioning relationship (a site generated or updated from a centrally managed
 * template remains its OWN Spoke Hub / Installation unless it is declared as a member).
 *
 * DO NOT CONFUSE THE TWO ORGANISATIONAL LAYERS (FOUNDATION-ID-M2). The SPOKE HUB is the OUTER coordinator of
 * Spokes — this switcher's scope. A SITE HUB is the INNER grouping of Sites within ONE Spoke
 * (`@/core/spoke`'s `Hub`, exported too as `SiteHub`): it has no public address, no URL segment and no
 * switcher of its own, so it never switches Spokes.
 *
 * Options are in AUTHORED order — navigation between members is a dimension of its own, so nothing here is
 * sorted, inferred from the manifest or read from the filesystem. The build has already proved every option
 * routes back to the member it names (`./spoke-host-routing.mjs`), so the chrome renders the list it is
 * given.
 */
export interface SpokeSwitcherConfig {
  readonly options: readonly SpokeSwitcherOption[];
}

/**
 * ONE identified Spoke Hub's OWN switcher (`FOUNDATION-ID-M3-P2`).
 *
 * In the nested authoring form the switcher belongs to the HUB that owns the Spokes it offers, so it is
 * carried per Hub rather than once per Installation: a Hub's switcher may only offer its own members, and
 * the Spoke rendering the page receives its OWNING Hub's list — never an Installation-wide merge, which
 * would offer Spokes the rendering Hub does not own.
 */
export interface SpokeHubSwitcherConfig {
  readonly spokeHubId: string;
  readonly options: readonly SpokeSwitcherOption[];
}

/** The build's immutable hostname routing description. */
export interface InstallationHostRouting {
  readonly mode: HostRoutingMode;
  readonly spokes: readonly SpokeHostRoutingEntry[];
  /**
   * The Installation's EXPLICIT inspection policy (M20 §29, extended M22), or `null` when it declares
   * none.
   *
   * Three classes of hostname exist and only the first is authored *about a Spoke*: a Spoke's own
   * canonical hostname (its claims, above), a hostname the HOSTING PLATFORM reported for this build, and
   * a deployment-owned ALIAS the Installation authored. The build keeps the last two apart in its
   * description; the decision consumes only their union, normalized through the ONE pure step — never a
   * suffix rule and never a wildcard — together with the Spoke id the collection names.
   */
  readonly inspection: SpokeInspectionPolicy | null;
  /** The authored cross-Spoke switcher, or `null` when this Installation declares none. */
  readonly spokeSwitcher: SpokeSwitcherConfig | null;
  /**
   * The PER-HUB switchers of an Installation that IDENTIFIES its Hubs, in authored order (`M3-P2`), or
   * `undefined` for a flat/legacy Installation — whose single, Installation-wide `spokeSwitcher` above is
   * exactly what it always was.
   */
  readonly spokeHubSwitchers?: readonly SpokeHubSwitcherConfig[];
}

/**
 * One entry's claims: its canonical `origin → hostname`, through the ONE pure step, followed by the
 * ADDITIONAL exact hostnames the Spoke authored (`hostAliases`) — an unusable origin claims nothing.
 *
 * The canonical hostname always LEADS, because it is the one the Spoke's canonical metadata is built from;
 * the additional claims are routing claims only and never become a second origin. A claim that merely
 * restates the canonical hostname is collapsed, so the list stays one entry per hostname.
 */
function claimsFor(origin: string, hostAliases: readonly Hostname[], where: string): readonly Hostname[] {
  if (origin === "") return [];
  const hostname = hostnameFromOrigin(origin);
  if (hostname === null) {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: ${where}: the authored origin "${origin}" yields no usable hostname, so ` +
        "no request could ever be routed to it.",
    );
  }
  return [hostname, ...hostAliases.filter((alias) => alias !== hostname)];
}

/**
 * The build's published inspection block, normalized into the pure policy — or `null` when none.
 *
 * The hostnames arrive VERBATIM from the build (the platform's own values for the deployment being built
 * plus the aliases the Installation authored), and this is the ONE place they become hostnames: the pure
 * `normalizeHostname` step. A value that is not a usable hostname is a build defect, so it is REFUSED
 * rather than silently dropped — a policy that quietly recognises nothing would look identical to one
 * that works, and an operator would be told nothing.
 *
 * The build keeps the three classes APART in the description (`platformHostnames`, `authoredHostnames`
 * and their union `hostnames`, M22). The decision needs only the union, so that is what the pure policy
 * carries — but the artifact must not be able to claim provenance it does not have: when the build
 * publishes the two lists, they must add up to exactly the union, or the description is malformed and is
 * refused here.
 */
function inspectionOf(raw: unknown): SpokeInspectionPolicy | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      "FOUNDATION-MULTISITE-M20: the build's inspection policy is malformed — it needs a Spoke id and " +
        "the hostnames the hosting platform reported.",
    );
  }

  const entry = raw as {
    spokeId?: unknown;
    spokeHubId?: unknown;
    hostnames?: unknown;
    platformHostnames?: unknown;
    authoredHostnames?: unknown;
  };
  if (typeof entry.spokeId !== "string" || entry.spokeId.trim() === "") {
    throw new Error(
      "FOUNDATION-MULTISITE-M20: the build's inspection policy names no Spoke, so it could never " +
        "select one.",
    );
  }

  const hostnames = normalizeInspectionValues(entry.hostnames, "an inspection hostname");

  if (entry.platformHostnames !== undefined || entry.authoredHostnames !== undefined) {
    const platform = normalizeInspectionValues(entry.platformHostnames, "a platform inspection hostname");
    const authored = normalizeInspectionValues(entry.authoredHostnames, "an authored inspection alias");
    const expected = [...platform, ...authored].filter((value, index, all) => all.indexOf(value) === index);
    const same =
      expected.length === hostnames.length && expected.every((value) => hostnames.includes(value));
    if (!same) {
      throw new Error(
        "FOUNDATION-MULTISITE-M20: the build's inspection policy does not add up — the hostnames it " +
          `matches (${hostnames.join(", ") || "none"}) are not exactly the platform-reported and ` +
          `authored aliases it declares (${expected.join(", ") || "none"}). The description is built by ` +
          "the build, so a disagreement here means it was not.",
      );
    }
  }

  // A COMPOSITE NOMINATION (FOUNDATION-ID-M3-P2). When the Installation identifies its Spoke Hubs, the
  // nomination states the OWNING Hub as well: a bare local id may name a Spoke in either Hub, so the policy
  // carries both halves. A value that is not a usable identity is REFUSED rather than ignored — an ignored
  // one would silently un-nominate, which looks identical to a working policy.
  if (entry.spokeHubId !== undefined) {
    if (typeof entry.spokeHubId !== "string" || entry.spokeHubId.trim() === "") {
      throw new Error(
        "FOUNDATION-ID-M3-P2: the build's inspection policy states an owning Spoke Hub that is not a " +
          "usable identity, so the Spoke it nominates could not be resolved without guessing between Hubs.",
      );
    }
    return Object.freeze({
      spokeId: entry.spokeId,
      spokeHubId: entry.spokeHubId,
      hostnames: Object.freeze(hostnames),
    });
  }

  return Object.freeze({ spokeId: entry.spokeId, hostnames: Object.freeze(hostnames) });
}

/** One list of inspection hostname values, normalized through the ONE step — refusing an unusable one. */
function normalizeInspectionValues(raw: unknown, what: string): Hostname[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(
      `FOUNDATION-MULTISITE-M20: the build's inspection policy carries ${what}s as something other ` +
        "than a list.",
    );
  }

  const hostnames: Hostname[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      throw new Error(
        `FOUNDATION-MULTISITE-M20: the build's inspection policy carries ${what} that is not text.`,
      );
    }
    const hostname = normalizeHostname(value);
    if (hostname === null) {
      throw new Error(
        `FOUNDATION-MULTISITE-M20: ${what} "${value}" is not a usable hostname. Recognition is exact, ` +
          "so an unusable value must be reported rather than ignored.",
      );
    }
    if (!hostnames.includes(hostname)) hostnames.push(hostname);
  }
  return hostnames;
}

let cached: InstallationHostRouting | null = null;

/**
 * One entry's ADDITIONAL claims, normalized through the ONE pure step (`normalizeHostname`) — refusing an
 * unusable value.
 *
 * The build already validated these (`./spoke-host-routing.mjs`), so a value that cannot be a hostname here
 * means the artifact was not produced by that seam: it is REFUSED rather than silently dropped, because a
 * claim that quietly disappeared would leave a Spoke unreachable at a hostname the Installation authored.
 */
function aliasesOf(raw: unknown, where: string): readonly Hostname[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(
      `FOUNDATION-MULTISITE-M23: ${where}: the build's additional hostname claims are something other ` +
        "than a list.",
    );
  }
  const aliases: Hostname[] = [];
  for (const value of raw) {
    if (typeof value !== "string") {
      throw new Error(
        `FOUNDATION-MULTISITE-M23: ${where}: an additional hostname claim is not text.`,
      );
    }
    const hostname = normalizeHostname(value);
    if (hostname === null) {
      throw new Error(
        `FOUNDATION-MULTISITE-M23: ${where}: the additional hostname claim "${value}" is not a usable ` +
          "hostname. Recognition is exact, so an unusable value must be reported rather than ignored.",
      );
    }
    if (!aliases.includes(hostname)) aliases.push(hostname);
  }
  return aliases;
}

/**
 * The build's published CROSS-SPOKE SWITCHER, normalized into the pure configuration — or `null` when none.
 *
 * The options arrive in AUTHORED order and are kept in it (never sorted, never derived). A malformed option
 * is a build defect, so it is refused loudly: a switcher that silently lost an option would read as a
 * working installation while offering fewer Spokes than the Installation declares.
 */
function switcherOf(raw: unknown): SpokeSwitcherConfig | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(
      "FOUNDATION-MULTISITE-M23: the build's cross-Spoke switcher is malformed — it needs an options list.",
    );
  }
  const entry = raw as { options?: unknown };
  if (!Array.isArray(entry.options)) {
    throw new Error(
      "FOUNDATION-MULTISITE-M23: the build's cross-Spoke switcher carries options as something other " +
        "than a list.",
    );
  }

  const options: SpokeSwitcherOption[] = entry.options.map((option) => {
    const candidate = option as { spokeId?: unknown; label?: unknown; href?: unknown };
    if (
      option === null ||
      typeof option !== "object" ||
      typeof candidate.spokeId !== "string" ||
      typeof candidate.label !== "string" ||
      typeof candidate.href !== "string"
    ) {
      throw new Error(
        "FOUNDATION-MULTISITE-M23: the build's cross-Spoke switcher carries an option without a Spoke, " +
          "a label and a destination.",
      );
    }
    return Object.freeze({
      spokeId: candidate.spokeId,
      label: candidate.label,
      href: candidate.href,
    });
  });

  return Object.freeze({ options: Object.freeze(options) });
}

/**
 * The build's PER-HUB switchers (`FOUNDATION-ID-M3-P2`), in authored order — or `undefined` when the
 * description publishes none.
 *
 * `undefined` (not an empty list) is what a flat/legacy build produces, so its description keeps exactly
 * the keys it always had and `spokeSwitcherForBuild()` keeps answering as before. In the nested form each
 * Hub carries its OWN switcher, and this reader refuses a Hub stated twice — that would offer one Hub two
 * different navigation lists, and "which one renders?" would be settled by list order.
 */
function hubSwitchersOf(raw: unknown): readonly SpokeHubSwitcherConfig[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new Error(
      "FOUNDATION-ID-M3-P2: the build's per-Hub switchers are something other than a list.",
    );
  }

  const hubs: SpokeHubSwitcherConfig[] = [];
  for (const [index, entry] of raw.entries()) {
    const candidate = entry as { spokeHubId?: unknown; options?: unknown };
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof candidate.spokeHubId !== "string" ||
      candidate.spokeHubId.trim() === ""
    ) {
      throw new Error(
        `FOUNDATION-ID-M3-P2: the build's per-Hub switchers[${index}] names no Spoke Hub, so its options ` +
          "could not be scoped to a Hub.",
      );
    }
    if (hubs.some((hub) => hub.spokeHubId === candidate.spokeHubId)) {
      throw new Error(
        `FOUNDATION-ID-M3-P2: the build's per-Hub switchers state Spoke Hub "${candidate.spokeHubId}" more ` +
          "than once. A Hub has ONE switcher, so two lists would leave which one renders to list order.",
      );
    }

    // THE HUB'S OWN OPTIONS LIST — the SAME helper the flat switcher is validated by, so a malformed entry
    // is refused with the same vocabulary in both forms. The artifact states the OPTIONS themselves
    // (`spokeHubSwitchers[i].options` is the ordered list), which is the shape the producer emits and the
    // shape `spokeHubSwitcherForSpokeHub` returns.
    if (!Array.isArray(candidate.options)) {
      throw new Error(
        `FOUNDATION-ID-M3-P2: the build's per-Hub switchers[${index}] ("${candidate.spokeHubId}") carries ` +
          "no options — an authored Hub switcher always carries its ordered members.",
      );
    }
    const config = switcherOf({ options: candidate.options });
    if (config === null) {
      throw new Error(
        `FOUNDATION-ID-M3-P2: the build's per-Hub switchers[${index}] ("${candidate.spokeHubId}") carries ` +
          "no options — an authored Hub switcher always carries its ordered members.",
      );
    }
    hubs.push(Object.freeze({ spokeHubId: candidate.spokeHubId, options: config.options }));
  }

  return Object.freeze(hubs);
}

/**
 * The current build's hostname routing.
 *
 * An empty value means a build that inlined NO routing description — a legacy unit-test import, or a
 * repository that has not been built: `single` with no entries, which resolves no host at all. Nothing is
 * guessed from the absence.
 */
/**
 * THE PUBLICATION RIGHTS THE REQUEST BOUNDARY MAY ASSERT (R03)
 * ===========================================================
 *
 * The boundary must answer a question it cannot compute: *is this Spoke PUBLISHED on this host?* It has no
 * filesystem and no validated manifest, so it can only know what the build told it. The build projects the
 * manifest's explicit bindings into this description, exactly as it projects hostname routing — one
 * projection of one authority, never a second registry.
 *
 * The distinction this module exists to enforce:
 *
 *     DECLARED  a Spoke in `spokes.json`                 — necessary, NOT sufficient
 *     PUBLISHED an explicit EFS binding for THIS host     — sufficient
 *
 * `site.url` is not an input. It is informational (`D31`), so a host appearing in zero, one or several
 * informational origins changes nothing here.
 *
 * An EMPTY result is meaningful and is NOT "deny everything": it means no EFS publication claims this host
 * at all, and the caller must apply the released host-only rule instead.
 */
const DEPLOYMENT_EFS_PUBLICATIONS_ENV = "FOUNDATION_DEPLOYMENT_EFS_PUBLICATIONS";

/** One projected publication fact: which Spoke a host's binding names. */
interface EfsPublicationClaim {
  readonly host: string;
  readonly spokeId: string;
  readonly spokeHubId?: string;
}

const NO_PUBLISHED_SEGMENTS: ReadonlySet<string> = Object.freeze(new Set<string>());

let publicationClaimsCache: readonly EfsPublicationClaim[] | null = null;

/** The build's projected publication claims, normalized once. */
function publicationClaimsForBuild(): readonly EfsPublicationClaim[] {
  if (publicationClaimsCache !== null) return publicationClaimsCache;

  const raw = process.env[DEPLOYMENT_EFS_PUBLICATIONS_ENV]?.trim() ?? "";
  if (raw === "") {
    publicationClaimsCache = Object.freeze([]);
    return publicationClaimsCache;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `FOUNDATION-EFS-PUBLICATION-RIGHTS: the build's publication projection is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      "FOUNDATION-EFS-PUBLICATION-RIGHTS: the build's publication projection must be an array.",
    );
  }

  const claims: EfsPublicationClaim[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const host = typeof record.host === "string" ? normalizeHostname(record.host) : null;
    const spokeId = typeof record.spokeId === "string" && record.spokeId !== "" ? record.spokeId : null;
    // A malformed claim grants nothing: the projection can only ever be narrower than the manifest.
    if (host === null || spokeId === null) continue;
    const spokeHubId = typeof record.spokeHubId === "string" && record.spokeHubId !== ""
      ? record.spokeHubId
      : undefined;
    claims.push(spokeHubId === undefined ? { host, spokeId } : { host, spokeId, spokeHubId });
  }

  publicationClaimsCache = Object.freeze(claims);
  return publicationClaimsCache;
}

/**
 * The runtime segments `host` may serve because an explicit publication binding names them.
 *
 * A binding that names a Spoke this build does not declare grants NOTHING — composite identity is matched on
 * both halves, so a Hub cannot borrow its namesake's rights and an undeclared name cannot claim a namespace.
 */
export function publishedRuntimeSegmentsForHost(
  routing: InstallationHostRouting,
  host: string | null,
): ReadonlySet<string> {
  const normalized = normalizeHostname(host);
  if (normalized === null) return NO_PUBLISHED_SEGMENTS;

  const segments = new Set<string>();
  for (const claim of publicationClaimsForBuild()) {
    if (claim.host !== normalized) continue;
    const entry = routing.spokes.find(
      (candidate) => candidate.id === claim.spokeId && candidate.spokeHubId === claim.spokeHubId,
    );
    if (entry !== undefined) segments.add(entry.runtimeSegment);
  }
  return segments.size === 0 ? NO_PUBLISHED_SEGMENTS : segments;
}

export function hostRoutingForBuild(): InstallationHostRouting {
  if (cached !== null) return cached;

  const raw = process.env[DEPLOYMENT_HOST_ROUTING_ENV]?.trim() ?? "";
  if (raw === "") {
    cached = Object.freeze({
      mode: "single" as const,
      spokes: Object.freeze([]),
      inspection: null,
      spokeSwitcher: null,
    });
    return cached;
  }

  let parsed: {
    mode?: unknown;
    spokes?: unknown;
    inspection?: unknown;
    spokeSwitcher?: unknown;
    spokeHubSwitchers?: unknown;
  };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: the build's hostname routing description is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // THE MODE IS READ — NEVER INFERRED — AND AN UNKNOWN VALUE IS REFUSED. A description whose mode nobody
  // recognises would otherwise be silently downgraded to `single`, which is precisely the PERMISSIVE
  // one-Spoke path an identified Installation must never take (§6).
  let mode: HostRoutingMode;
  if (parsed.mode === "identified") mode = "identified";
  else if (parsed.mode === "multi") mode = "multi";
  else if (parsed.mode === "single") mode = "single";
  else {
    throw new Error(
      "FOUNDATION-ID-M3-P3: the build's hostname routing description states the mode " +
        `${JSON.stringify(parsed.mode)}, which is not one of "single", "multi" or "identified". The mode ` +
        "decides whether a single-Spoke Installation answers every host, so an unrecognised value is " +
        "refused rather than downgraded.",
    );
  }
  const rawSpokes = Array.isArray(parsed.spokes) ? parsed.spokes : [];

  const spokes: SpokeHostRoutingEntry[] = rawSpokes.map((entry) => {
    const spoke = entry as {
      id?: unknown;
      segment?: unknown;
      canonicalOrigin?: unknown;
      hostAliases?: unknown;
      spokeHubId?: unknown;
    };
    if (
      typeof spoke.id !== "string" ||
      typeof spoke.segment !== "string" ||
      typeof spoke.canonicalOrigin !== "string"
    ) {
      throw new Error(
        "FOUNDATION-MULTISITE-M16: the build's hostname routing description is malformed — every entry " +
          "needs an id, a runtime segment and a canonical origin.",
      );
    }

    const hostnameClaims = claimsFor(
      spoke.canonicalOrigin,
      aliasesOf(spoke.hostAliases, `Spoke "${spoke.id}"`),
      `Spoke "${spoke.id}"`,
    );

    if (spoke.spokeHubId === undefined) {
      return Object.freeze({
        id: spoke.id,
        runtimeSegment: spoke.segment,
        canonicalOrigin: spoke.canonicalOrigin,
        hostnameClaims,
      });
    }

    // A COMPOSITE ENTRY (FOUNDATION-ID-M3-P2): the description states the owning Hub, and the segment MUST
    // be that composite identity's own segment. A segment is an identity rather than a label, so a
    // disagreement would let this entry address ANOTHER Spoke's namespace (its artwork, its context) — it
    // is refused here, where the artifact is read, rather than trusted.
    if (typeof spoke.spokeHubId !== "string" || spoke.spokeHubId.trim() === "") {
      throw new Error(
        "FOUNDATION-ID-M3-P2: the build's hostname routing description gives a Spoke an owning Spoke Hub " +
          "that is not a usable identity, so the entry could not be addressed unambiguously.",
      );
    }
    const spokeRef: IdentifiedSpokeRef = Object.freeze({ spokeHubId: spoke.spokeHubId, spokeId: spoke.id });
    const expected = runtimeSegmentForIdentifiedSpokeRef(spokeRef);
    if (spoke.segment !== expected) {
      throw new Error(
        `FOUNDATION-ID-M3-P2: the routing description gives Spoke Hub "${spoke.spokeHubId}" / Spoke ` +
          `"${spoke.id}" the segment "${spoke.segment}", which is not the segment of that COMPOSITE ` +
          `identity ("${expected}"). A runtime segment addresses one Spoke's namespace and context, so it ` +
          "must be derived from both halves of the identity.",
      );
    }

    return Object.freeze({
      id: spoke.id,
      runtimeSegment: spoke.segment,
      canonicalOrigin: spoke.canonicalOrigin,
      hostnameClaims,
      spokeHubId: spoke.spokeHubId,
      spokeRef,
    });
  });

  const spokeHubSwitchers = hubSwitchersOf(parsed.spokeHubSwitchers);

  // THE MODE AND THE ENTRIES MUST AGREE (FOUNDATION-ID-M3-P3, §6). `identified` is the ONLY mode in which a
  // Spoke names an owning Hub, and it is the ONLY mode that may never take the permissive one-Spoke path: a
  // description carrying composite entries under `single`/`multi` — or flat entries under `identified` — is
  // malformed, and it is refused HERE, where the artifact is read, so a malformed artifact can NEVER
  // activate the legacy permissive path for an identified Spoke. Both directions are refused: a
  // half-identified description has no single rule for naming a Spoke, and an `identified` description with
  // a flat entry would make that entry addressable by a local id alone.
  const identifiedEntries = spokes.filter((spoke) => spoke.spokeHubId !== undefined).length;
  if (mode === "identified" && identifiedEntries !== spokes.length) {
    throw new Error(
      "FOUNDATION-ID-M3-P3: the build's hostname routing description states mode \"identified\", but " +
        `${spokes.length - identifiedEntries} of its ${spokes.length} entr` +
        `${spokes.length - identifiedEntries === 1 ? "y names" : "ies name"} no owning Spoke Hub. An ` +
        "identified description addresses every Spoke by BOTH halves of its identity; a flat entry inside " +
        "one could be selected by a local id alone.",
    );
  }
  if (mode !== "identified" && identifiedEntries > 0) {
    throw new Error(
      "FOUNDATION-ID-M3-P3: the build's hostname routing description says mode " +
        `"${mode}", which dispatches to the SOLE entry on any host, but ${identifiedEntries} of its ` +
        `entries name${identifiedEntries === 1 ? "s" : ""} an owning Spoke Hub. A description that mixes ` +
        "the identified form into a permissive mode would let a local id — or any host at all — reach " +
        "another Hub's Spoke, so it is refused rather than resolved.",
    );
  }

  cached = Object.freeze({
    mode,
    spokes: Object.freeze(spokes),
    inspection: inspectionOf(parsed.inspection),
    spokeSwitcher: switcherOf(parsed.spokeSwitcher),
    // Present ONLY when the build published per-Hub switchers, so a flat/legacy description keeps exactly
    // the keys it always carried (FOUNDATION-ID-M3-P2).
    ...(spokeHubSwitchers === undefined ? {} : { spokeHubSwitchers }),
  });

  // DISPATCH NEEDS AN ORIGIN FOR EVERY SPOKE: a Spoke that claims NO host can never be selected, so an
  // Installation that dispatches by hostname — several flat Spokes, or an IDENTIFIED collection of any size
  // (which always dispatches, §6) — must have an authored canonical origin for every one of them. Refusing
  // HERE, with the Spoke named, keeps "which Spoke answers this host?" answerable for every declared Spoke
  // instead of silently leaving one unreachable. A ONE-SPOKE FLAT Installation is unaffected: it never
  // consults a hostname.
  if (mode !== "single") {
    for (const spoke of spokes) {
      if (spoke.hostnameClaims.length === 0) {
        const where =
          spoke.spokeHubId === undefined
            ? `Spoke "${spoke.id}"`
            : `Spoke Hub "${spoke.spokeHubId}" > Spoke "${spoke.id}"`;
        const because =
          spoke.spokeHubId === undefined
            ? "in a multi-Spoke Installation"
            : "in an Installation authored with identified Spoke Hubs";
        throw new Error(
          `FOUNDATION-MULTISITE-M16: ${where} declares no canonical origin, so no hostname ` +
            `could ever select it ${because}. Author its \`site.url\` (the origin its ` +
            "hostname claim derives from); there is no default Spoke to fall back to.",
        );
      }
    }
  }

  return cached;
}

/**
 * THE CROSS-SPOKE SWITCHER OF THE CURRENT BUILD, or `null` when the Installation authors none.
 *
 * The chrome's ONE reader (WEB-1 owner requirement 1): the header renders the ordered options this returns,
 * with the current Spoke marked, so no component ever parses a manifest, infers an order or names a Spoke of
 * its own. A build whose Installation declares no switcher answers `null`, and the header composes exactly
 * what it composed before — no control, no markup, no attribute.
 */
export function spokeSwitcherForBuild(): SpokeSwitcherConfig | null {
  return hostRoutingForBuild().spokeSwitcher;
}

/**
 * THE SWITCHER OF ONE SPOKE HUB (`FOUNDATION-ID-M3-P2`), or `null` when that Hub authors none.
 *
 * The chrome's per-Hub reader: the Spoke rendering a page receives the list of its OWNING Hub — the members
 * that Hub declares — so a Hub can never offer a Spoke of another Hub, and an Installation-wide merge does
 * not exist. A flat/legacy build carries no per-Hub switchers at all, so this answers `null` there.
 */
export function spokeHubSwitcherForSpokeHub(
  routing: InstallationHostRouting,
  spokeHubId: string,
): SpokeSwitcherConfig | null {
  const hub = routing.spokeHubSwitchers?.find((candidate) => candidate.spokeHubId === spokeHubId);
  return hub === undefined ? null : { options: hub.options };
}

/** The CURRENT build's switcher for ONE Spoke Hub, or `null` — the accessor a caller with a Hub id uses. */
export function spokeHubSwitcherForBuild(spokeHubId: string): SpokeSwitcherConfig | null {
  return spokeHubSwitcherForSpokeHub(hostRoutingForBuild(), spokeHubId);
}

/**
 * THE SWITCHER THE RENDERING SPOKE RECEIVES (FOUNDATION-ID-M3-P3 §8), or `null` when it receives none.
 *
 * ONE reader, TWO authoring forms, and the difference is EXACTLY the membership boundary:
 *
 *   flat/legacy   the Installation's ONE authored switcher, which is what every page has rendered since R1
 *   identified    the switcher of the Spoke's OWNING Spoke Hub — never the Installation's (there is none in
 *                 this form), and never a merge of every Hub's, which would offer Spokes the rendering Hub
 *                 does not own
 *
 * `ref` is the rendering context, so a caller passes what it already holds (`{ spokeHubId }`) rather than a
 * Hub id it looked up somewhere. In an identified Installation the Hub is NOT optional: a context that
 * carries none cannot be rendered with another Hub's navigation, and a wrong list is worse than no list — so
 * that case fails LOUDLY instead of quietly composing a switcher from the wrong membership.
 */
export function spokeSwitcherForRenderingSpoke(
  ref?: { readonly spokeHubId?: string } | null,
): SpokeSwitcherConfig | null {
  const routing = hostRoutingForBuild();
  if (routing.spokeHubSwitchers === undefined) return routing.spokeSwitcher;

  const spokeHubId = ref?.spokeHubId;
  if (spokeHubId === undefined || spokeHubId === "") {
    throw new Error(
      "FOUNDATION-ID-M3-P3: this Installation identifies its Spoke Hubs, so a rendering Spoke receives the " +
        "switcher of its OWNING Spoke Hub — but the context handed to the chrome names no Hub. The Hub is " +
        "part of the Spoke's identity here, so there is no Installation-wide list to fall back to and none " +
        "is composed.",
    );
  }

  return spokeHubSwitcherForSpokeHub(routing, spokeHubId);
}

/** The entry with this identity OR this runtime segment, or `null` — the internal route's ONE lookup. */
export function routingEntryFor(
  routing: InstallationHostRouting,
  key: string,
): SpokeHostRoutingEntry | null {
  return (
    routing.spokes.find(
      (spoke) =>
        spoke.runtimeSegment === key ||
        // A BARE LOCAL ID matches only an entry with no owning Hub (M3-P2): where Hubs are identified, the
        // same id may be declared twice, and matching it here would select whichever came first.
        (spoke.spokeHubId === undefined && spoke.id === key),
    ) ?? null
  );
}

/**
 * THE ENTRY a SELECTION names — the ONE lookup the request boundary uses to find what it just chose.
 *
 * A composite selection is matched on BOTH halves; a flat one is matched on its id AND on the entry having
 * no Hub at all. Either way the answer is the entry the selection actually named, so a request can never be
 * handed another Hub's Spoke that happens to share a local id.
 */
export function routingEntryForSelection(
  routing: InstallationHostRouting,
  selection: SpokeSelection,
): SpokeHostRoutingEntry | null {
  return (
    routing.spokes.find((spoke) =>
      selection.spokeHubId === undefined
        ? spoke.spokeHubId === undefined && spoke.id === selection.spokeId
        : spoke.spokeHubId === selection.spokeHubId && spoke.id === selection.spokeId,
    ) ?? null
  );
}

/**
 * THE ENTRIES CLAIMING `host` EXACTLY, and whether one of them is enough to answer a request.
 *
 * `0` entries: no Spoke claims this host (EFS may still own it, and an unclaimed host is refused here).
 * `1` entry: an EXCLUSIVE claim — hostname dispatch answers with it, exactly as it always has.
 * `2+` entries: a SHARED host. Several Spokes publish different path prefixes of it (`D31`), so no
 * hostname rule may name an owner and dispatch answers NOTHING. The classification itself is the domain's
 * (`@/core/spoke`'s `sharedHostnamesIn`), so the boundary cannot form a second opinion.
 */
export function routingClaimantsForHost(
  routing: InstallationHostRouting,
  host: string | null | undefined,
): readonly SpokeHostRoutingEntry[] {
  const normalized = normalizeHostname(host);
  if (normalized === null) return [];
  return routing.spokes.filter((entry) => entry.hostnameClaims.includes(normalized));
}

/** Whether this Installation's Spokes SHARE `host` — the one question a path-named asset needs. */
export function isSharedHostInRouting(
  routing: InstallationHostRouting,
  host: string | null | undefined,
): boolean {
  const normalized = normalizeHostname(host);
  if (normalized === null) return false;
  return sharedHostnamesIn(routing.spokes.map((entry) => entry.hostnameClaims)).has(normalized);
}

/**
 * WHICH SPOKE ANSWERS A REQUEST HOST, or `null`.
 *
 * The decision is the accepted domain one — exact normalized equality over the claims the build derived —
 * reached through the domain's OWN resolver (`resolveSpokeFromHost`, or the COMPOSITE
 * `resolveSpokeRefFromHost` when this Installation identifies its Hubs), so the request boundary and the
 * configuration layer cannot disagree about what "this Spoke claims this host" means. There is no wildcard,
 * no suffix rule, no implicit subdomain and no default Spoke.
 *
 * The build's OWN inspection policy is passed straight through (M20 §26): an authored claim is tested
 * first, so it always wins, and a hostname recognised only as an inspection hostname resolves to the Spoke
 * the Installation explicitly nominated. A build with no policy behaves exactly as before.
 *
 * AN INSTALLATION IS EITHER FLAT OR IDENTIFIED, NEVER BOTH. A description that mixes the two forms is a
 * malformed artifact — it would have no single rule for naming a Spoke — so it is refused rather than
 * resolved by whichever entry happened to come first.
 */
export function spokeSelectionForHost(
  routing: InstallationHostRouting,
  host: string | null | undefined,
): SpokeSelection | null {
  const composite = routing.spokes.filter((spoke) => spoke.spokeHubId !== undefined);

  if (composite.length > 0) {
    if (composite.length !== routing.spokes.length) {
      throw new Error(
        "FOUNDATION-ID-M3-P2: the build's routing description MIXES Spokes that name an owning Spoke Hub " +
          "with Spokes that do not. An Installation is authored either flat or as identified Spoke Hubs, " +
          "so a description holding both could not name a Spoke unambiguously.",
      );
    }

    const hubs: { spokeHubId: string; spokes: Spoke[] }[] = [];
    for (const spoke of routing.spokes) {
      const spokeHubId = spoke.spokeHubId;
      if (spokeHubId === undefined) continue;
      let hub = hubs.find((candidate) => candidate.spokeHubId === spokeHubId);
      if (hub === undefined) {
        hub = { spokeHubId, spokes: [] };
        hubs.push(hub);
      }
      hub.spokes.push({
        identity: {
          id: spoke.id,
          canonicalHostname: spoke.hostnameClaims[0],
          hostnameClaims: spoke.hostnameClaims,
        },
        hubs: [],
      });
    }

    const selection = resolveSpokeRefFromHost(hubs, host, routing.inspection);
    if (selection === null) return null;
    return {
      spokeId: selection.spokeId,
      spokeHubId: selection.spokeHubId,
      hostname: selection.hostname,
      reason: selection.reason,
    };
  }

  const hub: SpokeHub = {
    spokes: routing.spokes.map((spoke) => ({
      identity: {
        id: spoke.id,
        canonicalHostname: spoke.hostnameClaims[0],
        hostnameClaims: spoke.hostnameClaims,
      },
      hubs: [],
    })),
  };

  return resolveSpokeFromHost(hub, host, routing.inspection);
}
