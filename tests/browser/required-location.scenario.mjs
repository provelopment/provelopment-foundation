/**
 * AN AUTHORED CHOICE OF LANGUAGE — PROVED ON REAL EFS PUBLICATIONS (GEO-04 C09-R18)
 * ===================================================================================
 *
 * WHAT REPLACED WHAT. This scenario used to test the retired `ca` Site's `locationSelection` policy: a `north`
 * default, a `de → south` refinement, `307`s into `/ca/en/north` and `/ca/de/south`, a Location selector, and
 * `business.pages`/`content/pages/markdown/ca/**` authoring behind `{ deploymentRoot }`. None of that publishes
 * an EFS Page after the EFS-only runtime cut, so the Location POLICY tests are retired — the useful capability
 * they stood for is not:
 *
 *   · an author really CAN publish different Page representations at ONE Site and ONE route in explicitly
 *     declared qualified locales, and a visitor really CAN choose an offered language to reach the other one;
 *   · the choice stays inside the same Site, the same Page and the same owner — never a region, Location,
 *     foreign Site or another host;
 *   · a Page that nobody declared is REFUSED, not completed into a default Location;
 *   · only real declarations are discoverable, and the retired geographic grammar never comes back.
 *
 * TWO INDEPENDENT SERVING STATES, because that is what the retired `required` versus `optional` policy pair
 * actually tested — and because an absence can only be proved on a publication that never declared the Page:
 *
 *   PHASE A — `declareChoicePages` publishes Site `outlet`'s Home and the `choice` Page in BOTH declared locales,
 *             each with its own marker. The language control really moves between the two representations.
 *   PHASE B — a fresh, separately owned Installation with NO authoring hook: the generic Home is still served,
 *             and `/outlet/<locale>/choice` has no declaration, so it refuses. Nothing is synthesized.
 *
 * `127.0.0.1` is the transport address, NOT a Host any binding claims: every HTTP claim is addressed to the
 * declared Host `localhost`, and the browser speaks `http://localhost:<port>`. Route words are Page routes.
 */
import { request as httpRequest } from "node:http";

import { Cdp } from "./cdp.mjs";

/** The scenario id — retained so filename-driven discovery and report continuity are unchanged. */
export const id = "required-location";

/** The Host every generic EFS binding claims. */
const HOST = "localhost";

/** The manifest's canonical origin, from which `<loc>` and the sitemap derive. */
const CANONICAL = `https://${HOST}`;

/** Phase A and Phase B try these ports in turn, so a busy port is a retry rather than a failure. */
const PHASE_A_PORTS = [31, 32, 33];
const PHASE_B_PORTS = [34, 35, 36];

/** The authored Page route, and the two qualified locales that carry it. */
const CHOICE = "choice";
const EN = { locale: "en-001", pathKey: "en-001", suffix: "EN" };
const DE = { locale: "de-DE", pathKey: "de-de", suffix: "DE" };
const LOCALES = [EN, DE];

/** Test-owned body markers: every assertion can name the Site, locale and Page it actually received. */
const MARKER = {
  homeEn: "EFS-OUTLET-HOME-EN",
  homeDe: "EFS-OUTLET-HOME-DE",
  choiceEn: "EFS-OUTLET-CHOICE-EN",
  choiceDe: "EFS-OUTLET-CHOICE-DE",
};

/** The binding-owned path of one qualified locale, optionally suffixed by a Page route. */
function outletPath(localePath, suffix = "") {
  return suffix === "" ? `/outlet/${localePath}` : `/outlet/${localePath}/${suffix}`;
}
const CHOICE_EN_PATH = outletPath(EN.pathKey, CHOICE);
const CHOICE_DE_PATH = outletPath(DE.pathKey, CHOICE);
const HOME_EN_PATH = outletPath(EN.pathKey);
const HOME_DE_PATH = outletPath(DE.pathKey);

/**
 * One valid declarative Page document. The `title` is what the Page renders as its heading; the `body` is the
 * test-owned marker, so a marker in the document can only come from the representation that was served.
 */
function documentOf(title, marker) {
  return `${JSON.stringify(
    { schemaVersion: 1, title, sections: [{ type: "prose", body: marker }] },
    null,
    2,
  )}\n`;
}

/**
 * PHASE A's authored publication — synchronous, before Next spawns.
 *
 * The SAME `choice` route is published in both declared locales as one representation PAIR of one Page: this is
 * an author's explicit declaration, not two Sites, two inferred regions or a locale→Location mapping. The Home
 * representation each locale already has is refreshed with its own marker (the generic fixture declares it, so
 * this updates that representation rather than adding a conflicting source).
 */
function declareChoicePages(authoring) {
  for (const { locale, suffix } of LOCALES) {
    authoring.authorPage({
      siteId: "outlet",
      locale,
      route: [],
      format: "json",
      body: documentOf(`Outlet Home ${suffix}`, suffix === "EN" ? MARKER.homeEn : MARKER.homeDe),
    });
    authoring.authorPage({
      siteId: "outlet",
      locale,
      route: [CHOICE],
      format: "json",
      body: documentOf(`Outlet Choice ${suffix}`, suffix === "EN" ? MARKER.choiceEn : MARKER.choiceDe),
      navLabel: "Choice",
    });
  }
}

/**
 * ONE request, with an EXPLICIT `Host` header and redirects NOT followed — the status a visitor really receives.
 */
function requestWithHost(port, host, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            host,
            path: pathname,
            status: response.statusCode ?? 0,
            location: response.headers.location ?? null,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    request.on("error", reject);
    request.on("timeout", () => request.destroy(new Error(`timed out: ${pathname}`)));
    request.setTimeout(30000);
    request.end();
  });
}

/** The `<loc>` entries of a served sitemap. */
function sitemapUrls(body) {
  return [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
}

/**
 * Start ONE generic EFS server on a port that answers its OWN claimed Home.
 *
 * Phase A passes an authoring hook, Phase B passes none — and a server with no hook declares nothing beyond the
 * generic fixture, which is exactly the absence this scenario must prove. Each call materialises a separate,
 * separately owned Installation; `stopServer` removes it.
 */
async function startServer(harness, prepareEfs, ports, label) {
  let last = null;
  for (const offset of ports) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, prepareEfs === null ? {} : { prepareEfs });
    try {
      const deadline = Date.now() + 120000;
      let status = 0;
      while (Date.now() < deadline) {
        try {
          status = (await requestWithHost(port, HOST, HOME_EN_PATH)).status;
        } catch {
          status = 0;
        }
        if (status === 200) return { server, port };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      // An already-running server that answers the CLAIMED Home with anything but 200 is a failed contract,
      // not "not ready": the log is reported so the cause is visible without a long retry loop.
      throw new Error(
        `${label}: the Installation never served ${HOME_EN_PATH} on Host ${HOST} (status=${status})\n` +
          `--- dev server output ---\n${server.log()}`,
      );
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error(`${label}: no port answered`);
}

/** Assert one expected status, aborting the run with Host/path/status/log when it does not hold. */
async function expectStatus(harness, rows, port, server, pathname, expected, label, host = HOST, marker = null) {
  let response = null;
  let failure = null;
  try {
    response = await requestWithHost(port, host, pathname);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  const status = response?.status ?? 0;
  const hasMarker = marker === null || (response?.body.includes(marker) ?? false);
  harness.check(
    rows,
    label,
    status === expected && hasMarker,
    `host=${host} path=${pathname} status=${status} expected=${expected} location=${
      response?.location ?? "none"
    }${marker === null ? "" : ` marker=${marker}:${hasMarker}`}${failure === null ? "" : ` error=${failure}`}`,
  );
  if (status !== expected || !hasMarker) {
    throw new Error(
      `EFS publication claim refused: host=${host} path=${pathname} status=${status} expected=${expected} ` +
        `location=${response?.location ?? "none"}\n--- dev server output ---\n${server.log()}`,
    );
  }
  return response;
}

/**
 * PHASE A's bounded preflight — every row independent, all of it BEFORE Chrome exists.
 */
async function preflightPhaseA(harness, rows, port, server) {
  await expectStatus(harness, rows, port, server, HOME_EN_PATH, 200, "the authored Home is served (en-001)", HOST, MARKER.homeEn);
  await expectStatus(harness, rows, port, server, HOME_DE_PATH, 200, "the authored Home is served (de-DE)", HOST, MARKER.homeDe);

  const choiceEn = await expectStatus(
    harness,
    rows,
    port,
    server,
    CHOICE_EN_PATH,
    200,
    "the AUTHORED `choice` Page is served in en-001, with its own representation",
    HOST,
    MARKER.choiceEn,
  );
  harness.check(
    rows,
    "…and the en-001 representation is NOT the de-DE one",
    !choiceEn.body.includes(MARKER.choiceDe),
    choiceEn.body.includes(MARKER.choiceDe) ? "the DE marker was served at the EN address" : "EN marker only",
  );

  const choiceDe = await expectStatus(
    harness,
    rows,
    port,
    server,
    CHOICE_DE_PATH,
    200,
    "the SAME Page is served in de-DE, with its own representation",
    HOST,
    MARKER.choiceDe,
  );
  harness.check(
    rows,
    "…and the de-DE representation is NOT the en-001 one",
    !choiceDe.body.includes(MARKER.choiceEn),
    choiceDe.body.includes(MARKER.choiceEn) ? "the EN marker was served at the DE address" : "DE marker only",
  );

  await expectStatus(harness, rows, port, server, "/main/en-001", 200, "the other Site's Home is untouched", HOST);
  await expectStatus(harness, rows, port, server, "/main/en-001/choice", 404, "a FOREIGN Site has no such Page", HOST);
  await expectStatus(harness, rows, port, server, "/outlet/en-001/undeclared", 404, "an UNDECLARED Page is refused", HOST);
  await expectStatus(harness, rows, port, server, "/outlet/en/choice", 404, "a BARE, undeclared locale is not an alias", HOST);
  await expectStatus(harness, rows, port, server, "/outlet/en-001/north/choice", 404, "no inferred Location segment is routed", HOST);
  await expectStatus(harness, rows, port, server, "/ca/en/north", 404, "the retired `ca` Site is never revived", HOST);
  await expectStatus(harness, rows, port, server, "/ca/de/south", 404, "the retired `ca` refinement is never revived", HOST);
  await expectStatus(harness, rows, port, server, "/ww/en", 404, "the retired `ww` grammar is never revived", HOST);
  await expectStatus(harness, rows, port, server, CHOICE_EN_PATH, 404, "no cross-host fallback for an unclaimed Host", "unclaimed.localhost");
}


/**
 * DISCOVERY on one server: only real declarations are advertised, at THIS binding's canonical origin, and the
 * retired geographic grammar never appears. The expected addresses are authored here, never parsed back out.
 */
async function discoveryProof(harness, rows, port, server, expected, absent, phase) {
  const sitemap = await requestWithHost(port, HOST, "/sitemap.xml");
  const urls = sitemapUrls(sitemap.body);
  harness.check(
    rows,
    `${phase}: the sitemap is served for the claimed Host`,
    sitemap.status === 200 && urls.length > 0,
    `status=${sitemap.status} urls=${urls.length}`,
  );
  for (const address of expected) {
    harness.check(
      rows,
      `${phase}: the sitemap publishes ${address}`,
      urls.includes(address),
      urls.includes(address) ? `${urls.length} URL(s)` : urls.join(", "),
    );
  }
  for (const address of absent) {
    harness.check(
      rows,
      `${phase}: the sitemap publishes NOTHING at ${address}`,
      !urls.includes(address),
      `${urls.length} URL(s); no match`,
    );
  }
  harness.check(
    rows,
    `${phase}: every published address is on this binding's canonical origin, with no geographic grammar`,
    urls.every((url) => url.startsWith(CANONICAL)) && urls.every((url) => !/\/(ww|ca)\//.test(url)),
    urls.join(", "),
  );
  /**
   * The SITEMAP carries only addresses that declare themselves. Two facts are asserted, and no more: nothing is
   * published under the retired Site grammar, and no address is a Location COMPLETION of the Page under test.
   * (`/outlet/en-001/north` and `/south` are legitimate declared ROUTE WORDS of the generic fixture — a route word
   * is not geographic authority, and forbidding the string would punish the fixture's own authoring.)
   */
  harness.check(
    rows,
    `${phase}: no published address uses the retired Site grammar or a Location completion`,
    urls.every((url) => !/\/(ww|ca)\//.test(url)) &&
      urls.every((url) => !/\/(north|south)\/choice$/.test(url)),
    urls.join(", "),
  );

  const robots = await requestWithHost(port, HOST, "/robots.txt");
  harness.check(
    rows,
    `${phase}: robots.txt keeps its authored sitemap origin and invents no Disallow`,
    robots.body.includes(`${CANONICAL}/sitemap.xml`) &&
      robots.body.includes("User-Agent: *") &&
      !/disallow/i.test(robots.body),
    robots.body.replace(/\s+/g, " ").trim().slice(0, 160),
  );
  if (sitemap.status !== 200) {
    throw new Error(`${phase}: sitemap refused (status=${sitemap.status})\n--- dev server output ---\n${server.log()}`);
  }
}

/**
 * PHASE B's preflight — the SAME Installation type, WITHOUT the authoring hook. The Home still publishes; the
 * Page nobody declared refuses. No `307`, no default Location, no synthesized representation.
 */
async function preflightPhaseB(harness, rows, port, server) {
  await expectStatus(harness, rows, port, server, HOME_EN_PATH, 200, "without the hook the generic Home still serves (en-001)");
  await expectStatus(harness, rows, port, server, HOME_DE_PATH, 200, "…and in de-DE");
  await expectStatus(harness, rows, port, server, CHOICE_EN_PATH, 404, "an UNDECLARED Page refuses in en-001");
  await expectStatus(harness, rows, port, server, CHOICE_DE_PATH, 404, "an UNDECLARED Page refuses in de-DE");
  await expectStatus(harness, rows, port, server, "/main/en-001", 200, "…while the other Site is unaffected");

  // A refusal must be a REFUSAL: no completion, no relocation, no silent fallback into a default Location.
  for (const pathname of [CHOICE_EN_PATH, CHOICE_DE_PATH]) {
    const response = await requestWithHost(port, HOST, pathname);
    harness.check(
      rows,
      `the absence of a declaration is a refusal, not a redirect: ${pathname}`,
      response.location === null,
      `status=${response.status} location=${response.location ?? "none"}`,
    );
  }
}


/**
 * WHAT THE PAGE ITSELF OFFERS. The language control is the one selector a Site-closed EFS publication may show:
 * its options are the binding's DECLARED locale path keys, and no Location or Site selector is manufactured.
 */
const SELECTOR_PROBE = `(() => {
  const read = (name) => {
    const select = document.querySelector('select[data-selector="' + name + '"]');
    if (select === null) return null;
    return {
      value: select.value,
      values: [...select.options].map((option) => option.value),
      labels: [...select.options].map((option) => (option.textContent || "").trim()),
      disabled: select.disabled,
    };
  };
  return { language: read("language"), location: read("location"), site: read("site") };
})()`;

/** Everything a rendered Page of this scenario claims, as the browser sees it. */
const PAGE_PROBE = `(() => {
  const heading = document.querySelector("h1");
  return {
    h1: heading === null ? null : (heading.textContent || "").trim(),
    // WHAT THE VISITOR ACTUALLY SEES. innerText excludes script payloads (an RSC flight response carries
    // route data that is not rendered), so a marker found here really was painted on the page.
    text: (document.body.innerText || document.body.textContent || "").trim(),
    navLinks: [...document.querySelectorAll("a[href]")].map((link) => link.getAttribute("href")),
    hasHeaderBrand: !!document.querySelector(".ui-site-header-identity"),
    pathname: location.pathname,
    host: location.host,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  };
})()`;

/** One visitor action on the LANGUAGE control, reproduced exactly as the browser performs it. */
async function dispatchLanguageChange(cdp, value) {
  return cdp.evaluate(
    `(() => {
       const select = document.querySelector('select[data-selector="language"]');
       if (!select) return false;
       // React tracks a node's value property, so a plain assignment is seen as "no change". The NATIVE
       // setter reproduces what a visitor's selection does, and the bubbling change event reaches React.
       const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
       setValue.call(select, ${JSON.stringify(value)});
       select.dispatchEvent(new Event("change", { bubbles: true }));
       return true;
     })()`,
  );
}

/**
 * Activate the language control and await the transition through the harness's OWN readiness layer. Only the
 * ACTION is retried (a dev client activates asynchronously); the ASSERTION is never relaxed.
 */
async function activateLanguageControl(harness, cdp, value, expectedPath, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await dispatchLanguageChange(cdp, value);
    try {
      await harness.waitReady(cdp, { path: expectedPath });
      return true;
    } catch {
      /* the client runtime was not yet interactive: retry the visitor action */
    }
  }
  return false;
}


/** PHASE A in a real browser: one authored Page, offered in two declared languages, inside one owner. */
async function browserPhaseA(harness, rows, chrome, port) {
  const cdp = await Cdp.connect(chrome);
  try {
    await cdp.setViewport(harness.viewports.desktop.width, harness.viewports.desktop.height);
    await cdp.navigate(`http://${HOST}:${port}${CHOICE_EN_PATH}`);
    await harness.waitReady(cdp, { path: CHOICE_EN_PATH });

    const selectors = await cdp.evaluate(SELECTOR_PROBE);
    harness.check(
      rows,
      "the Page offers a real LANGUAGE control",
      selectors.language !== null && selectors.language.disabled === false,
      JSON.stringify(selectors.language),
    );
    const offered = (selectors.language?.values ?? []).slice().sort();
    harness.check(
      rows,
      "…whose options are exactly the two DECLARED qualified locales of the binding",
      JSON.stringify(offered) === JSON.stringify([EN.pathKey, DE.pathKey].sort()),
      JSON.stringify(selectors.language),
    );
    harness.check(
      rows,
      "…each labelled, never an empty control",
      (selectors.language?.labels ?? []).length > 0 &&
        (selectors.language?.labels ?? []).every((label) => label !== ""),
      JSON.stringify(selectors.language?.labels ?? null),
    );
    harness.check(
      rows,
      "no LOCATION selector is fabricated for an EFS Page",
      selectors.location === null,
      JSON.stringify(selectors.location),
    );
    harness.check(
      rows,
      "no SITE selector is fabricated for a Site-closed binding",
      selectors.site === null,
      JSON.stringify(selectors.site),
    );

    const page = await cdp.evaluate(PAGE_PROBE);
    harness.check(
      rows,
      "the en-001 representation renders its own heading and test-owned body",
      page.h1 === "Outlet Choice EN" && page.text.includes(MARKER.choiceEn),
      `h1=${JSON.stringify(page.h1)} marker=${page.text.includes(MARKER.choiceEn)}`,
    );
    harness.check(
      rows,
      "…inside the shared shell, without horizontal overflow",
      page.hasHeaderBrand === true && page.scrollWidth <= page.clientWidth + 1,
      `brand=${page.hasHeaderBrand} scroll=${page.scrollWidth}/${page.clientWidth}`,
    );
    // THE NAVIGATION LINK, WHERE ONE EXISTS. The order makes this conditional: a Page may be reachable without a
    // navigation entry. What is NOT conditional is the destination — any link to this Page must stay inside its
    // own Site and qualified locale, never `/ww`, `/ca` or a legacy region.
    const choiceLinks = page.navLinks.filter((href) => (href ?? "").includes(CHOICE));
    harness.check(
      rows,
      "every navigation link to this Page resolves inside its own Site and qualified locale",
      choiceLinks.every(
        (href) =>
          href === CHOICE_EN_PATH ||
          href === CHOICE_DE_PATH ||
          href === `http://${HOST}:${port}${CHOICE_EN_PATH}` ||
          href === `http://${HOST}:${port}${CHOICE_DE_PATH}`,
      ),
      `links=${JSON.stringify(choiceLinks.slice(0, 6))}`,
    );
    const focusable = await cdp.evaluate(
      `(() => {
         const select = document.querySelector('select[data-selector="language"]');
         if (select === null) return false;
         select.focus();
         return document.activeElement === select && select.tabIndex >= 0;
       })()`,
    );
    harness.check(rows, "…the language control is keyboard reachable", focusable === true, `focused=${focusable}`);

    // THE CHOICE ITSELF.
    const moved = await activateLanguageControl(harness, cdp, DE.pathKey, CHOICE_DE_PATH);
    harness.check(
      rows,
      "choosing the other language moves the visitor to the same Page",
      moved === true,
      `expected path=${CHOICE_DE_PATH}`,
    );
    const german = await cdp.evaluate(PAGE_PROBE);
    harness.check(
      rows,
      "…which now serves the de-DE representation, with its own heading and body",
      german.h1 === "Outlet Choice DE" && german.text.includes(MARKER.choiceDe),
      `h1=${JSON.stringify(german.h1)} marker=${german.text.includes(MARKER.choiceDe)}`,
    );
    harness.check(
      rows,
      "…on the SAME Site, the SAME Page and the same Host — never another Site, region or Location",
      german.pathname === CHOICE_DE_PATH && german.host === `${HOST}:${port}`,
      `pathname=${german.pathname} host=${german.host}`,
    );
    harness.check(
      rows,
      "…and the de-DE representation is not the en-001 one",
      !german.text.includes(MARKER.choiceEn),
      german.text.includes(MARKER.choiceEn) ? "the EN marker was served at the DE address" : "DE marker only",
    );
    harness.check(
      rows,
      "…still without horizontal overflow at the canonical viewport",
      german.scrollWidth <= german.clientWidth + 1,
      `${german.scrollWidth}/${german.clientWidth}`,
    );
  } finally {
    await cdp.close();
  }
}

/** PHASE B in a CLEAN browser session against the server that never declared the Page. */
async function browserPhaseB(harness, rows, chrome, port) {
  const cdp = await Cdp.connect(chrome);
  try {
    await cdp.setViewport(harness.viewports.desktop.width, harness.viewports.desktop.height);
    await cdp.navigate(`http://${HOST}:${port}${HOME_EN_PATH}`);
    await harness.waitReady(cdp, { path: HOME_EN_PATH });

    const page = await cdp.evaluate(PAGE_PROBE);
    harness.check(
      rows,
      "without the declaration the Home still renders normally",
      page.hasHeaderBrand === true && page.text.trim() !== "",
      `h1=${JSON.stringify(page.h1)} brand=${page.hasHeaderBrand}`,
    );
    harness.check(
      rows,
      "…with no choice Page, marker or navigation link synthesized from Site configuration",
      !page.text.includes(MARKER.choiceEn) && !page.navLinks.some((href) => (href ?? "").includes(CHOICE)),
      JSON.stringify(page.navLinks.filter((href) => (href ?? "").includes(CHOICE)).slice(0, 4)),
    );

    const selectors = await cdp.evaluate(SELECTOR_PROBE);
    harness.check(
      rows,
      "…and no LOCATION selector appears even here",
      selectors.location === null,
      JSON.stringify(selectors.location),
    );
  } finally {
    await cdp.close();
  }
}


const canonical = (pathname) => `${CANONICAL}${pathname}`;

/**
 * RUN BOTH PHASES — sequentially, each on its own Installation, because one Next dev lock is shared.
 *
 * Phase A proves the authored choice, Phase B proves the absence of a declaration. Neither shares a Page
 * declaration with the other: they are two separately materialised publications.
 */
export async function run(chrome, harness) {
  const rows = [];
  const started = { A: null, B: null };

  try {
    // ── PHASE A — an author explicitly publishes a choice ─────────────────────────────────────────────
    started.A = await startServer(harness, declareChoicePages, PHASE_A_PORTS, "phase A (authored choice)");
    await preflightPhaseA(harness, rows, started.A.port, started.A.server);
    await discoveryProof(
      harness,
      rows,
      started.A.port,
      started.A.server,
      [canonical(HOME_EN_PATH), canonical(HOME_DE_PATH), canonical(CHOICE_EN_PATH), canonical(CHOICE_DE_PATH)],
      [canonical("/main/en-001/choice"), canonical("/ca/en/north"), canonical("/ww/en/preview")],
      "phase A",
    );
    await browserPhaseA(harness, rows, chrome, started.A.port);
    await harness.stopServer(started.A.server);
    started.A = null;

    // ── PHASE B — no declaration, so no Page ─────────────────────────────────────────────────────────
    started.B = await startServer(harness, null, PHASE_B_PORTS, "phase B (no declaration)");
    await preflightPhaseB(harness, rows, started.B.port, started.B.server);
    await discoveryProof(
      harness,
      rows,
      started.B.port,
      started.B.server,
      [canonical(HOME_EN_PATH), canonical(HOME_DE_PATH)],
      [canonical(CHOICE_EN_PATH), canonical(CHOICE_DE_PATH), canonical("/ca/en/north"), canonical("/ww/en")],
      "phase B",
    );
    await browserPhaseB(harness, rows, chrome, started.B.port);
  } catch (error) {
    harness.check(
      rows,
      "the required-location scenario ran to completion across both phases",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    for (const phase of ["A", "B"]) {
      const server = started[phase];
      if (server === null) continue;
      try {
        await harness.stopServer(server.server);
      } catch {
        /* the server is already gone; its own installation is removed by the harness */
      }
    }
  }

  return rows;
}

export default { id, run };
