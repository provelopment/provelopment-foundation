/**
 * EFS SEMANTIC NEUTRALITY (S3-E3-R03, reconciled in GEO-03 R04-C20)
 * =================================================================
 *
 * Actual HTTP output for deliberately non-geographic names: Entity `e_…03`, Facet `north`, Site `place`,
 * Page `city` at route `/frankfurt`, prefix `zz`, Host `localhost`. Nothing about those names is German, and
 * nothing about them is geographic — which is the point: the language comes from the DECLARED representation,
 * not from the city, the prefix, the Site or the Host.
 *
 * WHAT CHANGED IN R04-C20, AND WHAT DID NOT. The fixture had already been qualified to the GEO-03 language
 * identities (`de-DE`, `en-001`), but this scenario still asked for `/zz/de/frankfurt`, `/zz/en/frankfurt`, a
 * bare `lang="de"` and — explicitly — the ABSENCE of `de-DE`. It therefore polled a retired route for four
 * minutes and reported one failed completion row. The routes, language tags and canonicals below now state the
 * publication that exists. Every semantic guarantee the old file protected is preserved, and one is added: a
 * bare, unqualified language is refused just as an undeclared one is.
 *
 * The `de-DE` identity is proved POSITIVELY here. It is a declared canonical language identity, so "must not
 * appear" would now be an assertion that truth is a failure.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const id = "efs-semantic";

const PORT_OFFSETS = [81, 82, 83];
const READINESS_BUDGET_MS = 90000;

/** Managed prefix, Site-closed publication: no `/place/` selector, and `zz` is a prefix, not a region. */
const GERMAN_PATH = "/zz/de-de/frankfurt";
const ENGLISH_PATH = "/zz/en-001/frankfurt";
const GERMAN_CANONICAL = `https://localhost${GERMAN_PATH}`;
const ENGLISH_CANONICAL = `https://localhost${ENGLISH_PATH}`;
const GERMAN = "de-DE";
const ENGLISH = "en-001";
const ENTITY_ID = "e_00000000000000000000000003";

const ENVIRONMENT_KEYS = ["FOUNDATION_EFS_MANIFEST", "FOUNDATION_EFS_CAPSULE"];
const INSTALLATION_PREFIX = "foundation-efs-semantic-";

async function request(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  return { status: response.status, location: response.headers.get("location"), body: await response.text() };
}

function analyze(body) {
  const first = (pattern) => pattern.exec(body)?.[1] ?? "";
  const alternates = {};
  for (const match of body.matchAll(/hrefLang="([^"]+)" href="([^"]+)"/g)) alternates[match[1]] = match[2];
  return {
    lang: first(/<html lang="([^"]*)"/),
    canonical: first(/rel="canonical" href="([^"]*)"/),
    ogLocale: first(/property="og:locale" content="([^"]*)"/),
    title: first(/<title>([^<]*)<\/title>/),
    alternates,
    headings: [...body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((match) =>
      match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(),
    ),
  };
}

/** Capture the ORIGINAL state, including "absent" — which is not the same thing as an undefined value. */
function captureEnvironment() {
  const captured = {};
  for (const key of ENVIRONMENT_KEYS) {
    captured[key] = Object.hasOwn(process.env, key) ? process.env[key] : undefined;
  }
  return captured;
}

/** Restore the original state exactly: an originally absent variable is DELETED, never assigned. */
function restoreEnvironment(captured) {
  for (const key of ENVIRONMENT_KEYS) {
    if (captured[key] === undefined) delete process.env[key];
    else process.env[key] = captured[key];
  }
}

function environmentRestored(captured) {
  return ENVIRONMENT_KEYS.every((key) =>
    captured[key] === undefined ? !Object.hasOwn(process.env, key) : process.env[key] === captured[key],
  );
}

/**
 * ONE disposable Installation declaring the `north-spoke` this fixture publishes into. A copy of a real Spoke
 * keeps the runtime identity genuine; the copy is temporary, so the shipped Installation is untouched.
 *
 * The directory is created by the CALLER and passed in, and this function only fills it. That ordering is the
 * point: a failure here — a missing Spoke to copy, a full disk, a permission error — must not be able to lose
 * the path, because whoever owns the path is the only one that can remove a half-written Installation.
 */
function populateInstallation(installation, repositoryRoot) {
  const spokes = path.join(installation, "spokes");
  mkdirSync(spokes, { recursive: true });
  cpSync(path.join(repositoryRoot, "deployment", "spokes", "foundation"), path.join(spokes, "north-spoke"), {
    recursive: true,
  });
  writeFileSync(
    path.join(installation, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "north-spoke", root: "spokes/north-spoke" }] }, null, 2)}\n`,
    "utf8",
  );
}

/** Every disposable Installation this scenario could have left behind, so a leak is counted, not assumed away. */
function temporaryInstallations() {
  try {
    return readdirSync(tmpdir()).filter((name) => name.startsWith(INSTALLATION_PREFIX));
  } catch {
    return [];
  }
}

const describeError = (error) => (error instanceof Error ? error.message : String(error));


/**
 * Readiness is bounded and content-bound: a 200 from any other route is no proof, so the probe must also carry
 * the declared `de-DE` language. Every candidate server is recorded by the caller BEFORE its first await, so a
 * failure at any point still stops it.
 */
async function start(harness, servers, installation) {
  let last = "no candidate port attempted";
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { synthetic: false, deploymentRoot: installation });
    servers.push(server);
    const origin = `http://localhost:${port}`;
    try {
      await harness.waitForServer(`${origin}${GERMAN_PATH}`, READINESS_BUDGET_MS);
      const probe = await request(`${origin}${GERMAN_PATH}`);
      const view = analyze(probe.body);
      if (probe.status === 200 && view.lang === GERMAN) return { port, origin };
      last = `status=${probe.status} lang=${view.lang || "-"} for ${GERMAN_PATH} (port ${port})`;
    } catch (error) {
      last = `${error instanceof Error ? error.message : String(error)} (port ${port})`;
    }
    await harness.stopServer(server);
  }
  throw new Error(`the declared neutral Page ${GERMAN_PATH} never became ready: ${last}`);
}

export async function run(_chrome, harness) {
  const rows = [];
  const servers = [];
  const previousEnvironment = captureEnvironment();
  const installationsBefore = temporaryInstallations();
  let installation = null;
  let failure = null;
  try {
    // Created here, assigned before anything can throw: from this line on, `finally` owns the removal.
    installation = mkdtempSync(path.join(tmpdir(), INSTALLATION_PREFIX));
    populateInstallation(installation, harness.repositoryRoot);
    const fixtureRoot = path.join(harness.repositoryRoot, "tests", "fixtures", "efs", "neutral");
    process.env.FOUNDATION_EFS_MANIFEST = path.join(fixtureRoot, "manifest.json");
    process.env.FOUNDATION_EFS_CAPSULE = path.join(fixtureRoot, "capsule");
    const { origin } = await start(harness, servers, installation);

    // (1) the German representation, under names that are neither German nor geographic
    const german = await request(`${origin}${GERMAN_PATH}`);
    const germanView = analyze(german.body);
    harness.check(
      rows,
      "a declared de-DE representation under non-German Facet/Site/Page names stays German",
      german.status === 200 &&
        germanView.lang === GERMAN &&
        germanView.title === "Frankfurt" &&
        germanView.ogLocale === GERMAN &&
        germanView.alternates[GERMAN] === GERMAN_CANONICAL,
      `status=${german.status} lang=${germanView.lang} og:locale=${germanView.ogLocale}`,
    );

    // (2) canonical + qualified alternates from the binding — no country, no Site selector
    harness.check(
      rows,
      "the declared locale and binding build canonical and qualified hreflang without a country or selector",
      germanView.canonical === GERMAN_CANONICAL &&
        germanView.alternates[ENGLISH] === ENGLISH_CANONICAL &&
        !german.body.includes("en-DE") &&
        !german.body.includes("/place/"),
      `canonical=${germanView.canonical} en=${germanView.alternates[ENGLISH] ?? "-"}`,
    );

    // (3) the English representation renders independently at the same Page's English URL
    const english = await request(`${origin}${ENGLISH_PATH}`);
    const englishView = analyze(english.body);
    harness.check(
      rows,
      "the declared en-001 representation renders independently under the same neutral names",
      english.status === 200 &&
        englishView.lang === ENGLISH &&
        englishView.canonical === ENGLISH_CANONICAL &&
        englishView.headings.length > 0,
      `status=${english.status} lang=${englishView.lang} canonical=${englishView.canonical}`,
    );

    // (4) a city-named Page creates no geography
    harness.check(
      rows,
      "the city-named Page has no city/place record, region route or timezone",
      !german.body.includes("Europe/Berlin") &&
        !german.body.includes("data-region") &&
        !german.body.includes('aria-label="Location"') &&
        !german.body.includes("/frankfurt/berlin"),
      "ordinary Page only, no geographic runtime state",
    );

    // (5) explicit authoring still works — neutrality must not be achieved by suppression
    harness.check(
      rows,
      "explicitly authored contact properties and opening hours resolve without geography",
      german.body.includes("1 Owner Way") &&
        german.body.includes("+1 555 0100") &&
        german.body.includes("Opening hours") &&
        german.body.includes("Mon-Fri 09:00-17:00") &&
        !german.body.includes("Europe/Berlin"),
      "address + phone + authored hours present, no timezone",
    );

    // (6) private identity stays private
    harness.check(
      rows,
      "identity is not visitor-facing",
      !german.body.includes(ENTITY_ID) && !english.body.includes(ENTITY_ID),
      "no EntityID in either representation",
    );

    // (7) an undeclared qualified language is refused rather than inferred
    const unsupported = await request(`${origin}/zz/fr-ca/frankfurt`);
    harness.check(
      rows,
      "an unsupported locale is refused, not inferred from a prefix or name",
      unsupported.status === 404,
      `status=${unsupported.status} for /zz/fr-ca/frankfurt`,
    );

    // (8) an unknown Page on the same binding is refused
    const missing = await request(`${origin}/zz/de-de/unknown`);
    harness.check(
      rows,
      "an unknown Page is refused",
      missing.status === 404,
      `status=${missing.status} for /zz/de-de/unknown`,
    );

    // (9) ADDED IN R04-C20: language identity is qualified, so the unqualified grammar is refused too
    const bareGerman = await request(`${origin}/zz/de/frankfurt`);
    const bareEnglish = await request(`${origin}/zz/en/frankfurt`);
    harness.check(
      rows,
      "a bare unqualified language is refused, exactly as an undeclared one is",
      bareGerman.status === 404 && bareEnglish.status === 404,
      `de=${bareGerman.status} en=${bareEnglish.status}`,
    );
  } catch (error) {
    harness.check(rows, "the EFS semantic scenario ran to completion", false, describeError(error));
    failure = error;
  } finally {
    // Every step is attempted even if an earlier one fails, and every failure is collected rather than thrown
    // out of `finally` — a cleanup error must be reported, not allowed to replace the original error.
    const cleanupFailures = [];
    for (const server of servers) {
      try {
        await harness.stopServer(server);
      } catch (error) {
        cleanupFailures.push(`server stop failed: ${describeError(error)}`);
      }
    }
    restoreEnvironment(previousEnvironment);
    if (installation) {
      try {
        rmSync(installation, { recursive: true, force: true });
      } catch (error) {
        cleanupFailures.push(`installation removal failed: ${describeError(error)}`);
      }
    }
    if (!environmentRestored(previousEnvironment)) {
      cleanupFailures.push(`environment not restored: ${ENVIRONMENT_KEYS.join(", ")}`);
    }
    // A half-written Installation is exactly the leak this check exists to catch, so the path that was actually
    // created is tested for existence — and the temp directory is re-read, so losing the path cannot hide a leak.
    const installationRemains = installation !== null && existsSync(installation);
    if (installationRemains) cleanupFailures.push(`installation still present: ${installation}`);
    const leaked = temporaryInstallations().filter((name) => !installationsBefore.includes(name));
    if (leaked.length > 0) cleanupFailures.push(`new temporary installations: ${leaked.join(", ")}`);
    if (failure && cleanupFailures.length > 0) {
      cleanupFailures.push(`original failure retained above: ${describeError(failure)}`);
    }
    // Proven rather than assumed: the run must leave no environment change and no temporary Installation.
    harness.check(
      rows,
      "no environment variable or temporary installation survives the run",
      cleanupFailures.length === 0,
      installation === null
        ? cleanupFailures.length === 0
          ? "no installation created"
          : cleanupFailures.join("; ")
        : `restored=${environmentRestored(previousEnvironment)} removed=${!installationRemains} leaked=${leaked.length}${
            cleanupFailures.length > 0 ? ` — ${cleanupFailures.join("; ")}` : ""
          }`,
    );
  }
  return rows;
}

export default { id, run };
