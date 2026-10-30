/**
 * EFS COMPUTED OPENING STATUS — BOUNDED REAL-BROWSER PROOF (`GEO-02-R02` F)
 * ========================================================================
 *
 * The `GEO-02` implementation had no browser evidence: the reference Installation authors neither
 * `openingSchedule` nor `timezone`, so nothing existing could exercise the rendered status.
 *
 * This scenario closes that gap WITHOUT migrating reference content and WITHOUT deploying anything.
 * It builds a DISPOSABLE installation (a copy of the reference Spoke, in a temp directory), points
 * the runtime at an ISOLATED authored manifest and an ISOLATED capsule, starts a real dev server,
 * and drives a real headless browser. The reference deployment's own files are never written.
 *
 * The fixture is deliberately NON-GEOGRAPHIC: three Sites named `open`, `closed` and `private` under
 * one Entity and one Facet, each published on its own explicit prefix, with the qualified locale
 * `en-001` and the time standard `Etc/UTC` as the authored zone. No country, market, region, place
 * or bare language appears anywhere.
 *
 * It proves three things a unit test cannot:
 *   1. an actually RENDERED open state, with the label taken from the dictionary authority;
 *   2. an actually RENDERED closed state;
 *   3. NO status at all when a required public input (`timezone`) is declared but withheld — and no
 *      server-side assertion even when the inputs ARE available.
 *
 * Determinism: the authored weekday is computed at run time from the authored zone, so the fixture
 * is open/closed NOW rather than at authoring time. The only excluded minute is the last of the
 * local day (the window is half-open), and the proof fails loudly rather than passing silently.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const id = "efs-schedule";

const PORT_OFFSETS = [64, 65, 66];
const ENTITY_ID = "e_00000000000000000000000009";
const FACET_ID = "acme";
const TIMEZONE = "Etc/UTC";
const WEEKDAY_KEYS = {
  Mon: "mon",
  Tue: "tue",
  Wed: "wed",
  Thu: "thu",
  Fri: "fri",
  Sat: "sat",
  Sun: "sun",
};
const ALL_WEEKDAYS = Object.values(WEEKDAY_KEYS);

function base(port) {
  return `http://localhost:${port}`;
}

/** The authored-zone weekday of "now", read through the same `Intl` authority the engine uses. */
function weekdayInZone(timeZone) {
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date());
  const key = WEEKDAY_KEYS[short];
  if (!key) throw new Error(`unexpected weekday "${short}" in ${timeZone}`);
  return key;
}

/** A whole-day window on the given weekdays (half-open, so never overnight). */
function wholeDay(days) {
  return { intervals: [{ days, open: "00:00", close: "23:59" }] };
}

/**
 * The three Sites and one Publication of the fixture, authored for THIS run.
 *
 * `open`/`closed` differ only in which weekday the interval starts on; `private` holds a valid
 * schedule and withholds the zone, which must produce no assertion rather than a guessed default.
 */
function fixtureManifest(today) {
  const otherDays = ALL_WEEKDAYS.filter((day) => day !== today);
  const siteProperties = {
    open: {
      openingSchedule: { value: wholeDay([today]), public: true },
      timezone: { value: TIMEZONE, public: true },
    },
    closed: {
      openingSchedule: { value: wholeDay(otherDays), public: true },
      timezone: { value: TIMEZONE, public: true },
    },
    private: {
      openingSchedule: { value: wholeDay([today]), public: true },
      timezone: { value: TIMEZONE, public: false },
    },
  };
  const siteIds = Object.keys(siteProperties);
  return {
    entities: [
      {
        id: ENTITY_ID,
        facets: [
          {
            id: FACET_ID,
            sites: siteIds.map((siteId) => ({
              id: siteId,
              properties: siteProperties[siteId],
              pages: [{ id: "hours", route: ["hours"], representations: [{ locale: "en-001" }] }],
            })),
          },
        ],
      },
    ],
    publications: [
      {
        id: "schedule-proof",
        spokeId: "acme-spoke",
        entityId: ENTITY_ID,
        facetId: FACET_ID,
        bindings: siteIds.map((siteId) => ({
          id: `schedule-${siteId}`,
          host: "localhost",
          prefix: [`schedule-${siteId}`],
          entityId: ENTITY_ID,
          facetId: FACET_ID,
          siteIds: [siteId],
          siteMode: "closed",
          defaultSiteId: siteId,
          locales: ["en-001"],
          defaultLocale: "en-001",
          canonical: true,
        })),
      },
    ],
  };
}

/** Reads the status element, or null when the page asserts nothing. */
async function readStatus(cdp) {
  return cdp.evaluate(`(() => {
    const node = document.querySelector('[data-efs-open]');
    if (!node) return null;
    return {
      open: node.getAttribute('data-efs-open'),
      text: (node.textContent ?? '').trim(),
      zone: node.getAttribute('data-efs-timezone'),
    };
  })()`);
}

/** Waits for hydration to produce a status, returning null if it never does. */
async function waitForStatus(cdp) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const status = await readStatus(cdp);
    if (status) return status;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

async function waitForHeading(cdp) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await cdp.evaluate(`(() => {
      const heading = document.querySelector('h1');
      return document.readyState === 'complete' && heading ? heading.textContent : null;
    })()`);
    if (ready) return ready;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("schedule fixture heading did not render");
}

async function start(harness) {
  const capsule = path.join(
    harness.repositoryRoot,
    "tests",
    "fixtures",
    "efs",
    "schedule",
    "capsule",
  );
  const previous = {
    manifest: process.env.FOUNDATION_EFS_MANIFEST,
    capsule: process.env.FOUNDATION_EFS_CAPSULE,
  };
  // ONE disposable installation: a copy of the reference Spoke, so the dictionary authority and the
  // shell resources are real. The reference deployment itself is never written.
  const installation = mkdtempSync(path.join(tmpdir(), "foundation-efs-schedule-"));
  cpSync(
    path.join(harness.repositoryRoot, "deployment", "spokes", "foundation"),
    path.join(installation, "spokes", "acme-spoke"),
    { recursive: true },
  );
  mkdirSync(path.join(installation, "spokes"), { recursive: true });
  writeFileSync(
    path.join(installation, "spokes.json"),
    `${JSON.stringify({ spokes: [{ id: "acme-spoke", root: "spokes/acme-spoke" }] }, null, 2)}\n`,
    "utf8",
  );

  // The authored schedule is written for THIS RUN (its weekday is the current one in the authored
  // zone), so no date-dependent fixture is committed.
  const today = weekdayInZone(TIMEZONE);
  const manifestFile = path.join(installation, "schedule-manifest.json");
  writeFileSync(manifestFile, `${JSON.stringify(fixtureManifest(today), null, 2)}\n`, "utf8");
  process.env.FOUNDATION_EFS_MANIFEST = manifestFile;
  process.env.FOUNDATION_EFS_CAPSULE = capsule;

  const labels = JSON.parse(
    readFileSync(
      path.join(installation, "spokes", "acme-spoke", "config", "i18n", "en.json"),
      "utf8",
    ),
  ).business;

  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { synthetic: false, deploymentRoot: installation });
    try {
      await harness.waitForServer(`${base(port)}/schedule-open/en-001/hours`, 240000);
      return { server, port, previous, installation, labels, today };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  rmSync(installation, { recursive: true, force: true });
  if (previous.manifest === undefined) delete process.env.FOUNDATION_EFS_MANIFEST;
  else process.env.FOUNDATION_EFS_MANIFEST = previous.manifest;
  process.env.FOUNDATION_EFS_CAPSULE = previous.capsule;
  throw last ?? new Error("no schedule-fixture port answered");
}


export async function run(chrome, harness) {
  const rows = [];
  let started = null;
  let cdp = null;
  try {
    started = await start(harness);
    const { port, labels, today } = started;
    const origin = base(port);

    // 1 — NO server-side assertion, even though both inputs are public and valid. A statically
    // generated Page must never bake a build-time open/closed answer into its HTML.
    const openHtml = await fetch(`${origin}/schedule-open/en-001/hours`, {
      signal: AbortSignal.timeout(30000),
    }).then((response) => response.text());
    harness.check(
      rows,
      "server HTML carries no open/closed assertion",
      !openHtml.includes("data-efs-open"),
      `authored weekday ${today}`,
    );

    const { Cdp } = await import("./cdp.mjs");
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(
      harness.viewports.desktop.width,
      harness.viewports.desktop.height,
    );

    // 2 — a REAL rendered OPEN state, labelled from the dictionary authority.
    await cdp.navigate(`${origin}/schedule-open/en-001/hours`);
    await waitForHeading(cdp);
    const open = await waitForStatus(cdp);
    harness.check(rows, "open Site renders a computed status", open !== null, JSON.stringify(open));
    harness.check(
      rows,
      "the open state is truthful",
      open?.open === "true",
      JSON.stringify(open),
    );
    harness.check(
      rows,
      "the open label comes from the dictionary authority",
      open?.text === labels.open,
      `rendered="${open?.text}" dictionary="${labels.open}"`,
    );
    harness.check(
      rows,
      "the status names the AUTHORED zone",
      open?.zone === TIMEZONE,
      JSON.stringify(open?.zone),
    );

    // 3 — a REAL rendered CLOSED state on the same page, from the same authority.
    await cdp.navigate(`${origin}/schedule-closed/en-001/hours`);
    await waitForHeading(cdp);
    const closed = await waitForStatus(cdp);
    harness.check(
      rows,
      "closed Site renders a computed status",
      closed !== null,
      JSON.stringify(closed),
    );
    harness.check(
      rows,
      "the closed state is truthful",
      closed?.open === "false",
      JSON.stringify(closed),
    );
    harness.check(
      rows,
      "the closed label comes from the dictionary authority",
      closed?.text === labels.closed,
      `rendered="${closed?.text}" dictionary="${labels.closed}"`,
    );
    harness.check(
      rows,
      "open and closed are distinguishable in the browser",
      open?.text !== closed?.text,
      `${open?.text} / ${closed?.text}`,
    );

    // 4 — NO status when a required public input is withheld (the zone is declared but private).
    await cdp.navigate(`${origin}/schedule-private/en-001/hours`);
    await waitForHeading(cdp);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const withheld = await readStatus(cdp);
    harness.check(
      rows,
      "a private timezone produces NO status",
      withheld === null,
      JSON.stringify(withheld),
    );
    const headingPresent = await cdp.evaluate(
      `(() => document.body.textContent.includes(${JSON.stringify(labels.hoursLabel)}))()`,
    );
    harness.check(
      rows,
      "a withheld input renders no hours heading either",
      headingPresent === false,
      `heading "${labels.hoursLabel}" present=${headingPresent}`,
    );
    const leaked = await cdp.evaluate(
      `(() => document.body.textContent.includes(${JSON.stringify(TIMEZONE)}))()`,
    );
    harness.check(
      rows,
      "the withheld zone never reaches the page",
      leaked === false,
      `zone present=${leaked}`,
    );
  } finally {
    if (cdp) await cdp.close();
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

