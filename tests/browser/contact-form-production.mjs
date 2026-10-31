// tests/browser/contact-form-production.mjs
// THE SIMPLE CONTACT FORM THROUGH A REAL PRODUCTION BUILD AND SERVER (FOUNDATION-RELEASE-CANDIDATE-A6)
// ======================================================================================================
//
// The dev-server scenario proves the behaviour; this proves the SAME behaviour in the mode an owner actually
// runs. It builds, starts `next start`, drives the REAL public hostnames from a real browser (through the
// harness test-only host mapping) and asserts the whole path:
//
//   browser -> Server Action -> verified EFS Page/Site/publication -> the Spoke own server-only policy ->
//   pinned Connect `SendDirectEnquiry` -> offline `MailTransportPort` -> truthful demonstration outcome
//
// It is deliberately NOT wired into CI (a production build is minutes), exactly like the two production proofs
// this repository already ships. Run it explicitly: `node tests/browser/contact-form-production.mjs`.
import { spawn, spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Cdp, findChrome } from "./cdp.mjs";
import { deploymentContactCopy, proveContactForm } from "./contact-form-flow.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(dirname(HERE));
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const PORT = 4477;
const FOUNDATION_HOST = "foundation-template.provelopment.com";
const GERMANY_HOST = "foundation-template-germany.provelopment.com";

const rows = [];
function check(name, ok, detail = "") {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log(`[contact-form-production] ${ok ? "PASS" : "FAIL"} ${name}${detail ? ` :: ${detail}` : ""}`);
}

function request(pathname, host) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port: PORT, path: pathname, method: "GET", headers: { host } },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { body += chunk; });
        response.on("end", () => resolve({ status: response.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function waitForServer(pathname, host, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  let last = "never answered";
  while (Date.now() < deadline) {
    try {
      const response = await request(pathname, host);
      if (response.status === 200) return response;
      last = `status=${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`next start never served ${pathname}: ${last}`);
}

function stopServer(proc) {
  if (!proc) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
    else proc.kill("SIGTERM");
  } catch { /* already gone */ }
}

function deploymentCopy() {
  const en = deploymentContactCopy(ROOT, "en");
  const de = deploymentContactCopy(ROOT, "de");
  return {
    en: {
      disclosure: en.demoTitle,
      accepted: en.demoAccepted,
      successClaim: en.success,
      message: "Fictional message typed by the A6 production proof.",
    },
    de: {
      disclosure: de.demoTitle,
      accepted: de.demoAccepted,
      successClaim: de.success,
      message: "Fiktive Nachricht der A6-Produktionspruefung.",
    },
  };
}

async function main() {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome/Chromium/Edge binary is available for the production proof");

  console.log("[contact-form-production] next build (reference deployment)");

  const buildCode = process.env.A6_REUSE_BUILD
    ? 0
    : await new Promise((resolve) => {
        spawn(process.execPath, [NEXT_BIN, "build"], { cwd: ROOT, stdio: "inherit", windowsHide: true }).on("exit", resolve);
      });
  if (buildCode !== 0) throw new Error(`next build failed (code=${buildCode})`);

  console.log(`[contact-form-production] next start -p ${PORT}`);
  const server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", () => {});
  server.stderr.on("data", () => {});

  let cdp = null;
  try {
    // R04-C18 — the DECLARED EFS representations, not the retired geographic routes. The first public
    // segment is the locale PATH KEY; Germany publishes no Contact Page at all, so both representations
    // must fail closed there.
    const english = await waitForServer("/en-001/contact", FOUNDATION_HOST);
    check("production server serves the contact Page", english.status === 200, `status=${english.status}`);

    const german = await request("/de-de/contact", FOUNDATION_HOST);
    check("production server serves the German contact Page", german.status === 200, `status=${german.status}`);

    const home = await request("/en-001", FOUNDATION_HOST);
    check(
      "a Page without the section hosts no form",
      home.status === 200 && !home.body.includes("connect-contact-acknowledgement"),
      `status=${home.status}`,
    );

    for (const pathname of ["/en-001/contact", "/de-de/contact"]) {
      const germany = await request(pathname, GERMANY_HOST);
      check(
        `the Germany Host owns no Contact Page at ${pathname}`,
        germany.status === 404 && !germany.body.includes("connect-contact-acknowledgement"),
        `status=${germany.status}`,
      );
    }

    cdp = await Cdp.connect(chrome, {
      hostResolverRules: `MAP ${FOUNDATION_HOST} 127.0.0.1, MAP ${GERMANY_HOST} 127.0.0.1`,
    });
    await proveContactForm({
      cdp,
      origin: `http://${FOUNDATION_HOST}:${PORT}`,
      check: (target, name, ok, detail) => check(name, ok, detail),
      rows,
      copy: deploymentCopy(),
      forbidden: ["contact-form-demonstration@example.com", "website-demonstration@example.com"],
    });
  } finally {
    if (cdp) await cdp.close();
    stopServer(server);
  }

  const failed = rows.filter((row) => !row.ok);
  console.log(`[contact-form-production] ${rows.length - failed.length}/${rows.length} checks passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[contact-form-production] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
