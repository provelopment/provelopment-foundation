/**
 * BUILD-PREPARATION VALIDATION OF EFS PUBLICATIONS (R07) — the CLI.
 *
 * `next.config.ts` is synchronous, so the verified projection is produced HERE, before `next build`, and
 * read synchronously by `src/config/deployment-build.mjs`. The production itself lives in
 * `publication-projection.mjs`, so the build and the tests exercise the SAME path.
 *
 * An invalid manifest is a LOUD failure: the build stops rather than publishing a deployment whose
 * permissions nobody can state.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  efsManifestPath,
  installationSpokes,
  resolveDeploymentForBuild,
} from "../../src/config/deployment-build.mjs";
import { producePublicationProjection } from "./publication-projection.mjs";

const repositoryRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

const resolved = resolveDeploymentForBuild(process.env, repositoryRoot);
const manifestPath = efsManifestPath(resolved.root, process.env);

// The Installation's OWN hierarchy is the ownership authority; `resolveDeploymentForBuild()` names only the
// Spoke whose configuration is inlined, so it cannot answer "which Spokes exist".
const spokeIdentities = (installationSpokes(resolved.root).spokes ?? []).map((spoke) => ({
  id: spoke.id,
  spokeHubId: spoke.spokeHubId,
}));

const outcome = await producePublicationProjection({
  root: resolved.root,
  manifestPath,
  spokeIdentities,
  repositoryRoot,
});

if (outcome.status === "absent") {
  console.log("EFS publication projection: this Installation declares no EFS manifest.");
} else if (outcome.status === "refused") {
  for (const issue of outcome.issues) console.error(`EFS publication refused: ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `EFS publication projection: ${outcome.claims.length} verified claim(s) from a validated manifest.`,
  );
}
