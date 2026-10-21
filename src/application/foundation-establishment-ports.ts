/**
 * THE PORTS ESTABLISHMENT NEEDS (FOUNDATION-B4B)
 * =============================================
 *
 * `src/application/establish-foundation-installation.ts` composes ONE complete Foundation installation
 * inside an explicitly supplied target root. It must not know HOW content is read, HOW bytes are written,
 * where a release came from or which cryptography a digest uses, so each of those is a port here.
 *
 * THE WRITE BOUNDARY IS STRUCTURAL, NOT A CONVENTION
 * --------------------------------------------------
 * `FoundationInstallationTarget.write` accepts only ROOT-RELATIVE POSIX PATHS. There is no absolute path in
 * the contract, so the use case cannot address anything outside the target root even by mistake, and the
 * implementation owns the one guard that resolves each path inside the root it was constructed for. A
 * bootstrap may therefore write nothing but the installation it is establishing — never the source
 * installation, another installation, the platform's own checkout or a user's home directory.
 *
 * WHAT IS DELIBERATELY NOT HERE. No port for a registry, a fleet, a control plane, GitHub, polling or
 * "the latest release": an installation is established from ONE named immutable release supplied by an
 * acquisition source, and it is complete when it has been materialised. No port declares a staging
 * environment or a rollback executor either — those are later phases, and B4B's establishment is the
 * smallest mechanism that creates an installation at all.
 *
 * WHAT IS REUSED. The clock, the release acquisition source and the installation's operational state store
 * are the ports FOUNDATION-B4A already declared (`./foundation-installation-ports`), so establishment
 * drives the SAME lifecycle contract and writes the SAME record as every future mechanic will.
 */
import type {
  FoundationReleaseAcquisitionSource,
  InstallationClock,
  InstallationOperationalStateStore,
} from "./foundation-installation-ports";
import type { InstallationSeedTopology } from "@/core/foundation-installation/establishment";

/**
 * ONE file of a content set: a ROOT-RELATIVE POSIX path and its exact bytes.
 *
 * The path is never absolute, for any source or the target: a content set is described in terms of itself,
 * so the same file value can be read from a release payload, read from a seed, or written into a target
 * root without any of those three knowing where the others live.
 */
export interface FoundationContentFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/**
 * The content of ONE immutable release as obtained: the payload files a release construction produced.
 *
 * Deliberately read-only and complete: establishment needs every file's exact bytes to materialise the
 * platform and to prove the content identity it records. The payload's manifest (`foundation-release.json`)
 * is the release's own description rather than its content, so an implementation does not report it as a
 * payload file; the installation's own records of what it adopted are the adoption record and the
 * operational record establishment writes.
 */
export interface FoundationReleasePayloadSource {
  /** A description of where the payload was read from, for diagnostics — acquisition, never release identity. */
  readonly description: string;
  files(): Promise<readonly FoundationContentFile[]>;
}

/**
 * The AUTHORED installation material a caller supplies: one capsule's worth of configuration, dictionaries,
 * pages and artwork.
 *
 * The platform never invents a site, so establishment cannot create an installation without it. The seed is
 * copied verbatim (its generated state is refused, not stripped — see the establishment contract), which is
 * what makes "the installation contains exactly the authored input it was established from" provable.
 */
export interface FoundationInstallationSeedSource {
  /** A description of where the authored input was read from, for diagnostics. */
  readonly description: string;
  files(): Promise<readonly FoundationContentFile[]>;
  /**
   * WHICH authoring mode this seed is authored in, and where each declared Spoke root is
   * (FOUNDATION-MULTISITE-M20).
   *
   * A seed is authored EITHER implicitly (no manifest: its root is its one Spoke, and the authored surfaces
   * sit directly in it) OR explicitly (a `spokes.json` manifest declaring 1..* Spoke roots beneath the
   * dedicated `spokes/` namespace, each carrying its OWN surfaces). WHICH of the two a real directory is —
   * and which spellings, identities and containment a declaration may have — is decided by the platform's
   * ONE Spoke-declaration authority, never here: an implementation resolves the real seed through that
   * authority and returns its answer as this pure value, so the use case can apply ONE rule to every root
   * without reading a manifest, touching a filesystem, or restating a single declaration rule.
   *
   * It is a METHOD rather than a property because resolving it may read the filesystem; a seed whose
   * manifest is contradictory or absent in both forms must FAIL here rather than be guessed at — the
   * authority refuses, and the refusal reaches the operator as an unusable seed.
   */
  topology(): Promise<InstallationSeedTopology>;
}

/**
 * THE TARGET ROOT, as far as establishment may see it: a place that can be inspected for safety and
 * written to, by root-relative path only.
 *
 * `inspect()` answers with the reasons the target may NOT be used, in the implementation's own words, and
 * an EMPTY list means safe. Every rule refuses rather than repairs: a target that already holds anything —
 * unrelated files, a previous incomplete establishment, or a running installation — is never overwritten,
 * and nothing is ever deleted to make room. The implementation also refuses the structurally impossible
 * (a target that is a file, not a directory; one that resolves outside the path it was given; one that
 * overlaps the source the content is being read from), because those facts are filesystem facts rather
 * than lifecycle decisions.
 */
export interface FoundationInstallationTarget {
  /** A description of the target root, for diagnostics. */
  readonly description: string;
  /** The reasons this target may not be established into. Empty means safe. */
  inspect(): Promise<readonly string[]>;
  /** Write these root-relative files beneath the target root. */
  write(files: readonly FoundationContentFile[]): Promise<void>;
}

/**
 * The one cryptographic mechanism a content digest needs.
 *
 * The ENCODING is the platform's shared contract (`@/core/foundation-release/content-digest.mjs`); only the
 * hashing is a technology, so only the hashing is injected. That keeps one encoding for every digest the
 * platform computes while leaving `src/core/**` free of Node builtins — core modules are bundled into the
 * client as well as the server.
 */
export interface FoundationContentHasher {
  /** Lowercase hex SHA-256 of exact bytes. */
  sha256Hex(bytes: Uint8Array): string;
}

/**
 * The one cryptographically secure entropy source establishment needs.
 *
 * Entity identity is minted ONCE at establishment. The source must answer cryptographically secure
 * bytes from the platform's entropy mechanism; core modules stay free of `node:crypto`, and a test
 * can inject a deterministic source without changing the contract.
 */
export interface FoundationEntropySource {
  /** Exactly `byteLength` cryptographically secure random bytes. */
  randomBytes(byteLength: number): Uint8Array;
}

/**
 * Everything one establishment needs. Assembled by the caller (the operator surface, a test, a future
 * controller) and injected whole, so the use case stays a pure orchestration of ports.
 *
 * The clock, the acquisition source and the operational state store are FOUNDATION-B4A's own ports,
 * deliberately reused: establishment drives the approved lifecycle contract and writes the approved record
 * through the same seams every future mechanic will use.
 */
export interface FoundationEstablishmentDependencies {
  /** When things happened — the domain never reads a clock itself. */
  readonly clock: InstallationClock;
  /** How ONE immutable release is obtained and verified. */
  readonly acquisition: FoundationReleaseAcquisitionSource;
  /** The acquired release's payload content. */
  readonly payload: FoundationReleasePayloadSource;
  /** The authored installation material the caller supplies. */
  readonly seed: FoundationInstallationSeedSource;
  /** The one root establishment may write beneath. */
  readonly target: FoundationInstallationTarget;
  /** THIS installation's durable operational record (the completion marker). */
  readonly store: InstallationOperationalStateStore;
  /** The one cryptographic mechanism a content digest needs. */
  readonly hasher: FoundationContentHasher;
  /** The one source an ordinary establishment mints a permanent Entity identity from. */
  readonly entropy: FoundationEntropySource;
}
