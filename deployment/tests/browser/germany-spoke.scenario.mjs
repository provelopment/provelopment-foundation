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
import { readFile } from "node:fs/promises";
import path from "node:path";

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
      await waitForHostReady(port, FOUNDATION_HOST, "/ww/en", server);
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
    "Foundation `/` completes INSIDE this Spoke (307 → /ww/<locale>)",
    (root.status === 307 || root.status === 308) &&
      /^\/ww\/[a-z]{2}$/.test(new URL(root.location, FOUNDATION_ORIGIN).pathname),
    `status=${root.status} location=${root.location || "(none)"}`,
  );
  harness.check(
    rows,
    "Foundation `/` never redirects to the GERMANY Spoke",
    !root.location.includes(GERMANY_HOST) && !root.location.startsWith("/de/"),
    root.location || "(none)",
  );

  for (const pathname of ["/ww/en", "/ww/en/about", "/ww/de", "/ww/de/about"]) {
    const response = await get(pathname);
    harness.check(
      rows,
      `Foundation ${pathname} is served (200)`,
      response.status === 200,
      `status=${response.status}`,
    );
  }

  const englishAbout = await get("/ww/en/about");
  const foundationEnAbout = servedByOwningSpoke(englishAbout.body, {
    origin: FOUNDATION_ORIGIN,
    pathname: "/ww/en/about",
    ownNamespace: "/spokes/foundation/assets",
    foreignNamespace: "/spokes/germany/assets",
  });
  harness.check(
    rows,
    "Foundation serves its OWN About page, not Germany's",
    foundationEnAbout.ok,
    foundationEnAbout.detail,
  );
  const germanAbout = await get("/ww/de/about");
  const foundationDeAbout = servedByOwningSpoke(germanAbout.body, {
    origin: FOUNDATION_ORIGIN,
    pathname: "/ww/de/about",
    ownNamespace: "/spokes/foundation/assets",
    foreignNamespace: "/spokes/germany/assets",
  });
  harness.check(
    rows,
    "Foundation's German About is the Global Site's own German page",
    germanAbout.status === 200 && foundationDeAbout.ok,
    `status=${germanAbout.status} ${foundationDeAbout.detail}`,
  );

  // ── the retired coordinates are NOT OWNED by this host (§22) ───────────────────────────────────────────
  // The ACCEPTED completion rules still normalise a path whose first segment names one of THIS Spoke's own
  // LOCALES (`de` is a Foundation language: `/de/about` → `/ww/de/about`), so the response may be a
  // same-host completion rather than a bare 404. What is asserted is what §22 requires of OWNERSHIP: the
  // coordinate is never SERVED here (never 200), any completion stays inside THIS Spoke and never lands on
  // a `/de/**` Site path, and no Germany content is ever rendered.
  for (const pathname of ["/de/de", "/de/de/about", "/de/de/berlin", "/de/en/about"]) {
    const response = await get(pathname);
    const target = response.location ? new URL(response.location, FOUNDATION_ORIGIN) : null;
    harness.check(
      rows,
      `Foundation does NOT own the Germany coordinate ${pathname}`,
      response.status !== 200,
      `status=${response.status} location=${response.location || "(none)"}`,
    );
    harness.check(
      rows,
      `Foundation ${pathname} stays inside this Spoke and renders nothing Germany owns`,
      // Structural leak proof: the coordinate never resolves to a `/de/**` Site path AND the response
      // never references the Germany Spoke's asset namespace. (A shared title would prove nothing.)
      (target === null || (target.origin === FOUNDATION_ORIGIN && !target.pathname.startsWith("/de/"))) &&
        !response.body.includes("/spokes/germany/assets"),
      `location=${response.location || "(none)"} germanyNamespace=${response.body.includes("/spokes/germany/assets")}`,
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
  const image = await get("/ww/en/opengraph-image");
  harness.check(
    rows,
    "Foundation /ww/en/opengraph-image is an image (200 + image/png)",
    image.status === 200 && String(image.headers["content-type"] ?? "").startsWith("image/png"),
    `status=${image.status} type=${String(image.headers["content-type"] ?? "(none)")}`,
  );

  // ── asset host isolation (§30) ────────────────────────────────────────────────────────────────────────
  const ownAsset = await get("/spokes/foundation/assets/sidebar-open.svg");
  const otherAsset = await get("/spokes/germany/assets/sidebar-open.svg");
  const platformAsset = await get("/assets/icon-home.svg");
  harness.check(rows, "Foundation host serves its OWN Spoke asset", ownAsset.status === 200, `status=${ownAsset.status}`);
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
      ["/de/de", "/de/en"].includes(new URL(root.location, GERMANY_ORIGIN).pathname),
    `status=${root.status} location=${root.location || "(none)"}`,
  );
  harness.check(
    rows,
    "Germany `/` never redirects to the Foundation Spoke",
    !root.location.includes(FOUNDATION_HOST) && !root.location.startsWith("/ww/"),
    root.location || "(none)",
  );

  for (const pathname of [
    "/de/de",
    "/de/de/about",
    "/de/de/berlin",
    "/de/de/frankfurt",
    "/de/en",
    "/de/en/about",
    "/de/en/berlin",
    "/de/en/frankfurt",
  ]) {
    const response = await get(pathname);
    harness.check(rows, `Germany ${pathname} is served (200)`, response.status === 200, `status=${response.status}`);
  }

  const englishAbout = await get("/de/en/about");
  const germanyEnAbout = servedByOwningSpoke(englishAbout.body, {
    origin: GERMANY_ORIGIN,
    pathname: "/de/en/about",
    ownNamespace: "/spokes/germany/assets",
    foreignNamespace: "/spokes/foundation/assets",
  });
  harness.check(
    rows,
    "Germany serves its OWN About page, not the Foundation's",
    germanyEnAbout.ok,
    germanyEnAbout.detail,
  );
  const berlin = await get("/de/de/berlin");
  const berlinOwnership = servedByOwningSpoke(berlin.body, {
    origin: GERMANY_ORIGIN,
    pathname: "/de/de/berlin",
    ownNamespace: "/spokes/germany/assets",
    foreignNamespace: "/spokes/foundation/assets",
  });
  harness.check(
    rows,
    "Germany's Berlin landing renders the regional route on its own origin",
    berlin.status === 200 && berlinOwnership.ok && servedH1Count(berlin.body) === 1,
    `status=${berlin.status} h1s=${servedH1Count(berlin.body)} ${berlinOwnership.detail}`,
  );

  // ── the other Spoke's coordinates are NOT OWNED by this host (§21/§23) ─────────────────────────────────
  for (const pathname of ["/ww/en", "/ww/de"]) {
    const response = await get(pathname);
    const target = response.location ? new URL(response.location, GERMANY_ORIGIN) : null;
    harness.check(
      rows,
      `Germany does NOT own the Foundation coordinate ${pathname}`,
      response.status !== 200,
      `status=${response.status} location=${response.location || "(none)"}`,
    );
    harness.check(
      rows,
      `Germany ${pathname} stays inside this Spoke and renders nothing Foundation owns`,
      (target === null || (target.origin === GERMANY_ORIGIN && !target.pathname.startsWith("/ww/"))) &&
        !response.body.includes("/spokes/foundation/assets"),
      `location=${response.location || "(none)"} foundationNamespace=${response.body.includes("/spokes/foundation/assets")}`,
    );
  }

  const sitemap = await get("/sitemap.xml");
  harness.check(rows, "Germany sitemap is served (200)", sitemap.status === 200, `status=${sitemap.status}`);
  harness.check(
    rows,
    "Germany sitemap publishes the Germany origin and no Foundation URL",
    sitemap.body.includes(GERMANY_ORIGIN) && !sitemap.body.includes(FOUNDATION_HOST) && !sitemap.body.includes("/ww/"),
    sitemap.body.slice(0, 160),
  );
  const robots = await get("/robots.txt");
  harness.check(
    rows,
    "Germany robots advertises the Germany sitemap only",
    robots.body.includes(`${GERMANY_ORIGIN}/sitemap.xml`) && !robots.body.includes(FOUNDATION_HOST),
    robots.body.trim().slice(0, 160),
  );
  const image = await get("/de/de/opengraph-image");
  harness.check(
    rows,
    "Germany /de/de/opengraph-image is an image (200 + image/png)",
    image.status === 200 && String(image.headers["content-type"] ?? "").startsWith("image/png"),
    `status=${image.status} type=${String(image.headers["content-type"] ?? "(none)")}`,
  );

  const ownAsset = await get("/spokes/germany/assets/sidebar-open.svg");
  const otherAsset = await get("/spokes/foundation/assets/sidebar-open.svg");
  const platformAsset = await get("/assets/icon-home.svg");
  harness.check(rows, "Germany host serves its OWN Spoke asset", ownAsset.status === 200, `status=${ownAsset.status}`);
  harness.check(
    rows,
    "Germany host REFUSES the Foundation Spoke's asset",
    otherAsset.status === 404,
    `status=${otherAsset.status}`,
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

      // ── FOUNDATION: the `ww` Site, at /ww/en ──────────────────────────────────────────────────────────
      await cdp.navigate(`http://${FOUNDATION_HOST}:${port}/ww/en`);
      await harness.waitReady(cdp);
      const foundation = await cdp.evaluate(UI_PROBE);

      harness.check(rows, `${name}: Foundation /ww/en commits on the public pathname`, foundation.path === "/ww/en", foundation.path);
      harness.check(rows, `${name}: Foundation renders NO Site control (§11)`, foundation.sitePresent === false, JSON.stringify(foundation.selectors));
      harness.check(rows, `${name}: Foundation renders NO Location control (§12)`, foundation.locationPresent === false, JSON.stringify(foundation.selectors));
      harness.check(rows, `${name}: Foundation offers its Language control on en`, foundation.languagePresent === true && foundation.languageValue === "en", String(foundation.languageValue));
      harness.check(rows, `${name}: Foundation renders no error overlay`, foundation.hasErrorText === false, foundation.text.slice(0, 80));
      harness.check(rows, `${name}: Foundation leaks no internal Spoke prefix into ANY URL`, !foundation.urls.some((url) => url.includes("~spoke")), "");
      harness.check(rows, `${name}: Foundation never names the Germany Spoke's asset namespace (§30)`, !foundation.urls.some((url) => url.includes("/spokes/germany/assets/")), "");

      // ── GERMANY: the `de` Site, in German ─────────────────────────────────────────────────────────────
      await cdp.navigate(`http://${GERMANY_HOST}:${port}/de/de`);
      await harness.waitReady(cdp);
      const germany = await cdp.evaluate(UI_PROBE);

      harness.check(rows, `${name}: Germany /de/de commits on the public pathname`, germany.path === "/de/de", germany.path);
      harness.check(rows, `${name}: Germany renders NO Site control (§11)`, germany.sitePresent === false, JSON.stringify(germany.selectors));
      harness.check(
        rows,
        `${name}: Germany exposes NO Location control after geographic retirement (§13/R03)`,
        germany.locationPresent === false &&
          (germany.locationOptions ?? []).length === 0,
        JSON.stringify(germany.locationOptions),
      );
      harness.check(rows, `${name}: Germany offers its Language control on de`, germany.languagePresent === true && germany.languageValue === "de", String(germany.languageValue));
      harness.check(rows, `${name}: Germany renders no error overlay`, germany.hasErrorText === false, germany.text.slice(0, 80));
      harness.check(rows, `${name}: Germany leaks no internal Spoke prefix into ANY URL`, !germany.urls.some((url) => url.includes("~spoke")), "");
      harness.check(rows, `${name}: Germany never names the Foundation Spoke's asset namespace (§30)`, !germany.urls.some((url) => url.includes("/spokes/foundation/assets/")), "");
      harness.check(rows, `${name}: Germany's navigation speaks German, never raw dictionary keys`, germany.navTexts.includes(context.germanyDictionary.de.navigation.items["/"]) && !germany.text.includes("navigation.items"), JSON.stringify(germany.navTexts.slice(0, 4)));

      // ── GERMANY in ENGLISH: the same Site, its other language ─────────────────────────────────────────
      await cdp.navigate(`http://${GERMANY_HOST}:${port}/de/en/about`);
      await harness.waitReady(cdp);
      const germanyEnglish = await cdp.evaluate(UI_PROBE);

      harness.check(rows, `${name}: Germany /de/en/about commits on the public pathname`, germanyEnglish.path === "/de/en/about", germanyEnglish.path);
      harness.check(
        rows,
        `${name}: Germany's English page also exposes NO Location control`,
        germanyEnglish.locationPresent === false &&
          (germanyEnglish.locationOptions ?? []).length === 0,
        JSON.stringify(germanyEnglish.locationOptions),
      );
      harness.check(rows, `${name}: Germany's English page names English`, germanyEnglish.languageValue === "en", String(germanyEnglish.languageValue));
      harness.check(rows, `${name}: Germany's English page renders no error overlay`, germanyEnglish.hasErrorText === false, germanyEnglish.text.slice(0, 80));

      // ── CROSS-SPOKE DISCOVERABILITY (M19 §9): the two public websites link to EACH OTHER ────────────
      //
      // The M19 human checkpoint found the defect: the Germany website was unreachable from the
      // Foundation website by any discoverable link (the Site control is gone BY DESIGN — one Site per
      // Spoke, M18 §11). The correction is ordinary authored secondary navigation, so what is proved here
      // is what a VISITOR receives: an anchor carrying the target's own public origin, its localized
      // label, and new-tab external semantics.
      const discovered = (probe, href) =>
        probe.externalLinks.find((link) => link.href === href) ?? null;

      const foundationToGermany = discovered(foundation, `${GERMANY_ORIGIN}/`);
      harness.check(
        rows,
        `${name}: Foundation /ww/en VISIBLY links to the Germany website (M19 discoverability)`,
        foundationToGermany !== null &&
          foundationToGermany.label === "Germany" &&
          foundationToGermany.target === "_blank" &&
          /noreferrer/.test(foundationToGermany.rel),
        JSON.stringify(foundation.externalLinks),
      );

      const germanyToFoundation = discovered(germany, `${FOUNDATION_ORIGIN}/`);
      harness.check(
        rows,
        `${name}: Germany /de/de VISIBLY links back to the Foundation website (M19 discoverability)`,
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
      await cdp.navigate(`http://${FOUNDATION_HOST}:${port}/ww/de`);
      await harness.waitReady(cdp);
      const foundationGerman = await cdp.evaluate(UI_PROBE);
      const germanyInGerman = discovered(foundationGerman, `${GERMANY_ORIGIN}/`);
      harness.check(
        rows,
        `${name}: Foundation /ww/de labels the Germany website "Deutschland"`,
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
      // (`/de/en`), a browser with no preference or a German preference on `/de/de`. What must hold — and
      // what these checks assert — is that the TARGET Spoke performs its OWN completion INSIDE ITS OWN
      // Site, never crossing to the other website.
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
          `${name}: following the Foundation link reaches the GERMANY website, which completes its own root inside Site de`,
          /^\/de\/(de|en)$/.test(arrived.path) &&
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
          `${name}: following the Germany link reaches the FOUNDATION website, which completes its own root inside Site ww`,
          /^\/ww\/(en|de)$/.test(arrived.path) &&
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
