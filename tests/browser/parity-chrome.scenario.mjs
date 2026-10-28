/**
 * THE PARITY-CHROME SURFACES, PROVED IN A REAL BROWSER (R1)
 * ========================================================
 *
 * WHAT THIS SCENARIO EXISTS FOR. `tests/unit/parity-chrome.test.tsx` proves the MARKUP contract. Three of the
 * owner's requirements are GEOMETRIC, though, and only a browser can measure them:
 *
 *   1. the bottom bar carries EVERY configured destination and WRAPS (no "More" overflow) — measured at
 *      390/700/1024/1280, with the menu-bar layout presented at every width;
 *   2. a long footer value stays INSIDE its own column and never grows the document horizontally, and the
 *      footer's section headings share one visible top;
 *   3. the site-wide notice renders on EVERY page of a Spoke that presents it — and on NO page of a Spoke that
 *      does not.
 *
 * TWO DISPOSABLE COPIES, ONE DIFFERENCE. Both are copies of the committed synthetic fixture in OS temp: one
 * presents the notice, authors a deliberately long contact address and a longer navigation with the menu-bar
 * layout; the other is identical apart from the notice. Each is started in turn (Next refuses two dev servers
 * for one project directory) and the SAME assertions are measured on both, so "an absent notice changes
 * nothing" is a measurement rather than a claim.
 *
 * NO DEPLOYMENT IS MUTATED: the copies live in the harness's own write domain, the shipped fixture is only
 * ever read, and both copies are removed when the run ends.
 *
 * OWNERSHIP. Every subject is a PLATFORM capability (wrapping navigation, footer robustness, generic notice),
 * so this lives in the harness's own directory and runs in the foundation scope.
 */
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's label. */
export const id = "parity-chrome";

/** The committed fixture every generic scenario is derived from — READ, never written. */
const FIXTURE = ["tests", "fixtures", "synthetic-deployment"];

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [61, 62, 63];

/** Seven destinations with distinct labels, so a narrow bar MUST wrap rather than hide any of them. */
const SEVEN_ITEMS = [
  { label: "Home", href: "/" },
  { label: "About the studio", href: "/about" },
  { label: "Services and pricing", href: "/services" },
  { label: "How it works", href: "/how-it-works" },
  { label: "Examples of work", href: "/examples" },
  { label: "Open source", href: "/open-source" },
  { label: "Contact the team", href: "/contact" },
];

/** A deliberately LONG unbroken contact address (49 characters), so a column must wrap it, not overflow. */
const LONG_EMAIL = "demonstration-notice-contact@example-very-long.test";

/** The notice wording the presenting copy authors — generic on purpose (no business meaning). */
const NOTICE_COPY = { title: "A generic notice", body: "This band is presented by the shell on every page." };

/** A disposable copy of the fixture, patched by the caller, in the harness's own OS-temp domain. */
async function materializeFixture(harness, patch) {
  const root = mkdtempSync(path.join(tmpdir(), "foundation-parity-chrome-"));
  harness.cpSync(path.join(harness.repositoryRoot, ...FIXTURE), root, { recursive: true });

  const configPath = path.join(root, "site.config.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));

  // EVERY locale's dictionary the copy ships: a notice MUST resolve its wording in each one the Spokes serve
  // (the build's copy lock refuses a Spoke that presents the notice without it), so the patch is handed all of
  // them rather than assuming English.
  const dictionaryDirectory = path.join(root, "config", "i18n");
  const dictionaryFiles = readdirSync(dictionaryDirectory).filter((name) => name.endsWith(".json"));
  const dictionaries = dictionaryFiles.map((name) => ({
    path: path.join(dictionaryDirectory, name),
    value: JSON.parse(readFileSync(path.join(dictionaryDirectory, name), "utf8")),
  }));

  await patch(harness, root, config, dictionaries.map((dictionary) => dictionary.value));
  await harness.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  for (const dictionary of dictionaries) {
    await harness.writeFile(dictionary.path, `${JSON.stringify(dictionary.value, null, 2)}\n`, "utf8");
  }

  return { root };
}

/**
 * THE SHARED PATCH. A longer navigation presented as a menu bar at EVERY width is what makes the wrapping
 * contract measurable, and removing the fixture's operating regions is what lets the footer render its
 * Contact column (a Site with regions suppresses the global business block by design).
 */
function longerMenuBarNavigation(config) {
  config.navigation = SEVEN_ITEMS;
  config.footerNavigation = { heading: "Project", items: [{ label: "About", href: "/about" }] };
  config.ui = { ...(config.ui ?? {}), layoutSwitcher: { enabled: true, default: "menu-bar" } };
  config.business = { ...(config.business ?? {}), regions: {}, pages: [] };
  for (const site of config.sites ?? []) delete site.locationSelection;
}

/** THE NOTICE COPY: the notice, plus a long contact address, in EVERY locale the copy serves. */
async function noticePatch(harness, root, config, dictionaries) {
  longerMenuBarNavigation(config);
  config.contact = { ...(config.contact ?? {}), email: LONG_EMAIL };
  config.siteNotice = { mode: "shown", tone: "information" };
  for (const dictionary of dictionaries) dictionary.siteNotice = NOTICE_COPY;
}

/** THE CONTROL COPY: identical chrome, NO notice and no notice copy authored anywhere. */
async function noNoticePatch(harness, root, config) {
  longerMenuBarNavigation(config);
  config.contact = { ...(config.contact ?? {}), email: LONG_EMAIL };
}

/** ONE dev server for one disposable copy, on the first port that answers. */
async function startServer(harness, root) {
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.port(offset);
    const server = harness.startDevServer(port, { deploymentRoot: root });
    try {
      await harness.waitForServer(`http://127.0.0.1:${port}/ww/en`, 240000);
      return { server, port };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no port answered for the parity-chrome scenario");
}

/** The geometry of the bar, the footer and the notice, as the browser measures them. */
const PROBE = `(() => {
  const doc = document.documentElement;
  const bar = document.querySelector('.ui-shell-bottom-bar');
  const barLinks = bar ? [...bar.querySelectorAll('ul a')] : [];
  const barItems = bar ? [...bar.querySelectorAll('ul > li')].filter((li) => li.getBoundingClientRect().height > 0) : [];
  const tops = barItems.map((li) => Math.round(li.getBoundingClientRect().top));
  const targets = barLinks.map((a) => { const r = a.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); });
  const email = document.querySelector('footer a[href^="mailto:"]');
  const footerColumn = email ? email.closest('div') : null;
  const headings = [...document.querySelectorAll('footer h2')].map((h) => ({ text: h.textContent.trim(), top: Math.round(h.getBoundingClientRect().top) }));
  const notice = document.querySelector('[data-ui-site-notice]');
  return {
    barItems: barItems.length,
    barRows: new Set(tops).size,
    barOverflow: barLinks.some((a) => { const r = a.getBoundingClientRect(); return r.right > doc.clientWidth + 1 || r.left < -1; }),
    barMinTarget: targets.length === 0 ? 0 : Math.min(...targets),
    moreTrigger: !!document.querySelector('#shell-bottom-more'),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    documentGrew: doc.scrollWidth > doc.clientWidth + 1,
    overflowing: [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 4)
      .map((el) => (el.className && typeof el.className === 'string' ? el.className.split(' ').slice(0, 3).join(' ') : el.tagName)),
    emailPresent: !!email,
    emailInsideColumn: !!(email && footerColumn) && Math.round(email.getBoundingClientRect().right) <= Math.round(footerColumn.getBoundingClientRect().right) + 1,
    headingTops: headings,
    notice: !!notice,
    noticeRole: notice ? notice.getAttribute('role') : null,
    noticeTone: notice ? notice.getAttribute('data-ui-site-notice-tone') : null,
    noticeText: notice ? notice.textContent : '',
  };
})()`;

/** EVERY PARITY-CHROME FACT AT ONE COPY, at each width the owner's requirements name. */
async function measure(harness, rows, cdp, base, prefix, widths) {
  for (const width of widths) {
    await cdp.setViewport(width, 900);
    await cdp.navigate(`${base}/ww/en`);
    await harness.waitReady(cdp);
    // A dev server's FIRST page settles its stylesheet and client runtime asynchronously (the matrix's own
    // geometry probes wait in the same way), so the measurement is taken on a settled document.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const seen = await cdp.evaluate(PROBE);

    if (prefix === "notice") {
      harness.check(rows, `${prefix}.w${width}.notice.present`, !!seen.notice && seen.noticeRole === "note", `notice=${seen.notice} role=${seen.noticeRole}`);
      harness.check(rows, `${prefix}.w${width}.notice.wording`, seen.noticeText.includes(NOTICE_COPY.title) && seen.noticeText.includes(NOTICE_COPY.body));
      harness.check(rows, `${prefix}.w${width}.notice.tone`, seen.noticeTone === "information", `tone=${seen.noticeTone}`);
    } else {
      harness.check(rows, `${prefix}.w${width}.notice.absent`, !seen.notice, `notice=${seen.notice}`);
    }

    harness.check(rows, `${prefix}.w${width}.bar.everyDestination`, seen.barItems >= 3, `items=${seen.barItems}`);
    harness.check(rows, `${prefix}.w${width}.bar.noMore`, !seen.moreTrigger);
    harness.check(rows, `${prefix}.w${width}.bar.noDialog`, seen.dialogs === 0);
    harness.check(rows, `${prefix}.w${width}.bar.noHorizontalOverflow`, !seen.barOverflow);
    harness.check(rows, `${prefix}.w${width}.bar.targets`, seen.barMinTarget >= 44, `min=${seen.barMinTarget}`);

    harness.check(rows, `${prefix}.w${width}.footer.emailInsideColumn`, !!seen.emailPresent && seen.emailInsideColumn, `present=${seen.emailPresent} inside=${seen.emailInsideColumn}`);
    harness.check(rows, `${prefix}.w${width}.footer.noHorizontalGrowth`, !seen.documentGrew, `overflowing=${JSON.stringify(seen.overflowing)}`);

    // HEADING ALIGNMENT, measured where the contract applies: headings that occupy COMPARABLE COLUMNS (the
    // same row of the footer grid). Below `sm:` the footer is ONE column, so its headings are in different
    // rows by design and there is nothing to align — the assertion is therefore made from `sm:` up, and it
    // requires at least one genuinely comparable pair, so it can never pass vacuously.
    if (width >= 640) {
      const bands = [];
      for (const heading of seen.headingTops ?? []) {
        const band = bands.find((candidate) => Math.abs(candidate.top - heading.top) <= 8);
        if (band) band.members.push(heading);
        else bands.push({ top: heading.top, members: [heading] });
      }
      const comparable = bands.filter((band) => band.members.length > 1);
      const aligned = comparable.every(
        (band) => Math.max(...band.members.map((member) => member.top)) - Math.min(...band.members.map((member) => member.top)) <= 4,
      );
      harness.check(
        rows,
        `${prefix}.w${width}.footer.headingsAligned`,
        comparable.length > 0 && aligned,
        `tops=${JSON.stringify(seen.headingTops)}`,
      );
    }
  }

  // THE WRAP ITSELF: at a narrow width the bar must occupy more than one row — the case the retired rule hid
  // behind "More" — while still showing every destination and overflowing nothing.
  await cdp.setViewport(390, 900);
  await cdp.navigate(`${base}/ww/en`);
  await harness.waitReady(cdp);
  const narrow = await cdp.evaluate(PROBE);
  harness.check(rows, `${prefix}.narrow.bar.wraps`, narrow.barRows >= 2, `rows=${narrow.barRows} items=${narrow.barItems}`);

  // THE NOTICE IS SHELL CHROME ON EVERY PAGE, not only the home page.
  await cdp.setViewport(1280, 900);
  await cdp.navigate(`${base}/ww/en/about`);
  await harness.waitReady(cdp);
  const ordinary = await cdp.evaluate(PROBE);
  harness.check(
    rows,
    `${prefix}.ordinaryPage.notice.${prefix === "notice" ? "present" : "absent"}`,
    prefix === "notice" ? !!ordinary.notice : !ordinary.notice,
    `notice=${ordinary.notice}`,
  );
}

export async function run(chrome, harness) {
  const rows = [];
  let noticeCopy = null;
  let plainCopy = null;
  let noticeServer = null;
  let plainServer = null;

  try {
    noticeCopy = await materializeFixture(harness, noticePatch);
    plainCopy = await materializeFixture(harness, noNoticePatch);

    // ONE SERVER AT A TIME (Next refuses a second dev server for the same project directory).
    const noticeRun = await startServer(harness, noticeCopy.root);
    noticeServer = noticeRun.server;
    let cdp = await Cdp.connect(chrome);
    await measure(harness, rows, cdp, `http://localhost:${noticeRun.port}`, "notice", [390, 700, 1024, 1280]);
    await cdp.close();
    await harness.stopServer(noticeServer);
    noticeServer = null;

    const plainRun = await startServer(harness, plainCopy.root);
    plainServer = plainRun.server;
    cdp = await Cdp.connect(chrome);
    await measure(harness, rows, cdp, `http://localhost:${plainRun.port}`, "plain", [390, 1280]);
    await cdp.close();
  } catch (error) {
    harness.check(rows, "the parity-chrome scenario ran to completion", false, error instanceof Error ? error.message : String(error));
  } finally {
    for (const server of [noticeServer, plainServer]) {
      try {
        await harness.stopServer(server);
      } catch {
        /* the server is already gone */
      }
    }
    for (const copy of [noticeCopy, plainCopy]) {
      if (copy !== null) harness.rmSync(copy.root, { recursive: true, force: true });
    }
  }

  return rows;
}

export default { id, run };
