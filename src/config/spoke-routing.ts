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
  type Hostname,
  type SpokeHub,
  type SpokeInspectionPolicy,
  type SpokeSelection,
} from "@/core/spoke";

/**
 * The build-time environment name this module READS, spelled here exactly as the build publishes it
 * (`./deployment-build.mjs`'s `DEPLOYMENT_HOST_ROUTING_ENV`). It is declared locally rather than imported
 * because that module is the FILESYSTEM-using build harness: importing it would drag `node:fs` into this
 * client-safe, request-boundary module.
 */
const DEPLOYMENT_HOST_ROUTING_ENV = "FOUNDATION_DEPLOYMENT_HOST_ROUTING";

/** How many Spokes this build serves: the ONE-Spoke compatibility runtime, or hostname dispatch. */
export type HostRoutingMode = "single" | "multi";

/** ONE Spoke's request-routing identity: who it is, its internal segment, and the hosts it claims. */
export interface SpokeHostRoutingEntry {
  readonly id: string;
  readonly runtimeSegment: string;
  /** The authored absolute origin its claims derive from. */
  readonly canonicalOrigin: string;
  /** The EXACT normalized hostnames it answers for (never a wildcard, never a suffix rule). */
  readonly hostnameClaims: readonly Hostname[];
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
 * The current build's hostname routing.
 *
 * An empty value means a build that inlined NO routing description — a legacy unit-test import, or a
 * repository that has not been built: `single` with no entries, which resolves no host at all. Nothing is
 * guessed from the absence.
 */
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

  let parsed: { mode?: unknown; spokes?: unknown; inspection?: unknown; spokeSwitcher?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: the build's hostname routing description is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const mode: HostRoutingMode = parsed.mode === "multi" ? "multi" : "single";
  const rawSpokes = Array.isArray(parsed.spokes) ? parsed.spokes : [];

  const spokes: SpokeHostRoutingEntry[] = rawSpokes.map((entry) => {
    const spoke = entry as {
      id?: unknown;
      segment?: unknown;
      canonicalOrigin?: unknown;
      hostAliases?: unknown;
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
    return Object.freeze({
      id: spoke.id,
      runtimeSegment: spoke.segment,
      canonicalOrigin: spoke.canonicalOrigin,
      hostnameClaims: claimsFor(
        spoke.canonicalOrigin,
        aliasesOf(spoke.hostAliases, `Spoke "${spoke.id}"`),
        `Spoke "${spoke.id}"`,
      ),
    });
  });

  cached = Object.freeze({
    mode,
    spokes: Object.freeze(spokes),
    inspection: inspectionOf(parsed.inspection),
    spokeSwitcher: switcherOf(parsed.spokeSwitcher),
  });

  // MULTI — hostname dispatch: a Spoke that claims NO host can never be selected, so an Installation that
  // declares several Spokes must have an authored canonical origin for every one of them. Refusing HERE (with
  // the Spoke named) keeps "which Spoke answers this host?" answerable for every declared Spoke, instead of
  // silently leaving one unreachable. A ONE-Spoke Installation is unaffected: it never consults a hostname.
  if (mode === "multi") {
    for (const spoke of spokes) {
      if (spoke.hostnameClaims.length === 0) {
        throw new Error(
          `FOUNDATION-MULTISITE-M16: Spoke "${spoke.id}" declares no canonical origin, so no hostname ` +
            "could ever select it in a multi-Spoke Installation. Author its `site.url` (the origin its " +
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

/** The entry with this identity OR this runtime segment, or `null` — the internal route's ONE lookup. */
export function routingEntryFor(
  routing: InstallationHostRouting,
  key: string,
): SpokeHostRoutingEntry | null {
  return routing.spokes.find((spoke) => spoke.id === key || spoke.runtimeSegment === key) ?? null;
}

/**
 * WHICH SPOKE ANSWERS A REQUEST HOST, or `null`.
 *
 * The decision is the accepted domain one — exact normalized equality over the claims the build derived —
 * reached through `resolveSpokeFromHost` over a Spoke-Hub-shaped projection (`SpokeHub`) of THIS description,
 * so the request
 * boundary and the configuration layer cannot disagree about what "this Spoke claims this host" means.
 * There is no wildcard, no suffix rule, no implicit subdomain and no default Spoke.
 *
 * The build's OWN inspection policy is passed straight through (M20 §26): an authored claim is tested
 * first, so it always wins, and a hostname recognised only as an inspection hostname resolves to the Spoke
 * the Installation explicitly nominated. A build with no policy behaves exactly as before.
 */
export function spokeSelectionForHost(
  routing: InstallationHostRouting,
  host: string | null | undefined,
): SpokeSelection | null {
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
