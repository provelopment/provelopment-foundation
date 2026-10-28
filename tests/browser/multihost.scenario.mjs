// tests/browser/multihost.scenario.mjs
// THE MULTI-HOST SPOKE RUNTIME PROOF (FOUNDATION-MULTISITE-M16/M17).
//
// ONE disposable Installation declaring TWO Spokes (`tests/support/multihost-installation.mjs`) is served by
// its OWN dev server, and every request below travels the REAL public path:
//
//   HTTP request -> src/proxy.ts -> exact hostname claim -> private upstream selection header
  //   (x-foundation-spoke-segment) -> the public catch-all route -> ONE explicit SpokeRuntimeContext ->
  //   the existing M13/M14 renderer
//
// Nothing is bypassed: no request calls the composition directly, no request sets the PRIVATE SELECTION header itself, and the
// public pathname is never the internal one. The two Spokes deliberately expose the SAME logical coordinates
// (`/ww/en/about`) with DIFFERENT facts, so "same URL, different content" is proved rather than assumed.
//
// OWNERSHIP. This is a FOUNDATION contract (a platform capability, not one deployment's copy), so it lives in
// the harness's own directory and runs in the foundation scope. It writes only where the harness owns writes:
// OS temp (its Installation) and the GENERATED Spoke namespaces it materialises — from the CANONICAL asset
// plan, never by inventing files — and then removes.
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

import {
  assertSpokeNamespaceAgreesWithCatalog,
  materializeMultihostInstallation,
  spokeNamespacePlan,
  MULTIHOST_INSPECTION,
  MULTIHOST_SPOKES,
} from "../support/multihost-installation.mjs";
// The FOUNDATION's CDP client, reused (never re-implemented): the harness passes the browser BINARY, exactly
// as it does to a deployment-owned scenario, and each scenario owns the client it opens and closes.
import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "multihost";

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [21, 22, 23];

/**
 * ONE request with an EXPLICIT `Host` header — the boundary's whole input.
 *
 * A browser sends exactly this header; sending it deliberately is what makes "which Spoke answers?" a
 * measurable fact rather than an artifact of the URL. The `Host` value carries the port, exactly as a browser
 * would spell it, so the accepted normalization (lowercase, port stripped) is exercised too.
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
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/** The deliberately distinct facts of one rendered page, as the proof compares them. */
function fingerprint(body) {
  const facts = {
    siteName: /Alpha Spoke Site|Beta Spoke Site/.exec(body)?.[0] ?? "",
    wording: /Alpha About|Beta About/.exec(body)?.[0] ?? "",
    content: /Alpha wrote this paragraph|Beta wrote a different paragraph/.exec(body)?.[0] ?? "",
    origin: /https:\/\/(alpha|beta)\.localhost/.exec(body)?.[0] ?? "",
    asset: /\/spokes\/(alpha|beta)\/assets\//.exec(body)?.[0] ?? "",
  };
  return JSON.stringify(facts);
}

/**
 * The GENERATED namespace files ONE Spoke needs, written through the harness's own guarded writers.
 *
 * The FILES are the canonical plan's own rows for this Spoke's namespace (`spokeNamespacePlan`), so the
 * scenario installs exactly what `assets:sync` would install and what the build-time catalog publishes —
 * platform-owned artwork is never copied into a Spoke namespace, and nothing is invented here
 * (FOUNDATION-MULTISITE-M16/M17).
 *
 * BEFORE writing, the PUBLISHED catalog (the generated file the running application imports) is judged against
 * this Installation's canonical plan: a stale inventory, or a shared platform namespace claiming a Spoke-owned
 * replaceable role, stops the run with a diagnostic naming the Installation and the canonical preparation
 * (`pnpm assets:sync` for it) instead of leaving the failure to a page that cannot compose.
 */
async function materializeNamespace(harness, installation, spoke) {
  assertSpokeNamespaceAgreesWithCatalog(installation.root, spoke.id);
  const directory = path.join(harness.repositoryRoot, "public", "spokes", spoke.segment, "assets");
  await harness.mkdir(directory, { recursive: true });
  for (const { from, to } of spokeNamespacePlan(installation.root, spoke.id)) {
    harness.cpSync(from, path.join(directory, to), { recursive: false });
  }
}

/**
 * EVERY URL-BEARING VALUE IN ONE DOCUMENT: `href`, `src` and URL-valued `content` attributes.
 *
 * This is the OBSERVABLE surface requirement 11 names — navigation, canonical, `hreflang`, OpenGraph, client
 * URLs and asset URLs. Next's OWN React-Server-Components payload also carries the framework's internal
 * segment tree (`pagePath: "~spoke/[segment]/…"`), which is a router implementation detail rather than a URL
 * a visitor can be sent to; the assertions below therefore read every URL, and the browser proof reads the
 * address bar and the visible text.
 */
function urlsInDocument(html) {
  const urls = [];
  for (const match of html.matchAll(/(?:href|src|content)="([^"]*)"/g)) urls.push(match[1]);
  return urls;
}

/** True when ANY URL in the document contains this text (the internal prefix must never be one). */
function anyUrlContains(html, text) {
  return urlsInDocument(html).some((url) => url.includes(text));
}

function factsFor(spoke, fixture) {
  return {
    segment: spoke.segment,
    name: fixture.siteName,
    wording: fixture.navigationLabels["/about"],
    content: fixture.aboutBody,
    origin: spoke.canonicalOrigin,
    mark: spoke.mark,
  };
}

/**
 * THE SAME PUBLIC PATHNAME, TWO SPOKES: A/B/A/B, then the refusals and the per-host surfaces.
 *
 * Every request carries the hostname the claim is made for, and every assertion reads the RENDERED document
 * (or the served file), never an internal API.
 */
async function runHostProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const alphaFacts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const betaFacts = factsFor(beta, MULTIHOST_SPOKES[1]);
  const hostOf = (spoke) => `${spoke.hostname}:${port}`;
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const first = await get(hostOf(alpha), "/ww/en/about");
  const second = await get(hostOf(beta), "/ww/en/about");
  const third = await get(hostOf(alpha), "/ww/en/about");
  const fourth = await get(hostOf(beta), "/ww/en/about");

  harness.check(rows, "alpha /ww/en/about is served (200)", first.status === 200, `status=${first.status}`);
  harness.check(rows, "beta /ww/en/about is served (200)", second.status === 200, `status=${second.status}`);

  const alphaChecks = [
    ["names the Alpha site", first.body.includes(alphaFacts.name)],
    ["carries Alpha dictionary wording", first.body.includes(alphaFacts.wording)],
    ["carries Alpha page content", first.body.includes(alphaFacts.content)],
    ["canonicalizes to the Alpha origin", first.body.includes(alphaFacts.origin)],
    ["never names the Beta origin", !first.body.includes(betaFacts.origin)],
    ["names its OWN Spoke asset namespace", first.body.includes(`/spokes/${alpha.segment}/assets/`)],
    ["never names the Beta Spoke asset namespace", !first.body.includes(`/spokes/${beta.segment}/assets/`)],
    ["leaks no internal prefix into ANY URL", !anyUrlContains(first.body, "~spoke")],
  ];
  for (const [name, ok] of alphaChecks) harness.check(rows, `alpha: ${name}`, ok, "");

  const betaChecks = [
    ["names the Beta site", second.body.includes(betaFacts.name)],
    ["carries Beta dictionary wording", second.body.includes(betaFacts.wording)],
    ["carries Beta page content", second.body.includes(betaFacts.content)],
    ["canonicalizes to the Beta origin", second.body.includes(betaFacts.origin)],
    ["never names the Alpha origin", !second.body.includes(alphaFacts.origin)],
    ["names its OWN Spoke asset namespace", second.body.includes(`/spokes/${beta.segment}/assets/`)],
    ["never names the Alpha Spoke asset namespace", !second.body.includes(`/spokes/${alpha.segment}/assets/`)],
    ["leaks no internal prefix into ANY URL", !anyUrlContains(second.body, "~spoke")],
  ];
  for (const [name, ok] of betaChecks) harness.check(rows, `beta: ${name}`, ok, "");

  harness.check(
    rows,
    "A/B/A/B: Alpha is stable on the second request",
    fingerprint(first.body) === fingerprint(third.body),
    `first=${fingerprint(first.body)} third=${fingerprint(third.body)}`,
  );
  harness.check(
    rows,
    "A/B/A/B: Beta is stable on the second request",
    fingerprint(second.body) === fingerprint(fourth.body),
    `first=${fingerprint(second.body)} fourth=${fingerprint(fourth.body)}`,
  );
  harness.check(
    rows,
    "A/B/A/B: the two Spokes are NOT the same page",
    fingerprint(first.body) !== fingerprint(second.body),
    "the same public pathname must resolve to different contexts",
  );

  // ── the internal namespace is rewrite-only ───────────────────────────────────────────────────────────
  const direct = await get(hostOf(alpha), `/~spoke/${alpha.segment}/ww/en/about`);
  const directBeta = await get(hostOf(beta), `/~spoke/${beta.segment}/ww/en/about`);
  const crossInternal = await get(hostOf(alpha), `/~spoke/${beta.segment}/ww/en/about`);
  harness.check(rows, "a DIRECT /~spoke request on its own host is refused", direct.status === 404, `status=${direct.status}`);
  harness.check(rows, "a DIRECT /~spoke request on Beta is refused", directBeta.status === 404, `status=${directBeta.status}`);
  harness.check(rows, "a DIRECT cross-Spoke /~spoke request is refused", crossInternal.status === 404, `status=${crossInternal.status}`);
  harness.check(
    rows,
    "the refusal is not a redirect to any Spoke",
    (direct.headers.location ?? "") === "",
    `location=${direct.headers.location ?? "(none)"}`,
  );

  // ── a Spoke's own artwork is HOST-BOUND, while platform artwork is shared ────────────────────────────
  const ownOnAlpha = await get(hostOf(alpha), `/spokes/${alpha.segment}/assets/${alpha.mark}`);
  const otherOnAlpha = await get(hostOf(alpha), `/spokes/${beta.segment}/assets/${beta.mark}`);
  const ownOnBeta = await get(hostOf(beta), `/spokes/${beta.segment}/assets/${beta.mark}`);
  const otherOnBeta = await get(hostOf(beta), `/spokes/${alpha.segment}/assets/${alpha.mark}`);
  const platformOnAlpha = await get(hostOf(alpha), "/assets/icon-home.svg");
  const platformOnBeta = await get(hostOf(beta), "/assets/icon-home.svg");

  harness.check(rows, "Alpha host serves its OWN Spoke asset (200)", ownOnAlpha.status === 200, `status=${ownOnAlpha.status}`);
  harness.check(rows, "Alpha host REFUSES Beta's Spoke asset", otherOnAlpha.status === 404, `status=${otherOnAlpha.status}`);
  harness.check(rows, "Beta host serves its OWN Spoke asset (200)", ownOnBeta.status === 200, `status=${ownOnBeta.status}`);
  harness.check(rows, "Beta host REFUSES Alpha's Spoke asset", otherOnBeta.status === 404, `status=${otherOnBeta.status}`);
  harness.check(
    rows,
    "the shared platform asset is available on BOTH hosts",
    platformOnAlpha.status === 200 && platformOnBeta.status === 200,
    `alpha=${platformOnAlpha.status} beta=${platformOnBeta.status}`,
  );
}

/**
 * PER-HOST METADATA SURFACES: the sitemap, `robots.txt` and the OpenGraph image of the SAME public
 * pathname, each answered by the Spoke its own host selected.
 */
async function runSurfaceProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const alphaFacts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const betaFacts = factsFor(beta, MULTIHOST_SPOKES[1]);
  const hostOf = (spoke) => `${spoke.hostname}:${port}`;
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const alphaSitemap = await get(hostOf(alpha), "/sitemap.xml");
  const betaSitemap = await get(hostOf(beta), "/sitemap.xml");
  const alphaRobots = await get(hostOf(alpha), "/robots.txt");
  const betaRobots = await get(hostOf(beta), "/robots.txt");

  harness.check(
    rows,
    "Alpha sitemap uses the Alpha origin",
    alphaSitemap.body.includes(`${alphaFacts.origin}/ww/en`),
    alphaSitemap.body.slice(0, 160),
  );
  harness.check(
    rows,
    "Alpha sitemap carries Alpha's OWN authored route",
    alphaSitemap.body.includes(`${alphaFacts.origin}/ww/en/${alpha.onlyRoute}`),
    "",
  );
  harness.check(rows, "Alpha sitemap contains no Beta URL", !alphaSitemap.body.includes(beta.hostname), "");
  harness.check(
    rows,
    "Beta sitemap uses the Beta origin",
    betaSitemap.body.includes(`${betaFacts.origin}/ww/en`),
    betaSitemap.body.slice(0, 160),
  );
  harness.check(
    rows,
    "Beta sitemap carries Beta's OWN authored route",
    betaSitemap.body.includes(`${betaFacts.origin}/ww/en/${beta.onlyRoute}`),
    "",
  );
  harness.check(rows, "Beta sitemap contains no Alpha URL", !betaSitemap.body.includes(alpha.hostname), "");
  harness.check(
    rows,
    "Alpha robots advertises the Alpha sitemap",
    alphaRobots.body.includes(`${alphaFacts.origin}/sitemap.xml`),
    alphaRobots.body.trim(),
  );
  harness.check(
    rows,
    "Beta robots advertises the Beta sitemap",
    betaRobots.body.includes(`${betaFacts.origin}/sitemap.xml`),
    betaRobots.body.trim(),
  );

  for (const spoke of installation.spokes) {
    const image = await get(hostOf(spoke), "/ww/en/opengraph-image");
    const type = String(image.headers["content-type"] ?? "");
    harness.check(
      rows,
      `${spoke.id}: /ww/en/opengraph-image is an image (200 + image/png)`,
      image.status === 200 && type.startsWith("image/png"),
      `status=${image.status} type=${type || "(none)"}`,
    );
  }
}

/** The accepted hostname semantics, exercised against the RUNNING dispatch: exact, normalized, fail-closed. */
async function runHostnameProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const facts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const upper = await get("Alpha.LocalHost", "/ww/en/about");
  harness.check(
    rows,
    "a differently-CASED host resolves to its claim",
    upper.status === 200 && upper.body.includes(facts.name),
    `status=${upper.status}`,
  );

  const trailingStop = await get("alpha.localhost.", "/ww/en/about");
  harness.check(
    rows,
    "the DNS-root spelling of the same host resolves",
    trailingStop.status === 200 && trailingStop.body.includes(facts.name),
    `status=${trailingStop.status}`,
  );

  const suffix = await get("sub.alpha.localhost", "/ww/en/about");
  harness.check(rows, "a SUBDOMAIN no Spoke claimed does NOT resolve", suffix.status === 404, `status=${suffix.status}`);

  const betaSuffix = await get(`${beta.hostname}.attacker.example`, "/ww/en/about");
  harness.check(rows, "a claimed host as a SUFFIX of another host resolves nothing", betaSuffix.status === 404, `status=${betaSuffix.status}`);

  const unknown = await get("unknown.localhost", "/ww/en/about");
  const leaked = unknown.body.includes(facts.name) || unknown.body.includes(MULTIHOST_SPOKES[1].siteName);
  harness.check(rows, "an UNCLAIMED hostname fails closed (404)", unknown.status === 404, `status=${unknown.status}`);
  harness.check(rows, "the unclaimed hostname is answered by NO Spoke's content", !leaked, "");
  harness.check(
    rows,
    "the unclaimed hostname is not redirected to a default Spoke",
    (unknown.headers.location ?? "") === "",
    `location=${unknown.headers.location ?? "(none)"}`,
  );

  // ── THE BARE ROOT completes INSIDE the Spoke the host selected (M17 §5) ──────────────────────────────
  // `/` names NO segments, so it is the OPTIONAL catch-all's own case: the same request-context and
  // Site/locale completion flow as every other public path — resolved inside the Spoke THIS host selected,
  // and answered with a PUBLIC redirect. It must never be a 404, and it must never leave this Spoke.
  const hostFor = (spoke) => `${spoke.hostname}:${port}`;
  const alphaRoot = await get(hostFor(alpha), "/");
  const betaRoot = await get(hostFor(beta), `/`);
  const alphaRootLocation = alphaRoot.headers.location ?? "";
  const betaRootLocation = betaRoot.headers.location ?? "";

  harness.check(rows, "Alpha's ROOT completes with a public redirect, never a 404", alphaRoot.status === 307 || alphaRoot.status === 302, `status=${alphaRoot.status}`);
  harness.check(rows, "Beta's ROOT completes with a public redirect, never a 404", betaRoot.status === 307 || betaRoot.status === 302, `status=${betaRoot.status}`);
  harness.check(rows, "Alpha's ROOT completes to a PUBLIC path (no internal prefix)", alphaRootLocation.startsWith("/") && !alphaRootLocation.includes("~spoke"), `location=${alphaRootLocation}`);
  harness.check(rows, "Beta's ROOT completes to a PUBLIC path (no internal prefix)", betaRootLocation.startsWith("/") && !betaRootLocation.includes("~spoke"), `location=${betaRootLocation}`);
  // The SAME public pathname on two hosts — the completion is per host, not a shared answer.
  harness.check(rows, "both ROOTS complete to the same PUBLIC pathname on their own host", alphaRootLocation === betaRootLocation, `alpha=${alphaRootLocation} beta=${betaRootLocation}`);

  const alphaHome = await get(hostFor(alpha), alphaRootLocation);
  const betaHome = await get(hostFor(beta), betaRootLocation);
  harness.check(
    rows,
    "Alpha's completed ROOT renders ALPHA's own chrome (its own dictionary wording)",
    alphaHome.status === 200 && alphaHome.body.includes(MULTIHOST_SPOKES[0].navigationLabels["/"]),
    `status=${alphaHome.status}`,
  );
  harness.check(
    rows,
    "Beta's completed ROOT renders BETA's own chrome (its own dictionary wording)",
    betaHome.status === 200 && betaHome.body.includes(MULTIHOST_SPOKES[1].navigationLabels["/"]),
    `status=${betaHome.status}`,
  );

  const unknownRoot = await get("unknown.localhost", "/");
  harness.check(rows, "even an unclaimed host's ROOT is refused (no default Spoke)", unknownRoot.status === 404, `status=${unknownRoot.status}`);
}

/**
 * THE PLATFORM'S OWN INSPECTION URLS (M20 §32–§35, §44).
 *
 * The hosting platform publishes a unique deployment URL and a branch URL for the build it runs, and an
 * operator uses exactly those to check that a deployment renders. This Installation NOMINATES `alpha` for
 * them, so both must render alpha's own pages — while every other Vercel-shaped hostname stays refused
 * (recognition is exact equality against what the platform reported, never a `*.vercel.app` suffix rule).
 *
 * The metadata assertion is the other half of the policy: the inspection hostname is a VIEWING surface, so
 * the rendered document must stay canonical to alpha's OWN authored origin and must never use the
 * inspection hostname as an origin.
 */
async function runInspectionProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const alphaFacts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const betaFacts = factsFor(beta, MULTIHOST_SPOKES[1]);
  const navigationWording = MULTIHOST_SPOKES[0].navigationLabels["/about"];
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const surfaces = [
    ["the unique deployment URL", installation.inspection.hostname],
    ["the branch URL", installation.inspection.branchHostname],
  ];

  for (const [label, host] of surfaces) {
    const root = await get(host, "/");
    const about = await get(host, "/ww/en/about");
    const again = await get(host, "/ww/en/about");

    harness.check(
      rows,
      `${label}: the root completes into the nominated Spoke's own locale`,
      root.status === 307 && /\/ww\/(?:en|de)$/.test((root.headers.location ?? "").trim()),
      `status=${root.status} location=${root.headers.location ?? "(none)"}`,
    );
    harness.check(
      rows,
      `${label}: /ww/en/about is served by the nominated Spoke`,
      about.status === 200 && about.body.includes(alphaFacts.name) && about.body.includes(alphaFacts.content),
      `status=${about.status}`,
    );
    harness.check(
      rows,
      `${label}: the other Spoke is never exposed`,
      !about.body.includes(betaFacts.name) && !about.body.includes(betaFacts.content),
      "",
    );
    harness.check(
      rows,
      `${label}: metadata stays canonical to the Spoke's OWN origin`,
      about.body.includes(alphaFacts.origin) && !anyUrlContains(about.body, host),
      `host=${host}`,
    );
    harness.check(
      rows,
      `${label}: no internal prefix leaks into any URL`,
      !anyUrlContains(about.body, "~spoke"),
      "",
    );
    harness.check(
      rows,
      `${label}: V/A/V — the same request twice is the same page`,
      fingerprint(about.body) === fingerprint(again.body),
      "",
    );
  }

  const refused = [
    "some-other-project.vercel.app",
    "unrelated-team.vercel.app",
    `${installation.inspection.branchHostname}.evil.test`,
    "unknown.example.com",
  ];
  for (const host of refused) {
    const answer = await get(host, "/ww/en/about");
    harness.check(rows, `an unrecognised host is still refused: ${host}`, answer.status === 404, `status=${answer.status}`);
  }
}



/** Waits until the dev server answers ANYTHING (a dev server compiles on the first request). */
async function waitForAnyResponse(port, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      await requestWithHost(port, `127.0.0.1:${port}`, "/");
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

/**
 * Starts the dev server for THIS Installation, trying the next port when one is already taken.
 *
 * The hosting platform's OWN identity for the build is exported first (M20 §23): `VERCEL_URL` and
 * `VERCEL_BRANCH_URL` are exactly what a Vercel build is given, and the dev server INHERITS this process's
 * environment — so the proof exercises the production mechanism rather than a test-only switch.
 */
async function startServer(harness, installation) {
  let last = null;
  const platformIdentity = { ...MULTIHOST_INSPECTION };
  process.env["VERCEL_URL"] = platformIdentity.hostname;
  process.env["VERCEL_BRANCH_URL"] = platformIdentity.branchHostname;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { deploymentRoot: installation.root });
    if (await waitForAnyResponse(port)) return { server, port };
    last = server;
    await harness.stopServer(server);
  }
  throw new Error(`no port answered among ${PORT_OFFSETS.map((o) => harness.port(o)).join(", ")} — last log: ${last ? last.log().slice(-400) : "(none)"}`);
}

/**
 * THE BROWSER-VISIBLE FACT: a real browser reaches each host and STAYS on the public pathname.
 *
 * `alpha.localhost` and `beta.localhost` are loopback names a browser resolves itself, so the navigation
 * exercises the same dispatch the HTTP proof does — and adds the one fact only a browser can report: the
 * address bar. It must read `/ww/en/about` and never the internal namespace.
 */
async function runBrowserProof(harness, rows, chrome, port, installation) {
  const cdp = await Cdp.connect(chrome);
  try {
    for (const spoke of installation.spokes) {
      const fixture = MULTIHOST_SPOKES.find((candidate) => candidate.id === spoke.id);
      const url = `http://${spoke.hostname}:${port}/ww/en/about`;
      let observed = null;

      await cdp.navigate(url);
      const end = Date.now() + 60000;
      while (Date.now() < end) {
        observed = await cdp.evaluate(
          `(() => ({ path: location.pathname, host: location.host, text: document.body ? document.body.textContent || "" : "", html: document.documentElement ? document.documentElement.outerHTML : "" }))()`,
        );
        if (observed && observed.text.includes(fixture.aboutBody)) break;
        await sleep(400);
      }

      harness.check(
        rows,
        `${spoke.id}: a BROWSER keeps the public pathname`,
        observed !== null && observed.path === "/ww/en/about",
        `path=${observed ? observed.path : "(no observation)"}`,
      );
      harness.check(
        rows,
        `${spoke.id}: the browser's document is THIS Spoke's`,
        observed !== null && observed.text.includes(fixture.siteName) && observed.text.includes(fixture.aboutBody),
        observed ? observed.text.slice(0, 120) : "(no observation)",
      );
      harness.check(
        rows,
        `${spoke.id}: the browser's document leaks no internal prefix into any URL`,
        observed !== null && !/\b(?:href|src)="[^"]*~spoke/.test(observed.html ?? ""),
        "",
      );
    }
  // ── SOFT NAVIGATION (M17 §11/§14): a Link click on a public path must be COMMITTED BY THE APP ROUTER, never
  // answered by a full document reload. The sentinel lives on `window`, so a reload destroys it — which is
  // exactly what makes it a proof. (The superseded rewrite served this click with a whole new document.)
  const softHost = installation.spokes[0].hostname;
  await cdp.navigate(`http://${softHost}:${port}/ww/en`);
  await sleep(2500);
  await cdp.evaluate("window.__foundationSoftNavSentinel = 'set-before-the-click'");
  const aboutLink = `[...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/ww/en/about')`;
  const softHref = await cdp.evaluate(
    `(() => { const link = ${aboutLink}; return link ? link.getAttribute('href') : null; })()`,
  );
  await cdp.evaluate(`(() => { const link = ${aboutLink}; if (link) link.click(); })()`);

  let softObserved = null;
  const softEnd = Date.now() + 60000;
  while (Date.now() < softEnd) {
    softObserved = await cdp.evaluate(
      `(() => ({ path: location.pathname, sentinel: window.__foundationSoftNavSentinel ?? null, text: document.body ? document.body.textContent || "" : "" }))()`,
    );
    if (softObserved !== null && softObserved.path === "/ww/en/about") break;
    await sleep(300);
  }

  harness.check(
    rows,
    "an internal Link is authored as a PUBLIC path (no internal prefix)",
    softHref === "/ww/en/about",
    `href=${softHref}`,
  );
  harness.check(
    rows,
    "a Link click is a SOFT client transition that COMMITS on the public pathname",
    softObserved !== null && softObserved.path === "/ww/en/about",
    `path=${softObserved !== null ? softObserved.path : "(no observation)"}`,
  );
  harness.check(
    rows,
    "the document sentinel SURVIVED: a transition, not a document reload",
    softObserved !== null && softObserved.sentinel === "set-before-the-click",
    `sentinel=${softObserved !== null ? softObserved.sentinel : "(destroyed)"}`,
  );
  harness.check(
    rows,
    "the committed transition rendered the target Spoke's own content",
    softObserved !== null && softObserved.text.includes(MULTIHOST_SPOKES[0].aboutBody),
    softObserved !== null ? softObserved.text.slice(0, 100) : "(no observation)",
  );
  } finally {
    await cdp.close();
  }
}

/**
 * THE FOUNDATION-OWNED SHELL ASSET PROOF (FOUNDATION SIDEBAR ASSET CORRECTION).
 *
 * THE DEFECT this proof exists to keep closed: in an EXPLICIT multi-Spoke Installation the shell composed
 * a sidebar/default control icon as `/assets/sidebar-open.svg` — the PLATFORM path — while that role file
 * belongs to each SPOKE's own replaceable namespace (`/spokes/<segment>/assets/**`). The request answered
 * 404 on every Spoke of this Installation, and the browser showed a broken image.
 *
 * WHY THE ACCEPTED GATE MISSED IT: the deployment browser matrix runs against a synthetic LEGACY-shaped
 * installation whose control-icon assertions are CONDITIONAL on that installation shipping the role — so
 * the assertions were skipped rather than failing — and this multi-host scenario asserted cross-Spoke
 * ISOLATION (own namespace named, foreign refused) without ever FETCHING the icons the shell rendered.
 *
 * The proof is deliberately scoped to FOUNDATION-OWNED RENDERED SHELL ASSETS: the sidebar/control icon
 * markers the Foundation's own primitives paint. User-authored navigation content is never crawled here.
 */
const SHELL_ICON_MARKERS = ["ui-sidebar-toggle-icon", "ui-mobile-nav-icon", "ui-nav-item-icon"];

/** The replaceable role basenames the sidebar control family presents (the installation's own artwork). */
const SHELL_ASSET_ROLE_BASENAMES = [
  "sidebar-open.svg",
  "sidebar-close.svg",
  "sidebar-default-icon-open.svg",
  "sidebar-default-icon-closed.svg",
];

/** Every rendered shell icon URL in one document, with its `src` and the marker that identified it. */
function shellIconUrls(html) {
  const found = [];
  for (const tag of html.matchAll(/<img\b[^>]*>/g)) {
    const marker = SHELL_ICON_MARKERS.find((name) => tag[0].includes(name));
    if (marker === undefined) continue;
    const src = /src="([^"]+)"/.exec(tag[0])?.[1] ?? "";
    if (src !== "") found.push({ src, marker });
  }
  return [...new Map(found.map((entry) => [entry.src, entry])).values()];
}

/** The rendered shell icons a REAL browser reports, and whether every one of them loaded. */
const RENDERED_SHELL_ICONS_PROBE = `(() => {
  const imgs = [...document.querySelectorAll("img.ui-sidebar-toggle-icon, img.ui-mobile-nav-icon, img.ui-nav-item-icon")];
  return {
    count: imgs.length,
    broken: imgs.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src") || ""),
    sources: imgs.map((image) => image.getAttribute("src") || ""),
  };
})()`;

async function runShellAssetProof(harness, rows, port, installation) {
  for (const spoke of installation.spokes) {
    const host = `${spoke.hostname}:${port}`;
    const page = await requestWithHost(port, host, "/ww/en/about");
    harness.check(
      rows,
      `${spoke.id}: the page carrying the shell is served for the asset inspection`,
      page.status === 200,
      `status=${page.status}`,
    );

    const icons = shellIconUrls(page.body);
    harness.check(
      rows,
      `${spoke.id}: the shell renders its own control/navigation icons`,
      icons.length > 0,
      `icons=${icons.length}`,
    );

    // THE DEFECT'S OWN SIGNATURE: a Spoke-owned replaceable role resolved to the platform path.
    const guessed = SHELL_ASSET_ROLE_BASENAMES.filter((name) => page.body.includes(`src="/assets/${name}"`));
    harness.check(
      rows,
      `${spoke.id}: no shell control resolves a Spoke-owned role to the platform path`,
      guessed.length === 0,
      `guessed=${guessed.join(",") || "(none)"}`,
    );

    // THE NAMESPACE INVENTORY, STATED: the Spoke's own namespace OWNS the role; the platform namespace
    // does not own it in an explicit Installation — which is exactly why a `/assets/...` URL cannot work.
    const owned = await requestWithHost(port, host, `/spokes/${spoke.segment}/assets/sidebar-open.svg`);
    const platform = await requestWithHost(port, host, "/assets/sidebar-open.svg");
    harness.check(
      rows,
      `${spoke.id}: the Spoke namespace OWNS the sidebar role while the platform namespace does not`,
      owned.status === 200 && platform.status !== 200,
      `spoke=${owned.status} platform=${platform.status}`,
    );

    for (const { src, marker } of icons) {
      const asset = await requestWithHost(port, host, src);
      const declared = src.startsWith(`/spokes/${spoke.segment}/assets/`) || src.startsWith("/assets/");
      harness.check(
        rows,
        `${spoke.id}: rendered shell icon ${src} (${marker}) is served from a declared namespace (200)`,
        asset.status === 200 && declared,
        `status=${asset.status} namespace=${declared ? "declared" : "undeclared"}`,
      );
    }
  }
}

/**
 * THE SAME FACT IN A REAL BROWSER, IN BOTH DISCLOSURE STATES: every rendered shell icon must have LOADED
 * (never a broken `<img>`), closed and open. The controls are DISCOVERED (`button[aria-controls]`) rather
 * than named, so whichever sidebar/mobile surfaces a composition presents are the ones exercised.
 */
async function runShellAssetBrowserProof(harness, rows, chrome, port, installation) {
  const cdp = await Cdp.connect(chrome);
  try {
    for (const spoke of installation.spokes) {
      const fixture = MULTIHOST_SPOKES.find((candidate) => candidate.id === spoke.id);
      await cdp.navigate(`http://${spoke.hostname}:${port}/ww/en/about`);
      const deadline = Date.now() + 60000;
      let ready = false;
      while (Date.now() < deadline && !ready) {
        const text = await cdp.evaluate(`document.body ? document.body.textContent || "" : ""`);
        ready = typeof text === "string" && text.includes(fixture.aboutBody);
        if (!ready) await sleep(400);
      }

      const closed = await cdp.evaluate(RENDERED_SHELL_ICONS_PROBE);
      harness.check(
        rows,
        `${spoke.id}: every rendered shell icon LOADED in the closed state (no broken image)`,
        closed !== null && closed.count > 0 && closed.broken.length === 0,
        `images=${closed ? closed.count : "(none)"} broken=${closed ? closed.broken.join(",") || "(none)" : "(unknown)"}`,
      );

      const opened = await cdp.evaluate(
        `(() => { const buttons = [...document.querySelectorAll("button[aria-controls]")]; for (const button of buttons) { try { button.click(); } catch {} } return buttons.length; })()`,
      );
      await sleep(700);
      const open = await cdp.evaluate(RENDERED_SHELL_ICONS_PROBE);
      harness.check(
        rows,
        `${spoke.id}: the disclosure controls were exercised (an open state is composed)`,
        typeof opened === "number" && opened > 0,
        `controls=${opened}`,
      );
      harness.check(
        rows,
        `${spoke.id}: every rendered shell icon LOADED in the open state (no broken image)`,
        open !== null && open.broken.length === 0,
        `images=${open ? open.count : "(none)"} broken=${open ? open.broken.join(",") || "(none)" : "(unknown)"}`,
      );
    }
  } finally {
    await cdp.close();
  }
}

/** Removes exactly the namespaces this scenario created — the generated segments alpha and beta. */
function removeNamespaces(harness, installation) {
  for (const spoke of installation.spokes) {
    harness.rmSync(path.join(harness.repositoryRoot, "public", "spokes", spoke.segment), {
      recursive: true,
      force: true,
    });
  }
}

/**
 * THE SCENARIO: one disposable two-Spoke Installation, one dev server, and every proof above.
 *
 * A failure anywhere is reported as a FAILED CHECK with its cause rather than as a thrown scenario, so the
 * report says WHICH invariant broke; the Installation, the generated namespaces and the server are always
 * released afterwards.
 */
export async function run(chrome, harness) {
  const rows = [];
  const installation = materializeMultihostInstallation({ repositoryRoot: harness.repositoryRoot });
  let server = null;

  try {
    for (const spoke of installation.spokes) await materializeNamespace(harness, installation, spoke);
    const started = await startServer(harness, installation);
    server = started.server;

    await runHostProof(harness, rows, started.port, installation);
    await runSurfaceProof(harness, rows, started.port, installation);
    await runHostnameProof(harness, rows, started.port, installation);
    await runInspectionProof(harness, rows, started.port, installation);
    // The Foundation's OWN rendered shell assets, fetched and browser-verified (SIDEBAR ASSET CORRECTION).
    await runShellAssetProof(harness, rows, started.port, installation);
    await runShellAssetBrowserProof(harness, rows, chrome, started.port, installation);
    await runBrowserProof(harness, rows, chrome, started.port, installation);
  } catch (error) {
    harness.check(
      rows,
      "the multi-host scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    try {
      await harness.stopServer(server);
    } catch {
      /* the server is already gone */
    }
    removeNamespaces(harness, installation);
    installation.cleanup();
    // The platform identity was exported for this scenario's build alone; the harness's own environment is
    // left exactly as it was found.
    delete process.env["VERCEL_URL"];
    delete process.env["VERCEL_BRANCH_URL"];
  }

  return rows;
}

export default { id, run };
