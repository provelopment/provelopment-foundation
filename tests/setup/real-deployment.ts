/**
 * THE DEPLOYMENT ACCEPTANCE TEST IDENTITY (FOUNDATION-DEPLOYMENT-ISO-H2)
 * =====================================================================
 *
 * The `deployment` Vitest project (`deployment/tests/**` — the installed deployment's own test
 * workspace since ISO-B2A) tests the REAL selected deployment, through the same ONE authority the
 * production build uses (`src/config/deployment-build.mjs`):
 *
 *     capsule     `<repo>/deployment/site.config.json` exists → the capsule owns the deployment
 *     override    `FOUNDATION_DEPLOYMENT_ROOT` is set (dev/test) → that directory owns it
 *     repository  otherwise → `<repo>` itself
 *
 * This is the ONLY place a test run resolves a real deployment, and it is why the generic project can
 * run with no deployment installed at all: a missing deployment fails THIS suite loudly, with the
 * authority's own message, and never silently falls back to some other identity.
 */
import {
  deploymentEnvironment,
  efsManifestPath,
  installationSpokes,
  resolveDeploymentForBuild,
} from "@/config/deployment-build.mjs";
import { deploymentPaths } from "@/config/deployment-root";

import { producePublicationProjection } from "../../scripts/efs/publication-projection.mjs";

const resolved = resolveDeploymentForBuild();

/**
 * R07 — THE DEPLOYMENT'S OWN PROJECTION, PRODUCED THE WAY THE BUILD PRODUCES IT.
 *
 * Presentation-asset permission is granted only from a VALIDATED manifest, so a deployment run must have
 * this deployment's verified projection before any runtime module reads its environment. Deriving it here
 * — from the deployment the authority just selected — is what makes the result deterministic: it can never
 * depend on a projection some earlier build happened to leave behind.
 */
const projection = await producePublicationProjection({
  root: resolved.root,
  manifestPath: efsManifestPath(resolved.root, process.env),
  spokeIdentities: (installationSpokes(resolved.root).spokes ?? []).map((spoke) => ({
    id: spoke.id,
    spokeHubId: spoke.spokeHubId,
  })),
});
if (projection.status === "refused") {
  throw new Error(
    `this deployment's EFS manifest must validate: ${projection.issues.join(" | ")}`,
  );
}

// Re-resolved AFTER the projection exists: `resolveDeploymentForBuild()` reads it, so the environment this
// suite publishes must be derived from the projection it just produced — not from the file's absence.
Object.assign(process.env, deploymentEnvironment(resolveDeploymentForBuild()));

// One identity per run: the deployment the authority selected must be the one the runtime authority
// publishes, so a deployment test can never read a mixture of two deployments. Paths are published
// with forward slashes by the runtime authority while the build authority composes them with
// `path.join` (both are valid on every platform Node/Next support), so compare normalised.
const published = deploymentPaths();
const normalise = (value: string) => value.replace(/\\/g, "/");
if (published.layout !== resolved.layout || normalise(published.root) !== normalise(resolved.root)) {
  throw new Error(
    "FOUNDATION-DEPLOYMENT-ISO-H2: the deployment test project published a different deployment " +
      `than the build authority selected ("${resolved.layout}" at "${resolved.root}" vs ` +
      `"${published.layout}" at "${published.root}").`,
  );
}
