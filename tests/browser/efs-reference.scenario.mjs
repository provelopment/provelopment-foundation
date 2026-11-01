/**
 * REFERENCE EFS PUBLICATION SCENARIO (S3-E3-R02, reconciled in GEO-03 R04-C19)
 * ===========================================================================
 *
 * Exercises the ACTUAL published Foundation and Germany EFS spokes over raw HTTP with an explicit `Host`
 * header, because a local browser cannot resolve the production hostnames; browser rendering of the same EFS
 * renderer is covered by `efs.scenario.mjs`.
 *
 * R04-C19 — WHAT CHANGED AND WHY. Every expectation in this file used to describe the retired geographic URL
 * grammar (`/ww/en`, `/de/de`, bare `en`/`de` language tags, `<Site>/owner-assets`). The publication moved to
 * qualified locale path keys (`en-001`, `de-de`) rendered as declared language identities (`en-001`, `de-DE`),
 * and owner assets to a Host-bound `owner-assets` root. This file now states THAT model — measured against the
 * running publication, not inferred — and keeps every behaviour the old file was protecting.
 *
 * THE TWO HOSTS ARE THE OWNERS. `/en-001` and `/de-de` are valid on BOTH Hosts and mean different owners, so
 * ownership is proved by canonical origin and by what each Host refuses, never by "this pathname is unusual".
 * A city-named Page is still just an ordinary EFS Page: publishing Berlin must not manufacture geographic
 * runtime state.
 */
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

export const id = "efs-reference";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = dirname(dirname(HERE));

const PORT_OFFSETS = [71, 72, 73];

const FOUNDATION_HOST = "foundation-template.provelopment.com";
const GERMANY_HOST = "foundation-template-germany.provelopment.com";
const FOUNDATION_ORIGIN = `https://${FOUNDATION_HOST}`;
const GERMANY_ORIGIN = `https://${GERMANY_HOST}`;

/** A DECLARED Page (`/en-001`, the English representation of the foundation Home Page), never a retired route. */
const READINESS_PATH = "/en-001";
const READINESS_ATTEMPTS = 90;
const READINESS_INTERVAL_MS = 1500;

const CAPSULE_ROOT = "deployment/efs/capsule";
const FOUNDATION_CAPSULE = `${CAPSULE_ROOT}/e_00000000000000000000000001/foundation`;
const GERMANY_CAPSULE = `${CAPSULE_ROOT}/e_00000000000000000000000002/germany`;

const EN = "en-001";
const DE = "de-DE";

/** The declared representations, per owning Host. `alternate` is the OTHER locale of the SAME Page. */
const FOUNDATION_PAGES = [
  { path: "/en-001", lang: EN, alternate: "/de-de" },
  { path: "/de-de", lang: DE, alternate: "/en-001" },
  { path: "/en-001/about", lang: EN, alternate: "/de-de/about" },
  { path: "/de-de/about", lang: DE, alternate: "/en-001/about" },
  { path: "/en-001/contact", lang: EN, alternate: "/de-de/contact" },
  { path: "/de-de/contact", lang: DE, alternate: "/en-001/contact" },
];

const GERMANY_PAGES = [
  { path: "/en-001", lang: EN, alternate: "/de-de" },
  { path: "/de-de", lang: DE, alternate: "/en-001" },
  { path: "/en-001/about", lang: EN, alternate: "/de-de/about" },
  { path: "/de-de/about", lang: DE, alternate: "/en-001/about" },
  { path: "/en-001/berlin", lang: EN, alternate: "/de-de/berlin" },
  { path: "/de-de/berlin", lang: DE, alternate: "/en-001/berlin" },
  { path: "/en-001/frankfurt", lang: EN, alternate: "/de-de/frankfurt" },
  { path: "/de-de/frankfurt", lang: DE, alternate: "/en-001/frankfurt" },
];

function request(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", headers: { host } },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, body: buffer.toString("utf8"), buffer });
        });
      },
    );
    req.setTimeout(30000, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** Everything asserted below is read from the response itself; nothing is inferred from the source tree. */
function analyze(body) {
  const first = (pattern) => pattern.exec(body)?.[1] ?? "";
  const alternates = {};
  for (const match of body.matchAll(/hrefLang="([^"]+)" href="([^"]+)"/g)) alternates[match[1]] = match[2];
  return {
    lang: first(/<html lang="([^"]*)"/),
    canonical: first(/rel="canonical" href="([^"]*)"/),
    ogUrl: first(/property="og:url" content="([^"]*)"/),
    ogLocale: first(/property="og:locale" content="([^"]*)"/),
    title: first(/<title>([^<]*)<\/title>/),
    alternates,
    headings: [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    ),
    shell: body.includes("data-ui-shell-layout"),
  };
}

/**
 * ONE declared representation, judged as a whole: the right language identity, its OWN canonical, the other
 * locale of the SAME Page as a qualified alternate, matching Open Graph data, one real heading and the shell.
 * No authored prose is asserted — a rewritten sentence must not fail a structural proof.
 */
function judge(response, origin, page) {
  const view = analyze(response.body);
  const otherLang = page.lang === EN ? DE : EN;
  const ok =
    response.status === 200 &&
    view.lang === page.lang &&
    view.canonical === `${origin}${page.path}` &&
    view.ogUrl === view.canonical &&
    view.ogLocale === page.lang &&
    view.alternates[page.lang] === view.canonical &&
    view.alternates[otherLang] === `${origin}${page.alternate}` &&
    view.headings.length === 1 &&
    view.headings[0].length > 0 &&
    view.shell;
  return {
    ok,
    detail: `status=${response.status} lang=${view.lang} canonical=${view.canonical} og=${view.ogUrl}/${view.ogLocale} h1=${view.headings.length}`,
  };
}

/**
 * Starts one dev server on the first port that serves the DECLARED reference Page, and records EVERY server it
 * starts in `servers` (before the first `await`) so cleanup never depends on readiness having succeeded.
 *
 * Readiness is Host-bound and content-bound: a plain loopback request answers 404 by design, and a 200 from the
 * wrong page would be no proof, so the probe carries the public Host and requires the declared language
 * identity. A retired route is never polled — it can only ever produce 240 seconds of nothing.
 */
async function start(harness, servers) {
  let last = "no candidate port attempted";
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { synthetic: false });
    servers.push(server);
    for (let attempt = 0; attempt < READINESS_ATTEMPTS; attempt += 1) {
      try {
        const probe = await request(port, READINESS_PATH, FOUNDATION_HOST);
        if (probe.status === 200 && analyze(probe.body).lang === EN) return { port };
        last = `status=${probe.status} for ${READINESS_PATH} on ${FOUNDATION_HOST} (port ${port})`;
      } catch (error) {
        last = `${error instanceof Error ? error.message : String(error)} (port ${port})`;
      }
      await sleep(READINESS_INTERVAL_MS);
    }
    await harness.stopServer(server);
  }
  throw new Error(`the declared reference Page ${READINESS_PATH} never became ready: ${last}`);
}

export async function run(_chrome, harness) {
  const rows = [];
  const servers = [];
  try {
    const { port } = await start(harness, servers);

    // ---- the declared representations, per owning Host ------------------------
    for (const [origin, host, pages, label] of [
      [FOUNDATION_ORIGIN, FOUNDATION_HOST, FOUNDATION_PAGES, "foundation"],
      [GERMANY_ORIGIN, GERMANY_HOST, GERMANY_PAGES, "germany"],
    ]) {
      for (const page of pages) {
        const response = await request(port, page.path, host);
        const verdict = judge(response, origin, page);
        harness.check(
          rows,
          `${label} ${page.path} is served as its own ${page.lang} representation`,
          verdict.ok,
          verdict.detail,
        );
      }
    }

    // ---- language identity is DECLARED, not inferred from a country ----------
    const foundationEnglish = await request(port, "/en-001", FOUNDATION_HOST);
    const foundationGerman = await request(port, "/de-de", FOUNDATION_HOST);
    const viewEn = analyze(foundationEnglish.body);
    const viewDe = analyze(foundationGerman.body);
    harness.check(
      rows,
      "an en-001 representation announces the declared `en-001` identity, not a bare `en`",
      viewEn.lang === EN && viewEn.ogLocale === EN && !foundationEnglish.body.includes('lang="en"'),
      `lang=${viewEn.lang} og:locale=${viewEn.ogLocale}`,
    );
    harness.check(
      rows,
      "a de-DE representation announces `de-DE` as a canonical language identity",
      viewDe.lang === DE && viewDe.ogLocale === DE,
      `lang=${viewDe.lang} og:locale=${viewDe.ogLocale}`,
    );
    harness.check(
      rows,
      "each Host advertises its own truthful default locale, and no third one",
      viewEn.alternates["x-default"] === `${FOUNDATION_ORIGIN}/en-001` &&
        viewDe.alternates["x-default"] === `${FOUNDATION_ORIGIN}/en-001` &&
        Object.keys(viewEn.alternates).sort().join(",") === [DE, EN, "x-default"].sort().join(","),
      `x-default=${viewEn.alternates["x-default"]} alternates=${Object.keys(viewEn.alternates).join(",")}`,
    );
    const germanyEnglish = await request(port, "/en-001", GERMANY_HOST);
    harness.check(
      rows,
      "the Germany Host's default locale is its own German representation, not the foundation's",
      analyze(germanyEnglish.body).alternates["x-default"] === `${GERMANY_ORIGIN}/de-de`,
      `x-default=${analyze(germanyEnglish.body).alternates["x-default"]}`,
    );

    // ---- a qualified German representation stays German ----------------------
    harness.check(
      rows,
      "a qualified `de` representation stays German under a Germany-named Host",
      viewDe.lang === DE && viewDe.alternates[DE] === `${FOUNDATION_ORIGIN}/de-de`,
      `lang=${viewDe.lang} canonical=${viewDe.canonical}`,
    );

    // ---- a city-named Page is still an ordinary Page ------------------------
    // Publishing Berlin must not manufacture geography. The authority is the response: one real heading, the
    // declared canonical, and NONE of the regional runtime artifacts a place record would bring.
    const berlin = await request(port, "/en-001/berlin", GERMANY_HOST);
    const berlinView = analyze(berlin.body);
    harness.check(
      rows,
      "a city-named Page creates no place record, region route, address or timezone",
      berlin.status === 200 &&
        berlinView.canonical === `${GERMANY_ORIGIN}/en-001/berlin` &&
        berlinView.headings.length === 1 &&
        (berlinView.headings[0] ?? "").length > 0 &&
        !berlin.body.includes("Europe/Berlin") &&
        !berlin.body.includes("Example Street") &&
        !berlin.body.includes('aria-label="Location"') &&
        !berlin.body.includes("data-region"),
      `status=${berlin.status} heading="${berlinView.headings[0] ?? ""}"`,
    );
    const germanyHome = await request(port, "/de-de", GERMANY_HOST);
    harness.check(
      rows,
      "legacy regional configuration cannot leak into the EFS shell",
      !germanyHome.body.includes("Example Street") &&
        !germanyHome.body.includes("Europe/Berlin") &&
        !germanyHome.body.includes('aria-label="Location"') &&
        !germanyHome.body.includes("data-region"),
      "no authored region address/timezone/selector",
    );

    // ---- public canonical, and no private properties ------------------------
    const about = await request(port, "/en-001/about", FOUNDATION_HOST);
    const aboutView = analyze(about.body);
    harness.check(
      rows,
      "canonical and hreflang carry the declared qualified URLs",
      aboutView.canonical === `${FOUNDATION_ORIGIN}/en-001/about` &&
        aboutView.alternates[DE] === `${FOUNDATION_ORIGIN}/de-de/about`,
      `canonical=${aboutView.canonical} de=${aboutView.alternates[DE] ?? "-"}`,
    );
    harness.check(
      rows,
      "private properties and EntityIDs never reach public HTML",
      !about.body.includes("OWNER-ONLY") &&
        !about.body.includes("conversion:foundation") &&
        !about.body.includes("e_00000000000000000000000001") &&
        !germanyHome.body.includes("e_00000000000000000000000002") &&
        !about.body.includes(CAPSULE_ROOT),
      "no private/identity/capsule-path leakage",
    );

    // ---- assets: ownership follows the HOST, not a path prefix --------------
    // The retired grammar addressed an owner through a Site prefix (`/ww/owner-assets/…`). The publication
    // serves a Host-bound `owner-assets` root instead, so the proof compares the bytes with the OWNING capsule.
    const foundationFavicon = readFileSync(join(REPOSITORY_ROOT, FOUNDATION_CAPSULE, "assets/brand/favicon.svg"));
    const germanyFavicon = readFileSync(join(REPOSITORY_ROOT, GERMANY_CAPSULE, "assets/brand/favicon.svg"));
    const foundationIcon = await request(port, "/owner-assets/brand/favicon.svg", FOUNDATION_HOST);
    harness.check(
      rows,
      "the Foundation Host serves its own declared brand asset with image MIME",
      foundationIcon.status === 200 &&
        String(foundationIcon.headers["content-type"]).startsWith("image/svg+xml") &&
        foundationIcon.buffer.equals(foundationFavicon) &&
        foundationIcon.body.includes("<svg"),
      `status=${foundationIcon.status} type=${foundationIcon.headers["content-type"]} bytes=${foundationIcon.buffer.length}`,
    );
    const germanyIcon = await request(port, "/owner-assets/brand/favicon.svg", GERMANY_HOST);
    harness.check(
      rows,
      "the Germany Host serves the same pathname from ITS OWN capsule",
      germanyIcon.status === 200 && germanyIcon.buffer.equals(germanyFavicon),
      `status=${germanyIcon.status} bytes=${germanyIcon.buffer.length}`,
    );
    const unclaimedIcon = await request(port, "/owner-assets/brand/favicon.svg", "unclaimed.example");
    harness.check(
      rows,
      "an unclaimed Host cannot obtain an owner's asset",
      unclaimedIcon.status === 404,
      `status=${unclaimedIcon.status}`,
    );
    for (const retired of ["/ww/owner-assets/brand/favicon.svg", "/de/owner-assets/brand/favicon.svg"]) {
      const response = await request(port, retired, FOUNDATION_HOST);
      harness.check(
        rows,
        `the retired asset prefix ${retired} resolves to nothing`,
        response.status === 404 && !response.body.includes(CAPSULE_ROOT),
        `status=${response.status}`,
      );
    }
    const absentAsset = await request(port, "/owner-assets/brand/absent.svg", FOUNDATION_HOST);
    harness.check(
      rows,
      "an undeclared asset is refused and exposes no capsule path",
      absentAsset.status === 404 && !absentAsset.body.includes(CAPSULE_ROOT),
      `status=${absentAsset.status}`,
    );

    // ---- publication boundaries: who owns what ------------------------------
    for (const [path, host, description] of [
      ["/en-001/berlin", FOUNDATION_HOST, "the Foundation Host does not own the Germany-only Berlin Page"],
      ["/de-de/frankfurt", FOUNDATION_HOST, "the Foundation Host does not own the Germany-only Frankfurt Page"],
      ["/en-001/contact", GERMANY_HOST, "the Germany Host does not own the foundation-only Contact Page"],
      ["/de-de/contact", GERMANY_HOST, "the Germany Host does not own the foundation-only Contact representation"],
      ["/en-001", "unclaimed.example", "an unclaimed host is refused"],
      ["/ww/en", FOUNDATION_HOST, "a retired geographic route is refused on the Foundation Host"],
      ["/de/de", GERMANY_HOST, "a retired geographic route is refused on the Germany Host"],
      ["/en-001/absent", FOUNDATION_HOST, "an undeclared Page is refused"],
    ]) {
      const response = await request(port, path, host);
      harness.check(rows, description, response.status === 404, `status=${response.status}`);
    }

    // ---- sitemaps publish declared representations only ---------------------
    const locsOf = (body) => [...body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
    const foundationSitemap = await request(port, "/sitemap.xml", FOUNDATION_HOST);
    const foundationLocs = locsOf(foundationSitemap.body);
    harness.check(
      rows,
      "the Foundation sitemap publishes exactly its six declared representations",
      foundationSitemap.status === 200 &&
        foundationLocs.length === 6 &&
        FOUNDATION_PAGES.every((page) => foundationLocs.includes(`${FOUNDATION_ORIGIN}${page.path}`)) &&
        foundationLocs.every((url) => url.startsWith(`${FOUNDATION_ORIGIN}/`)) &&
        foundationLocs.every((url) => !url.includes("/ww/") && !url.includes("/de/")),
      `status=${foundationSitemap.status} urls=${foundationLocs.length}`,
    );
    const germanySitemap = await request(port, "/sitemap.xml", GERMANY_HOST);
    const germanyLocs = locsOf(germanySitemap.body);
    harness.check(
      rows,
      "the Germany sitemap publishes exactly its eight declared representations",
      germanySitemap.status === 200 &&
        germanyLocs.length === 8 &&
        GERMANY_PAGES.every((page) => germanyLocs.includes(`${GERMANY_ORIGIN}${page.path}`)) &&
        germanyLocs.every((url) => url.startsWith(`${GERMANY_ORIGIN}/`)) &&
        germanyLocs.every((url) => !url.includes("/ww/") && !url.includes("/de/")),
      `status=${germanySitemap.status} urls=${germanyLocs.length}`,
    );
  } catch (error) {
    // A scenario that could not run says so BY NAME, with the reason, instead of reporting zero checks as zero
    // failures. Rows collected before the failure are kept and reported too.
    harness.check(
      rows,
      "the reference publication scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    for (const server of servers) await harness.stopServer(server);
  }
  return rows;
}

export default { id, run };
