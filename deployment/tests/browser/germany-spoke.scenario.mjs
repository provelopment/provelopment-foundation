// deployment/tests/browser/germany-spoke.scenario.mjs
// THE REAL TWO-SPOKE DEPLOYMENT, DRIVEN BY ITS REAL HOSTNAMES (FOUNDATION-MULTISITE-M18).
//
// This scenario belongs to THIS deployment, so it lives in the deployment's own capsule
// (`deployment/tests/browser/**`, ISO-B2A) and is discovered by the Foundation's ONE browser harness. It
// starts its OWN dev server WITHOUT the synthetic override, because its subject is the real deployment:
// the Installation that declares `foundation` + `germany`, served from the capsule.
//
// THE REAL HOSTNAMES, LOCALLY
// --------------------------
// The two public coordinates are driven EXACTLY as production spells them:
//
//   Host: foundation-template.provelopment.com
//   Host: foundation-template-germany.provelopment.com
//
// Server-side proofs send that `Host` header explicitly (the boundary's whole input, exactly as
// `tests/browser/multihost.scenario.mjs` does). Browser proofs need Chrome itself to reach the local
// server by that name, so the scenario asks the harness's CDP client for the SMALLEST test-only mapping —
// `--host-resolver-rules` — and nothing else. No runtime hostname semantic is changed: the boundary still
// matches the exact claim, and the mapping exists only inside this scenario's Chrome process.
//
// OWNERSHIP. It writes nothing: it reads the shipped deployment, its generated namespaces and the
// responses. A missing generated namespace is reported as a FAILED CHECK with the command that installs
// it, never silently created (the deployment harness owns no writers).
import { Cdp } from "../../../tests/browser/cdp.mjs";
// The two real hostnames, the explicit-`Host` request helper and the readiness poll are SHARED, because
// more than one deployment scenario must address the same two coordinates: `../support/host-requests.mjs`.
import {
  FOUNDATION_HOST,
  FOUNDATION_ORIGIN,
  GERMANY_HOST,
  GERMANY_ORIGIN,
  HOST_RESOLVER_RULES,
  requestWithHost,
  waitForHostReady,
} from "../support/host-requests.mjs";
// M21 — STRUCTURAL ISOLATION ONLY. A request is isolated because it RESOLVES through the owning
// Spoke's runtime context — same origin, same Site path, own asset namespace — never because two
// websites happen to word a page differently. Two Spokes may legally share a title.
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import path from "node:path";

/**
 * R04-C17 — is a Spoke's artwork present in ITS OWN generated runtime namespace?
 *
 * The generated mirror is `<repository>/public/spokes/<segment>/assets/**` in every layout (Next.js serves
 * static files from `public/` only), so this is a filesystem fact about the deployment's OWN generated
 * output. It is not a substitute for an HTTP check: the boundary's positive half is measured against the
 * production server, and this keeps the artwork's presence provable while a dev server refuses the path.
 */
function assetInstalled(segment, name) {
  return existsSync(path.join(process.cwd(), "public", "spokes", segment, "assets", name));
}

/**
 * R04-C21 — ONE image request whose BYTES survive.
 *
 * `requestWithHost` decodes the body as UTF-8, which is right for HTML and wrong for a PNG: the 0x89 signature
 * byte and the big-endian dimensions are not text. The restored card is only proven by its bytes, so this
 * variant hands them back undecoded — the same explicit `Host`, the same single subject, nothing else changed.
 */
function requestBytes(port, host, pathname) {
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
            bytes: Buffer.concat(chunks),
          }),
        );
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/** The PNG's OWN declared dimensions, read from its IHDR chunk; `null` when the bytes are not a PNG at all. */
function pngSize(bytes) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) return null;
  if (bytes.subarray(12, 16).toString("latin1") !== "IHDR") return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** The `content` of one `<meta property="…">`, as the served HTML actually spells it. */
function metaContent(body, property) {
  const pattern = new RegExp(`<meta[^>]+property="${property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]+content="([^"]*)"`);
  return body.match(pattern)?.[1] ?? null;
}

/** The `content` of one `<meta name="…">` — the form Twitter card tags are emitted in (`R04-C21-R02`). */
function metaName(body, name) {
  const pattern = new RegExp(`<meta[^>]+name="${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]+content="([^"]*)"`);
  return body.match(pattern)?.[1] ?? null;
}

/** The scenario's id, used as the report's `presentation` label. */
export const id = "germany-spoke";

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [31, 32, 33];

/**
 * Starts the REAL deployment's dev server on a free port and waits until the request boundary answers a
 * CLAIMED host — the only readiness signal a multi-Spoke Installation can give, because an unclaimed host
 * is answered with nothing at all.
 */
async function startServer(harness) {
  const last = PORT_OFFSETS.length - 1;
  for (const [index, offset] of PORT_OFFSETS.entries()) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { synthetic: false });
    try {
      await waitForHostReady(port, FOUNDATION_HOST, "/en-001", server);
      return { port, server };
    } catch (error) {
      await harness.stopServer(server);
      if (index === last) throw error;
    }
  }
  throw new Error("no free port answered for the real deployment");
}

/**
 * ISOLATION, PROVED STRUCTURALLY (M21).
 *
 * A coordinate is served by the Spoke that OWNS it when the response's own metadata and asset
 * references say so:
 *
 *   · `link[rel=canonical]` and `meta[property=og:url]` both name the owning Spoke's origin and the
 *     exact path asked for (the Site/locale context, resolved);
 *   · the document references the owning Spoke's asset namespace;
 *   · the document NEVER references the other Spoke's asset namespace.
 *
 * That is the whole proof: the request resolved through the correct runtime context. No title, heading
 * or paragraph is compared — two Spokes may legally use identical wording.
 */
function servedByOwningSpoke(body, { origin, pathname, ownNamespace, foreignNamespace }) {
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(body)?.[1] ?? "";
  const ogUrl = /<meta property="og:url" content="([^"]+)"/.exec(body)?.[1] ?? "";
  const expected = `${origin}${pathname}`;
  const usesOwnNamespace = ownNamespace === "" || body.includes(ownNamespace);
  const leaksForeignNamespace = foreignNamespace !== "" && body.includes(foreignNamespace);
  return {
    ok: canonical === expected && ogUrl === expected && usesOwnNamespace && !leaksForeignNamespace,
    detail:
      `canonical=${canonical || "(none)"} og=${ogUrl || "(none)"} ` +
      `ownNamespace=${usesOwnNamespace} foreignNamespaceLeak=${leaksForeignNamespace}`,
  };
}

/** The heading text of a served document, in document order (structure, never an expectation). */
function servedH1Count(body) {
  return [...body.matchAll(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi)].length;
}

/**
 * THIS DEPLOYMENT'S CONFIGURATION, read from the files the harness resolved — configuration only.
 *
 * The dictionaries declare the UI vocabulary a control's behaviour is proved against, and the
 * configured regions declare the Location control's own choices. No authored page is read here.
 */
async function spokeConfigContext(spokeConfigFiles) {
  const dirFor = (id) => {
    const configFile = (spokeConfigFiles ?? []).find((spoke) => spoke.id === id)?.configFile ?? "";
    return configFile === "" ? "" : path.dirname(configFile);
  };
  const germany = dirFor("germany");
  const readConfig = async (dir) => JSON.parse(await readFile(path.join(dir, "site.config.json"), "utf8"));
  const readDictionary = async (dir, locale) =>
    JSON.parse(await readFile(path.join(dir, "config", "i18n", `${locale}.json`), "utf8"));

  const germanyConfig = await readConfig(germany);
  const regionLabels = Object.values(germanyConfig.business?.regions ?? {}).map((region) => region.label);
  const germanyDictionary = {
    de: await readDictionary(germany, "de"),
    en: await readDictionary(germany, "en"),
  };
  return {
    germanyDictionary,
    /** The Location control's own choices: the neutral label, then the configured region labels. */
    locationLabels: {
      de: [germanyDictionary.de.location.unspecified, ...regionLabels],
      en: [germanyDictionary.en.location.unspecified, ...regionLabels],
    },
  };
}

/**
 * THE FOUNDATION HOST'S PUBLIC CONTRACT, AT THE REAL HOSTNAME (§20).
 *
 * Every request carries `Host: foundation-template.provelopment.com`, and every assertion reads the
 * RENDERED document (or the served file) — never an internal API. The refusals are as important as the
 * successes: a Germany coordinate on this host must fail closed, and no Germany content may appear.
 */
async function runFoundationContract(harness, rows, port) {
  const get = (pathname) => requestWithHost(port, FOUNDATION_HOST, pathname);
  const root = await get("/");

  harness.check(
    rows,
    "Foundation `/` completes to a declared LOCALE of this Spoke (307 → /en-001)",
    (root.status === 307 || root.status === 308) && /^\/en-001\/?$/.test(new URL(root.location, FOUNDATION_ORIGIN).pathname),
    `status=${root.status} location=${root.location || "(none)"}`,
  );
  harness.check(
    rows,
    "Foundation `/` never redirects to the GERMANY Spoke",
    !root.location.includes(GERMANY_HOST) && !/^\/de\/[a-z-]+/.test(root.location),
    root.location || "(none)",
  );

  for (const pathname of ["/en-001", "/en-001/about", "/de-de", "/de-de/about"]) {
    const response = await get(pathname);
    harness.check(
      rows,
      `Foundation ${pathname} is served (200)`,
      response.status === 200,
      `status=${response.status}`,
    );
  }

  const englishAbout = await get("/en-001/about");
  const foundationEnAbout = servedByOwningSpoke(englishAbout.body, {
    origin: FOUNDATION_ORIGIN,
    pathname: "/en-001/about",
    ownNamespace: "/spokes/foundation/assets",
    foreignNamespace: "/spokes/germany/assets",
  });
  harness.check(
    rows,
    "Foundation serves its OWN About page, not Germany's",
    foundationEnAbout.ok,
    foundationEnAbout.detail,
  );
  const germanAbout = await get("/de-de/about");
  const foundationDeAbout = servedByOwningSpoke(germanAbout.body, {
    origin: FOUNDATION_ORIGIN,
    pathname: "/de-de/about",
    ownNamespace: "/spokes/foundation/assets",
    foreignNamespace: "/spokes/germany/assets",
  });
  harness.check(
    rows,
    "Foundation's German About is the Global Site's own German page",
    germanAbout.status === 200 && foundationDeAbout.ok,
    `status=${germanAbout.status} ${foundationDeAbout.detail}`,
  );

  // ── OWNERSHIP BY CANONICAL, NOT BY PATHNAME (R04-C17 §6A) ──────────────────────────────────────────────
  // The retired model made the FIRST PATH SEGMENT the Site, so a non-200 proved ownership. Under EFS the
  // public pathname is a LOCALE + Page route, and the same pathname may be valid on BOTH hosts while
  // resolving to DIFFERENT owners — `/de-de` is the Foundation Spoke's own German Home here and the Germany
  // Spoke's Home there. Ownership is therefore proved by the CANONICAL ORIGIN the document publishes, plus
  // the structural leak proof; and a Germany-ONLY Page (Berlin) must still be refused outright here.
  for (const pathname of ["/de-de", "/de-de/about", "/en-001/about"]) {
    const response = await get(pathname);
    const canonical = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i.exec(response.body)?.[1] ?? "";
    harness.check(
      rows,
      `Foundation ${pathname} answers as the FOUNDATION owner (200 with its own canonical)`,
      response.status === 200 && canonical.startsWith(FOUNDATION_ORIGIN),
      `status=${response.status} canonical=${canonical || "(none)"}`,
    );
    harness.check(
      rows,
      `Foundation ${pathname} renders nothing Germany owns`,
      !response.body.includes("/spokes/germany/assets") && !canonical.includes(GERMANY_HOST),
      `germanyNamespace=${response.body.includes("/spokes/germany/assets")} canonical=${canonical || "(none)"}`,
    );
  }
  // A Page only the OTHER Spoke publishes is the fail-closed case, and it is unconditional.
  for (const pathname of ["/de-de/berlin", "/en-001/berlin", "/de-de/frankfurt"]) {
    const response = await get(pathname);
    harness.check(
      rows,
      `Foundation does NOT serve Germany's Page ${pathname} (fail closed)`,
      response.status === 404,
      `status=${response.status} location=${response.location || "(none)"}`,
    );
  }

  // ── per-host metadata surfaces ────────────────────────────────────────────────────────────────────────
  const sitemap = await get("/sitemap.xml");
  harness.check(rows, "Foundation sitemap is served (200)", sitemap.status === 200, `status=${sitemap.status}`);
  harness.check(
    rows,
    "Foundation sitemap publishes the Foundation origin and no Germany URL",
    sitemap.body.includes(FOUNDATION_ORIGIN) &&
      !sitemap.body.includes(GERMANY_HOST) &&
      !sitemap.body.includes(`${FOUNDATION_ORIGIN}/de/`),
    sitemap.body.slice(0, 160),
  );
  const robots = await get("/robots.txt");
  harness.check(
    rows,
    "Foundation robots advertises the Foundation sitemap only",
    robots.body.includes(`${FOUNDATION_ORIGIN}/sitemap.xml`) && !robots.body.includes(GERMANY_HOST),
    robots.body.trim().slice(0, 160),
  );
  // R04-C21 — THE OPEN GRAPH IMAGE CAPABILITY, RESTORED NATIVELY. The Owner decided on 2026-10-31 to KEEP a
  // public social image, and this Host now serves its own 1200 × 630 PNG card at the EFS reserved suffix. The
  // question this check has always asked — does the publication publish a public image endpoint? — is
  // unchanged; the answer is now measured from the real response: status, content type, PNG signature, the
  // dimensions the PNG itself declares, and the page metadata naming exactly this URL. The retired geographic
  // route must stay retired: an image restored is not a geography restored.
  const image = await requestBytes(port, FOUNDATION_HOST, "/en-001/opengraph-image");
  const retiredImage = await get("/ww/en/opengraph-image");
  const home = await get("/en-001");
  const card = pngSize(image.bytes);
  harness.check(
    rows,
    "Foundation publishes its OWN Open Graph image: 200, image/png, a real 1200 × 630 PNG",
    image.status === 200 &&
      String(image.headers["content-type"] ?? "") === "image/png" &&
      card !== null &&
      card.width === 1200 &&
      card.height === 630,
    `efs /en-001/opengraph-image -> ${image.status} ${String(image.headers["content-type"] ?? "(none)")} ` +
      `${image.bytes.length}B ${card === null ? "not-a-png" : `${card.width}×${card.height}`}`,
  );
  harness.check(
    rows,
    "the retired geographic image route stays retired (no capability returns with the image)",
    retiredImage.status === 404,
    `retired /ww/en/opengraph-image -> ${retiredImage.status} ${String(retiredImage.headers["content-type"] ?? "(none)")}`,
  );
  harness.check(
    rows,
    "the Foundation page advertises exactly the image its own endpoint serves — Open Graph AND Twitter",
    metaContent(home.body, "og:image") === `${FOUNDATION_ORIGIN}/en-001/opengraph-image` &&
      metaContent(home.body, "og:image:width") === "1200" &&
      metaContent(home.body, "og:image:height") === "630" &&
      metaName(home.body, "twitter:card") === "summary_large_image" &&
      metaName(home.body, "twitter:image") === `${FOUNDATION_ORIGIN}/en-001/opengraph-image`,
    `og:image=${metaContent(home.body, "og:image")} ${metaContent(home.body, "og:image:width")}×${metaContent(home.body, "og:image:height")}; ` +
      `twitter:card=${metaName(home.body, "twitter:card")} twitter:image=${metaName(home.body, "twitter:image")}`,
  );

  // ── asset host isolation (§30/R04-C17 §6D) ─────────────────────────────────────────────────────────────
  const ownAsset = await get("/spokes/foundation/assets/sidebar-open.svg");
  const otherAsset = await get("/spokes/germany/assets/sidebar-open.svg");
  const platformAsset = await get("/assets/icon-home.svg");
  harness.check(
    rows,
    "Foundation's own namespace artwork is installed",
    ownAsset.status === 200 || assetInstalled("foundation", "sidebar-open.svg"),
    `status=${ownAsset.status} installed=${assetInstalled("foundation", "sidebar-open.svg")}`,
  );
  harness.check(
    rows,
    "Foundation host REFUSES the Germany Spoke's asset",
    otherAsset.status === 404,
    `status=${otherAsset.status}`,
  );
  harness.check(rows, "the shared platform asset is available", platformAsset.status === 200, `status=${platformAsset.status}`);
}

/** THE GERMANY HOST'S PUBLIC CONTRACT, AT THE REAL HOSTNAME (§21). */
async function runGermanyContract(harness, rows, port) {
  const get = (pathname) => requestWithHost(port, GERMANY_HOST, pathname);
  const root = await get("/");

  harness.check(
    rows,
    "Germany `/` completes to a declared locale inside this Spoke",
    (root.status === 307 || root.status === 308) &&
      ["/de-de", "/en-001"].includes(new URL(root.location, GERMANY_ORIGIN).pathname.replace(/\/$/, "")),
    `status=${root.status} location=${root.location || "(none)"}`,
  );
  harness.check(
    rows,
    "Germany `/` never redirects to the Foundation Spoke",
    !root.location.includes(FOUNDATION_HOST) && !root.location.startsWith("/ww/"),
    root.location || "(none)",
  );

  for (const pathname of [
    "/de-de",
    "/de-de/about",
    "/de-de/berlin",
    "/de-de/frankfurt",
    "/en-001",
    "/en-001/about",
    "/en-001/berlin",
    "/en-001/frankfurt",
  ]) {
    const response = await get(pathname);
    harness.check(rows, `Germany ${pathname} is served (200)`, response.status === 200, `status=${response.status}`);
  }

  const englishAbout = await get("/en-001/about");
  const germanyEnAbout = servedByOwningSpoke(englishAbout.body, {
    origin: GERMANY_ORIGIN,
    pathname: "/en-001/about",
    ownNamespace: "/spokes/germany/assets",
    foreignNamespace: "/spokes/foundation/assets",
  });
  harness.check(
    rows,
    "Germany serves its OWN About page, not the Foundation's",
    germanyEnAbout.ok,
    germanyEnAbout.detail,
  );
  const berlin = await get("/de-de/berlin");
  const berlinOwnership = servedByOwningSpoke(berlin.body, {
    origin: GERMANY_ORIGIN,
    pathname: "/de-de/berlin",
    ownNamespace: "/spokes/germany/assets",
    foreignNamespace: "/spokes/foundation/assets",
  });
  harness.check(
    rows,
    "Germany's Berlin landing renders the regional route on its own origin",
    berlin.status === 200 && berlinOwnership.ok && servedH1Count(berlin.body) === 1,
    `status=${berlin.status} h1s=${servedH1Count(berlin.body)} ${berlinOwnership.detail}`,
  );

  // ── OWNERSHIP BY CANONICAL, NOT BY PATHNAME (R04-C17 §6A) ──────────────────────────────────────────────
  // `/en-001` and `/de-de` are LOCALE roots, not Site selectors: BOTH hosts publish them, each with its own
  // owner, so this Host serving them is correct and expected. What must hold is that they answer as THIS
  // Spoke (own canonical, own asset namespace) and that the FOUNDATION-only Pages stay refused here.
  for (const pathname of ["/en-001", "/de-de"]) {
    const response = await get(pathname);
    const canonical = /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i.exec(response.body)?.[1] ?? "";
    harness.check(
      rows,
      `Germany ${pathname} answers as the GERMANY owner (200 with its own canonical)`,
      response.status === 200 && canonical.startsWith(GERMANY_ORIGIN),
      `status=${response.status} canonical=${canonical || "(none)"}`,
    );
    harness.check(
      rows,
      `Germany ${pathname} renders nothing Foundation owns`,
      !response.body.includes("/spokes/foundation/assets") && !canonical.includes(FOUNDATION_HOST),
      `foundationNamespace=${response.body.includes("/spokes/foundation/assets")} canonical=${canonical || "(none)"}`,
    );
  }
  // A Page only the Foundation publishes is the fail-closed case, and it is unconditional.
  const contact = await get("/en-001/contact");
  harness.check(
    rows,
    "Germany does NOT serve the Foundation's Contact Page (fail closed)",
    contact.status === 404,
    `status=${contact.status} location=${contact.location || "(none)"}`,
  );

  const sitemap = await get("/sitemap.xml");
  harness.check(rows, "Germany sitemap is served (200)", sitemap.status === 200, `status=${sitemap.status}`);
  harness.check(
    rows,
    "Germany sitemap publishes the Germany origin and no Foundation URL",
    sitemap.body.includes(GERMANY_ORIGIN) && !sitemap.body.includes(FOUNDATION_HOST) && !sitemap.body.includes("/ww/") && !sitemap.body.includes("/en/"),
    sitemap.body.slice(0, 160),
  );
  // R04-C17 §6E — THE GERMANY PUBLICATION'S EXACT SHAPE: eight qualified Page URLs (four Pages × two
  // representations), each on ITS OWN origin, with no retired Site prefix anywhere. Derived from the
  // manifest's Page declarations, never from filenames.
  const germanyLocs = [...String(sitemap.body ?? "").matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const EXPECTED_GERMANY_LOCS = [
    `${GERMANY_ORIGIN}/de-de`,
    `${GERMANY_ORIGIN}/en-001`,
    `${GERMANY_ORIGIN}/de-de/about`,
    `${GERMANY_ORIGIN}/en-001/about`,
    `${GERMANY_ORIGIN}/de-de/berlin`,
    `${GERMANY_ORIGIN}/en-001/berlin`,
    `${GERMANY_ORIGIN}/de-de/frankfurt`,
    `${GERMANY_ORIGIN}/en-001/frankfurt`,
  ];
  harness.check(
    rows,
    "Germany sitemap publishes its eight qualified Pages only",
    germanyLocs.length === EXPECTED_GERMANY_LOCS.length &&
      EXPECTED_GERMANY_LOCS.every((loc) => germanyLocs.includes(loc)),
    JSON.stringify(germanyLocs),
  );
  harness.check(
    rows,
    "Germany sitemap has no retired Site prefix",
    germanyLocs.every((loc) => !/\/ww\/|\/de\/[a-z-]+/.test(loc.replace(GERMANY_ORIGIN, ""))),
    JSON.stringify(germanyLocs),
  );
  const robots = await get("/robots.txt");
  harness.check(
    rows,
    "Germany robots advertises the Germany sitemap only",
    robots.body.includes(`${GERMANY_ORIGIN}/sitemap.xml`) && !robots.body.includes(FOUNDATION_HOST),
    robots.body.trim().slice(0, 160),
  );
  // R04-C21 — THE SAME CAPABILITY ON THE SECOND PUBLICATION, AND THE SEPARATION BETWEEN THEM.
  //
  // The geographic image route (`/<site>/<locale>/opengraph-image`) retired with the Site/region model and must
  // stay retired; the EFS publication serves its own card at the reserved suffix instead. Three facts, none of
  // which may hide the others: this Host ANSWERS with its own 1200 × 630 PNG; the retired route still answers
  // 404; and the two publications do NOT share a card — the same server, addressed by each Host, returns bytes
  // that differ, because each card carries its OWN publication's localized sentence and canonical origin.
  const image = await requestBytes(port, GERMANY_HOST, "/de-de/opengraph-image");
  const retiredImage = await get("/de/de/opengraph-image");
  const home = await get("/de-de");
  const card = pngSize(image.bytes);
  harness.check(
    rows,
    "Germany publishes its OWN Open Graph image: 200, image/png, a real 1200 × 630 PNG",
    image.status === 200 &&
      String(image.headers["content-type"] ?? "") === "image/png" &&
      card !== null &&
      card.width === 1200 &&
      card.height === 630,
    `efs /de-de/opengraph-image -> ${image.status} ${String(image.headers["content-type"] ?? "(none)")} ` +
      `${image.bytes.length}B ${card === null ? "not-a-png" : `${card.width}×${card.height}`}`,
  );
  harness.check(
    rows,
    "the retired geographic image route stays retired on this Host too",
    retiredImage.status === 404,
    `retired /de/de/opengraph-image -> ${retiredImage.status}`,
  );
  harness.check(
    rows,
    "the Germany page advertises its own origin's image, never the Foundation publication's — Open Graph AND Twitter",
    metaContent(home.body, "og:image") === `${GERMANY_ORIGIN}/de-de/opengraph-image` &&
      !home.body.includes(`${FOUNDATION_ORIGIN}/en-001/opengraph-image`) &&
      metaName(home.body, "twitter:card") === "summary_large_image" &&
      metaName(home.body, "twitter:image") === `${GERMANY_ORIGIN}/de-de/opengraph-image`,
    `og:image=${metaContent(home.body, "og:image")}; twitter:image=${metaName(home.body, "twitter:image")}`,
  );
  const foreign = await requestBytes(port, FOUNDATION_HOST, "/en-001/opengraph-image");
  harness.check(
    rows,
    "the two publications render DIFFERENT cards: one server, two owners, no shared preview",
    image.bytes.length > 0 &&
      foreign.bytes.length > 0 &&
      pngSize(foreign.bytes)?.width === 1200 &&
      !image.bytes.equals(foreign.bytes),
    `germany ${image.bytes.length}B vs foundation ${foreign.bytes.length}B, identical=${image.bytes.equals(foreign.bytes)}`,
  );

  // R04-C17 §6D — SPOKE ARTWORK: three facts, none of which may hide the others.
  //   · the NEGATIVE the boundary exists for: this Host must not obtain the OTHER Spoke's namespace;
  //   · OWNERSHIP of every `/spokes/**` reference the page renders;
  //   · PRESENCE of that artwork in this Spoke's own generated namespace.
  //
  // The positive STATUS is not asserted here on purpose: a `next dev` server refuses every `/spokes/**`
  // static path (measured — own namespace included), while `next start` serves this Host's namespace with
  // 200 and refuses the Foundation one with 404. Asserting the dev refusal would bless it; asserting 200
  // would fail on the harness's own origin. The boundary's positive half is proved against the production
  // server and reported instead of being folded into a weaker check.
  const ownAsset = await get("/spokes/germany/assets/sidebar-open.svg");
  const otherAsset = await get("/spokes/foundation/assets/sidebar-open.svg");
  const platformAsset = await get("/assets/icon-home.svg");
  harness.check(
    rows,
    "Germany host REFUSES the Foundation Spoke's asset",
    otherAsset.status === 404,
    `status=${otherAsset.status}`,
  );
  harness.check(
    rows,
    "Germany's own namespace artwork is installed",
    ownAsset.status === 200 || assetInstalled("germany", "sidebar-open.svg"),
    `status=${ownAsset.status} installed=${assetInstalled("germany", "sidebar-open.svg")}`,
  );
  harness.check(rows, "the shared platform asset is available", platformAsset.status === 200, `status=${platformAsset.status}`);
}

/**
 * THE BROWSER-VISIBLE CONTRACT ON BOTH REAL HOSTS (§22): ONE probe, in a real Chrome, at desktop AND
 * mobile widths, reading only what a visitor can see or follow — the address bar, the controls the header
 * offers, the links and images the document carries, and whether anything failed while rendering.
 */
const UI_PROBE = `(() => {
  const selects = [...document.querySelectorAll('select[data-selector]')];
  const one = (name) => selects.find((s) => s.getAttribute('data-selector') === name) ?? null;
  const options = (el) => (el ? [...el.querySelectorAll('option')].map((o) => o.textContent.trim()) : null);
  const site = one('site'); const location = one('location'); const language = one('language');
  const body = document.body ? document.body.textContent || '' : '';
  return {
    path: window.location.pathname,
    selectors: selects.map((s) => s.getAttribute('data-selector')),
    sitePresent: site !== null,
    locationPresent: location !== null,
    locationOptions: options(location),
    languagePresent: language !== null,
    languageValue: language ? language.value : null,
    navTexts: [...document.querySelectorAll('nav a')].map((a) => (a.textContent || '').trim()).filter(Boolean),
    urls: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '')
      .concat([...document.querySelectorAll('img[src]')].map((i) => i.getAttribute('src') || '')),
    // A real failure, as a visitor sees it. The nextjs-portal element is Next OWN dev-tools host element; it is
    // present in every development render, so it is NOT evidence of an error; the error TEXT is.
    // M19 §9 — the cross-Spoke DISCOVERABILITY links, as the visitor receives them: ordinary anchors
    // with an ABSOLUTE public origin (the target website's root), opened in a new tab.
    externalLinks: [...document.querySelectorAll('a[href^="http"]')].map((a) => ({
      href: a.getAttribute('href') || '',
      label: (a.textContent || '').trim(),
      target: a.getAttribute('target') || '',
      rel: a.getAttribute('rel') || '',
    })),
    hasErrorText: /Application error|Unhandled Runtime Error|Internal Server Error/i.test(body),
    text: body.slice(0, 400),
  };
})()`;

async function runBrowserProof(harness, rows, chrome, port, context) {
  const cdp = await Cdp.connect(chrome, { hostResolverRules: HOST_RESOLVER_RULES });
  try {
    for (const [name, viewport] of Object.entries(harness.viewports)) {
      await cdp.setViewport(viewport.width, viewport.height);

      // ── FOUNDATION: the `ww` Site, at /en-001 ──────────────────────────────────────────────────────────
      await cdp.navigate(`http://${FOUNDATION_HOST}:${port}/en-001`);
      await harness.waitReady(cdp);
      const foundation = await cdp.evaluate(UI_PROBE);

      harness.check(rows, `${name}: Foundation /en-001 commits on the public pathname`, foundation.path === "/en-001", foundation.path);
      harness.check(rows, `${name}: Foundation renders NO Site control (§11)`, foundation.sitePresent === false, JSON.stringify(foundation.selectors));
      harness.check(rows, `${name}: Foundation renders NO Location control (§12)`, foundation.locationPresent === false, JSON.stringify(foundation.selectors));
      harness.check(rows, `${name}: Foundation offers its Language control on en`, foundation.languagePresent === true && foundation.languageValue === "en-001", String(foundation.languageValue));
      harness.check(rows, `${name}: Foundation renders no error overlay`, foundation.hasErrorText === false, foundation.text.slice(0, 80));
      harness.check(rows, `${name}: Foundation leaks no internal Spoke prefix into ANY URL`, !foundation.urls.some((url) => url.includes("~spoke")), "");
      harness.check(rows, `${name}: Foundation never names the Germany Spoke's asset namespace (§30)`, !foundation.urls.some((url) => url.includes("/spokes/germany/assets/")), "");

      // ── GERMANY: the `de` Site, in German ─────────────────────────────────────────────────────────────
      await cdp.navigate(`http://${GERMANY_HOST}:${port}/de-de`);
      await harness.waitReady(cdp);
      const germany = await cdp.evaluate(UI_PROBE);

      harness.check(rows, `${name}: Germany /de-de commits on the public pathname`, germany.path === "/de-de", germany.path);
      harness.check(rows, `${name}: Germany renders NO Site control (§11)`, germany.sitePresent === false, JSON.stringify(germany.selectors));
      harness.check(
        rows,
        `${name}: Germany exposes NO Location control after geographic retirement (§13/R03)`,
        germany.locationPresent === false &&
          (germany.locationOptions ?? []).length === 0,
        JSON.stringify(germany.locationOptions),
      );
      harness.check(rows, `${name}: Germany offers its Language control on de`, germany.languagePresent === true && germany.languageValue === "de-de", String(germany.languageValue));
      harness.check(rows, `${name}: Germany renders no error overlay`, germany.hasErrorText === false, germany.text.slice(0, 80));
      harness.check(rows, `${name}: Germany leaks no internal Spoke prefix into ANY URL`, !germany.urls.some((url) => url.includes("~spoke")), "");
      harness.check(rows, `${name}: Germany never names the Foundation Spoke's asset namespace (§30)`, !germany.urls.some((url) => url.includes("/spokes/foundation/assets/")), "");
      harness.check(rows, `${name}: Germany's navigation speaks German, never raw dictionary keys`, germany.navTexts.includes(context.germanyDictionary.de.navigation.items["/"]) && !germany.text.includes("navigation.items"), JSON.stringify(germany.navTexts.slice(0, 4)));

      // ── GERMANY in ENGLISH: the same Site, its other language ─────────────────────────────────────────
      await cdp.navigate(`http://${GERMANY_HOST}:${port}/en-001/about`);
      await harness.waitReady(cdp);
      const germanyEnglish = await cdp.evaluate(UI_PROBE);

      harness.check(rows, `${name}: Germany /en-001/about commits on the public pathname`, germanyEnglish.path === "/en-001/about", germanyEnglish.path);
      harness.check(
        rows,
        `${name}: Germany's English page also exposes NO Location control`,
        germanyEnglish.locationPresent === false &&
          (germanyEnglish.locationOptions ?? []).length === 0,
        JSON.stringify(germanyEnglish.locationOptions),
      );
      harness.check(rows, `${name}: Germany's English page names English`, germanyEnglish.languageValue === "en-001", String(germanyEnglish.languageValue));
      harness.check(rows, `${name}: Germany's English page renders no error overlay`, germanyEnglish.hasErrorText === false, germanyEnglish.text.slice(0, 80));

      // ── CROSS-SPOKE DISCOVERABILITY (M19 §9): the two public websites link to EACH OTHER ────────────
      //
      // The M19 human checkpoint found the defect: the Germany website was unreachable from the
      // Foundation website by any discoverable link (the Site control is gone BY DESIGN — one publication per
      // Spoke). The correction is ordinary authored secondary navigation, so what is proved here
      // is what a VISITOR receives: an anchor carrying the target's own public origin, its localized
      // label, and new-tab external semantics.
      const discovered = (probe, href) =>
        probe.externalLinks.find((link) => link.href === href) ?? null;

      const foundationToGermany = discovered(foundation, `${GERMANY_ORIGIN}/`);
      harness.check(
        rows,
        `${name}: Foundation /en-001 VISIBLY links to the Germany website (M19 discoverability)`,
        foundationToGermany !== null &&
          foundationToGermany.label === "Germany" &&
          foundationToGermany.target === "_blank" &&
          /noreferrer/.test(foundationToGermany.rel),
        JSON.stringify(foundation.externalLinks),
      );

      const germanyToFoundation = discovered(germany, `${FOUNDATION_ORIGIN}/`);
      harness.check(
        rows,
        `${name}: Germany /de-de VISIBLY links back to the Foundation website (M19 discoverability)`,
        germanyToFoundation !== null &&
          germanyToFoundation.label === "Global" &&
          germanyToFoundation.target === "_blank" &&
          /noreferrer/.test(germanyToFoundation.rel),
        JSON.stringify(germany.externalLinks),
      );

      harness.check(
        rows,
        `${name}: the cross-Spoke links expose no internal Spoke prefix and no foreign Site path`,
        [...foundation.externalLinks, ...germany.externalLinks]
          .filter((link) => link.href.startsWith(FOUNDATION_ORIGIN) || link.href.startsWith(GERMANY_ORIGIN))
          .every((link) => !link.href.includes("~spoke") && new URL(link.href).pathname === "/"),
        "only the two public roots are advertised",
      );

      // The German-language Foundation page must speak German to its visitor.
      await cdp.navigate(`http://${FOUNDATION_HOST}:${port}/de-de`);
      await harness.waitReady(cdp);
      const foundationGerman = await cdp.evaluate(UI_PROBE);
      const germanyInGerman = discovered(foundationGerman, `${GERMANY_ORIGIN}/`);
      harness.check(
        rows,
        `${name}: Foundation /de-de labels the Germany website "Deutschland"`,
        germanyInGerman !== null && germanyInGerman.label === "Deutschland",
        JSON.stringify(germanyInGerman),
      );

      // FOLLOWING THE LINK. The authored href is the target's PUBLIC origin, which this test environment
      // cannot resolve; the local transport (host:port) is substituted and the PATH IS UNCHANGED, so the
      // TARGET website performs exactly the root/locale completion a real visitor would receive — the
      // whole point of linking to a root instead of a forced locale path.
      //
      // The completion itself negotiates the VISITOR'S LANGUAGE PREFERENCE (`src/core/locale.ts`: a
      // supported language wins, otherwise the Site default), which is pre-existing behaviour identical in
      // both Spokes: a browser preferring English lands on the target Spoke's own English representation
      // (`/en-001`), one with no preference (or a German one) on `/de-de`. What must hold — and what these
      // checks assert — is that the TARGET Spoke performs its OWN locale completion INSIDE ITS OWN
      // publication, never crossing to the other website.
      const viaLocalTransport = (href) => {
        const target = new URL(href);
        return `http://${target.host}:${port}${target.pathname}`;
      };

      if (foundationToGermany) {
        await cdp.navigate(viaLocalTransport(foundationToGermany.href));
        await harness.waitReady(cdp);
        const arrived = await cdp.evaluate(UI_PROBE);
        harness.check(
          rows,
          `${name}: following the Foundation link reaches the GERMANY website and completes ITS OWN locale root`,
          /^\/(de-de|en-001)\/?$/.test(arrived.path) &&
            arrived.sitePresent === false &&
            arrived.locationPresent === false &&
            arrived.hasErrorText === false,
          arrived.path,
        );
      } else {
        harness.check(rows, `${name}: the Foundation → Germany link could be followed`, false, "no link discovered");
      }

      if (germanyToFoundation) {
        await cdp.navigate(viaLocalTransport(germanyToFoundation.href));
        await harness.waitReady(cdp);
        const arrived = await cdp.evaluate(UI_PROBE);
        harness.check(
          rows,
          `${name}: following the Germany link reaches the FOUNDATION website and completes ITS OWN locale root`,
          /^\/(en-001|de-de)\/?$/.test(arrived.path) &&
            arrived.sitePresent === false &&
            arrived.locationPresent === false &&
            arrived.hasErrorText === false,
          arrived.path,
        );
      } else {
        harness.check(rows, `${name}: the Germany → Foundation link could be followed`, false, "no link discovered");
      }
    }
  } finally {
    await cdp.close();
  }
}

/**
 * THE SCENARIO: the real deployment, at its real hostnames, with every proof above.
 *
 * A failure anywhere is reported as a FAILED CHECK with its cause rather than as a thrown scenario, so the
 * report says WHICH invariant broke; the dev server is always released afterwards.
 */
export async function run(chrome, harness) {
  const rows = [];
  let started = null;
  try {
    started = await startServer(harness);
    // This deployment's CONFIGURATION, read once (dictionaries and declared regions) — the authored
    // pages are never read: a Spoke may legally share wording with another (M21).
    const context = await spokeConfigContext(harness.spokeConfigFiles);
    await runFoundationContract(harness, rows, started.port);
    await runGermanyContract(harness, rows, started.port);
    await runBrowserProof(harness, rows, chrome, started.port, context);
  } catch (error) {
    harness.check(
      rows,
      "the real two-Spoke host scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    try {
      await harness.stopServer(started === null ? null : started.server);
    } catch {
      /* the server is already gone */
    }
  }
  return rows;
}

/** The scenario's ONE export contract: its report label, and its runner. */
const scenario = { id, run };

export default scenario;
