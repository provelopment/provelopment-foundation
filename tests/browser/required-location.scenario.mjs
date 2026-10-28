/**
 * THE REQUIRED-LOCATION POLICY, PROVED THROUGH A REAL SERVER AND A REAL BROWSER (FOUNDATION-LOC1)
 * =============================================================================================
 *
 * WHAT THIS SCENARIO EXISTS FOR. `tests/unit/location-selection.test.ts` proves the rules through the
 * public path completion and the selector's pure ordering. This scenario proves the SAME capability where
 * it crosses the two boundaries a unit test cannot reach: an HTTP request (is the public completion really
 * a redirect, and is it ONE hop?) and a browser (does the visitor SEE a Location control with no
 * unspecified option, and does using it move the URL inside the Location namespace?).
 *
 * TWO DEPLOYMENTS, ONE DIFFERENCE. The scenario materialises TWO disposable copies of the committed
 * synthetic fixture in OS temp: one whose Site declares a required-Location policy — `{ "mode":
 * "required", "default": "north", "localeDefaults": { "de": "south" } }`, the LOC2 refinement included —
 * and the untouched one. Both are started, and the SAME assertions are measured on each — which is what
 * makes "an absent policy changes nothing" a measurement rather than a claim. The refinement is measured
 * the same way: the SAME Site answers `/ca/en` with its site-wide default and `/ca/de` with the Location
 * the adopter named FOR THAT LOCALE, so the difference is authored data and not inference.
 *
 * NO DEPLOYMENT IS MUTATED: the copies live in OS temp (the harness's own write domain), the shipped
 * fixture is only ever read, and both copies are removed when the run ends.
 *
 * OWNERSHIP. This is a FOUNDATION contract (a platform capability, not one deployment's copy), so it lives
 * in the harness's own directory and runs in the foundation scope.
 */
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's `presentation` label. */
export const id = "required-location";

/** The committed fixture every generic scenario is derived from — READ, never written. */
const FIXTURE = ["tests", "fixtures", "synthetic-deployment"];

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [31, 32, 33];

/**
 * ONE HTTP response, with redirects NOT followed — the only way a public completion is observable as what
 * it is: a `307` and a `Location`, produced inside the request-selected Spoke.
 */
async function request(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  return { status: response.status, location: response.headers.get("location"), body: await response.text() };
}

/** A disposable copy of the fixture, optionally patched, in the harness's own OS-temp domain. */
async function materializeFixture(harness, patch) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-required-location-"));
  harness.cpSync(path.join(harness.repositoryRoot, ...FIXTURE), root, { recursive: true });

  const configPath = path.join(root, "site.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  await patch(harness, root, config);
  await harness.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  return {
    root,
    dictionary: JSON.parse(readFileSync(path.join(root, "config", "i18n", "en.json"), "utf8")),
  };
}

/** The `ca` Site of the fixture — the one Site of it that HAS Locations. */
function canadaSite(config) {
  return config.sites.find((site) => site.code === "ca");
}

/**
 * The policy under test: `ca` REQUIRES its `north` Location, and REFINES its `de` locale to `south`
 * (FOUNDATION-LOC2). `about` exists as a page in both Locations, so a completed page is observable too.
 *
 * The refinement is exactly what LOC2 adds: authored data naming the Location that completes an
 * otherwise Location-less request FOR ONE LOCALE. Nothing in the platform knows that `de` "is" `south`;
 * this patch is the adopter.
 */
async function requireNorthLocation(harness, root, config) {
  // The Site serves BOTH locales, and binds a Location in each — the shape a refinement needs (rule 8
  // refuses a refinement whose Location has no landing in its OWN locale).
  canadaSite(config).locales = ["en", "de"];
  canadaSite(config).locationSelection = {
    mode: "required",
    default: "north",
    localeDefaults: { de: "south" },
  };
  config.business.pages.push(
    { site: "ca", locale: "en", region: "north", slug: "about" },
    { site: "ca", locale: "de", region: "south" },
    { site: "ca", locale: "de", region: "south", slug: "about" },
    { site: "ca", locale: "de", region: "north" },
  );

  // A regional PAGE reuses the accepted content model — its own file inside the Location's directory —
  // so the copy authors one: byte-for-byte the Site+locale page the fixture already ships, copied to the
  // Location's directory. The copy is DISPOSABLE, and the scenario authors nothing the test does not
  // assert (no prose is parsed, no expectation is read from it).
  harness.cpSync(
    path.join(root, "content", "pages", "markdown", "ca", "en", "about.md"),
    path.join(root, "content", "pages", "markdown", "ca", "en", "north", "about.md"),
    { recursive: false },
  );
  // The SAME for the refined locale's own pages: a `de` landing per Location (the fixture's landing
  // files are named after the Location) and the `de` about page of the refined Location.
  for (const [from, to] of [
    [["ca", "en", "south.md"], ["ca", "de", "south.md"]],
    [["ca", "en", "north.md"], ["ca", "de", "north.md"]],
    [["ca", "en", "about.md"], ["ca", "de", "south", "about.md"]],
  ]) {
    harness.cpSync(
      path.join(root, "content", "pages", "markdown", ...from),
      path.join(root, "content", "pages", "markdown", ...to),
      { recursive: false },
    );
  }
}

/**
 * THE BROWSER'S OWN BASE URL — `localhost`, never `127.0.0.1`.
 *
 * Next.js's dev server blocks JS/HMR chunks requested from `127.0.0.1` as a cross-origin dev request
 * (unless `allowedDevOrigins` is set), so an app loaded that way never activates and every visitor action
 * is inert. `localhost` is an allowed dev origin by default. Raw HTTP probes are unaffected (they run no
 * client runtime), which is why only the BROWSER's URLs use this base.
 */
function browserBase(port) {
  return `http://localhost:${port}`;
}

/** One visitor action on the Location control, reproduced as the browser itself performs it. */
async function dispatchLocationChange(cdp, value) {
  return cdp.evaluate(
    `(() => {
       const select = document.querySelector('[data-selector="location"]');
       if (!select) return false;
       // WHAT A REAL SELECTION DOES. React tracks a node's value property, so a plain assignment is
       // seen as "no change" and never reaches the control's handler. The NATIVE setter reproduces what
       // the browser does when a visitor picks an option, and the bubbling change event then reaches
       // React exactly as a real one does.
       const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
       setValue.call(select, ${JSON.stringify(value)});
       select.dispatchEvent(new Event("change", { bubbles: true }));
       return true;
     })()`,
  );
}

/**
 * ACTIVATE the control, and await the transition it produces through the harness's OWN readiness layer
 * (BR1: a visitor action is awaited by the route the next assertion reads).
 *
 * The action is retried, and only the action: a dev server's client runtime activates asynchronously, so an
 * action dispatched before it is interactive cannot have an effect. The ASSERTION is never relaxed — the
 * control must move the URL, or this returns `false` and the check fails.
 */
async function activateLocationControl(harness, cdp, value, expectedPath, attempts = 4) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await dispatchLocationChange(cdp, value);
    try {
      await harness.waitReady(cdp, { path: expectedPath });
      return true;
    } catch {
      /* the runtime was not yet interactive: retry the visitor action */
    }
  }
  return false;
}

/** The Location control's options as the browser sees them, or `null` when it is not rendered. */
async function readLocationControl(cdp) {
  return cdp.evaluate(
    `(() => {
       const select = document.querySelector('[data-selector="location"]');
       if (!select) return null;
       return {
         value: select.value,
         values: [...select.options].map((option) => option.value),
         labels: [...select.options].map((option) => option.textContent || ""),
       };
     })()`,
  );
}

/** THE REQUIRED COPY — the public completions, ONE hop, on a real server. */
async function requiredHttpProof(harness, rows, port) {
  const base = `http://127.0.0.1:${port}`;
  const completions = [
    ["/ca", "/ca/en/north"],
    // An UNMAPPED locale keeps the site-wide default — this Site refines `de`, not `en`.
    ["/ca/en", "/ca/en/north"],
    ["/ca/en/about", "/ca/en/north/about"],
    // The untouched Site is the control: its completions are exactly the established ones.
    ["/", "/ww/en"],
    ["/en/about", "/ww/en/about"],
  ];

  for (const [from, to] of completions) {
    const response = await request(`${base}${from}`);
    harness.check(
      rows,
      `${from} is completed into ${to} by a public redirect`,
      response.status === 307 && response.location === to,
      `status=${response.status} location=${response.location}`,
    );
  }

  // LOC2 — THE EXPLICIT LOCALE REFINEMENT. A Location-less request in the REFINED locale is completed
  // into the Location the ADOPTER named for it, through the SAME one public redirect; nothing infers it.
  for (const [from, to] of [
    ["/ca/de", "/ca/de/south"],
    ["/ca/de/about", "/ca/de/south/about"],
  ]) {
    const response = await request(`${base}${from}`);
    harness.check(
      rows,
      `${from} (the refined locale) is completed into ${to}`,
      response.status === 307 && response.location === to,
      `status=${response.status} location=${response.location}`,
    );
  }

  // …and THE URL WINS, in the refined locale too: a request that already names a Location is answered
  // exactly as it is, whether it names the refined one or another.
  for (const served of ["/ca/de/south", "/ca/de/north", "/ca/de/south/about"]) {
    const response = await request(`${base}${served}`);
    harness.check(rows, `${served} renders (200)`, response.status === 200, `status=${response.status}`);
  }

  for (const served of ["/ca/en/north", "/ca/en/north/about", "/ca/en/south", "/ww/en", "/ww/en/about"]) {
    const response = await request(`${base}${served}`);
    harness.check(rows, `${served} renders (200)`, response.status === 200, `status=${response.status}`);
  }
}

/** THE REQUIRED COPY — its own canonical inventory advertises no unspecified destination. */
async function requiredSitemapProof(harness, rows, port, locationIds) {
  const response = await request(`http://127.0.0.1:${port}/sitemap.xml`);
  const urls = [...response.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
  const canada = urls.filter((url) => new URL(url).pathname.startsWith("/ca/"));
  const regions = canada.map((url) => new URL(url).pathname.split("/")[3] ?? "");
  const unspecified = canada.filter((url) => !locationIds.includes(new URL(url).pathname.split("/")[3] ?? ""));

  harness.check(
    rows,
    "the sitemap publishes the required Site's Location inventory",
    canada.length > 0 && regions.includes("north") && regions.includes("south"),
    `entries=${canada.join(", ")}`,
  );
  harness.check(
    rows,
    "the sitemap advertises NO unspecified URL of that Site",
    unspecified.length === 0,
    unspecified.join(", "),
  );
}

/** THE REQUIRED COPY — the visitor's control, and what using it does. */
async function requiredBrowserProof(harness, rows, chrome, port, dictionary) {
  const cdp = await Cdp.connect(chrome);
  const base = browserBase(port);

  try {
    await cdp.navigate(`${base}/ca/en`);
    // BR1 — the document's shell AND the route the next assertions read: the public redirect lands the
    // visitor in the configured default Location.
    let landed = true;
    try {
      await harness.waitReady(cdp, { path: "/ca/en/north" });
    } catch (error) {
      landed = false;
      harness.check(rows, "a BROWSER reaches the default Location's URL", false, String(error));
    }
    if (landed) {
      harness.check(
        rows,
        "a BROWSER is landed in the configured default Location by the public redirect",
        true,
        "/ca/en/north",
      );
    }

    const control = await readLocationControl(cdp);
    harness.check(
      rows,
      "the Location control offers NO unspecified option",
      control !== null && !control.labels.includes(dictionary.location.unspecified),
      JSON.stringify(control?.labels ?? null),
    );
    harness.check(
      rows,
      "the configured default Location leads the control",
      control?.values[0] === "north",
      JSON.stringify(control?.values ?? null),
    );

    const switched = await activateLocationControl(harness, cdp, "south", "/ca/en/south");
    harness.check(
      rows,
      "using the control moves the URL inside the Location namespace",
      switched,
      switched ? "/ca/en/south" : "the control did not move the URL",
    );

    // LOC2 — THE REFINED LOCALE. A Location-less URL lands in the Location the ADOPTER named for that
    // locale, and the control leads with it. Nothing in the platform associates the language with the
    // place: this is authored configuration, which is exactly what makes it measurable here.
    await cdp.navigate(`${base}/ca/de`);
    let refinedLanded = true;
    try {
      await harness.waitReady(cdp, { path: "/ca/de/south" });
    } catch (error) {
      refinedLanded = false;
      harness.check(rows, "a BROWSER reaches the REFINED Location's URL", false, String(error));
    }
    if (refinedLanded) {
      harness.check(rows, "a BROWSER reaches the REFINED Location's URL", true, "/ca/de/south");
    }

    const refinedControl = await readLocationControl(cdp);
    harness.check(
      rows,
      "the refined locale's control offers NO option with an empty value",
      refinedControl !== null && !refinedControl.values.includes(""),
      JSON.stringify(refinedControl?.values ?? null),
    );
    harness.check(
      rows,
      "the REFINED Location leads the control in its own locale",
      refinedControl?.values[0] === "south",
      JSON.stringify(refinedControl?.values ?? null),
    );
    harness.check(
      rows,
      "the refined locale's control selects the URL's own Location",
      refinedControl?.value === "south",
      `value=${refinedControl?.value ?? "(none)"}`,
    );
  } finally {
    await cdp.close();
  }
}


/** A dev server for one copy, on a port that answers. */
async function startServer(harness, root) {
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { deploymentRoot: root });
    try {
      // The readiness URL is a path BOTH copies answer with 200 — the untouched Site's locale root.
      await harness.waitForServer(`http://127.0.0.1:${port}/ww/en`, 240000);
      return { server, port };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no port answered for the required-location scenario");
}

/** THE UNTOUCHED COPY — the established optional behaviour, measured on a real server and browser. */
async function optionalProof(harness, rows, chrome, port, dictionary, locationIds) {
  const base = `http://127.0.0.1:${port}`;

  const localeRoot = await request(`${base}/ca/en`);
  harness.check(
    rows,
    "a Site with NO policy still answers its non-regional path (no redirect)",
    localeRoot.status === 200,
    `status=${localeRoot.status} location=${localeRoot.location}`,
  );
  const bareSite = await request(`${base}/ca`);
  harness.check(
    rows,
    "…and a bare Site path is still completed exactly as before",
    bareSite.status === 307 && bareSite.location === "/ca/en",
    `status=${bareSite.status} location=${bareSite.location}`,
  );

  // The canonical inventory of an optional Site still carries its own non-regional destinations.
  const sitemap = await request(`${base}/sitemap.xml`);
  const urls = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
  const flat = urls.filter((url) => {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/ca/") && !locationIds.includes(pathname.split("/")[3] ?? "");
  });
  harness.check(
    rows,
    "…and its sitemap still publishes those non-regional destinations",
    flat.length > 0,
    flat.join(", "),
  );

  const cdp = await Cdp.connect(chrome);
  try {
    await cdp.navigate(`${browserBase(port)}/ca/en`);
    await harness.waitReady(cdp, { path: "/ca/en" });
    const control = await readLocationControl(cdp);
    harness.check(
      rows,
      "its Location control still offers the unspecified option FIRST",
      control?.labels[0] === dictionary.location.unspecified,
      JSON.stringify(control?.labels ?? null),
    );
  } finally {
    await cdp.close();
  }
}

/**
 * RUN IT: two disposable copies, two servers, ONE difference — and the same assertions on each.
 */
export async function run(chrome, harness) {
  const rows = [];
  let requiredCopy = null;
  let optionalCopy = null;
  let requiredServer = null;
  let optionalServer = null;

  try {
    requiredCopy = await materializeFixture(harness, requireNorthLocation);
    optionalCopy = await materializeFixture(harness, async () => undefined);

    // ONE SERVER AT A TIME: Next refuses a second `next dev` for the same project directory, so the
    // required copy's server is STOPPED (and awaited) before the untouched copy's server starts.
    const requiredRun = await startServer(harness, requiredCopy.root);
    requiredServer = requiredRun.server;
    await requiredHttpProof(harness, rows, requiredRun.port);
    await requiredSitemapProof(harness, rows, requiredRun.port, ["north", "south"]);
    await requiredBrowserProof(harness, rows, chrome, requiredRun.port, requiredCopy.dictionary);
    await harness.stopServer(requiredServer);
    requiredServer = null;

    const optionalRun = await startServer(harness, optionalCopy.root);
    optionalServer = optionalRun.server;
    await optionalProof(
      harness,
      rows,
      chrome,
      optionalRun.port,
      optionalCopy.dictionary,
      ["north", "south"],
    );
  } catch (error) {
    harness.check(
      rows,
      "the required-location scenario ran to completion",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    for (const server of [requiredServer, optionalServer]) {
      try {
        await harness.stopServer(server);
      } catch {
        /* the server is already gone */
      }
    }
    for (const copy of [requiredCopy, optionalCopy]) {
      if (copy !== null) harness.rmSync(copy.root, { recursive: true, force: true });
    }
  }

  return rows;
}

export default { id, run };
