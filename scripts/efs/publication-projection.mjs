/**
 * PRODUCING THE VERIFIED PUBLICATION PROJECTION (R07)
 * ==================================================
 *
 * ONE production path, called by BOTH the build-preparation CLI (`validate-publications.mjs`) and the
 * request-boundary integration tests, so a test proves the real chain instead of an authored table.
 *
 * The authority is never re-implemented here. It is LOADED from the accepted TypeScript modules through
 * Vite's supported SSR module runner — the only mechanism in this repository able to execute them
 * unchanged (`next.config.ts` cannot resolve their extensionless imports; Node cannot resolve the `@`
 * alias). Vite is already a direct dependency, so this adds none.
 *
 * Verified facts only:
 *   `validateEfsManifest` / `loadEfsManifest`  the ONE manifest contract;
 *   `publicationOwnedBy`                      the ONE composite-identity ownership rule;
 *   `normalizeBindingHost`                    the ONE host normalization rule.
 */
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { createServer, createServerModuleRunner } from "vite";

import {
  efsManifestDigest,
  efsProjectionPath,
} from "../../src/config/deployment-build.mjs";

/**
 * Validate one Installation's EFS declarations and project its authorized publication claims.
 *
 * @param {{ root: string, manifestPath: string, spokeIdentities: readonly { id: string, spokeHubId?: string }[], repositoryRoot?: string }} input
 * @returns {Promise<{ status: "absent" } | { status: "refused", issues: string[] } | { status: "projected", claims: { host: string, spokeId: string, spokeHubId?: string }[] }>}
 */
export async function producePublicationProjection(input) {
  const repositoryRoot = input.repositoryRoot ?? process.cwd();
  const projectionPath = efsProjectionPath(input.root, repositoryRoot);

  // EFS-ABSENT: keep the released host-only rule, and leave no projection behind to be reused.
  if (!existsSync(input.manifestPath)) {
    rmSync(projectionPath, { force: true });
    return { status: "absent" };
  }

  const server = await createServer({
    configFile: false,
    root: repositoryRoot,
    appType: "custom",
    logLevel: "error",
    resolve: { alias: { "@": path.join(repositoryRoot, "src") } },
    server: { middlewareMode: true, hmr: false, watch: null },
  });

  try {
    const runner = createServerModuleRunner(server.environments.ssr);
    const { loadEfsManifest } = await runner.import("/src/config/efs/manifest.ts");
    const { normalizeBindingHost, publicationOwnedBy } = await runner.import(
      "/src/core/efs/publication.ts",
    );

    const result = await loadEfsManifest(input.manifestPath);
    if (!result.ok) {
      rmSync(projectionPath, { force: true });
      return { status: "refused", issues: [...result.issues] };
    }

    /** @type {{ host: string, spokeId: string, spokeHubId?: string }[]} */
    const claims = [];
    const issues = [];
    const seen = new Set();

    for (const publication of result.manifest.publications) {
      const matches = input.spokeIdentities.filter((spoke) =>
        publicationOwnedBy(
          { spokeId: publication.spokeId, spokeHubId: publication.spokeHubId },
          spoke,
        ),
      );
      if (matches.length !== 1) {
        issues.push(
          matches.length === 0
            ? `publication "${publication.id}" names Spoke "${publication.spokeId}"` +
                (publication.spokeHubId === undefined
                  ? ", which no flat Spoke in this Installation owns"
                  : ` in Hub "${publication.spokeHubId}", which does not exist`)
            : `publication "${publication.id}" matches ${matches.length} Spokes ambiguously`,
        );
        continue;
      }
      for (const binding of publication.bindings) {
        let host;
        try {
          host = normalizeBindingHost(binding.host);
        } catch (error) {
          issues.push(`binding "${binding.id}": ${error.message}`);
          continue;
        }
        const claim =
          publication.spokeHubId === undefined
            ? { host, spokeId: publication.spokeId }
            : { host, spokeId: publication.spokeId, spokeHubId: publication.spokeHubId };
        const key = JSON.stringify(claim);
        if (seen.has(key)) {
          // A duplicate claim cannot authorize: two publications naming one Spoke on one host are
          // indistinguishable at request time, so neither may be trusted.
          issues.push(`host "${host}" is claimed more than once for the same Spoke`);
          continue;
        }
        seen.add(key);
        claims.push(claim);
      }
    }

    if (issues.length > 0) {
      rmSync(projectionPath, { force: true });
      return { status: "refused", issues };
    }

    mkdirSync(path.dirname(projectionPath), { recursive: true });
    writeFileSync(
      projectionPath,
      JSON.stringify(
        {
          manifestPath: input.manifestPath,
          manifestDigest: efsManifestDigest(input.manifestPath),
          claims,
        },
        null,
        2,
      ),
      "utf8",
    );
    return { status: "projected", claims };
  } finally {
    await server.close();
  }
}
