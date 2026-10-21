/**
 * A DISPOSABLE COPY OF THE SELECTED DEPLOYMENT (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 * =============================================================================
 *
 * An AUTHORING experiment — planting a page, adding a dictionary, editing a configuration — must have
 * somewhere to write, and a deployment's shipped config, dictionaries, pages and artwork are not it.
 * This is the one way a deployment-scope test gets writable deployment state:
 *
 *     copy the deployment the AUTHORITY selected into OS temp, then SELECT THE COPY through the
 *     authority's own test-only override (`FOUNDATION_DEPLOYMENT_ROOT` + the `override` layout).
 *
 * No second path seam is invented: the copy is selected exactly the way `tests/setup/synthetic-deployment.ts`
 * selects the synthetic deployment (ISO-H2), so `@/config` and `@/config/deployment-root` describe the copy
 * — and because the copy is byte-identical, an acceptance assertion made against it means what it says
 * about the real deployment (the fidelity check below refuses a copy that is not).
 *
 * CALL IT BEFORE IMPORTING ANYTHING THAT READS THE CONFIG SURFACE. `@/config` and `@/config/deployment-root`
 * read the selection at module load and cache it, so a test file that already imported them (or whose setup
 * file did) must `vi.resetModules()` and DYNAMICALLY import the app modules afterwards — see
 * `deployment/tests/integration/page-authoring.test.ts`, which does exactly that.
 *
 * It lives in the Foundation's own test support (`tests/support/**`) rather than inside the deployment: the
 * copy mechanism is platform test infrastructure, not deployment content, and both trees may use it.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  DEPLOYMENT_CONFIG_ENV,
  DEPLOYMENT_LAYOUT_ENV,
  DEPLOYMENT_ROOT_ENV,
  deploymentEnvironment,
  resolveDeploymentForBuild,
} from "../../src/config/deployment-build.mjs";

import { captureProductionStateManifest, productionStateDrift } from "./production-state-manifest";
import { LEGACY_TEST_RUNTIME_ENV } from "../../src/app/[[...segments]]/legacy-test-runtime";

/**
 * The surfaces a copy must reproduce byte-for-byte for an authoring experiment to mean anything.
 *
 * The legacy authored locations AND the explicit ones, so the check covers whichever form the selected
 * Installation uses: in an explicit Installation the website material lives under `spokes/**` (and the
 * four legacy locations are simply absent, contributing nothing).
 */
const FIDELITY_SURFACES = [
  "site.config.json",
  "config",
  "content/pages",
  "content/assets",
  "spokes.json",
  "spokes",
] as const;

export interface DisposableDeployment {
  /** The temporary root to hand to `FOUNDATION_DEPLOYMENT_ROOT`. */
  readonly root: string;
  /** The deployment this copy was taken from — the real selected one, never written to. */
  readonly sourceRoot: string;
  /** Deletes the temporary copy (call it in a `finally`/`afterAll`). */
  cleanup(): void;
}

/**
 * Copies the SELECTED deployment into a fresh temporary root and makes the copy THIS process's
 * deployment. Returns the copy; throws — loudly, before anything else — when the copy is not faithful,
 * because a silently different copy would make every assertion made against it meaningless.
 */
export function selectDisposableDeploymentCopy(): DisposableDeployment {
  const source = resolveDeploymentForBuild(process.env, process.cwd());
  const root = mkdtempSync(path.join(tmpdir(), "foundation-deployment-authoring-"));
  cpSync(source.root, root, { recursive: true });
  // The authoring/legacy preservation suites exercise the released page resolver through a
  // disposable copy. The explicit EFS manifest is a publication authority, so it must not travel
  // into that copy: the real deployment keeps it, and the copy remains the legacy authoring subject.
  rmSync(path.join(root, "efs"), { recursive: true, force: true });

  const fidelity = productionStateDrift(
    captureProductionStateManifest(source.root, FIDELITY_SURFACES),
    captureProductionStateManifest(root, FIDELITY_SURFACES),
  );
  if (fidelity.length > 0) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      "FOUNDATION-DEPLOYMENT-ISO-B3C2B: the disposable copy of the selected deployment does not " +
        `reproduce its authored state byte-for-byte, so it cannot stand in for it. Difference:\n  ` +
        fidelity.join("\n  "),
    );
  }

  process.env[DEPLOYMENT_ROOT_ENV] = root;
  process.env[DEPLOYMENT_LAYOUT_ENV] = "override";
  // The authoring/preservation suite drives the isolated released Page/locale utility against this
  // copy. It is a test utility only (`legacyTestRuntimeEnabled` refuses NODE_ENV=production).
  process.env[LEGACY_TEST_RUNTIME_ENV] = "1";
  // The compatibility configuration binding is published ONLY when the Installation HAS one. A MULTI-Spoke
  // Installation inlines no single configuration at all (S3F2A/M16 — there is no default Spoke to inline),
  // so `siteConfigFile` is empty and reading it would fail for exactly the deployment form the multi-Spoke
  // proof is about. The `deploymentEnvironment(...)` call below publishes the copy's OWN answer either way.
  if (source.siteConfigFile !== "") {
    process.env[DEPLOYMENT_CONFIG_ENV] = readFileSync(source.siteConfigFile, "utf8");
  }

  // S3F1 — the copy is a whole Installation, so the AUTHORING MODE and (when explicit) the sole Spoke's
  // root and runtime segment travel with it. Asked of the seam for the copy's own root, so the copy
  // describes itself rather than inheriting the source's answer.
  Object.assign(process.env, deploymentEnvironment(resolveDeploymentForBuild(process.env, process.cwd())));

  // LOUD, both ways: the authority must now answer with the copy, and the copy must not BE the source —
  // a writable test that silently kept writing to the real deployment is the defect this exists to end.
  const selected = resolveDeploymentForBuild(process.env, process.cwd());
  if (
    selected.layout !== "override" ||
    path.resolve(selected.root) !== path.resolve(root) ||
    path.resolve(root) === path.resolve(source.root)
  ) {
    rmSync(root, { recursive: true, force: true });
    throw new Error(
      "FOUNDATION-DEPLOYMENT-ISO-B3C2B: the disposable deployment copy was not selected " +
        `(got "${selected.layout}" at "${selected.root}", expected the override root "${root}").`,
    );
  }

  return {
    root,
    sourceRoot: source.root,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
