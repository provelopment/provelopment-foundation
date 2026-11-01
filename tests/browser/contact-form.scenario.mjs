// tests/browser/contact-form.scenario.mjs
// THE SIMPLE CONTACT FORM, IN A REAL BROWSER, AGAINST THE REFERENCE INSTALLATION
// =================================================================================
// FOUNDATION-RELEASE-CANDIDATE (A6)
//
// The capability arrived in A5 without a browser proof. This scenario is that proof, expressed in the
// harness this repository already owns: a real dev server serving the SHIPPED reference deployment
// (`synthetic: false`), a real headless Chrome, and REAL interactions - focus and typing, a real mouse click
// on the consent control, a real submit.
//
// THE PUBLIC HOSTNAMES ARE REACHED IN THE BROWSER through the harness's own test-only host mapping
// (`Cdp.connect(chrome, { hostResolverRules })`): production dispatch still matches the exact `Host` claim,
// and the mapping lives only inside this Chrome process. No Playwright, no new dependency, no second harness.
//
// The refusals that need no browser (an unauthored Page, a host that claims nothing, the Germany Site with no
// authored contact Page) are proved over raw HTTP with an explicit `Host` header, exactly as the existing
// EFS reference scenario does, because they are boundary answers rather than interactions.
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";

import { Cdp } from "./cdp.mjs";
import { deploymentContactCopy, proveContactForm } from "./contact-form-flow.mjs";

export const id = "contact-form";

const PORT_OFFSETS = [71, 72];
const FOUNDATION_HOST = "foundation-template.provelopment.com";
const GERMANY_HOST = "foundation-template-germany.provelopment.com";

// R04-C18 — THE DECLARED EFS COORDINATES, named once.
//
// The first segment of a public EFS path is the LOCALE PATH KEY (`en-001`, `de-de`), never a Site selector.
// These are the representations the reference publication actually declares for this Spoke's Contact Page:
// the readiness probe below must ask for one of THESE, because a probe for a route the publication does not
// serve can never become ready and burns the whole budget on every candidate port.
const ENGLISH_CONTACT_PATH = "/en-001/contact";
const GERMAN_CONTACT_PATH = "/de-de/contact";
const ENGLISH_HOME_PATH = "/en-001";
const UNDECLARED_PATH = "/en-001/does-not-exist";
/** A per-port readiness budget. Two ports, so the worst case is bounded and reported, never open-ended. */
const READINESS_BUDGET_MS = 120000;

function originFor(port) {
  return `http://localhost:${port}`;
}

function request(port, pathname, host) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host } },
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

/** The wording THIS deployment authored, plus the TEST-OWNED visitor data. */
function deploymentCopy(repositoryRoot) {
  const en = deploymentContactCopy(repositoryRoot, "en");
  const de = deploymentContactCopy(repositoryRoot, "de");
  return {
    en: {
      disclosure: en.demoTitle,
      accepted: en.demoAccepted,
      successClaim: en.success,
      message: "Fictional message typed by the A6 browser proof.",
    },
    de: {
      disclosure: de.demoTitle,
      accepted: de.demoAccepted,
      successClaim: de.success,
      message: "Fiktive Nachricht der A6-Browser-Pruefung.",
    },
  };
}
/**
 * Waits for the DECLARED English Contact Page on one port, reporting the last answer it actually saw.
 *
 * A loopback request without the claimed Host answers 404 by design, so the probe carries the public
 * hostname. Readiness is bounded: a server that cannot serve the declared Page is a FAILURE with evidence,
 * not a reason to wait indefinitely.
 */
async function waitForDeclaredContactPage(port, host) {
  const deadline = Date.now() + READINESS_BUDGET_MS;
  let last = "never answered";
  while (Date.now() < deadline) {
    try {
      const response = await request(port, ENGLISH_CONTACT_PATH, host);
      if (response.status === 200) return { ready: true, last: "status=200" };
      last = `status=${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(1000);
  }
  return { ready: false, last };
}

export async function run(chrome, harness) {
  const rows = [];
  /** EVERY server this scenario started, recorded the instant it starts, so cleanup never depends on
   *  readiness having succeeded. R04-C18 — a scenario that throws must not leave a Next/Vite process holding
   *  the repository's dependency cache (`node_modules/.vite`), which breaks unrelated suites. */
  const servers = [];
  let cdp = null;
  let port = null;
  let readiness = "never attempted";

  try {
    for (const offset of PORT_OFFSETS) {
      const candidate = harness.port(offset);
      const started = harness.startDevServer(candidate, { synthetic: false });
      // TRACKED BEFORE THE FIRST await: the process exists now, so it is this scenario's to stop.
      servers.push(started);
      const attempt = await waitForDeclaredContactPage(candidate, FOUNDATION_HOST);
      readiness = attempt.last;
      if (attempt.ready) { port = candidate; break; }
      await harness.stopServer(started);
    }
    if (port === null) {
      throw new Error(
        `no port answered the declared contact Page ${ENGLISH_CONTACT_PATH} on ${FOUNDATION_HOST} (last: ${readiness})`,
      );
    }

    const origin = originFor(port);

    // ---- raw boundary refusals -------------------------------------------------
    // These are BOUNDARY answers, not interactions, so they are real HTTP tests with an explicit Host.
    const undeclared = await request(port, UNDECLARED_PATH, FOUNDATION_HOST);
    harness.check(rows, "an unauthored Page is refused", undeclared.status === 404, `status=${undeclared.status}`);

    const unclaimedHost = await request(port, ENGLISH_CONTACT_PATH, "unclaimed.example");
    harness.check(
      rows,
      "an unclaimed host is refused, even for an otherwise valid Contact route",
      unclaimedHost.status === 404,
      `status=${unclaimedHost.status}`,
    );

    const home = await request(port, ENGLISH_HOME_PATH, FOUNDATION_HOST);
    harness.check(
      rows,
      "a Page without the section hosts no form",
      home.status === 200 && !home.body.includes("connect-contact-acknowledgement"),
      `status=${home.status}`,
    );

    // The Germany Host publishes no Contact Page, so BOTH representations must fail closed there — the
    // pathname is otherwise valid, which is exactly what makes this an ownership test.
    for (const pathname of [ENGLISH_CONTACT_PATH, GERMAN_CONTACT_PATH]) {
      const germany = await request(port, pathname, GERMANY_HOST);
      harness.check(
        rows,
        `the Germany Host owns no Contact Page at ${pathname}`,
        germany.status === 404 && !germany.body.includes("connect-contact-acknowledgement"),
        `status=${germany.status}`,
      );
    }

    // ---- the real browser flow, in both representations -----------------------
    cdp = await Cdp.connect(chrome, {
      hostResolverRules: `MAP ${FOUNDATION_HOST} 127.0.0.1, MAP ${GERMANY_HOST} 127.0.0.1`,
    });
    await proveContactForm({
      cdp,
      origin: `http://${FOUNDATION_HOST}:${port}`,
      check: harness.check,
      rows,
      copy: deploymentCopy(harness.repositoryRoot),
      forbidden: ["contact-form-demonstration@example.com", "website-demonstration@example.com"],
    });
  } finally {
    if (cdp) await cdp.close();
    // EVERY server, always — not only the one that became ready.
    for (const started of servers) await harness.stopServer(started);
  }

  return rows;
}
