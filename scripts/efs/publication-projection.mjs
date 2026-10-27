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
 * DEDUPLICATION IS NOT COLLISION (R08-A). A Spoke may publish SEVERAL Entities at distinct prefixes on one
 * host — `group-one/alpha` serving `shared.example.test/alpha` and `shared.example.test/beta` from two
 * Entities is two valid publications that confer ONE presentation-asset permission. Whether two BINDINGS
 * conflict is the accepted validator's question (`bindingIssues`), never a second rule invented here. This
 * function therefore merges equal host/Spoke permissions and NEVER refuses an Installation for repeating one.
 *
 * @param {{
 *   root: string,
 *   manifestPath: string,
 *   explicit?: boolean,
 *   spokeIdentities: readonly { id: string, spokeHubId?: string }[],
 *   repositoryRoot?: string,
 * }} input
 * @returns {Promise<{ status: "absent" } | { status: "refused", issues: string[] } | { status: "projected", claims: { host: string, spokeId: string, spokeHubId?: string }[] }>}
 */
export async function producePublicationProjection(input) {
  const repositoryRoot = input.repositoryRoot ?? process.cwd();
  const projectionPath = efsProjectionPath(input.root, repositoryRoot);

  if (!existsSync(input.manifestPath)) {
    // A stale projection must never outlive the state it described.
    rmSync(projectionPath, { force: true });
    // EXPLICITLY SELECTED BUT MISSING is a CONFIGURATION ERROR: refusing here is what stops the build, and
    // the reader independently grants nothing for this state, so the refusal cannot be bypassed.
    if (input.explicit === true) {
      return {
        status: "refused",
        issues: [`the explicitly selected EFS manifest does not exist: ${input.manifestPath}`],
      };
    }
    // GENUINE NON-EFS INSTALLATION: the released host-only rule stands.
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

    /**
     * ONE entry per host/Spoke PERMISSION. Two valid publications may confer the same one; that is
     * deduplication, not a collision, so equal keys merge instead of refusing the Installation.
     */
    /** @type {Map<string, { host: string, spokeId: string, spokeHubId?: string }>} */
    const permissions = new Map();
    const issues = [];

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
        // Sorted components make the key — and therefore the projection — independent of declaration order.
        const key = [claim.host, claim.spokeHubId ?? "", claim.spokeId].join("\u0000");
        if (!permissions.has(key)) permissions.set(key, claim);
      }
    }

    if (issues.length > 0) {
      rmSync(projectionPath, { force: true });
      return { status: "refused", issues };
    }

    // DETERMINISTIC: sorted by host, then Hub, then Spoke, so two builds of the same Installation produce
    // byte-identical permissions regardless of the order the manifest happened to declare them in.
    const claims = [...permissions.entries()]
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([, claim]) => claim);

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
