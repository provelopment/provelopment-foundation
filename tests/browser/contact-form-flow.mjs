// tests/browser/contact-form-flow.mjs
// THE SIMPLE CONTACT FORM, DRIVEN BY A REAL BROWSER (FOUNDATION-RELEASE-CANDIDATE-A6)
// =================================================================================
//
// ONE flow, used by BOTH the dev-server matrix scenario (`contact-form.scenario.mjs`) and the
// production-mode proof (`contact-form-production.mjs`), so a dev result and a production result describe
// the SAME behaviour rather than two plausible ones.
//
// WHAT IT INSISTS ON. Every claim below is an OBSERVATION of the running page:
//   - the form was there before anything was typed;
//   - the offline disclosure was VISIBLE (not merely in the HTML);
//   - consent started genuinely unchecked, and an unticked submission performed no POST at all;
//   - the submission the browser actually made was ONE same-origin POST, and it never repeated;
//   - the visitor then saw the truthful demonstration outcome, claiming no delivery and no storage;
//   - no private policy value appears in the DOM or in any client bundle the page loaded.
//
// WHY THE POST IS COUNTED THROUGH CDP, NOT FROM PAGE JS: a Next.js Server Action form is progressively
// enhanced, so a submission made before hydration is a NAVIGATION that the framework answers. In-page
// instrumentation is destroyed by that navigation, so counting `fetch` calls would miss the real submission.
// `Network.requestWillBeSent` survives the navigation and reports the method the browser actually used.
//
// It deliberately asserts no MECHANISM beyond that: whether the action ran in place or through the
// framework's progressive-enhancement navigation is the framework's business, and both paths must show the
// visitor the same truthful outcome. What is asserted is the contract, not the wiring.
//
// It asserts no authored deployment prose either: the disclosure and outcome strings are read from THIS
// deployment dictionaries at run time, so a wording change never fails the proof, while a MISSING disclosure
// does.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SETTLE_MS = 2500;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitFor(cdp, expression, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await cdp.evalBool(expression)) return true;
    await sleep(120);
  }
  return false;
}

/** Type into a controlled React field the way a person does: focus it, then insert text. */
async function typeInto(cdp, selector, text) {
  const focused = await cdp.evalBool(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); return document.activeElement === el; })()`,
  );
  if (!focused) throw new Error(`cannot focus ${selector}`);
  await cdp.send("Input.insertText", { text });
}

/**
 * Every POST the browser makes in the next `windowMs`, observed at the NETWORK layer so a navigation cannot
 * hide it. Requests that are not POSTs are consumed and ignored.
 */
async function collectPosts(cdp, windowMs) {
  const posts = [];
  const deadline = Date.now() + windowMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    let params;
    try {
      params = await cdp.waitEvent("Network.requestWillBeSent", remaining);
    } catch {
      break;
    }
    const method = String(params?.request?.method ?? "GET").toUpperCase();
    if (method === "POST") posts.push(String(params?.request?.url ?? ""));
  }
  return posts;
}

const acceptedExpression = (marker) =>
  `(() => { const t = document.body.innerText || ""; return t.includes(${JSON.stringify(marker)}); })()`;

async function fill(cdp, markers) {
  await typeInto(cdp, "#connect-contact-name", markers.name);
  await typeInto(cdp, "#connect-contact-email", markers.email);
  await typeInto(cdp, "#connect-contact-message", markers.message);
}

async function proveLocale({ cdp, origin, path, check, rows, locale, markers, expected }) {
  const label = (suffix) => `${locale}: ${suffix}`;
  const url = `${origin}${path}`;

  await cdp.navigate(url);
  await cdp.send("Network.enable");

  const formReady = await waitFor(
    cdp,
    `document.querySelector("#connect-contact-acknowledgement") !== null`,
  );
  check(rows, label("the authored form is present"), formReady, path);

  const disclosureVisible = await cdp.evalBool(
    `(() => { const nodes = Array.from(document.querySelectorAll("p, h2, h3")); const hit = nodes.find((n) => (n.innerText || "").includes(${JSON.stringify(markers.disclosure)})); if (!hit) return false; const r = hit.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`,
  );
  check(rows, label("the disclosure is VISIBLE, not merely rendered"), disclosureVisible, markers.disclosure);

  const unchecked = await cdp.evalBool(
    `(() => { const el = document.querySelector("#connect-contact-acknowledgement"); return el !== null && el.checked === false; })()`,
  );
  check(rows, label("consent starts genuinely unchecked"), unchecked, "checked=false");

  // ---- an unticked acknowledgement must send NOTHING -------------------------
  await fill(cdp, markers);
  await cdp.clickCenter('form button[type="submit"]');
  const postsWithoutConsent = await collectPosts(cdp, 5000);
  check(
    rows,
    label("an unticked acknowledgement sends nothing"),
    postsWithoutConsent.length === 0 && !(await cdp.evalBool(acceptedExpression(markers.accepted))),
    `posts=${postsWithoutConsent.length}`,
  );

  // ---- the real submission ---------------------------------------------------
  await cdp.navigate(url);
  await cdp.send("Network.enable");
  await waitFor(cdp, `document.querySelector("#connect-contact-acknowledgement") !== null`);
  // Give the client bundle its moment before a person would have typed anything.
  await sleep(1500);

  await fill(cdp, markers);
  await cdp.clickCenter("#connect-contact-acknowledgement");
  const nowChecked = await cdp.evalBool(
    `document.querySelector("#connect-contact-acknowledgement").checked === true`,
  );
  check(rows, label("the consent control responds to a real click"), nowChecked, "checked=true");

  await cdp.clickCenter('form button[type="submit"]');
  const posts = await collectPosts(cdp, 20000);
  const sameOrigin = posts.every((entry) => new URL(entry, origin).origin === origin);
  check(
    rows,
    label("the browser made exactly one same-origin POST"),
    posts.length === 1 && sameOrigin,
    `posts=${posts.length} sameOrigin=${sameOrigin}`,
  );

  const accepted = await waitFor(cdp, acceptedExpression(markers.accepted), 45000);
  check(rows, label("the visitor sees the demonstration outcome"), accepted, markers.accepted);
  if (!accepted) {
    const dump = await cdp.evaluate("document.body.innerText");
    check(rows, label("submission diagnostic"), false, String(dump).replace(/\s+/g, " ").slice(0, 400));
  }

  const outcome = await cdp.evaluate(
    `(() => { const t = document.body.innerText || ""; const i = t.indexOf(${JSON.stringify(markers.accepted)}); return i < 0 ? "" : t.slice(i, i + 320); })()`,
  );
  check(
    rows,
    label("the outcome makes no positive delivery claim"),
    outcome.includes(markers.accepted) && !outcome.includes(markers.successClaim),
    outcome.replace(/\s+/g, " ").slice(0, 160),
  );

  // ---- exactly once, and never off-origin ------------------------------------
  const repeats = await collectPosts(cdp, SETTLE_MS);
  check(rows, label("no second attempt was ever made"), repeats.length === 0, `repeats=${repeats.length}`);

  const externalRequests = await cdp.evaluate(
    `(() => performance.getEntriesByType("resource").map((e) => e.name).filter((n) => { try { return new URL(n).origin !== location.origin; } catch { return false; } }))()`,
  );
  check(
    rows,
    label("the page contacted no external origin"),
    Array.isArray(externalRequests) && externalRequests.length === 0,
    `external=${JSON.stringify(externalRequests ?? [])}`,
  );

  // ---- private policy confinement -------------------------------------------
  const domLeak = await cdp.evaluate(
    `(() => { const html = document.documentElement.outerHTML; return ${JSON.stringify(expected.forbidden)}.filter((needle) => html.includes(needle)); })()`,
  );
  check(rows, label("no private policy value is in the DOM"), domLeak.length === 0, `leaks=${JSON.stringify(domLeak)}`);

  const bundleLeak = await cdp.evaluate(`(async () => {
    const sources = Array.from(document.scripts).map((s) => s.src).filter(Boolean);
    const hits = [];
    for (const source of sources) {
      try {
        const text = await (await fetch(source, { cache: "no-store" })).text();
        for (const needle of ${JSON.stringify(expected.forbidden)}) if (text.includes(needle)) hits.push(source + " :: " + needle);
      } catch { /* an unreadable bundle is not evidence of a leak */ }
    }
    return hits;
  })()`);
  check(
    rows,
    label("no private policy value is in any client bundle"),
    Array.isArray(bundleLeak) && bundleLeak.length === 0,
    JSON.stringify(bundleLeak ?? []).slice(0, 200),
  );
}

/** Both visitor locales of ONE reference Site, through a real browser. */
export async function proveContactForm({ cdp, origin, check, rows, copy, forbidden }) {
  await cdp.setViewport(1280, 900);
  await proveLocale({
    cdp,
    origin,
    path: "/ww/en/contact",
    check,
    rows,
    locale: "en",
    markers: { ...copy.en, email: "test.visitor@example.com", name: "Test Visitor" },
    expected: { forbidden },
  });
  await proveLocale({
    cdp,
    origin,
    path: "/ww/de/contact",
    check,
    rows,
    locale: "de",
    markers: { ...copy.de, email: "testbesuch@example.com", name: "Testbesuch" },
    expected: { forbidden },
  });
}

/**
 * The disclosure and outcome wording of ONE deployment, read from its OWN dictionaries.
 *
 * A proof must not encode deployment prose, and it must not accept a missing disclosure either: the caller
 * compares what the browser actually shows with what the deployment authored, so a rewritten sentence keeps
 * passing while a deleted one fails.
 */
export function deploymentContactCopy(repositoryRoot, locale) {
  const file = join(repositoryRoot, "deployment", "spokes", "foundation", "config", "i18n", `${locale}.json`);
  return JSON.parse(readFileSync(file, "utf8")).contact;
}
