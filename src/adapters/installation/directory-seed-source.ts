/**
 * THE AUTHORED INSTALLATION MATERIAL, READ FROM A DIRECTORY (FOUNDATION-B4B)
 * ==========================================================================
 *
 * The seed establishment materialises: one capsule's worth of authored material — `site.config.json`,
 * `config/i18n/**`, `content/**` — supplied by whoever is establishing the installation. Reading it is
 * deliberately dull: every regular file beneath the directory, verbatim, with links refused. What the seed
 * MUST and MUST NOT contain is a domain rule, applied by the use case
 * (`@/core/foundation-installation/establishment`), not a reading policy.
 *
 * It reads and never writes, and it remembers nothing, so a seed directory may be another installation's
 * authored material, a template, or an export — the new installation inherits the AUTHORED material and
 * nothing else, and the source becomes irrelevant the moment establishment completes.
 */
import path from "node:path";

import type { FoundationContentFile, FoundationInstallationSeedSource } from "@/application/foundation-establishment-ports";
import type { InstallationSeedTopology } from "@/core/foundation-installation";
import { resolveInstallationSpokeRoots } from "@/config/spoke-roots";

import { readContentFiles } from "./node-content-files";

/** The directory holding the authored installation material. */
export interface DirectorySeedSourceOptions {
  /** The absolute (or resolvable) directory holding the authored capsule material. */
  readonly seedDirectory: string;
}

export class DirectorySeedSource implements FoundationInstallationSeedSource {
  readonly description: string;

  private readonly seedDirectory: string;

  constructor(options: DirectorySeedSourceOptions) {
    this.seedDirectory = path.resolve(options.seedDirectory);
    this.description = `an authored installation capsule (${this.seedDirectory})`;
  }

  /** The authored material, verbatim, root-relative and byte-wise ordered. */
  async files(): Promise<readonly FoundationContentFile[]> {
    return readContentFiles(this.seedDirectory);
  }

  /**
   * WHICH AUTHORING MODE THIS SEED IS AUTHORED IN, AND WHERE ITS SPOKE ROOTS ARE (FOUNDATION-MULTISITE-M20).
   *
   * The DIRECTORY is the only thing that can answer this, so the answer is resolved HERE, at the adapter
   * boundary, and passed inward as PURE DATA — the pure establishment rules then speak about "every declared
   * Spoke root" without touching a filesystem, and the use case stays free of `node:fs` and of any concrete
   * adapter.
   *
   * THE AUTHORITY IS NOT RESTATED: `resolveInstallationSpokeRoots` is the platform's ONE Spoke-declaration
   * and root contract (the same call the build selection seam makes), so:
   *
   *   no manifest            legacy implicit — the root IS the one Spoke, and the authored surfaces sit in it
   *   1..* declared roots    explicit — each root carries its OWN authored surfaces
   *   both ways              REFUSED by the authority, and the refusal reaches the operator through the use
   *   neither way            case as an unusable seed
   *
   * No precedence rule, no default Spoke, no directory scan and no manifest parsing are added here: a
   * directory under `spokes/` that no entry declares is inert, exactly as the accepted contract says.
   */
  async topology(): Promise<InstallationSeedTopology> {
    const roots = resolveInstallationSpokeRoots(this.seedDirectory);
    if (roots.mode === "legacy") return { mode: "legacy" };

    return {
      mode: "explicit",
      spokes: roots.descriptors.map((descriptor) => ({
        id: descriptor.id,
        ...(descriptor.spokeHubId === undefined ? {} : { spokeHubId: descriptor.spokeHubId }),
        // SEED-relative, because the pure rules address authored surfaces by seed-relative path. Which
        // spellings a locator may have was already decided by the authority above — this converts its
        // resolved answer, it does not judge it.
        locator: path.relative(this.seedDirectory, descriptor.root).split(path.sep).join("/"),
      })),
    };
  }
}
