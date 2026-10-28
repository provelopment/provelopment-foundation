/**
 * EFS SEMANTIC NEUTRALITY (S3-E3-R03)
 * ===================================
 *
 * Actual HTTP output for deliberately non-geographic names: Entity `e_…03`, Facet `north`, Site
 * `place`, Page `city` at `/frankfurt`, prefix `zz`. The declared `de` representation stays German;
 * no `de-DE`/`en-DE`, city record, region, timezone or implicit address appears. Explicitly authored
 * contact properties DO appear, proving that explicit data is not being suppressed to fake neutrality.
 */
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const id = "efs-semantic";

const PORT_OFFSETS = [81, 82, 83];

async function request(url) {
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(30000) });
  return { status: response.status, location: response.headers.get("location"), body: await response.text() };
}

async function start(harness) {
  const root = path.join(harness.repositoryRoot, "tests", "fixtures", "efs", "neutral");
  const previous = {
    manifest: process.env.FOUNDATION_EFS_MANIFEST,
    capsule: process.env.FOUNDATION_EFS_CAPSULE,
  };
  process.env.FOUNDATION_EFS_MANIFEST = path.join(root, "manifest.json");
  process.env.FOUNDATION_EFS_CAPSULE = path.join(root, "capsule");
  // The neutral publication names the REAL Spoke `north-spoke`; declare it in a disposable explicit
  // Installation so the owner check resolves a genuine runtime identity.
  const installation = mkdtempSync(path.join(tmpdir(), "foundation-efs-semantic-"));
  cpSync(
    path.join(harness.repositoryRoot, "deployment", "spokes", "foundation"),
    path.join(installation, "spokes", "north-spoke"),
    { recursive: true },
  );
  mkdirSync(path.join(installation, "spokes"), { recursive: true });
  writeFileSync(
    path.join(installation, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "north-spoke", root: "spokes/north-spoke" }] }, null, 2)}\n`,
    "utf8",
  );
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.basePort + offset;
    const server = harness.startDevServer(port, { synthetic: false, deploymentRoot: installation });
    try {
      await harness.waitForServer(`http://localhost:${port}/zz/de/frankfurt`, 240000);
      return { server, port, previous, installation };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  rmSync(installation, { recursive: true, force: true });
  if (previous.manifest === undefined) delete process.env.FOUNDATION_EFS_MANIFEST;
  else process.env.FOUNDATION_EFS_MANIFEST = previous.manifest;
  process.env.FOUNDATION_EFS_CAPSULE = previous.capsule;
  throw last ?? new Error("no EFS semantic port answered");
}

export async function run(_chrome, harness) {
  const rows = [];
  let started = null;
  try {
    started = await start(harness);
    const origin = `http://localhost:${started.port}`;

    const german = await request(`${origin}/zz/de/frankfurt`);
    harness.check(
      rows,
      "a `de` representation under non-German Facet/Site/Page names stays German",
      german.status === 200 &&
        german.body.includes('<html lang="de"') &&
        german.body.includes("<title>Frankfurt</title>") &&
        german.body.includes('hrefLang="de"') &&
        !german.body.includes("de-DE"),
      `status=${german.status}`,
    );
    harness.check(
      rows,
      "the declared locale and binding build canonical/hreflang without a country",
      german.body.includes('rel="canonical" href="https://localhost/zz/de/frankfurt"') &&
        german.body.includes('hrefLang="en"') &&
        !german.body.includes("en-DE"),
      "canonical /zz/de/frankfurt, hreflang de/en",
    );
    const english = await request(`${origin}/zz/en/frankfurt`);
    harness.check(
      rows,
      "the declared `en` representation remains English under the same neutral names",
      english.status === 200 && english.body.includes('<html lang="en"') && !english.body.includes("en-DE"),
      `status=${english.status}`,
    );
    harness.check(
      rows,
      "the city-named Page has no city/place record, region route or timezone",
      !german.body.includes("Europe/Berlin") &&
        !german.body.includes("data-region") &&
        !german.body.includes('aria-label="Location"') &&
        !german.body.includes("/frankfurt/berlin"),
      "ordinary Page only",
    );
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
    harness.check(
      rows,
      "identity is not visitor-facing",
      !german.body.includes("e_00000000000000000000000003"),
      "no EntityID",
    );
    const unsupported = await request(`${origin}/zz/fr/frankfurt`);
    harness.check(
      rows,
      "an unsupported locale is refused, not inferred from a prefix or name",
      unsupported.status === 404,
      `status=${unsupported.status}`,
    );
    const missing = await request(`${origin}/zz/de/unknown`);
    harness.check(rows, "an unknown Page is refused", missing.status === 404, `status=${missing.status}`);
  } catch (error) {
    harness.check(rows, "the EFS semantic scenario ran to completion", false, error instanceof Error ? error.message : String(error));
  } finally {
    if (started) {
      await harness.stopServer(started.server);
      if (started.previous.manifest === undefined) delete process.env.FOUNDATION_EFS_MANIFEST;
  else process.env.FOUNDATION_EFS_MANIFEST = started.previous.manifest;
      process.env.FOUNDATION_EFS_CAPSULE = started.previous.capsule;
      rmSync(started.installation, { recursive: true, force: true });
    }
  }
  return rows;
}

export default { id, run };
