/**
 * AN UNLISTED PAGE, PROVED THROUGH A REAL EFS SERVER AND A REAL BROWSER (GEO-04 C09-R17)
 * =====================================================================================
 *
 * WHAT THIS SCENARIO EXISTS FOR. The unit and integration suites prove the publication contract at the
 * composition: which inventory a sitemap publishes, which `hreflang` alternates a response offers, what a Page's
 * own document says about visibility. This scenario proves the SAME capability where those cannot reach — over
 * real HTTP and in a real browser, against the EFS publication model that actually ships:
 *
 *   · an UNLISTED Page really IS SERVED (200, its authored content) and its own response really carries
 *     `<meta name="robots" content="noindex, nofollow">`;
 *   · an ordinary PUBLIC Page carries NO such tag, and keeps every qualified alternate it publishes;
 *   · `sitemap.xml` really does NOT name an unlisted Page — while naming the public ones at the binding's
 *     canonical origin;
 *   · `robots.txt` is untouched: no `Disallow` was invented to "hide" a Page;
 *   · the unlisted Page renders as an ORDINARY page at every canonical viewport (header, one h1, no sideways
 *     scroll) — publication is not a presentation difference;
 *   · and NONE of it crosses an owner boundary: a Page declared on one EFS Site is refused on the other, an
 *     undeclared sibling is refused, the retired `/ww/en` grammar is refused, and a Host no binding claims is
 *     refused.
 *
 * WHAT IT NO LONGER DOES, AND WHY THAT IS NOT A LOSS. The retired scenario copied the synthetic deployment and
 * authored a legacy `content/pages/{json,markdown}/ww|ca/en/**` tree, then probed `/ww/en/**` and `/ca/en/north`.
 * After the GEO-04 EFS-only runtime cut that tree is not a serving contract at all. Each of its OBLIGATIONS is
 * preserved below against the declaration that now owns it — the old→new ledger:
 *
 *   ww/en/catalogue          → main/en-001/catalogue          public Page
 *   ww/en/preview            → main/en-001/preview            unlisted Page
 *   ca/en/south (MD shadow)  → outlet/en-001/private-landing  ONE EFS Page, JSON + Markdown sources
 *   ca/en/north              → outlet/en-001/showcase         an EXPLICITLY published landing
 *   ca/en/north/quote-public → outlet/en-001/showcase/quote-public   declared nested public Page
 *   ca/en/north/quote-hidden → outlet/en-001/showcase/quote-hidden   declared nested unlisted Page
 *
 * The regional ADDRESS and the implicit page lookup are gone; the visibility, precedence, nesting and discovery
 * obligations are not. Route words here are Page routes — never operating regions, Location IDs or geographic
 * policy. There is no EFS Site `ww` or `ca`: those survive only as PRESENTATION keys of the generic
 * Installation's `main` and `outlet` Sites.
 */
import { request as httpRequest } from "node:http";

import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "unlisted-visibility";

/** The Host every published binding claims. `127.0.0.1` is NOT a binding Host — see `preflight`. */
const HOST = "localhost";

/** The manifest's canonical origin, from which `<loc>`, canonical and alternate URLs derive. */
const CANONICAL = `https://${HOST}`;

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [51, 52, 53];

/** The two Sites this Installation publishes, and their qualified Home addresses. */
const MAIN_HOME = "/main/en-001";
const OUTLET_HOME = "/outlet/en-001";

/** The addresses this scenario proves, authored HERE and never derived from a response. */
const PUBLIC_ADDRESSES = [
  `${CANONICAL}${MAIN_HOME}/catalogue`,
  `${CANONICAL}/main/de-de/catalogue`,
  `${CANONICAL}${OUTLET_HOME}/showcase`,
  `${CANONICAL}${OUTLET_HOME}/showcase/quote-public`,
];
const UNLISTED_ADDRESSES = [
  `${CANONICAL}${MAIN_HOME}/preview`,
  `${CANONICAL}${OUTLET_HOME}/private-landing`,
  `${CANONICAL}${OUTLET_HOME}/showcase/quote-hidden`,
];

/** Unambiguous test-only body strings, so every assertion can name its serving owner and format. */
const BODY = {
  publicEn: "Catalogue public EN test-owned body",
  publicDe: "Catalogue public DE test-owned body",
  unlisted: "Preview unlisted test-owned body",
  jsonWins: "JSON wins and is unlisted test-owned body",
  markdownShadow: "MARKDOWN MUST NOT WIN",
  showcase: "Showcase public landing test-owned body",
  quotePublic: "Nested public quote test-owned body",
  quoteHidden: "Nested unlisted quote test-owned body",
};


/**
 * One valid declarative Page document, optionally declaring how it publishes itself — the ONLY thing the
 * authored Pages below differ in. `visibility` is the Page DOCUMENT's own field, which is where EFS visibility
 * lives; it is never a manifest-level Page property.
 */
function jsonDocument(title, visibility = null) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      title,
      ...(visibility === null ? {} : { visibility }),
      sections: [{ type: "prose", body: `${title} test-owned body` }],
    },
    null,
    2,
  )}\n`;
}

/**
 * DECLARE AND WRITE EVERY PAGE OF THIS PROOF — synchronously, before the server spawns.
 *
 * Each `authorPage` call is both halves of publication: the Page/representation is DECLARED in the manifest and
 * its real content is placed in the capsule. `navLabel` is deliberately omitted everywhere: these are reachable
 * Pages, not navigation entries, and an unlisted Page must never be discoverable through the nav either.
 *
 * `private-landing` is the precedence case: the SAME Page, locale and route carries BOTH a Markdown source and a
 * JSON source, and the EFS content reader must serve the JSON one — including its `unlisted` decision. ONE Page
 * is declared (never two with identical routes); only the two source files differ.
 */
function declareVisibilityPages(authoring) {
  const page = (siteId, locale, route, format, body) =>
    authoring.authorPage({ siteId, locale, route, format, body });

  page("main", "en-001", ["catalogue"], "json", jsonDocument("Catalogue public EN"));
  page("main", "de-DE", ["catalogue"], "json", jsonDocument("Catalogue public DE"));
  page("main", "en-001", ["preview"], "json", jsonDocument("Preview unlisted", "unlisted"));

  page(
    "outlet",
    "en-001",
    ["private-landing"],
    "markdown",
    `---\ntitle: Markdown predecessor\n---\n\n${BODY.markdownShadow}\n`,
  );
  page("outlet", "en-001", ["private-landing"], "json", jsonDocument("JSON wins and is unlisted", "unlisted"));

  page("outlet", "en-001", ["showcase"], "json", jsonDocument("Showcase public landing"));
  page("outlet", "en-001", ["showcase", "quote-public"], "json", jsonDocument("Nested public quote"));
  page("outlet", "en-001", ["showcase", "quote-hidden"], "json", jsonDocument("Nested unlisted quote", "unlisted"));
}

/**
 * ONE request, with an EXPLICIT `Host` header — the only way to speak to a binding that claims a HOSTNAME.
 *
 * Redirects are NOT followed: the status a visitor's request really receives is the claim being measured. The
 * transport is loopback because that is where the dev server listens; the HOST is what selects the publication.
 */
function requestWithHost(port, host, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
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

/** A dev server that publishes THIS scenario's declarations; readiness is the public catalogue Page. */
async function startServer(harness) {
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { prepareEfs: declareVisibilityPages });
    try {
      const deadline = Date.now() + 120000;
      let status = 0;
      while (Date.now() < deadline) {
        try {
          status = (await requestWithHost(port, HOST, `${MAIN_HOME}/catalogue`)).status;
        } catch {
          status = 0;
        }
        if (status === 200) return { server, port };
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      throw new Error(
        `the unlisted-visibility Installation never answered ${MAIN_HOME}/catalogue on ${HOST}: ` +
          `status=${status}\n--- dev server output ---\n${server.log()}`,
      );
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no port answered for the unlisted-visibility scenario");
}

/**
 * THE BOUNDED HTTP PREFLIGHT — every claim independent, run BEFORE Chrome exists.
 *
 * A mismatch aborts here with the Host, the path, the status and the dev server's own log, instead of retrying a
 * semantic 404 for minutes. Each row proves a DIFFERENT declaration, so one wrong answer cannot be masked by a
 * neighbouring pass.
 */
async function preflight(harness, rows, port, server) {
  const expectations = [
    // ── served, with the content of its OWN declaring owner ──────────────────────────────────────────
    [`${MAIN_HOME}/catalogue`, 200, BODY.publicEn, "public Page (main, en-001)"],
    ["/main/de-de/catalogue", 200, BODY.publicDe, "the SAME public Page in its second declared locale"],
    [`${MAIN_HOME}/preview`, 200, BODY.unlisted, "unlisted Page"],
    [`${OUTLET_HOME}/private-landing`, 200, BODY.jsonWins, "JSON-vs-Markdown precedence (JSON wins)"],
    [`${OUTLET_HOME}/showcase`, 200, BODY.showcase, "explicitly published landing"],
    [`${OUTLET_HOME}/showcase/quote-public`, 200, BODY.quotePublic, "declared nested public Page"],
    [`${OUTLET_HOME}/showcase/quote-hidden`, 200, BODY.quoteHidden, "declared nested unlisted Page"],
    // ── refused: a foreign owner, an undeclared route, or the retired grammar ────────────────────────
    [`${MAIN_HOME}/private-landing`, 404, null, "a Page declared on `outlet` is NOT served on `main`"],
    [`${MAIN_HOME}/showcase/quote-public`, 404, null, "a nested `outlet` Page is NOT served on `main`"],
    [`${OUTLET_HOME}/catalogue`, 404, null, "a Page declared on `main` is NOT served on `outlet`"],
    [`${MAIN_HOME}/undeclared-sibling`, 404, null, "an undeclared route"],
    ["/ww/en/preview", 404, null, "the retired legacy Site/locale grammar"],
  ];

  for (const [pathname, expected, body, label] of expectations) {
    let response = null;
    let failure = null;
    try {
      response = await requestWithHost(port, HOST, pathname);
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const status = response?.status ?? 0;
    const hasBody = body === null || (response?.body.includes(body) ?? false);
    harness.check(
      rows,
      `preflight ${label}: ${pathname} → ${expected}`,
      status === expected && hasBody,
      `host=${HOST} path=${pathname} status=${status} expected=${expected} body=${
        body === null ? "(any)" : `contains ${JSON.stringify(body)}=${hasBody}`
      }${failure === null ? "" : ` error=${failure}`}`,
    );
    if (status !== expected || !hasBody) {
      throw new Error(
        `EFS claim refused before the browser ran: host=${HOST} path=${pathname} status=${status} ` +
          `expected=${expected}\n--- dev server output ---\n${server.log()}`,
      );
    }
  }

  // The shadowing Markdown source must not be what the JSON Page serves, even though both files exist.
  const shadowed = await requestWithHost(port, HOST, `${OUTLET_HOME}/private-landing`);
  harness.check(
    rows,
    "the Markdown predecessor does NOT win over the JSON source for the same declared route",
    !shadowed.body.includes(BODY.markdownShadow),
    shadowed.body.includes(BODY.markdownShadow) ? "the Markdown body was served" : "JSON source served",
  );
  if (shadowed.body.includes(BODY.markdownShadow)) {
    throw new Error(
      `EFS source precedence regressed: /outlet/en-001/private-landing served the Markdown predecessor.\n` +
        `--- dev server output ---\n${server.log()}`,
    );
  }

  // A Host no binding claims is REFUSED — the fail-closed boundary, not a default-Site fallback. The request is
  // sent to loopback with an explicit `Host`; no published binding is altered to produce this answer.
  const unclaimed = await requestWithHost(port, "unclaimed.localhost", `${MAIN_HOME}/catalogue`);
  harness.check(
    rows,
    "a Host that no binding claims is refused (404), never answered by a default Site",
    unclaimed.status === 404,
    `host=unclaimed.localhost status=${unclaimed.status}`,
  );

  // ── DISCOVERY: the sitemap and the crawl rules ─────────────────────────────────────────────────────
  const sitemap = await requestWithHost(port, HOST, "/sitemap.xml");
  const urls = sitemapUrls(sitemap.body);
  harness.check(rows, "the sitemap is served for the claimed Host", sitemap.status === 200, `status=${sitemap.status}`);

  for (const published of PUBLIC_ADDRESSES) {
    harness.check(
      rows,
      `the sitemap publishes the public Page ${published}`,
      urls.includes(published),
      urls.includes(published) ? `${urls.length} URL(s) published` : urls.join(", "),
    );
  }
  for (const unadvertised of UNLISTED_ADDRESSES) {
    harness.check(
      rows,
      `the sitemap publishes NOTHING at the unlisted ${unadvertised}`,
      !urls.includes(unadvertised),
      `${urls.length} URL(s) published; no match`,
    );
  }
  harness.check(
    rows,
    "no sitemap address uses the retired geographic grammar, an undeclared route or a foreign owner",
    urls.every((url) => !/\/(ww|ca)\//.test(url)) && urls.every((url) => url.startsWith(CANONICAL)),
    urls.join(", "),
  );
  harness.check(
    rows,
    "the shadowing Markdown predecessor did not become a SECOND Page in the sitemap",
    urls.filter((url) => url.includes("private-landing")).length === 0,
    `${urls.filter((url) => url.includes("private-landing")).length} private-landing address(es)`,
  );

  const robots = await requestWithHost(port, HOST, "/robots.txt");
  harness.check(
    rows,
    "robots.txt keeps its accepted crawl rules — no Disallow was invented to hide an unlisted Page",
    robots.body.includes("User-Agent: *") && robots.body.includes("Allow: /") && !/disallow/i.test(robots.body),
    robots.body.replace(/\s+/g, " ").trim().slice(0, 160),
  );
  harness.check(
    rows,
    "…and it points at this binding's canonical sitemap",
    robots.body.includes(`${CANONICAL}/sitemap.xml`),
    robots.body.replace(/\s+/g, " ").trim().slice(0, 160),
  );
}


/** Everything one rendered Page says about publication, as the browser itself sees it. */
const PAGE_PROBE = `(() => {
  const meta = document.querySelector('meta[name="robots"]');
  const heading = document.querySelector("h1");
  return {
    robots: meta === null ? null : meta.getAttribute("content"),
    h1: heading === null ? null : (heading.textContent || "").trim(),
    alternates: [...document.querySelectorAll('link[rel="alternate"]')].map((link) => ({
      hreflang: link.getAttribute("hreflang"),
      href: link.getAttribute("href"),
    })),
    hasHeaderBrand: !!document.querySelector(".ui-site-header-identity"),
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  };
})()`;

/** Navigate as a visitor would, then read the Page's own publication facts from the rendered document. */
async function readPage(cdp, url) {
  await cdp.navigate(url);
  return cdp.evaluate(PAGE_PROBE);
}

/**
 * WHAT A REAL BROWSER SEES — the difference between an unlisted and a public Page is its OWN metadata, and
 * nothing about presentation, ownership or language advertising beyond that.
 */
async function browserProof(harness, rows, chrome, port) {
  const base = `http://${HOST}:${port}`;
  const cdp = await Cdp.connect(chrome);
  try {
    await cdp.setViewport(harness.viewports.desktop.width, harness.viewports.desktop.height);

    const unlisted = await readPage(cdp, `${base}${MAIN_HOME}/preview`);
    harness.check(
      rows,
      "the unlisted Page RENDERS as an ordinary page: one heading with its own content, and the platform header",
      unlisted.h1 === "Preview unlisted" && unlisted.hasHeaderBrand === true,
      `h1=${JSON.stringify(unlisted.h1)} brand=${unlisted.hasHeaderBrand}`,
    );
    harness.check(
      rows,
      "…and its OWN response says noindex, nofollow",
      unlisted.robots === "noindex, nofollow",
      `content=${JSON.stringify(unlisted.robots)}`,
    );
    harness.check(
      rows,
      "…and it advertises NO language alternate, so no x-default can name it",
      unlisted.alternates.length === 0,
      JSON.stringify(unlisted.alternates),
    );

    const publicPage = await readPage(cdp, `${base}${MAIN_HOME}/catalogue`);
    harness.check(
      rows,
      "a public Page gains no robots tag at all",
      publicPage.robots === null,
      `content=${JSON.stringify(publicPage.robots)}`,
    );
    const advertised = publicPage.alternates.map((link) => (link.hreflang ?? "").toLowerCase()).sort();
    harness.check(
      rows,
      "…and keeps every alternate it publishes — this locale, the next one, and x-default",
      JSON.stringify(advertised) === JSON.stringify(["de-de", "en-001", "x-default"]),
      JSON.stringify(publicPage.alternates),
    );
    harness.check(
      rows,
      "…none of which names an unlisted URL",
      publicPage.alternates.every((link) => !UNLISTED_ADDRESSES.includes(link.href ?? "")),
      JSON.stringify(publicPage.alternates),
    );

    // THE JSON-WINNING PAGE carries the visibility of the source that actually won.
    const precedence = await readPage(cdp, `${base}${OUTLET_HOME}/private-landing`);
    harness.check(
      rows,
      "the JSON-winning Page is served as its own unlisted Page: its heading, and noindex, nofollow",
      precedence.h1 === "JSON wins and is unlisted" && precedence.robots === "noindex, nofollow",
      `h1=${JSON.stringify(precedence.h1)} robots=${JSON.stringify(precedence.robots)}`,
    );

    // THE NESTED UNLISTED PAGE reaches a visitor but stays out of every advertising surface.
    const nested = await readPage(cdp, `${base}${OUTLET_HOME}/showcase/quote-hidden`);
    harness.check(
      rows,
      "the nested unlisted Page renders with its own heading and noindex, nofollow",
      nested.h1 === "Nested unlisted quote" && nested.robots === "noindex, nofollow",
      `h1=${JSON.stringify(nested.h1)} robots=${JSON.stringify(nested.robots)}`,
    );
    const landing = await readPage(cdp, `${base}${OUTLET_HOME}/showcase`);
    harness.check(
      rows,
      "its PUBLIC parent landing advertises no alternate naming the nested unlisted Page",
      landing.alternates.every((link) => !UNLISTED_ADDRESSES.includes(link.href ?? "")),
      JSON.stringify(landing.alternates),
    );

    // EVERY CANONICAL VIEWPORT: publication is not a presentation difference, so an unlisted Page is laid out,
    // and reported, exactly like the public one beside it.
    for (const [name, viewport] of Object.entries(harness.viewports)) {
      await cdp.setViewport(viewport.width, viewport.height);
      const seen = await readPage(cdp, `${base}${MAIN_HOME}/preview`);
      harness.check(
        rows,
        `at ${name} (w${viewport.width}) it is still unlisted, still rendered, and never scrolls sideways`,
        seen.robots === "noindex, nofollow" &&
          seen.h1 === "Preview unlisted" &&
          seen.hasHeaderBrand === true &&
          seen.scrollWidth <= seen.clientWidth + 1,
        JSON.stringify(seen),
      );
    }
  } finally {
    await cdp.close();
  }
}

/** RUN IT: one declaration set, one server, and the same Pages measured over HTTP and in a real browser. */
export async function run(chrome, harness) {
  const rows = [];
  let server = null;

  try {
    const started = await startServer(harness);
    server = started.server;

    await preflight(harness, rows, started.port, started.server);
    await browserProof(harness, rows, chrome, started.port);
  } catch (error) {
    harness.check(
      rows,
      "the unlisted-visibility scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (server !== null) {
      try {
        await harness.stopServer(server);
      } catch {
        /* the server is already gone */
      }
    }
  }

  return rows;
}

export default { id, run };
