/**
 * A DISPOSABLE EXPLICIT EFS INSTALLATION FOR OWNERSHIP TESTS (`S3-E3-R05`)
 * =========================================================================
 *
 * EFS ownership must be proved against a REAL declared Spoke hierarchy, not a mock that skips the
 * check. This helper materialises a temporary Installation whose `spokes.json` declares the Spokes
 * the test's manifest names, with each Spoke carrying the repository's synthetic authored material
 * (valid `site.config.json`, dictionaries, pages and assets) and a distinct canonical host.
 *
 * It is test infrastructure: the tree lives under OS temp and is removed by exact ownership.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEPLOYMENT_CONFIG_ENV,
  DEPLOYMENT_LAYOUT_ENV,
  DEPLOYMENT_ROOT_ENV,
  deploymentEnvironment,
  resolveDeploymentForBuild,
} from "../../src/config/deployment-build.mjs";

const SYNTHETIC = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

export type EfsInstallationSpec =
  | { readonly mode: "flat"; readonly spokes: readonly string[] }
  | {
      readonly mode: "hubs";
      readonly hubs: readonly { readonly id: string; readonly spokes: readonly string[] }[];
    };

export interface DisposableEfsInstallation {
  readonly root: string;
  cleanup(): void;
}

/** Copy the synthetic authored material into one declared Spoke root, with its own host. */
function writeSpoke(root: string, locator: string, hostname: string): void {
  const target = path.join(root, ...locator.split("/"));
  mkdirSync(target, { recursive: true });
  cpSync(path.join(SYNTHETIC, "config"), path.join(target, "config"), { recursive: true });
  cpSync(path.join(SYNTHETIC, "content"), path.join(target, "content"), { recursive: true });
  const config = JSON.parse(readFileSync(path.join(SYNTHETIC, "site.config.json"), "utf8")) as {
    site: { url: string };
  };
  config.site.url = `https://${hostname}`;
  writeFileSync(path.join(target, "site.config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * Materialise an explicit Installation declaring exactly the supplied Spokes (flat or identified
 * with Hubs). The caller selects `root` as `FOUNDATION_DEPLOYMENT_ROOT` before loading runtime modules.
 *
 * CONSTRUCTION IS FAILURE-ATOMIC (`R04-C22-R03-R02`). This function allocates its root and then writes into it
 * before returning, so a write that throws would leave an allocated root that NO caller can dispose — the caller
 * never received the handle. The root is therefore removed here whenever population fails, and the ORIGINAL error
 * is rethrown unchanged; if even that removal fails, both failures are reported rather than the leak being silent.
 * After a successful return the root belongs to the caller, whose `cleanup()` removes it.
 */
export function materializeEfsInstallation(spec: EfsInstallationSpec): DisposableEfsInstallation {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-efs-installation-"));

  try {
    const declarations: { id: string; root: string; spokeHubId?: string }[] = [];

    if (spec.mode === "flat") {
      for (const spoke of spec.spokes) {
        const locator = `spokes/${spoke}`;
        writeSpoke(root, locator, `${spoke}.fixture.test`);
        declarations.push({ id: spoke, root: locator });
      }
      writeFileSync(
        path.join(root, "spokes.json"),
        `${JSON.stringify({ spokes: declarations }, null, 2)}\n`,
        "utf8",
      );
    } else {
      const hubs = spec.hubs.map((hub) => ({
        id: hub.id,
        spokes: hub.spokes.map((spoke) => {
          const locator = `spokes/${hub.id}-${spoke}`;
          writeSpoke(root, locator, `${hub.id}-${spoke}.fixture.test`);
          return { id: spoke, root: locator };
        }),
      }));
      writeFileSync(
        path.join(root, "spokes.json"),
        `${JSON.stringify({ spokeHubs: hubs }, null, 2)}\n`,
        "utf8",
      );
    }
  } catch (error) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "could not populate a disposable Installation AND could not remove the partially written root",
      );
    }
    throw error;
  }

  return {
    root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}


/**
 * Make `root` the deployment of THIS test process through the build authority's own override,
 * including the host-routing/environment answer. Call `vi.resetModules()` afterwards so modules
 * that cache deployment state describe this Installation rather than the generic setup's.
 */
export function selectEfsInstallation(root: string): void {
  process.env[DEPLOYMENT_ROOT_ENV] = root;
  process.env[DEPLOYMENT_LAYOUT_ENV] = "override";
  const resolved = resolveDeploymentForBuild(process.env, process.cwd());
  const environment = deploymentEnvironment(resolved);
  for (const [name, value] of Object.entries(environment)) {
    if (typeof value === "string") process.env[name] = value;
  }
  // An explicit Installation has no installation-wide configuration. Remove the generic setup's
  // inlined synthetic configuration so nothing can read it as this Installation's own.
  if (resolved.siteConfigFile === "") delete process.env[DEPLOYMENT_CONFIG_ENV];
}
