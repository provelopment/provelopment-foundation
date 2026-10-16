// tests/browser/multi-hub.scenario.mjs
// TWO IDENTIFIED SPOKE HUBS, ONE SERVER, ONE REAL BROWSER (FOUNDATION-ID-M3-P3C §4).
//
// ONE disposable Installation authored in the NESTED `spokeHubs` form declares TWO identified Spoke Hubs, and
// `docs` in BOTH of them — the same LOCAL id, two DIFFERENT Spokes. Its own dev server serves it, and every
// request below travels the REAL public path:
//
//   HTTP request -> src/proxy.ts -> EXACT hostname claim -> private upstream selection header
//   (x-foundation-spoke-segment) -> the public catch-all route -> ONE composite SpokeRuntimeContext -> the
//   existing renderer -> the Hub-scoped switcher
//
// The fixture is the SHARED one (`tests/support/multi-hub-installation.mjs`), which the runtime suite drives
// at the same seams: one Installation, one description of it. Nothing is bypassed — no request sets the
// private selection header itself, no runtime index is injected, no routing table is hand-written, and the
// public pathname is never the internal one.
//
// OWNERSHIP. This is a FOUNDATION contract, so it lives in the harness's own directory and runs in the
// foundation scope. It writes only where the harness owns writes: OS temp (its Installation) and the
// GENERATED member namespaces it materialises — from the CANONICAL asset plan, never by inventing files —
// and then removes exactly what it created.
import { existsSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { setTimeout as sleep } from "node:timers/promises";
import path from "node:path";

import { Cdp } from "./cdp.mjs";
import {
  assertMultiHubNamespaceAgreesWithCatalog,
  materializeMultiHubInstallation,
  materializeSingleIdentifiedInstallation,
  multiHubNamespaceIdentity,
  multiHubNamespacePlan,
  MULTI_HUB_INSPECTION,
  MULTI_HUB_SPOKES,
} from "../support/multi-hub-installation.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "multi-hub";

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [41, 42, 43];
/** …and the ports for the ONE-Hub/ONE-Spoke Installation's own server (§4D). */
const SOLO_PORT_OFFSETS = [44, 45, 46];

/** The retired internal namespace prefix: a page tree that no longer exists, so a direct hit is refused. */
const RETIRED_INTERNAL_PREFIX = "/~spoke";

/**
 * ONE request with an EXPLICIT `Host` header — the boundary's whole input.
 *
 * A browser sends exactly this header; sending it deliberately is what makes "which Spoke answers?" a
 * measurable fact rather than an artifact of the URL. The `Host` value carries the port, exactly as a browser
 * spells it, so the accepted normalization (lowercase, port stripped) is exercised too.
 */
function requestWithHost(port, host, pathname, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host, ...extraHeaders } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            body: body.toString("utf8"),
            bytes: body,
          });
        });
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/** EVERY URL-BEARING VALUE IN ONE DOCUMENT, so "no cross-Hub URL" is asserted over all of them. */
function urlsInDocument(html) {
  const urls = [];
  for (const match of html.matchAll(/(?:href|src|content)="([^"]*)"/g)) urls.push(match[1]);
  return urls;
}

/** True when ANY URL in the document contains this text. */
function anyUrlContains(html, text) {
  return urlsInDocument(html).some((url) => url.includes(text));
}

/**
 * THE FACTS THAT MUST NEVER CROSS: every member's own site name, dictionary wording, page text, authored
 * origin and brand mark — read from the SHARED fixture, never re-spelled here.
 */
function factsOf(member) {
  return {
    hubId: member.hubId,
    id: member.id,
    siteName: member.siteName,
    wording: member.aboutLabel,
    content: member.aboutBody,
    origin: member.canonicalOrigin,
    mark: member.mark,
    segment: member.segment,
    onlyRoute: member.onlyRoute,
  };
}

/**
 * A fingerprint of one rendered page: the facts a request must resolve to ONE member's own values.
 *
 * Returned as a STRING so two responses can be compared for stability with `===` (an object would compare by
 * identity and be unequal even when every fact matches).
 */
function fingerprint(body) {
  return JSON.stringify({
    siteName: /Hub One Docs Site|Hub One News Site|Hub Two Docs Site/.exec(body)?.[0] ?? "",
    wording: /One Docs About|One News About|Two Docs About/.exec(body)?.[0] ?? "",
    content:
      /Hub One's docs Spoke wrote this paragraph|Hub One's news Spoke wrote a different paragraph|Hub Two's docs Spoke wrote the third paragraph/.exec(
        body,
      )?.[0] ?? "",
    namespaces: [...new Set(body.match(/\/spokes\/hub\+[a-z]+\+[a-z]+\/assets\//g) ?? [])].sort().join("|"),
  });
}

/** The dev server host header a member's claim is made for. */
function hostOf(member, port) {
  return `${member.hostname}:${port}`;
}

/**
 * THE PLATFORM ENVIRONMENT IS BORROWED, NEVER OWNED (M3-R §3C).
 *
 * The hosting platform's own build variables are exactly what a Vercel build is given, so the inspection proof
 * exports them for its servers. The ORIGINAL state — including a variable that was ABSENT — is captured before
 * anything is touched and restored on every exit path, so this scenario never leaves the environment of the
 * process (or of a later scenario) changed.
 */
const PLATFORM_VARIABLES = ["VERCEL_URL", "VERCEL_BRANCH_URL"];

function capturePlatformEnvironment() {
  return PLATFORM_VARIABLES.map((name) => ({ name, value: process.env[name] }));
}

function restorePlatformEnvironment(snapshot) {
  for (const { name, value } of snapshot) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

/** The generated namespace directory ONE member would occupy. */
function namespaceDirectory(harness, member) {
  return path.join(harness.repositoryRoot, "public", "spokes", member.segment);
}

/**
 * The members whose generated namespace ALREADY EXISTS — another execution's or another Installation's output.
 *
 * Reported and then refused: the scenario claims each namespace it writes (M3-R §3B), so it must never adopt,
 * overwrite or delete output it did not create.
 */
function namespaceCollisions(harness, members) {
  return members.map((member) => namespaceDirectory(harness, member)).filter((directory) => existsSync(directory));
}

/**
 * THE GENERATED NAMESPACES THIS SCENARIO CREATED (M3-R §3B).
 *
 * A generated namespace is shared, generated state (`public/spokes/<composite segment>/**`), so it is
 * materialised — and removed — under OWNERSHIP: each target is claimed before anything is written to it, a
 * target that already exists is a COLLISION that stops the run (another execution's or another Installation's
 * output is never overwritten and never deleted to make this proof run), and only the directories this
 * scenario actually created are removed afterwards.
 */
function ownedNamespaces() {
  return [];
}

/**
 * The GENERATED namespace files ONE member needs, written through the harness's own guarded writers.
 *
 * The FILES are the canonical plan's own rows for this member's namespace (`multiHubNamespacePlan`), so the
 * scenario installs exactly what `assets:sync` would install and what the build-time catalog publishes — and
 * nothing is invented here. BEFORE writing, the PUBLISHED catalog is judged against this Installation's
 * canonical plan, so a stale inventory stops the run with a diagnostic instead of leaving the failure to a
 * page that cannot compose, and the TARGET is claimed: an existing directory or file is reported as a
 * collision rather than overwritten.
 */
async function materializeNamespace(harness, owned, installation, member) {
  assertMultiHubNamespaceAgreesWithCatalog(installation.root, member.segment);

  const directory = path.join(harness.repositoryRoot, "public", "spokes", member.segment);
  if (existsSync(directory)) {
    throw new Error(
      `the generated namespace "${directory}" already exists, so it belongs to another execution or another ` +
        `Installation. This proof never overwrites or deletes generated output it did not create — remove that ` +
        `output (or the process holding it) and run again.`,
    );
  }

  const assets = path.join(directory, "assets");
  await harness.mkdir(assets, { recursive: true });
  // CLAIMED only once the directory is this scenario's: from here on cleanup owns exactly this path.
  owned.push(directory);

  for (const { from, to } of multiHubNamespacePlan(installation.root, member.segment)) {
    const target = path.join(assets, to);
    if (existsSync(target)) {
      throw new Error(
        `the generated file "${target}" already exists inside the namespace this scenario just created — ` +
          `refusing to overwrite it.`,
      );
    }
    harness.cpSync(from, target, { recursive: false });
  }
}

/** Removes exactly the namespaces this scenario CREATED — never a directory it found already present. */
function removeNamespaces(harness, owned) {
  for (const directory of owned) {
    harness.rmSync(directory, { recursive: true, force: true });
  }
  owned.length = 0;
}

/** Waits until the dev server answers ANYTHING (a dev server compiles on the first request). */
async function waitForAnyResponse(server, port, timeoutMs = 240000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    // A server that has already EXITED cannot become ready — Next 16 refuses a second `next dev` for one
    // project directory, and waiting the whole budget for a dead process produces a stall with no cause.
    if (server !== null && server.proc.exitCode !== null && server.proc.exitCode !== undefined) return false;
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
 * Starts ONE dev server for ONE Installation, trying the next port when one is already taken.
 *
 * PLATFORM IDENTITY (§4E) is published only where it belongs: the hosting platform's OWN build variables
 * (`VERCEL_URL`, `VERCEL_BRANCH_URL`) are exactly what a Vercel build is given, and the dev server INHERITS
 * this process's environment — so the inspection proof exercises the production mechanism rather than a
 * test-only switch. An Installation that does NOT nominate an inspection member must be served WITHOUT them:
 * an identified Installation that is handed platform hostnames but names no member for them is REFUSED at
 * build time (§8.4 — there is no default Hub and no default Spoke), which is correct behaviour and not a
 * hostname proof.
 *
 * A failed attempt is STOPPED and its own output reported, so a server that refuses to start is diagnosed
 * from what it said — never waited out, and never left running for the next attempt (or scenario) to trip on.
 */
async function startServer(harness, installation, offsets, { platformIdentity = true } = {}) {
  const failures = [];
  if (platformIdentity) {
    process.env["VERCEL_URL"] = MULTI_HUB_INSPECTION.hostname;
    process.env["VERCEL_BRANCH_URL"] = MULTI_HUB_INSPECTION.branchHostname;
  } else {
    delete process.env["VERCEL_URL"];
    delete process.env["VERCEL_BRANCH_URL"];
  }

  for (const offset of offsets) {
    const port = harness.basePort + offset;
    const server = harness.startDevServer(port, { deploymentRoot: installation.root });
    if (await waitForAnyResponse(server, port)) return { server, port };
    failures.push(`:${port} => ${server.log().slice(-300) || "(no output)"}`);
    await harness.stopServer(server);
  }
  throw new Error(
    `no port answered among ${offsets.map((o) => harness.basePort + o).join(", ")} — ${failures.join(" || ")}`,
  );
}

// ── §4A — THE REPEATED LOCAL ID: TWO SPOKES CALLED `docs`, AT THE SAME PUBLIC PATHNAME ───────────────────

/**
 * THE SAME PUBLIC PATHNAME, THREE MEMBERS: A/B/B/A/B/A, then the cross-Hub refusals.
 *
 * Hub one's `docs` and Hub two's `docs` are DIFFERENT Spokes with the SAME local id, and every assertion reads
 * the RENDERED document — never an internal API. The alternation is the point: shared state keyed by anything
 * less than the composite identity shows up here as a member rendering another member's facts.
 */
async function runRepeatedIdProof(harness, rows, port, installation) {
  const [oneDocs, oneNews, twoDocs] = installation.spokes;
  const get = (member, pathname) => requestWithHost(port, hostOf(member, port), pathname);

  const firstOne = await get(oneDocs, "/ww/en/about");
  const firstTwo = await get(twoDocs, "/ww/en/about");
  const news = await get(oneNews, "/ww/en/about");
  const secondTwo = await get(twoDocs, "/ww/en/about");
  const secondOne = await get(oneDocs, "/ww/en/about");
  const thirdOne = await get(oneDocs, "/ww/en/about");

  harness.check(
    rows,
    "one/docs and two/docs BOTH serve the SAME public pathname (200 each)",
    firstOne.status === 200 && firstTwo.status === 200,
    `one=${firstOne.status} two=${firstTwo.status}`,
  );

  for (const [member, response, label] of [
    [oneDocs, firstOne, "one/docs"],
    [oneNews, news, "one/news"],
    [twoDocs, firstTwo, "two/docs"],
  ]) {
    const facts = factsOf(member);
    const checks = [
      ["renders its OWN site identity", response.body.includes(facts.siteName)],
      ["renders its OWN authored page content", response.body.includes(facts.content)],
      ["renders its OWN dictionary wording", response.body.includes(facts.wording)],
      ["canonicalizes to its OWN origin", response.body.includes(facts.origin)],
      ["names its OWN composite asset namespace", response.body.includes(`/spokes/${facts.segment}/assets/`)],
      ["leaks no internal prefix into ANY URL", !anyUrlContains(response.body, RETIRED_INTERNAL_PREFIX)],
    ];
    for (const [name, ok] of checks) harness.check(rows, `${label}: ${name}`, ok, "");

    // …and NOTHING of either other member's, on either side the Hub boundary: its identity, its page text,
    // its dictionary wording and its artwork namespace. (A SAME-Hub sibling's ORIGIN may appear — the Hub's
    // own switcher names it — so the origin is judged below, by Hub.)
    for (const other of installation.spokes.filter((candidate) => candidate !== member)) {
      const otherFacts = factsOf(other);
      const foreign = [
        ["site identity", otherFacts.siteName],
        ["page content", otherFacts.content],
        ["dictionary wording", otherFacts.wording],
        ["asset namespace", `/spokes/${otherFacts.segment}/assets/`],
      ];
      for (const [what, text] of foreign) {
        harness.check(
          rows,
          `${label}: never shows ${other.hubId}/${other.id}'s ${what}`,
          !response.body.includes(text),
          text,
        );
      }
      // ANOTHER HUB's authored origin is never named here — the membership boundary is the Hub.
      if (other.hubId !== member.hubId) {
        harness.check(
          rows,
          `${label}: never names ${other.hubId}/${other.id}'s authored origin (a DIFFERENT Hub)`,
          !response.body.includes(otherFacts.origin),
          otherFacts.origin,
        );
      }
    }
  }

  // A/B/B/A/B/A — every member is STABLE under alternation, and no two are the same page.
  harness.check(
    rows,
    "A/B/B/A/B/A: one/docs is byte-stable across its three requests",
    fingerprint(firstOne.body) === fingerprint(secondOne.body) &&
      fingerprint(firstOne.body) === fingerprint(thirdOne.body),
    `first=${JSON.stringify(fingerprint(firstOne.body))} second=${JSON.stringify(fingerprint(secondOne.body))}`,
  );
  harness.check(
    rows,
    "A/B/B/A/B/A: two/docs is byte-stable across its two requests",
    fingerprint(firstTwo.body) === fingerprint(secondTwo.body),
    `first=${JSON.stringify(fingerprint(firstTwo.body))} second=${JSON.stringify(fingerprint(secondTwo.body))}`,
  );
  harness.check(
    rows,
    "the SAME LOCAL ID `docs` renders TWO DIFFERENT pages",
    fingerprint(firstOne.body) !== fingerprint(firstTwo.body),
    "the same public pathname and the same local id must resolve to different contexts",
  );
  harness.check(
    rows,
    "…and neither `docs` page is one/news's page",
    fingerprint(firstOne.body) !== fingerprint(news.body) && fingerprint(firstTwo.body) !== fingerprint(news.body),
    "",
  );

  // ── the retired internal namespace is refused directly, on both the owning and the foreign host ──────
  const directOwn = await get(oneDocs, `${RETIRED_INTERNAL_PREFIX}/${oneDocs.segment}/ww/en/about`);
  const directForeign = await get(oneDocs, `${RETIRED_INTERNAL_PREFIX}/${twoDocs.segment}/ww/en/about`);
  harness.check(
    rows,
    "a DIRECT retired internal request on its own host is refused (404)",
    directOwn.status === 404,
    `status=${directOwn.status}`,
  );
  harness.check(
    rows,
    "a DIRECT retired internal request naming ANOTHER Hub's Spoke is refused (404)",
    directForeign.status === 404,
    `status=${directForeign.status}`,
  );
  harness.check(
    rows,
    "the refusal is not a redirect to any Spoke",
    (directOwn.headers.location ?? "") === "",
    `location=${directOwn.headers.location ?? "(none)"}`,
  );
}

// ── §4B — RUNTIME ARTWORK: EACH MEMBER'S OWN NAMESPACE, AND THE SHARED PLATFORM ONE ──────────────────────

/**
 * THE ARTWORK A MEMBER OWNS, AND THE ARTWORK THE PLATFORM OWNS.
 *
 * Each member's replaceable role artwork and its own brand mark are mirrored into its OWN composite namespace,
 * so the HOST decides which of them a request may reach: its own is served, another member's is refused —
 * including the OTHER Hub's Spoke with the same local id, which is the case a local-id-keyed namespace would
 * get wrong. The shared platform namespace stays available on every host.
 */
async function runAssetProof(harness, rows, port, installation) {
  const [oneDocs, oneNews, twoDocs] = installation.spokes;
  const get = (member, pathname) => requestWithHost(port, hostOf(member, port), pathname);

  for (const member of installation.spokes) {
    const identity = multiHubNamespaceIdentity(installation.root, member.segment);
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its OWN namespace is the composite one`,
      identity.urlBase === `/spokes/${member.segment}/assets`,
      identity.urlBase,
    );

    const ownMark = await get(member, `${identity.urlBase}/${member.mark}`);
    const ownFavicon = await get(member, `${identity.urlBase}/favicon.svg`);
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its OWN brand mark is served on its own host (200)`,
      ownMark.status === 200 && ownMark.bytes.length > 0,
      `status=${ownMark.status} bytes=${ownMark.bytes.length}`,
    );
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its OWN replaceable role artwork is served on its own host (200)`,
      ownFavicon.status === 200 && ownFavicon.bytes.length > 0,
      `status=${ownFavicon.status} bytes=${ownFavicon.bytes.length}`,
    );

    // The PLATFORM namespace is shared: the same icon library is available on every host.
    const platform = await get(member, "/assets/icon-home.svg");
    harness.check(
      rows,
      `${member.hubId}/${member.id}: the shared PLATFORM artwork is available (200)`,
      platform.status === 200,
      `status=${platform.status}`,
    );

    // …and EVERY OTHER member's namespace is refused on this host, composite segment and all.
    for (const other of installation.spokes.filter((candidate) => candidate !== member)) {
      const foreign = await get(member, `/spokes/${other.segment}/assets/${other.mark}`);
      harness.check(
        rows,
        `${member.hubId}/${member.id}: ${other.hubId}/${other.id}'s asset is REFUSED on this host`,
        foreign.status === 404,
        `status=${foreign.status} url=/spokes/${other.segment}/assets/${other.mark}`,
      );
    }

    // The two `docs` members' asset URLs are provably DIFFERENT addresses.
    if (member.segment === "hub+one+docs" || member.segment === "hub+two+docs") {
      harness.check(
        rows,
        `${member.hubId}/${member.id}: its composite asset URL is unique in the Installation`,
        installation.spokes.filter((candidate) => candidate.segment === member.segment).length === 1,
        `segment=${member.segment}`,
      );
    }
  }

  // The other Hub's `docs` URL, spelled in full, refused on Hub one's host — the repeated-id case, named.
  const crossed = await get(oneDocs, `/spokes/${twoDocs.segment}/assets/${twoDocs.mark}`);
  harness.check(
    rows,
    "Hub one's host REFUSES Hub two's docs asset (the repeated local id cannot be reached by id)",
    crossed.status === 404,
    `status=${crossed.status}`,
  );
  harness.check(
    rows,
    "…while Hub one's own docs asset is served there",
    (await get(oneDocs, `/spokes/${oneDocs.segment}/assets/${oneDocs.mark}`)).status === 200,
    "",
  );
  harness.check(
    rows,
    "…and Hub one's news asset is served on ITS own host",
    (await get(oneNews, `/spokes/${oneNews.segment}/assets/${oneNews.mark}`)).status === 200,
    "",
  );
}

// ── §4C — THE HUB-SCOPED SWITCHER: ONLY THE RENDERING SPOKE'S OWN HUB'S MEMBERS ──────────────────────────

/** The switcher the SERVER rendered: its options, in the order the document states them. */
function switcherIn(html) {
  const select = /<select[^>]*data-switcher="spoke"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  if (select === null) return null;
  const options = [...select[1].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((match) => ({
    value: match[1],
    label: match[2].trim(),
  }));
  return { options, markup: select[0] };
}

/**
 * THE HUB-SCOPED SWITCHER, SERVER-RENDERED AND IN THE BROWSER.
 *
 * Hub one AUTHORS a switcher offering ITS OWN two members; Hub two authors none. So Hub one's members must
 * present exactly those two options, in the authored order, with the authored labels; Hub two's member must
 * present NO switcher at all — never another Hub's list, and never an Installation-wide merge.
 *
 * The client behaviour is measured in the BROWSER (see `runBrowserProof`): the real handler runs and Chrome's
 * own `Page.frameRequestedNavigation` reports the destination it asked for.
 */
async function runSwitcherProof(harness, rows, port, installation) {
  const [oneDocs, oneNews, twoDocs] = installation.spokes;
  const get = (member, pathname) => requestWithHost(port, hostOf(member, port), pathname);
  const authored = ["docs", "news"];

  for (const member of [oneDocs, oneNews]) {
    const page = await get(member, "/ww/en/about");
    const switcher = switcherIn(page.body);
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its Hub's switcher is PRESENT`,
      switcher !== null,
      switcher === null ? "no [data-switcher=\"spoke\"] in the document" : "",
    );
    harness.check(
      rows,
      `${member.hubId}/${member.id}: the switcher offers EXACTLY its Hub's members, in authored order`,
      switcher !== null && switcher.options.map((option) => option.value).join(",") === authored.join(","),
      switcher === null ? "(none)" : switcher.options.map((option) => option.value).join(","),
    );
    harness.check(
      rows,
      `${member.hubId}/${member.id}: the authored LABELS are preserved`,
      switcher !== null &&
        switcher.options.map((option) => option.label).join("|") === "One Docs|One News",
      switcher === null ? "(none)" : switcher.options.map((option) => option.label).join("|"),
    );
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its OWN member is the selected option`,
      switcher !== null && new RegExp(`<option[^>]*value="${member.id}"[^>]*selected`).test(switcher.markup),
      "the control must present the request's own member as current",
    );
    // Hub TWO's `docs` is not offered: its label belongs to no option of Hub one's list.
    harness.check(
      rows,
      `${member.hubId}/${member.id}: Hub two's member is NOT offered`,
      switcher !== null && switcher.options.every((option) => !option.label.includes("Two Docs")),
      "",
    );
    // …and the control is NAMED by THIS member's own locale, so it is never anonymous.
    harness.check(
      rows,
      `${member.hubId}/${member.id}: the control carries its OWN dictionary's accessible name`,
      switcher !== null && switcher.markup.includes(`aria-label="Sections of ${factsOf(member).siteName}"`),
      switcher === null ? "(none)" : (/(aria-label="[^"]*")/.exec(switcher.markup)?.[1] ?? "(no aria-label)"),
    );
  }

  // Each option's destination must ROUTE BACK to the member it names — the authored origins, on this server.
  const destinations = [
    [oneDocs, "hub-one-docs.localhost", oneDocs.id],
    [oneNews, "hub-one-news.localhost", oneNews.id],
  ];
  for (const [declared, hostname, expectedId] of destinations) {
    const destination = await requestWithHost(port, `${hostname}:${port}`, "/ww/en/about");
    harness.check(
      rows,
      `the switcher option naming ${declared.hubId}/${expectedId} routes to THAT member`,
      destination.status === 200 && destination.body.includes(factsOf(declared).siteName),
      `status=${destination.status}`,
    );
  }

  // …and Hub two authors none, so its member (and only it) presents no switcher.
  const twoPage = await get(twoDocs, "/ww/en/about");
  harness.check(
    rows,
    "two/docs: its Hub declares NO switcher, so none is rendered",
    switcherIn(twoPage.body) === null,
    switcherIn(twoPage.body) === null ? "" : "a switcher was rendered for a Hub that authors none",
  );
  harness.check(
    rows,
    "one/docs and two/docs disagree about the switcher — the list is the HUB's, not the Spoke's",
    switcherIn((await get(oneDocs, "/ww/en/about")).body) !== null && switcherIn(twoPage.body) === null,
    "",
  );
}

// ── §4D — HOSTNAME AND REQUEST-BOUNDARY REFUSALS ─────────────────────────────────────────────────────────

/**
 * WHAT MUST FAIL CLOSED, ON THE RUNNING SERVER.
 *
 * Recognition is EXACT equality against the members' claims: an unknown host, a subdomain nobody claimed, a
 * claimed host used as a SUFFIX of another host, and an unclaimed host's bare ROOT all answer 404 — never a
 * default Spoke, never a redirect. A request that SPOOFS the private selection header cannot select a foreign
 * member either: the boundary derives the selection from the HOST, and the header it reads is its own.
 */
async function runRefusalProof(harness, rows, port, installation) {
  const [oneDocs, oneNews, twoDocs] = installation.spokes;
  const get = (host, pathname, headers) => requestWithHost(port, host, pathname, headers);

  const refused = [
    ["an UNCLAIMED hostname", "unknown.localhost"],
    ["a SUBDOMAIN no Spoke claimed", "sub.hub-one-docs.localhost"],
    ["a claimed host used as a SUFFIX", "hub-one-docs.localhost.attacker.example"],
    ["a LOOKALIKE of another Hub's host", "hub-two-docs.localhost.attacker.example"],
    ["a host that merely contains a claim", "hub-one-docs.localhost.evil.test"],
  ];
  for (const [label, host] of refused) {
    const page = await get(host, "/ww/en/about");
    harness.check(rows, `${label} fails closed (404): ${host}`, page.status === 404, `status=${page.status}`);
    harness.check(
      rows,
      `${label}: answered by NO member's content`,
      ![oneDocs, oneNews, twoDocs].some((member) => page.body.includes(member.siteName)),
      "",
    );
    harness.check(
      rows,
      `${label}: not redirected to a default member`,
      (page.headers.location ?? "") === "",
      `location=${page.headers.location ?? "(none)"}`,
    );
  }
  const unknownRoot = await get("unknown.localhost", "/");
  harness.check(
    rows,
    "even an unclaimed host's ROOT is refused (no default Spoke)",
    unknownRoot.status === 404,
    `status=${unknownRoot.status}`,
  );

  // ── the private selection header is NOT the visitor's to set ─────────────────────────────────────────
  const spoofed = await get(hostOf(oneDocs, port), "/ww/en/about", {
    "x-foundation-spoke-segment": twoDocs.segment,
  });
  harness.check(
    rows,
    "a SPOOFED private selection header cannot select Hub two's docs on Hub one's host",
    spoofed.status === 200 && spoofed.body.includes(factsOf(oneDocs).siteName) &&
      !spoofed.body.includes(factsOf(twoDocs).siteName),
    `status=${spoofed.status}`,
  );
  harness.check(
    rows,
    "…and the spoofed request never names the foreign asset namespace",
    !spoofed.body.includes(`/spokes/${twoDocs.segment}/assets/`),
    "",
  );
  const spoofedOnUnknown = await get("unknown.localhost", "/ww/en/about", {
    "x-foundation-spoke-segment": twoDocs.segment,
  });
  harness.check(
    rows,
    "a spoofed header on an UNCLAIMED host is still refused (404)",
    spoofedOnUnknown.status === 404,
    `status=${spoofedOnUnknown.status}`,
  );

  // ── one Hub's host cannot serve another Hub's page ───────────────────────────────────────────────────
  for (const [owner, foreign] of [
    [oneDocs, twoDocs],
    [twoDocs, oneDocs],
    [oneDocs, oneNews],
  ]) {
    const page = await get(hostOf(owner, port), "/ww/en/about");
    harness.check(
      rows,
      `${owner.hubId}/${owner.id}'s host serves ONLY its own page (never ${foreign.hubId}/${foreign.id})`,
      !page.body.includes(factsOf(foreign).siteName) && !page.body.includes(factsOf(foreign).content),
      "",
    );
  }

  // ── a Hub's own ROOT completes inside its own member, and never leaves it ────────────────────────────
  for (const member of installation.spokes) {
    const root = await get(hostOf(member, port), "/");
    const location = root.headers.location ?? "";
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its ROOT completes with a PUBLIC redirect, never a 404`,
      root.status === 307 || root.status === 302,
      `status=${root.status}`,
    );
    harness.check(
      rows,
      `${member.hubId}/${member.id}: that redirect carries no internal prefix`,
      location.startsWith("/") && !location.includes(RETIRED_INTERNAL_PREFIX),
      `location=${location}`,
    );
    const completed = await get(hostOf(member, port), location === "" ? "/ww/en" : location);
    harness.check(
      rows,
      `${member.hubId}/${member.id}: the completed ROOT renders ITS OWN chrome`,
      completed.status === 200 && completed.body.includes(factsOf(member).siteName),
      `status=${completed.status}`,
    );
  }
}

// ── §4E — INSPECTION: EXACTLY HUB TWO'S `docs`, AND CANONICAL TO ITS OWN ORIGIN ──────────────────────────

/**
 * THE INSPECTION POLICY (the composite nomination), IN EVERY SURFACE IT HAS.
 *
 * An Installation-scoped policy nominates ONE member by BOTH halves of its identity, and a `docs` local id
 * alone would have named a Spoke in either Hub. The nominated member's pages must therefore render on:
 *
 *   · the authored alias this Installation declares (`inspectionHosts`);
 *   · the platform's unique-deployment URL for this build (`VERCEL_URL`);
 *   · the platform's branch URL (`VERCEL_BRANCH_URL`).
 *
 * Its metadata must stay canonical to that member's OWN authored origin — a viewing surface is never an
 * origin — and every OTHER platform-shaped hostname must stay refused: recognition is exact equality against
 * what the Installation authored or the platform reported, never a `*.vercel.app` suffix rule.
 */
async function runInspectionProof(harness, rows, port, installation) {
  const [oneDocs, , twoDocs] = installation.spokes;
  const get = (host, pathname) => requestWithHost(port, host, pathname);
  const nominated = factsOf(twoDocs);

  const surfaces = [
    ["the AUTHORED inspection alias", MULTI_HUB_INSPECTION.hostnames[0]],
    ["the platform's unique-deployment URL", MULTI_HUB_INSPECTION.hostname],
    ["the platform's branch URL", MULTI_HUB_INSPECTION.branchHostname],
  ];

  for (const [label, host] of surfaces) {
    const root = await get(host, "/");
    const about = await get(host, "/ww/en/about");
    const again = await get(host, "/ww/en/about");

    harness.check(
      rows,
      `${label}: selects Hub two's docs — the COMPOSITE nomination, not the first Hub`,
      about.status === 200 && about.body.includes(nominated.siteName) && about.body.includes(nominated.content),
      `status=${about.status}`,
    );
    harness.check(
      rows,
      `${label}: never the same-local-id Spoke from Hub one`,
      !about.body.includes(factsOf(oneDocs).siteName) && !about.body.includes(factsOf(oneDocs).content),
      "",
    );
    harness.check(
      rows,
      `${label}: renders THAT member's own composite asset namespace`,
      about.body.includes(`/spokes/${nominated.segment}/assets/`) &&
        !about.body.includes(`/spokes/${factsOf(oneDocs).segment}/assets/`),
      "",
    );
    harness.check(
      rows,
      `${label}: metadata stays canonical to the Spoke's OWN authored origin`,
      about.body.includes(nominated.origin) && !anyUrlContains(about.body, host),
      `host=${host}`,
    );
    harness.check(
      rows,
      `${label}: the ROOT completes inside that member (a public path, never a 404)`,
      (root.status === 307 || root.status === 302) && (root.headers.location ?? "").startsWith("/ww/"),
      `status=${root.status} location=${root.headers.location ?? "(none)"}`,
    );
    harness.check(
      rows,
      `${label}: V/A/V — the same request twice is the same page`,
      fingerprint(about.body) === fingerprint(again.body),
      "",
    );
  }

  // Recognised hostnames ONLY: a platform-shaped name that was never reported is not a claim.
  const unrecognised = [
    "some-other-project.vercel.app",
    "unrelated-team.vercel.app",
    `${MULTI_HUB_INSPECTION.branchHostname}.evil.test`,
    "inspect.localhost.evil.test",
    "sub.inspect.localhost",
  ];
  for (const host of unrecognised) {
    const answer = await get(host, "/ww/en/about");
    harness.check(
      rows,
      `an unrecognised inspection-shaped host is refused (404): ${host}`,
      answer.status === 404,
      `status=${answer.status}`,
    );
  }
}

// ── §4F — PER-HOST METADATA AND PUBLIC URLS ──────────────────────────────────────────────────────────────

/**
 * THE METADATA SURFACES OF THE SAME PUBLIC PATHNAME, EACH ANSWERED BY THE MEMBER ITS OWN HOST SELECTED.
 *
 * The sitemap must carry the member's OWN origin and its OWN authored route, and no other member's host or
 * route; the `robots.txt` must advertise that same host's sitemap; the rendered page's canonical must be its
 * own origin plus the public pathname; and no public URL may carry the retired internal prefix on any host.
 */
async function runMetadataProof(harness, rows, port, installation) {
  const get = (member, pathname) => requestWithHost(port, hostOf(member, port), pathname);

  for (const member of installation.spokes) {
    const facts = factsOf(member);
    const sitemap = await get(member, "/sitemap.xml");
    const robots = await get(member, "/robots.txt");
    const page = await get(member, "/ww/en/about");

    harness.check(
      rows,
      `${member.hubId}/${member.id}: its sitemap is served and uses its OWN origin`,
      sitemap.status === 200 && sitemap.body.includes(`${facts.origin}/ww/en`),
      `status=${sitemap.status}`,
    );
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its sitemap carries the route ONLY it authors`,
      sitemap.body.includes(`${facts.origin}/ww/en/${facts.onlyRoute}`),
      "",
    );
    for (const other of installation.spokes.filter((candidate) => candidate !== member)) {
      harness.check(
        rows,
        `${member.hubId}/${member.id}: its sitemap contains NO ${other.hubId}/${other.id} URL`,
        !sitemap.body.includes(other.hostname) && !sitemap.body.includes(other.onlyRoute),
        "",
      );
    }
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its robots.txt advertises ITS OWN sitemap`,
      robots.status === 200 && robots.body.includes(`${facts.origin}/sitemap.xml`),
      robots.body.trim().slice(0, 160),
    );
    harness.check(
      rows,
      `${member.hubId}/${member.id}: no public URL carries the retired internal prefix`,
      !anyUrlContains(page.body, RETIRED_INTERNAL_PREFIX) && !sitemap.body.includes(RETIRED_INTERNAL_PREFIX),
      "",
    );

    const canonical = /rel="canonical" href="([^"]+)"/.exec(page.body)?.[1] ?? "";
    harness.check(
      rows,
      `${member.hubId}/${member.id}: its canonical URL is its OWN origin plus the public pathname`,
      canonical === `${facts.origin}/ww/en/about`,
      `canonical=${canonical || "(none)"}`,
    );
    const alternates = [...page.body.matchAll(/rel="alternate"[^>]*hreflang="([^"]*)"[^>]*href="([^"]*)"/g)];
    harness.check(
      rows,
      `${member.hubId}/${member.id}: every alternate-language URL is this host's OWN origin`,
      alternates.every((pair) => pair[2].startsWith(facts.origin)),
      alternates.map((pair) => pair[2]).join(" ") || "(none)",
    );
  }
}

// ── §4A/§4B/§4C/§4D — THE SAME FACTS IN A REAL BROWSER ───────────────────────────────────────────────────

/**
 * Every rendered `<img>` of one document, and whether each one LOADED (no broken image), plus the facts a
 * browser alone can report: the address bar, the rendered text, every URL-bearing attribute and the switcher.
 *
 * IMAGE STATE IS NEVER ASSUMED (M3-R §3A). An image is counted as LOADED only when it is `complete` AND has
 * `naturalWidth > 0`; an image that has not finished is reported as `pending` separately, so "not loaded yet"
 * can never be mistaken for "loaded successfully". `settleImages` waits for the browser to finish — including
 * the lazy-loading a visitor's scroll triggers — before any of that is judged.
 *
 * `text` is the RENDERED text (`innerText`), so it omits what a visitor cannot see — including the RSC flight
 * payload in inline `<script>` tags, which carries page DATA rather than anything DISPLAYED. A cross-member
 * leak in that payload is therefore not mistaken for a leak on the page, and `html` is still read where a
 * leaked URL would have to appear.
 */
const IMAGE_PROBE = `(() => {
  const images = [...document.querySelectorAll("img")];
  return {
    images: {
      count: images.length,
      pending: images.filter((image) => !image.complete).map((image) => image.getAttribute("src") || ""),
      broken: images.filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.getAttribute("src") || ""),
      loaded: images.filter((image) => image.complete && image.naturalWidth > 0).length,
      sources: [...new Set(images.map((image) => image.getAttribute("src") || ""))],
    },
    path: location.pathname,
    host: location.host,
    // RENDERED text only — see the note above this probe.
    text: document.body ? (document.body.innerText || document.body.textContent || "") : "",
    html: document.documentElement ? document.documentElement.outerHTML : "",
    switcher: (() => {
      const select = document.querySelector('[data-switcher="spoke"]');
      return select ? { value: select.value, ariaLabel: select.getAttribute("aria-label"), options: [...select.options].map((option) => ({ value: option.value, label: option.textContent.trim() })) } : null;
    })(),
  };
})()`;

/**
 * Select one member in the rendered switcher, exactly as a visitor does.
 *
 * React tracks a select node's `value` property, so a plain assignment never reaches its handler; the NATIVE
 * setter reproduces what a real selection does, and the bubbling `change` event then reaches React exactly as
 * a real one does. The DESTINATION is read from the browser's own navigation event, never from a stub.
 */
function selectMember(value) {
  return `(() => {
    const select = document.querySelector('[data-switcher="spoke"]');
    if (!select) return { ok: false, reason: 'no switcher rendered' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`;
}

/** Waits until the browser's document says what this member authored. */
async function awaitMember(cdp, member, timeoutMs = 60000) {
  const end = Date.now() + timeoutMs;
  let observed = null;
  while (Date.now() < end) {
    observed = await cdp.evaluate(IMAGE_PROBE);
    if (observed !== null && observed.text.includes(member.aboutBody)) return observed;
    await sleep(400);
  }
  return observed;
}

/**
 * WAITS FOR THE BROWSER TO FINISH LOADING, THEN REPORTS WHAT THE PAGE ACTUALLY HOLDS (M3-R §3A).
 *
 * Legitimate LAZY LOADING means some images legitimately have not STARTED when the document is first painted,
 * so the page is scrolled through — exactly what a visitor does — and each image that is deferred is only
 * requested then. The loop then waits (bounded) until NOTHING is pending, and the result is read once: the
 * `pending` list it reports is the honest answer for images the browser never finished within that budget, so
 * an unfinished image FAILS the load assertions rather than passing them by default.
 */
async function settleImages(cdp, timeoutMs = 45000) {
  const scroll = `(() => {
    const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y <= document.body.scrollHeight; y += step) window.scrollTo(0, y);
    window.scrollTo(0, 0);
    return document.querySelectorAll("img").length;
  })()`;
  await cdp.evaluate(scroll);

  const end = Date.now() + timeoutMs;
  let observed = await cdp.evaluate(IMAGE_PROBE);
  while (Date.now() < end && observed !== null && observed.images.pending.length > 0) {
    await sleep(500);
    observed = await cdp.evaluate(IMAGE_PROBE);
  }
  return observed;
}

/**
 * ONE REAL BROWSER, EVERY MEMBER, AND THE FACTS ONLY A BROWSER CAN REPORT.
 *
 * Each member is visited at its OWN hostname (Chrome resolves `*.localhost` to loopback itself, so the
 * navigation exercises the same dispatch the HTTP proof does), and the browser then reports the ADDRESS BAR,
 * the rendered text and — for the artwork — whether each `<img>` actually LOADED.
 */
async function runBrowserProof(harness, rows, chrome, port, installation) {
  const cdp = await Cdp.connect(chrome);
  try {
    for (const member of installation.spokes) {
      const facts = factsOf(member);
      await cdp.navigate(`http://${member.hostname}:${port}/ww/en/about`);
      const arrived = await awaitMember(cdp, member);
      const observed = (await settleImages(cdp)) ?? arrived;

      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: the document renders THIS member's content`,
        observed !== null && observed.text.includes(facts.siteName) && observed.text.includes(facts.content),
        observed === null ? "(no observation)" : observed.text.slice(0, 120),
      );
      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: the browser KEEPS the public pathname`,
        observed !== null && observed.path === "/ww/en/about" && observed.host.startsWith(member.hostname),
        observed === null ? "(no observation)" : `${observed.host}${observed.path}`,
      );
      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: no internal prefix appears in any URL`,
        observed !== null &&
          !new RegExp(`\\b(?:href|src)="[^"]*${RETIRED_INTERNAL_PREFIX}`).test(observed.html ?? ""),
        "",
      );
      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: the page presents a nonzero image inventory`,
        observed !== null && observed.images.count > 0,
        observed === null ? "(no observation)" : `images=${observed.images.count}`,
      );
      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: NO image is still pending after the browser settles`,
        observed !== null && observed.images.pending.length === 0,
        observed === null ? "(no observation)" : `pending=${observed.images.pending.join(",") || "(none)"}`,
      );
      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: EVERY rendered image LOADED (complete and naturalWidth > 0)`,
        observed !== null && observed.images.loaded === observed.images.count && observed.images.broken.length === 0,
        observed === null
          ? "(no observation)"
          : `loaded=${observed.images.loaded}/${observed.images.count} broken=${observed.images.broken.join(",") || "(none)"}`,
      );
      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: the images come from DECLARED namespaces only`,
        observed !== null &&
          observed.images.sources.every(
            (src) => src.startsWith(`/spokes/${facts.segment}/assets/`) || src.startsWith("/assets/"),
          ),
        observed === null ? "(no observation)" : observed.images.sources.join(" "),
      );
      harness.check(
        rows,
        `BROWSER ${member.hubId}/${member.id}: it never displays another member's content`,
        observed !== null &&
          installation.spokes
            .filter((candidate) => candidate !== member)
            .every((candidate) => !observed.text.includes(factsOf(candidate).aboutBody)),
        observed === null
          ? "(no observation)"
          : installation.spokes
              .filter((candidate) => candidate !== member)
              .filter((candidate) => observed.text.includes(factsOf(candidate).aboutBody))
              .map((candidate) => `${candidate.hubId}/${candidate.id}`)
              .join(",") || "(none)",
      );

      await runSwitcherBrowserProof(harness, rows, cdp, port, installation, member, observed, facts);
    }

    await runSoftNavigationProof(harness, rows, cdp, port, installation);
  } finally {
    await cdp.close();
  }
}

/**
 * THE SWITCHER, AS THE BROWSER PRESENTS AND OPERATES IT (§4C).
 *
 * On a Hub that AUTHORS a list: the control is present, shows the request's own member as current, offers
 * exactly that Hub's members in authored order, navigates NOWHERE when the current member is re-selected, and
 * requests the SIBLING's own origin when the sibling is selected — read from the browser's own navigation
 * event, never from a stub — after which that destination is visited and must render the member it names.
 *
 * On a Hub that authors none: no control is rendered at all.
 */
async function runSwitcherBrowserProof(harness, rows, cdp, port, installation, member, observed, facts) {
  if (member.hubId !== "one") {
    harness.check(
      rows,
      `BROWSER ${member.hubId}/${member.id}: its Hub authors NO switcher, so none is rendered`,
      observed !== null && observed.switcher === null,
      observed === null ? "(no observation)" : JSON.stringify(observed.switcher),
    );
    return;
  }

  harness.check(
    rows,
    `BROWSER ${member.hubId}/${member.id}: its Hub's switcher offers ITS OWN members and shows it as current`,
    observed !== null &&
      observed.switcher !== null &&
      observed.switcher.options.map((option) => option.label).join("|") === "One Docs|One News" &&
      observed.switcher.value === member.id,
    observed === null || observed.switcher === null
      ? "(no switcher)"
      : `${observed.switcher.value}: ${observed.switcher.options.map((option) => option.label).join("|")}`,
  );
  harness.check(
    rows,
    `BROWSER ${member.hubId}/${member.id}: the control is NAMED by THIS member's own dictionary label`,
    observed !== null &&
      observed.switcher !== null &&
      observed.switcher.ariaLabel === `Sections of ${facts.siteName}`,
    observed === null || observed.switcher === null ? "(no switcher)" : `aria-label=${observed.switcher.ariaLabel}`,
  );

  // Selecting the CURRENT member is a NO-OP: nothing navigates, and the page is still the same page.
  const noOpWatch = watchRequestedNavigation(cdp);
  await cdp.evaluate(selectMember(member.id));
  const noOpTarget = await noOpWatch;
  const afterNoOp = await cdp.evaluate(IMAGE_PROBE);
  harness.check(
    rows,
    `BROWSER ${member.hubId}/${member.id}: selecting the CURRENT member navigates NOWHERE`,
    noOpTarget === null &&
      afterNoOp !== null &&
      afterNoOp.path === "/ww/en/about" &&
      afterNoOp.text.includes(facts.content),
    `requested=${noOpTarget ?? "(nothing)"}`,
  );

  // Selecting a SIBLING performs the platform's REAL navigation, to the origin that option authored. It is an
  // absolute HTTPS origin while this proof runs over local HTTP, so the request cannot COMMIT — the browser's
  // own navigation event is the evidence, and the destination is then visited to prove which member answers.
  const sibling = installation.spokes.find((candidate) => candidate.hubId === member.hubId && candidate.id !== member.id);
  const watch = watchRequestedNavigation(cdp);
  await cdp.evaluate(selectMember(sibling.id));
  const target = await watch;
  harness.check(
    rows,
    `BROWSER ${member.hubId}/${member.id}: selecting its sibling '${sibling.id}' requests THAT member's OWN origin`,
    typeof target === "string" && target.startsWith(sibling.canonicalOrigin),
    `requested=${target ?? "(nothing)"}`,
  );

  await cdp.navigate(`http://${sibling.hostname}:${port}/ww/en/about`);
  const arrived = await awaitMember(cdp, sibling);
  harness.check(
    rows,
    `BROWSER: the switcher's destination renders the member it names (${sibling.hubId}/${sibling.id})`,
    arrived !== null &&
      arrived.text.includes(factsOf(sibling).siteName) &&
      arrived.text.includes(factsOf(sibling).content),
    arrived === null ? "(no observation)" : arrived.text.slice(0, 120),
  );
}

/** The browser's OWN navigation event, armed before the interaction it must observe. */
function watchRequestedNavigation(cdp, timeoutMs = 2500) {
  return cdp
    .waitEvent("Page.frameRequestedNavigation", timeoutMs)
    .then((event) => event?.url ?? null)
    .catch(() => null);
}

/**
 * A PUBLIC LINK CLICK IS A CLIENT TRANSITION, AND IT COMMITS ON THE PUBLIC PATHNAME (§4A/§4C).
 *
 * The sentinel lives on `window`, so a document reload destroys it — which is exactly what makes it a proof.
 */
async function runSoftNavigationProof(harness, rows, cdp, port, installation) {
  const home = installation.spokes[0];
  await cdp.navigate(`http://${home.hostname}:${port}/ww/en`);
  await sleep(2500);
  await cdp.evaluate("window.__foundationSoftNavSentinel = 'set-before-the-click'");
  const aboutLink = `[...document.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/ww/en/about')`;
  const href = await cdp.evaluate(
    `(() => { const link = ${aboutLink}; return link ? link.getAttribute('href') : null; })()`,
  );
  await cdp.evaluate(`(() => { const link = ${aboutLink}; if (link) link.click(); })()`);

  let soft = null;
  const end = Date.now() + 60000;
  while (Date.now() < end) {
    soft = await cdp.evaluate(
      `(() => ({ path: location.pathname, sentinel: window.__foundationSoftNavSentinel ?? null, text: document.body ? document.body.textContent || "" : "" }))()`,
    );
    if (soft !== null && soft.path === "/ww/en/about") break;
    await sleep(300);
  }

  harness.check(rows, "BROWSER: an internal Link is authored as a PUBLIC path", href === "/ww/en/about", `href=${href}`);
  harness.check(
    rows,
    "BROWSER: a Link click is a SOFT transition that commits on the public pathname",
    soft !== null && soft.path === "/ww/en/about",
    `path=${soft !== null ? soft.path : "(no observation)"}`,
  );
  harness.check(
    rows,
    "BROWSER: the document sentinel SURVIVED — a transition, not a document reload",
    soft !== null && soft.sentinel === "set-before-the-click",
    `sentinel=${soft !== null ? soft.sentinel : "(destroyed)"}`,
  );
  harness.check(
    rows,
    "BROWSER: the committed transition stayed inside the SAME member",
    soft !== null && soft.text.includes(factsOf(home).content),
    soft !== null ? soft.text.slice(0, 100) : "(no observation)",
  );
}

// ── §4D (LAST) — ONE HUB AND ONE SPOKE IN THE NESTED FORM IS STILL FAIL-CLOSED ───────────────────────────

/**
 * THE SINGLE-IDENTIFIED-SPOKE INSTALLATION, ON ITS OWN SERVER.
 *
 * A FLAT/LEGACY Installation declaring exactly ONE Spoke answers EVERY host — the accepted compatibility
 * rule. A NESTED Installation with one Hub and one Spoke must NOT: it dispatches by EXACT hostname like any
 * other identified Installation, so an unknown host is refused even though there is only one candidate. The
 * two forms therefore differ observably, which is what this proof pins.
 */
async function runSingleIdentifiedProof(harness, rows, installation, port) {
  const [member] = installation.spokes;
  const get = (host, pathname) => requestWithHost(port, host, pathname);

  const own = await get(hostOf(member, port), "/ww/en/about");
  harness.check(
    rows,
    "solo identified: its OWN hostname serves its page (200)",
    own.status === 200 && own.body.includes(factsOf(member).siteName),
    `status=${own.status}`,
  );

  for (const host of ["unknown.localhost", "localhost", "www.example.com", "solo-docs.localhost.attacker.example"]) {
    const answer = await get(host, "/ww/en/about");
    harness.check(
      rows,
      `solo identified: an unknown host is REFUSED (404): ${host}`,
      answer.status === 404,
      `status=${answer.status}`,
    );
  }
  const unknownRoot = await get("unknown.localhost", "/");
  harness.check(
    rows,
    "solo identified: even its ROOT on an unknown host is refused (no permissive single-Spoke rule)",
    unknownRoot.status === 404,
    `status=${unknownRoot.status}`,
  );
  harness.check(
    rows,
    "solo identified: its own ROOT still completes (the Installation is operational)",
    (await get(hostOf(member, port), "/")).status === 307,
    "",
  );
}

/**
 * THE SCENARIO: ONE disposable two-Hub Installation (and one single-member one), TWO dev servers, and every
 * proof above — HTTP first, then the same facts in a real browser.
 *
 * A failure anywhere is reported as a FAILED CHECK with its cause rather than as a thrown scenario, so the
 * report says WHICH invariant broke; both Installations, the generated namespaces and both servers are always
 * released afterwards, and the platform identity this scenario exported is removed.
 */
export async function run(chrome, harness) {
  const rows = [];
  const owned = ownedNamespaces();
  const platformEnvironment = capturePlatformEnvironment();
  let installation = null;
  let solo = null;
  let server = null;
  let soloServer = null;

  try {
    installation = materializeMultiHubInstallation({ repositoryRoot: harness.repositoryRoot });
    solo = materializeSingleIdentifiedInstallation({ repositoryRoot: harness.repositoryRoot });

    // OWNERSHIP FIRST (M3-R §3B): nothing is written until every generated namespace this scenario needs is
    // proven FREE. A target that already exists belongs to another execution or Installation and is reported
    // as a collision — never adopted, overwritten or deleted.
    const members = [...installation.spokes, solo.spokes[0]];
    const collisions = namespaceCollisions(harness, members);
    harness.check(
      rows,
      "no generated namespace on disk already belongs to another execution or Installation",
      collisions.length === 0,
      collisions.join(", ") || "(none pre-existing)",
    );
    if (collisions.length > 0) {
      throw new Error(
        `refusing to materialise generated namespaces that already exist: ${collisions.join(", ")}. This proof ` +
          `never overwrites or deletes output it did not create.`,
      );
    }

    for (const member of installation.spokes) await materializeNamespace(harness, owned, installation, member);
    await materializeNamespace(harness, owned, solo, solo.spokes[0]);
    harness.check(
      rows,
      "the scenario created and now OWNS exactly the namespaces it materialised",
      owned.length === members.length,
      `owned=${owned.length}/${members.length}`,
    );

    const started = await startServer(harness, installation, PORT_OFFSETS);
    server = started.server;

    await runRepeatedIdProof(harness, rows, started.port, installation);
    await runAssetProof(harness, rows, started.port, installation);
    await runSwitcherProof(harness, rows, started.port, installation);
    await runRefusalProof(harness, rows, started.port, installation);
    await runInspectionProof(harness, rows, started.port, installation);
    await runMetadataProof(harness, rows, started.port, installation);
    await runBrowserProof(harness, rows, chrome, started.port, installation);

    // Next 16 refuses a SECOND `next dev` for the same project directory, so the single-member Installation
    // is served only after this one's server has really stopped — an orderly hand-over, never two servers at
    // once (the same reason `harness.stopServer` waits for the process to die).
    await harness.stopServer(server);
    server = null;

    // …and THAT server gets NEITHER platform variable (see `startServer`): an identified Installation handed
    // platform hostnames with no nomination is refused at build time — correct behaviour, not a hostname proof.
    const soloStarted = await startServer(harness, solo, SOLO_PORT_OFFSETS, { platformIdentity: false });
    soloServer = soloStarted.server;
    await runSingleIdentifiedProof(harness, rows, solo, soloStarted.port);
  } catch (error) {
    harness.check(
      rows,
      "the multi-Hub scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    for (const running of [soloServer, server]) {
      try {
        await harness.stopServer(running);
      } catch {
        /* the server is already gone */
      }
    }
    // ONLY the namespaces this scenario created are removed (M3-R §3B).
    removeNamespaces(harness, owned);
    if (installation !== null) installation.cleanup();
    if (solo !== null) solo.cleanup();
    // …and the platform environment is put back EXACTLY as it was found, absent variables included (§3C).
    restorePlatformEnvironment(platformEnvironment);
  }

  return rows;
}

export default { id, run };
