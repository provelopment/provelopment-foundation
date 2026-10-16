/**
 * THE INSTALLATION'S HOSTNAME ROUTING TABLE (FOUNDATION-MULTISITE-M16)
 * ==================================================================
 *
 * ONE question, answered from ONE input, for the ONE consumer that may not read a configuration:
 *
 *     hostRoutingForInstallation(root)  ->  { mode, spokes: [ { id, segment, canonicalOrigin } ] }
 *
 * WHY IT EXISTS
 * -------------
 * Hostname dispatch happens at the REQUEST boundary, and that boundary must not parse `site.config.json`,
 * discover a Spoke root or re-implement an identity rule. It therefore consumes an IMMUTABLE routing
 * description the BUILD resolved from the accepted authorities and inlined — exactly the way the build
 * already inlines the selected configuration (`./deployment-build.mjs`) — and this module is the ONE place
 * that description is produced.
 *
 * WHAT IT MAY CONTAIN, AND WHAT IT DELIBERATELY DOES NOT
 * ------------------------------------------------------
 *   id                the Spoke's identity, exactly as the manifest declares it
 *   segment           `runtimeSegmentForSpokeId(id)` — the internal route namespace token
 *   canonicalOrigin   that Spoke's own authored `site.url` — the ONE origin its claims derive from
 *   inspection        the EXPLICIT inspection policy (M20 §29): the Spoke that represents this
 *                     Installation on an accepted hosting-platform inspection hostname, plus the
 *                     hostnames the PLATFORM ITSELF reports for this deployment
 *
 * It carries NO page content, NO dictionaries, NO filesystem path, NO Site or locale negotiation data and
 * NO duplicated `SiteConfig`: the request boundary needs to know WHICH Spoke answers a host and nothing
 * else, because Site/locale completion happens INSIDE the selected Spoke, where its fully resolved
 * configuration is already available. Reading a single JSON field (`site.url`) to name an origin is not a
 * second configuration authority: the runtime index still parses and validates every configuration, and a
 * configuration whose origin is missing or unusable is refused HERE, loudly, rather than guessed at.
 *
 * PLAIN ESM ON PURPOSE: the build seam (`./deployment-build.mjs` ← `next.config.ts`) runs under plain Node
 * and must not depend on a TypeScript compiler; the declaration and identity rules are not restated here
 * (they come from `./spoke-declarations.mjs` / the pure domain), so this module only composes them.
 *
 * SERVER/BUILD ONLY: it reads the filesystem.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { IMPLICIT_SPOKE_ID } from "../core/spoke/spoke-id.mjs";
import { hostnameFromOrigin, normalizeHostname } from "../core/spoke/hostname.mjs";

import {
  resolveSpokeDeclarations,
  SPOKE_CONFIG_FILE_NAME,
  switcherDestination,
} from "./spoke-declarations.mjs";
import {
  runtimeSegmentForIdentifiedSpokeRef,
  runtimeSegmentForSpokeId,
} from "./spoke-runtime-segment.mjs";

/**
 * How many Spokes a build serves, and WHICH RULE decides: the ONE-Spoke compatibility runtime, hostname
 * dispatch, or hostname dispatch for an Installation authored with identified Spoke Hubs.
 *
 *   single      a legacy/flat Installation declaring exactly ONE Spoke: that Spoke answers every host
 *   multi       a flat Installation declaring SEVERAL Spokes: exact hostname dispatch
 *   identified  an Installation AUTHORED with `spokeHubs`: exact hostname dispatch ALWAYS, even when the
 *               whole Installation contains one Hub and one Spoke (the permissive `single` rule belongs to
 *               the legacy/flat form alone, and an identified collection never takes it)
 *
 * @typedef {"single" | "multi" | "identified"} HostRoutingMode
 */

/**
 * ONE Spoke's request-routing identity.
 * @typedef {object} SpokeHostRoutingEntry
 * @property {string} id the Spoke's authored identity
 * @property {string} segment its runtime segment (`runtimeSegmentForSpokeId`) — or, for an identified
 *   Installation, the COMPOSITE `runtimeSegmentForIdentifiedSpokeRef`
 * @property {string} canonicalOrigin the authored absolute origin its hostname claims derive from
 * @property {string[]} hostAliases the exact ADDITIONAL hostnames this Spoke answers for — routing claims
 *   only, never a second canonical origin (WEB-1 owner requirement 6)
 * @property {string} [spokeHubId] the OWNING Spoke Hub, present ONLY for an Installation authored with
 *   `spokeHubs` — so `(spokeHubId, id)` names this entry and `id` alone may name another Hub's Spoke
 */

/**
 * The Installation's immutable routing description.
 *
 * Its `inspection` block is the ONLY place the three classes of hostname stay distinguishable, because
 * they are decided by three different rules and only one of them is authored material:
 *
 *   authored Spoke hostnames   a Spoke's own `site.url` (in `spokes`, above) — tested FIRST, so nothing
 *                              here can ever take a real Spoke's own hostname away from it;
 *   `platformHostnames`       what the HOSTING PLATFORM reported for THIS build (Vercel's deployment,
 *                              branch and production values) — different in every deployment and short
 *                              lived;
 *   `authoredHostnames`       the deployment-owned aliases the Installation declares — permanent,
 *                              first-party hosts that no Spoke owns publicly.
 *
 * `hostnames` is their UNION, deduplicated in that order: the one list the request boundary matches a
 * request host against, exactly.
 *
 * `spokeSwitcher` is the FLAT Installation's authored HUB-SCOPED SPOKE SWITCHER (R1): the ordered options a
 * visitor may travel between, each already PROVED to route back to the member it names. A flat Installation
 * is ONE Hub and its DECLARED Spokes are its members, so this list can never contain anything else, and no
 * organization registry participates. It is `null` when the Installation authors none, so a build that
 * declares no switcher is byte-identical to before.
 *
 * `spokeHubSwitchers` is the IDENTIFIED form's answer to the same requirement (`FOUNDATION-ID-M3-P3`): ONE
 * list per Hub, each proved against that Hub's OWN members, in authored order — and absent entirely for a
 * flat/legacy Installation, whose single implicit Hub is what `spokeSwitcher` above already describes.
 *
 * @typedef {object} InstallationHostRouting
 * @property {HostRoutingMode} mode
 * @property {SpokeHostRoutingEntry[]} spokes
 * @property {InstallationHostRoutingInspection | null} inspection
 * @property {{ options: { spokeId: string, label: string, href: string }[] } | null} spokeSwitcher
 * @property {{ spokeHubId: string, options: { spokeId: string, label: string, href: string }[] }[]} [spokeHubSwitchers]
 */

/**
 * The Installation's explicit inspection policy as the build resolved it, or `null`.
 *
 * @typedef {object} InstallationHostRoutingInspection
 * @property {string} spokeId the Spoke the collection nominates for inspection hostnames
 * @property {string} [spokeHubId] the OWNING Spoke Hub of that Spoke, present ONLY for an Installation
 *   authored with `spokeHubs` — where a local id alone could name a Spoke in either Hub
 * @property {string[]} hostnames platform-reported ∪ authored aliases, deduplicated — what is matched
 * @property {string[]} platformHostnames the hostnames the platform reported for THIS build
 * @property {string[]} authoredHostnames the deployment-owned aliases the Installation declared
 */

/**
 * @typedef {object} InstallationHostRoutingInspection
 * @property {string} spokeId the declared inspection Spoke (`inspectionSpoke` in the collection)
 * @property {string[]} hostnames the hostnames the HOSTING PLATFORM reports for this deployment
 */

/**
 * THE HOSTING PLATFORM'S OWN INSPECTION HOSTNAMES (M20 §20–§23), READ — NEVER INVENTED.
 *
 * The platform supplies these for the deployment it is BUILDING, so this build can recognise the
 * addresses the platform itself publishes for it:
 *
 *   VERCEL_URL                     this deployment's own unique URL
 *   VERCEL_BRANCH_URL              the branch URL that always points at the branch's latest deployment
 *   VERCEL_PROJECT_PRODUCTION_URL  the project's production URL
 *
 * WHY THIS IS SAFE, AND WHY THERE IS NO WILDCARD
 * ----------------------------------------------
 *   · every value is IMMUTABLE provider data for the build in progress — no Vercel API is called, at
 *     build time or at request time, and no provider setting is read or written;
 *   · recognition is EXACT equality against those values, so `*.vercel.app` is NOT accepted: an
 *     unrelated project's Vercel URL is a hostname this build was never told about;
 *   · the values are published VERBATIM and normalized at the request boundary by the ONE pure
 *     `origin → hostname` step, so no second hostname rule is declared here.
 *
 * A build with none of them set (a local build, a unit test) recognises no inspection hostname at all,
 * which is why the policy is inert locally and precise on the platform.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function inspectionHostnamesFromPlatform(env) {
  /** @type {string[]} */
  const hostnames = [];
  for (const name of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const value = env[name];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "" || hostnames.includes(trimmed)) continue;
    hostnames.push(trimmed);
  }
  return hostnames;
}

/**
 * ONE Spoke root's authored canonical origin, or `""` when it authors none.
 *
 * A Spoke that declares no `site.url` has NO canonical hostname, and that is a meaningful state rather than a
 * broken file: a ONE-Spoke Installation never consults a hostname (its Spoke answers every host), so such an
 * Installation still runs. A MULTI-Spoke Installation, by contrast, cannot route a Spoke that claims no host,
 * and the runtime authority (`./spoke-routing`) is where that is refused — loudly and with the Spoke named.
 *
 * A configuration that is UNREADABLE (or not JSON) is always a loud failure: it is a defect, not a choice.
 *
 * @param {string} spokeRoot the resolved absolute Spoke root
 * @param {string} where the identity to name in a failure
 * @returns {string} the authored `site.url`, or `""`
 */
function canonicalOriginFor(spokeRoot, where) {
  const file = path.join(spokeRoot, SPOKE_CONFIG_FILE_NAME);

  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-M16: ${where}: "${file}" is not readable JSON, so no hostname routing ` +
        `description can be produced: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const origin =
    raw !== null && typeof raw === "object"
      ? /** @type {{ site?: { url?: unknown } }} */ (raw).site?.url
      : undefined;

  return typeof origin === "string" && origin.trim() !== "" ? origin : "";
}

/**
 * The routing description of ONE Installation root, in authored manifest order.
 *
 * `single` is the accepted ONE-Spoke runtime (legacy implicit, or an explicit manifest declaring exactly
 * one Spoke): the sole entry is the Spoke that answers, so no inspection policy is consulted or needed.
 * `multi` is hostname dispatch — and there is no "first" entry to fall back to, because a request that
 * claims no hostname answers NOTHING.
 *
 * THE INSPECTION POLICY (M20 §20–§41, M22 correction). An Installation may be reached through hosts that
 * no Spoke owns publicly, and they come from TWO sources — the hosting platform's own deployment/branch
 * URL, which the platform reports to the build (`inspectionHostnamesFromPlatform`), and the
 * deployment-owned ALIASES the Installation declares in its manifest (`inspectionHosts`, the permanent
 * project alias a provider keeps for this project, for instance). Every such hostname selects the Spoke
 * the manifest EXPLICITLY nominates (`inspectionSpoke`) — never the first declared one, never a wildcard,
 * never a provider-wide rule. Three consequences are enforced HERE, at build time, because all three are
 * configuration defects rather than request-time surprises:
 *
 *   · platform-reported inspection hostnames WITHOUT a declared policy → LOUD failure: nothing would say
 *     which Spoke an operator is inspecting, and choosing one would be exactly the implicit default this
 *     platform refuses;
 *   · a policy naming a Spoke that is not declared → refused by `resolveSpokeDeclarations`, which knows
 *     the declared set — and so is an authored alias list with no nominated Spoke, which could only ever
 *     be a silent no-op;
 *   · an authored alias that restates a Spoke's OWN hostname → refused here, because an authored claim
 *     always wins and the alias would quietly mean nothing while reading as if it meant something.
 *
 * @param {string} installationRoot the Installation root the build selected
 * @returns {InstallationHostRouting}
 */
export function hostRoutingForInstallation(installationRoot) {
  const resolved = resolveSpokeDeclarations(installationRoot);

  // ONE WORKING LIST, TWO AUTHORING FORMS — and ONE set of claim rules over it.
  //
  // Every rule below ("an additional claim needs a canonical origin", "no hostname routes to two Spokes",
  // "an alias may never restate a Spoke's own hostname", "an alias may never collide with an inspection
  // hostname of another Spoke") is stated ONCE and applied to whichever form produced this list. The rules
  // are identical because they are about HOSTNAMES, not about authoring: an Installation answers one host
  // with exactly one Spoke however its Spokes were written down. What changes between the forms is only the
  // VOCABULARY — a flat Spoke is named by its id, an identified one by its Hub AND its id — and that lives
  // in `subject` (the readable name a diagnostic uses) and `key` (the unique handle the rules compare).
  //
  // `key` is the runtime SEGMENT: injective over `(spokeHubId, id)` by construction
  // (`./spoke-runtime-segment`), equal to the id's encoding for a flat Spoke, and the COMPOSITE encoding for
  // an identified one — so two Hubs' Spokes called `docs` are two different keys and no collision rule can
  // confuse them.
  /** @type {{ key: string, subject: string, id: string, spokeHubId?: string, root: string, hostAliases: string[] }[]} */
  const entries =
    resolved.mode === "legacy"
      ? [
          {
            key: runtimeSegmentForSpokeId(IMPLICIT_SPOKE_ID),
            subject: `Spoke "${IMPLICIT_SPOKE_ID}"`,
            id: IMPLICIT_SPOKE_ID,
            root: resolved.installationRoot ?? installationRoot,
            hostAliases: [],
          },
        ]
      : resolved.mode === "hubs"
        ? resolved.hubs.flatMap((hub) =>
            hub.spokes.map((spoke) => ({
              key: runtimeSegmentForIdentifiedSpokeRef({
                spokeHubId: spoke.spokeHubId,
                spokeId: spoke.id,
              }),
              subject: `Spoke Hub "${spoke.spokeHubId}" > Spoke "${spoke.id}"`,
              id: spoke.id,
              spokeHubId: spoke.spokeHubId,
              root: spoke.root,
              hostAliases: spoke.hostAliases ?? [],
            })),
          )
        : resolved.declarations.map((declaration) => ({
            key: runtimeSegmentForSpokeId(declaration.id),
            subject: `Spoke "${declaration.id}"`,
            id: declaration.id,
            root: declaration.root,
            hostAliases: declaration.hostAliases ?? [],
          }));

  // A SPOKE WITH NO CANONICAL ORIGIN CANNOT BE DISPATCHED TO — and in an IDENTIFIED collection that is true
  // even for a collection of ONE, because this form always dispatches by hostname (§6): there is no
  // permissive single-Spoke path to fall back to, so a member without an origin would simply be unreachable.
  if (resolved.mode === "hubs") {
    for (const entry of entries) {
      if (canonicalOriginFor(entry.root, entry.subject) === "") {
        throw new Error(
          `FOUNDATION-ID-M3-P3: ${entry.subject} declares no canonical origin, but an Installation authored ` +
            "with identified Spoke Hubs always dispatches by EXACT hostname — even when it declares one " +
            "Hub and one Spoke. Author each member's `site.url` (the origin its hostname claim derives " +
            "from); there is no permissive fallback in this form.",
        );
      }
    }
  }

  /** @type {{ key: string, subject: string, id: string, spokeHubId?: string, segment: string, canonicalOrigin: string, hostAliases: string[] }[]} */
  const spokes = entries.map((entry) => ({
    ...entry,
    segment: entry.key,
    canonicalOrigin: canonicalOriginFor(entry.root, entry.subject),
    // NORMALIZED through the ONE pure step — the same one the request boundary applies — so the artifact
    // can never carry a claim the runtime would spell differently (the declaration seam already refused a
    // value that is not spelled the normalized way; this keeps that invariant structural).
    hostAliases: entry.hostAliases.map((alias) => normalizeHostname(alias) ?? alias),
  }));

  // THE MODE IS THE AUTHORING FORM's, AND IT IS THE ROUTING RULE.
  //
  //   single      a LEGACY/FLAT Installation declaring exactly ONE Spoke: that Spoke answers every host
  //               (the accepted one-Spoke compatibility behaviour, §6)
  //   multi       a FLAT Installation declaring SEVERAL Spokes: exact hostname dispatch
  //   identified  an Installation AUTHORED with identified Spoke Hubs: exact hostname dispatch ALWAYS
  //
  // `identified` makes the distinction STRUCTURAL rather than something a consumer must infer: an identified
  // collection with ONE Hub and ONE Spoke is `identified`, so the proxy, the request boundary and the
  // compatibility accessors cannot mistake it for the permissive single-Spoke case.
  const mode = resolved.mode === "hubs" ? "identified" : spokes.length > 1 ? "multi" : "single";
  const platformHostnames = inspectionHostnamesFromPlatform(process.env);
  const authoredHostnames = resolved.inspectionHosts;

  // THE INSPECTION NOMINATION, in ONE spelling: the KEY of the nominated Spoke, plus the label a diagnostic
  // uses for it. A flat Installation nominates a local id; an identified one nominates BOTH halves.
  const nomination = resolved.inspectionSpoke;
  const nominatedKey =
    nomination === null
      ? null
      : nomination.spokeHubId === undefined
        ? runtimeSegmentForSpokeId(nomination)
        : runtimeSegmentForIdentifiedSpokeRef({
            spokeHubId: nomination.spokeHubId,
            spokeId: nomination.spokeId,
          });
  const nominatedSubject =
    nomination === null
      ? null
      : nomination.spokeHubId === undefined
        ? `Spoke "${nomination}"`
        : `Spoke Hub "${nomination.spokeHubId}" > Spoke "${nomination.spokeId}"`;

  if (mode !== "single" && platformHostnames.length > 0 && nomination === null) {
    throw new Error(
      mode === "identified"
        ? "FOUNDATION-ID-M3-P3: this Installation identifies its Spoke Hubs and is being built on a " +
            `hosting platform that reports its own inspection hostnames (${platformHostnames.join(", ")}), ` +
            'but the collection declares no "inspectionSpoke". State which member represents this ' +
            'Installation there, as { "spokeHubId": "…", "spokeId": "…" } — there is no default Hub and no ' +
            "default Spoke, and no member is ever chosen by authored order."
        : "FOUNDATION-MULTISITE-M20: this multi-Spoke Installation is being built on a hosting platform " +
            `that reports its own inspection hostnames (${platformHostnames.join(", ")}), but the ` +
            'collection declares no "inspectionSpoke". State which Spoke represents this Installation on ' +
            "such a hostname — there is no default, and no Spoke is ever chosen by manifest order.",
    );
  }

  /** EVERY Spoke's canonical hostname, by KEY — the origin its canonical metadata is built from. */
  const canonicalHostnames = new Map(
    spokes.map((spoke) => [spoke.key, hostnameFromOrigin(spoke.canonicalOrigin)]),
  );

  // AN ADDITIONAL CLAIM PRESUPPOSES A CANONICAL ORIGIN. `hostAliases` are claims IN ADDITION to a Spoke's
  // canonical hostname, and the canonical origin is what every canonical URL, sitemap entry and social card
  // is built from — so a Spoke that authors aliases but no usable `site.url` could be reached at a hostname
  // while having no canonical identity to render there. That is refused rather than half-honoured.
  for (const spoke of spokes) {
    if (spoke.hostAliases.length > 0 && canonicalHostnames.get(spoke.key) === null) {
      throw new Error(
        `FOUNDATION-MULTISITE-M23: ${spoke.subject} declares ${spoke.hostAliases.length} additional ` +
          "hostname claim(s) but no usable canonical origin: its `site.url` yields no hostname. An " +
          "additional claim is a route IN ADDITION to the canonical one, and the canonical origin is what " +
          "canonical metadata is built from — author the Spoke's `site.url`, or remove the claims.",
      );
    }
  }

  // NO HOSTNAME MAY ROUTE TO TWO SPOKES (WEB-1 owner requirement 6). An additional claim is authored
  // ABOUT ONE SPOKE, so a collision is a configuration defect rather than a harmless duplicate — and it is
  // refused HERE, at build time, because at request time an ambiguous hostname would be settled silently by
  // declaration order:
  //
  //   · an alias that restates ANOTHER Spoke's canonical hostname (the canonical claim always wins, so the
  //     alias would quietly mean nothing while reading as if it meant something);
  //   · an alias that restates its OWN Spoke's canonical hostname (a claim the Spoke already makes);
  //   · the same alias claimed by two Spokes.
  //
  // A duplicate WITHIN one Spoke's list is refused by the declaration seam (`./spoke-declarations.mjs`),
  // where the Spoke it belongs to is named in the diagnostic.
  /** @type {Map<string, string>} */
  const claimedBy = new Map();
  for (const spoke of spokes) {
    const canonical = canonicalHostnames.get(spoke.key);
    for (const alias of spoke.hostAliases) {
      const canonicalOwner = spokes.find(
        (other) => other.key !== spoke.key && canonicalHostnames.get(other.key) === alias,
      );
      if (canonicalOwner !== undefined) {
        throw new Error(
          `FOUNDATION-MULTISITE-M23: the additional hostname claim "${alias}" of ${spoke.subject} is ` +
            `already the CANONICAL hostname of ${canonicalOwner.subject}. A canonical hostname always ` +
            "selects its own Spoke, so an additional claim may never restate or shadow one — author a " +
            "hostname no Spoke answers for canonically.",
        );
      }
      if (canonical === alias) {
        throw new Error(
          `FOUNDATION-MULTISITE-M23: ${spoke.subject} states its own canonical hostname "${alias}" as ` +
            "an additional claim as well. The canonical hostname is already claimed; remove the duplicate.",
        );
      }
      const previous = claimedBy.get(alias);
      if (previous !== undefined) {
        throw new Error(
          `FOUNDATION-MULTISITE-M23: the additional hostname claim "${alias}" is declared by BOTH ` +
            `${previous} and ${spoke.subject}. A hostname may never route to two Spokes — remove one.`,
        );
      }
      claimedBy.set(alias, spoke.subject);
    }
  }

  // AN AUTHORED ALIAS MAY NEVER RESTATE A SPOKE'S OWN HOSTNAME (M22 correction). The request boundary
  // already tests authored claims FIRST, so an alias can never actually take a Spoke's hostname away from
  // it — which is exactly why declaring one is a configuration defect rather than a harmless duplicate:
  // the alias would silently do nothing while reading as if it did something. The comparison uses the ONE
  // `origin → hostname` rule (`../core/spoke/hostname.mjs`), the same rule the request boundary applies,
  // so the build cannot accept an alias the runtime would resolve differently.
  for (const alias of authoredHostnames) {
    const owner = spokes.find((spoke) => hostnameFromOrigin(spoke.canonicalOrigin) === alias);
    if (owner !== undefined) {
      throw new Error(
        `FOUNDATION-MULTISITE-M22: the inspection alias "${alias}" is already the authored hostname of ` +
          `${owner.subject}. A Spoke's own hostname always selects that Spoke, so an inspection alias ` +
          "may never restate or shadow one — remove the alias, or declare a hostname that Spoke does not " +
          "already answer for.",
      );
    }
  }

  // THE ONE LIST THE BOUNDARY MATCHES: platform-reported first, then the authored aliases, deduplicated —
  // a provider value that happens to equal an authored alias (the project's production URL, say) is ONE
  // hostname, and order is deterministic either way.
  /** @type {string[]} */
  const hostnames = [];
  for (const value of [...platformHostnames, ...authoredHostnames]) {
    if (!hostnames.includes(value)) hostnames.push(value);
  }

  // AN ADDITIONAL CLAIM MAY NEVER COLLIDE WITH AN INSPECTION HOSTNAME OF ANOTHER SPOKE (WEB-1 requirement 6,
  // §24). Inspection hostnames and per-Spoke claims are deliberately SEPARATE namespaces — one names hosts no
  // Spoke owns publicly, the other names hosts a Spoke owns IN ADDITION to its canonical one — so a hostname
  // appearing in both would make one host mean two things depending on which rule was applied first. A claim
  // that coincides with an inspection hostname of the SAME Spoke is left alone: it routes to that Spoke
  // either way, so the answer stays unambiguous and deterministic (authored claims are tested first).
  if (nominatedKey !== null) {
    for (const spoke of spokes) {
      // A CLAIM THAT COINCIDES WITH AN INSPECTION HOSTNAME OF THE SAME SPOKE IS LEFT ALONE: it routes to
      // that Spoke either way. The comparison is by KEY, so in an identified Installation "the same Spoke"
      // means the same `(spokeHubId, spokeId)` — never a local id that another Hub also declares.
      if (spoke.key === nominatedKey) continue;
      for (const alias of spoke.hostAliases) {
        if (hostnames.includes(alias)) {
          throw new Error(
            `FOUNDATION-MULTISITE-M23: the additional hostname claim "${alias}" of ${spoke.subject} is ` +
              `also an INSPECTION hostname of this Installation, which selects ${nominatedSubject}. One ` +
              "hostname may never route to two Spokes — remove the claim or the inspection alias.",
          );
        }
      }
    }
  }

  // THE HUB-SCOPED SWITCHER'S DESTINATIONS, PROVED ROUTABLE (R1, §7). An option is only meaningful when the
  // Installation itself would send that hostname to the MEMBER the option names — so the build answers that
  // question with the SAME decision the request boundary makes (authored claims first, then the inspection
  // policy) and refuses an option that would land somewhere else, or nowhere. THIS IS THE HUB MEMBERSHIP
  // BOUNDARY MECHANICALLY ENFORCED: a Hub's declared Spokes are its members, and an unrelated organization's
  // hostname is refused here because it is not a routing claim of the member the option names (no
  // organization registry, no hostname-suffix rule, no second registry is consulted or needed).
  //
  // The SAME rule serves BOTH forms: a flat Installation has ONE implicit Hub whose members are its declared
  // Spokes (`resolved.spokeSwitcher`), while an identified one has one list PER Hub
  // (`spokeHubs[].spokeSwitcher`), each proved against ITS OWN members' keys.
  /** @type {Map<string, string>} */
  const claimOwnerKey = new Map();
  /** @type {Map<string, string>} */
  const subjectByKey = new Map();
  for (const spoke of spokes) {
    subjectByKey.set(spoke.key, spoke.subject);
    const canonical = canonicalHostnames.get(spoke.key);
    if (canonical !== undefined && canonical !== null) claimOwnerKey.set(canonical, spoke.key);
    for (const alias of spoke.hostAliases) claimOwnerKey.set(alias, spoke.key);
  }

  /**
   * ONE authored switcher, proved routable against the members it offers — or an itemised refusal.
   *
   * @param {{ options: { spokeId: string, label: string, href: string }[] }} authored the authored switcher
   * @param {Map<string, string>} keyBySpokeId each OFFERABLE member's local id → its routing KEY
   * @param {string} where how this switcher is named in a diagnostic
   * @returns {{ options: { spokeId: string, label: string, href: string }[] }}
   */
  const provedSwitcherOptions = (authored, keyBySpokeId, where) => {
    /** @type {{ spokeId: string, label: string, href: string }[]} */
    const options = [];
    for (const [index, option] of authored.options.entries()) {
      const destination = switcherDestination(option.href);
      if (destination === null) {
        throw new Error(
          `FOUNDATION-MULTISITE-M23: ${where}[${index}] ("${option.label}") carries ` +
            `"${option.href}", which is not an absolute HTTPS origin.`,
        );
      }
      const optionKey = keyBySpokeId.get(option.spokeId) ?? null;
      const ownerKey =
        claimOwnerKey.get(destination.hostname) ??
        (hostnames.includes(destination.hostname) ? nominatedKey : null);
      if (ownerKey !== optionKey || optionKey === null) {
        throw new Error(
          `FOUNDATION-MULTISITE-M23: ${where}[${index}] ("${option.label}") names Spoke ` +
            `"${option.spokeId}", but its destination "${option.href}" would not route there: the ` +
            `hostname "${destination.hostname}" is ` +
            (ownerKey === null
              ? "claimed by no Spoke and is not an accepted inspection hostname of this Installation, so " +
                "a request for it would be REFUSED"
              : `claimed by ${subjectByKey.get(ownerKey) ?? ownerKey}`) +
            ". A Hub-scoped switcher option may only offer a destination this Installation routes to the " +
            "MEMBER it names — that member's canonical origin, one of its additional claims, or an inspection " +
            "hostname the policy nominates for it. An unrelated organization's site belongs to a DIFFERENT " +
            "Hub/Installation and can never be offered here.",
        );
      }
      options.push({ spokeId: option.spokeId, label: option.label, href: option.href });
    }
    // ORDER IS AUTHORED DATA: preserved exactly as written, never sorted, never derived from the manifest.
    return { options };
  };

  // THE FLAT FORM: ONE implicit Hub, and its declared Spokes are its members.
  /** @type {Map<string, string>} */
  const flatMemberKeys = new Map(spokes.map((spoke) => [spoke.id, spoke.key]));
  const spokeSwitcher =
    resolved.mode === "hubs"
      ? null
      : resolved.spokeSwitcher === null
        ? null
        : provedSwitcherOptions(resolved.spokeSwitcher, flatMemberKeys, "spokeSwitcher.options");

  // THE IDENTIFIED FORM: ONE SWITCHER PER HUB, each proved against ITS OWN members — so a Hub's list can
  // only ever offer Spokes its own Hub declares, and a local id that another Hub also declares is offered
  // under the key of the member THIS Hub owns (never the other Hub's Spoke).
  const spokeHubSwitchers =
    resolved.mode === "hubs"
      ? resolved.hubs
          .filter((hub) => hub.spokeSwitcher !== null)
          .map((hub) => ({
            spokeHubId: hub.id,
            options: provedSwitcherOptions(
              hub.spokeSwitcher,
              new Map(
                hub.spokes.map((spoke) => [
                  spoke.id,
                  runtimeSegmentForIdentifiedSpokeRef({
                    spokeHubId: hub.id,
                    spokeId: spoke.id,
                  }),
                ]),
              ),
              `spokeHubs["${hub.id}"].spokeSwitcher.options`,
            ).options,
          }))
      : undefined;

  return {
    mode,
    // THE PUBLISHED ENTRIES carry exactly the routing facts the request boundary needs: identity, segment and
    // claims — plus the owning Hub, and ONLY for an identified Installation, so a flat/legacy description
    // keeps exactly the keys it always had.
    spokes: spokes.map((spoke) =>
      spoke.spokeHubId === undefined
        ? {
            id: spoke.id,
            segment: spoke.segment,
            canonicalOrigin: spoke.canonicalOrigin,
            hostAliases: spoke.hostAliases,
          }
        : {
            id: spoke.id,
            segment: spoke.segment,
            canonicalOrigin: spoke.canonicalOrigin,
            hostAliases: spoke.hostAliases,
            spokeHubId: spoke.spokeHubId,
          },
    ),
    inspection:
      nomination === null
        ? null
        : nomination.spokeHubId === undefined
          ? // A FLAT nomination is the Spoke's local id, exactly as it always was.
            { spokeId: nomination, hostnames, platformHostnames, authoredHostnames }
          : // AN IDENTIFIED nomination is COMPOSITE: both halves travel, so the runtime never has to guess.
            {
              spokeHubId: nomination.spokeHubId,
              spokeId: nomination.spokeId,
              hostnames,
              platformHostnames,
              authoredHostnames,
            },
    spokeSwitcher,
    // Present ONLY for an identified Installation — Phase 2's reader treats an absent key as "this build
    // publishes no per-Hub switchers", which is exactly what every flat/legacy build means.
    ...(spokeHubSwitchers === undefined ? {} : { spokeHubSwitchers }),
  };
}
