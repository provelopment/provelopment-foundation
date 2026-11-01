// deployment/tests/browser/efs-canonical-casing.scenario.mjs
// MATCHED-ADDRESS CAPITALIZATION — `D40` DECISION B (`R04-C30`).
//
// The reference deployment's own acceptance of ONE platform promise: a visitor who reaches a MATCHED,
// explicitly authored publication address whose binding prefix, Site selector or locale path key differs
// from its declaration ONLY in capitalization is answered with a SINGLE `308` to the authored spelling,
// with the authored Page route and the visitor's query string carried unchanged. Correct spelling is
// served, an unpublished address is refused, and a Page route's own case is CONTENT — never corrected.
//
// HOW IT IS RUN
//   `pnpm test:browser` discovers every `*.scenario.mjs` in this directory and calls `run(chrome, harness)`.
//   The harness supplies the port, the viewports, the assertion collector, the dev server and the readiness
//   poll; this file owns only this deployment's expectations. Its subject is the SHIPPED configuration, so it
//   starts the dev server WITHOUT the synthetic override and reads nothing it could write.
//
// WHY THE STATUS IS MEASURED, NOT INFERRED
//   The promise is an HTTP one, so every row below is a real response from the real server for a real `Host`.
//   One navigation is then driven through Chrome, because "exactly one redirect" is also a browser fact.

import { Cdp } from "../../../tests/browser/cdp.mjs";
import {
  FOUNDATION_HOST,
  GERMANY_HOST,
  HOST_RESOLVER_RULES,
  requestWithHost,
  waitForHostReady,
} from "../support/host-requests.mjs";

/** The dev server THIS scenario started, as a visitor addresses it (set below, per run). */
let BASE_URL = "";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "efs-canonical-casing";

export async function run(chrome, harness) {
  const { port: portFor, viewports, check, startDevServer, stopServer, waitReady } = harness;

  const rows = [];
  const port = portFor(411);
  BASE_URL = `http://${FOUNDATION_HOST}:${port}`;
  const server = startDevServer(port, { synthetic: false });
  let cdp = null;

  const request = (host, path) => requestWithHost(port, host, path);
  /** ONE `308` with exactly this `Location`, and nothing else. */
  const redirectsOnce = (label, response, location) => {
    check(rows, `${label}.is308`, response.status === 308, `${response.status} ${response.location}`);
    check(
      rows,
      `${label}.location`,
      response.location === location,
      `${JSON.stringify(response.location)} !== ${JSON.stringify(location)}`,
    );
  };
  /** A refusal: the address is not published, so it gets no redirect and no other resource. */
  const refuses = (label, response) => {
    check(rows, `${label}.status`, response.status === 404, `${response.status} ${response.location}`);
    check(rows, `${label}.noLocation`, response.location === "", response.location);
  };

  try {
    await waitForHostReady(port, FOUNDATION_HOST, "/en-001", server);

    // ── 1. The platform segments are corrected to the AUTHORED spelling, once ─────────────────────
    redirectsOnce("casing.locale.upper", await request(FOUNDATION_HOST, "/DE-DE"), "/de-de");
    // A mixed-case spelling is the same address, and the SECOND Spoke answers with ITS OWN spelling.
    redirectsOnce("casing.germany.ownSpelling", await request(GERMANY_HOST, "/De-De/berlin"), "/de-de/berlin");

    // ── 2. The canonical address is SERVED: a correct spelling never redirects ───────────────────
    const canonical = await request(FOUNDATION_HOST, "/de-de");
    check(rows, "casing.canonical.is200", canonical.status === 200, String(canonical.status));

    // ── 3. The visitor's query string survives the redirect, byte for byte ───────────────────────
    // Repeated keys, their order, percent-escapes (including a UTF-8 sequence) and a literal `+` — the
    // parts a re-encoded query silently rewrites. This is the strict form of the promise.
    const query = "/EN-001/contact?A=1&a=2&b=%2Fx&d=%E2%9C%93&e=a+b";
    redirectsOnce(
      "casing.query.preserved",
      await request(FOUNDATION_HOST, query),
      query.replace("/EN-001", "/en-001"),
    );
    // ── 3b. MEASURED PLATFORM LIMIT (not this redirect's behaviour) ──────────────────────────────
    // Next.js parses the request URL with `URLSearchParams` BEFORE the edge proxy runs, so a query that
    // spells a space as `%20` reaches every boundary as `+`. Both spellings mean the same query value, so
    // the meaning survives; the BYTES are the platform's and no D40-B code can recover them. Pinned so a
    // future Next version that preserves them is noticed rather than assumed.
    const spaced = await request(FOUNDATION_HOST, "/EN-001/contact?c=a%20b");
    check(
      rows,
      "casing.query.spaceAsPlatformPlus",
      spaced.status === 308 && spaced.location === "/en-001/contact?c=a+b",
      `${spaced.status} ${JSON.stringify(spaced.location)}`,
    );

    // ── 4. A Page route's case is CONTENT: refused, never corrected ─────────────────────────────
    refuses("casing.pageRoute.caseRefused", await request(FOUNDATION_HOST, "/de-de/About"));
    // …and a casing correction may not RESCUE an address whose Page does not exist.
    refuses("casing.pageRoute.notRescued", await request(FOUNDATION_HOST, "/DE-DE/About"));

    // ── 5. Unpublished addresses stay refused: no casing redirect to some other resource ────────
    refuses("casing.refused.unsupportedLocale", await request(FOUNDATION_HOST, "/fr-FR/about"));
    refuses("casing.refused.retiredAddress", await request(FOUNDATION_HOST, "/ww/de/about"));
    refuses("casing.refused.unknownPage", await request(FOUNDATION_HOST, "/de-de/nope"));

    // ── 6. Owners stay apart on their own hosts ─────────────────────────────────────────────────
    refuses("casing.isolation.germanyPageOnFoundationHost", await request(FOUNDATION_HOST, "/de-de/berlin"));
    refuses("casing.isolation.foundationPageOnGermanyHost", await request(GERMANY_HOST, "/de-de/contact"));

    // ── 7. The reserved D42 image suffix and the Spoke asset namespace are NOT Page addresses ──
    // A casing redirect belongs to the Page address chain; these two surfaces keep their own separate
    // rules, so a mixed-case spelling must not acquire a 308 here.
    const imageVariant = await request(FOUNDATION_HOST, "/DE-DE/opengraph-image");
    const imageCanonical = await request(FOUNDATION_HOST, "/de-de/opengraph-image");
    check(
      rows,
      "casing.d42.imageNeverRedirected",
      imageVariant.status !== 308 && imageCanonical.status !== 308,
      `${imageVariant.status} ${imageCanonical.status}`,
    );
    const assetVariant = await request(FOUNDATION_HOST, "/SPOKES/germany/assets/sidebar-open.svg");
    check(
      rows,
      "casing.assets.namespaceNeverRedirected",
      assetVariant.status !== 308,
      `${assetVariant.status} ${assetVariant.location}`,
    );

    // ── 8. One redirect, in a real browser, onto the same authored representation ──────────────
    cdp = await Cdp.connect(chrome, { hostResolverRules: HOST_RESOLVER_RULES });
    await cdp.setViewport(viewports.desktop.width, viewports.desktop.height);
    await cdp.navigate(`${BASE_URL}/DE-DE`);
    await waitReady(cdp);
    const landed = JSON.parse(
      await cdp.evaluate("JSON.stringify({ path: location.pathname, lang: document.documentElement.lang })"),
    );
    check(rows, "casing.browser.landsOnCanonicalPath", landed.path === "/de-de", JSON.stringify(landed));
    // The representation is the SAME one the canonical address serves: a casing redirect changes the
    // address, never the language identity of what is published at it.
    check(rows, "casing.browser.keepsAuthoredLanguage", landed.lang === "de-DE", String(landed.lang));
  } catch (error) {
    check(rows, "efs-canonical-casing.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows;
}
