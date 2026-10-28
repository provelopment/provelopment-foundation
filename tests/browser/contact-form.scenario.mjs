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
export async function run(chrome, harness) {
  const rows = [];
  let server = null;
  let cdp = null;
  let port = null;

  try {
    for (const offset of PORT_OFFSETS) {
      const candidate = harness.basePort + offset;
      const started = harness.startDevServer(candidate, { synthetic: false });
      // A readiness probe that carries the PUBLIC hostname: the dev server needs tens of seconds to compile,
      // and a loopback request without the claimed Host answers 404 by design (the boundary is doing its job).
      const deadline = Date.now() + 240000;
      let ready = false;
      while (Date.now() < deadline && !ready) {
        try {
          ready = (await request(candidate, "/ww/en/contact", FOUNDATION_HOST)).status === 200;
        } catch { ready = false; }
        if (!ready) await sleep(1000);
      }
      if (ready) { server = started; port = candidate; break; }
      await harness.stopServer(started);
    }
    if (port === null) throw new Error(`no port answered the reference contact Page on ${FOUNDATION_HOST}`);

    const origin = originFor(port);

    // ---- raw boundary refusals -------------------------------------------------
    const undeclared = await request(port, "/ww/en/does-not-exist", FOUNDATION_HOST);
    harness.check(rows, "an unauthored Page is refused", undeclared.status === 404, `status=${undeclared.status}`);

    const unclaimedHost = await request(port, "/ww/en/contact", "unclaimed.example");
    harness.check(rows, "an unclaimed host is refused", unclaimedHost.status === 404, `status=${unclaimedHost.status}`);

    const home = await request(port, "/ww/en", FOUNDATION_HOST);
    harness.check(
      rows,
      "a Page without the section hosts no form",
      home.status === 200 && !home.body.includes("connect-contact-acknowledgement"),
      `status=${home.status}`,
    );

    const germany = await request(port, "/de/de/contact", GERMANY_HOST);
    harness.check(
      rows,
      "the Germany Site exposes no contact form",
      germany.status === 404 && !germany.body.includes("connect-contact-acknowledgement"),
      `status=${germany.status}`,
    );

    // ---- the real browser flow, in both locales -------------------------------
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
    if (server) await harness.stopServer(server);
  }

  return rows;
}
