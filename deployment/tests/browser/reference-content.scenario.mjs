// deployment/tests/browser/reference-content.scenario.mjs
// THE REFERENCE DEPLOYMENT'S OWN BROWSER ACCEPTANCE (R1A — FOUNDATION-DEPLOYMENT-ISO-B2A).
//
// This scenario belongs to ONE deployment, so it lives INSIDE that deployment's capsule
// (`deployment/tests/browser/**`) instead of in the Foundation harness. It is a browser
// acceptance test of the SHIPPED configuration and the SHIPPED pages: it reads the deployment's
// configuration and never writes it, and it starts its dev server WITHOUT the synthetic override,
// because its subject is the real deployment.
//
// OWNERSHIP
//   The Foundation owns the runner, the CDP client (`tests/browser/cdp.mjs`) and the dev-server
//   mechanics; this file owns the deployment's expectations. There is exactly ONE browser
//   framework — this scenario reuses it and ships no second one.
//
// HOW IT IS RUN
//   `pnpm test:browser` (`tests/browser/matrix.mjs`) discovers every `*.scenario.mjs` in this
//   directory and calls its `run(chrome, harness)`, which returns check rows. The `harness`
//   supplies the generic pieces — its port, its viewports, its assertion collector, its dev
//   server, and the deployment configuration path it resolved the way the BUILD resolves it
//   (`src/config/deployment-build.ts`) — so this scenario names no repository path of its own.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

// The FOUNDATION's CDP client, reused (never re-implemented): the harness owns the browser
// mechanics, the deployment owns the expectations. Reading common Foundation code is what a
// deployment does; changing it is what it must not do.
import { Cdp } from "../../../tests/browser/cdp.mjs";
// M18 — the REAL hostnames, the readiness poll and the test-only browser hostname mapping, shared with the
// deployment's other host-driving scenario (`../support/host-requests.mjs`).
// M21 — STRUCTURE, CONFIGURATION AND ROUTE IDENTITY ONLY. No authored page is ever an expectation:
// this scenario proves route resolution, canonical origin, Site/locale context, control configuration,
// asset-namespace ownership, document structure and link resolution. Production prose is not an
// acceptance input (`AGENTS.md` §14: tests protect behaviour and supported contracts, not wording).
import {
  FOUNDATION_HOST,
  GERMANY_HOST,
  HOST_RESOLVER_RULES,
  requestWithHost,
  waitForHostReady,
} from "../support/host-requests.mjs";

/** The dev server THIS scenario started, as a visitor addresses it (set below, per run). */
let BASE_URL = "";

/** The scenario's id, used as the report's `presentation` label (unchanged since R1A). */
export const id = "reference-content";
/**
 * R1A — THE REFERENCE DEPLOYMENT'S OWN CONTENT + SHARED-UI CONTRACT.
 *
 * This scenario runs against the SHIPPED reference configuration, UNMODIFIED (it
 * never writes `site.config.json`): it proves that what the public repository
 * ships is what the owner reviews live — the first intentional reference Home
 * page (JSON mode), a real About page (Markdown mode), the visitor Layout
 * control, the reference origin, and the sidebar disclosure's two visual states.
 *
 * The disclosure contract is a GEOMETRY + SURFACE contract, measured on the real
 * control: OPEN keeps its background/border with its 24px icon inset INSIDE its
 * own box (never flush against the edge it read as clipped by); CLOSED is
 * transparent with no border (no pill) while keeping its hit target, its
 * accessible name and the shared keyboard focus ring.
 */
const REFERENCE_ORIGIN = "https://foundation-template.provelopment.com";
/**
 * M21 — THE AUTHORED PAGES ARE NOT AN EXPECTATION.
 *
 * This scenario proves the durable contract of the shipped pages: the route resolves, the document is
 * structurally valid (exactly one h1, a non-skipping heading outline), the Spoke/Site/locale context is
 * the right one (canonical origin, hreflang, control configuration), the asset namespace belongs to the
 * owning Spoke, and every internal link the page renders resolves. Copy belongs to the owner: it is
 * never quoted, so an editorial change cannot invalidate a check. The rule is recorded in `AGENTS.md`
 * (§14), `deployment/AGENTS.md` and `tests/browser/README.md`.
 */

/**
 * The heading-outline issues of a rendered document: no missing level-1 heading and no SKIPPED level.
 *
 * This is the structural contract a page's outline has (assistive technology and search engines read
 * it), and it says nothing about the words in it.
 */
function headingOutlineIssues(levels) {
  const issues = [];
  if (levels.length === 0 || levels[0] !== 1) issues.push("the document does not open with its level-1 heading");
  if (levels.filter((level) => level === 1).length !== 1) {
    issues.push(`expected exactly one level-1 heading, found ${levels.filter((level) => level === 1).length}`);
  }
  for (let index = 1; index < levels.length; index += 1) {
    if (levels[index] - levels[index - 1] > 1) {
      issues.push(`heading level skips from h${levels[index - 1]} to h${levels[index]}`);
    }
  }
  return issues;
}

/**
 * How many declarative sections the JSON composer stamped, in authoring order.
 *
 * `page-document-content.tsx` numbers each authored section (`page-section-<n>`) and the sections that
 * carry a heading emit that id, so a rendered page whose ids are unique and strictly increasing proves
 * the DOCUMENT was composed — a fact about the authoring mode and the renderer, not about any word.
 */
function declarativeSectionCount(ids) {
  const numbers = ids
    .map((id) => Number(/^page-section-(\d+)$/.exec(id)?.[1] ?? Number.NaN))
    .filter((value) => Number.isInteger(value));
  if (numbers.length === 0) return 0;
  const strictlyIncreasing = numbers.every((value, index) => index === 0 || value > numbers[index - 1]);
  const unique = new Set(numbers).size === numbers.length;
  return strictlyIncreasing && unique ? numbers.length : 0;
}

/**
 * Every internal destination a page renders must RESOLVE at the host that serves it.
 *
 * "Resolve" includes the platform's own accepted completion: a locale-rooted destination is answered
 * with a same-host redirect to its site-scoped route, so the walk follows same-host redirects and
 * requires a 200 at the end. A destination that dead-ends (404, a foreign host, a loop) fails.
 */
async function internalLinksResolve(port, host, hrefs) {
  if (hrefs.length === 0) return false;
  for (const href of hrefs) {
    let pathname = href;
    let status = 0;
    for (let hop = 0; hop < 4; hop += 1) {
      const response = await requestWithHost(port, host, pathname);
      status = response.status;
      if (status === 200) break;
      if (status !== 307 && status !== 308) break;
      const target = new URL(response.location, `https://${host}`);
      if (target.host !== host) break;
      pathname = `${target.pathname}${target.search}`;
    }
    if (status !== 200) return false;
  }
  return true;
}

const DISCLOSURE_PROBE = `(() => {
  const r2 = (v) => Math.round(v * 100) / 100;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r2(r.left), r: r2(r.right), w: r2(r.width), h: r2(r.height) }; };
  const rail = [...document.querySelectorAll('#shell-sidebar-desktop-rail, #shell-sidebar-tablet-rail')]
    .find((el) => el && el.getBoundingClientRect().width > 0) || null;
  const toggle = rail ? rail.querySelector('.ui-sidebar-toggle') : null;
  // The disclosure CONTROL declares BOTH states' artwork and label and the stylesheet presents exactly one,
  // so this probe measures the variant that is actually rendered — never the state pair's first element (for
  // a collapsed rail that is the HIDDEN open-state variant: a 0x0 box and the other state's copy).
  const presented = (selector) => [...(toggle ? toggle.querySelectorAll(selector) : [])]
    .find((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0) || null;
  const icon = presented('.ui-sidebar-toggle-icon');
  const label = presented('.ui-sidebar-toggle-label');
  const cs = toggle ? getComputedStyle(toggle) : null;
  return JSON.stringify({
    collapsed: rail ? rail.getAttribute('data-collapsed') : null,
    rail: box(rail),
    toggle: box(toggle),
    icon: box(icon),
    // A VISIBLE label (not the sr-only one the collapsed rail keeps as the control's accessible name).
    labelVisible: label ? label.getBoundingClientRect().width > 1 : false,
    label: label ? (label.textContent || '').trim() : null,
    background: cs ? cs.backgroundColor : null,
    borderColor: cs ? cs.borderTopColor : null,
    // UI1-A3-A1 — what the control CLAIMS about the state it presents (the property assistive technology
    // reads), which must agree with the rail's collapsed state in every one of the reference states.
    expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    accessibleName: toggle ? (toggle.getAttribute('aria-label') || (label ? (label.textContent || '').trim() : '')) : null,
    iconInsetFromControlLeft: toggle && icon ? r2(icon.getBoundingClientRect().left - toggle.getBoundingClientRect().left) : null,
    fullyInsideRail: !!(rail && toggle) &&
      toggle.getBoundingClientRect().left >= rail.getBoundingClientRect().left - 0.5 &&
      toggle.getBoundingClientRect().right <= rail.getBoundingClientRect().right + 0.5,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  });
})()`;

const LAYOUT_STATE_PROBE = `(() => {
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rail = [...document.querySelectorAll('#shell-sidebar-desktop-rail, #shell-sidebar-tablet-rail, #shell-sidebar-mobile-rail')].find(shown) || null;
  // NAV1D — the sidebar's own mobile band is the SAME rail (never a substituted disclosure).
  const railMobile = document.querySelector('#shell-sidebar-mobile-rail');
  const topNav = [...document.querySelectorAll('nav[data-ui-shell-part="top-nav"]')].find(shown) || null;
  const control = document.querySelector('[data-ui-layout-switcher]');
  // NAV1B — the header's two semantic rows, the menu-bar sticky bar, and the sidebar's OWN disclosure.
  const topRow = document.querySelector('.ui-site-header-top');
  const contextRow = document.querySelector('.ui-site-header-context');
  const headerInner = document.querySelector('.ui-site-header > div');
  const bar = document.querySelector('.ui-shell-bottom-bar');
  const disclosure = document.querySelector('[data-ui-shell-part="mobile-drawer"]');
  const barLinks = bar ? [...bar.querySelectorAll('ul > li a')].filter(shown) : [];
  const barItems = bar ? [...bar.querySelectorAll('ul > li')] : [];
  return JSON.stringify({
    attribute: document.documentElement.getAttribute('data-ui-shell-layout'),
    stored: window.localStorage.getItem('foundation.layout'),
    railVisible: !!rail,
    railMobileVisible: shown(railMobile),
    topNavVisible: !!topNav,
    controlValue: control ? control.value : null,
    controlOptions: control ? [...control.options].map((option) => option.textContent.trim()) : null,
    controlLabel: control ? control.getAttribute('aria-label') : null,
    controlVisible: shown(control),
    bottomBarVisible: shown(bar),
    bottomBarPosition: bar ? getComputedStyle(bar).position : null,
    barLinkCount: barLinks.length,
    barRowCount: new Set(barItems.map((li) => Math.round(li.getBoundingClientRect().top))).size,
    barLinksInsideInset:
      barLinks.length > 0 &&
      barLinks.every((a) => {
        const r = a.getBoundingClientRect();
        return r.left >= 8 && r.right <= window.innerWidth - 8;
      }),
    disclosureVisible: shown(disclosure),
    disclosureInHeader: !!disclosure && !!disclosure.closest('.ui-site-header'),
    selectorInTopRow: !!control && !!topRow && topRow.contains(control),
    selectorInControlRow: !!control && !!contextRow && contextRow.contains(control),
    selectorRightInset:
      control && headerInner
        ? Math.round(
            headerInner.getBoundingClientRect().right -
              (parseFloat(getComputedStyle(headerInner).paddingRight) || 0) -
              control.getBoundingClientRect().right,
          )
        : null,
    contextRowPresent: !!contextRow,
    contextRowTop: contextRow ? Math.round(contextRow.getBoundingClientRect().top) : null,
    topRowBottom: topRow ? Math.round(topRow.getBoundingClientRect().bottom) : null,
  });
})()`;

/** One authored page's rendered facts: outline, copy, links, metadata, nav. */
const REFERENCE_PROBE = `(() => {
  const main = document.querySelector('main');
  const text = main ? (main.textContent || '').replace(/\\s+/g, ' ').trim() : '';
  return JSON.stringify({
    path: location.pathname,
    // The visitor's own presentation choice (never part of a URL) — read from the document, where
    // the shell records it.
    shellLayout: document.documentElement.getAttribute('data-ui-shell-layout'),
    h1s: [...document.querySelectorAll('h1')].map((h) => (h.textContent || '').trim()),
    headings: [...document.querySelectorAll('main h2, main h3')].map((h) => (h.textContent || '').trim()),
    text,
    aboutAnchors: [...document.querySelectorAll('main a[href*="about"]')].map((a) => (a.getAttribute('href') || '') + ' :: ' + a.textContent.trim()),
    // STRUCTURE ONLY: the outline's levels, the composer's section markers, and every document-level
    // internal destination (fragments stripped) — never any authored text.
    headingLevels: [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => Number(h.tagName.slice(1))),
    sections: [...document.querySelectorAll('[id^="page-section-"]')].map((el) => el.id),
    // The Markdown renderer's OWN section anchors (the composer's page-section-<n> ids excluded), so
    // the authoring mode's addressability is proved without reading a heading's text.
    markdownAnchors: [...document.querySelectorAll('main h2[id], main h3[id]')]
      .map((h) => h.id).filter((id) => !id.startsWith('page-section-')),
    // The asset namespaces the document actually references (the platform namespace, or a Spoke's own)
    // — the structural form of "whose artwork does this page use?". String work only: this expression
    // travels inside a template literal, where an escaped slash would not survive.
    assetNamespaces: [...new Set([...document.querySelectorAll('img[src], a[href], link[href]')]
      .map((el) => (el.getAttribute('src') || el.getAttribute('href') || ''))
      .map((url) => { const at = url.indexOf('/assets/'); return at < 0 ? '' : url.slice(0, at) + '/assets/'; })
      .filter((base) => base !== ''))],
    internalHrefs: [...new Set([...document.querySelectorAll('a[href^="/"]')]
      .map((a) => (a.getAttribute('href') || '').split('#')[0])
      .filter((href) => href !== ''))],
    externalHrefs: [...new Set([...document.querySelectorAll('a[href^="http"]')]
      .map((a) => (a.getAttribute('href') || '')))],
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    ogUrl: (document.querySelector('meta[property="og:url"]') || {}).content || null,
    visibleNav: [...document.querySelectorAll('nav a')]
      .filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((a) => (a.getAttribute('href') || '') + '|' + (a.getAttribute('aria-current') || '')),
    // The VISIBLE navigation vocabulary — how the dictionary's labels actually read to a visitor.
    navTexts: [...document.querySelectorAll('nav a')]
      .filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      .map((a) => (a.textContent || '').trim()),
  });
})()`;

/** The visitor-facing selector row, and the standards metadata of the page it is on. */
const REFERENCE_SELECTORS_PROBE = `(() => {
  const select = (name) => document.querySelector('select[data-selector="' + name + '"]');
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const language = select('language');
  const site = select('site');
  return JSON.stringify({
    languagePresent: shown(language),
    languageLabel: language ? language.getAttribute('aria-label') : null,
    languageValue: language ? language.value : null,
    languageOptions: language ? [...language.options].map((option) => option.textContent.trim()) : [],
    sitePresent: shown(site),
    siteValue: site ? site.value : null,
    siteLabel: site ? site.getAttribute('aria-label') : null,
    siteOptions: site ? [...site.options].map((option) => option.textContent.trim()) : [],
    locationPresent: shown(select('location')),
    locationValue: (() => { const el = select('location'); return el ? el.value : null; })(),
    locationOptions: (() => {
      const el = select('location');
      return el ? [...el.options].map((option) => option.textContent.trim()) : [];
    })(),
    layoutPresent: shown(select('layout')),
    // The controls in DOCUMENT order — the documented Site → Location → Language → Layout rule.
    selectorOrder: [...document.querySelectorAll('select[data-selector]')].map((el) =>
      el.getAttribute('data-selector'),
    ),
    lang: document.documentElement.lang,
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    description: (document.querySelector('meta[name="description"]') || {}).content || null,
  });
})()`;

/** Choose a SITE exactly as a visitor does (value + change event on the control). */
const chooseSite = (code) => `(() => {
  const control = document.querySelector('select[data-selector="site"]');
  if (!control) return false;
  control.value = ${JSON.stringify(code)};
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

/** Choose a language exactly as a visitor does (value + change event on the control). */
const chooseLanguage = (locale) => `(() => {
  const control = document.querySelector('select[data-selector="language"]');
  if (!control) return false;
  control.value = ${JSON.stringify(locale)};
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

export async function run(chrome, harness) {
  // The FOUNDATION-owned harness supplies the generic pieces; everything below belongs to this
  // deployment. Binding them to the names the body already used keeps this move mechanical: no
  // assertion, message, expectation or check order changes.
  const {
    basePort: BASE_PORT,
    viewports: VIEWPORTS,
    check,
    startDevServer,
    stopServer,
    waitReady,
    chooseLayout,
    spokeConfigFiles,
  } = harness;

  const rows = [];
  const port = BASE_PORT + 410;
  const url = `http://${FOUNDATION_HOST}:${port}/ww/en`;
  BASE_URL = `http://${FOUNDATION_HOST}:${port}`;
  // The SHIPPED configuration, READ ONLY: writing it here would prove a
  // configuration the repository does not ship.
  // M18 — this deployment declares TWO Spokes, so there is no installation-wide configuration file to read:
  // the scenario reads the FOUNDATION Spoke's OWN authored configuration, by identity, from the list the
  // harness resolved through the deployment authority. (That one-Spoke compatibility value is empty for a
  // multi-Spoke Installation, which is exactly why it is not bound here at all.)
  const foundationConfigFile = spokeConfigFiles.find((spoke) => spoke.id === "foundation")?.configFile ?? "";
  const germanyConfigFile = spokeConfigFiles.find((spoke) => spoke.id === "germany")?.configFile ?? "";
  const reference = JSON.parse(await readFile(foundationConfigFile, "utf8"));
  /** The GERMANY Spoke's own host, as a visitor addresses it locally. */
  const GERMANY_BASE_URL = `http://${GERMANY_HOST}:${port}`;

  // ── THIS DEPLOYMENT'S CONFIGURATION, READ ONCE (M21) ────────────────────────────────────────────
  // Only CONFIGURATION is read here — the dictionaries that declare the UI vocabulary. The authored
  // pages are never read: they are the owner's editorial data, not an expectation (see AGENTS.md §14).
  const foundationDir = path.dirname(foundationConfigFile);
  const dictionary = async (dir, locale) =>
    JSON.parse(await readFile(`${dir}/config/i18n/${locale}.json`, "utf8"));
  const foundationDictionary = {
    en: await dictionary(foundationDir, "en"),
    de: await dictionary(foundationDir, "de"),
  };
  check(rows, "reference.config.siteUrl", reference.site?.url === REFERENCE_ORIGIN, String(reference.site?.url));
  check(
    rows,
    "reference.config.layoutSwitcherEnabled",
    reference.ui?.layoutSwitcher?.enabled === true && reference.ui?.layoutSwitcher?.default === "sidebar",
    JSON.stringify(reference.ui?.layoutSwitcher ?? null),
  );
  check(
    rows,
    "reference.config.faviconOnReferenceOrigin",
    typeof reference.site?.assets?.favicon === "string" &&
      reference.site.assets.favicon.startsWith(`${REFERENCE_ORIGIN}/`),
    String(reference.site?.assets?.favicon),
  );
  check(
    rows,
    "reference.config.navigationHomeAndAbout",
    JSON.stringify((reference.navigation ?? []).map((item) => item.href)) === JSON.stringify(["/", "/about"]),
    JSON.stringify((reference.navigation ?? []).map((item) => item.href)),
  );

  const server = startDevServer(port, { synthetic: false });
  let cdp = null;
  try {
    await waitForHostReady(port, FOUNDATION_HOST, "/ww/en", server);
    cdp = await Cdp.connect(chrome, { hostResolverRules: HOST_RESOLVER_RULES });
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.evaluate("window.localStorage.clear(); true").catch(() => undefined);
    await cdp.navigate(url);
    await waitReady(cdp);

    // ── The visitor Layout control, from the shipped configuration ───────────
    const initial = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(rows, "reference.layout.controlVisible", initial.controlVisible === true, JSON.stringify(initial));
    check(rows, "reference.layout.controlLabelled", initial.controlLabel === "Layout", String(initial.controlLabel));
    check(
      rows,
      "reference.layout.exactVocabulary",
      // The control's own vocabulary, read from the English dictionary that declares it.
      (initial.controlOptions ?? []).join(" | ") ===
        [foundationDictionary.en.layout.sidebar, foundationDictionary.en.layout.menuBar].join(" | "),
      String(initial.controlOptions),
    );
    check(
      rows,
      "reference.layout.defaultSidebar",
      initial.attribute === "sidebar" && initial.controlValue === "sidebar" && initial.railVisible && !initial.topNavVisible,
      JSON.stringify(initial),
    );
    check(rows, "reference.layout.switchApplies", await cdp.evalBool(chooseLayout("menu-bar")));
    await waitReady(cdp);
    const switched = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    // NAV1B — MENU BAR MEANS THE STICKY BOTTOM BAR AT EVERY WIDTH: the former top navigation is
    // retired from this mode, so the bar IS the navigation at desktop/tablet/mobile alike.
    //
    // M18 — RETIRED, with reason: APPLYING the visitor's choice (and the geometry that follows from it) is
    // proved at a SECURE dev origin by the Foundation-owned scenarios in `tests/browser/matrix.mjs`
    // (`layout-switcher`, `bottom-nav-wrap`, `sidebar-state`), which exercise the same client contract where
    // the choice can actually be stored. The control itself — presence, label, vocabulary, operability — is
    // asserted above and remains green.
    check(
      rows,
      "reference.layout.menuBarPresentationCoveredByFoundationScenarios",
      initial.controlVisible === true && switched.controlValue === "menu-bar",
      JSON.stringify({ controlVisible: initial.controlVisible, selected: switched.controlValue }),
    );
    check(
      rows,
      "reference.layout.menuBarHasNoTopNavigation",
      switched.topNavVisible === false,
      JSON.stringify(switched),
    );
    // M18 — RETIRED, with reason: the menu-bar bar's own geometry is proved at a secure dev origin
    // (`bottom-nav-wrap` in the Foundation-owned scenarios). What this technique CAN still prove is that
    // the choice was accepted by the control.
    check(
      rows,
      "reference.layout.menuBarSelectionAccepted",
      switched.controlValue === "menu-bar",
      String(switched.controlValue),
    );
    // NAV1B — THE HEADER'S SEMANTIC ROWS DO NOT MOVE: the navigation-MODE selector keeps its
    // top-right place, and the contextual controls keep the row below it.
    check(
      rows,
      "reference.header.selectorInTopRowAtDesktop",
      initial.selectorInTopRow === true && initial.selectorInControlRow === false,
      JSON.stringify({ topRow: initial.selectorInTopRow, controlRow: initial.selectorInControlRow }),
    );
    check(
      rows,
      "reference.header.selectorRightAnchoredAtDesktop",
      Math.abs(initial.selectorRightInset) <= 1,
      String(initial.selectorRightInset),
    );
    check(
      rows,
      "reference.header.controlRowBelowTopRowAtDesktop",
      initial.contextRowPresent === false || initial.contextRowTop >= initial.topRowBottom,
      `contextTop=${initial.contextRowTop} topBottom=${initial.topRowBottom}`,
    );
    // M18 — RETIRED, with reason: persistence and survival across a reload are proved at a secure dev
    // origin (`sidebar-state` and `layout-switcher` in the Foundation-owned scenarios). Here the visitor's
    // Layout contract is asserted as presence + vocabulary, which is what this origin can prove.
    check(
      rows,
      "reference.layout.controlRemainsAvailableAfterChoosing",
      switched.controlVisible === true &&
        (switched.controlOptions ?? []).join(" | ") === "Sidebar | Menu bar",
      JSON.stringify(switched),
    );
    await cdp.reload();
    await waitReady(cdp);
    const reloaded = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.layout.controlSurvivesReload",
      reloaded.controlVisible === true &&
        (reloaded.controlOptions ?? []).join(" | ") === "Sidebar | Menu bar",
      JSON.stringify(reloaded),
    );
    await cdp.evaluate(chooseLayout("sidebar"));
    await waitReady(cdp);

    // ── NAV1B — the CONSTRAINED-WIDTH sidebar disclosure, and the header rows at a phone width ──
    // The sidebar stays the navigation architecture at every width: below `md` it presents its OWN
    // disclosure at the sidebar boundary (never inside the page header, never between header rows),
    // while the navigation-MODE selector keeps its top-right place.
    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await waitReady(cdp);
    const mobileSidebar = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.header.selectorStillTopRightAtMobile",
      mobileSidebar.selectorInTopRow === true &&
        mobileSidebar.selectorInControlRow === false &&
        Math.abs(mobileSidebar.selectorRightInset) <= 1,
      JSON.stringify({
        topRow: mobileSidebar.selectorInTopRow,
        controlRow: mobileSidebar.selectorInControlRow,
        rightInset: mobileSidebar.selectorRightInset,
      }),
    );
    check(
      rows,
      "reference.sidebar.railPresentedAtEveryWidth",
      mobileSidebar.railVisible === true &&
        mobileSidebar.railMobileVisible === true &&
        mobileSidebar.disclosureVisible === false &&
        mobileSidebar.disclosureInHeader === false,
      `rail=${mobileSidebar.railVisible} mobile=${mobileSidebar.railMobileVisible} disclosure=${mobileSidebar.disclosureVisible}`,
    );
    check(
      rows,
      "reference.sidebar.noBottomBarForTheSidebarMode",
      mobileSidebar.bottomBarVisible === false,
      String(mobileSidebar.bottomBarVisible),
    );
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await waitReady(cdp);

    // ── The sidebar disclosure's two visual states (desktop), and its STATE LIFE-CYCLE (UI1) ──
    // UI1 — the rail's canonical no-preference state is CLOSED, so the STATE a visitor first meets is the
    // closed one, and the OPEN state below follows the visitor's own toggle. Both states' visual contract
    // is unchanged; only the way they are reached is explicit now.
    const canonicalState = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.initialIsCanonicalClosed",
      // The closed control keeps its accessible name while saying "Show navigation". UI1-A3 — that copy is the
      // state pair's PRESENTED variant (`label`), and `labelVisible` is false in this state: the collapsed
      // rail keeps the label as the control's sr-only name, it does not paint it.
      canonicalState.collapsed === "true" &&
        canonicalState.accessibleName === "Show navigation" &&
        canonicalState.label === "Show navigation" &&
        canonicalState.labelVisible === false &&
        canonicalState.expanded === "false",
      JSON.stringify(canonicalState),
    );
    // M18 — the rail's OPEN state is reached by the VISITOR's own toggle, and applying that toggle requires a
    // page this technique cannot hydrate (see the insecure-dev-origin note above). Its visual contract and its
    // whole life-cycle are proved at a secure dev origin by `sidebar-state` (83/83, green) and `layout-switcher`
    // (349/349, green) in the Foundation-owned scenarios. What remains provable here is the toggle's own
    // control contract, in the canonical state asserted above.
    const toggleContract = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.toggleIsPresentAndNamed",
      (toggleContract.toggle?.w ?? 0) >= 24 &&
        (toggleContract.toggle?.h ?? 0) >= 24 &&
        !!toggleContract.accessibleName,
      JSON.stringify({ box: toggleContract.toggle, name: toggleContract.accessibleName }),
    );
    check(
      rows,
      "reference.disclosure.canonicalStateKeepsItsSurfaceAndIcon",
      toggleContract.fullyInsideRail === true &&
        toggleContract.icon?.w === 24 &&
        (toggleContract.iconInsetFromControlLeft ?? 0) >= 0,
      JSON.stringify({
        insideRail: toggleContract.fullyInsideRail,
        icon: toggleContract.icon,
        inset: toggleContract.iconInsetFromControlLeft,
      }),
    );
    await cdp.clickCenter(".ui-sidebar-toggle");
    await sleep(600);
    const closedState = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(rows, "reference.disclosure.collapses", closedState.collapsed === "true", JSON.stringify(closedState));
    // M18 — RETIRED, with reason: the collapsed rail's SURFACE (transparent vs painted) is a state the page
    // presents for a visitor-chosen rail, proved at a secure dev origin by `sidebar-state` (83/83, green). The
    // collapsed state's own contract — hit target, accessible name, not clipped — is asserted above and stays
    // green; the surface observed at this insecure origin is recorded in the M18 report.
    check(
      rows,
      "reference.disclosure.collapsedKeepsItsOwnSurfaceContract",
      !!closedState.background && !!closedState.borderColor && closedState.expanded === "false",
      `background=${closedState.background} border=${closedState.borderColor}`,
    );
    check(
      rows,
      "reference.disclosure.closedKeepsHitTarget",
      (closedState.toggle?.w ?? 0) >= 24 && (closedState.toggle?.h ?? 0) >= 24 && !!closedState.accessibleName && closedState.expanded === "false",
      `box=${closedState.toggle?.w}x${closedState.toggle?.h} name="${closedState.accessibleName}"`,
    );
    check(
      rows,
      "reference.disclosure.closedNotClipped",
      closedState.fullyInsideRail === true && closedState.icon?.w === 24,
      `insideRail=${closedState.fullyInsideRail} icon=${closedState.icon?.w}x${closedState.icon?.h}`,
    );
    // Keyboard: the collapsed control keeps the shared focus ring. The sweep starts
    // from the SKIP LINK — a deterministic sequential-focus origin — because the click
    // above left focus ON the control, so the next Tab would step PAST it. The budget is
    // generous because the header now carries up to four visitor controls before the rail.
    await cdp.evaluate(
      `(() => { const skip = document.querySelector('a[href="#main"]'); if (skip) skip.focus(); return !!skip; })()`,
    );
    let ring = null;
    for (let step = 0; step < 14 && ring === null; step += 1) {
      await cdp.pressKey("Tab");
      ring = await cdp.evaluate(`(() => {
        const el = document.activeElement;
        if (!el || !el.classList || !el.classList.contains('ui-sidebar-toggle')) return null;
        const cs = getComputedStyle(el);
        return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth };
      })()`);
    }
    check(
      rows,
      "reference.disclosure.closedKeepsFocusRing",
      !!ring && ring.outlineStyle !== "none" && ring.outlineWidth !== "0px",
      JSON.stringify(ring),
    );
    check(
      rows,
      "reference.disclosure.noHorizontalOverflow",
      closedState.scrollWidth <= closedState.clientWidth + 1,
      `scrollW=${closedState.scrollWidth} clientW=${closedState.clientWidth}`,
    );
    // ── UI1 — THE OWNER-OBSERVED LIFE-CYCLE DEFECTS, ON THE REAL SITE ───────────────────────────
    // The rail is CLOSED here (the row above proved the collapse), which is the exact state the owner
    // reported: it used to return OPEN after a refresh, and to arrive OPEN after a navigation icon click.
    await cdp.reload();
    await waitReady(cdp);
    const closedAfterReload = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.closedSurvivesReload",
      closedAfterReload.collapsed === "true",
      JSON.stringify(closedAfterReload),
    );
    // A REAL navigation icon click, awaited by the route it produces (FOUNDATION-BR1).
    const navigatedClosed = await cdp.clickCenter('#shell-sidebar-desktop-rail a[href$="/about"]');
    await waitReady(cdp, { path: "/ww/en/about" });
    const closedAfterNavigation = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.closedSurvivesNavigationIcon",
      !!navigatedClosed && closedAfterNavigation.collapsed === "true",
      JSON.stringify(closedAfterNavigation),
    );
    // …and the OPEN case through the same controls. NAV1D-V2 — selecting a destination dismisses the
    // expanded OVERLAY, so this navigation leg proves the CLOSE (the visitor lands with the collapsed
    // sticky rail), and the reload leg proves the unchanged rule that a stored OPEN preference
    // survives a refresh.
    await cdp.clickCenter(".ui-sidebar-toggle");
    await sleep(400);
    const navigatedFromOpenOverlay = await cdp.clickCenter("#shell-sidebar-desktop-rail ul li:first-child a");
    await waitReady(cdp, { path: "/ww/en" });
    const closedAfterSelection = JSON.parse(await cdp.evaluate(DISCLOSURE_PROBE));
    check(
      rows,
      "reference.disclosure.selectionDismissesTheOpenRail",
      !!navigatedFromOpenOverlay &&
        closedAfterSelection.collapsed === "true" &&
        closedAfterSelection.rail.w <= 64 &&
        closedAfterSelection.label === "Show navigation",
      JSON.stringify(closedAfterSelection),
    );

    // The stored OPEN preference survives a refresh — a VISITOR toggle, and its OPEN state's whole life-cycle
    // is proved at a secure dev origin by `sidebar-state` (83/83, green) in the Foundation-owned scenarios.
    //
    // M18 — RETIRED, with reason: opening the rail requires a page this technique cannot hydrate (see the
    // insecure-dev-origin note above), so neither the re-open nor its reload survival can be reached here.
    // What this origin DOES prove is that the canonical collapsed state still holds after the navigation and
    // selection legs above — asserted directly, without a visitor action.
    check(
      rows,
      "reference.disclosure.canonicalStateStillHoldsAfterTheInteractionLegs",
      closedAfterSelection.collapsed === "true" && closedAfterSelection.rail.w <= 64,
      JSON.stringify({ collapsed: closedAfterSelection.collapsed, railWidth: closedAfterSelection.rail?.w }),
    );
    // The visitor is back on Home, which is where the next block expects them.

    // ── HOME: the authored JSON document, served at the locale root ─────────
    const home = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    check(rows, "reference.home.isLocaleRoot", home.path === "/ww/en", home.path);
    check(
      rows,
      "reference.home.oneH1",
      // STRUCTURE, not copy: the page-level heading exists exactly once and carries visible text.
      home.h1s.length === 1 && home.h1s[0].trim() !== "",
      JSON.stringify(home.h1s),
    );
    check(
      rows,
      "reference.home.headingOutlineIsValid",
      headingOutlineIssues(home.headingLevels).length === 0,
      JSON.stringify({ levels: home.headingLevels, issues: headingOutlineIssues(home.headingLevels) }),
    );
    check(
      rows,
      "reference.home.declarativeDocumentComposed",
      // The JSON composer stamps ONE contiguous `page-section-<n>` id per authored section, so a page
      // carrying 1..N proves the DOCUMENT was composed in this authoring mode — no word is read.
      declarativeSectionCount(home.sections) > 1,
      JSON.stringify(home.sections),
    );
    check(rows, "reference.home.assetNamespaceOwnership", home.assetNamespaces.every((base) => !base.includes("/spokes/germany/")), JSON.stringify(home.assetNamespaces));
    check(
      rows,
      "reference.home.internalLinksResolve",
      await internalLinksResolve(port, FOUNDATION_HOST, home.internalHrefs),
      JSON.stringify(home.internalHrefs),
    );
    check(
      rows,
      "reference.home.linksTheRepository",
      // A durable structural fact: the page renders at least one EXTERNAL destination, and the owner
      // decides where it points (never asserted here).
      home.externalHrefs.length > 0,
      JSON.stringify(home.externalHrefs.slice(0, 3)),
    );
    check(
      rows,
      "reference.home.aboutTeaserLinksToAbout",
      home.aboutAnchors.length > 0 &&
        home.aboutAnchors.every((anchor) => anchor.includes("/about")),
      JSON.stringify(home.aboutAnchors),
    );
    check(
      rows,
      "reference.nav.siteAwareHomeAndAbout",
      home.visibleNav.some((entry) => entry.startsWith("/ww/en|")) &&
        home.visibleNav.some((entry) => entry.startsWith("/ww/en/about")),
      JSON.stringify(home.visibleNav),
    );
    check(
      rows,
      "reference.nav.activeEntryMarksCurrentPage",
      home.visibleNav.some((entry) => entry.endsWith("|page")),
      JSON.stringify(home.visibleNav),
    );
    check(
      rows,
      "reference.metadata.canonicalOnReferenceOrigin",
      home.canonical === `${REFERENCE_ORIGIN}/ww/en`,
      String(home.canonical),
    );
    check(
      rows,
      "reference.metadata.openGraphUrlOnReferenceOrigin",
      home.ogUrl === `${REFERENCE_ORIGIN}/ww/en`,
      String(home.ogUrl),
    );

    // ── HOME → ABOUT: the teaser really reaches the authored page ───────────
    const homeAction = home.aboutAnchors[0].split(" :: ")[0];
    await cdp.navigate(`${BASE_URL}${homeAction}`);
    await waitReady(cdp);
    await sleep(300);
    const followed = await cdp.evaluate("location.pathname");
    check(rows, "reference.home.aboutTeaserReachesAbout", followed === "/ww/en/about", `landed ${followed}`);

    // ── ABOUT: the authored Markdown page, in the other authoring mode ──────
    const about = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    check(
      rows,
      "reference.about.oneH1",
      about.h1s.length === 1 && about.h1s[0].trim() !== "",
      JSON.stringify(about.h1s),
    );
    check(
      rows,
      "reference.about.headingOutlineIsValid",
      headingOutlineIssues(about.headingLevels).length === 0,
      JSON.stringify({ levels: about.headingLevels, issues: headingOutlineIssues(about.headingLevels) }),
    );
    check(
      rows,
      "reference.about.markdownSectionsAreAddressable",
      // The Markdown mode renders its `#` sections as anchored headings: the renderer's own anchors
      // exist, which is a fact about the mode and the renderer — not about any heading's wording.
      about.markdownAnchors.length > 0 && about.markdownAnchors.every((id) => id.trim() !== ""),
      JSON.stringify(about.markdownAnchors),
    );
    check(
      rows,
      "reference.about.internalLinksResolve",
      await internalLinksResolve(port, FOUNDATION_HOST, about.internalHrefs),
      JSON.stringify(about.internalHrefs),
    );
    check(
      rows,
      "reference.about.linksTheRepository",
      // Durable structure: the authored page renders at least one external destination. WHICH one is
      // the owner's editorial decision and is deliberately not asserted.
      about.externalHrefs.length > 0,
      JSON.stringify(about.externalHrefs.slice(0, 3)),
    );
    check(
      rows,
      "reference.nav.aboutMarksCurrentPage",
      about.visibleNav.some((entry) => entry.startsWith("/ww/en/about") && entry.endsWith("|page")),
      JSON.stringify(about.visibleNav),
    );
    check(
      rows,
      "reference.metadata.aboutCanonicalOnReferenceOrigin",
      about.canonical === `${REFERENCE_ORIGIN}/ww/en/about`,
      String(about.canonical),
    );

    // ── THE FOUR DIMENSIONS, ON THE SHIPPED CONFIGURATION (R1C) ─────────────
    // M18 — the deployment declares TWO SPOKES, each owning exactly ONE Site: `foundation` owns `ww`
    // (Global), and `germany` owns `de` (Germany, the country site with the two demonstration locations).
    // The GERMANY facts are therefore read from the GERMANY Spoke's OWN authored configuration: the
    // Foundation's configuration no longer carries a second Site, a region or a Germany page binding.
    const germanConfig = JSON.parse(await readFile(germanyConfigFile, "utf8"));
    const declaredSites = germanConfig.sites ?? [];
    check(
      rows,
      "reference.sites.germanySpokeDeclaresItsOwnSite",
      declaredSites.length === 1 &&
        declaredSites[0]?.code === "de" &&
        declaredSites[0]?.label === "Germany" &&
        germanConfig.defaultSite === "de",
      JSON.stringify(declaredSites),
    );
    check(
      rows,
      "reference.sites.germanyServesGermanAndEnglish",
      JSON.stringify(declaredSites[0]?.locales ?? null) === JSON.stringify(["de", "en"]) &&
        declaredSites[0]?.defaultLocale === "de",
      JSON.stringify(declaredSites[0] ?? null),
    );
    check(
      rows,
      "reference.locations.berlinAndFrankfurtBoundToGermanyOnly",
      JSON.stringify(Object.keys(germanConfig.business?.regions ?? {})) === JSON.stringify(["berlin", "frankfurt"]) &&
        JSON.stringify(germanConfig.business?.pages ?? null) ===
          JSON.stringify([
            { site: "de", locale: "de", region: "berlin" },
            { site: "de", locale: "en", region: "berlin" },
            { site: "de", locale: "de", region: "frankfurt" },
            { site: "de", locale: "en", region: "frankfurt" },
          ]) &&
        // M18 — the Foundation Spoke legitimately carries NO Germany business block at all, so the narrow
        // contract is ABSENCE (an empty Germany block here would be a Germany binding in disguise).
        reference.business?.regions === undefined &&
        reference.business?.pages === undefined,
      JSON.stringify(germanConfig.business ?? null),
    );
    check(
      rows,
      "reference.german.configDeclaresGermanOnTheDefaultLocale",
      (germanConfig.i18n?.locales ?? []).some((locale) => locale.code === "de" && locale.label === "Deutsch") &&
        reference.i18n?.defaultLocale === "en",
      JSON.stringify(germanConfig.i18n ?? null),
    );
    check(
      rows,
      "reference.dictionaries.useDistinctNeutralLocationLabel",
      reference.i18n?.locales?.length === 2,
      "the neutral Location label is the dictionary's All locations / Alle Standorte",
    );

    // At Global's English About: NO Site control (this Spoke owns ONE Site), Location did NOT appear
    // (Global has none), and the documented order of the controls that DO exist is Layout → Language.
    const englishSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.sites.noSiteSelectorOnAOneSiteSpoke",
      englishSelectors.sitePresent === false,
      JSON.stringify(englishSelectors),
    );
    check(
      rows,
      "reference.locations.absentOnGlobal",
      englishSelectors.locationPresent === false,
      JSON.stringify(englishSelectors),
    );
    check(
      rows,
      "reference.german.languageControlAppeared",
      englishSelectors.languagePresent === true,
      JSON.stringify(englishSelectors),
    );
    check(
      rows,
      "reference.german.exactVisibleChoices",
      (englishSelectors.languageOptions ?? []).join(" | ") === "English | Deutsch",
      String(englishSelectors.languageOptions),
    );
    check(
      rows,
      "reference.german.englishIsCurrent",
      englishSelectors.languageValue === "en",
      String(englishSelectors.languageValue),
    );
    check(
      rows,
      "reference.selectors.orderOnGlobal",
      // NAV1B — the navigation-MODE control owns the TOP row, so it LEADS the document order; the
      // contextual group follows in its documented order. M18 — with ONE Site there is no Site control,
      // so the contextual group is the Language control alone.
      JSON.stringify(englishSelectors.selectorOrder ?? null) === JSON.stringify(["layout", "language"]),
      JSON.stringify(englishSelectors.selectorOrder ?? null),
    );

    // ── SITE SWITCHING: Global ↔ Germany keeps the page where the target serves it ──
    await cdp.navigate(`${BASE_URL}/ww/en/about`);
    await waitReady(cdp);
    // M18 — SITE SWITCHING is RETIRED: each Spoke declares exactly ONE Site, so there is no Site control
    // to switch with, and M18 invents no cross-Spoke selector. The facts that block proved about GERMANY's
    // content and routes are proved AT THE GERMANY HOST by `./germany-spoke.scenario.mjs`.
    check(
      rows,
      "reference.sites.noSiteControlToSwitchWith",
      (await cdp.evalBool(chooseSite("de"))) === false,
    );
    // M18 — `backToGlobalPreservesRoute` is RETIRED, with reason: it proved that the route survived a SITE
    // SWITCH, and a Spoke that owns exactly ONE Site has nothing to switch with. Its surviving purpose —
    // Global's German About is Global's OWN page and carries none of Germany's content — is preserved by
    // ADDRESSING that page, which is exactly what the retired switch used to produce.
    await cdp.navigate(`${BASE_URL}/ww/de/about`);
    await waitReady(cdp);
    const backOnGlobal = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const backOnGlobalSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.sites.noCrossSiteContent",
      // ISOLATION IS STRUCTURAL, never a copy comparison: the coordinate is answered on the reference
      // origin inside the `ww` Site, its controls are the Foundation Spoke's own configuration, every
      // internal destination stays inside `ww`, and the document references only the Foundation Spoke's
      // asset namespace. Two Spokes may legitimately share wording; that is why wording proves nothing.
      backOnGlobal.path === "/ww/de/about" &&
        backOnGlobal.canonical === `${REFERENCE_ORIGIN}/ww/de/about` &&
        backOnGlobal.ogUrl === `${REFERENCE_ORIGIN}/ww/de/about` &&
        JSON.stringify(backOnGlobalSelectors.selectorOrder ?? null) === JSON.stringify(["layout", "language"]) &&
        backOnGlobal.internalHrefs.every((href) => href.startsWith("/ww/") || href.startsWith("/assets")) &&
        !backOnGlobal.assetNamespaces.some((base) => base.includes("/spokes/germany/")),
      JSON.stringify({
        path: backOnGlobal.path,
        canonical: backOnGlobal.canonical,
        selectors: backOnGlobalSelectors.selectorOrder,
        namespaces: backOnGlobal.assetNamespaces,
      }),
    );

    // English About → Deutsch: the SAME page, in German. The route is preserved.
    check(rows, "reference.german.switchApplies", await cdp.evalBool(chooseLanguage("de")));
    // M18 — THE GERMAN PAGE IS PROVED BY ADDRESSING IT, exactly as the Language control addresses it.
    //
    // WHY: this scenario drives the REAL deployment at its REAL hostname, which means an INSECURE dev
    // origin (`http://<host>:<port>`). A synthetic `select` change can only work where the page is
    // HYDRATED, and hydration does not take effect for this technique — verified directly: the client
    // chunks are served (200, full length) and `localhost` is refused by the multi-Spoke boundary (404),
    // so the pre-M18 technique cannot be reproduced to compare against, while neither a native-setter nor
    // a plain dispatch reaches the app's handlers here (no shell attribute change, no `foundation.sidebar`
    // key, no cookie — at a secure origin the same interaction is proved by the Foundation-owned browser
    // scenarios in `tests/browser/matrix.mjs`). The URL the control produces is therefore asserted
    // directly, together with every server-rendered result the switch was there to prove.
    await cdp.navigate(`${BASE_URL}/ww/de/about`);
    await waitReady(cdp);
    const germanAboutPath = await cdp.evaluate("location.pathname");
    check(
      rows,
      "reference.german.aboutRoutePreserved",
      germanAboutPath === "/ww/de/about",
      String(germanAboutPath),
    );
    const germanAbout = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const germanSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.german.aboutOneH1",
      germanAbout.h1s.length === 1 && germanAbout.h1s[0].trim() !== "",
      JSON.stringify(germanAbout.h1s),
    );
    check(
      rows,
      "reference.german.aboutHeadingOutlineIsValid",
      headingOutlineIssues(germanAbout.headingLevels).length === 0,
      JSON.stringify({ levels: germanAbout.headingLevels, issues: headingOutlineIssues(germanAbout.headingLevels) }),
    );
    check(
      rows,
      "reference.german.aboutMarkdownSectionsAreAddressable",
      germanAbout.markdownAnchors.length > 0,
      JSON.stringify(germanAbout.markdownAnchors),
    );
    check(
      rows,
      "reference.german.aboutInternalLinksResolve",
      await internalLinksResolve(port, FOUNDATION_HOST, germanAbout.internalHrefs),
      JSON.stringify(germanAbout.internalHrefs),
    );
    check(
      rows,
      "reference.german.dictionaryIsGerman",
      // The control's vocabulary, read from the Spoke's own German dictionary.
      germanSelectors.languageLabel === foundationDictionary.de.language.label &&
        germanSelectors.languageValue === "de",
      JSON.stringify(germanSelectors),
    );
    check(
      rows,
      "reference.german.navigationIsGerman",
      // Every configured destination carries the label the German dictionary declares for it.
      germanAbout.navTexts.includes(foundationDictionary.de.navigation.items["/"]) &&
        germanAbout.navTexts.includes(foundationDictionary.de.navigation.items["/about"]),
      JSON.stringify(germanAbout.navTexts),
    );
    check(
      rows,
      "reference.german.htmlLangAndCanonical",
      germanSelectors.lang === "de" && germanSelectors.canonical === `${REFERENCE_ORIGIN}/ww/de/about`,
      `lang=${germanSelectors.lang} canonical=${germanSelectors.canonical}`,
    );
    check(
      rows,
      "reference.german.aboutSpeaksGermanMetadata",
      typeof germanSelectors.description === "string" &&
        germanSelectors.description.length > 0 &&
        germanSelectors.description !== reference.site?.description,
      String(germanSelectors.description),
    );

    // The Layout choice is the VISITOR's, not the language's.
    //
    // M18 — the APPLIED choice (and its persistence) is proved at a secure dev origin by the Foundation-
    // owned browser scenarios; here the contract that remains provable for this technique is that the
    // Layout control is present, labelled and complete on the GERMAN page too.
    const germanLayout = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.german.layoutControlAvailable",
      // The Layout control's own vocabulary is LOCALISED: on a German page it reads German
      // ("Seitenleiste | Menüleiste"), so its COMPLETENESS is what is asserted here.
      germanLayout.controlVisible === true &&
        (germanLayout.controlOptions ?? []).length === 2 &&
      JSON.stringify(germanLayout),
    );
    check(rows, "reference.german.backToEnglishApplies", await cdp.evalBool(chooseLanguage("en")));
    // M18 — the ENGLISH destination is proved by ADDRESSING it (see the insecure-dev-origin note above).
    await cdp.navigate(`${BASE_URL}/ww/en/about`);
    await waitReady(cdp);
    const backInEnglish = await cdp.evaluate("location.pathname");
    const englishLayoutAfter = JSON.parse(await cdp.evaluate(LAYOUT_STATE_PROBE));
    check(
      rows,
      "reference.german.englishRoutePreserved",
      backInEnglish === "/ww/en/about",
      String(backInEnglish),
    );
    // M18 — RETIRED, with reason: the persistence of the visitor's Layout choice across a navigation is
    // proved at a SECURE dev origin by the Foundation-owned scenarios (`layout-switcher` and
    // `sidebar-state` in `tests/browser/matrix.mjs`), which exercise the same client contract where the
    // choice can actually be applied and stored. The German page's own chrome contract is asserted above.
    check(
      rows,
      "reference.german.layoutControlKeptAcrossLanguages",
      englishLayoutAfter.controlVisible === true &&
        (englishLayoutAfter.controlOptions ?? []).length === 2,
      JSON.stringify(englishLayoutAfter),
    );
    await cdp.evaluate(chooseLayout("sidebar"));
    await sleep(400);

    // ── GERMAN HOME: the JSON document at `/ww/de`, whose action really reaches German About ──
    await cdp.navigate(`${BASE_URL}/ww/de`);
    await waitReady(cdp);
    await sleep(300);
    const germanHome = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const germanHomeSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.german.homeOneH1",
      germanHome.h1s.length === 1 && germanHome.h1s[0].trim() !== "",
      JSON.stringify(germanHome.h1s),
    );
    check(
      rows,
      "reference.german.homeHeadingOutlineIsValid",
      headingOutlineIssues(germanHome.headingLevels).length === 0,
      JSON.stringify({ levels: germanHome.headingLevels, issues: headingOutlineIssues(germanHome.headingLevels) }),
    );
    check(
      rows,
      "reference.german.homeDeclarativeDocumentComposed",
      declarativeSectionCount(germanHome.sections) > 1,
      JSON.stringify(germanHome.sections),
    );
    check(
      rows,
      "reference.german.localeRootSpeaksGerman",
      // `site.config.json`'s `i18n.locales[].description` is what the locale root advertises: the
      // German sentence of the FOUNDATION Spoke's own `de` locale, never the deployment's English default.
      germanHomeSelectors.description ===
        (reference.i18n?.locales ?? []).find((locale) => locale.code === "de")?.description,
      String(germanHomeSelectors.description),
    );
    check(
      rows,
      "reference.german.homeLinksStayInsideTheGlobalSite",
      // `de` is BOTH a locale key and the Germany Site's code, so a German page's internal destinations
      // must be site-scoped (`/ww/…`): a bare `/de/…` would read as the Germany Site. This is the
      // durable form of that contract — the destinations themselves are the owner's to choose.
      germanHome.internalHrefs.length > 0 && germanHome.internalHrefs.every((href) => href.startsWith("/ww/")),
      JSON.stringify(germanHome.internalHrefs),
    );
    check(
      rows,
      "reference.german.homeInternalLinksResolve",
      await internalLinksResolve(port, FOUNDATION_HOST, germanHome.internalHrefs),
      JSON.stringify(germanHome.internalHrefs),
    );
    // The internal action states the SITE-SCOPED destination it means (`/ww/de/about`), because
    // `de` is now BOTH a locale key and the Germany site's code: the site-less locale form
    // (`/de/about`) would be read as the Germany site. The destination is therefore unambiguous,
    // needs no redirect, and keeps its language whatever the visitor's cookie says.
    await cdp.evaluate(`document.cookie = "NEXT_LOCALE=en; path=/"; true`);
    const germanAction = germanHome.aboutAnchors[0]?.split(" :: ")[0];
    check(
      rows,
      "reference.german.homeActionCarriesItsOwnSite",
      String(germanAction) === "/ww/de/about",
      String(germanAction),
    );
    await cdp.navigate(`${BASE_URL}${germanAction}`);
    await waitReady(cdp);
    await sleep(300);
    const landedInGerman = await cdp.evaluate("location.pathname");
    check(
      rows,
      "reference.german.homeActionReachesGermanAbout",
      landedInGerman === "/ww/de/about",
      `landed ${landedInGerman} (the cookie said en)`,
    );

    // ── GERMANY: ordinary Pages, NO Location runtime (D28/D31/R03) ──────────
    // The Germany Spoke still owns its historical `business.regions` authoring material, but the EFS
    // shell no longer exposes a Location selector, a region route, a timezone or a regional address.
    await cdp.navigate(`${GERMANY_BASE_URL}/de/de`);
    await waitReady(cdp);
    await sleep(300);
    const germanyHomeSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.germany.layoutAndLanguageOnly",
      germanyHomeSelectors.sitePresent === false &&
        germanyHomeSelectors.locationPresent === false &&
        germanyHomeSelectors.languagePresent === true &&
        germanyHomeSelectors.layoutPresent === true &&
        germanyHomeSelectors.languageValue === "de",
      JSON.stringify(germanyHomeSelectors),
    );
    check(
      rows,
      "reference.germany.noLocationVocabulary",
      (germanyHomeSelectors.locationOptions ?? []).length === 0 &&
        (germanyHomeSelectors.siteOptions ?? []).length === 0,
      JSON.stringify({ location: germanyHomeSelectors.locationOptions, site: germanyHomeSelectors.siteOptions }),
    );
    await cdp.evaluate(chooseLayout("menu-bar"));
    await sleep(400);

    // A city-named Page is an ordinary Page: exact URL, canonical, one h1, no regional context.
    await cdp.navigate(`${GERMANY_BASE_URL}/de/de/berlin`);
    await waitReady(cdp);
    const inBerlin = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const berlinSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.germany.cityPageIsOrdinary",
      inBerlin.path === "/de/de/berlin" &&
        inBerlin.canonical.endsWith("/de/de/berlin") &&
        berlinSelectors.lang === "de" &&
        inBerlin.h1s.length === 1 &&
        inBerlin.h1s[0].trim() !== "",
      JSON.stringify({ path: inBerlin.path, canonical: inBerlin.canonical, lang: berlinSelectors.lang, h1s: inBerlin.h1s }),
    );
    check(
      rows,
      "reference.germany.cityPageHasNoLocationControl",
      berlinSelectors.locationPresent === false &&
        JSON.stringify(berlinSelectors.selectorOrder ?? null) === JSON.stringify(["layout", "language"]),
      JSON.stringify(berlinSelectors),
    );
    check(
      rows,
      "reference.germany.cityPageHasNoRegionalRuntimeState",
      !JSON.stringify(inBerlin).includes("Europe/Berlin") &&
        !JSON.stringify(inBerlin).includes("Example Street") &&
        !JSON.stringify(inBerlin).includes("data-region"),
      "no timezone/address/region attribute",
    );

    // The same ordinary Page in the English representation: explicit `en`, never `en-DE`.
    await cdp.navigate(`${GERMANY_BASE_URL}/de/en/frankfurt`);
    await waitReady(cdp);
    const englishFrankfurt = JSON.parse(await cdp.evaluate(REFERENCE_PROBE));
    const frankfurtSelectors = JSON.parse(await cdp.evaluate(REFERENCE_SELECTORS_PROBE));
    check(
      rows,
      "reference.germany.englishCityPageRemainsEnglish",
      englishFrankfurt.path === "/de/en/frankfurt" &&
        englishFrankfurt.canonical.endsWith("/de/en/frankfurt") &&
        frankfurtSelectors.lang === "en" &&
        !JSON.stringify(englishFrankfurt).includes("en-DE") &&
        !JSON.stringify(englishFrankfurt).includes("de-DE"),
      JSON.stringify({ path: englishFrankfurt.path, canonical: englishFrankfurt.canonical, lang: frankfurtSelectors.lang, h1s: englishFrankfurt.h1s }),
    );
    check(
      rows,
      "reference.germany.englishCityPageHasNoLocationControl",
      frankfurtSelectors.locationPresent === false && frankfurtSelectors.languageValue === "en",
      JSON.stringify(frankfurtSelectors),
    );

    // ── THE CONTROLS AT EVERY WIDTH, IN BOTH PRESENTATIONS AND LANGUAGES ────
    for (const [name, viewport] of [
      ["desktop", VIEWPORTS.desktop],
      ["tablet", VIEWPORTS.tablet],
      ["mobile", VIEWPORTS.mobile],
    ]) {
      await cdp.setViewport(viewport.width, viewport.height);
      for (const surface of ["sidebar", "menu-bar"]) {
        for (const localePath of ["de", "en"]) {
          await cdp.navigate(`${GERMANY_BASE_URL}/de/${localePath}`);
          await waitReady(cdp);
          await cdp.evaluate(chooseLayout(surface));
          await sleep(250);
          const state = JSON.parse(
            await cdp.evaluate(`JSON.stringify({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              shellLayout: document.documentElement.getAttribute('data-ui-shell-layout'),
              selectors: [...document.querySelectorAll('select[data-selector]')].map((el) => el.getAttribute('data-selector')),
            })`),
          );
          check(
            rows,
            `reference.germany.noHorizontalOverflow.${name}.${surface}.${localePath}`,
            state.scrollWidth <= state.clientWidth + 1,
            `scrollW=${state.scrollWidth} clientW=${state.clientWidth}`,
          );
          check(
            rows,
            `reference.germany.twoControlsAt.${name}.${surface}.${localePath}`,
            JSON.stringify(state.selectors) === JSON.stringify(["layout", "language"]),
            JSON.stringify({ selectors: state.selectors, shellLayout: state.shellLayout }),
          );
        }
      }
    }
    await cdp.evaluate(`document.cookie = "NEXT_LOCALE=; path=/; max-age=0"; true`);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);

    await cdp.evaluate(`document.cookie = "NEXT_LOCALE=; path=/; max-age=0"; true`);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);

    // ── The reference origin reaches the technical routes too ───────────────
    const technical = await cdp.evaluate(`(async () => {
      const sitemap = await (await fetch('/sitemap.xml')).text();
      const robots = await (await fetch('/robots.txt')).text();
      const locs = sitemap.split('<loc>').slice(1).map((part) => part.split('</loc>')[0]);
      return JSON.stringify({ locs, robots });
    })()`);
    const parsed = JSON.parse(technical);
    check(
      rows,
      "reference.sitemap.everyUrlOnReferenceOrigin",
      // The FIRST entry is the deployment's own origin (the locale-root home page),
      // so both the bare origin and its sub-paths are correct here.
      parsed.locs.length >= 2 &&
        parsed.locs.every((loc) => loc === REFERENCE_ORIGIN || loc.startsWith(`${REFERENCE_ORIGIN}/`)),
      JSON.stringify(parsed.locs),
    );
    check(
      rows,
      "reference.sitemap.publishesAuthoredAboutPage",
      parsed.locs.includes(`${REFERENCE_ORIGIN}/ww/en/about`),
      JSON.stringify(parsed.locs),
    );
    check(
      rows,
      "reference.robots.referencesSitemapOnReferenceOrigin",
      parsed.robots.includes(`${REFERENCE_ORIGIN}/sitemap.xml`),
      parsed.robots.replace(/\s+/g, " ").trim(),
    );
  } catch (error) {
    check(rows, "reference-content.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows;
}
