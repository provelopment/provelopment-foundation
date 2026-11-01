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
    // ── 3b. STRICT BYTES (`R04-C34`): the spellings a query re-serialiser rewrites ────────────────
    // A `URLSearchParams` round-trip maps a space to `+`, appends `=` to a bare key, drops an empty `?`,
    // upper-cases percent hex and decodes unreserved escapes. `skipProxyUrlNormalize` hands the proxy the
    // visitor's OWN request target instead of a rebuilt one, so each row below must come back EXACTLY as it
    // was sent. These are asserted positively: a regression to the re-serialised form fails here.
    const byteExact = [
      ["casing.query.space", "/EN-001/contact?c=a%20b", "/en-001/contact?c=a%20b"],
      ["casing.query.plus", "/EN-001/contact?c=a+b", "/en-001/contact?c=a+b"],
      ["casing.query.literalPlus", "/EN-001/contact?c=a%2Bb", "/en-001/contact?c=a%2Bb"],
      ["casing.query.bareKey", "/EN-001/contact?x", "/en-001/contact?x"],
      ["casing.query.bareAndEmpty", "/EN-001/contact?x&y=", "/en-001/contact?x&y="],
      ["casing.query.empty", "/EN-001/contact?", "/en-001/contact?"],
      ["casing.query.percentHexCase", "/EN-001/contact?f=%2f&g=%2F", "/en-001/contact?f=%2f&g=%2F"],
      ["casing.query.unreservedEscapes", "/EN-001/contact?r=%7E&s=%41", "/en-001/contact?r=%7E&s=%41"],
      ["casing.query.escapedPercent", "/EN-001/contact?p=%2520", "/en-001/contact?p=%2520"],
      ["casing.query.platformAndPageCase", "/DE-DE/About?c=a%20b", "/de-de/about?c=a%20b"],
    ];
    for (const [label, sent, expected] of byteExact) {
      redirectsOnce(label, await request(FOUNDATION_HOST, sent), expected);
    }

    // ── 4. A Page route's case is NOT identity (`D43`): served, never redirected ──────────────────
    // The authored Page is `/de-de/about`, so every spelling of that route must reach the SAME Page with a
    // lowercase canonical — and none of them may earn a second 308.
    const pageVariant = await request(FOUNDATION_HOST, "/de-de/About");
    check(rows, "casing.pageRoute.caseServed", pageVariant.status === 200, String(pageVariant.status));
    check(rows, "casing.pageRoute.caseServed.noLocation", pageVariant.location === "", pageVariant.location);
    // The canonical names the LOWERCASE Page route on the publication's own origin, whatever casing was typed.
    const canonicalOf = (body) => (body.match(/<link rel="canonical" href="([^"]+)"/) ?? ["", "(none)"])[1];
    check(
      rows,
      "casing.pageRoute.caseServed.lowercaseCanonical",
      canonicalOf(pageVariant.body) === `https://${FOUNDATION_HOST}/de-de/about`,
      canonicalOf(pageVariant.body),
    );
    const shoutedVariant = await request(FOUNDATION_HOST, "/de-de/ABOUT");
    check(rows, "casing.pageRoute.shoutedServed", shoutedVariant.status === 200, String(shoutedVariant.status));
    check(
      rows,
      "casing.pageRoute.shoutedServed.lowercaseCanonical",
      canonicalOf(shoutedVariant.body) === `https://${FOUNDATION_HOST}/de-de/about`,
      canonicalOf(shoutedVariant.body),
    );

    // …and every spelling is the SAME Page: same title, same canonical, same language identity.
    const canonicalAbout = await request(FOUNDATION_HOST, "/de-de/about");
    const titleOf = (body) => (body.match(/<title>([^<]*)<\/title>/) ?? ["", "(none)"])[1];
    check(
      rows,
      "casing.pageRoute.samePage",
      canonicalAbout.status === 200 &&
        titleOf(canonicalAbout.body) === titleOf(pageVariant.body) &&
        titleOf(pageVariant.body) === titleOf(shoutedVariant.body) &&
        canonicalOf(pageVariant.body) === canonicalOf(canonicalAbout.body) &&
        canonicalOf(shoutedVariant.body) === canonicalOf(canonicalAbout.body),
      `${titleOf(pageVariant.body)} | ${titleOf(shoutedVariant.body)} | ${titleOf(canonicalAbout.body)}`,
    );
    // The lowercase Page links the page GENERATES are the same in every spelling (navigation, alternates).
    const aboutLinksOf = (body) => (body.match(/href="\/de-de\/about"/g) ?? []).length;
    check(
      rows,
      "casing.pageRoute.sameGeneratedLinks",
      aboutLinksOf(pageVariant.body) === aboutLinksOf(canonicalAbout.body) && aboutLinksOf(canonicalAbout.body) > 0,
      `${aboutLinksOf(pageVariant.body)} vs ${aboutLinksOf(canonicalAbout.body)}`,
    );

    // ── 4b. A PLATFORM variant still redirects exactly once, and its target carries the lowercase Page route
    redirectsOnce("casing.platformWithPageCase", await request(FOUNDATION_HOST, "/DE-DE/About"), "/de-de/about");
    const landedOnce = await request(FOUNDATION_HOST, "/de-de/about");
    check(rows, "casing.platformWithPageCase.landsOn200", landedOnce.status === 200, String(landedOnce.status));

    // ── 4c. The ACTIVE navigation marker follows the PAGE, not the typed casing (`D43`) ──────────
    // The shell's active-link decoration is a per-request accessibility fact, not a route decision:
    // `/de-de/About` is the `/de-de/about` Page, so the same navigation item must be current in BOTH
    // spellings — and no emitted href may be rewritten to match what was typed.
    const currentOf = (body) =>
      (body.match(/<a\b[^>]*>/g) ?? [])
        .filter((anchor) => /aria-current="page"/.test(anchor))
        .map((anchor) => (anchor.match(/href="([^"]*)"/) ?? ["", "(none)"])[1]);
    const canonicalCurrent = currentOf(canonicalAbout.body);
    const variantCurrent = currentOf(pageVariant.body);
    check(
      rows,
      "casing.pageRoute.activeNav.lowercase",
      canonicalCurrent.includes("/de-de/about"),
      JSON.stringify(canonicalCurrent),
    );
    check(
      rows,
      "casing.pageRoute.activeNav.mixedCase",
      variantCurrent.includes("/de-de/about"),
      JSON.stringify(variantCurrent),
    );
    // The marker is the SAME item in both spellings — one current destination, not a case-insensitive scatter:
    check(
      rows,
      "casing.pageRoute.activeNav.sameItem",
      JSON.stringify(variantCurrent) === JSON.stringify(canonicalCurrent),
      `${JSON.stringify(variantCurrent)} vs ${JSON.stringify(canonicalCurrent)}`,
    );
    // …and the capitalised spelling never becomes an emitted destination:
    check(
      rows,
      "casing.pageRoute.activeNav.noCapitalizedHref",
      !/href="\/de-de\/About"/.test(pageVariant.body),
      "the variant body emitted a capitalised href",
    );


    refuses("casing.refused.unsupportedLocale", await request(FOUNDATION_HOST, "/fr-FR/about"));
    refuses("casing.refused.retiredAddress", await request(FOUNDATION_HOST, "/ww/de/about"));
    refuses("casing.refused.unknownPage", await request(FOUNDATION_HOST, "/de-de/nope"));
    // `D43` folds LETTER CASE only: a different word is still a different address, at any capitalization.
    refuses("casing.refused.caseDoesNotInventPages", await request(FOUNDATION_HOST, "/de-de/Aboutt"));

    // ── 5b. The reserved internal Home route stays private in EVERY capitalization (`D43`) ───────
    // The public Home is the locale root; the internal document is never reachable through its own name.
    refuses("casing.home.lowercase", await request(FOUNDATION_HOST, "/de-de/home"));
    refuses("casing.home.upper", await request(FOUNDATION_HOST, "/de-de/HOME"));
    refuses("casing.home.mixed", await request(FOUNDATION_HOST, "/de-de/HoMe"));
    const localeRoot = await request(FOUNDATION_HOST, "/de-de");
    check(rows, "casing.home.localeRootServed", localeRoot.status === 200, String(localeRoot.status));

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

    // ── 9. A REAL navigation to the mixed-case Page address still indicates the active Page ─────
    // `D43` (R04-C33-R02) — this is the accessibility half of the same identity rule, measured in the
    // browser the visitor actually uses: the typed casing must not cost the visitor their position.
    const activeInBrowser = async () =>
      JSON.parse(
        await cdp.evaluate(
          "JSON.stringify({ path: location.pathname, current: Array.from(document.querySelectorAll('a[aria-current=page]')).map((a) => a.getAttribute('href')) })",
        ),
      );
    await cdp.navigate(`${BASE_URL}/de-de/about`);
    await waitReady(cdp);
    const canonicalNav = await activeInBrowser();
    await cdp.navigate(`${BASE_URL}/de-de/About`);
    await waitReady(cdp);
    const mixedNav = await activeInBrowser();
    check(
      rows,
      "casing.browser.mixedCaseServed",
      mixedNav.path === "/de-de/About",
      JSON.stringify(mixedNav.path),
    );
    check(
      rows,
      "casing.browser.mixedCaseKeepsActiveNav",
      mixedNav.current.includes("/de-de/about"),
      JSON.stringify(mixedNav.current),
    );
    check(
      rows,
      "casing.browser.sameActiveNavAsCanonical",
      JSON.stringify(mixedNav.current) === JSON.stringify(canonicalNav.current),
      `${JSON.stringify(mixedNav.current)} vs ${JSON.stringify(canonicalNav.current)}`,
    );
    // Negative: an unknown Page is never current — nothing is served there, so no destination may be
    // announced as current. A refusal has no shell to wait for, so the DOCUMENT is what is awaited.
    await cdp.navigate(`${BASE_URL}/de-de/nope`);
    let refused = { path: "", current: [], ready: "" };
    for (let attempt = 0; attempt < 200; attempt += 1) {
      refused = JSON.parse(
        await cdp.evaluate(
          "JSON.stringify({ path: location.pathname, current: Array.from(document.querySelectorAll('a[aria-current=page]')).map((a) => a.getAttribute('href')), ready: document.readyState })",
        ),
      );
      if (refused.ready === "complete") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    check(
      rows,
      "casing.browser.unknownPageNeverCurrent",
      refused.path === "/de-de/nope" && refused.current.length === 0,
      JSON.stringify(refused),
    );

  } catch (error) {
    check(rows, "efs-canonical-casing.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows;
}
