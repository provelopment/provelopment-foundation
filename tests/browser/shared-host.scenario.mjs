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
import { mkdtempSync, rmSync } from "node:fs";
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
  materializeSharedHostInstallation,
} from "../support/shared-host-installation.mjs";
import { scratchRoot } from "./scratch.mjs";

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
    const probe = await request({ port, pathname: "/alpha/en-001/home" });
    if (probe.status === 200) return;
    last = "status=" + probe.status;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("shared host never served /alpha: " + last);
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
    const port = harness.basePort + offset;
    const server = harness.startDevServer(port, {
      synthetic: false,
      deploymentRoot: installation.root,
    });
    try {
      await waitForSharedHost(port, 240000);
      return { server, port, projected };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no shared-host port answered");
}

export async function run(chrome, harness) {
  const rows = [];
  const installation = materializeSharedHostInstallation({
    root: mkdtempSync(path.join(scratchRoot(), "foundation-shared-host-")),
    members: MEMBERS,
  });
  let server = null;

  try {
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
      const page = await request({ port, pathname: "/" + prefix + "/en-001/home" });
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
    const second = await request({ port, pathname: "/alpha-second/en-001/home" });
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

    const alphaAsset = (await request({ port, pathname: "/alpha/en-001/home" })).body.match(/src="([^"]*logo-header[^"]*)"/);
    const betaAsset = (await request({ port, pathname: "/beta/en-001/home" })).body.match(/src="([^"]*logo-header[^"]*)"/);
    const hrefOf = (match) => (match === null ? "" : match[1]);
    const alphaHref = hrefOf(alphaAsset);
    const betaHref = hrefOf(betaAsset);
    const alphaBytes = alphaHref === "" ? { status: 0, body: "" } : await request({ port, pathname: alphaHref });
    const betaBytes = betaHref === "" ? { status: 0, body: "" } : await request({ port, pathname: betaHref });
    harness.check(
      rows,
      "presentation assets are served (200) with OWNER-SPECIFIC bytes",
      alphaBytes.status === 200 &&
        betaBytes.status === 200 &&
        alphaBytes.body.includes("Alpha") &&
        betaBytes.body.includes("Beta") &&
        alphaBytes.body !== betaBytes.body,
      "status=" + alphaBytes.status + "/" + betaBytes.status + " href=" + (alphaHref || "none"),
    );

    const rootPath = await request({ port, pathname: "/" });
    harness.check(
      rows,
      "the shared host invents no homepage: / is neither a page nor a redirect",
      rootPath.status !== 200 && rootPath.headers.location === undefined,
      "status=" + rootPath.status,
    );

    const unpublished = await request({ port, pathname: "/zeta/en-001/home" });
    harness.check(rows, "a declared but UNPUBLISHED Spoke serves nothing", unpublished.status !== 200, "status=" + unpublished.status);

    const nearMiss = await request({ port, pathname: "/alphax/en-001/home" });
    harness.check(rows, "a near-miss prefix (/alphax) is not /alpha", nearMiss.status !== 200, "status=" + nearMiss.status);

    const foreign = await request({ port, pathname: "/alpha/en-001/home", host: "foreign.example.test" });
    harness.check(rows, "an unknown host is refused", foreign.status !== 200, "status=" + foreign.status);

    const forged = await request({
      port,
      pathname: "/alpha/en-001/home",
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
    try {
      await harness.stopServer(server);
    } catch {
      /* already gone */
    }
    delete process.env.FOUNDATION_EFS_MANIFEST;
    delete process.env.FOUNDATION_EFS_CAPSULE;
    delete process.env.FOUNDATION_DEPLOYMENT_ROOT;
    rmSync(efsProjectionPath(installation.root, process.cwd()), { force: true });
    installation.cleanup();
    try {
      syncAssets(null);
    } catch {
      /* pnpm assets:check reports it if it ever fails */
    }
  }

  return rows;
}

export default { id, run };
