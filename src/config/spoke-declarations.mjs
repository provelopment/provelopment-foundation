/**
 * THE INSTALLATION'S DECLARED SPOKE ROOTS — ONE AUTHORITY (FOUNDATION-MULTISITE-S3E1C/S3F1)
 * =======================================================================================
 *
 * ONE question, answered once for every consumer that must answer it:
 *
 *     given an Installation root, which Spokes does it declare, and where is each one authored?
 *
 * An Installation declares its Spokes in ONE authored manifest at its own root:
 *
 *     <InstallationRoot>/spokes.json     { "spokes": [ { "id": "…", "root": "spokes/…" } ] }
 *     <InstallationRoot>/spokes/…        the declared Spoke roots (the DEDICATED namespace)
 *
 * LEGACY IS THE ABSENCE OF A MANIFEST
 * -----------------------------------
 *
 *   no `spokes.json`       LEGACY IMPLICIT: the Installation root IS the implicit Spoke root, and its
 *                          single Spoke carries the reserved `IMPLICIT_SPOKE_ID`.
 *   `spokes.json` present  EXPLICIT: the manifest's entries (1..*) are the Installation's Spokes.
 *   BOTH authored          REFUSED — never a precedence rule, never a silent migration.
 *   NEITHER authored       REFUSED — an Installation root must be authored one way.
 *
 * WHY THIS MODULE IS PLAIN ESM, AND WHY IT EXISTS AT ALL
 * ------------------------------------------------------
 * The TypeScript authority (`./spoke-roots.ts`) and the BUILD selection seam
 * (`./deployment-build.mjs`) must agree about which authored roots exist — a build that selected a root the
 * configuration/domain layer would refuse could serve material the platform considers invalid. TypeScript
 * cannot be executed by the plain-Node seam, so the CONTRACT lives here in ONE implementation that both
 * consume, rather than in two that drift. This is the smallest such seam: declaration parsing, the identity
 * rules (shared with the domain, `../core/spoke/spoke-id.mjs`), the locator rules, and physical root
 * containment. It composes no Spoke, builds no Hub, resolves no Site, and knows nothing about hostnames,
 * Sites, dictionaries, pages, assets or runtime namespaces.
 *
 * IDENTITY SEMANTICS ARE NOT RESTATED HERE
 * ----------------------------------------
 * Non-blank ids, the reserved implicit identities and duplicate ids come from the pure domain modules this
 * one imports — `../core/spoke/spoke-id.mjs` for a Spoke id and `../core/spoke/spoke-hub-id.mjs` for a
 * Spoke Hub id — so the configuration layer, the build seam and the domain cannot disagree about what an
 * acceptable id is.
 *
 * TWO AUTHORING FORMS, ONE RESOLUTION (FOUNDATION-ID-M3-P1/P3)
 * -----------------------------------------------------------
 * The flat `spokes` form and the nested `spokeHubs` form — an Installation's IDENTIFIED SPOKE HUB
 * collection, each Hub carrying its identity and explicitly containing its Spokes — are BOTH resolved here,
 * by this ONE seam, and an Installation is authored exactly one way (never both, never by precedence).
 * `resolveSpokeDeclarations` returns ONE of three shapes:
 *
 *   mode "legacy"     no manifest: the root is the implicit Spoke
 *   mode "explicit"   a flat `spokes` manifest: `declarations`, in authored order — exactly as before
 *   mode "hubs"       a nested `spokeHubs` manifest: `hubs`, each carrying its identity, its resolved
 *                     Spokes (each of which names its owning Hub) and its own Hub-scoped switcher
 *
 * The nested form is NEVER FLATTENED into an unqualified list: a nested answer carries `hubs`, so a
 * consumer that needs one Spoke's owning Hub cannot lose it, and there is no Installation-wide Spoke list
 * in that mode to mistake for one. The flat form keeps its exact meaning, code path and diagnostics.
 * The STRUCTURE of each form is recognised by its own schema (`installationSpokeCollectionSchema`,
 * `installationSpokeHubCollectionSchema`) — recognisers that resolve nothing and run nothing — while
 * `resolveSpokeDeclarations` remains the ONE decision every consumer makes.
 *
 * SERVER/BUILD ONLY: this module reads the filesystem.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { IMPLICIT_SPOKE_ID, spokeCollectionIssues } from "../core/spoke/spoke-id.mjs";
import { spokeHubCollectionIssues } from "../core/spoke/spoke-hub-id.mjs";
import { normalizeHostname } from "../core/spoke/hostname.mjs";

/** The authored manifest an Installation may carry at its own root. */
export const INSTALLATION_SPOKE_COLLECTION_FILE_NAME = "spokes.json";

/**
 * THE NESTED AUTHORING FORM'S ONE LEAF (FOUNDATION-ID-M3-P1): `spokeHubs`, an Installation's IDENTIFIED
 * Spoke Hub collection, each Hub carrying its identity and explicitly containing its Spokes.
 *
 * It is MUTUALLY EXCLUSIVE with the flat `spokes` form — an Installation is authored one way or the other,
 * never both, and never by precedence.
 */
export const INSTALLATION_SPOKE_HUB_COLLECTION_LEAF = "spokeHubs";

/**
 * The DEDICATED NAMESPACE every explicitly declared Spoke root lives in: `<InstallationRoot>/spokes/`.
 *
 * An architectural OWNERSHIP boundary, not a suggested directory name: a manifest locator must be spelled
 * beneath it AND must resolve physically beneath it, so authored website material can never be planted
 * among the Installation's configuration, content or tooling. The id stays independent of the spelling
 * (`{ "id": "foundation", "root": "spokes/foundation-web" }` is valid), and membership comes from the
 * MANIFEST alone: a directory here that no entry names is inert.
 */
export const SPOKE_ROOTS_DIRECTORY_NAME = "spokes";

/** The authored configuration file a declared Spoke root must carry (the root-level contract). */
export const SPOKE_CONFIG_FILE_NAME = "site.config.json";

/**
 * THE MANIFEST'S STRUCTURAL CONTRACT — STRICT, and exactly the leaves a declaration may author.
 *
 * FIVE kinds of leaf, and no others:
 *
 *   `spokes`           the declared Spoke roots, each an `id`, a `root` locator and — OPTIONALLY — the
 *                      exact ADDITIONAL hostnames that Spoke answers for (`hostAliases`, WEB-1 owner
 *                      requirement 6). An additional claim never changes the Spoke's canonical origin:
 *                      `site.url` stays the origin every canonical URL, sitemap entry and social card is
 *                      built from, and an alias is a ROUTING claim only.
 *   `spokeSwitcher`    OPTIONAL: THE HUB-SCOPED SPOKE SWITCHER — the ORDERED list of members of ONE Hub
 *                      (`options`, each naming a `spokeId`, the `label` they read and the absolute HTTPS
 *                      `href` they travel to).
 *
 *                      ONE INSTALLATION IS ONE HUB for organizational/navigation purposes, and every Spoke
 *                      this manifest declares is a MEMBER of that Hub. The switcher may therefore offer
 *                      ONLY declared members, and every option must lead back to the member it names —
 *                      through that member's canonical origin, one of its additional hostname claims, or an
 *                      inspection hostname this Installation's policy nominates for it.
 *
 *                      A hostname or domain SUFFIX does not determine membership: a Spoke is a member
 *                      because it is DECLARED HERE, never because it shares a name with one. An unrelated
 *                      organization's site is not switchable merely because its URL could be authored —
 *                      it belongs to another Hub/Installation, and there is no second registry to consult
 *                      (the routing check above IS the enforcement mechanism).
 *
 *                      This is navigation between Spokes — a dimension of its own, never the within-Spoke
 *                      Site selector, and never an arbitrary external link list. It is also not a
 *                      template/provisioning lineage: a site generated or updated from a centrally managed
 *                      template is still its OWN Hub/Installation unless it is declared as a member here.
 *   `inspectionSpoke`  OPTIONAL: the ONE Spoke that represents this Installation when it is
 *                      reached through an accepted hosting-platform INSPECTION hostname
 *                      (a Vercel deployment/branch URL). It is an EXPLICIT policy, never a
 *                      first-declared or manifest-order fallback — which is why it is stated
 *                      here, beside the declaration, instead of being derived from it.
 *   `inspectionHosts`  OPTIONAL: the deployment-owned INSPECTION ALIASES — exact hostnames this
 *                      Installation answers for even though no Spoke owns them as a public domain
 *                      (a hosting provider's PERMANENT project alias, for instance, which is a
 *                      first-party surface of this project but is not one of the deployment-specific
 *                      hostnames the provider reports to a build). Each one selects the Spoke the
 *                      `inspectionSpoke` policy nominates. NEVER a wildcard, a suffix or a
 *                      provider-wide rule: an unrelated project's hostname, a team hostname and a
 *                      name that merely CONTAINS ours stay unclaimed, and the request boundary
 *                      answers them with nothing.
 *
 * Identity semantics (non-blank, the reserved id, uniqueness) are NOT restated here — they belong to the
 * pure domain (`../core/spoke/spoke-id.mjs`), so configuration and the domain cannot drift apart. The
 * HOSTNAME rules are not restated either: they belong to `../core/spoke/hostname.mjs`, which this seam
 * consumes and which the request boundary consumes too. This validator does STRUCTURAL typing only,
 * exactly as the zod schema it replaces did; that the policy NAMES a declared Spoke, that the aliases
 * are exact normalized hostnames and that a policy without a nominated Spoke means nothing are semantic
 * checks the resolver makes, where the declared set and the hostname authority are at hand.
 *
 * WHY IT IS HAND-ROLLED, NOT ZOD: this seam is loaded by the platform's own Node tooling, and a
 * RELEASE must run that tooling in an installation with NO third-party packages at all
 * (`tests/integration/foundation-installation-bootstrap.test.ts` proves the self-containment). The
 * platform's runtime `zod` dependency is therefore not available to it, so the seam keeps the same
 * STRICT shape and the same message vocabulary in a few explicit checks — one implementation, no
 * package. The `{ success, data, error: { issues } }` surface is the minimal one its callers use (this
 * module's own resolver and the S3C1 acceptance suite), with `issues` shaped like a zod issue list.
 *
 * @type {{ safeParse: (raw: unknown) => { success: true, data: { spokes: { id: string, root: string, hostAliases: string[] }[], inspectionSpoke: string | null, inspectionHosts: string[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null } } |
 *   { success: false, error: { issues: { path: (string|number)[], message: string }[] } } }}
 */
export const installationSpokeCollectionSchema = {
  safeParse(raw) {
    /** @type {{ path: (string|number)[], message: string }[]} */
    const issues = [];

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        success: false,
        error: { issues: [{ path: [], message: "Invalid input: expected object" }] },
      };
    }

    // FOUNDATION-ID-M3-P1/P3 — THE NESTED FORM, REFUSED *HERE* ONLY because this is the FLAT form's schema.
    //
    // A manifest that declares `spokeHubs` never reaches the flat code path below, so the flat form's
    // diagnostics are untouched by this form's existence. The nested form has its OWN authority
    // (`resolveSpokeDeclarations` → `installationSpokeHubCollectionSchema`), and a caller that asks the FLAT
    // schema about one is told exactly which authority answers it — rather than being handed the flat form's
    // rules applied to a shape they were not written for.
    if (declaresSpokeHubCollection(raw)) {
      const nested = installationSpokeHubCollectionSchema.safeParse(raw);
      return {
        success: false,
        error: {
          issues: [
            {
              path: [INSTALLATION_SPOKE_HUB_COLLECTION_LEAF],
              message:
                'Invalid input: this manifest declares "spokeHubs" — the NESTED form, an Installation\'s ' +
                "IDENTIFIED SPOKE HUB collection — and this is the FLAT form's schema: it accepts only " +
                '"spokes". The nested form is resolved by its OWN authority ' +
                "(`installationSpokeHubCollectionSchema`, reached through `resolveSpokeDeclarations`), which " +
                "returns Hubs rather than a flattened Spoke list.",
            },
            ...spokeHubAuthoringIssues(raw, nested),
          ],
        },
      };
    }

    unrecognized(
      raw,
      ["spokes", "inspectionSpoke", "inspectionHosts", "spokeSwitcher"],
      [],
      issues,
    );
    if (!Array.isArray(raw.spokes)) {
      issues.push({ path: ["spokes"], message: "Invalid input: expected array" });
      return { success: false, error: { issues } };
    }

    // OPTIONAL, and structural only: `null` states "this Installation declares no inspection policy".
    /** @type {string | null} */
    let inspectionSpoke = null;
    if (raw.inspectionSpoke !== undefined && raw.inspectionSpoke !== null) {
      if (typeof raw.inspectionSpoke !== "string") {
        issues.push({ path: ["inspectionSpoke"], message: "Invalid input: expected string" });
      } else {
        inspectionSpoke = raw.inspectionSpoke;
      }
    }

    // OPTIONAL, and structural only — exactly like `inspectionSpoke`: the deployment-owned inspection
    // ALIASES this Installation answers for on hosts no Spoke owns publicly. WHETHER each value is an
    // exact hostname, and whether a policy with no nominated Spoke can mean anything, are semantic
    // checks the resolver makes below.
    /** @type {string[]} */
    const inspectionHosts = [];
    if (raw.inspectionHosts !== undefined && raw.inspectionHosts !== null) {
      if (!Array.isArray(raw.inspectionHosts)) {
        issues.push({ path: ["inspectionHosts"], message: "Invalid input: expected array" });
      } else {
        raw.inspectionHosts.forEach((value, index) => {
          if (typeof value !== "string") {
            issues.push({ path: ["inspectionHosts", index], message: "Invalid input: expected string" });
          } else {
            inspectionHosts.push(value);
          }
        });
      }
    }

    // OPTIONAL, and structural only — THE CROSS-SPOKE SWITCHER (WEB-1 owner requirement 1): the ORDERED
    // list of Spokes a visitor may switch BETWEEN, each naming a Spoke, the label they read and the
    // absolute origin they travel to. Order is authored data and is preserved exactly; nothing here
    // infers an order from the manifest, a directory or a filesystem listing.
    //
    // WHETHER an option's destination actually ROUTES to the Spoke it names — through that Spoke's
    // canonical hostname, one of its ADDITIONAL claims, or an inspection hostname the policy nominates —
    // is a ROUTING question, so it is decided by the build's routing authority (`./spoke-host-routing.mjs`),
    // where every claim is at hand. This seam keeps the same division it keeps everywhere: STRUCTURAL typing
    // here, semantics where the authorities are.
    /** @type {{ options: { spokeId: string, label: string, href: string }[] } | null} */
    let spokeSwitcher = null;
    if (raw.spokeSwitcher !== undefined && raw.spokeSwitcher !== null) {
      spokeSwitcher = switcherStructure(raw.spokeSwitcher, ["spokeSwitcher"], issues);
    }

    // Every entry's STRUCTURE — including the OPTIONAL `hostAliases` of the Spoke's ADDITIONAL hostname
    // claims (WEB-1 owner requirement 6) — is decided by ONE shared rule, so the flat form and the nested
    // form cannot drift into accepting different Spoke leaves.
    /** @type {{ id: string, root: string, hostAliases: string[] }[]} */
    const declared = [];
    raw.spokes.forEach((entry, index) => {
      const declaredEntry = spokeDeclarationStructure(entry, ["spokes", index], issues);
      if (declaredEntry !== null) declared.push(declaredEntry);
    });

    return issues.length > 0
      ? { success: false, error: { issues } }
      : { success: true, data: { spokes: declared, inspectionSpoke, inspectionHosts, spokeSwitcher } };
  },
};

/**
 * Whether a parsed manifest DECLARES the nested identified-Spoke-Hub form.
 *
 * THE PRESENCE OF THE KEY decides it, whatever the value: `spokeHubs: null`, `spokeHubs: []` and a
 * populated `spokeHubs` all declare the form — so an author can never be told about a *flat*-form problem
 * in a manifest they wrote in the nested form, and no manifest can slip past the activation refusal by
 * leaving the leaf empty. Nothing is inferred from a value, an order, a directory or a file name.
 *
 * @param {unknown} raw the parsed manifest
 * @returns {boolean}
 */
function declaresSpokeHubCollection(raw) {
  return (
    raw !== null &&
    typeof raw === "object" &&
    !Array.isArray(raw) &&
    raw[INSTALLATION_SPOKE_HUB_COLLECTION_LEAF] !== undefined
  );
}

/**
 * THE ONE STRICT-LEAF RULE, shared by both authoring forms: every key an authored object actually carries
 * must be a leaf its form allows. An unknown leaf is refused rather than ignored, because a leaf nobody
 * reads is a leaf nobody meant to write — and because `spokes`, `spokeHubs` and `spokeSwitcher` must never
 * be silently accepted together.
 *
 * It reports into the caller's issue list, so ONE implementation serves the flat schema, the nested schema
 * and every shared structural helper.
 *
 * @param {Record<string, unknown>} value the authored object
 * @param {readonly string[]} allowed the leaves this form allows
 * @param {(string|number)[]} at the path the object was authored at
 * @param {{ path: (string|number)[], message: string }[]} issues the issue list to report into
 */
function unrecognized(value, allowed, at, issues) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push({ path: at, message: `Unrecognized key: "${key}"` });
  }
}

/**
 * ONE authored Spoke entry's STRUCTURE — the SAME rule in BOTH authoring forms: the flat `spokes[]` list,
 * and a nested Spoke Hub's own `spokes[]` list. It is spelled once so the two forms cannot drift into
 * accepting different leaves.
 *
 * `hostAliases` is OPTIONAL and structural only — the Spoke's ADDITIONAL hostname claims. WHETHER each
 * value is an exact hostname, and whether it collides with another Spoke's claim, are checks the
 * authorities make (`resolveAuthoredSpoke` below, `./spoke-host-routing.mjs`), never restated here.
 *
 * @param {unknown} entry the authored entry
 * @param {(string|number)[]} at the path the entry was authored at
 * @param {{ path: (string|number)[], message: string }[]} issues the issue list to report into
 * @returns {{ id: string, root: string, hostAliases: string[] } | null} the typed entry, or `null`
 */
function spokeDeclarationStructure(entry, at, issues) {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
    issues.push({ path: at, message: "Invalid input: expected object" });
    return null;
  }

  unrecognized(entry, ["id", "root", "hostAliases"], at, issues);
  const idIsString = typeof entry.id === "string";
  const rootIsString = typeof entry.root === "string";
  if (!idIsString) issues.push({ path: [...at, "id"], message: "Invalid input: expected string" });
  if (!rootIsString) issues.push({ path: [...at, "root"], message: "Invalid input: expected string" });

  /** @type {string[]} */
  const hostAliases = [];
  if (entry.hostAliases !== undefined && entry.hostAliases !== null) {
    if (!Array.isArray(entry.hostAliases)) {
      issues.push({ path: [...at, "hostAliases"], message: "Invalid input: expected array" });
    } else {
      entry.hostAliases.forEach((value, aliasIndex) => {
        if (typeof value !== "string") {
          issues.push({
            path: [...at, "hostAliases", aliasIndex],
            message: "Invalid input: expected string",
          });
        } else {
          hostAliases.push(value);
        }
      });
    }
  }

  if (!idIsString || !rootIsString) return null;
  return { id: entry.id, root: entry.root, hostAliases };
}

/**
 * ONE hub-scoped Spoke switcher's STRUCTURE — again the SAME rule in both authoring forms: the flat
 * Installation-wide Hub's `spokeSwitcher`, and each nested Hub's own.
 *
 * STRUCTURAL ONLY: whether an option's destination actually ROUTES to the member it names is a routing
 * question (`./spoke-host-routing.mjs`), and whether an option names a DECLARED member is decided where
 * the declared set is known (`hubSwitcherMembership`). ORDER IS AUTHORED DATA: the list is preserved
 * exactly as written, never sorted and never derived.
 *
 * @param {unknown} value the authored switcher
 * @param {(string|number)[]} at the path it was authored at
 * @param {{ path: (string|number)[], message: string }[]} issues the issue list to report into
 * @returns {{ options: { spokeId: string, label: string, href: string }[] } | null}
 */
function switcherStructure(value, at, issues) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    issues.push({ path: at, message: "Invalid input: expected object" });
    return null;
  }

  unrecognized(value, ["options"], at, issues);
  if (!Array.isArray(value.options)) {
    issues.push({ path: [...at, "options"], message: "Invalid input: expected array" });
    return null;
  }

  /** @type {{ spokeId: string, label: string, href: string }[]} */
  const options = [];
  value.options.forEach((option, index) => {
    const optionAt = [...at, "options", index];
    if (option === null || typeof option !== "object" || Array.isArray(option)) {
      issues.push({ path: optionAt, message: "Invalid input: expected object" });
      return;
    }
    unrecognized(option, ["spokeId", "label", "href"], optionAt, issues);
    /** @type {{ spokeId?: string, label?: string, href?: string }} */
    const typed = {};
    let complete = true;
    for (const leaf of ["spokeId", "label", "href"]) {
      if (typeof option[leaf] !== "string") {
        issues.push({ path: [...optionAt, leaf], message: "Invalid input: expected string" });
        complete = false;
      } else {
        typed[leaf] = option[leaf];
      }
    }
    if (complete) options.push(typed);
  });

  return { options };
}

/**
 * THE NESTED AUTHORING FORM'S STRUCTURE (FOUNDATION-ID-M3-P1) — an Installation's IDENTIFIED SPOKE HUB
 * collection.
 *
 *     <InstallationRoot>/spokes.json
 *       { "spokeHubs": [ { "id": "…", "spokes": [ { "id": "…", "root": "spokes/…" } ] } ] }
 *
 * STRUCTURAL ONLY, and only a RECOGNISER: it answers "is this authored manifest shaped as an identified
 * Spoke Hub collection?" and nothing else. It resolves NO root, reads no configuration, composes no Spoke,
 * returns NO runtime collection, and NOTHING consumes it to build — every path from a manifest to a
 * runnable deployment goes through `resolveSpokeDeclarations`, which refuses this form unconditionally
 * (`SPOKE_HUB_RUNTIME_NOT_ENABLED`).
 *
 * The leaves are the SAME leaves the flat form authors, regrouped: a Spoke entry is `id`, `root` and the
 * OPTIONAL `hostAliases` (`spokeDeclarationStructure`), a hub-scoped `spokeSwitcher` is the same switcher
 * (`switcherStructure`), and `spokeHubs` is the new grouping. What is new is that every Spoke explicitly
 * belongs to an identified Hub.
 *
 * The INSTALLATION-level `inspectionSpoke` / `inspectionHosts` leaves are recognised — they are
 * manifest-level facts, not Hub facts — but their nested-form meaning (a COMPOSITE Spoke reference, because
 * a local id no longer names one Spoke) is LATER work: nothing interprets them while the form is refused,
 * and no Hub and no Spoke is ever chosen from them.
 *
 * @type {{ safeParse: (raw: unknown) => { success: true, data: { hubs: { id: string, spokes: { id: string, root: string, hostAliases: string[] }[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null }[], inspectionSpoke: string | null, inspectionHosts: string[] } } | { success: false, error: { issues: { path: (string|number)[], message: string }[] } } }}
 */
export const installationSpokeHubCollectionSchema = {
  safeParse(raw) {
    /** @type {{ path: (string|number)[], message: string }[]} */
    const issues = [];

    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        success: false,
        error: { issues: [{ path: [], message: "Invalid input: expected object" }] },
      };
    }

    unrecognized(
      raw,
      [
        INSTALLATION_SPOKE_HUB_COLLECTION_LEAF,
        "spokes",
        "spokeSwitcher",
        "inspectionSpoke",
        "inspectionHosts",
      ],
      [],
      issues,
    );

    if (!Array.isArray(raw[INSTALLATION_SPOKE_HUB_COLLECTION_LEAF])) {
      issues.push({
        path: [INSTALLATION_SPOKE_HUB_COLLECTION_LEAF],
        message: "Invalid input: expected array",
      });
      return { success: false, error: { issues } };
    }

    // OPTIONAL manifest-level leaves, typed exactly as the flat form types them — EXCEPT the inspection
    // nomination, which in THIS form is a COMPOSITE reference (FOUNDATION-ID-M3-P2 §8.4): a bare local id
    // may name a Spoke in either Hub, so it is refused here with its own message rather than carried
    // through as something the runtime would have to guess about.
    /** @type {{ spokeHubId: string, spokeId: string } | null} */
    let inspectionSpoke = null;
    if (raw.inspectionSpoke !== undefined && raw.inspectionSpoke !== null) {
      const nomination = raw.inspectionSpoke;
      if (typeof nomination === "string") {
        issues.push({
          path: ["inspectionSpoke"],
          message:
            "Invalid input: in the nested form the inspection nomination is the COMPOSITE reference " +
            '{ "spokeHubId": "…", "spokeId": "…" }, not a bare Spoke id — a local id alone may name a Spoke ' +
            "in either Spoke Hub, so nothing could decide which one represents this Installation.",
        });
      } else if (nomination === null || typeof nomination !== "object" || Array.isArray(nomination)) {
        issues.push({ path: ["inspectionSpoke"], message: "Invalid input: expected object" });
      } else {
        unrecognized(nomination, ["spokeHubId", "spokeId"], ["inspectionSpoke"], issues);
        const halves = { spokeHubId: nomination.spokeHubId, spokeId: nomination.spokeId };
        let complete = true;
        for (const half of ["spokeHubId", "spokeId"]) {
          if (typeof nomination[half] !== "string") {
            issues.push({
              path: ["inspectionSpoke", half],
              message: "Invalid input: expected string",
            });
            complete = false;
          } else if (nomination[half].trim() === "") {
            issues.push({
              path: ["inspectionSpoke", half],
              message: "Invalid input: expected a non-blank identity",
            });
            complete = false;
          }
        }
        if (complete) inspectionSpoke = halves;
      }
    }

    /** @type {string[]} */
    const inspectionHosts = [];
    if (raw.inspectionHosts !== undefined && raw.inspectionHosts !== null) {
      if (!Array.isArray(raw.inspectionHosts)) {
        issues.push({ path: ["inspectionHosts"], message: "Invalid input: expected array" });
      } else {
        raw.inspectionHosts.forEach((value, index) => {
          if (typeof value !== "string") {
            issues.push({ path: ["inspectionHosts", index], message: "Invalid input: expected string" });
          } else {
            inspectionHosts.push(value);
          }
        });
      }
    }

    /** @type {{ id: string, spokes: { id: string, root: string, hostAliases: string[] }[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null }[]} */
    const hubs = [];
    raw[INSTALLATION_SPOKE_HUB_COLLECTION_LEAF].forEach((hub, index) => {
      const at = [INSTALLATION_SPOKE_HUB_COLLECTION_LEAF, index];
      if (hub === null || typeof hub !== "object" || Array.isArray(hub)) {
        issues.push({ path: at, message: "Invalid input: expected object" });
        return;
      }
      // A HUB IS NOT A FLAT SPOKE ENTRY (FOUNDATION-ID-M3-P2 §8.2). Mixing the two forms inside ONE object
      // is named rather than reported as an anonymous unknown leaf, because that is precisely the mistake
      // an author makes while converting a flat manifest into identified Spoke Hubs.
      if (hub.root !== undefined) {
        issues.push({
          path: [...at, "root"],
          message:
            "Invalid input: a Spoke Hub carries no root of its own — it CONTAINS its Spokes, each authored " +
            'at its own "root" beneath the dedicated "spokes/" namespace. This object mixes the flat Spoke ' +
            "entry shape into a Hub declaration.",
        });
      }
      unrecognized(hub, ["id", "spokes", "spokeSwitcher", "root"], at, issues);

      const idIsString = typeof hub.id === "string";
      if (!idIsString) issues.push({ path: [...at, "id"], message: "Invalid input: expected string" });

      if (!Array.isArray(hub.spokes)) {
        issues.push({ path: [...at, "spokes"], message: "Invalid input: expected array" });
        return;
      }

      /** @type {{ id: string, root: string, hostAliases: string[] }[]} */
      const spokes = [];
      hub.spokes.forEach((entry, spokeIndex) => {
        const declaredEntry = spokeDeclarationStructure(entry, [...at, "spokes", spokeIndex], issues);
        if (declaredEntry !== null) spokes.push(declaredEntry);
      });

      /** @type {{ options: { spokeId: string, label: string, href: string }[] } | null} */
      let spokeSwitcher = null;
      if (hub.spokeSwitcher !== undefined && hub.spokeSwitcher !== null) {
        spokeSwitcher = switcherStructure(hub.spokeSwitcher, [...at, "spokeSwitcher"], issues);
      }

      if (idIsString) hubs.push({ id: hub.id, spokes, spokeSwitcher });
    });

    return issues.length > 0
      ? { success: false, error: { issues } }
      : { success: true, data: { hubs, inspectionSpoke, inspectionHosts } };
  },
};

/**
 * EVERY issue the nested form raises WITHOUT reading the filesystem: the manifest-level authoring rules
 * first, then the structure of the collection itself.
 *
 * THE MANIFEST-LEVEL RULES COME FIRST because they are the ones an author of this form can actually fix,
 * and they are reported before the structure so a caller reading the output sees "which form is this"
 * before "which leaf is wrong". They are unchanged from Phase 1 — the two forms stay mutually exclusive, and
 * a Hub-scoped switcher still belongs inside its Hub.
 *
 * @param {Record<string, unknown>} raw the parsed manifest
 * @param {{ success: true, data: unknown } | { success: false, error: { issues: { path: (string|number)[], message: string }[] } }} structural the collection's own structural answer
 * @returns {{ path: (string|number)[], message: string }[]}
 */
function spokeHubAuthoringIssues(raw, structural) {
  /** @type {{ path: (string|number)[], message: string }[]} */
  const issues = [];

  // THE TWO FORMS ARE MUTUALLY EXCLUSIVE — never a precedence rule, never a silent migration.
  if (raw.spokes !== undefined) {
    issues.push({
      path: ["spokes"],
      message:
        'Invalid input: "spokes" and "spokeHubs" are MUTUALLY EXCLUSIVE — an Installation is authored one ' +
        "way or the other, never both. Declare its Spokes either flat, as \"spokes\", or grouped into " +
        'identified Spoke Hubs, as "spokeHubs"; nothing is merged and no precedence exists.',
    });
  }

  // A HUB-SCOPED SWITCHER BELONGS TO ITS HUB. At the manifest level, in this form, it would name neither
  // the Hub nor the membership it offers — an ambiguous authoring leaf, refused rather than guessed at.
  if (raw.spokeSwitcher !== undefined) {
    issues.push({
      path: ["spokeSwitcher"],
      message:
        'Invalid input: a hub-scoped "spokeSwitcher" is authored BESIDE THE SPOKES IT OFFERS, so in the ' +
        'nested form it belongs INSIDE the Spoke Hub that owns them ("spokeHubs[].spokeSwitcher"). A ' +
        "manifest-level switcher in this form would name no Hub and no membership.",
    });
  }

  if (!structural.success) issues.push(...structural.error.issues);
  return issues;
}

/** ONE schema issue as the readable line every caller reports: the path it was found at, then its message. */
function renderZodIssue(issue) {
  const where = issue.path.join(".") || "(root)";
  return `${where}: ${issue.message}`;
}

function renderIssues(issues) {
  return issues.map((issue) => `  - ${issue}`).join("\n");
}

/**
 * The lexical rules for an authored locator: relative, POSIX-style, free of `..`, and located BENEATH the
 * dedicated `spokes/` namespace — which is an ownership boundary, so the container itself is not a Spoke
 * root and a misspelled namespace is not a namespace.
 *
 * @param {string} locator the authored locator
 * @param {string} where the message's subject
 * @returns {string|null} the issue, or `null` when the locator is acceptable
 */
function locatorIssue(locator, where) {
  if (locator.trim() === "") return `${where}: root must not be empty`;
  if (path.isAbsolute(locator) || locator.startsWith("/") || /^[A-Za-z]:/.test(locator)) {
    return `${where}: root "${locator}" must be root-relative, not absolute`;
  }
  if (locator.includes("\\")) {
    return `${where}: root "${locator}" must use POSIX "/" separators`;
  }
  const segments = locator.split("/");
  if (segments.includes("..")) {
    return `${where}: root "${locator}" must not contain a ".." segment`;
  }
  if (segments[0] !== SPOKE_ROOTS_DIRECTORY_NAME) {
    return (
      `${where}: root "${locator}" must live beneath the dedicated ` +
      `"${SPOKE_ROOTS_DIRECTORY_NAME}/" namespace`
    );
  }
  if (segments.slice(1).every((segment) => segment === "")) {
    return (
      `${where}: root "${locator}" must name a Spoke root INSIDE ` +
      `"${SPOKE_ROOTS_DIRECTORY_NAME}/" — the namespace itself is not a Spoke root`
    );
  }
  return null;
}

/** Is `target` inside `root` (both already REAL/resolved) — the ONE containment rule. */
function isInside(root, target) {
  const relative = path.relative(root, target);
  return !(relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative));
}

/**
 * ONE authored Spoke entry, RESOLVED AND PROVEN — the SHARED per-Spoke rule set, used by BOTH authoring
 * forms: the flat `spokes[]` list, and a nested Spoke Hub's own `spokes[]` list.
 *
 * It answers the AUTHORING questions only, in reading order, and reports the FIRST defect that makes a root
 * unusable — so a diagnostic never speculates about a directory it could not resolve:
 *
 *   · the locator is lexical: relative, POSIX, free of `..`, and beneath the dedicated `spokes/` namespace
 *     (which is an ownership boundary, so the container itself is not a Spoke root);
 *   · the root EXISTS, IS a directory, and resolves inside the Installation root AND inside `spokes/`;
 *   · it carries `site.config.json` — the ONE root-level contract a Spoke root satisfies;
 *   · no OTHER Spoke of the Installation claims the same PHYSICAL directory. The `seen` map is shared
 *     across the whole resolution, so one authored root can never be declared twice — in one Hub, or
 *     across two — while the message names the Spoke that claimed it first;
 *   · each ADDITIONAL hostname claim (`hostAliases`, WEB-1 owner requirement 6) is an exact hostname in the
 *     ONE normalized spelling and is stated once.
 *
 * It creates no Spoke, reads no configuration and composes no Hub: it resolves an AUTHORED ROOT.
 *
 * @param {string} root the resolved Installation root
 * @param {string} realRoot its real path (the outermost containment boundary)
 * @param {Map<string, { subject: string, locator: string }>} seen every physical root already claimed
 * @param {{ id: string, root: string, hostAliases: string[] }} entry the authored entry
 * @param {string} subject how ANOTHER Spoke's message names this Spoke (e.g. `Spoke #2`)
 * @param {string} where the full subject this Spoke's own messages use (e.g. `Spoke #2 ("docs")`)
 * @param {string[]} issues the issue list to report into
 * @returns {{ id: string, locator: string, root: string, hostAliases: string[] } | null}
 */
function resolveAuthoredSpoke(root, realRoot, seen, entry, subject, where, issues) {
  const lexical = locatorIssue(entry.root, where);
  if (lexical !== null) {
    issues.push(lexical);
    return null;
  }

  const resolved = path.resolve(root, entry.root);
  if (!existsSync(resolved)) {
    issues.push(`${where}: root "${entry.root}" does not exist`);
    return null;
  }
  if (!statSync(resolved).isDirectory()) {
    issues.push(`${where}: root "${entry.root}" is not a directory`);
    return null;
  }

  // PHYSICAL containment, in TWO steps: the Installation root must not be escaped at all, and the boundary
  // that actually owns Spoke roots is the DEDICATED CONTAINER — so the container itself may not be a link
  // out, and a link inside `spokes/` may not reach material elsewhere in the Installation.
  const realResolved = realpathSync(resolved);
  if (!isInside(realRoot, realResolved)) {
    issues.push(
      `${where}: root "${entry.root}" resolves outside the Installation root — a Spoke root must ` +
        "be authored inside it",
    );
    return null;
  }
  const realContainer = realpathSync(path.join(root, SPOKE_ROOTS_DIRECTORY_NAME));
  if (!isInside(realContainer, realResolved)) {
    issues.push(
      `${where}: root "${entry.root}" resolves outside the dedicated ` +
        `"${SPOKE_ROOTS_DIRECTORY_NAME}/" namespace`,
    );
    return null;
  }
  if (!existsSync(path.join(resolved, SPOKE_CONFIG_FILE_NAME))) {
    issues.push(`${where}: root "${entry.root}" carries no "${SPOKE_CONFIG_FILE_NAME}"`);
    return null;
  }

  const previous = seen.get(realResolved);
  if (previous !== undefined) {
    issues.push(
      `${where}: root "${entry.root}" resolves to the same directory as ${previous.subject} ` +
        `("${previous.locator}") — two Spokes cannot share one authored root`,
    );
    return null;
  }
  seen.set(realResolved, { subject, locator: entry.root });

  // THE SPOKE'S ADDITIONAL CLAIMS — resolved HERE, where the Spoke they belong to is known, so every
  // diagnostic can name it. Each one must be an EXACT hostname in the ONE normalized spelling (never a
  // wildcard, a suffix rule, a URL or a path — recognition at the boundary is exact equality), and a Spoke
  // may not state the same alias twice: a duplicate would read as two claims while being one.
  /** @type {string[]} */
  const accepted = [];
  for (const value of entry.hostAliases) {
    const issue = exactHostnameIssue(value, `${where}: `, "hostAliases");
    if (issue !== null) {
      issues.push(issue);
      continue;
    }
    if (accepted.includes(value)) {
      issues.push(`${where}: hostAliases states "${value}" more than once`);
      continue;
    }
    accepted.push(value);
  }

  return { id: entry.id, locator: entry.root, root: resolved, hostAliases: accepted };
}

/**
 * THE HUB-SCOPED SPOKE SWITCHER'S MEMBERSHIP RULES, decided where a Hub's declared MEMBERS are known — ONE
 * implementation for BOTH authoring forms, because the rules are identical and only the vocabulary of the
 * membership sentence differs:
 *
 *   · every option must NAME a member of the Hub it is authored in — the membership boundary itself, so an
 *     unrelated organization (which belongs to another Hub or another Installation) can never be listed;
 *   · no two options may name the same member, or offer the same DESTINATION hostname — two options would
 *     then send the visitor to one Spoke;
 *   · the label must say something (it is what the visitor reads);
 *   · the destination must be an absolute HTTPS ORIGIN (`switcherDestination`): a switcher travels to
 *     another domain, so a relative path could not reach one, and a non-HTTPS origin is refused rather than
 *     silently downgraded.
 *
 * WHETHER such an origin actually ROUTES to the member it names stays a routing question, refused by
 * `./spoke-host-routing.mjs`. ORDER IS AUTHORED DATA: the returned list is preserved exactly as written,
 * never sorted and never derived.
 *
 * @param {{ options: { spokeId: string, label: string, href: string }[] }} authored the valid switcher
 * @param {readonly string[]} memberIds the Spokes of the Hub the switcher belongs to
 * @param {{ where: string, members: string, audience: string }} vocabulary how this Hub's members and the
 *   membership rule are named in a message
 * @param {string[]} issues the issue list to report into
 * @returns {{ options: { spokeId: string, label: string, href: string }[] } | null}
 */
function hubSwitcherMembership(authored, memberIds, vocabulary, issues) {
  const before = issues.length;
  const seenSpokes = new Set();
  const seenHosts = new Set();

  for (const [index, option] of authored.options.entries()) {
    const where = `${vocabulary.where}[${index}]`;
    if (!memberIds.includes(option.spokeId)) {
      issues.push(
        `${where}: spokeId "${option.spokeId}" is not ${vocabulary.members} ` +
          `(${memberIds.map((id) => `"${id}"`).join(", ")}). ${vocabulary.audience}`,
      );
      continue;
    }
    if (option.label.trim() === "") {
      issues.push(`${where}: label must not be blank — it is what the visitor reads.`);
      continue;
    }
    const destination = switcherDestination(option.href);
    if (destination === null) {
      issues.push(
        `${where}: href "${option.href}" must be an absolute HTTPS origin such as ` +
          '"https://docs.example.test" — a switcher sends the visitor to ANOTHER domain, so a ' +
          "relative path, a non-HTTPS scheme, a path, a query or a fragment can never be one.",
      );
      continue;
    }
    if (seenSpokes.has(option.spokeId)) {
      issues.push(`${where}: spokeId "${option.spokeId}" is offered more than once`);
      continue;
    }
    if (seenHosts.has(destination.hostname)) {
      issues.push(
        `${where}: href "${option.href}" names a destination hostname another option already offers — ` +
          "two options would send the visitor to the same Spoke",
      );
      continue;
    }
    seenSpokes.add(option.spokeId);
    seenHosts.add(destination.hostname);
  }

  if (issues.length > before) return null;
  return { options: authored.options.map((option) => ({ ...option })) };
}

/**
 * EVERY declared Spoke Hub of a STRUCTURALLY valid nested collection, resolved and validated — or an
 * itemised failure naming each unacceptable entry (FOUNDATION-ID-M3-P1/P3).
 *
 * It is the nested form's counterpart to the flat path's semantic pass, and it REUSES the same authorities
 * rather than restating them:
 *
 *   · SPOKE HUB IDENTITY — `../core/spoke/spoke-hub-id.mjs`: nonblank ids, the reserved marker, exact
 *     uniqueness, at least one Hub;
 *   · SPOKE IDENTITY — `../core/spoke/spoke-id.mjs`, applied to EACH Hub's own members, so an id is unique
 *     WITHIN its Hub and may REPEAT in another — which is exactly why a Spoke is named by a composite
 *     reference. A Hub with NO member is reported by that same authority: an authored Hub cannot be empty;
 *   · ROOTS — `resolveAuthoredSpoke`, with ONE `seen` map for the whole collection, so reusing a physical
 *     root across two Hub declarations is refused exactly as reusing it twice inside one is;
 *   · THE HUB-SCOPED SWITCHER — `hubSwitcherMembership`, against that Hub's own members;
 *   · THE INSPECTION NOMINATION — resolved against DECLARED MEMBERSHIP (below), so a nomination naming a Hub
 *     or a Spoke this Installation does not declare is refused here rather than becoming a request-time
 *     surprise.
 *
 * HUB OWNERSHIP IS CARRIED OUT, NOT FLATTENED: every resolved Spoke names its owning Hub, and the Hubs stay
 * separate, so no consumer of this answer can lose which Hub a Spoke belongs to. Nothing is chosen: no Hub
 * and no Spoke is "the" one, and neither is first.
 *
 * CANONICAL AND ADDITIONAL HOSTNAME CLAIMS ARE NOT DECIDED HERE. A Spoke's canonical hostname is derived
 * from its own `site.url`, a configuration fact this seam deliberately does not read; the installation-wide
 * claim rules belong to the build authority (`./spoke-host-routing.mjs`), which applies the SAME rules to
 * BOTH authoring forms rather than each form having its own.
 *
 * @param {string} root the resolved Installation root
 * @param {string} manifestFile the manifest's absolute path
 * @param {{ hubs: { id: string, spokes: { id: string, root: string, hostAliases: string[] }[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null }[], inspectionSpoke: { spokeHubId: string, spokeId: string } | null, inspectionHosts: string[] }} nested the structurally valid collection
 * @returns {{ mode: "hubs", installationRoot: string, manifestFile: string, inspectionSpoke: { spokeHubId: string, spokeId: string } | null, inspectionHosts: string[], hubs: { id: string, spokes: { id: string, locator: string, root: string, hostAliases: string[], spokeHubId: string }[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null }[], spokeSwitcher: null }}
 */
function resolveIdentifiedSpokeHubDeclarations(root, manifestFile, nested) {
  const invalid = (issues) =>
    new Error(`Invalid Installation Spoke collection (${manifestFile}):\n${renderIssues(issues)}`);

  /** @type {string[]} */
  const issues = [...spokeHubCollectionIssues(nested.hubs.map((hub) => hub.id))];

  const realRoot = realpathSync(root);
  /** @type {Map<string, { subject: string, locator: string }>} */
  const seen = new Map();
  /** @type {{ id: string, spokes: { id: string, locator: string, root: string, hostAliases: string[], spokeHubId: string }[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null }[]} */
  const hubs = [];

  nested.hubs.forEach((hub, hubIndex) => {
    const hubWhere = `Spoke Hub #${hubIndex + 1} ("${hub.id}")`;

    issues.push(
      ...spokeCollectionIssues(hub.spokes.map((spoke) => spoke.id)).map(
        (issue) => `${hubWhere}: ${issue}`,
      ),
    );

    /** @type {{ id: string, locator: string, root: string, hostAliases: string[], spokeHubId: string }[]} */
    const spokes = [];
    hub.spokes.forEach((spoke, spokeIndex) => {
      const resolvedSpoke = resolveAuthoredSpoke(
        root,
        realRoot,
        seen,
        spoke,
        `${hubWhere} > Spoke #${spokeIndex + 1}`,
        `${hubWhere} > Spoke #${spokeIndex + 1} ("${spoke.id}")`,
        issues,
      );
      // THE OWNING HUB IS ATTACHED TO EACH SPOKE, and the Spoke to its Hub: a resolved Spoke is never
      // addressable without the Hub that owns it, which is what stops a local id from naming a Spoke in
      // either Hub.
      if (resolvedSpoke !== null) spokes.push({ ...resolvedSpoke, spokeHubId: hub.id });
    });

    const spokeSwitcher =
      hub.spokeSwitcher === null
        ? null
        : hubSwitcherMembership(
            hub.spokeSwitcher,
            hub.spokes.map((spoke) => spoke.id),
            {
              where: `${hubWhere} > spokeSwitcher.options`,
              members: "one of the Spokes this Spoke Hub declares",
              audience: "A switcher is HUB-SCOPED: it can only offer Spokes its own Spoke Hub declares.",
            },
            issues,
          );

    hubs.push({ id: hub.id, spokes, spokeSwitcher });
  });

  // §4 — THE INSPECTION NOMINATION IS COMPOSITE, AND IT MUST NAME A DECLARED MEMBER. The policy is
  // INSTALLATION-scoped: the Spoke that represents this whole Installation on a hostname no Spoke owns
  // publicly. It is only meaningful if the Installation actually declares that member, so an unresolvable
  // nomination is refused HERE, naming the members that do exist, instead of resolving to nothing at request
  // time (which would look identical to a working policy that never matches).
  const inspectionSpoke = nested.inspectionSpoke;
  if (inspectionSpoke !== null) {
    const owner = hubs.find((hub) => hub.id === inspectionSpoke.spokeHubId);
    const declared = hubs
      .map(
        (hub) =>
          `"${hub.id}"` +
          (hub.spokes.length === 0 ? "" : ` (${hub.spokes.map((s) => `"${s.id}"`).join(", ")})`),
      )
      .join(", ");
    if (owner === undefined) {
      issues.push(
        `inspectionSpoke: spokeHubId "${inspectionSpoke.spokeHubId}" is not one of the declared Spoke ` +
          `Hubs (${declared}). The Spoke that represents this Installation on an accepted hosting-platform ` +
          "inspection hostname is named by BOTH halves of its identity — there is no default Hub.",
      );
    } else if (!owner.spokes.some((spoke) => spoke.id === inspectionSpoke.spokeId)) {
      issues.push(
        `inspectionSpoke: Spoke Hub "${inspectionSpoke.spokeHubId}" declares no Spoke ` +
          `"${inspectionSpoke.spokeId}" — it declares ` +
          `${owner.spokes.map((spoke) => `"${spoke.id}"`).join(", ") || "none"}. The Spoke that represents ` +
          "this Installation on an accepted hosting-platform inspection hostname must be declared here, by " +
          "its COMPOSITE identity — there is no default Spoke.",
      );
    }
  }

  // THE POLICY'S ALIASES — the same semantic rules the flat form applies, reached through the SAME
  // authorities: an alias with no nominated Spoke could never select anything, each alias must be an EXACT
  // hostname in the ONE normalized spelling (`inspectionAliasIssue`), and no alias may be stated twice.
  // WHETHER an alias restates a Spoke's own canonical hostname is decided by the build authority, where a
  // canonical origin is known.
  if (nested.inspectionHosts.length > 0 && inspectionSpoke === null) {
    issues.push(
      `inspectionHosts: ${nested.inspectionHosts.length} inspection alias hostname(s) are declared, but ` +
        'the collection declares no "inspectionSpoke" — an alias selects the Spoke the policy nominates, ' +
        "so without one nothing could ever answer on it. Nominate the Spoke that represents this " +
        'Installation there, as { "spokeHubId": "…", "spokeId": "…" }, or remove the aliases.',
    );
  }

  /** @type {string[]} */
  const inspectionHosts = [];
  for (const value of nested.inspectionHosts) {
    const issue = inspectionAliasIssue(value);
    if (issue !== null) {
      issues.push(issue);
      continue;
    }
    if (inspectionHosts.includes(value)) {
      issues.push(`inspectionHosts: the hostname "${value}" is stated more than once`);
      continue;
    }
    inspectionHosts.push(value);
  }

  if (issues.length > 0) throw invalid(issues);

  return {
    mode: "hubs",
    installationRoot: root,
    manifestFile,
    inspectionSpoke,
    inspectionHosts,
    hubs,
    // A HUB-SCOPED SWITCHER BELONGS TO ITS HUB: this form has no Installation-wide switcher, and a manifest
    // that authors one is refused by `spokeHubAuthoringIssues`. The key stays present (`null`) so a consumer
    // can read it without checking the mode first.
    spokeSwitcher: null,
  };
}
/**
 * The Spokes ONE Installation root declares, or a descriptive, build-time-loud failure.
 *
 * `installationRoot` is an INPUT: this function never discovers a root of its own (no `process.cwd()`, no
 * environment, no layout) — the Installation is already selected by the ONE build authority.
 *
 * THREE SHAPES, ONE PER AUTHORING MODE. A legacy Installation answers `declarations` (its one implicit
 * Spoke) and no `hubs`; a FLAT manifest answers `declarations`, exactly as it always has, and no `hubs`; a
 * NESTED manifest answers `hubs` — each with its identity, its resolved Spokes (each naming its owning Hub)
 * and its own Hub-scoped switcher — and NO `declarations`, because flattening an identified collection into
 * one Spoke list is exactly what would lose Hub ownership.
 *
 * @param {string} installationRoot the Installation root to describe
 * @returns {{ mode: "legacy"|"explicit", installationRoot: string, manifestFile: string|null,
 *   inspectionSpoke: string|null, inspectionHosts: string[], declarations: { id: string, locator: string|null, root: string, hostAliases: string[] }[],
 *   spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null, hubs: [] }
 *   | { mode: "hubs", installationRoot: string, manifestFile: string,
 *   inspectionSpoke: { spokeHubId: string, spokeId: string } | null, inspectionHosts: string[],
 *   hubs: { id: string, spokes: { id: string, locator: string, root: string, hostAliases: string[], spokeHubId: string }[], spokeSwitcher: { options: { spokeId: string, label: string, href: string }[] } | null }[],
 *   spokeSwitcher: null }}
 */
export function resolveSpokeDeclarations(installationRoot) {
  const root = path.resolve(installationRoot);
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is not an existing directory.`,
    );
  }

  const manifestFile = path.join(root, INSTALLATION_SPOKE_COLLECTION_FILE_NAME);
  const configFile = path.join(root, SPOKE_CONFIG_FILE_NAME);
  const hasManifest = existsSync(manifestFile);
  const hasConfig = existsSync(configFile);

  if (hasManifest && hasConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored SIMULTANEOUSLY in both ` +
        `forms: it carries "${SPOKE_CONFIG_FILE_NAME}" (legacy implicit Spokes) and ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). An Installation ` +
        `is authored one way or the other: move the website material into its declared Spoke root and ` +
        `remove "${SPOKE_CONFIG_FILE_NAME}", or remove ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}". No precedence rule exists and nothing is migrated.`,
    );
  }

  if (!hasManifest && !hasConfig) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: the Installation root "${root}" is authored NEITHER way: it carries ` +
        `neither "${SPOKE_CONFIG_FILE_NAME}" (legacy implicit Spokes) nor ` +
        `"${INSTALLATION_SPOKE_COLLECTION_FILE_NAME}" (an explicit Spoke collection). A build must ` +
        "resolve exactly one deployment; nothing falls back silently.",
    );
  }

  if (!hasManifest) {
    return {
      mode: "legacy",
      installationRoot: root,
      manifestFile: null,
      // A legacy implicit Spoke has no manifest to declare a policy in, and one Spoke answers every host.
      inspectionSpoke: null,
      inspectionHosts: [],
      declarations: [{ id: IMPLICIT_SPOKE_ID, locator: null, root, hostAliases: [] }],
      // A switcher between Spokes is authored in the manifest this Installation does not carry.
      spokeSwitcher: null,
      // NOT an identified collection: a legacy Installation has ONE implicit Spoke Hub, and it is unnamed.
      hubs: [],
    };
  }

  return resolveExplicitSpokeDeclarations(root, manifestFile);
}

/**
 * Every Spoke an EXPLICIT manifest declares, resolved and validated — or an itemised failure naming each
 * unacceptable entry. The manifest is an ASSERTION about the Installation: every entry must be true.
 *
 * @param {string} root the resolved Installation root
 * @param {string} manifestFile the manifest's absolute path
 * @returns {{ mode: "explicit", installationRoot: string, manifestFile: string,
 *   declarations: { id: string, locator: string, root: string }[] }}
 */
function resolveExplicitSpokeDeclarations(root, manifestFile) {
  const invalid = (issues) =>
    new Error(`Invalid Installation Spoke collection (${manifestFile}):\n${renderIssues(issues)}`);

  /** @type {unknown} */
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestFile, "utf8"));
  } catch (error) {
    throw new Error(
      `FOUNDATION-MULTISITE-S3C1: "${manifestFile}" is not valid JSON: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // FOUNDATION-ID-M3-P1/P3 — THE NESTED FORM: RESOLVED BY ITS OWN AUTHORITY.
  //
  // The manifest-level authoring rules and the collection's STRUCTURE are reported first (neither reads the
  // filesystem), and only a STRUCTURALLY valid AND manifest-legal collection is then validated SEMANTICALLY
  // — identity, membership, roots, containment, the Hub-scoped switchers and the inspection nomination — so a
  // diagnostic never refers to a Hub whose own shape is unusable. A coherent collection is RETURNED as
  // `hubs`, with the owning Hub attached to every Spoke: this is the ONE path from an authored nested
  // manifest to the build, the runtime index and the asset generator, and it never flattens the Hubs into one
  // list.
  //
  // THE MANIFEST-LEVEL RULES ARE A REFUSAL, NOT A NOTE. A manifest that authors BOTH forms (or a
  // manifest-level switcher this form has no place for) is refused HERE — before anything is resolved —
  // because "there is one acceptable way to author this Installation" is exactly what those rules state, and
  // a rule that only warned would leave a second, ignored collection in the file.
  if (declaresSpokeHubCollection(raw)) {
    const nested = installationSpokeHubCollectionSchema.safeParse(raw);
    const authoring = spokeHubAuthoringIssues(raw, nested);
    if (!nested.success || authoring.length > 0) {
      throw invalid(authoring.map(renderZodIssue));
    }
    return resolveIdentifiedSpokeHubDeclarations(root, manifestFile, nested.data);
  }

  const parsed = installationSpokeCollectionSchema.safeParse(raw);
  if (!parsed.success) {
    throw invalid(parsed.error.issues.map(renderZodIssue));
  }

  const declarations = parsed.data.spokes;
  // IDENTITY semantics come from the pure domain — never restated here.
  const issues = [...spokeCollectionIssues(declarations.map((entry) => entry.id))];

  const realRoot = realpathSync(root);
  /** @type {Map<string, { subject: string, locator: string }>} */
  const seen = new Map();
  /** @type {{ id: string, locator: string, root: string, hostAliases: string[] }[]} */
  const declared = [];

  declarations.forEach((entry, index) => {
    const declaredEntry = resolveAuthoredSpoke(
      root,
      realRoot,
      seen,
      entry,
      `Spoke #${index + 1}`,
      `Spoke #${index + 1} ("${entry.id}")`,
      issues,
    );
    if (declaredEntry !== null) declared.push(declaredEntry);
  });

  if (issues.length > 0) throw invalid(issues);

  const declaredIds = declared.map((entry) => entry.id);
  const inspectionSpoke = parsed.data.inspectionSpoke;

  // §29/§30 — THE POLICY NAMES A DECLARED SPOKE, or the Installation is refused HERE (a configuration
  // error at build time) rather than falling back to "the first Spoke" at request time. An absent policy
  // stays absent: no Spoke is ever chosen implicitly.
  if (inspectionSpoke !== null && !declaredIds.includes(inspectionSpoke)) {
    throw invalid([
      `inspectionSpoke: "${inspectionSpoke}" is not one of the declared Spokes ` +
        `(${declaredIds.map((id) => `"${id}"`).join(", ")}). The Spoke that represents this ` +
        "Installation on an accepted hosting-platform inspection hostname must be declared here, " +
        "by identity — there is no default.",
    ]);
  }

  // THE POLICY'S ALIASES (M22 correction). `inspectionHosts` names hosts that no Spoke owns publicly but
  // that ARE first-party surfaces of this project — a hosting provider's PERMANENT project alias, for
  // example, which is not one of the deployment-specific hostnames the provider reports to a build. Two
  // consequences are semantic, and both are refused HERE, at build time, rather than becoming a
  // request-time surprise:
  //
  //   · aliases with no nominated Spoke could never select anything — a silent no-op, so they are
  //     refused instead of authored hopefully;
  //   · each alias must be an EXACT hostname in the ONE normalized spelling. The rule comes from the pure
  //     domain (`../core/spoke/hostname.mjs`), never a copy of it, and it is why a wildcard (`*.x`), a
  //     URL, a path or a differently spelled hostname cannot be declared: recognition is exact, so a
  //     second spelling would be a SECOND hostname that no request ever carries.
  const inspectionHosts = [];
  const authoredHosts = parsed.data.inspectionHosts;

  if (authoredHosts.length > 0 && inspectionSpoke === null) {
    throw invalid([
      `inspectionHosts: ${authoredHosts.length} inspection alias hostname(s) are declared, but the ` +
        "collection declares no \"inspectionSpoke\" — an alias selects the Spoke the policy nominates, " +
        "so without one nothing could ever answer on it. State which Spoke represents this Installation " +
        "there, or remove the aliases.",
    ]);
  }

  for (const value of authoredHosts) {
    const issue = inspectionAliasIssue(value);
    if (issue !== null) {
      issues.push(issue);
      continue;
    }
    if (inspectionHosts.includes(value)) {
      issues.push(`inspectionHosts: the hostname "${value}" is stated more than once`);
      continue;
    }
    inspectionHosts.push(value);
  }

  if (issues.length > 0) throw invalid(issues);

  // §7/§8 — THE HUB-SCOPED SPOKE SWITCHER'S IDENTITY RULES, decided where the declared Spokes are known:
    // ONE INSTALLATION IS ONE HUB, and these are its MEMBERS. Every option must NAME a declared member — the
    // membership boundary itself, so an unrelated organization (which belongs to another Hub/Installation)
    // can never be listed; no `hubId`, no second registry and no hostname-suffix rule exists or is needed.
    // No two options may name the same member or the same destination hostname, the label must say
    // something, and the destination must be an absolute HTTPS ORIGIN — a switcher travels to another
    // domain, so a relative path could not reach one, and a non-HTTPS origin is refused rather than silently
    // downgraded. WHETHER that origin actually ROUTES to the member the option names is a routing question,
    // refused by `./spoke-host-routing.mjs`.
  const authoredSwitcher = parsed.data.spokeSwitcher;
  // ONE INSTALLATION IS ONE HUB, and these are its MEMBERS — so the membership authority is reached with
  // this Installation's declared ids. ORDER IS AUTHORED DATA: the list is preserved exactly as written.
  const spokeSwitcher =
    authoredSwitcher === null
      ? null
      : hubSwitcherMembership(
          authoredSwitcher,
          declaredIds,
          {
            where: "spokeSwitcher.options",
            members: "one of the declared Spokes",
            audience: "A switcher between Spokes can only offer Spokes this Installation declares.",
          },
          issues,
        );

  if (issues.length > 0) throw invalid(issues);

  return {
    mode: "explicit",
    installationRoot: root,
    manifestFile,
    inspectionSpoke,
    inspectionHosts,
    declarations: declared,
    spokeSwitcher,
    // NOT an identified collection: a flat manifest declares Spokes, not Spoke Hubs, and the Installation's
    // single implicit Hub is unnamed — so this answer carries no Hubs and every decision here is unchanged.
    hubs: [],
  };
}

/**
 * The ONE rule set an authored inspection alias must satisfy, or `null` when it does.
 *
 * The hostname authority itself is NOT restated: `normalizeHostname` decides what a usable hostname is
 * and what its one spelling is. What is added here is the DECLARATION rule — an alias names ONE exact
 * host, so pattern syntax (`*`, `?`), URL syntax, a path or any other non-hostname spelling is refused
 * loudly rather than accepted as a rule nobody meant to write.
 *
 * @param {string} value the authored alias
 * @returns {string|null} the issue, or `null`
 */
function inspectionAliasIssue(value) {
  return exactHostnameIssue(value, "", "inspectionHosts");
}

/**
 * THE ONE EXACT-HOSTNAME DECLARATION RULE, shared by every authored hostname claim.
 *
 * Three authored hostname lists exist — a Spoke's ADDITIONAL claims (`hostAliases`), and the Installation's
 * inspection aliases (`inspectionHosts`) — and all of them mean the same thing: ONE exact host, recognized
 * by exact equality against the host of a request. So the rule is spelled ONCE, with the field name and an
 * optional subject supplied by the caller, rather than once per list: a wildcard, a suffix, a URL, a path,
 * a differently-cased or port-bearing spelling, or a blank value is refused in every one of them, and a
 * second implementation cannot drift.
 *
 * @param {string} value the authored hostname
 * @param {string} where the subject to name (e.g. `Spoke #2 ("docs"): `), or `""`
 * @param {string} field the authored field, named in the message
 * @returns {string|null} the issue, or `null`
 */
function exactHostnameIssue(value, where, field) {
  if (value.trim() === "") {
    return `${where}${field}: a hostname must not be blank`;
  }
  if (/[*?/#@\s]/.test(value) || value.includes("://")) {
    return (
      `${where}${field}: "${value}" is not an exact hostname — a wildcard, a URL or a path can never name ` +
      "one host, and recognition here is exact equality against the host of a request"
    );
  }
  const normalized = normalizeHostname(value);
  if (normalized === null) {
    return `${where}${field}: "${value}" is not a usable hostname`;
  }
  if (normalized !== value) {
    return (
      `${where}${field}: "${value}" must be spelled the normalized way, "${normalized}" — recognition is ` +
      "exact equality, so two spellings would be two different hostnames"
    );
  }
  return null;
}

/**
 * THE DESTINATION OF ONE SWITCHER OPTION, or `null` when the authored value is not an absolute HTTPS origin.
 *
 * A switcher sends a visitor to ANOTHER Spoke, and Spokes are distinguished by HOST, so the destination must
 * be a whole origin: no path, no query, no fragment (the target Spoke's own routing completes the visit from
 * its root, which is what "lands at the target Spoke's public entry point" means), and no scheme other than
 * HTTPS. A trailing `/` is the same origin spelled the one other way a URL allows, so it is accepted and
 * normalized away.
 *
 * @param {string} href the authored destination
 * @returns {{ origin: string, hostname: string } | null} the origin and its hostname, or `null`
 */
export function switcherDestination(href) {
  const trimmed = href.trim();
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.pathname !== "/" && parsed.pathname !== "") return null;
  if (parsed.search !== "" || parsed.hash !== "") return null;
  const hostname = normalizeHostname(parsed.host);
  if (hostname === null) return null;
  return { origin: `https://${hostname}`, hostname };
}
