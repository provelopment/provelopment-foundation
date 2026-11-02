// tests/browser/multihost.scenario.mjs
// THE MULTI-HOST SPOKE RUNTIME PROOF (FOUNDATION-MULTISITE-M16/M17; EFS-authored by GEO-04 C09-R19).
//
// ONE disposable Installation declaring TWO Spokes (`tests/support/multihost-installation.mjs`) is served by
// its OWN dev server from its OWN explicit EFS publication, and every request below travels the REAL public
// path:
//
//   HTTP request -> src/proxy.ts -> exact hostname claim -> private upstream selection header
  //   (x-foundation-spoke-segment) -> the public catch-all route -> ONE explicit SpokeRuntimeContext ->
  //   the existing M13/M14 renderer
//
// Nothing is bypassed: no request calls the composition directly, no request sets the PRIVATE SELECTION header itself, and the
// public pathname is never the internal one.
//
// THE PUBLICATION IS AUTHORED, NOT INFERRED (R19). Each Spoke
// publishes its OWN EFS Entity, a closed Site `main` and ONE qualified locale `en-001`, with real
// Home/About/own-route representations, and its canonical host is bound to that Entity. `ww` is the Spoke's
// PRESENTATION key only — a reserved word, so it can never be an EFS Site ID — which is why the retired
// `/ww/en/about` address is REFUSED here instead of served. Both Spokes expose the SAME public coordinates
// (`/en-001/about`) with DIFFERENT facts, so "same URL, different content" is proved rather than assumed.
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
// THE BUILD'S OWN AUTHORITIES (GEO-04 C09-R19): a multi-Spoke EFS Installation's presentation-asset rights are
// the BUILD's projection of its publication bindings, so the scenario produces that projection with the
// PRODUCTION producer — never by hand-writing its JSON — and removes it afterwards (the shared-host precedent).
import { efsManifestSelection, efsProjectionPath, installationSpokes } from "../../src/config/deployment-build.mjs";
import { producePublicationProjection } from "../../scripts/efs/publication-projection.mjs";
import { rmSync } from "node:fs";
// The FOUNDATION's CDP client, reused (never re-implemented): the harness passes the browser BINARY, exactly
// as it does to a deployment-owned scenario, and each scenario owns the client it opens and closes.
import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "multihost";

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [21, 22, 23];

/**
 * THE DECLARED EFS ADDRESSES (GEO-04 C09-R19).
 *
 * Both Spokes publish ONE closed Site (`main`) with ONE qualified locale and an EMPTY prefix, so every public
 * address is `<locale>/<route>`: Home is `/en-001`, About `/en-001/about`, and each Spoke's own route
 * `/en-001/<onlyRoute>`. The OpenGraph card is the Site/locale root card. These are the ONLY public
 * coordinates this scenario probes — the retired `/ww/en` grammar is asserted to be REFUSED, never used.
 */
const HOME_PATH = "/en-001";
const ABOUT_PATH = "/en-001/about";
const OG_IMAGE_PATH = "/en-001/opengraph-image";
/** The one address whose declaration no Spoke makes. */
const UNDECLARED_PATH = "/en-001/undeclared";
/** The retired grammar: refused on every host, because no publication and no fixture authors it any more. */
const RETIRED_PATH = "/ww/en/about";

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
 * THE DECLARED / UNDECLARED MATRIX ON THE WIRE, BEFORE CHROME (GEO-04 C09-R19 §4A).
 *
 * Every row names the Host that must answer, the address it asks for, and the outcome the AUTHORED publication
 * promises — plus the representation's own marker, so a 200 can never be a different Spoke's page.
 */
async function runClaimMatrix(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const alphaFixture = MULTIHOST_SPOKES[0];
  const betaFixture = MULTIHOST_SPOKES[1];
  const hostOf = (spoke) => `${spoke.hostname}:${port}`;
  const cases = [
    { host: hostOf(alpha), label: "alpha-home", pathname: HOME_PATH, status: 200, marker: alphaFixture.tagline },
    { host: hostOf(alpha), label: "alpha-about", pathname: ABOUT_PATH, status: 200, marker: alphaFixture.aboutBody },
    {
      host: hostOf(alpha),
      label: "alpha-own-page",
      pathname: `${HOME_PATH}/${alpha.onlyRoute}`,
      status: 200,
      marker: `${alpha.siteName} authors ${alpha.onlyRoute}`,
    },
    { host: hostOf(beta), label: "beta-home", pathname: HOME_PATH, status: 200, marker: betaFixture.tagline },
    { host: hostOf(beta), label: "beta-about", pathname: ABOUT_PATH, status: 200, marker: betaFixture.aboutBody },
    {
      host: hostOf(beta),
      label: "beta-own-page",
      pathname: `${HOME_PATH}/${beta.onlyRoute}`,
      status: 200,
      marker: `${beta.siteName} authors ${beta.onlyRoute}`,
    },
    // A Spoke's own Page is NOT the other Spoke's.
    { host: hostOf(alpha), label: "alpha-foreign-page", pathname: `${HOME_PATH}/${beta.onlyRoute}`, status: 404, marker: null },
    { host: hostOf(beta), label: "beta-foreign-page", pathname: `${HOME_PATH}/${alpha.onlyRoute}`, status: 404, marker: null },
    // No declaration, no Page.
    { host: hostOf(alpha), label: "alpha-undeclared", pathname: UNDECLARED_PATH, status: 404, marker: null },
    { host: hostOf(beta), label: "beta-undeclared", pathname: UNDECLARED_PATH, status: 404, marker: null },
    // The retired grammar is never revived — on the host that used to serve it, or any other.
    { host: hostOf(alpha), label: "alpha-retired-grammar", pathname: RETIRED_PATH, status: 404, marker: null },
    { host: hostOf(beta), label: "beta-retired-grammar", pathname: RETIRED_PATH, status: 404, marker: null },
    // Fail closed: no default Spoke, no guess, no wildcard.
    { host: "unclaimed.localhost", label: "unclaimed-host", pathname: ABOUT_PATH, status: 404, marker: null },
    {
      host: `${beta.hostname}.impostor.example`,
      label: "suffix-impostor",
      pathname: ABOUT_PATH,
      status: 404,
      marker: null,
    },
    // The platform's inspection hosts are ALPHA's, never Beta's.
    {
      host: installation.inspection.hostname,
      label: "inspection-host",
      pathname: ABOUT_PATH,
      status: 200,
      marker: alphaFixture.aboutBody,
    },
    {
      host: installation.inspection.branchHostname,
      label: "inspection-branch-host",
      pathname: ABOUT_PATH,
      status: 200,
      marker: alphaFixture.aboutBody,
    },
  ];

  for (const testCase of cases) {
    const response = await requestWithHost(port, testCase.host, testCase.pathname);
    const hasMarker = testCase.marker === null || response.body.includes(testCase.marker);
    // OWNERSHIP, ROW BY ROW: an Alpha-answered row must never carry Beta's identity, a Beta-answered row must
    // never carry Alpha's, and a REFUSED row must carry neither Spoke's page at all.
    const isAlphaRow = testCase.label.startsWith("alpha-") || testCase.label.startsWith("inspection");
    const isBetaRow = testCase.label.startsWith("beta-");
    const ownMarker = isBetaRow ? betaFixture.aboutBody : alphaFixture.aboutBody;
    const foreignMarker = isBetaRow ? alphaFixture.aboutBody : betaFixture.aboutBody;
    const leaksForeign =
      testCase.status === 200 ? response.body.includes(foreignMarker) : response.body.includes(ownMarker) || response.body.includes(foreignMarker);
    harness.check(
      rows,
      `${testCase.label}: ${testCase.pathname} on ${testCase.host} → ${testCase.status}`,
      response.status === testCase.status && hasMarker && !leaksForeign,
      `status=${response.status} marker=${hasMarker} foreign=${leaksForeign}${isAlphaRow || isBetaRow ? "" : " (refused row)"}`,
    );
  }
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

  const first = await get(hostOf(alpha), "/en-001/about");
  const second = await get(hostOf(beta), "/en-001/about");
  const third = await get(hostOf(alpha), "/en-001/about");
  const fourth = await get(hostOf(beta), "/en-001/about");

  harness.check(rows, "alpha /en-001/about is served (200)", first.status === 200, `status=${first.status}`);
  harness.check(rows, "beta /en-001/about is served (200)", second.status === 200, `status=${second.status}`);

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
  const direct = await get(hostOf(alpha), `/~spoke/${alpha.segment}/en-001/about`);
  const directBeta = await get(hostOf(beta), `/~spoke/${beta.segment}/en-001/about`);
  const crossInternal = await get(hostOf(alpha), `/~spoke/${beta.segment}/en-001/about`);
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
    alphaSitemap.body.includes(`${alphaFacts.origin}/en-001`),
    alphaSitemap.body.slice(0, 160),
  );
  harness.check(
    rows,
    "Alpha sitemap carries Alpha's OWN authored route",
    alphaSitemap.body.includes(`${alphaFacts.origin}/en-001/${alpha.onlyRoute}`),
    "",
  );
  harness.check(
    rows,
    "Alpha sitemap never advertises Beta's OWN authored route",
    !alphaSitemap.body.includes(`/en-001/${beta.onlyRoute}`),
    alphaSitemap.body.includes(`/en-001/${beta.onlyRoute}`) ? "a foreign Page was published" : "",
  );
  harness.check(rows, "Alpha sitemap contains no Beta URL", !alphaSitemap.body.includes(beta.hostname), "");
  // THE RETIRED GRAMMAR IS NOT A DISCOVERY ADDRESS: no `/ww/en` loc survives anywhere.
  harness.check(
    rows,
    "Alpha sitemap advertises no address in the retired grammar",
    !alphaSitemap.body.includes("/ww/en"),
    alphaSitemap.body.slice(0, 160),
  );
  harness.check(
    rows,
    "Beta sitemap uses the Beta origin",
    betaSitemap.body.includes(`${betaFacts.origin}/en-001`),
    betaSitemap.body.slice(0, 160),
  );
  harness.check(
    rows,
    "Beta sitemap carries Beta's OWN authored route",
    betaSitemap.body.includes(`${betaFacts.origin}/en-001/${beta.onlyRoute}`),
    "",
  );
  harness.check(
    rows,
    "Beta sitemap never advertises Alpha's OWN authored route",
    !betaSitemap.body.includes(`/en-001/${alpha.onlyRoute}`),
    betaSitemap.body.includes(`/en-001/${alpha.onlyRoute}`) ? "a foreign Page was published" : "",
  );
  harness.check(rows, "Beta sitemap contains no Alpha URL", !betaSitemap.body.includes(alpha.hostname), "");
  harness.check(
    rows,
    "Beta sitemap advertises no address in the retired grammar",
    !betaSitemap.body.includes("/ww/en"),
    betaSitemap.body.slice(0, 160),
  );
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
    // THE EFS OPEN GRAPH CARD (`GEO-03` R04-C21). The ACCEPTED public address is the Site/locale root card:
    // `<prefix>/<locale>/opengraph-image`. It is not a per-Page identity. Two candidates are probed so a failure
    // reports what the running publication actually answers instead of a bare status.
    const candidates = [OG_IMAGE_PATH, `${HOME_PATH}/home/opengraph-image`, "/opengraph-image"];
    const measured = [];
    for (const candidate of candidates) {
      const response = await get(hostOf(spoke), candidate);
      measured.push(
        `${candidate}=${response.status}:${String(response.headers["content-type"] ?? "none").split(";")[0]}`,
      );
    }
    const image = await get(hostOf(spoke), OG_IMAGE_PATH);
    const type = String(image.headers["content-type"] ?? "");
    harness.check(
      rows,
      `${spoke.id}: ${OG_IMAGE_PATH} is the site/locale card (200 + image/png)`,
      image.status === 200 && type.startsWith("image/png"),
      `status=${image.status} type=${type || "(none)"} | ${measured.join(" ")}`,
    );
  }
}

/** The accepted hostname semantics, exercised against the RUNNING dispatch: exact, normalized, fail-closed. */
async function runHostnameProof(harness, rows, port, installation) {
  const [alpha, beta] = installation.spokes;
  const facts = factsFor(alpha, MULTIHOST_SPOKES[0]);
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const upper = await get("Alpha.LocalHost", "/en-001/about");
  harness.check(
    rows,
    "a differently-CASED host resolves to its claim",
    upper.status === 200 && upper.body.includes(facts.name),
    `status=${upper.status}`,
  );

  const trailingStop = await get("alpha.localhost.", "/en-001/about");
  harness.check(
    rows,
    "the DNS-root spelling of the same host resolves",
    trailingStop.status === 200 && trailingStop.body.includes(facts.name),
    `status=${trailingStop.status}`,
  );

  const suffix = await get("sub.alpha.localhost", "/en-001/about");
  harness.check(rows, "a SUBDOMAIN no Spoke claimed does NOT resolve", suffix.status === 404, `status=${suffix.status}`);

  const betaSuffix = await get(`${beta.hostname}.attacker.example`, "/en-001/about");
  harness.check(rows, "a claimed host as a SUFFIX of another host resolves nothing", betaSuffix.status === 404, `status=${betaSuffix.status}`);

  const unknown = await get("unknown.localhost", "/en-001/about");
  const leaked = unknown.body.includes(facts.name) || unknown.body.includes(MULTIHOST_SPOKES[1].siteName);
  harness.check(rows, "an UNCLAIMED hostname fails closed (404)", unknown.status === 404, `status=${unknown.status}`);
  harness.check(rows, "the unclaimed hostname is answered by NO Spoke's content", !leaked, "");
  harness.check(
    rows,
    "the unclaimed hostname is not redirected to a default Spoke",
    (unknown.headers.location ?? "") === "",
    `location=${unknown.headers.location ?? "(none)"}`,
  );

  // ── THE BARE ROOT completes INSIDE the Spoke the host selected (M17 §5; EFS entry rule R19) ──────────
  // `/` names NO segments, so it is the OPTIONAL catch-all's own case: the EFS entry-completion rule selects
  // the binding's declared default locale and answers with a PUBLIC redirect. The ACTUAL status and Location
  // are recorded here rather than assumed: what matters is that the target is the owner's DECLARED Home, that
  // it stays inside this Spoke, and that an unclaimed host's root is still refused.
  const hostFor = (spoke) => `${spoke.hostname}:${port}`;
  const alphaRoot = await get(hostFor(alpha), "/");
  const betaRoot = await get(hostFor(beta), "/");
  const alphaRootLocation = (alphaRoot.headers.location ?? "").trim();
  const betaRootLocation = (betaRoot.headers.location ?? "").trim();
  const completed = (status) => status >= 300 && status < 400;

  harness.check(
    rows,
    "Alpha's ROOT completes with a public redirect, never a 404",
    completed(alphaRoot.status),
    `status=${alphaRoot.status} location=${alphaRootLocation || "(none)"}`,
  );
  harness.check(
    rows,
    "Beta's ROOT completes with a public redirect, never a 404",
    completed(betaRoot.status),
    `status=${betaRoot.status} location=${betaRootLocation || "(none)"}`,
  );
  harness.check(
    rows,
    "Alpha's ROOT completes to a PUBLIC path (no internal prefix)",
    alphaRootLocation.startsWith("/") && !alphaRootLocation.includes("~spoke"),
    `location=${alphaRootLocation}`,
  );
  harness.check(
    rows,
    "Beta's ROOT completes to a PUBLIC path (no internal prefix)",
    betaRootLocation.startsWith("/") && !betaRootLocation.includes("~spoke"),
    `location=${betaRootLocation}`,
  );
  // The SAME public pathname on two hosts — the completion is per host, not a shared answer.
  harness.check(
    rows,
    "both ROOTS complete to the same PUBLIC pathname on their own host",
    alphaRootLocation === betaRootLocation,
    `alpha=${alphaRootLocation} beta=${betaRootLocation}`,
  );
  // …and the completion lands on the OWNER's declared Home Page, not an invented address.
  harness.check(
    rows,
    "the completed ROOT is the binding's declared Home (its declared locale)",
    alphaRootLocation === `${HOME_PATH}/` || alphaRootLocation === HOME_PATH,
    `location=${alphaRootLocation} expected=${HOME_PATH}`,
  );

  const alphaHome = await get(hostFor(alpha), HOME_PATH);
  const betaHome = await get(hostFor(beta), HOME_PATH);
  harness.check(
    rows,
    "Alpha's completed ROOT renders ALPHA's own chrome (its own dictionary wording)",
    alphaHome.status === 200 && alphaHome.body.includes(MULTIHOST_SPOKES[0].navigationLabels["/"]),
    `status=${alphaHome.status} location=${alphaRootLocation}`,
  );
  harness.check(
    rows,
    "Beta's completed ROOT renders BETA's own chrome (its own dictionary wording)",
    betaHome.status === 200 && betaHome.body.includes(MULTIHOST_SPOKES[1].navigationLabels["/"]),
    `status=${betaHome.status} location=${betaRootLocation}`,
  );

  const unknownRoot = await get("unknown.localhost", "/");
  harness.check(
    rows,
    "even an unclaimed host's ROOT is refused (no default Spoke)",
    unknownRoot.status === 404,
    `status=${unknownRoot.status}`,
  );
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
    const about = await get(host, "/en-001/about");
    const again = await get(host, "/en-001/about");

    harness.check(
      rows,
      `${label}: the root completes into the nominated Spoke's own declared locale`,
      (root.status === 307 || root.status === 308 || root.status === 302) &&
        /^\/en-001\/?$/.test((root.headers.location ?? "").trim()),
      `status=${root.status} location=${root.headers.location ?? "(none)"}`,
    );
    harness.check(
      rows,
      `${label}: /en-001/about is served by the nominated Spoke`,
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
    const answer = await get(host, "/en-001/about");
    harness.check(rows, `an unrecognised host is still refused: ${host}`, answer.status === 404, `status=${answer.status}`);
  }
}



/**
 * WAIT UNTIL THE CLAIMED HOST ANSWERS ITS DECLARED PAGE (GEO-04 C09-R19).
 *
 * The superseded probe sent `127.0.0.1` as the `Host` and accepted ANY response: a loopback literal is a host no
 * EFS binding claims, so the only thing it could report was "the port is listening" — it would have called a 404
 * or a 500 "ready". Readiness of a publication is a CLAIM, so this waits for Alpha's own hostname at its own
 * declared About address, answering 200 with Alpha's own body. A live port that answers anything else is a
 * DECLARATION fault, and the error names the host, path and status that produced it.
 */
async function waitForClaimedPage(port, timeoutMs = 120000) {
  const host = MULTIHOST_SPOKES[0].hostname;
  const deadline = Date.now() + timeoutMs;
  let last = "no attempt";
  while (Date.now() < deadline) {
    try {
      const response = await requestWithHost(port, host, ABOUT_PATH);
      if (response.status === 200 && response.body.includes(MULTIHOST_SPOKES[0].aboutBody)) return;
      last = `status=${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await sleep(400);
  }
  throw new Error(`the two-Spoke Installation never served ${ABOUT_PATH} on ${host} (${last})`);
}

/**
 * Starts the dev server for THIS Installation, trying the next port when one is already taken.
 *
 * The Installation is handed over as the EXPLICIT descriptor (`efsInstallation`): the server serves exactly that
 * publication and no process-global deployment override is used. The hosting platform's OWN identity for the
 * build (`VERCEL_URL`/`VERCEL_BRANCH_URL`) is offered on the child's environment, exactly as a platform build
 * receives it — while those values authorize nothing the EFS manifest does not claim.
 */
async function startServer(harness, installation) {
  const platformIdentity = { ...MULTIHOST_INSPECTION };
  process.env["VERCEL_URL"] = platformIdentity.hostname;
  process.env["VERCEL_BRANCH_URL"] = platformIdentity.branchHostname;
  let failure = null;
  let lastServer = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { efsInstallation: installation });
    lastServer = server;
    try {
      await waitForClaimedPage(port);
      return { server, port };
    } catch (error) {
      failure = error;
      await harness.stopServer(server);
    }
  }
  throw new Error(
    `${failure instanceof Error ? failure.message : String(failure)}\n--- dev server output ---\n${
      lastServer === null ? "(none)" : lastServer.log().slice(-1200)
    }`,
  );
}

/**
 * THE BROWSER-VISIBLE FACT: a real browser reaches each host and STAYS on the public pathname.
 *
 * `alpha.localhost` and `beta.localhost` are loopback names a browser resolves itself, so the navigation
 * exercises the same dispatch the HTTP proof does — and adds the one fact only a browser can report: the
 * address bar. It must read `/en-001/about` and never the internal namespace.
 */
async function runBrowserProof(harness, rows, chrome, port, installation) {
  const cdp = await Cdp.connect(chrome);
  try {
    for (const spoke of installation.spokes) {
      const fixture = MULTIHOST_SPOKES.find((candidate) => candidate.id === spoke.id);
      const url = `http://${spoke.hostname}:${port}/en-001/about`;
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
        observed !== null && observed.path === "/en-001/about",
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
  await cdp.navigate(`http://${softHost}:${port}${HOME_PATH}`);
  await sleep(2500);
  await cdp.evaluate("window.__foundationSoftNavSentinel = 'set-before-the-click'");
  const aboutLink = `[...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === ${JSON.stringify(ABOUT_PATH)})`;
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
    if (softObserved !== null && softObserved.path === "/en-001/about") break;
    await sleep(300);
  }

  harness.check(
    rows,
    "an internal Link is authored as a PUBLIC path (no internal prefix)",
    softHref === "/en-001/about",
    `href=${softHref}`,
  );
  harness.check(
    rows,
    "a Link click is a SOFT client transition that COMMITS on the public pathname",
    softObserved !== null && softObserved.path === "/en-001/about",
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
    const page = await requestWithHost(port, host, "/en-001/about");
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
      await cdp.navigate(`http://${spoke.hostname}:${port}/en-001/about`);
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

/**
 * PUBLISH THIS INSTALLATION'S PRESENTATION-ASSET RIGHTS (GEO-04 C09-R19).
 *
 * A Spoke's `/spokes/<segment>/assets/**` namespace is HOST-BOUND and, once an EFS runtime is configured, the
 * BUILD's verified publication projection is the only authority that can authorize it — `spokes.json` alone
 * grants nothing (that is the released `R04-C24` rule, not a test convenience). The projection is produced by
 * the PRODUCTION producer into the repository's ignored cache, so the running build makes its own decision from
 * the same bytes a real build would; the scenario removes it afterwards.
 */
async function publishPresentationRights(harness, installation) {
  const selection = efsManifestSelection(installation.root, {});
  const spokeIdentities = (installationSpokes(installation.root).spokes ?? []).map((spoke) => ({
    id: spoke.id,
    spokeHubId: spoke.spokeHubId,
  }));
  const projected = await producePublicationProjection({
    root: installation.root,
    manifestPath: selection.path,
    explicit: false,
    spokeIdentities,
    repositoryRoot: harness.repositoryRoot,
  });
  if (projected.status !== "projected") {
    throw new Error(`the publication projection was refused: ${String((projected.issues ?? []).join("; "))}`);
  }
  return efsProjectionPath(installation.root, harness.repositoryRoot);
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
  let projectionFile = null;

  try {
    for (const spoke of installation.spokes) await materializeNamespace(harness, installation, spoke);
    // The BUILD's rights for these namespaces, produced by the production producer before the server starts.
    projectionFile = await publishPresentationRights(harness, installation);
    const started = await startServer(harness, installation);
    server = started.server;

    // THE AUTHORED CLAIMS, ON THE WIRE, BEFORE CHROME OPENS (GEO-04 C09-R19 §4A).
    await runClaimMatrix(harness, rows, started.port, installation);
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
    // The projection is a build artefact ABOUT this Installation: it must not outlive it.
    if (projectionFile !== null) {
      try {
        rmSync(projectionFile, { force: true });
      } catch {
        /* already gone */
      }
    }
    installation.cleanup();
    // The platform identity was exported for this scenario's build alone; the harness's own environment is
    // left exactly as it was found.
    delete process.env["VERCEL_URL"];
    delete process.env["VERCEL_BRANCH_URL"];
  }

  return rows;
}

export default { id, run };
