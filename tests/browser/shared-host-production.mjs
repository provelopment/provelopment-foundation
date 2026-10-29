/**
 * THE SHARED-HOST PRODUCTION SMOKE (FOUNDATION A1, R11 B)
 * =======================================================
 *
 * ONE bounded verification over the EXISTING generic synthetic shared-host Installation, through a REAL
 * `next build` and a REAL `next start`. It is not a browser framework and it does not revalidate Foundation:
 * it answers one question - does the corrected publication boundary still hold when production code, not the
 * dev server, resolves the host, the path and the asset namespace?
 *
 * It composes the SAME fixture and the SAME projection authority as `shared-host.scenario.mjs`, so a result
 * here and a result there describe ONE Installation rather than two plausible ones.
 *
 * WHAT IT PROVES
 *   - a publication from EACH of TWO identified Spoke Hubs serves its own Entity;
 *   - an explicit `presentationSiteCode` selects an observable presentation value (the shared shell), and its
 *     absence is equally observable;
 *   - each owner's authorized presentation assets return 200 with DISTINGUISHABLE bytes (every Spoke authors
 *     its own `<title>Marker</title>` artwork);
 *   - an unauthorized asset under an owner's own namespace, a FOREIGN namespace spelling, an unmatched path
 *     prefix and an unauthored `/` are all refused.
 *
 * RESTORATION. Every task-owned write is inside one guarded region: the Installation (removed), the
 * projection file (removed), the three environment variables (restored to their exact previous values) and
 * the generated `public/spokes/**` tree (re-synchronised through the canonical synchronizer for the ORIGINAL
 * deployment root). The build artefact is restored too: the synthetic `.next` is replaced by a reference build
 * of the restored Installation, so the directory never keeps a build of a site that no longer exists.
 *
 * ENVIRONMENT BINDING (A1 R12). Every child process this smoke starts - the asset synchronisation, the
 * publication validation, `next build` and `next start` - receives an environment CONSTRUCTED AT CALL TIME from
 * the CURRENT selection, never a snapshot taken when this module was imported. The distinction decides whether
 * this is a real proof or a plausible one: a module-level snapshot predates `run()`'s own selection of the
 * disposable Installation, so the compiler and the server were pointed at the AMBIENT deployment while the two
 * claims were generated from the SYNTHETIC one. The server then answered every published coordinate with 404 -
 * faithfully, for a deployment in which those coordinates are unauthored. `assertChildSelection` now refuses to
 * compile or serve unless the child environment names the SAME Installation, manifest, capsule and projection
 * that produced the claims, and readiness requires a 200 from a published coordinate, so a refusal can never
 * again be reported as readiness.
 *
 * Run: node tests/browser/shared-host-production.mjs
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, closeSync, existsSync, openSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import path from "node:path";

import { efsManifestSelection, efsProjectionPath, installationSpokes } from "../../src/config/deployment-build.mjs";
import { producePublicationProjection } from "../../scripts/efs/publication-projection.mjs";
import { buildPlan } from "../../scripts/sync-runtime-assets.mjs";
import {
  SHARED_HOST,
  SHARED_HOST_MEMBERS,
  materializeSharedHostInstallation,
} from "../support/shared-host-installation.mjs";
import { scratchRoot } from "./scratch.mjs";
import { canBind, isRestrictedPort } from "./ports.mjs";

/**
 * THE PORT IS NEGOTIATED, NEVER ASSUMED (IA-VERIFY-01).
 *
 * This smoke is a REQUIRED CI step, so a busy port must not be reported as a product failure. The harness's
 * own port authority decides: `canBind` proves a candidate is free on 127.0.0.1, and `isRestrictedPort`
 * keeps a port Next.js refuses out of the search. If the whole window is occupied the run fails LOUDLY,
 * naming the window — an occupied machine is an environment problem, never a routing defect.
 */
const PREFERRED_PORT = 4391;
const PORT_WINDOW = 24;

async function choosePort() {
  for (let candidate = PREFERRED_PORT; candidate < PREFERRED_PORT + PORT_WINDOW; candidate += 1) {
    if (isRestrictedPort(candidate)) continue;
    if (await canBind(candidate)) return candidate;
  }
  throw new Error(
    `shared-host production smoke: no free port in ${PREFERRED_PORT}..${PREFERRED_PORT + PORT_WINDOW - 1}; ` +
      "the machine is busy, which is an environment problem rather than a routing defect",
  );
}

const PORT = await choosePort();
const ENV_NAMES = ["FOUNDATION_DEPLOYMENT_ROOT", "FOUNDATION_EFS_MANIFEST", "FOUNDATION_EFS_CAPSULE"];
const SYNTHETIC = path.join(process.cwd(), "tests", "fixtures", "synthetic-deployment");

/**
 * The Site the shell presents, READ from the synthetic deployment rather than asserted from memory: a
 * presentation Site must be one its own Spoke declares, and hardcoding the code would let this smoke agree
 * with a fixture that no longer has it.
 */
function presentationSiteCode() {
  const config = JSON.parse(readFileSync(path.join(SYNTHETIC, "site.config.json"), "utf8"));
  const code = config.sites?.[0]?.code;
  if (typeof code !== "string" || code === "") {
    throw new Error("the synthetic deployment declares no Site code to present");
  }
  return code;
}

/**
 * The PAGE coordinate of one published Spoke, READ from the materialized manifest rather than assumed.
 *
 * The canonical public URL is `/<prefix>/<locale>/<route>`: the prefix names the publication BINDING, the locale
 * its default representation. A prefix-only path (`/alpha/home`) is a shorthand the resolver completes only
 * where a host has exactly ONE canonical binding, so on this shared host - which carries TWO - it is ambiguous
 * BY DESIGN and refused. Asserting the shorthand would test that fallback rather than the publication.
 */
function bindingFor(root, spokeId) {
  const manifest = JSON.parse(readFileSync(path.join(root, "efs", "manifest.json"), "utf8"));
  const publication = (manifest.publications ?? []).find((entry) => entry.spokeId === spokeId);
  const binding = (publication?.bindings ?? []).find(
    (candidate) => candidate.host === SHARED_HOST && candidate.canonical !== false,
  );
  if (!binding) throw new Error("no canonical EFS binding for " + spokeId + " on " + SHARED_HOST);
  return { prefix: binding.prefix.join("/"), locale: binding.defaultLocale };
}

/**
 * Does this document carry the shared PRESENTATION SHELL, rather than only the page's own header?
 *
 * Every EFS page renders a `<header>` of its own (`components/efs/efs-page.tsx`), so a coarse tag test would find
 * a "shell" on both Spokes and prove nothing about the selection. The shell has its own marker.
 */
function hasSharedShell(body) {
  return /class="[^"]*\bui-site-header\b/.test(body);
}

const rows = [];
const failures = [];
function check(name, ok, detail) {
  rows.push(`${ok ? "PASS" : "FAIL"}  ${name}  [${detail}]`);
  if (!ok) failures.push(name);
}

function request({ pathname }) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: PORT, path: pathname, method: "GET", headers: { host: SHARED_HOST } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            location: res.headers.location,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

/** The canonical generated-asset synchronisation for a given deployment root. */
function syncAssets(root) {
  const result = spawnSync(process.execPath, ["scripts/sync-runtime-assets.mjs"], {
    env: childEnv({ root }),
    encoding: "utf8",
    shell: false,
  });
  return { ok: result.status === 0, detail: (result.stdout ?? "") + (result.stderr ?? "") };
}

/** Stop the server AND anything it spawned (the runner is a shell on Windows). */
function stopServer(proc) {
  if (proc === null || proc.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    proc.kill("SIGKILL");
  } catch {
    /* already gone */
  }
}

/** The composite asset namespace of one Spoke, read from the canonical plan rather than re-derived. */
function namespaceOf(root, spokeId) {
  const plan = buildPlan(root).filter(
    (row) =>
      typeof row.namespace === "string" &&
      row.namespace.startsWith("spoke:") &&
      row.namespace.split("+").pop() === spokeId,
  );
  if (plan.length === 0) throw new Error("the canonical plan has no namespace for " + spokeId);
  return plan[0].namespace.slice("spoke:".length);
}

/**
 * Wait for the production server to serve a PUBLISHED coordinate with 200.
 *
 * A refusal is not readiness. A connection error or a 502/503 means "not up yet" and is retried; a 404 means
 * the server IS up and is resolving a different deployment than the one the claims were made for, which is the
 * exact failure this smoke exists to catch, so it is reported at once instead of being counted as success.
 */
async function waitForServer(pathname) {
  const deadline = Date.now() + 180000;
  let last = "no attempt";
  while (Date.now() < deadline) {
    try {
      const response = await request({ pathname });
      if (response.status === 200) return response;
      if (response.status === 404) {
        throw new Error(
          "next start answered " +
            pathname +
            " with 404: the server is up but is not resolving the Installation whose publications were claimed",
        );
      }
      last = "status=" + response.status;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("next start answered")) throw error;
      last = String(error?.code ?? error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("next start never served " + pathname + " with 200: " + last);
}

// A production proof must run the PRODUCTION environment explicitly. The producer that validates the publication
// manifest loads it through a Vite SSR module runner, which mutates `NODE_ENV` in THIS process; a child that merely
// inherited `process.env` therefore compiled against an inconsistent React build, which is exactly what makes a
// client component SSR against a null dispatcher and fail `/_global-error`. Every child is given the production
// environment by construction instead of inheriting it.
//
// CONSTRUCTED PER CALL, never snapshotted at import. `run()` selects the disposable Installation and its EFS
// manifest AFTER this module is evaluated, so a module-level `{ ...process.env }` hands every child the
// environment that existed BEFORE that selection - the ambient deployment - and the compiler and the server then
// describe an Installation that publishes none of the coordinates the claims were made for.
function childEnv({ root } = {}) {
  const env = { ...process.env, NODE_ENV: "production" };
  if (root === undefined) return env;
  if (root === null) {
    delete env.FOUNDATION_DEPLOYMENT_ROOT;
    return env;
  }
  env.FOUNDATION_DEPLOYMENT_ROOT = root;
  return env;
}

/**
 * Refuse to compile or serve from an environment that does not name the EXACT Installation, manifest, capsule and
 * projection the validated claims were produced from. The detail names only WHICH bindings were wrong; no
 * environment value is printed.
 */
function assertChildSelection(env, { root, manifestPath, capsule, projectionPath }) {
  const same = (a, b) =>
    typeof a === "string" && typeof b === "string" && path.resolve(a) === path.resolve(b);
  const unbound = [];
  if (!same(env.FOUNDATION_DEPLOYMENT_ROOT, root)) unbound.push("FOUNDATION_DEPLOYMENT_ROOT");
  if (!same(env.FOUNDATION_EFS_MANIFEST, manifestPath)) unbound.push("FOUNDATION_EFS_MANIFEST");
  if (!same(env.FOUNDATION_EFS_CAPSULE, capsule)) unbound.push("FOUNDATION_EFS_CAPSULE");
  if (env.NODE_ENV !== "production") unbound.push("NODE_ENV");
  if (!existsSync(manifestPath)) unbound.push("manifest file");
  if (!existsSync(projectionPath)) unbound.push("projection file");
  if (unbound.length > 0) {
    throw new Error(
      "the child environment is not bound to the Installation that produced the claims: " + unbound.join(", "),
    );
  }
  return "root+manifest+capsule+projection+NODE_ENV";
}
export async function run() {
  const previousEnv = {};
  for (const name of ENV_NAMES) previousEnv[name] = process.env[name];

  let installation = null;
  let server = null;
  const problems = [];

  try {
    const presented = presentationSiteCode();
    const members = [
      { ...SHARED_HOST_MEMBERS[0], presentationSiteCode: presented },
      SHARED_HOST_MEMBERS[3],
    ];

    // 1 - the synthetic Installation, inside its OWN scratch directory.
    installation = materializeSharedHostInstallation({
      root: mkdtempSync(path.join(scratchRoot(), "foundation-shared-host-prod-")),
      members,
    });
    process.env.FOUNDATION_DEPLOYMENT_ROOT = installation.root;
    process.env.FOUNDATION_EFS_CAPSULE = installation.capsule;

    // 2 - the validated publication projection, then the authored assets.
    const selection = efsManifestSelection(installation.root, {});
    process.env.FOUNDATION_EFS_MANIFEST = selection.path;
    const spokeIdentities = (installationSpokes(installation.root).spokes ?? []).map((spoke) => ({
      id: spoke.id,
      spokeHubId: spoke.spokeHubId,
    }));
    const projected = await producePublicationProjection({
      root: installation.root,
      manifestPath: selection.path,
      explicit: false,
      spokeIdentities,
      repositoryRoot: process.cwd(),
    });
    check(
      "the projection authorises exactly the two published Spokes",
      projected.status === "projected" && projected.claims.length === 2,
      "status=" + projected.status + " claims=" + (projected.claims?.length ?? 0),
    );
    if (projected.status !== "projected") {
      throw new Error("projection refused: " + String((projected.issues ?? []).join("; ")));
    }
    const synced = syncAssets(installation.root);
    check(
      "authored assets synchronise into the generated tree",
      synced.ok,
      (synced.detail.trim().split("\n").pop() ?? "").slice(0, 120),
    );

    const alphaNamespace = namespaceOf(installation.root, "alpha");
    const deltaNamespace = namespaceOf(installation.root, "delta");

    // The published page coordinates, read from the manifest this build is pointed at.
    const alphaBinding = bindingFor(installation.root, "alpha");
    const deltaBinding = bindingFor(installation.root, "delta");
    const alphaHomePath = "/" + alphaBinding.prefix + "/" + alphaBinding.locale + "/home";
    const alphaAboutPath = "/" + alphaBinding.prefix + "/" + alphaBinding.locale + "/about";
    const deltaHomePath = "/" + deltaBinding.prefix + "/" + deltaBinding.locale + "/home";
    const deltaAboutPath = "/" + deltaBinding.prefix + "/" + deltaBinding.locale + "/about";

    // Item 3 - the compiler must be pointed at the SAME Installation and manifest that produced the two claims,
    // and the projection file its reader resolves must already exist. Asserted, not assumed, and asserted BEFORE
    // anything is compiled: an environment that names a different deployment is the defect this correction
    // removes, and it must stop the run rather than produce a well-formed result about the wrong site.
    const projectionPath = efsProjectionPath(installation.root, process.cwd());
    const buildEnv = childEnv();
    const binding = assertChildSelection(buildEnv, {
      root: installation.root,
      manifestPath: selection.path,
      capsule: installation.capsule,
      projectionPath,
    });
    check(
      "the build environment is bound to the Installation that produced the claims",
      true,
      binding,
    );

    // 3 - a REAL production build through the normal Foundation build path.
    // The generated output is removed ONCE, here, and never again immediately before the compiler. Deleting
    // `.next` microseconds before `next build` starts writing it is what made the `/_global-error` prerender
    // fail with a React null-context error on this host; the preflight steps below run in the gap, so the
    // compiler always starts against a settled filesystem.
    rmSync(path.join(process.cwd(), ".next"), { recursive: true, force: true });
    const buildLog = path.join(scratchRoot(), "prod-build.log");
    // The canonical `pnpm build` chain, step by step so each step is attributable: publication validation and the
    // canonical asset synchronisation run BEFORE the compiler, exactly as the package script does. Proven not to
    // mutate the projection (its digest is unchanged across both steps).
    for (const step of [
      ["exec", "node", "scripts/sync-runtime-assets.mjs"],
      ["exec", "node", "scripts/efs/validate-publications.mjs"],
    ]) {
      const stepHandle = openSync(path.join(scratchRoot(), "prod-preflight.log"), "a");
      const stepResult = spawnSync("pnpm", step, {
        env: buildEnv,
        stdio: ["ignore", stepHandle, stepHandle],
        shell: true,
      });
      closeSync(stepHandle);
      if (stepResult.status !== 0) throw new Error("canonical build step failed: " + step.join(" "));
    }
    // Stream the child output straight to a file: buffering it in-process overflowed the default buffer and
    // killed the child with NO error reported at all, indistinguishable from a real build failure.
    const handle = openSync(buildLog, "w");
    const build = spawnSync("pnpm", ["exec", "next", "build"], {
      env: buildEnv,
      stdio: ["ignore", handle, handle],
      shell: true,
    });
    closeSync(handle);
    check(
      "next build succeeds against the synthetic Installation",
      build.status === 0,
      "exit=" + build.status,
    );
    if (build.status !== 0) {
      throw new Error(
        "next build failed (exit=" +
          build.status +
          "): STDOUT tail:\n" +
          readFileSync(buildLog, "utf8").slice(-3000) +
          "\nThe build log tail above is the whole child output.",
      );
    }

    // 4 - a REAL production server, bound to the SAME selection the build was compiled and the claims were made
    // from, re-asserted here because the server is what answers requests and a mismatch would surface only as
    // refusals.
    const serverEnv = childEnv();
    const servedBinding = assertChildSelection(serverEnv, {
      root: installation.root,
      manifestPath: selection.path,
      capsule: installation.capsule,
      projectionPath,
    });
    const serverLog = path.join(scratchRoot(), "prod-server.log");
    const serverHandle = openSync(serverLog, "w");
    server = spawn("pnpm", ["exec", "next", "start", "-p", String(PORT)], {
      env: serverEnv,
      shell: true,
      stdio: ["ignore", serverHandle, serverHandle],
    });
    closeSync(serverHandle);
    let ready;
    try {
      ready = await waitForServer(alphaHomePath);
    } catch (error) {
      // A readiness failure must be diagnosable from THIS run's evidence: which coordinates were refused, and
      // what the server itself said. Silence plus "try again" is what let a 404 pass for readiness before.
      const probes = [];
      const probePaths = ["/", alphaHomePath, alphaAboutPath, "/spokes/" + alphaNamespace + "/assets/logo-header.svg"];
      for (const probe of probePaths) {
        try {
          const response = await request({ pathname: probe });
          const markers = [
            /<h1[^>]*>([^<]{0,60})/i.exec(response.body)?.[1]?.trim(),
            /<title[^>]*>([^<]{0,60})/i.exec(response.body)?.[1]?.trim(),
          ].filter(Boolean);
          probes.push(
            probe +
              "=" +
              response.status +
              (response.location ? "->" + response.location : "") +
              "[" +
              markers.join(" | ") +
              "]",
          );
        } catch (probeError) {
          probes.push(probe + "=" + String(probeError?.code ?? probeError));
        }
      }
      const tail = existsSync(serverLog)
        ? readFileSync(serverLog, "utf8").slice(-2500)
        : "(no server output captured)";
      throw new Error(
        String(error?.message ?? error) + "\nprobes: " + probes.join(" ") + "\nserver output tail:\n" + tail,
      );
    }
    check(
      "next start serves a PUBLISHED coordinate with 200 on the shared host",
      ready.status === 200,
      "status=" + ready.status + " port=" + PORT + " host=" + SHARED_HOST + " binding=" + servedBinding,
    );

    // 5 - one publication from EACH of two identified Spoke Hubs, each serving its OWN Entity.
    const alphaAbout = await request({ pathname: alphaAboutPath });
    check(
      "group-one/alpha serves its own Entity in production",
      alphaAbout.status === 200 && alphaAbout.body.includes("About Alpha") && !alphaAbout.body.includes("About Delta"),
      "status=" + alphaAbout.status + " path=" + alphaAboutPath,
    );
    const deltaAbout = await request({ pathname: deltaAboutPath });
    check(
      "group-two/delta serves its own Entity in production",
      deltaAbout.status === 200 && deltaAbout.body.includes("About Delta") && !deltaAbout.body.includes("About Alpha"),
      "status=" + deltaAbout.status + " path=" + deltaAboutPath,
    );

    // 6 - an explicit presentationSiteCode selects an OBSERVABLE presentation value: the shared shell.
    const alphaHome = await request({ pathname: alphaHomePath });
    const deltaHome = await request({ pathname: deltaHomePath });
    const alphaShell = hasSharedShell(alphaHome.body);
    const deltaShell = hasSharedShell(deltaHome.body);
    check(
      'presentationSiteCode="' + presented + '" selects the shared shell for alpha',
      alphaHome.status === 200 && alphaShell,
      "status=" + alphaHome.status + " header=" + alphaShell,
    );
    check(
      "the same page type without presentationSiteCode renders no shell, so the selection IS the difference",
      deltaHome.status === 200 && !deltaShell,
      "status=" + deltaHome.status + " header=" + deltaShell,
    );

    // 7 - each owner's authorized presentation assets: 200 AND distinguishable bytes.
    const alphaLogo = await request({ pathname: "/spokes/" + alphaNamespace + "/assets/logo-header.svg" });
    const deltaLogo = await request({ pathname: "/spokes/" + deltaNamespace + "/assets/logo-header.svg" });
    check(
      "alpha's authorized logo-header returns 200 with its OWN bytes",
      alphaLogo.status === 200 && alphaLogo.body.includes("Alpha") && !alphaLogo.body.includes("Delta"),
      "status=" + alphaLogo.status + " bytes=" + alphaLogo.body.length,
    );
    check(
      "delta's authorized logo-header returns 200 with DISTINGUISHABLE bytes",
      deltaLogo.status === 200 && deltaLogo.body.includes("Delta") && !deltaLogo.body.includes("Alpha"),
      "status=" + deltaLogo.status + " bytes=" + deltaLogo.body.length,
    );
    check(
      "the two owners' assets are byte-distinct",
      alphaLogo.body !== deltaLogo.body && alphaLogo.body.length > 0,
      "alpha=" + alphaLogo.body.length + "B delta=" + deltaLogo.body.length + "B",
    );
    const alphaFavicon = await request({ pathname: "/spokes/" + alphaNamespace + "/assets/favicon.svg" });
    check(
      "alpha's authorized favicon returns 200 with its OWN bytes",
      alphaFavicon.status === 200 && alphaFavicon.body.includes("Alpha"),
      "status=" + alphaFavicon.status,
    );

    // 8 - refusals: an unauthorised asset, a foreign namespace, an unmatched prefix, an unauthored root.
    const unauthorised = await request({ pathname: "/spokes/" + alphaNamespace + "/assets/not-a-role.svg" });
    check(
      "an unauthorised asset under an owner's own namespace is refused",
      unauthorised.status !== 200,
      "status=" + unauthorised.status,
    );
    const foreign = await request({ pathname: "/spokes/spoke:group-two%2Balpha/assets/logo-header.svg" });
    check(
      "alpha's Spoke id under the OTHER Hub's namespace is refused",
      foreign.status !== 200,
      "status=" + foreign.status,
    );
    const unmatched = await request({ pathname: "/not-a-publication/about" });
    check("an unmatched path prefix is refused", unmatched.status !== 200, "status=" + unmatched.status);
    const root = await request({ pathname: "/" });
    check(
      "an unauthored / is refused rather than answered by some Spoke",
      root.status !== 200,
      "status=" + root.status + (root.location ? " location=" + root.location : ""),
    );
  } finally {
    try {
      stopServer(server);
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
      const restored = syncAssets(null);
      if (!restored.ok) problems.push("asset restore: " + restored.detail.slice(-400));
    } catch (error) {
      problems.push("asset restore: " + String(error));
    }
    // The build artefact is task-owned state too: a build of the SYNTHETIC Installation must never be left
    // where the installed deployment's build belongs. The environment was restored to its exact previous values
    // ABOVE, so `childEnv()` here describes the ORIGINAL Installation - the reference build, not another one of
    // the synthetic one. If even that fails, remove the artefact outright rather than leaving unidentifiable
    // output behind.
    try {
      const reference = spawnSync("pnpm", ["build"], { env: childEnv(), stdio: "ignore", shell: true });
      if (reference.status !== 0) {
        rmSync(path.join(process.cwd(), ".next"), { recursive: true, force: true });
        problems.push("reference rebuild failed (exit " + reference.status + "); .next removed");
      }
    } catch (error) {
      problems.push("reference rebuild: " + String(error));
    }
    check(
      "the smoke restored the environment, its Installation and the generated assets",
      problems.length === 0,
      problems.join(" | ") || "restored",
    );
  }

  return { rows, failures, ok: failures.length === 0 };
}

if (process.argv[1] && process.argv[1].endsWith("shared-host-production.mjs")) {
  try {
    const result = await run();
    for (const row of result.rows) console.log(row);
    console.log("\nTOTAL=" + result.rows.length + " FAILED=" + result.failures.length);
    for (const failure of result.failures) console.log("FAIL " + failure);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    // Whatever WAS established before an abort is evidence; printing it keeps a failed run diagnosable instead
    // of silent.
    for (const row of rows) console.log(row);
    console.log("\nABORTED after " + rows.length + " checks");
    throw error;
  }
}

export default { run };