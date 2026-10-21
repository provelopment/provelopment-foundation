/**
 * WHAT A COMPLETE FOUNDATION INSTALLATION IS MADE OF (FOUNDATION-B4B)
 * ==================================================================
 *
 * The pure half of establishment: the VOCABULARY and the RULES that decide what an installation is made
 * of, with no filesystem, clock, network or Git repository. The mechanics that obey it live in
 * `src/application/establish-foundation-installation.ts` (the use case) and `src/adapters/installation/**`
 * (the Node implementations); the operator surface is `scripts/installation/index.mjs`.
 *
 * THE ONE RELATIONSHIP THIS MODULE EXISTS TO STATE
 * ------------------------------------------------
 *
 *   complete installation = immutable release content + authored installation capsule + generated state
 *                           (the platform payload)     (the seed: configuration,      (the operational record;
 *                                                       dictionaries, pages, artwork)  never authored, never shipped)
 *
 * and therefore:
 *
 *   · `Foundation release payload` is NOT `complete Foundation installation`. A release is deliberately
 *     platform-only — the policy excludes `deployment/**`, because a release must never carry one site's
 *     authored material. A complete installation also needs that authored material, and establishment takes
 *     it from an explicitly supplied SEED rather than inventing it. Nothing here weakens the release
 *     boundary; that boundary is exactly why a seed is an input.
 *   · The release payload is a SUBSET of the installation: every payload path appears in the installation
 *     unchanged, and an installation carries authored and generated paths no release ever contains.
 *
 * THE SEED'S SHAPE IS A CONTRACT, NOT A CONVENTION
 * ------------------------------------------------
 * A seed is the authored capsule (`site.config.json`, `config/i18n/**`, `content/**`) supplied by the
 * caller: the platform never invents a site. The rules below are the minimum a complete installation needs
 * (a configuration to read, material to serve) plus the generated state a seed may not contain, because a
 * seed is authorship rather than another installation's machine state.
 *
 * FAIL CLOSED, ALWAYS: every rule refuses rather than repairs. Establishment may not "fix" a seed, guess a
 * missing surface, or accept a capsule whose generated state would give the new installation a history it
 * never had.
 *
 * Framework-neutral: pure data and pure predicates. No filesystem, no clock, no configuration, no React.
 */
import {
  foundationReleaseReferenceIssues,
  identicalFoundationReleases,
  type FoundationReleaseReference,
} from "@/core/foundation-release/reference";

import {
  identicalInstallationCandidates,
  INSTALLATION_ACTIVATION,
  INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
  type FoundationInstallationOperationalState,
  type InstallationCandidateIdentity,
} from "./model";
import { installationActivationState } from "./state";

/**
 * The file that records which immutable release THIS installation adopted
 * (`deployment/foundation-baseline.json` here) — the shape `deployment/README.md` documents and
 * `deployment/tests/unit/foundation-baseline.test.ts` validates.
 *
 * Establishment WRITES it from the release it actually established, because it records an act of THIS
 * installation: a record inherited from a seed would describe an adoption that never happened here.
 */
export const INSTALLATION_ADOPTION_RECORD_FILE_NAME = "foundation-baseline.json";

/**
 * One required authored surface of a seed.
 *
 * `kind` distinguishes a file from a directory (which must exist and contain at least one entry): a
 * configuration file that is really a directory, or an empty page tree, is a seed defect rather than an
 * installation of nothing.
 */
export interface InstallationSeedRequirement {
  /** The seed-relative POSIX path, e.g. `site.config.json` or `content/pages`. */
  readonly path: string;
  readonly kind: "file" | "directory";
  /** Why a complete installation cannot exist without it. */
  readonly reason: string;
}

/**
 * The authored surfaces ONE SPOKE ROOT must carry (FOUNDATION-MULTISITE-M20).
 *
 * Deliberately SHORT and structural: what the platform reads at runtime, and nothing about how an owner
 * organises the rest. A seed may carry any additional authored material — a capsule README, an agent
 * contract, its own acceptance tests, documentation, generated content documents — copied verbatim.
 *
 * RELATIVE TO ONE SPOKE ROOT, WHICH IS THE WHOLE POINT SINCE M20. An Installation authoring ONE implicit
 * Spoke carries these at its root; an Installation authoring an explicit Spoke collection carries them
 * INSIDE EACH declared Spoke root. The paths are therefore stated once, relative to a Spoke root, and
 * `installationSeedTopologyRefusals` applies them to whatever roots the seed's own mode declares — so the
 * legacy shape is not a special case and the explicit shape is not a second rule.
 */
export const INSTALLATION_SEED_REQUIREMENTS: readonly InstallationSeedRequirement[] = Object.freeze([
  {
    path: "site.config.json",
    kind: "file",
    reason: "the installation's own configuration: its sites, languages, contact details and navigation",
  },
  {
    path: "config/i18n",
    kind: "directory",
    reason: "the user-visible interface strings every configured locale is rendered from",
  },
  {
    path: "content/pages",
    kind: "directory",
    reason: "the authored pages the installation serves — Markdown and the declarative JSON mode",
  },
  {
    path: "content/assets",
    kind: "directory",
    reason: "the authored artwork the runtime asset mirror is generated from",
  },
]);

/**
 * WHICH AUTHORING MODE A SEED IS AUTHORED IN, AND WHERE ITS SPOKE ROOTS ARE (FOUNDATION-MULTISITE-M20)
 * ==================================================================================================
 *
 * An Installation is authored ONE way — and the ONE declaration authority decides which, refusing both
 * authored at once and neither authored at all (`@/config/spoke-declarations.mjs`, whose rules are NOT
 * restated here):
 *
 *   legacy implicit   no `spokes.json`: the Installation root IS the one implicit Spoke root, and the
 *                     authored surfaces sit directly in the seed
 *   explicit          a `spokes.json` manifest declaring 1..* Spoke roots beneath the dedicated `spokes/`
 *                     namespace, each of which carries its OWN authored surfaces
 *
 * This is PURE DATA about a seed's SHAPE — ids and locators, nothing else: no filesystem, no manifest
 * parsing, no manifest schema, no locator rules and no containment checks, all of which belong to that ONE
 * authority. Establishment's adapter resolves a real seed through it and passes the answer inward as this
 * value, so the rules below can speak about "every declared Spoke root" without knowing how one is
 * discovered, validated or located.
 */
export type InstallationSeedTopology =
  | { readonly mode: "legacy" }
  | { readonly mode: "explicit"; readonly spokes: readonly InstallationSeedSpoke[] };

/** ONE Spoke a seed's manifest declares: the authored id, and the locator of its root. */
export interface InstallationSeedSpoke {
  /** The identity the manifest declares (`foundation`, `germany`, …). */
  readonly id: string;
  /**
   * The OWNING Spoke Hub when the seed declares identified Hubs (FOUNDATION-ID-M3-P3). Absent for a
   * flat declaration, where the local id is the complete identity.
   */
  readonly spokeHubId?: string;
  /**
   * The Spoke root's Installation-relative POSIX locator, e.g. `spokes/germany`.
   *
   * An opaque spelling here: which spellings are acceptable is the declaration authority's rule, applied
   * before this value ever exists.
   */
  readonly locator: string;
}

/** The seed-relative prefix ONE Spoke root's surfaces live under (`""` for the legacy implicit Spoke). */
function spokeRootPrefix(locator: string): string {
  const trimmed = locator.replace(/\/+$/, "");
  return trimmed === "" ? "" : `${trimmed}/`;
}

/**
 * WHY THIS SEED CANNOT BECOME A COMPLETE INSTALLATION, given the authoring mode it is authored in.
 *
 * ONE rule, applied to every Spoke root the mode declares: the legacy implicit Installation applies it to
 * its root, an explicit Installation applies it to each DECLARED Spoke root — so the real two-Spoke
 * capsule is accepted for exactly the reason the legacy capsule is, and neither shape is a special case.
 *
 * MEMBERSHIP IS THE MANIFEST'S, NEVER A DIRECTORY'S. Nothing here enumerates a `spokes/` directory: a root
 * that the manifest does not declare cannot make this function demand anything of it, and an undeclared
 * directory therefore creates no Spoke and no requirement. That is why this function takes the topology as
 * DATA rather than discovering roots itself.
 *
 * Pure: paths and kinds only. Every refusal names the path that is missing and whose Spoke root it belongs
 * to, because an operator establishing a multi-Spoke Installation must be told WHICH Spoke is incomplete.
 */
export function installationSeedTopologyRefusals(
  topology: InstallationSeedTopology,
  files: readonly { readonly path: string }[],
): string[] {
  if (topology.mode === "explicit" && topology.spokes.length === 0) {
    return [
      "the seed declares an explicit Spoke collection that names no Spoke — an Installation is authored " +
        "either implicitly (its root is its one Spoke) or with at least one declared Spoke root",
    ];
  }

  const paths = files.map((file) => file.path);
  const single: readonly (InstallationSeedSpoke | null)[] =
    topology.mode === "legacy" ? [null] : topology.spokes;
  const refusals: string[] = [];

  for (const spoke of single) {
    if (spoke !== null && spoke.locator.trim() === "") {
      refusals.push(
        `declared Spoke "${spoke.id}" names no root locator — a declared Spoke root must say where it is ` +
          "authored inside the Installation",
      );
      continue;
    }
    const prefix = spoke === null ? "" : spokeRootPrefix(spoke.locator);
    const where = spoke === null ? "" : ` (declared Spoke "${spoke.id}", under "${prefix}")`;

    for (const requirement of INSTALLATION_SEED_REQUIREMENTS) {
      const path = `${prefix}${requirement.path}`;
      const present =
        requirement.kind === "file"
          ? paths.includes(path)
          : paths.some((candidate) => candidate.startsWith(`${path}/`));
      if (!present) refusals.push(`the seed has no ${path} — ${requirement.reason}${where}`);
    }
  }

  return refusals;
}

/**
 * Generated state a seed may NEVER contain, with the reason each is refused.
 *
 * A seed is authorship. These paths are machine state produced by RUNNING an installation, so a seed that
 * carries one is either not authored material or a copy of another installation's running state — and
 * copying it would give the new installation a history it did not have. Establishment REFUSES rather than
 * deletes, because silently dropping a supplied file would hide the mistake.
 */
export const INSTALLATION_SEED_REFUSED_PATHS: readonly { path: string; reason: string }[] = Object.freeze([
  {
    path: INSTALLATION_OPERATIONAL_STATE_FILE_NAME,
    reason:
      "the operational record is GENERATED state describing what an installation is running and which " +
      "installation it belongs to; establishment writes this installation's own record",
  },
]);

/**
 * Records a seed MAY contain that are NOT portable authored material, and are therefore not inherited
 * (FOUNDATION-B4B-A2).
 *
 * USING AN EXISTING INSTALLATION'S CAPSULE AS A SEED IS THE ORDINARY CASE. Such a capsule carries its own
 * adoption record, because every installation has one — so a seed containing
 * `foundation-baseline.json` is a capsule doing its job, not a mistake. That record is not authorship: it
 * states which immutable release THAT installation adopted, and inheriting it would give the new
 * installation a claim about an adoption that never happened there, against a release it may never have
 * run. Establishment therefore EXCLUDES it from the PORTABLE seed — so it reaches neither the authored
 * digest nor the target — and writes the new installation's own record from the release it is establishing.
 *
 * EXCLUDED, NOT REFUSED, AND THE DISTINCTION IS OWNERSHIP RATHER THAN SEVERITY: an adoption record belongs
 * to the installation whose adoption it describes and simply does not travel, while generated runtime state
 * (`INSTALLATION_SEED_REFUSED_PATHS`) is not authored material at all and is refused so a mistake is
 * visible. The portable capsule is therefore:
 *
 *   portable capsule = authored capsule − the source's own records − generated operational state
 *
 * Named as data, so the rule is stated once and the use case, its tests and the documentation cannot drift
 * apart. Nothing here parses, repairs or rewrites a supplied file: the source is left exactly as it is.
 */
export const INSTALLATION_SEED_NON_PORTABLE_PATHS: readonly { path: string; reason: string }[] =
  Object.freeze([
    {
      path: INSTALLATION_ADOPTION_RECORD_FILE_NAME,
      reason:
        "the source installation's own adoption record: it names the release THAT installation adopted, so " +
        "it is not portable authored material — this installation records its own adoption, from the " +
        "release being established",
    },
  ]);

/** A seed split into what a new installation inherits and what it deliberately does not. */
export interface PortableInstallationSeed<T> {
  /** The authored material the new installation adopts, in the seed's own order. */
  readonly portable: readonly T[];
  /** The seed's own records, in the seed's own order — named so that nothing about them is silent. */
  readonly notInherited: readonly T[];
}

/**
 * THE PORTABLE CAPSULE: a seed as the authored material a new installation may inherit.
 *
 * Pure and generic over anything carrying a seed-relative `path`, so the use case, a test and a future
 * caller cannot disagree about what travels. `notInherited` is returned rather than discarded because the
 * excluded files are a fact about the act the operator performed, not an implementation detail to hide.
 */
export function portableInstallationSeed<T extends { readonly path: string }>(
  files: readonly T[],
): PortableInstallationSeed<T> {
  const inherited = (file: T): boolean =>
    !INSTALLATION_SEED_NON_PORTABLE_PATHS.some((record) => record.path === file.path);
  return {
    portable: files.filter(inherited),
    notInherited: files.filter((file) => !inherited(file)),
  };
}

/**
 * Generated state the installation MUST keep out of version control: the ignore rule its capsule carries.
 *
 * A seed without it is refused, deliberately — the operational record is written on establishment and on
 * every future health evaluation, so a capsule that tracked it would turn machine state into authored
 * commits, the exact outcome B4A's acceptance requirement forbids. Stated as the pattern an ignore file
 * must contain, not as one file's contents, so an owner keeps their own generated-state policy.
 */
export const INSTALLATION_GENERATED_STATE_IGNORE_RULE = INSTALLATION_OPERATIONAL_STATE_FILE_NAME;

/**
 * The two content scopes an installation's candidate identity is built from.
 *
 * ONE ENCODING, DISTINCT SCOPES: both digests use the shared encoding of
 * `@/core/foundation-release/content-digest.mjs` — the encoding a release's own content digest uses — so
 * identities are comparable across the platform while saying different things:
 *
 *   authored       the AUTHORED INPUT as supplied: the seed's files exactly as the caller provided them.
 *                  It makes "which authored material did this installation come from?" provable.
 *   materialized   the MATERIALISED CANDIDATE TREE: the platform payload, the seed, and the adoption record
 *                  establishment wrote — every file establishment produced, exactly as it exists in the
 *                  target. It makes "the candidate that was validated is the candidate that became live"
 *                  checkable after the fact.
 *
 * Neither scope includes the operational record: generated state describes an installation, it is not part
 * of the artifact that was materialised.
 */
export const INSTALLATION_CONTENT_SCOPE = Object.freeze({
  /** The authored input (the seed) as supplied. */
  AUTHORED: "installation-authored-v1",
  /** The candidate tree as materialised into the installation root. */
  MATERIALIZED: "installation-materialized-v1",
} as const);

/** A UTC-offset ISO-8601 instant, as an authored adoption record carries it (`…+07:00`). */
const OFFSET_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?[+-]\d{2}:\d{2}$/;

/**
 * The moment an adoption was made, in the form an authored record uses.
 *
 * OFFSET, NOT `Z`: the adoption record is AUTHORED state a human reads and reviews, and the record this
 * repository already carries (`deployment/foundation-baseline.json`) states the owner's local time with its
 * offset. Unambiguous either way; the form follows the record that exists.
 *
 * Pure: it reads only the `Date` it is given, so a fixed clock produces a fixed record.
 */
export function offsetInstant(moment: Date): string {
  const minutes = -moment.getTimezoneOffset();
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  const local = new Date(moment.getTime() + minutes * 60_000);
  const body = local.toISOString().replace(/\.\d{3}Z$/, "");
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const remainder = String(absolute % 60).padStart(2, "0");
  return `${body}${sign}${hours}:${remainder}`;
}

/** The adoption record: this installation's deliberate adoption of ONE immutable Foundation release. */
export interface FoundationInstallationAdoptionRecord {
  readonly release: FoundationReleaseReference;
  /** When THIS installation adopted it — an offset instant, in the form the authored record uses. */
  readonly adoptedAt: string;
  /** Which work established the adoption, for a human reading the record later. */
  readonly establishedBy: string;
}

/**
 * Build the adoption record for an installation established from `reference`.
 *
 * NO ACQUISITION FIELD, DELIBERATELY: acquisition is mutable and incidental
 * (`@/application/foundation-installation-ports`), while this record states immutable provenance — the
 * identity, the revision and the content identity of the release this installation runs. Where the bytes
 * came from belongs to the act's diagnostics, never to the installation's durable state.
 */
export function foundationInstallationAdoptionRecord(
  reference: FoundationReleaseReference,
  adoption: { adoptedAt: string; establishedBy: string },
): FoundationInstallationAdoptionRecord {
  const issues = foundationReleaseReferenceIssues(reference);
  if (issues.length > 0) {
    throw new Error(
      "FOUNDATION-B4B: an installation adoption record must name a valid immutable Foundation release:\n" +
        issues.map((issue) => `  - ${issue}`).join("\n"),
    );
  }
  if (!OFFSET_INSTANT_PATTERN.test(adoption.adoptedAt) || Number.isNaN(new Date(adoption.adoptedAt).getTime())) {
    throw new Error(
      `FOUNDATION-B4B: "${adoption.adoptedAt}" is not an offset ISO-8601 instant, the form an adoption ` +
        "record uses (for example 2026-09-30T10:17:43+07:00).",
    );
  }
  if (adoption.establishedBy.trim() === "") {
    throw new Error("FOUNDATION-B4B: an adoption record must say which work established it.");
  }
  return { release: reference, adoptedAt: adoption.adoptedAt, establishedBy: adoption.establishedBy };
}

/**
 * True when this record describes an installation established from EXACTLY this release and candidate.
 *
 * The completion question establishment asks itself after writing a record, and the question an operator
 * asks a target root later: something is live; the live release is the one this establishment was for IN
 * EVERY RESPECT the release contract records (identity, revision, content); and the live revision is the
 * candidate's materialised digest. A record whose release differs, whose revision differs, or that is still
 * unactivated is NOT an established installation, however plausible its history looks.
 */
export function installationIsEstablishedFrom(
  state: FoundationInstallationOperationalState,
  expected: { release: FoundationReleaseReference; candidate: InstallationCandidateIdentity },
): boolean {
  if (installationActivationState(state) !== INSTALLATION_ACTIVATION.ACTIVE) return false;
  const live = state.current.live;
  if (live === null) return false;

  const attempt = state.current.lastAttempt;
  return (
    identicalFoundationReleases(live.release, expected.release) &&
    live.revision === expected.candidate.materialized &&
    attempt !== null &&
    attempt.candidate !== null &&
    identicalInstallationCandidates(attempt.candidate, expected.candidate)
  );
}
