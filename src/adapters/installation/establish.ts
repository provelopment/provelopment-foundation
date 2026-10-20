/**
 * THE COMPOSITION ROOT OF ESTABLISHMENT (FOUNDATION-B4B)
 * =====================================================
 *
 * Where the use case's ports become concrete, and the ONLY place that decides which implementations an
 * operator gets: a local release directory, an authored capsule directory, the system clock, the target
 * root's guarded writer, the target installation's operational record, and `node:crypto` for hashing.
 *
 * It also resolves the two paths the ports deliberately do not carry: the installation's capsule directory
 * (through the platform's own authority — never spelled here) and the record's location inside it. The
 * application layer stays free of `node:path` and of any concrete adapter, and a future caller that wants a
 * different acquisition mechanism (a GitHub downloader, an archive reader, a mirror) writes its own
 * composition rather than changing establishment's semantics.
 */
import path from "node:path";
import { randomBytes } from "node:crypto";

import {
  establishFoundationInstallation,
  type FoundationEstablishmentOutcome,
} from "@/application/establish-foundation-installation";
import type { InstallationOperationalStateStore } from "@/application/foundation-installation-ports";
import { INSTALLATION_OPERATIONAL_STATE_FILE_NAME } from "@/core/foundation-installation/model";

import { DirectorySeedSource } from "./directory-seed-source";
import { LocalReleaseSource } from "./local-release-source";
import { sha256Hex } from "./node-content-files";
import { NodeInstallationTarget } from "./node-installation-target";
import { NodeOperationalStateStore } from "./node-operational-state-store";

/** Everything an operator supplies on the command line, resolved to what the use case needs. */
export interface EstablishInstallationFromDirectoriesOptions {
  /** The immutable Foundation release identity to establish from. */
  readonly release: string;
  /** The directory holding that release's payload (a constructed or unpacked release). */
  readonly payloadDirectory: string;
  /** The directory holding the authored installation material (one capsule's worth). */
  readonly seedDirectory: string;
  /** The directory that becomes this installation's root. It must be absent or empty. */
  readonly targetRoot: string;
  /**
   * The installation's capsule: the ONE directory inside the target root that holds its authored material.
   * The operator surface asks the platform's own authority for it and passes the answer in, because
   * `src/**` may not import the build-selection authority (it touches `node:fs`).
   */
  readonly capsuleDirectory: string;
  /** The installation's own name, recorded in its operational record. */
  readonly installationName: string;
  /** The installation's OWN repository/authority, recorded in its operational record. */
  readonly installationRepository: string;
  /** Which work is establishing it, recorded in its adoption record. */
  readonly establishedBy: string;
}

/** The target installation's operational record file, inside its capsule. */
export function installationOperationalStateFile(targetRoot: string, capsuleDirectory: string): string {
  return path.join(path.resolve(targetRoot), capsuleDirectory, INSTALLATION_OPERATIONAL_STATE_FILE_NAME);
}

/** Establish an installation from directories on this machine. */
export async function establishInstallationFromDirectories(
  options: EstablishInstallationFromDirectoriesOptions,
): Promise<FoundationEstablishmentOutcome> {
  const targetRoot = path.resolve(options.targetRoot);
  const payload = new LocalReleaseSource({ payloadDirectory: options.payloadDirectory });
  const seed = new DirectorySeedSource({ seedDirectory: options.seedDirectory });
  const record = installationOperationalStateFile(targetRoot, options.capsuleDirectory);

  const store: InstallationOperationalStateStore = new NodeOperationalStateStore({
    root: targetRoot,
    file: record,
  });

  return establishFoundationInstallation(
    {
      release: options.release,
      targetRoot,
      capsuleDirectory: options.capsuleDirectory,
      establishedBy: options.establishedBy,
      installation: { name: options.installationName, repository: options.installationRepository },
    },
    {
      clock: { now: () => new Date() },
      acquisition: payload,
      payload,
      seed,
      target: new NodeInstallationTarget({
        root: targetRoot,
        capsuleDirectory: options.capsuleDirectory,
        protectedRoots: [path.resolve(options.payloadDirectory), path.resolve(options.seedDirectory)],
      }),
      store,
      hasher: { sha256Hex },
      entropy: { randomBytes: (byteLength) => Uint8Array.from(randomBytes(byteLength)) },
    },
  );
}
