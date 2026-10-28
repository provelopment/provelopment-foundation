/**
 * TEMPLATE-PV-A1 — AN UNLISTED PAGE, PROVED THROUGH A REAL SERVER AND A REAL BROWSER
 * =================================================================================
 *
 * WHAT THIS SCENARIO EXISTS FOR. The unit suites prove the publication contract in the composition: which
 * inventory a sitemap publishes, which `hreflang` alternates a response offers, what a page's own metadata says.
 * This scenario proves the SAME capability where a unit test cannot reach — over HTTP and in a browser:
 *
 *   · the unlisted URL really IS SERVED, with `200` and its authored content, and its own response really
 *     carries `robots: noindex, nofollow` as a `<meta name="robots">` tag;
 *   · a public page's response really carries NO such tag, and keeps every alternate it has always had;
 *   · the served `sitemap.xml` really does NOT name an unlisted URL — while naming the public ones, the
 *     configured regional LANDING and the configured regional PAGE;
 *   · `robots.txt` is untouched: no `disallow` line was invented to "hide" the page, and the sitemap it points
 *     at is the already-narrowed inventory;
 *   · the unlisted page renders as an ORDINARY page at every canonical viewport: same header, no horizontal
 *     overflow, one h1 — because publication is not a presentation difference.
 *
 * ONE DISPOSABLE COPY OF THE COMMITTED FIXTURE, in the harness's own OS-temp write domain, removed when the run
 * ends: the shipped fixture and the selected deployment are only ever READ.
 *
 * THE PAGES THE COPY AUTHORS, and why each one is needed:
 *
 *   `ww/en/catalogue`      an ordinary public page → the alternates that must survive
 *   `ww/en/preview`        an UNLISTED page        → served, noindex, absent from discovery
 *   `ca/en/south`          an UNLISTED document that SHADOWS the fixture's own public `south.md` landing — the
 *                                                  same route, two modes, and the JSON one decides
 *   `ca/en/north/quote-*`  a configured regional page, public and unlisted
 *
 * OWNERSHIP. This is a FOUNDATION contract (a platform capability, not one deployment's copy), so it lives in the
 * harness's own directory and runs in the foundation scope.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "unlisted-visibility";

/** The committed fixture every generic scenario is derived from — READ, never written. */
const FIXTURE = ["tests", "fixtures", "synthetic-deployment"];

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [51, 52, 53];

/** The disposable copy's canonical origin — the fixture's own Site URL, replaced so every URL is unambiguous. */
const SPOKE_URL = "https://publication.localhost";

const PUBLIC_PAGE = "catalogue";
const UNLISTED_PAGE = "preview";
const PUBLIC_REGIONAL_PAGE = "quote-public";
const UNLISTED_REGIONAL_PAGE = "quote-hidden";
const UNLISTED_LANDING = "south";

/**
 * One valid declarative document, optionally declaring how it publishes itself — the ONLY thing the authored
 * pages below differ in.
 */
function jsonDocument(title, visibility) {
  return `${JSON.stringify(
    {
      schemaVersion: 1,
      title,
      ...(visibility === undefined ? {} : { visibility }),
      sections: [{ type: "prose", body: `${title} body.` }],
    },
    null,
    2,
  )}\n`;
}

/**
 * THE DISPOSABLE COPY: the committed fixture, its origin replaced, one regional page configured, and the pages
 * above authored. Every write goes through the harness's own guarded writers.
 */
async function materialize(harness) {
  const root = mkdtempSync(path.join(tmpdir(), "template-pv-a1-unlisted-"));
  harness.cpSync(path.join(harness.repositoryRoot, ...FIXTURE), root, { recursive: true });

  const configPath = path.join(root, "site.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  config.site = { ...config.site, url: SPOKE_URL, name: "Publication Spoke" };
  config.business.pages = [
    ...config.business.pages,
    { site: "ca", locale: "en", region: "north", slug: PUBLIC_REGIONAL_PAGE },
    { site: "ca", locale: "en", region: "north", slug: UNLISTED_REGIONAL_PAGE },
  ];
  await harness.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const pages = {
    [`content/pages/json/ww/en/${PUBLIC_PAGE}.json`]: ["Catalogue page", undefined],
    [`content/pages/json/ww/en/${UNLISTED_PAGE}.json`]: ["Preview page", "unlisted"],
    // The SAME route as the fixture's own `south.md`, so the winning JSON document is what decides.
    [`content/pages/json/ca/en/${UNLISTED_LANDING}.json`]: ["South landing (unlisted)", "unlisted"],
    [`content/pages/json/ca/en/north/${PUBLIC_REGIONAL_PAGE}.json`]: ["Public regional page", undefined],
    [`content/pages/json/ca/en/north/${UNLISTED_REGIONAL_PAGE}.json`]: [
      "Unlisted regional page",
      "unlisted",
    ],
  };
  for (const [relative, [title, visibility]] of Object.entries(pages)) {
    const target = path.join(root, relative);
    // A nested regional page's directory does not exist in the copy, and the guarded writer creates no parents.
    await harness.mkdir(path.dirname(target), { recursive: true });
    await harness.writeFile(target, jsonDocument(title, visibility), "utf8");
  }

  return root;
}

/** A dev server for the copy, on a port that answers. */
async function startServer(harness, root) {
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { deploymentRoot: root });
    try {
      // The readiness URL is the copy's own public page — a server that answers IT is fully up.
      await harness.waitForServer(`http://127.0.0.1:${port}/ww/en/${PUBLIC_PAGE}`, 240000);
      return { server, port };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no port answered for the unlisted-visibility scenario");
}

/** One HTTP response, redirects NOT followed — the status a visitor's request really receives. */
async function request(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  return { status: response.status, body: await response.text() };
}

/** The `<loc>` entries of a served sitemap. */
function sitemapUrls(body) {
  return [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
}

/**
 * THE BROWSER'S OWN BASE URL — `localhost`, never `127.0.0.1`: Next.js's dev server blocks JS/HMR chunks requested
 * from `127.0.0.1` as a cross-origin dev request, so an app loaded that way never activates. Raw HTTP probes are
 * unaffected, which is why only the browser's URLs use this base.
 */
function browserBase(port) {
  return `http://localhost:${port}`;
}

/**
 * WHAT HTTP ANSWERS. The unlisted URL is SERVED with its own content — and the discovery surfaces a crawler reads
 * are the only thing that changed.
 */
async function httpProof(harness, rows, port) {
  const base = `http://127.0.0.1:${port}`;

  const unlisted = await request(`${base}/ww/en/${UNLISTED_PAGE}`);
  harness.check(
    rows,
    "the unlisted URL is SERVED, with its own content and no redirect",
    unlisted.status === 200 && unlisted.body.includes("Preview page"),
    `status=${unlisted.status}`,
  );

  const publicPage = await request(`${base}/ww/en/${PUBLIC_PAGE}`);
  harness.check(
    rows,
    "…and the public page it sits beside is served exactly as before",
    publicPage.status === 200 && publicPage.body.includes("Catalogue page"),
    `status=${publicPage.status}`,
  );

  const landing = await request(`${base}/ca/en/${UNLISTED_LANDING}`);
  harness.check(
    rows,
    "an unlisted regional LANDING is served too — its URL still works",
    landing.status === 200 && landing.body.includes("South landing (unlisted)"),
    `status=${landing.status}`,
  );

  const sitemap = await request(`${base}/sitemap.xml`);
  const urls = sitemapUrls(sitemap.body);
  for (const published of [
    `${SPOKE_URL}/ww/en`,
    `${SPOKE_URL}/ww/en/about`,
    `${SPOKE_URL}/ww/en/${PUBLIC_PAGE}`,
    `${SPOKE_URL}/ca/en/north`,
    `${SPOKE_URL}/ca/en/north/${PUBLIC_REGIONAL_PAGE}`,
  ]) {
    harness.check(
      rows,
      `the sitemap publishes ${published}`,
      urls.includes(published),
      urls.includes(published) ? `${urls.length} URL(s) published` : urls.join(", "),
    );
  }
  for (const unadvertised of [
    `${SPOKE_URL}/ww/en/${UNLISTED_PAGE}`,
    `${SPOKE_URL}/ca/en/${UNLISTED_LANDING}`,
    `${SPOKE_URL}/ca/en/north/${UNLISTED_REGIONAL_PAGE}`,
  ]) {
    harness.check(
      rows,
      `the sitemap publishes NOTHING at ${unadvertised}`,
      !urls.includes(unadvertised),
      `${urls.length} URL(s) published; no match for ${unadvertised}`,
    );
  }

  const robots = await request(`${base}/robots.txt`);
  const robotsText = robots.body.replace(/\s+/g, " ").trim();
  harness.check(
    rows,
    "robots.txt keeps its accepted crawl rules — no disallow line was invented to hide a page",
    robots.body.includes("User-Agent: *") && robots.body.includes("Allow: /") && !/disallow/i.test(robots.body),
    robotsText.slice(0, 160),
  );
  harness.check(
    rows,
    "…and it still points at this Spoke's own sitemap",
    robots.body.includes(`${SPOKE_URL}/sitemap.xml`),
    robotsText.slice(0, 160),
  );
}

/** Everything one rendered page says about publication, as the browser sees it. */
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

/** Navigate and read the page's own publication facts. */
async function readPage(cdp, url) {
  await cdp.navigate(url);
  return cdp.evaluate(PAGE_PROBE);
}

/**
 * WHAT A REAL BROWSER SEES. The unlisted page is an ORDINARY page whose own response is the only difference — and
 * that difference is verified on the RENDERED metadata, not on a source string.
 */
async function browserProof(harness, rows, chrome, port) {
  const base = browserBase(port);
  const cdp = await Cdp.connect(chrome);
  try {
    await cdp.setViewport(harness.viewports.desktop.width, harness.viewports.desktop.height);

    const unlisted = await readPage(cdp, `${base}/ww/en/${UNLISTED_PAGE}`);
    harness.check(
      rows,
      "the unlisted page RENDERS as an ordinary page: its own heading, and the platform's header",
      unlisted.h1 === "Preview page" && unlisted.hasHeaderBrand === true,
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
      "…and it advertises NO language alternate, so no x-default names it either",
      unlisted.alternates.length === 0,
      JSON.stringify(unlisted.alternates),
    );

    const publicPage = await readPage(cdp, `${base}/ww/en/${PUBLIC_PAGE}`);
    harness.check(
      rows,
      "a public page gains no robots tag at all",
      publicPage.robots === null,
      `content=${JSON.stringify(publicPage.robots)}`,
    );
    harness.check(
      rows,
      "…and keeps every alternate it had — this locale, the next one, and x-default",
      JSON.stringify(publicPage.alternates.map((link) => link.hreflang).sort()) ===
        JSON.stringify(["de", "en", "x-default"]),
      JSON.stringify(publicPage.alternates),
    );
    harness.check(
      rows,
      "…none of which names an unlisted URL",
      publicPage.alternates.every((link) => !(link.href ?? "").includes(UNLISTED_PAGE)),
      JSON.stringify(publicPage.alternates),
    );

    // EVERY CANONICAL VIEWPORT: publication is not a presentation difference, so an unlisted page is laid out,
    // and reported, exactly like the public one beside it.
    for (const [name, viewport] of Object.entries(harness.viewports)) {
      await cdp.setViewport(viewport.width, viewport.height);
      const seen = await readPage(cdp, `${base}/ww/en/${UNLISTED_PAGE}`);
      harness.check(
        rows,
        `at ${name} (w${viewport.width}) it is still unlisted, still rendered, and never scrolls sideways`,
        seen.robots === "noindex, nofollow" &&
          seen.h1 === "Preview page" &&
          seen.hasHeaderBrand === true &&
          seen.scrollWidth <= seen.clientWidth + 1,
        JSON.stringify(seen),
      );
    }
  } finally {
    await cdp.close();
  }
}

/** RUN IT: one disposable copy, one server, and the same page measured over HTTP and in a browser. */
export async function run(chrome, harness) {
  const rows = [];
  let copy = null;
  let server = null;

  try {
    copy = await materialize(harness);
    const started = await startServer(harness, copy);
    server = started.server;

    await httpProof(harness, rows, started.port);
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
    if (copy !== null) harness.rmSync(copy, { recursive: true, force: true });
  }

  return rows;
}

export default { id, run };
