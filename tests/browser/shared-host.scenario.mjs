/**
 * THE SHARED-HOST PRODUCTION ACCEPTANCE SCENARIO (FOUNDATION R09 5)
 * ================================================================
 *
 * ONE synthetic Installation, TWO identified Spoke Hubs, SIX declared Spokes (five published), served by a
 * REAL `next dev` process. Every assertion travels the supported path - src/proxy.ts -> exact hostname
 * claim -> the public catch-all route -> ONE explicit SpokeRuntimeContext -> renderer and asset pipeline.
 * Nothing calls the composition directly, and nothing sets the private selection header except the ONE check
 * that proves a forged one is refused.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import path from "node:path";

import {
  efsManifestSelection,
  efsProjectionPath,
  installationSpokes,
} from "../../src/config/deployment-build.mjs";
import { producePublicationProjection } from "../../scripts/efs/publication-projection.mjs";
import {
  SHARED_HOST,
  SHARED_HOST_MEMBERS,
  spokeRootOf,
  materializeSharedHostInstallation,
} from "../support/shared-host-installation.mjs";
import { scratchRoot } from "./scratch.mjs";
import { buildPlan } from "../../scripts/sync-runtime-assets.mjs";

export const id = "shared-host";

const PORT_OFFSETS = [71, 72, 73];
const SPOKE_SELECTION_HEADER = "x-foundation-spoke-segment";
const PUBLISHED = ["alpha", "beta", "gamma", "delta", "epsilon"];

const MEMBERS = [
  {
    ...SHARED_HOST_MEMBERS[0],
    publications: [
      { prefix: "alpha", entityId: SHARED_HOST_MEMBERS[0].entityId },
      { prefix: "alpha-second", entityId: "e_00000000000000000000000007" },
    ],
  },
  {
    ...SHARED_HOST_MEMBERS[1],
    publications: [
      { prefix: "beta", entityId: SHARED_HOST_MEMBERS[1].entityId },
      { prefix: "beta-alias", entityId: SHARED_HOST_MEMBERS[1].entityId, canonical: false },
    ],
  },
  SHARED_HOST_MEMBERS[2],
  SHARED_HOST_MEMBERS[3],
  SHARED_HOST_MEMBERS[4],
  {
    spokeHubId: "group-two",
    spokeId: "zeta",
    prefix: "zeta",
    entityId: "e_00000000000000000000000006",
    marker: "Zeta",
    publications: [],
  },
];

function request({ port, pathname, host = SHARED_HOST, headers = {} }) {
  return new Promise((resolve) => {
    const pending = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host, ...headers } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () =>
          resolve({ status: response.statusCode, headers: response.headers, body }),
        );
      },
    );
    pending.on("error", () => resolve({ status: 0, headers: {}, body: "" }));
    pending.end();
  });
}

function syncAssets(root) {
  const environment = { ...process.env };
  if (root === null) delete environment.FOUNDATION_DEPLOYMENT_ROOT;
  else environment.FOUNDATION_DEPLOYMENT_ROOT = root;
  const result = spawnSync(process.execPath, [path.join("scripts", "sync-runtime-assets.mjs")], {
    cwd: process.cwd(),
    env: environment,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("asset synchronisation failed: " + String(result.stderr));
  }
}

async function waitForSharedHost(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "no attempt";
  while (Date.now() < deadline) {
    // The readiness coordinate is a PUBLISHED Spoke's Home LOCALE ROOT — the only public address that Home has
    // (GEO-03 R04-C23; the reserved `home` segment is refused, so waiting on it could only ever time out).
    // A bare `200` is not readiness either: the answer must carry THIS Spoke's own marker, so an unrelated
    // server, or a different publication on the same Host, cannot stand in for the shared host under test.
    const probe = await request({ port, pathname: "/alpha/en-001" });
    const intended = probe.body.includes(MEMBERS[0].marker);
    if (probe.status === 200 && intended) return;
    last = "status=" + probe.status + " intended-publication=" + intended;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("shared host never served /alpha: " + last);
}
/**
 * Make each Spoke NAME its own presentation namespace.
 *
 * The namespace segment is the authority's COMPOSITE encoding (Hub + Spoke), so it is read from the canonical
 * plan rather than re-derived. Without this every Spoke would name the platform namespace, and "each Spoke
 * serves its own artwork" could not be observed over HTTP at all.
 */
/**
 * Does a rendered shell name THIS Spoke's presentation namespace?
 *
 * A URL in a document may carry the composite segment verbatim or percent-encode the `+` that joins its
 * parts, and both forms address the same namespace - so both are accepted, and NEITHER owner's is accepted
 * for the other Spoke.
 */
function namesNamespace(body, segment) {
  return (
    body.includes("/spokes/" + segment + "/assets/") ||
    body.includes("/spokes/" + segment.replace(/\+/g, "%2B") + "/assets/")
  );
}
function nameOwnNamespaces(installation, members) {
  const segments = {};
  for (const member of members) {
    const plan = buildPlan(installation.root).filter(
      (row) =>
        typeof row.namespace === "string" &&
        row.namespace.startsWith("spoke:") &&
        row.namespace.split("+").pop() === member.spokeId,
    );
    const match = plan.length === 0 ? null : [null, plan[0].namespace.slice("spoke:".length)];
    if (match === null) throw new Error("the canonical plan has no namespace for " + member.spokeId);
    segments[member.spokeId] = match[1];
    const configFile = path.join(spokeRootOf(installation.root, member), "site.config.json");
    const config = JSON.parse(readFileSync(configFile, "utf8"));
    const base = "https://" + SHARED_HOST;
    config.assets = {
      ...config.assets,
      favicon: base + "/spokes/" + match[1] + "/assets/favicon.svg",
      logo: base + "/spokes/" + match[1] + "/assets/logo-header.svg",
    };
    writeFileSync(configFile, JSON.stringify(config, null, 2) + "\n", "utf8");
  }
  return segments;
}
async function start(harness, installation) {


  const selection = efsManifestSelection(installation.root, {});
  const spokeIdentities = (installationSpokes(installation.root).spokes ?? []).map((spoke) => ({
    id: spoke.id,
    spokeHubId: spoke.spokeHubId,
  }));

  const projected = await producePublicationProjection({
    root: installation.root,
    manifestPath: selection.path,
    explicit: false,
    spokeIdentities,
    repositoryRoot: harness.repositoryRoot,
  });
  if (projected.status !== "projected") {
    throw new Error("projection refused: " + String((projected.issues ?? []).join("; ")));
  }

  syncAssets(installation.root);
  process.env.FOUNDATION_DEPLOYMENT_ROOT = installation.root;
  process.env.FOUNDATION_EFS_MANIFEST = selection.path;
  process.env.FOUNDATION_EFS_CAPSULE = installation.capsule;

  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, {
      synthetic: false,
      deploymentRoot: installation.root,
    });
    try {
      await waitForSharedHost(port, 240000);
      return { server, port, projected };
    } catch (error) {
      last = error;
      if (server !== null) await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no shared-host port answered");
}

export async function run(chrome, harness) {
  const rows = [];
  // CAPTURED BEFORE any scenario writes to it, so teardown can restore exactly (R10 s4).
  const previousEnv = {};
  for (const name of ["FOUNDATION_DEPLOYMENT_ROOT", "FOUNDATION_EFS_MANIFEST", "FOUNDATION_EFS_CAPSULE"]) {
    previousEnv[name] = process.env[name];
  }
  // PREPARATION IS INSIDE THE PROTECTED REGION (R11 C). An exception while materialising the Installation
  // or while rewiring its presentation namespaces is exactly the failure that used to leave a test-owned
  // Installation and mutated configuration behind, because the `finally` only began afterwards. Everything
  // that MUTATES state now runs under the guard, and teardown tolerates a run that stopped half-prepared.
  let installation = null;
  let segments = null;
  let server = null;
  const problems = [];
  try {
    installation = materializeSharedHostInstallation({
      root: mkdtempSync(path.join(scratchRoot(), "foundation-shared-host-")),
      members: MEMBERS,
    });
    segments = nameOwnNamespaces(installation, MEMBERS);
    const started = await start(harness, installation);
    server = started.server;
    const port = started.port;

    harness.check(
      rows,
      "the projection authorizes one permission per published Spoke",
      started.projected.claims.length === PUBLISHED.length,
      "claims=" + started.projected.claims.length,
    );

    for (const prefix of PUBLISHED) {
      const index = PUBLISHED.indexOf(prefix);
      // The published Home of THIS Spoke, at its declared prefix and locale — the locale root, which is Home's
      // only public address (GEO-03 R04-C23).
      const page = await request({ port, pathname: "/" + prefix + "/en-001" });
      const marker = MEMBERS[index].marker;
      harness.check(
        rows,
        prefix + ": serves its own Entity (200 + own marker)",
        page.status === 200 && page.body.includes(marker),
        "status=" + page.status + " marker=" + marker,
      );
      const leaked = MEMBERS.some((member) => member.marker !== marker && page.body.includes(member.marker + " Home"));
      harness.check(rows, prefix + ": no other owner's home marker leaks", !leaked, "isolated");
    }
    const second = await request({ port, pathname: "/alpha-second/en-001" });
    harness.check(
      rows,
      "a Spoke publishing two Entities serves the second at its own prefix",
      second.status === 200 && second.body.includes("Alpha alpha-second"),
      "status=" + second.status,
    );

    const alias = await request({ port, pathname: "/beta-alias/en-001/about" });
    harness.check(
      rows,
      "an alias binding resolves for the same Entity",
      alias.status === 200 && alias.body.includes("About Beta"),
      "status=" + alias.status,
    );
    // ---- presentation artwork: the Spoke's OWN composite namespace, owner-specific BYTES ------------
    // The namespace SEGMENT is the authority's composite encoding, so it is READ from the canonical plan
    // (`spokeNamespacePlan`) and never re-derived here. Each Spoke's config names its own namespace (see
    // `nameOwnNamespaces`), so the rendered shell is what points a browser at the artwork - and the BYTES
    // are what we judge, not a marker string.
    const alphaHome = await request({ port, pathname: "/alpha/en-001" });
    const betaHome = await request({ port, pathname: "/beta/en-001" });
    harness.check(
      rows,
      "no document references ANOTHER owner's presentation namespace",
      !namesNamespace(alphaHome.body, segments.beta) &&
        !namesNamespace(betaHome.body, segments.alpha),
      "alpha=" + segments.alpha + " beta=" + segments.beta +
        " spokeUrlsInAlpha=" + String((alphaHome.body.match(/\/spokes\/[^"]*/g) ?? []).slice(0, 3)),
    );
    const alphaFavicon = await request({ port, pathname: "/spokes/" + segments.alpha + "/assets/favicon.svg" });
    const betaFavicon = await request({ port, pathname: "/spokes/" + segments.beta + "/assets/favicon.svg" });
    harness.check(
      rows,
      "published presentation assets are 200 with OWNER-SPECIFIC bytes",
      alphaFavicon.status === 200 &&
        betaFavicon.status === 200 &&
        alphaFavicon.body.includes("Alpha") &&
        betaFavicon.body.includes("Beta") &&
        alphaFavicon.body !== betaFavicon.body,
      "status=" + alphaFavicon.status + "/" + betaFavicon.status,
    );
    harness.check(
      rows,
      "a DECLARED but UNPUBLISHED Spoke's presentation asset is refused",
      (await request({ port, pathname: "/spokes/" + segments.zeta + "/assets/favicon.svg" })).status !== 200,
      "segment=" + segments.zeta,
    );
    harness.check(
      rows,
      "a FOREIGN Spoke namespace is refused on this host",
      (await request({ port, pathname: "/spokes/hub+group-one+omega/assets/favicon.svg" })).status !== 200,
      "foreign namespace",
    );
    // THE ADDRESS IS PART OF THE AUTHORIZATION (R04-C24). The reserved tree is a LITERAL path: a case variant of it
    // must not reach the generated files through a case-insensitive filesystem, where it would hand an owner's
    // artwork to a Host whose publication never named that owner. The control is the SAME file, served by the
    // namespace's own claim, so this can never pass merely because the file is missing.
    const alphaLogoDeclared = await request({
      port,
      pathname: "/spokes/" + segments.alpha + "/assets/logo-header.svg",
    });
    const alphaLogoFolded = await request({
      port,
      pathname: "/SPOKES/" + segments.alpha + "/assets/logo-header.svg",
    });
    harness.check(
      rows,
      "a case variant of the reserved asset tree is refused, while its declared spelling serves",
      alphaLogoDeclared.status === 200 &&
        alphaLogoDeclared.body.includes("Alpha") &&
        alphaLogoFolded.status !== 200,
      "declared=" + alphaLogoDeclared.status + " variant=" + alphaLogoFolded.status,
    );
    // The unpublished Spoke's namespace IS on disk — the synchronizer writes every DECLARED Spoke — so the
    // refusals below are about authorization, not about an absent file, and they must hold for every spelling.
    for (const pathname of [
      "/spokes/" + segments.zeta + "/assets/favicon.svg",
      "/SPOKES/" + segments.zeta + "/assets/favicon.svg",
    ]) {
      const answer = await request({ port, pathname });
      harness.check(
        rows,
        "an UNPUBLISHED Spoke's asset is refused in every spelling: " + pathname,
        answer.status !== 200,
        "status=" + answer.status,
      );
    }

    const rootPath = await request({ port, pathname: "/" });
    harness.check(
      rows,
      "the shared host invents no homepage: / is neither a page nor a redirect",
      rootPath.status !== 200 && rootPath.headers.location === undefined,
      "status=" + rootPath.status,
    );

    // The refusals below are about a PUBLICATION, a HOST or a PREFIX — never about the reserved `home` segment —
    // so each probes a Home at its locale ROOT. Asking for the reserved suffix here would pass for the wrong
    // reason: `/home` is refused whether or not the Spoke, Host or prefix is valid (GEO-03 R04-C23-R02).
    const unpublished = await request({ port, pathname: "/zeta/en-001" });
    harness.check(rows, "a declared but UNPUBLISHED Spoke serves nothing", unpublished.status !== 200, "status=" + unpublished.status);

    const nearMiss = await request({ port, pathname: "/alphax/en-001" });
    harness.check(rows, "a near-miss prefix (/alphax) is not /alpha", nearMiss.status !== 200, "status=" + nearMiss.status);

    const foreign = await request({ port, pathname: "/alpha/en-001", host: "foreign.example.test" });
    harness.check(rows, "an unknown host is refused", foreign.status !== 200, "status=" + foreign.status);

    const forged = await request({
      port,
      pathname: "/alpha/en-001",
      headers: { [SPOKE_SELECTION_HEADER]: "epsilon" },
    });
    harness.check(
      rows,
      "a forged selection header does not move the request to another Spoke",
      forged.status === 200 && forged.body.includes("Alpha") && !forged.body.includes("Epsilon"),
      "status=" + forged.status,
    );

    const sitemap = await request({ port, pathname: "/sitemap.xml" });
    const missingPrefix = PUBLISHED.find((prefix) => !sitemap.body.includes("/" + prefix + "/"));
    harness.check(
      rows,
      "the sitemap advertises every published prefix and nothing unpublished",
      sitemap.status === 200 &&
        missingPrefix === undefined &&
        !sitemap.body.includes("zeta") &&
        !sitemap.body.includes("foreign.example.test"),
      "status=" + sitemap.status + " missing=" + String(missingPrefix),
    );

    const robots = await request({ port, pathname: "/robots.txt" });
    harness.check(rows, "robots.txt is served", robots.status === 200, "status=" + robots.status);
  } catch (error) {
    harness.check(
      rows,
      "the shared-host scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    // RESTORATION IS PART OF THE TEST (R10 s4): every step reports a failure instead of swallowing one, and
    // the process environment returns to EXACTLY its previous values - deleted only where it was absent -
    // so a later scenario can never inherit this Installation.
    try {
      if (server !== null) await harness.stopServer(server);
    } catch (error) {
      problems.push("stopServer: " + String(error));
    }
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    try {
      if (installation !== null) {
        rmSync(efsProjectionPath(installation.root, process.cwd()), { force: true });
        installation.cleanup();
      }
    } catch (error) {
      problems.push("cleanup: " + String(error));
    }
    try {
      syncAssets(null);
    } catch (error) {
      problems.push("asset restore: " + String(error));
    }
    harness.check(
      rows,
      "the scenario restored the environment, its Installation and the generated assets",
      problems.length === 0,
      problems.join(" | "),
    );
  }

  return rows;
}

export default { id, run };