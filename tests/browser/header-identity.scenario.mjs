/**
 * FOUNDATION-UI-R1 — THE HEADER'S BRAND-AND-SELECTOR ROW, MEASURED IN A REAL BROWSER
 * =================================================================================
 *
 * WHY THIS SCENARIO EXISTS. The shared header used to place the brand identity and the right-hand control
 * cluster in the SAME grid cell for a configured logo, right-aligned the cluster over the artwork and gave it a
 * raised, OPAQUE surface: a control COVERING the brand as soon as a lockup was wide enough to reach it. The
 * correction (NAV1B-V2) is a wrapping flex row — brand first, cluster right-anchored, cluster ENTIRELY BELOW the
 * brand when the two cannot share a line — and THIS is where that contract is measured rather than asserted
 * about a class string:
 *
 *   · the brand and the cluster are measured as RECTANGLES, at the widths the acceptance names, for every
 *     identity kind (a configured graphical logo, a longer graphical lockup, the text-brand fallback) and for the
 *     no-selector case (a header with no top-right control at all);
 *   · when the two fit, they SHARE THE LINE, brand left and cluster at the right edge, with NO overlap;
 *   · when they do not fit, the cluster sits ENTIRELY BELOW the brand and is still right-aligned;
 *   · the logo keeps its accepted lockup height and its intrinsic proportions — it is never distorted, cropped,
 *     hidden or shrunk to keep the selector on the first row, and an exceptionally wide lockup is clamped
 *     PROPORTIONALLY to the header's content width instead (measured BELOW the narrowest named width, where that
 *     clamp really is the binding constraint);
 *   · the ACTUAL content-fit boundary is BISECTED and then checked on both sides: at the boundary the two share
 *     the line, one pixel below it the cluster has dropped — and the measured boundary is reconciled with the
 *     content the row actually has to hold (brand + gap + cluster + the header's own padding);
 *   · no horizontal document overflow, no clipped or hidden control, no obstructed click target, keyboard
 *     reachability and a working selector interaction in BOTH arrangements.
 *
 * THE FIXTURE IS CONFIGURATION ONLY (no authored content, no authored asset, nothing outside the disposable copy
 * the generic scenarios own): the identity variants are `site.assets.logo` URLs — the platform namespace's shared
 * mark, this repository's published lockup role file and its published wide header band, plus the absent case —
 * and the cluster is the navigation-MODE selector an adopter enables. The artwork is asserted by the properties
 * the contract needs (a real, loaded, positive-size image and the aspect ratio the file declares), never by a
 * particular file's pixels: an owner may replace allowed artwork without failing a scenario about the row.
 *
 * The installation, the config file and the dev server are the harness's OWN (`harness.configFile`,
 * `harness.startDevServer`), the original config is restored on every exit path, and no server survives a run.
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { materializeFourSpokeInstallation } from "../support/four-spoke-installation.mjs";

import { Cdp } from "./cdp.mjs";

/** The scenario's id, used as the report's label. */
export const id = "header-identity";

/** The viewport height every measurement uses unless a case names its own. */
const VIEWPORT_HEIGHT = 900;

/** How long a VIEWPORT CHANGE is given to lay out before the row is measured again. */
const RESIZE_SETTLE_MS = 120;

/**
 * THE OWNER'S NINE VIEWPORT CATEGORIES, at the exact CSS pixel widths they name.
 *
 * These are ACCEPTANCE CATEGORIES, not layout inputs: the row keeps wrapping according to the CONTENT available to
 * it, and deliberately no media query exists to match this table. The requested width is ALSO asserted against
 * `window.innerWidth`, so a width that silently failed to apply can never be read as a pass.
 */
const VIEWPORT_BANDS = [
  { category: "veryNarrowMobile", widths: [280, 320, 359] },
  { category: "standardAndroid", widths: [360, 375, 389] },
  { category: "mediumLargeSmartphone", widths: [390, 412, 429] },
  { category: "extraWideSmartphone", widths: [430, 480, 599] },
  { category: "smallTabletOrFolded", widths: [600, 700, 767] },
  { category: "standardTablet", widths: [768, 900, 1023] },
  { category: "largeTabletOrSmallLaptop", widths: [1024, 1152, 1279] },
  { category: "laptopDesktop", widths: [1280, 1366, 1439] },
  { category: "largeDesktop", widths: [1440, 1600, 1920] },
];

/** The 27 widths of the matrix, each with the category that named it. */
const VIEWPORTS = VIEWPORT_BANDS.flatMap((band) =>
  band.widths.map((width) => ({ width, category: band.category })),
);
const WIDTHS = VIEWPORTS.map((entry) => entry.width);

/** The category boundaries as ADJACENT PAIRS: both sides are measured, and the transition itself is asserted. */
const CATEGORY_TRANSITIONS = [
  [359, 360],
  [389, 390],
  [429, 430],
  [599, 600],
  [767, 768],
  [1023, 1024],
  [1279, 1280],
  [1439, 1440],
];

/**
 * The two boundaries where the SHELL's OWN navigation presentation bands change (md = 768, lg = 1024), so the
 * navigation surfaces are read on both sides of each rather than only at the header's own widths.
 */
const NAVIGATION_TRANSITIONS = [
  [767, 768],
  [1023, 1024],
];

/** REPRESENTATIVE SHORT AND TALL HEIGHTS at the measured widths, so "widths only" cannot hide a height defect. */
const HEIGHT_CASES = [
  [320, 568],
  [390, 844],
  [600, 800],
  [768, 1024],
  [1024, 768],
  [1440, 900],
  [1920, 1080],
];

/**
 * The narrow candidate widths the ACTUAL content-fit boundary is searched over. Deliberately BELOW the narrowest
 * width the acceptance names: a compact mark plus its cluster can need the second row only where the header's own
 * content box is still smaller than the two occupants together.
 */
const BOUNDARY_CANDIDATES = [320, 300, 280, 260, 240, 220, 200, 180, 160];

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [611, 612, 613];

/** The layout choice the interaction proof switches to and back from (the shipped pair, as the control labels them). */
const OTHER_LAYOUT = "menu-bar";
const DEFAULT_LAYOUT = "sidebar";

/** How far the measured content-fit boundary may differ from the content the row must hold, in pixels. */
const BOUNDARY_TOLERANCE = 4;

/**
 * THE IDENTITY VARIANTS — one configuration each, all of them test-owned.
 *
 * `logo: null` leaves `site.assets.logo` UNCONFIGURED on purpose: that is the text-brand fallback. `layoutSwitcher`
 * controls the navigation-MODE selector, so the variant with it DISABLED is the header with no top-right control
 * at all (the state in which the row has a single occupant).
 */
const VARIANTS = [
  {
    id: "textFallback",
    logo: null,
    layoutSwitcher: true,
    label: "the text-brand fallback with the mode selector beside it",
  },
  {
    id: "noTopRightSelector",
    logo: null,
    layoutSwitcher: false,
    label: "the text-brand fallback with no top-right selector",
  },
  {
    // The PLATFORM namespace, shared by every installation (S3E1C): 98x96, so it stays a compact mark.
    id: "compactGraphic",
    logo: "https://synthetic.example.test/assets/github.svg",
    layoutSwitcher: true,
    label: "a compact configured graphical logo",
  },
  {
    // FOUNDATION-UI-R1E — A NATURALLY SMALL SQUARE MARK: the platform namespace's own 24x24 icon, smaller than BOTH
    // display limits, so it is the case that proves a mark is never ENLARGED merely to fill the area it is allowed
    // (a forced lockup height used to stretch it to the shared display size).
    id: "smallSquareMark",
    logo: "https://synthetic.example.test/assets/icon-globe.svg",
    layoutSwitcher: true,
    label: "a naturally small square mark (24x24) beside the mode selector",
  },
  {
    // FOUNDATION-UI-R1F — THE COMPACT ALTERNATIVE. A PRIMARY mark (the platform namespace's 98x96 logo) plus a
    // COMPACT one (its 24x24 icon) — the two files have DIFFERENT intrinsic sizes, so which one the browser
    // selected is provable from `currentSrc` AND from the geometry of what actually loaded, never from a class
    // name or a comment. Both live in the shared platform namespace (S3E1C), so this variant proves the
    // selection and the display limits; the Spoke-owned namespaces are proved on the test-owned Hub below.
    id: "compactPair",
    logo: "https://synthetic.example.test/assets/github.svg",
    logoCompact: "https://synthetic.example.test/assets/icon-globe.svg",
    layoutSwitcher: true,
    label: "a compact alternative (24x24) below 600px and the primary mark (98x96) at 600px and wider",
  },
];

/**
 * EVERY FACT THE CONTRACT IS JUDGED ON, read from the rendered header: the row's computed flow, both occupants as
 * rectangles, the header's own content box, the graphic's declared and rendered geometry, the cluster's control
 * (visible? inside the content box? does it win the hit test at its own centre?) and the document's overflow.
 * Nothing here reads a class string as evidence of geometry.
 */
const PROBE = `(() => {
  const row = document.querySelector('.ui-site-header-top');
  const inner = document.querySelector('.ui-site-header > div');
  const brand = document.querySelector('.ui-site-header-identity');
  const cluster = document.querySelector('.ui-site-header-controls');
  const logo = document.querySelector('.ui-site-header-logo');
  const brandLink = brand ? brand.querySelector('a') : null;
  const layout = document.querySelector('[data-ui-layout-switcher]');
  const rowCs = row ? getComputedStyle(row) : null;
  const innerCs = inner ? getComputedStyle(inner) : null;
  const boxOf = (el) => {
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left), top: Math.round(r.top),
      right: Math.round(r.right), bottom: Math.round(r.bottom),
      width: Math.round(r.width), height: Math.round(r.height),
    };
  };
  const brandBox = brand ? boxOf(brand) : null;
  const clusterBox = cluster ? boxOf(cluster) : null;
  const logoBox = logo ? boxOf(logo) : null;
  const linkBox = brandLink ? boxOf(brandLink) : null;
  const contentLeft = inner
    ? Math.round(inner.getBoundingClientRect().left + (parseFloat(innerCs.paddingLeft) || 0))
    : null;
  const contentRight = inner
    ? Math.round(inner.getBoundingClientRect().right - (parseFloat(innerCs.paddingRight) || 0))
    : null;
  const insideContent = (box) =>
    !!box && contentLeft !== null && contentRight !== null &&
    box.left >= contentLeft - 1 && box.right <= contentRight + 1;
  const overlaps = (a, b) =>
    !!a && !!b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const control = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      box: boxOf(el),
      visible: r.width > 0 && r.height > 0,
      insideContent: insideContent(boxOf(el)),
      // A REAL pointer target: big enough to be aimed at in both dimensions, and reachable at its own centre.
      hitTargetBigEnough: r.width >= 16 && r.height >= 16,
      hittableAtItsCentre: !!hit && (el === hit || el.contains(hit)),
      value: typeof el.value === 'string' ? el.value : null,
      options: el.tagName === 'SELECT' ? [...el.options].map((option) => option.textContent) : [],
      ariaLabel: el.getAttribute('aria-label'),
    };
  };
  // UI-R1C — WHAT SURROUNDS THE ROW, so "the header does not disturb navigation or page content" is measured:
  // the secondary context row below it, the header's own bottom edge, the page content, and the shell's own
  // navigation surfaces (the rail, a top nav, the bottom bar and the constrained-width drawer).
  const header = document.querySelector('.ui-site-header');
  const contextRow = document.querySelector('.ui-site-header-context');
  const main = document.querySelector('main');
  const frame = document.querySelector('.ui-shell-frame');
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const navigationSurfaces = () =>
    [
      ['rail', document.querySelector('[data-ui-shell-part="rail"]')],
      ['top-nav', document.querySelector('[data-ui-shell-part="top-nav"]')],
      ['bottom-bar', document.querySelector('.ui-shell-bottom-bar')],
      ['drawer', document.querySelector('[data-ui-shell-part="mobile-drawer"]')],
    ]
      .filter(([, el]) => shown(el))
      .map(([name]) => name);
  const navigationBoxes = () =>
    ['.ui-shell-bottom-bar', '[data-ui-shell-part="rail"]', '[data-ui-shell-part="top-nav"]', '[data-ui-shell-part="mobile-drawer"]']
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(shown)
      .map(boxOf);
  // UI-R1C — THE PLATFORM'S OWN LAYOUT FLOOR, read from the token the shell declares (NAV1D-V2,
  // '--ui-shell-min-inline-size', 20rem): BELOW it the layout keeps that width and the viewport scrolls
  // horizontally BY DESIGN, so "no horizontal overflow" is judged against the greater of the viewport's own
  // content box and this declared floor — never against a width restated in the test.
  const layoutFloor = (() => {
    const token = getComputedStyle(document.documentElement)
      .getPropertyValue('--ui-shell-min-inline-size')
      .trim();
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // NOTE: this probe is a TEMPLATE LITERAL, where an escaped digit class would degrade — the character classes
    // below are written without escapes on purpose.
    const rem = /^([0-9.]+)rem$/.exec(token);
    if (rem) return Math.round(Number(rem[1]) * rootPx);
    const px = /^([0-9.]+)px$/.exec(token);
    return px ? Math.round(Number(px[1])) : 0;
  })();
  const active = document.activeElement;
  const activeCs = active && active !== document.body ? getComputedStyle(active) : null;
  // UI-R1E — THE MARK'S DISPLAY LIMITS, read from the tokens the stylesheet declares (never restated here): the
  // header's own maximum inline size and the shared display size that is the mark's block maximum.
  const tokenPx = (name) => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const inRem = /^([0-9.]+)rem$/.exec(raw);
    if (inRem) return Math.round(Number(inRem[1]) * rootPx);
    const inPx = /^([0-9.]+)px$/.exec(raw);
    return inPx ? Math.round(Number(inPx[1])) : 0;
  };
  return {
    viewportWidth: window.innerWidth,
    path: location.pathname,
    row: {
      present: !!row,
      display: rowCs ? rowCs.display : null,
      wrap: rowCs ? rowCs.flexWrap : null,
      columnGap: rowCs ? Math.round(parseFloat(rowCs.columnGap) || 0) : null,
      scrollOverflow: row ? row.scrollWidth - row.clientWidth : null,
    },
    brand: {
      box: brandBox,
      present: !!brand && !!brandBox && brandBox.width > 0,
      minWidth: brand ? getComputedStyle(brand).minWidth : null,
      linkBox,
      text: brand ? (brand.textContent || '').trim() : '',
    },
    cluster: {
      box: clusterBox,
      present: !!cluster && !!clusterBox && clusterBox.width > 0,
      anchorMargin: cluster ? getComputedStyle(cluster).marginInlineStart : null,
      rightInset: clusterBox && contentRight !== null ? contentRight - clusterBox.right : null,
      belowBrand: !!brandBox && !!clusterBox && clusterBox.top >= brandBox.bottom - 1,
      insideContent: insideContent(clusterBox),
      // UI-R1E — the cluster's MAX-CONTENT width: what the row must find room for beside the brand when the two
      // share a line (its own width where it was never squeezed, its widest line where it wrapped internally).
      maxContentWidth: cluster ? Math.max(cluster.scrollWidth, clusterBox ? clusterBox.width : 0) : null,
      controls: [...(cluster ? cluster.querySelectorAll('select, a, button') : [])].map(control),
    },
    content: { left: contentLeft, right: contentRight, width: contentRight - contentLeft },
    overlaps: overlaps(brandBox, clusterBox),
    brandInsideContent: insideContent(brandBox),
    logo: logo
      ? {
          complete: logo.complete,
          naturalWidth: logo.naturalWidth,
          naturalHeight: logo.naturalHeight,
          box: logoBox,
          // UI-R1E — the RENDERED size at sub-pixel precision. The integer box above is right for placement and
          // overlap maths, but a 64:1 mark is only ~4.4px tall, so rounding it to whole pixels would misstate its
          // aspect ratio by a tenth and fail a correct mark. Size and ratio are therefore judged on THESE numbers.
          size: (() => {
            const r = logo.getBoundingClientRect();
            return { width: Math.round(r.width * 100) / 100, height: Math.round(r.height * 100) / 100 };
          })(),
          objectFit: getComputedStyle(logo).objectFit,
          // FOUNDATION-UI-R1F — THE ARTWORK THE BROWSER ACTUALLY CHOSE. 'currentSrc' is the resolved URL of the
          // image the source-selection algorithm picked (the compact source or the fallback image), so "which
          // variant is on screen" is read FROM THE BROWSER rather than inferred from the configuration.
          currentSrc: logo.currentSrc,
          // …and the FALLBACK the markup itself names (the '<img src>'), which must be the PRIMARY artwork: the
          // compact alternative is a '<source>', never the thing every browser without '<picture>' falls back to.
          src: logo.getAttribute('src'),
        }
      : null,
    // FOUNDATION-UI-R1F — THE RESPONSIVE-IMAGE MACHINERY, as the DOM exposes it: the ONE wrapper, the ONE
    // optional source (with the boundary it declares) and the number of images inside the identity — a second,
    // CSS-hidden image is the defect this counts.
    picture: (() => {
      const frame = document.querySelector('.ui-site-header-logo-frame');
      return {
        present: !!frame,
        sources: frame
          ? [...frame.querySelectorAll('source')].map((source) => ({
              media: source.getAttribute('media'),
              srcset: source.getAttribute('srcset'),
            }))
          : [],
        imagesInsideTheIdentity: document.querySelectorAll('.ui-site-header-identity img').length,
      };
    })(),
    // ── UI-R1C — THE ROW'S SURROUNDINGS, MEASURED ──────────────────────────────────────────────────
    brandIsFirstInReadingOrder: !!brand && !!row && row.firstElementChild === brand,
    topRowBottom: row ? Math.round(row.getBoundingClientRect().bottom) : null,
    contextRow: {
      present: !!contextRow,
      top: contextRow ? Math.round(contextRow.getBoundingClientRect().top) : null,
      belowTheTopRow:
        !!contextRow && !!row
          ? contextRow.getBoundingClientRect().top >= row.getBoundingClientRect().bottom - 1
          : null,
      rows: contextRow
        ? new Set(
            [...contextRow.children].map((child) => Math.round(child.getBoundingClientRect().top)),
          ).size
        : 0,
    },
    page: {
      mainPresent: !!main,
      contentStartsBelowTheHeader:
        !!main && !!header
          ? main.getBoundingClientRect().top >= header.getBoundingClientRect().bottom - 1
          : null,
      contentInsideTheViewport: main
        ? main.getBoundingClientRect().right <= Math.max(window.innerWidth, layoutFloor) + 1
        : null,
    },
    navigation: {
      surfaces: navigationSurfaces(),
      drawerTriggerPresent: !!document.querySelector('.ui-shell-mobile-nav-trigger'),
      intersectsTheTopRow: navigationBoxes().some((box) => overlaps(box, row ? boxOf(row) : null)),
    },
    layoutControl: control(layout),
    layoutFloor,
    // UI-R1E — the mark's two display limits, as the page declares them (the header token and the display size).
    logoLimits: {
      inline: tokenPx('--ui-site-header-logo-max-inline-size'),
      block: tokenPx('--ui-logo-display-size'),
    },
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
    // FOUNDATION-UI-R1G — the ORIGIN this page was really served from. The compact logo's delivery contract is
    // stated against it, because a configured origin is canonical SOURCE identity, never a delivery origin: the
    // browser must fetch the artwork from THIS origin whatever host the configuration names.
    documentOrigin: window.location.origin,
    // UI-R1D — THE SHELL FRAME ITSELF: its width and the computed 'min-inline-size' the floor rule would apply.
    // At a SUPPORTED width the frame must simply BE the viewport's content box (no floor standing in for it).
    frameWidth: frame ? Math.round(frame.getBoundingClientRect().width) : null,
    frameMinInlineSize: frame ? getComputedStyle(frame).minInlineSize : null,
    documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    active: active && active !== document.body
      ? {
          tag: active.tagName,
          isBrandLink: active === brandLink,
          isLayoutControl: active === layout,
          focusVisible: active.matches(':focus-visible'),
          outlineStyle: activeCs ? activeCs.outlineStyle : null,
          outlineWidth: activeCs ? activeCs.outlineWidth : null,
        }
      : null,
  };
})()`;

/** Select a layout exactly as a visitor does (the control's value plus the change event its handler listens for). */
function chooseLayout(layout) {
  return `(() => {
    const control = document.querySelector('[data-ui-layout-switcher]');
    if (!control) return null;
    control.value = ${JSON.stringify(layout)};
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return { value: control.value, active: document.documentElement.getAttribute('data-ui-shell-layout') };
  })()`;
}

/** What the shell reports about the ACTIVE presentation, so a selection can be seen to have been APPLIED. */
const SHELL_STATE = `(() => ({
  active: document.documentElement.getAttribute('data-ui-shell-layout'),
  rail: [...document.querySelectorAll('[data-ui-shell-part="rail"]')].some((el) => el.getBoundingClientRect().width > 0),
  bar: [...document.querySelectorAll('.ui-shell-bottom-bar')].some((el) => el.getBoundingClientRect().width > 0),
}))()`;

/** The header as this scenario's probe reads it, once the page has settled (harness readiness + one frame). */
async function readHeader(harness, cdp) {
  await harness.waitReady(cdp);
  await new Promise((resolve) => setTimeout(resolve, 200));
  return cdp.evaluate(PROBE);
}

/**
 * The header as the probe reads it at ONE VIEWPORT, changed rather than navigated to: no readiness wait is needed
 * (the document is already there), only the time the browser needs to lay the new width out.
 */
async function readHeaderAt(cdp, width, height = VIEWPORT_HEIGHT) {
  await cdp.setViewport(width, height);
  await new Promise((resolve) => setTimeout(resolve, RESIZE_SETTLE_MS));
  return cdp.evaluate(PROBE);
}

/** The variant's configuration, written to the DISPOSABLE copy through the harness's own guarded writer. */
function configurationFor(original, variant) {
  const config = JSON.parse(original);
  config.ui = {
    ...(config.ui ?? {}),
    layoutSwitcher: { enabled: variant.layoutSwitcher, default: DEFAULT_LAYOUT },
  };
  const assets = { ...(config.site?.assets ?? {}) };
  if (variant.logo === null) delete assets.logo;
  else assets.logo = variant.logo;
  // FOUNDATION-UI-R1F — the OPTIONAL compact alternative, applied the same way: absent for a variant that
  // configures none, so a primary-only (or text-only) installation keeps exactly the configuration it has today.
  if (!variant.logoCompact) delete assets.logoCompact;
  else assets.logoCompact = variant.logoCompact;
  config.site = { ...config.site, assets };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** The arrangement a measurement shows: the cluster on the brand's line, or the cluster entirely below it. */
function arrangementOf(seen) {
  return seen.cluster.present && seen.cluster.belowBrand ? "cluster-below" : "one-line";
}

/** The BASENAME a URL resolves to — the ONE thing "which artwork is on screen" is judged on. */
function basenameOf(url) {
  if (typeof url !== "string") return "";
  return url.split("?")[0].split("#")[0].split("/").pop() ?? "";
}

/** Poll the probe until the SELECTED artwork has finished loading, or the budget runs out. */
async function waitForSelectedArtwork(cdp, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let seen = await cdp.evaluate(PROBE);
  while (Date.now() < deadline && !(seen.logo && seen.logo.complete === true && seen.logo.naturalWidth > 0)) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    seen = await cdp.evaluate(PROBE);
  }
  return seen;
}

/**
 * Poll the probe until the SELECTION is `expectedName`, or the budget runs out.
 *
 * A viewport change is asynchronous from the page's point of view: immediately after `Emulation.setDeviceMetricsOverride`
 * the DOM still reports the PREVIOUS selection. Reading it then would prove nothing about the browser's rule — so every
 * measurement of a compact-configured variant waits (bounded) for the selection itself, and the assertion is then made
 * on the answer the browser eventually gave, not on a snapshot taken too early.
 */
async function waitForSelection(cdp, expectedName, budgetMs) {
  const deadline = Date.now() + budgetMs;
  let seen = await cdp.evaluate(PROBE);
  while (Date.now() < deadline && basenameOf(seen.logo && seen.logo.currentSrc) !== expectedName) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    seen = await cdp.evaluate(PROBE);
  }
  return seen;
}

/**
 * The artwork the width's side of the boundary entitles the visitor to, or `null` when the variant configures no
 * compact alternative (nothing to select, so nothing to wait for).
 */
function expectedArtworkAt(variant, width) {
  if (!variant.logo || !variant.logoCompact) return null;
  return width < 600 ? basenameOf(variant.logoCompact) : basenameOf(variant.logo);
}

/**
 * FOUNDATION-UI-R1F — THE RESPONSIVE-IMAGE MACHINERY, AT ONE MEASURED WIDTH.
 *
 * Exactly what the ruling asks the header to compose, read from the DOM the browser built (never from the
 * component source): ONE image inside the identity (a second, CSS-hidden image is the defect), ONE `<source>`
 * carrying the documented boundary, the compact artwork in that source's `srcset`, and the PRIMARY artwork as the
 * fallback `<img src>`. A variant with no compact artwork configured must compose NO source at all and render the
 * primary artwork at every width — the "primary-only installations are unchanged" half of the contract.
 */
function assertArtDirection(harness, rows, tag, seen, variant) {
  const compact = variant.logoCompact ?? null;
  const primary = variant.logo ?? null;
  if (primary === null) {
    // The TEXT-BRAND FALLBACK renders no image and no source at all: there is nothing to select, nothing to load
    // and no second identity hiding behind CSS.
    harness.check(
      rows,
      `${tag}.selection.noImageWithoutAGraphicIdentity`,
      seen.logo === null && seen.picture.imagesInsideTheIdentity === 0 && seen.picture.sources.length === 0,
      JSON.stringify(seen.picture),
    );
    return;
  }
  harness.check(
    rows,
    `${tag}.selection.exactlyOneImageInsideTheIdentity`,
    seen.picture.imagesInsideTheIdentity === 1,
    JSON.stringify(seen.picture),
  );
  // ── FOUNDATION-UI-R1G — THE DELIVERY CONTRACT, AS THE BROWSER RESOLVED IT ────────────────────────────────
  // Whichever artwork the source-selection algorithm picked must have been fetched from THIS DOCUMENT'S OWN
  // ORIGIN — never from the configured origin, which is canonical source identity only (BRAND_ASSETS.md §3) — and
  // it must carry the basename the width entitles the visitor to: the compact artwork below 600 CSS pixels, the
  // primary artwork at and above it, and the primary artwork everywhere when no compact alternative is configured.
  const delivered = seen.logo ? seen.logo.currentSrc : null;
  const entitled = expectedArtworkAt(variant, seen.viewportWidth) ?? basenameOf(primary);
  harness.check(
    rows,
    `${tag}.selection.theSelectionIsServedFromThisOrigin`,
    !!delivered && delivered.startsWith("http") && new URL(delivered).origin === seen.documentOrigin,
    `currentSrc=${delivered} documentOrigin=${seen.documentOrigin} configuredPrimary=${primary} configuredCompact=${compact}`,
  );
  harness.check(
    rows,
    `${tag}.selection.theSelectionCarriesTheArtworkThisWidthEntitlesItTo`,
    basenameOf(delivered) === entitled,
    `currentSrc=${delivered} entitled=${entitled}`,
  );
  if (compact === null) {
    harness.check(
      rows,
      `${tag}.selection.noSourceWhenNothingIsConfigured`,
      seen.picture.sources.length === 0,
      JSON.stringify(seen.picture.sources),
    );
    harness.check(
      rows,
      `${tag}.selection.thePrimaryLogoAtEveryWidth`,
      basenameOf(seen.logo && seen.logo.currentSrc) === basenameOf(primary),
      `currentSrc=${seen.logo && seen.logo.currentSrc}`,
    );
    return;
  }
  const source = seen.picture.sources[0];
  harness.check(
    rows,
    `${tag}.selection.oneSourceWithTheBoundary`,
    seen.picture.sources.length === 1,
    JSON.stringify(seen.picture.sources),
  );
  harness.check(
    rows,
    `${tag}.selection.theBoundaryIsTheDocumentedOne`,
    !!source && /max-width:\s*599\.98px/.test(source.media ?? ""),
    `media=${source && source.media}`,
  );
  harness.check(
    rows,
    `${tag}.selection.theSourceNamesTheCompactArtwork`,
    basenameOf(source && source.srcset) === basenameOf(compact),
    `srcset=${source && source.srcset}`,
  );
  harness.check(
    rows,
    `${tag}.selection.theFallbackImageIsThePrimaryArtwork`,
    basenameOf(seen.logo && seen.logo.src) === basenameOf(primary),
    `src=${seen.logo && seen.logo.src}`,
  );
}

/** Start a dev server for a given installation, trying the next port when one is already taken. */
async function startServer(harness, basePort, pathname, { deploymentRoot = null, host = "localhost" } = {}) {
  let lastError = null;
  for (const offset of PORT_OFFSETS) {
    const port = basePort + offset;
    const server =
      deploymentRoot === null
        ? harness.startDevServer(port)
        : harness.startDevServer(port, { deploymentRoot });
    try {
      await harness.waitForServer(`http://${host}:${port}${pathname}`);
      return { server, port };
    } catch (error) {
      lastError = error;
      await harness.stopServer(server);
    }
  }
  throw lastError ?? new Error("no free dev-server port");
}

/**
 * THE CONTRACT AT ONE MEASURED ARRANGEMENT (one width × one identity variant).
 *
 * Both arrangements are held to the SAME rules, and the pair of them is exhaustive: the brand is first and inside
 * the padded content box; the cluster is right-anchored in whichever line it occupies and NEVER overlaps the
 * brand; if it shares the brand's line it is beside it, and if it does not it is ENTIRELY BELOW it. Every control
 * the cluster holds must be visible, inside the content box and unobstructed (it wins the hit test at its own
 * centre — nothing covers it), and nothing may widen or scroll the document.
 */
/**
 * THE HORIZONTAL LIMIT AT A SUPPORTED WIDTH: the viewport's own content box, plus browser rounding.
 *
 * Every width the acceptance names is AT OR ABOVE the platform's supported minimum, so the shell's floor plays no
 * part here on purpose: letting the floor stand in for the viewport would hide exactly the defect this corrects
 * (a floor ABOVE a supported width made the page gain width as the window narrowed, and kept a 280px window on the
 * one-line arrangement that the same content could not fit at 320px). The floor's own behaviour is proved
 * separately, BELOW the supported minimum, by `proveBelowFloorFallback`.
 */
function horizontalLimit(seen) {
  return seen.documentClientWidth + 1;
}

/** True when no two of these boxes overlap: every pair is separated on the inline or the block axis. */
function boxesAreDisjoint(boxes) {
  for (let first = 0; first < boxes.length; first += 1) {
    for (let second = first + 1; second < boxes.length; second += 1) {
      const a = boxes[first];
      const b = boxes[second];
      if (!a || !b) continue;
      const overlaps =
        a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
      if (overlaps) return false;
    }
  }
  return true;
}

/**
 * UI-R1D — THE CONTENT-FIT BEHAVIOUR MUST BE PHYSICALLY CONSISTENT ACROSS THE CATEGORY BOUNDARIES.
 *
 * The one thing a minimum-width frame must never do is give a NARROWER window MORE usable space than a wider one:
 * that is exactly how a 280px window ended up on the one-line arrangement the same content could not fit at 320px.
 * The boundaries are therefore also checked in the row's own currency — the frame the row is laid out inside —
 * allowing only the vertical scrollbar's own width (the one legitimate reason for a few pixels of inversion).
 */
const FRAME_CONSISTENCY_TOLERANCE = 16;

function proveFrameConsistencyAcrossBoundaries(harness, rows, label, frameByWidth) {
  for (const [narrow, wide] of CATEGORY_TRANSITIONS) {
    const narrower = frameByWidth.get(narrow);
    const wider = frameByWidth.get(wide);
    harness.check(
      rows,
      `${label}.frame.consistent.${narrow}_${wide}`,
      typeof narrower === "number" && typeof wider === "number" && narrower - wider <= FRAME_CONSISTENCY_TOLERANCE,
      `frame(${narrow})=${narrower} frame(${wide})=${wider} — a narrower window may not hold more usable space than a wider one`,
    );
  }
}

/**
 * THE DOCUMENTED FALLBACK BELOW THE SUPPORTED MINIMUM — a width this platform does not claim to support.
 *
 * The frame keeps the platform's DECLARED floor, the viewport scrolls horizontally instead of the layout deforming,
 * and the row still holds its own contract. This is what "supported from 280px" has to mean: the floor must sit
 * BELOW the supported minimum and never above it, and its value is READ FROM THE PAGE rather than restated here.
 */
async function proveBelowFloorFallback(harness, rows, cdp, label) {
  const atTheMinimum = await readHeaderAt(cdp, 280);
  const floor = atTheMinimum.layoutFloor;
  harness.check(
    rows,
    `${label}.atTheSupportedMinimum.noOverflow`,
    atTheMinimum.documentScrollWidth <= atTheMinimum.documentClientWidth + 1,
    `scroll=${atTheMinimum.documentScrollWidth} client=${atTheMinimum.documentClientWidth}`,
  );
  harness.check(
    rows,
    `${label}.atTheSupportedMinimum.floorDoesNotApply`,
    atTheMinimum.frameMinInlineSize === "auto" || /^0(px)?$/.test(String(atTheMinimum.frameMinInlineSize)),
    `min-inline-size=${atTheMinimum.frameMinInlineSize} frame=${atTheMinimum.frameWidth}`,
  );
  const belowWidth = Math.max(200, floor - 20);
  const below = await readHeaderAt(cdp, belowWidth);
  harness.check(
    rows,
    `${label}.belowTheFloor.theLayoutKeepsItsDeclaredFloor`,
    below.documentScrollWidth >= floor - 1 && below.documentScrollWidth <= floor + 1,
    `scroll=${below.documentScrollWidth} floor=${floor} at=${belowWidth}`,
  );
  harness.check(
    rows,
    `${label}.belowTheFloor.theViewportScrollsInsteadOfTheLayoutDeforming`,
    below.documentOverflow > 1,
    `overflow=${below.documentOverflow} at=${belowWidth}`,
  );
  harness.check(
    rows,
    `${label}.belowTheFloor.theRowStillHoldsItsContract`,
    below.overlaps === false &&
      below.brand.present &&
      below.row.scrollOverflow !== null &&
      below.row.scrollOverflow <= 0 &&
      (below.cluster.present || below.layoutControl === null),
    `overlap=${below.overlaps} brand=${below.brand.present} cluster=${below.cluster.present} rowOverflow=${below.row.scrollOverflow}`,
  );
  console.log(
    `[header-identity] ${label}.floor: declared=${floor} @280 scroll=${atTheMinimum.documentScrollWidth}/client=${atTheMinimum.documentClientWidth} ; @${belowWidth} scroll=${below.documentScrollWidth} overflow=${below.documentOverflow}`,
  );
}

function assertRow(harness, rows, tag, seen, variant) {
  harness.check(rows, `${tag}.row.present`, !!seen.row.present, JSON.stringify(seen.row));
  harness.check(
    rows,
    `${tag}.row.wrapsByContent`,
    seen.row.display === "flex" && seen.row.wrap === "wrap",
    `display=${seen.row.display} flex-wrap=${seen.row.wrap}`,
  );
  harness.check(
    rows,
    `${tag}.brand.startsAtThePaddedLeftEdge`,
    seen.brand.present && Math.abs(seen.brand.box.left - seen.content.left) <= 1,
    `brand=${JSON.stringify(seen.brand.box)} content=${JSON.stringify(seen.content)}`,
  );
  harness.check(
    rows,
    `${tag}.brand.yieldsWidthNotPlace`,
    seen.brand.minWidth === "0px",
    `min-width=${seen.brand.minWidth}`,
  );
  harness.check(rows, `${tag}.brandInsideTheContentBox`, !!seen.brandInsideContent, JSON.stringify(seen.brand.box));
  assertLogo(harness, rows, tag, seen, variant);
  proveFitRule(harness, rows, tag, seen, variant);

  if (!seen.cluster.present) {
    // NO TOP-RIGHT SELECTOR: the row has one occupant, so there is nothing to anchor and nothing to reserve.
    harness.check(
      rows,
      `${tag}.noTopRightSelector`,
      seen.layoutControl === null && seen.cluster.controls.length === 0,
      `controls=${seen.cluster.controls.length}`,
    );
    harness.check(rows, `${tag}.row.doesNotScroll`, seen.row.scrollOverflow !== null && seen.row.scrollOverflow <= 0, `rowOverflow=${seen.row.scrollOverflow}`);
    const noSelectorLimit = horizontalLimit(seen);
    harness.check(
      rows,
      `${tag}.noHorizontalOverflow`,
      seen.documentScrollWidth <= noSelectorLimit,
      `scrollWidth=${seen.documentScrollWidth} limit=${noSelectorLimit} (client=${seen.documentClientWidth} floor=${seen.layoutFloor})`,
    );
    return;
  }

  const arrangement = arrangementOf(seen);
  harness.check(
    rows,
    `${tag}.neverOverlaps`,
    seen.overlaps === false,
    `brand=${JSON.stringify(seen.brand.box)} cluster=${JSON.stringify(seen.cluster.box)}`,
  );
  harness.check(
    rows,
    `${tag}.${arrangement}.sharesTheLineOrSitsEntirelyBelow`,
    arrangement === "one-line"
      ? seen.cluster.box.top < seen.brand.box.bottom - 1
      : seen.cluster.box.top >= seen.brand.box.bottom - 1,
    `brand=${JSON.stringify(seen.brand.box)} cluster=${JSON.stringify(seen.cluster.box)}`,
  );
  harness.check(
    rows,
    `${tag}.${arrangement}.clusterIsRightAnchored`,
    seen.cluster.rightInset !== null && Math.abs(seen.cluster.rightInset) <= 1,
    `rightInset=${seen.cluster.rightInset} anchor=${seen.cluster.anchorMargin}`,
  );
  harness.check(
    rows,
    `${tag}.${arrangement}.clusterInsideTheContentBox`,
    !!seen.cluster.insideContent,
    `cluster=${JSON.stringify(seen.cluster.box)} content=${JSON.stringify(seen.content)}`,
  );
  harness.check(
    rows,
    `${tag}.${arrangement}.controlsVisibleInsideAndUnobstructed`,
    seen.cluster.controls.length > 0 &&
      seen.cluster.controls.every(
        (control) => control !== null && control.visible && control.insideContent && control.hittableAtItsCentre,
      ),
    JSON.stringify(seen.cluster.controls),
  );
  // UI-R1D — THE CLUSTER'S OWN CONTROLS NEVER OVERLAP EACH OTHER. When the line the cluster holds is narrower than
  // its controls together, they STACK (the cluster's own `flex-wrap`, which only works because the cluster may
  // shrink); they are never squeezed onto one another and never pushed outside the cluster's own box.
  harness.check(
    rows,
    `${tag}.${arrangement}.clusterControlsNeverOverlap`,
    boxesAreDisjoint(seen.cluster.controls.map((control) => control && control.box)),
    JSON.stringify(seen.cluster.controls.map((control) => control && control.box)),
  );
  harness.check(rows, `${tag}.${arrangement}.identityAndSelectorBothVisible`, seen.brand.present && seen.cluster.present, `brand=${seen.brand.box.width} cluster=${seen.cluster.box.width}`);
  harness.check(rows, `${tag}.row.doesNotScroll`, seen.row.scrollOverflow !== null && seen.row.scrollOverflow <= 0, `rowOverflow=${seen.row.scrollOverflow}`);
  // NO HORIZONTAL PAGE OVERFLOW, judged against the viewport's own content box or the platform's declared floor.
  const limit = horizontalLimit(seen);
  harness.check(
    rows,
    `${tag}.noHorizontalOverflow`,
    seen.documentScrollWidth <= limit,
    `scrollWidth=${seen.documentScrollWidth} limit=${limit} (client=${seen.documentClientWidth} floor=${seen.layoutFloor})`,
  );
  // UI-R1D — THE SHELL FRAME AT A SUPPORTED WIDTH. The platform's floor must NOT be standing in for the viewport
  // (its `min-inline-size` is not a fixed value here), and the frame must simply BE the viewport's content box.
  // These two facts are what the 320→280 correction restored: with a floor ABOVE a supported width the frame was
  // pinned wider than the window itself, which is also why a narrower window held MORE usable space than a wider
  // one and stayed on an arrangement its content could not fit one step up.
  harness.check(
    rows,
    `${tag}.frame.floorDoesNotStandInForTheViewport`,
    seen.frameMinInlineSize === "auto" || /^0(px)?$/.test(String(seen.frameMinInlineSize)),
    `min-inline-size=${seen.frameMinInlineSize} frame=${seen.frameWidth} client=${seen.documentClientWidth}`,
  );
  harness.check(
    rows,
    `${tag}.frame.isTheViewportsOwnContentBox`,
    seen.frameWidth !== null && Math.abs(seen.frameWidth - seen.documentClientWidth) <= 1,
    `frame=${seen.frameWidth} client=${seen.documentClientWidth}`,
  );
  // ── UI-R1C — THE ROW'S SURROUNDINGS ─────────────────────────────────────────────────────────────────
  // The brand is first in reading order; the secondary context row is still below the top row (not beside it or
  // moved up); the page content still starts below the header; the shell still presents a navigation affordance
  // and none of its surfaces is overlapped by the row; and every control the cluster holds is a real pointer target.
  harness.check(
    rows,
    `${tag}.brand.isFirstInReadingOrder`,
    seen.brandIsFirstInReadingOrder === true,
    `brandIsFirst=${seen.brandIsFirstInReadingOrder}`,
  );
  harness.check(
    rows,
    `${tag}.contextRow.stillBelowTheTopRow`,
    seen.contextRow.present ? seen.contextRow.belowTheTopRow === true : true,
    `context=${JSON.stringify(seen.contextRow)} topRowBottom=${seen.topRowBottom}`,
  );
  harness.check(
    rows,
    `${tag}.page.contentStartsBelowTheHeader`,
    seen.page.mainPresent ? seen.page.contentStartsBelowTheHeader === true : true,
    `main=${JSON.stringify(seen.page)}`,
  );
  harness.check(rows, `${tag}.page.contentInsideTheViewport`, seen.page.contentInsideTheViewport !== false, JSON.stringify(seen.page));
  harness.check(
    rows,
    `${tag}.navigation.notIntersectedByTheRow`,
    seen.navigation.intersectsTheTopRow === false,
    `surfaces=${JSON.stringify(seen.navigation.surfaces)} intersects=${seen.navigation.intersectsTheTopRow}`,
  );
  harness.check(
    rows,
    `${tag}.controls.haveUsablePointerHitTargets`,
    seen.cluster.controls.every((control) => control !== null && control.hitTargetBigEnough === true),
    JSON.stringify(seen.cluster.controls),
  );
}

/**
 * UI-R1C — THE CATEGORY BOUNDARIES, AND THE ONE INVARIANT THAT MUST NEVER BREAK ACROSS THEM.
 *
 * Every pair is two ADJACENT widths from the nine categories, both of them measured above. No width is declared to
 * be one-line or two-line (the CONTENT decides that), but the two sides may not contradict physics: a wider content
 * box can never need MORE rows than a narrower one, so "one line at the narrower width, cluster below at the wider
 * one" is impossible — asserted impossible at every boundary.
 */
function proveTransitions(harness, rows, label, arrangements) {
  for (const [narrow, wide] of CATEGORY_TRANSITIONS) {
    harness.check(
      rows,
      `${label}.transition.${narrow}_${wide}.bothSidesMeasured`,
      arrangements.has(narrow) && arrangements.has(wide),
      `narrow=${arrangements.get(narrow)} wide=${arrangements.get(wide)}`,
    );
    harness.check(
      rows,
      `${label}.transition.${narrow}_${wide}.neverWrapsWiderWhereThereIsMoreRoom`,
      !(arrangements.get(narrow) === "one-line" && arrangements.get(wide) === "cluster-below"),
      `${narrow}=${arrangements.get(narrow)} ${wide}=${arrangements.get(wide)}`,
    );
  }
}

/**
 * THE NAVIGATION BOUNDARIES (767/768 and 1023/1024), where the SHELL's own presentation bands change.
 *
 * On both sides of each: a navigation affordance is still presented (a surface, or the constrained-width drawer's
 * own trigger), the row does not overlap any surface, and the page content still starts below the header. The
 * surfaces that ARE presented are recorded on both sides as evidence, so a band change is visible in the report
 * rather than assumed.
 */
async function proveNavigationBoundaries(harness, rows, cdp, label) {
  for (const [narrow, wide] of NAVIGATION_TRANSITIONS) {
    const before = await readHeaderAt(cdp, narrow);
    const after = await readHeaderAt(cdp, wide);
    harness.check(
      rows,
      `${label}.navigationTransition.${narrow}_${wide}.atMostOneLandmarkOnEitherSide`,
      before.navigation.surfaces.length <= 1 && after.navigation.surfaces.length <= 1,
      `w${narrow}=${JSON.stringify(before.navigation.surfaces)} | w${wide}=${JSON.stringify(after.navigation.surfaces)}`,
    );
    harness.check(
      rows,
      `${label}.navigationTransition.${narrow}_${wide}.rowNeverOverlapsANavigationSurface`,
      before.navigation.intersectsTheTopRow === false && after.navigation.intersectsTheTopRow === false,
      `w${narrow}=${before.navigation.intersectsTheTopRow} w${wide}=${after.navigation.intersectsTheTopRow}`,
    );
    harness.check(
      rows,
      `${label}.navigationTransition.${narrow}_${wide}.contentStaysBelowTheHeader`,
      before.page.contentStartsBelowTheHeader !== false && after.page.contentStartsBelowTheHeader !== false,
      `w${narrow}=${before.page.contentStartsBelowTheHeader} w${wide}=${after.page.contentStartsBelowTheHeader}`,
    );
    console.log(
      `[header-identity] ${label}.navigation ${narrow}->${wide}: ${JSON.stringify(before.navigation.surfaces)} drawer=${before.navigation.drawerTriggerPresent} -> ${JSON.stringify(after.navigation.surfaces)} drawer=${after.navigation.drawerTriggerPresent}`,
    );
  }
}

/** Where the keyboard is, and whether the focused control presents the one global focus ring. */
const ACTIVE_PROBE = `(() => {
  const active = document.activeElement;
  if (!active || active === document.body) return null;
  const cs = getComputedStyle(active);
  const brandLink = document.querySelector('.ui-site-header-identity a');
  const layout = document.querySelector('[data-ui-layout-switcher]');
  return {
    tag: active.tagName,
    inHeader: !!active.closest('.ui-site-header'),
    isBrandLink: !!brandLink && active === brandLink,
    isLayoutControl: !!layout && active === layout,
    focusVisible: active.matches(':focus-visible'),
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
  };
})()`;

/**
 * Press Tab — a REAL key event, so Chromium's KEYBOARD modality is what moves the focus — until the focused element
 * satisfies `matches`, or the attempts run out. The Tab order is what proves the row is keyboard-reachable in
 * whichever arrangement it is in: the brand is the row's first stop, and the cluster's control is the next one.
 */
async function tabUntil(cdp, matches, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await cdp.pressKey("Tab");
    const active = await cdp.evaluate(ACTIVE_PROBE);
    if (active && matches(active)) return active;
  }
  return await cdp.evaluate(ACTIVE_PROBE);
}

/**
 * THE ACTUAL CONTENT-FIT BOUNDARY, BISECTED IN THE BROWSER.
 *
 * The boundary is neither assumed from a breakpoint nor derived from a brand width written down here: it is FOUND,
 * by asking the RENDERED row — at a series of real viewport widths, each one laid out and measured — whether the
 * cluster still shares the brand's line. `low` must be a width where the cluster is already below (the caller
 * asserts that), `high` one where it is not.
 */
async function fitBoundary(harness, cdp, low, high) {
  let below = low;
  let shared = high;
  while (shared - below > 1) {
    const middle = Math.floor((below + shared) / 2);
    await cdp.setViewport(middle, VIEWPORT_HEIGHT);
    const seen = await readHeader(harness, cdp);
    if (seen.cluster.present && !seen.cluster.belowBrand) shared = middle;
    else below = middle;
  }
  return { boundary: shared, below };
}

/**
 * THE BOUNDARY PROOF — the width the row ACTUALLY changes arrangement at, and both sides of it.
 *
 * The endpoints are MEASURED, never assumed: the narrow candidate widths are walked down until the cluster has
 * really dropped (a compact mark fits on one line at 320, so one fixed low endpoint would have been wrong), and
 * the widest measured width reports whether a boundary exists in range AT ALL — an identity whose own content is
 * wider than the header can never share the line, which is a fact about that identity and is asserted as one.
 *
 * The boundary is then BISECTED, both widths either side of it are held to the contract, and the boundary itself is
 * RECONCILED with the content the row must hold: the brand's own width, the row's column gap, the cluster's width
 * and the header's two padded edges — measured at a width where both occupants are at their natural size. A layout
 * that matched a breakpoint instead of its content would fail that reconciliation.
 */

/** The bisected boundary and its two sides, reconciled with the content the row has to hold. */
async function proveBoundary(harness, rows, cdp, variant, widest, high) {
  if (!widest.cluster.present) return;

  let low = null;
  for (const width of BOUNDARY_CANDIDATES) {
    await cdp.setViewport(width, VIEWPORT_HEIGHT);
    const seen = await readHeader(harness, cdp);
    if (seen.cluster.present && seen.cluster.belowBrand === true) {
      low = width;
      break;
    }
  }

  await cdp.setViewport(high, VIEWPORT_HEIGHT);
  const atHigh = await readHeader(harness, cdp);
  const sharesAtHigh = !!atHigh.cluster.present && atHigh.cluster.belowBrand === false;
  harness.check(
    rows,
    `${variant.id}.boundary.w${high}.sharesTheLine`,
    sharesAtHigh,
    `cluster=${JSON.stringify(atHigh.cluster.box)} brand=${JSON.stringify(atHigh.brand.box)}`,
  );
  if (!sharesAtHigh) {
    // NO BOUNDARY IN RANGE: this identity's own content is wider than the header, so the cluster keeps its own line
    // at every width the acceptance measures. Reported as the fact it is (the proportional clamp is asserted
    // beside it, at the same widths).
    const naturalAtLockupHeight = atHigh.logo
      ? Math.round((atHigh.logo.naturalWidth / atHigh.logo.naturalHeight) * atHigh.logo.box.height)
      : 0;
    harness.check(
      rows,
      `${variant.id}.boundary.w${high}.identityIsWiderThanTheHeaderItself`,
      !!atHigh.logo && atHigh.content.width < naturalAtLockupHeight,
      `content=${atHigh.content.width} naturalAtLockupHeight=${naturalAtLockupHeight}`,
    );
    return;
  }

  if (low === null) {
    // THIS IDENTITY NEVER NEEDS THE SECOND ROW: a compact mark plus its cluster is narrower than the content box
    // the template reaches at EVERY candidate width, so the row keeps one line throughout and the contract must
    // still hold there (no overlap). That is the fact asserted, with the content it was measured against.
    const narrowestWidth = BOUNDARY_CANDIDATES[BOUNDARY_CANDIDATES.length - 1];
    await cdp.setViewport(narrowestWidth, VIEWPORT_HEIGHT);
    const narrowest = await readHeader(harness, cdp);
    const needed =
      narrowest.brand.linkBox.width + narrowest.row.columnGap + narrowest.cluster.box.width;
    harness.check(
      rows,
      `${variant.id}.boundary.fitsOnOneLineAtEveryMeasurableWidth`,
      !!narrowest.cluster.present &&
        narrowest.cluster.belowBrand === false &&
        narrowest.overlaps === false &&
        narrowest.content.width >= needed - 1,
      `narrowest=w${narrowestWidth} contentBox=${narrowest.content.width} needed=${needed}`,
    );
    return;
  }

  const { boundary, below } = await fitBoundary(harness, cdp, low, high);
  await cdp.setViewport(boundary, VIEWPORT_HEIGHT);
  const fits = await readHeader(harness, cdp);
  await cdp.setViewport(below, VIEWPORT_HEIGHT);
  const wrapped = await readHeader(harness, cdp);

  harness.check(
    rows,
    `${variant.id}.boundary.w${boundary}.sharesTheLineWithoutOverlap`,
    fits.cluster.present && fits.cluster.belowBrand === false && fits.overlaps === false && Math.abs(fits.cluster.rightInset) <= 1,
    `cluster=${JSON.stringify(fits.cluster.box)} brand=${JSON.stringify(fits.brand.box)} rightInset=${fits.cluster.rightInset}`,
  );
  harness.check(
    rows,
    `${variant.id}.boundary.w${below}.clusterIsEntirelyBelow`,
    wrapped.cluster.present && wrapped.cluster.belowBrand === true && wrapped.overlaps === false && Math.abs(wrapped.cluster.rightInset) <= 1,
    `cluster=${JSON.stringify(wrapped.cluster.box)} brand=${JSON.stringify(wrapped.brand.box)} rightInset=${wrapped.cluster.rightInset}`,
  );
  harness.check(
    rows,
    `${variant.id}.boundary.isOnePixelWide`,
    boundary - below === 1,
    `below=${below} boundary=${boundary}`,
  );

  // RECONCILIATION, in the row's OWN currency: at the boundary the content box holds exactly the two occupants —
  // the brand's own width, the row's column gap and the cluster's width — and one pixel narrower it does not. The
  // viewport is NOT the unit here on purpose: the template caps the page width and the sidebar layout gives the
  // rail its own column, so "the width the row has" is the content box, and that is what the arrangement follows.
  const needed = fits.brand.linkBox.width + fits.row.columnGap + fits.cluster.box.width;
  harness.check(
    rows,
    `${variant.id}.boundary.atTheBoundaryTheContentBoxExactlyHoldsBoth`,
    Math.abs(fits.content.width - needed) <= BOUNDARY_TOLERANCE,
    `contentBox=${fits.content.width} needed=${needed} (brand=${fits.brand.linkBox.width} gap=${fits.row.columnGap} cluster=${fits.cluster.box.width})`,
  );
  harness.check(
    rows,
    `${variant.id}.boundary.onePixelBelowTheContentBoxDoesNot`,
    wrapped.content.width < needed + 1,
    `contentBox=${wrapped.content.width} needed=${needed}`,
  );
}

/**
 * THE SELECTOR STILL INTERACTS, in whichever arrangement the variant is in: a real selection IS applied by the
 * shell (the active presentation changes), it is reversible, and the page's own route does not move. The row's
 * layout must not cost the control any of its behaviour, its options or its semantics.
 */
async function proveInteraction(harness, rows, cdp, variant, pathname, width) {
  const tag = `${variant.id}.selector.w${width}`;
  await cdp.setViewport(width, VIEWPORT_HEIGHT);
  await new Promise((resolve) => setTimeout(resolve, RESIZE_SETTLE_MS));
  const before = await cdp.evaluate(SHELL_STATE);
  const options = await cdp.evaluate(
    `(() => { const control = document.querySelector('[data-ui-layout-switcher]'); return control ? { label: control.getAttribute('aria-label'), options: [...control.options].map((option) => option.textContent) } : null; })()`,
  );
  harness.check(
    rows,
    `${tag}.keepsItsLabelAndOptions`,
    !!options && typeof options.label === "string" && options.label.trim().length > 0 && options.options.length === 2,
    JSON.stringify(options),
  );
  const chosen = await cdp.evaluate(chooseLayout(OTHER_LAYOUT));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const after = await cdp.evaluate(SHELL_STATE);
  harness.check(
    rows,
    `${tag}.appliesTheChoice`,
    !!chosen && chosen.value === OTHER_LAYOUT && after.active === OTHER_LAYOUT,
    `chosen=${JSON.stringify(chosen)} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
  harness.check(
    rows,
    `${tag}.keepsThePage`,
    (await cdp.evaluate("location.pathname")) === pathname,
    `path=${await cdp.evaluate("location.pathname")}`,
  );
  const back = await cdp.evaluate(chooseLayout(DEFAULT_LAYOUT));
  await new Promise((resolve) => setTimeout(resolve, 300));
  const restored = await cdp.evaluate(SHELL_STATE);
  harness.check(
    rows,
    `${tag}.isReversible`,
    !!back && restored.active === DEFAULT_LAYOUT && restored.rail === before.rail,
    `restored=${JSON.stringify(restored)} before=${JSON.stringify(before)}`,
  );
}

/**
 * KEYBOARD REACHABILITY, at ONE viewport of the matrix (both ends are proved: the widest and the narrowest).
 *
 * REAL Tab keys are dispatched, so it is Chromium's KEYBOARD modality that moves the focus and its
 * `:focus-visible` heuristic that decides the ring: the brand link must be reachable from the top of the document,
 * the cluster's control must be the next row stop, and the focused control must PRESENT the one global focus ring.
 * That is what "still keyboard-accessible" means for a visitor who never touches a pointer — and it must stay true
 * whether the row is on one line or wrapped.
 */
async function proveKeyboard(harness, rows, cdp, variant, url, width) {
  const tag = `${variant.id}.keyboard.w${width}`;
  await cdp.setViewport(width, VIEWPORT_HEIGHT);
  await cdp.navigate(url);
  await readHeader(harness, cdp);
  const brand = await tabUntil(cdp, (active) => active.isBrandLink);
  harness.check(
    rows,
    `${tag}.brandLinkIsReachable`,
    !!brand && brand.isBrandLink === true,
    JSON.stringify(brand),
  );
  if (!variant.layoutSwitcher) {
    // NO TOP-RIGHT SELECTOR: the next stop is not a control in this row — nothing was invented to replace it.
    const next = await tabUntil(cdp, (active) => !active.isBrandLink, 1);
    harness.check(rows, `${tag}.rowHasNoSecondStop`, !!next && next.isLayoutControl === false, JSON.stringify(next));
    return;
  }
  const control = await tabUntil(cdp, (active) => active.isLayoutControl);
  harness.check(
    rows,
    `${tag}.selectorIsReachable`,
    !!control && control.isLayoutControl === true,
    JSON.stringify(control),
  );
  harness.check(
    rows,
    `${tag}.selectorShowsTheFocusRing`,
    !!control && control.focusVisible === true && control.outlineStyle !== "none" && control.outlineWidth !== "0px",
    JSON.stringify(control),
  );
}

/**
 * THE ACCEPTANCE RUN: every identity variant, at every named width, plus the clamp width, the bisected
 * content-fit boundary and the interaction/keyboard proofs — each variant against its OWN configuration on the
 * harness's own disposable installation, with the original configuration restored on every exit path.
 */
export async function run(chrome, harness) {
  const rows = [];
  const pathname = "/ww/en";
  const original = await readFile(harness.configFile, "utf8");

  try {
    /** The navigation surface(s) the shell presents, per variant and width, for the identity-independence proof. */
    const navigationByWidth = new Map();
    for (const variant of VARIANTS) {
      await harness.writeFile(harness.configFile, configurationFor(original, variant), "utf8");
      const { server, port } = await startServer(harness, harness.basePort, pathname);
      const url = `http://localhost:${port}${pathname}`;
      let cdp = null;
      try {
        cdp = await Cdp.connect(chrome);
        await cdp.setViewport(WIDTHS[0], VIEWPORT_HEIGHT);
        await cdp.navigate(url);
        const opened = await readHeader(harness, cdp);
        harness.check(
          rows,
          `${variant.id}.rendersTheHeader`,
          !!opened.row.present && opened.brand.present,
          `row=${JSON.stringify(opened.row)} brand=${JSON.stringify(opened.brand.box)}`,
        );
        harness.check(
          rows,
          `${variant.id}.identityIsTheConfiguredKind`,
          variant.logo === null ? opened.logo === null : !!opened.logo,
          `${variant.label}: logo=${JSON.stringify(opened.logo)}`,
        );

        // ── THE NINE VIEWPORT CATEGORIES, AT THEIR EXACT WIDTHS (the requested width is asserted) ────
        const arrangements = new Map();
        const frameByWidth = new Map();
        // FOUNDATION-UI-R1F — WHAT THE BROWSER SELECTED AT EVERY WIDTH, kept for the across-width art-direction
        // proof (which artwork, how large the file really is, and whether it finished loading).
        const selectionByWidth = new Map();
        for (const { width, category } of VIEWPORTS) {
          let seen = await readHeaderAt(cdp, width);
          // A compact-configured variant is judged only once the browser has ANSWERED for this width: a viewport
          // change is asynchronous, so reading the previous selection would prove nothing about the rule.
          const entitledArtwork = expectedArtworkAt(variant, width);
          if (entitledArtwork !== null) seen = await waitForSelection(cdp, entitledArtwork, 2500);
          arrangements.set(width, arrangementOf(seen));
          navigationByWidth.set(`${variant.id}|${width}`, seen.navigation.surfaces);
          frameByWidth.set(width, seen.frameWidth);
          selectionByWidth.set(width, {
            currentSrc: seen.logo ? seen.logo.currentSrc : null,
            naturalWidth: seen.logo ? seen.logo.naturalWidth : 0,
            naturalHeight: seen.logo ? seen.logo.naturalHeight : 0,
            complete: seen.logo ? seen.logo.complete === true : false,
          });
          assertRow(harness, rows, `${variant.id}.${category}.w${width}`, seen, variant);
          assertArtDirection(harness, rows, `${variant.id}.${category}.w${width}`, seen, variant);
          harness.check(
            rows,
            `${variant.id}.${category}.w${width}.viewport.applied`,
            seen.viewportWidth === width,
            `requested=${width} innerWidth=${seen.viewportWidth}`,
          );
        }
        for (const { category, widths } of VIEWPORT_BANDS) {
          console.log(
            `[header-identity] ${variant.id}.${category}: ${widths.map((width) => `w${width}=${arrangements.get(width)}`).join(" ")}`,
          );
          harness.check(
            rows,
            `${variant.id}.${category}.measuredEveryNamedWidth`,
            widths.every((width) => arrangements.has(width)),
            `widths=${widths.join(",")}`,
          );
        }

        // ── THE CATEGORY BOUNDARIES AND THE SHELL'S OWN NAVIGATION BOUNDARIES ───────────────────────
        proveTransitions(harness, rows, variant.id, arrangements);
        proveFrameConsistencyAcrossBoundaries(harness, rows, variant.id, frameByWidth);
        // ── FOUNDATION-UI-R1F — THE ART DIRECTION, ACROSS EVERY WIDTH AND ACROSS THE BOUNDARY ITSELF ────
        // Which artwork the browser chose on each side of 600px, that a DIFFERENT file was really fetched, and
        // that resizing back and forth (without reloading) keeps answering correctly.
        proveArtDirectionAcrossWidths(harness, rows, variant.id, selectionByWidth, variant);
        await proveSelectionRoundTrip(harness, rows, variant.id, cdp, variant);
        await proveNavigationBoundaries(harness, rows, cdp, variant.id);
        await proveBelowFloorFallback(harness, rows, cdp, variant.id);

        // ── REPRESENTATIVE SHORT AND TALL HEIGHTS ───────────────────────────────────────────────────
        for (const [width, height] of HEIGHT_CASES) {
          const seen = await readHeaderAt(cdp, width, height);
          assertRow(harness, rows, `${variant.id}.height.w${width}x${height}`, seen, variant);
          harness.check(
            rows,
            `${variant.id}.height.w${width}x${height}.viewport.applied`,
            seen.viewportWidth === width,
            `requested=${width} innerWidth=${seen.viewportWidth}`,
          );
        }

        // ── THE ACTUAL CONTENT-FIT BOUNDARY, AND THE SELECTOR AT BOTH ENDS OF THE MATRIX ────────────
        const widest = await readHeaderAt(cdp, WIDTHS[WIDTHS.length - 1]);
        await proveBoundary(harness, rows, cdp, variant, widest, WIDTHS[WIDTHS.length - 1]);
        if (variant.layoutSwitcher) {
          await proveInteraction(harness, rows, cdp, variant, pathname, WIDTHS[WIDTHS.length - 1]);
          await proveInteraction(harness, rows, cdp, variant, pathname, WIDTHS[0]);
        }
        await proveKeyboard(harness, rows, cdp, variant, url, WIDTHS[WIDTHS.length - 1]);
        await proveKeyboard(harness, rows, cdp, variant, url, WIDTHS[0]);
      } finally {
        if (cdp !== null) await cdp.close();
        await harness.stopServer(server);
      }
    }

    // ── UI-R1C — THE HEADER IDENTITY CANNOT CHANGE THE NAVIGATION PRESENTATION ────────────────────
    // `textFallback` and `compactGraphic` carry the SAME configuration and differ ONLY in the header identity
    // (a text brand versus a configured graphic), so whatever navigation surface the shell presents at a width
    // must be the same surface for both: the corrected row may not add, remove or displace a navigation landmark
    // at ANY of the twenty-seven widths — which is what "navigation retains its existing responsive behaviour"
    // means for the surface this change touches.
    for (const { width, category } of VIEWPORTS) {
      const text = navigationByWidth.get(`textFallback|${width}`);
      const graphic = navigationByWidth.get(`compactGraphic|${width}`);
      harness.check(
        rows,
        `navigation.identityDoesNotChangePresentation.${category}.w${width}`,
        !!text && !!graphic && text.join(",") === graphic.join(","),
        `text=${JSON.stringify(text)} graphic=${JSON.stringify(graphic)}`,
      );
    }

    // ── THE HUB ENVIRONMENT: the lockup and the exceptionally wide lockup, where they can be served ──
    await runHubIdentityPhase(harness, rows, chrome);
  } catch (error) {
    harness.check(
      rows,
      "header-identity.scenario.error",
      false,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await harness.writeFile(harness.configFile, original, "utf8");
  }

  return rows;
}

export default { id, run };

/* ── THE SECOND ENVIRONMENT: A TEST-OWNED HUB, WHERE WIDE ARTWORK CAN ACTUALLY BE SERVED ────────────────
 *
 * A Spoke-namespaced asset is served only for the Spokes an Installation DECLARES (M3: runtime asset namespaces
 * are per-Spoke, and the platform namespace is shared), so a generic single-Spoke run cannot serve artwork from
 * `public/spokes/**` at all. The artwork classes the generic environment cannot express are therefore measured on a
 * TEST-OWNED Hub — the four-Spoke fixture the Spoke switcher is already proved with:
 *
 *   · a CONVENTIONAL HORIZONTAL LOCKUP (the shape a configured lockup really has),
 *   · a HEADER BAND several times the header's own display maximum, where the WIDTH cap alone binds, and
 *   · an EXCEPTIONALLY WIDE 64:1 lockup (wider than the header's own content box at EVERY measured width),
 *
 * and the same members give the cluster both of its conditions: the Spoke switcher ALONE (`primary`, `support`), the
 * Spoke switcher AND the Layout selector (`docs`), and the text fallback with the switcher alone (`catalog`).
 *
 * FOUNDATION-UI-R1E — WHAT CHANGED FOR THE WIDE ARTWORK. The header mark is bounded by a maximum INLINE size as well
 * as by the shared display size (`--ui-site-header-logo-max-inline-size`, 280px by default), so exceptionally wide
 * artwork is no longer rendered at the header's whole content width: it is capped, the cluster therefore shares the
 * line wherever the permitted widths fit, and the mark is never squeezed to keep it there.
 *
 * The artwork is AUTHORED HERE, for this scenario's own members, and installed into the generated namespace each
 * member owns under OWNERSHIP: a namespace or file that already exists belongs to another execution or another
 * Installation and is REFUSED rather than overwritten, and only what this scenario created is removed. The
 * members' own configurations are patched in the DISPOSABLE installation tree (OS temp) so each points at its own
 * artwork; nothing authored in the repository is touched.
 */
const LOCKUP_ROLE = "ui-r1-lockup.svg";
const WIDE_LOCKUP_ROLE = "ui-r1-wide-lockup.svg";
const HEADER_BAND_ROLE = "ui-r1-header-band.svg";
/**
 * FOUNDATION-UI-R1F — THE COMPACT ALTERNATIVE, authored per member. Each member gives it a DIFFERENT intrinsic
 * size (96, 72 and 48 pixels square), so the artwork that loaded identifies WHICH Spoke served it as well as the
 * URL does — the strongest form of the cross-Spoke isolation proof.
 */
const COMPACT_ROLE = "ui-r1f-compact.svg";


const HUB_IDENTITIES = [
  {
    id: "hubSpokeAlone",
    spokeId: "primary",
    role: LOCKUP_ROLE,
    // 480x128 — 3.75:1, a conventional horizontal lockup: 120px wide at the shared display size, and its NATURAL
    // width (480) is already wider than the header's display maximum, so the HEIGHT cap is the binding limit here.
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="128" viewBox="0 0 480 128" role="presentation"><rect x="0" y="52" width="480" height="24" rx="12" fill="#0f172a"/></svg>\n',
    widerThanTheDisplayMaximum: true,
    compactRole: COMPACT_ROLE,
    // 96x96 — a compact SQUARE reading of the same brand: at the shared display size it is a 32px mark, and it is
    // what a visitor below 600px sees INSTEAD of the 480x128 lockup.
    compactSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96" role="presentation"><rect x="8" y="8" width="80" height="80" rx="16" fill="#0f172a"/></svg>\n',
    label: "a conventional horizontal lockup beside the Spoke switcher alone",
  },
  {
    id: "hubHeaderBandLockup",
    spokeId: "support",
    role: HEADER_BAND_ROLE,
    // 1024x64 — 16:1: a header band several times the display maximum. At the maximum width its height (17.5px) is
    // still well inside the shared display size, so the WIDTH cap ALONE decides its rendered size.
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="64" viewBox="0 0 1024 64" role="presentation"><rect x="0" y="24" width="1024" height="16" fill="#1d4ed8"/></svg>\n',
    widerThanTheDisplayMaximum: true,
    compactRole: COMPACT_ROLE,
    // 72x72 — this member's own compact mark (a DIFFERENT file from any other member's: the namespace is per
    // Spoke, and the size proves which one was fetched).
    compactSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72" role="presentation"><circle cx="36" cy="36" r="30" fill="#1d4ed8"/></svg>\n',
    label: "a header band wider than the display maximum, beside the Spoke switcher alone",
  },
  {
    id: "hubLongLockup",
    spokeId: "docs",
    role: WIDE_LOCKUP_ROLE,
    // 2048x32 — 64:1: wider than the header's own content box at every measured width, so the display maximum is the
    // binding constraint everywhere rather than an accident of one narrow viewport.
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="32" viewBox="0 0 2048 32" role="presentation"><rect x="0" y="12" width="2048" height="8" fill="#0f172a"/></svg>\n',
    widerThanTheDisplayMaximum: true,
    compactRole: COMPACT_ROLE,
    // 48x48 — the third distinct compact mark, in the namespace of the member that ALSO carries the Layout
    // selector, so both cluster conditions are exercised with a Spoke-scoped compact alternative.
    compactSvg: '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" role="presentation"><rect x="4" y="4" width="40" height="40" rx="8" fill="#0f172a"/></svg>\n',
    label: "an exceptionally wide 64:1 lockup beside the Spoke switcher AND the Layout selector",
  },
  {
    id: "hubTextFallback",
    spokeId: "catalog",
    role: null,
    svg: null,
    label: "the text-brand fallback on a member that carries the Spoke switcher",
  },
];

/** One member's identity, as that member's OWN configuration declares it: its logo lives in ITS namespace. */
function identityLogoUrl(hostname, spokeId, role) {
  return `https://${hostname}/spokes/${spokeId}/assets/${role}`;
}

/** The hostname a fixture member answers for. */
function hostnameOf(installation, spokeId) {
  const spoke = installation.spokes.find((entry) => entry.id === spokeId);
  if (spoke === undefined) throw new Error(`the fixture declares no Spoke "${spokeId}"`);
  return spoke.hostname;
}

/**
 * Install ONE member's authored artwork into the generated namespace it owns.
 *
 * A namespace that already exists is a COLLISION: it belongs to another execution (or another Installation), so
 * this proof refuses to adopt, overwrite or delete it — the same ownership rule the multi-Spoke runtime proofs
 * follow for generated output.
 */
async function installArtwork(harness, owned, member) {
  const namespace = path.join(harness.repositoryRoot, "public", "spokes", member.spokeId);
  if (existsSync(namespace)) {
    throw new Error(
      `the generated namespace "${namespace}" already exists, so it belongs to another execution or another ` +
        "Installation. This proof never overwrites or deletes generated output it did not create — remove that " +
        "output (or the process holding it) and run again.",
    );
  }
  const assets = path.join(namespace, "assets");
  await harness.mkdir(assets, { recursive: true });
  // CLAIMED only once the namespace is this scenario's: cleanup owns exactly this path, ROOT INCLUDED, so no empty
  // namespace is left behind for the deployment's own asset mirror to report as undeclared.
  owned.push(namespace);
  await harness.writeFile(path.join(assets, member.role), member.svg, "utf8");
  // FOUNDATION-UI-R1F — the member's COMPACT alternative, authored into the SAME (its own) Spoke namespace, so
  // the 600px boundary is proved with SPOKE-SCOPED artwork rather than a shared platform file.
  if (member.compactSvg && member.compactRole) {
    await harness.writeFile(path.join(assets, member.compactRole), member.compactSvg, "utf8");
  }
}

/** Point a member's OWN configuration (in the DISPOSABLE installation tree) at its own artwork. */
async function configureMemberIdentity(harness, installationRoot, spokeId, logoUrl, compactUrl) {
  const file = path.join(installationRoot, "spokes", spokeId, "site.config.json");
  const config = JSON.parse(await readFile(file, "utf8"));
  config.site = { ...config.site, assets: { ...(config.site?.assets ?? {}), logo: logoUrl } };
  // FOUNDATION-UI-R1F — the OPTIONAL compact alternative, configured only for a member that authors one; every
  // other member keeps the primary-only configuration (the unchanged case, proved beside it).
  if (compactUrl) config.site.assets.logoCompact = compactUrl;
  else delete config.site.assets.logoCompact;
  await harness.writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * THE HUB ENVIRONMENT: the lockup and the exceptionally wide lockup, plus the text fallback, measured on a
 * test-owned four-Spoke Installation whose members the generated namespaces belong to.
 *
 * The whole phase is one ownership scope: the installation tree (OS temp), the artwork namespaces it materialises
 * and the dev server it starts are all removed in `finally`, whatever the outcome.
 */
async function runHubIdentityPhase(harness, rows, chrome) {
  const installation = materializeFourSpokeInstallation(harness.repositoryRoot);
  const owned = [];
  let server = null;
  let cdp = null;
  try {
    const members = HUB_IDENTITIES.map((identity) => ({
      ...identity,
      hostname: hostnameOf(installation, identity.spokeId),
    }));
    for (const member of members) {
      if (member.role === null) continue;
      await installArtwork(harness, owned, member);
      // FOUNDATION-UI-R1F — BOTH identities the member authors, resolved through the member's OWN origin and
      // namespace: the compact alternative is served from the Spoke that owns it, never from another's.
      member.identityUrls = {
        logo: identityLogoUrl(member.hostname, member.spokeId, member.role),
        logoCompact: member.compactRole
          ? identityLogoUrl(member.hostname, member.spokeId, member.compactRole)
          : null,
      };
      await configureMemberIdentity(
        harness,
        installation.root,
        member.spokeId,
        member.identityUrls.logo,
        member.identityUrls.logoCompact,
      );
    }

    const started = await startServer(harness, harness.basePort, "/ww/en", {
      deploymentRoot: installation.root,
      host: members[0].hostname,
    });
    server = started.server;
    cdp = await Cdp.connect(chrome, {
      hostResolverRules: installation.spokes
        .map((spoke) => `MAP ${spoke.hostname} 127.0.0.1`)
        .join(", "),
    });

    for (const member of members) {
      const url = `http://${member.hostname}:${started.port}/ww/en`;
      await cdp.setViewport(WIDTHS[0], VIEWPORT_HEIGHT);
      await cdp.navigate(url);
      const opened = await readHeader(harness, cdp);
      harness.check(
        rows,
        `${member.id}.rendersTheHeader`,
        !!opened.row.present && opened.brand.present,
        `${member.label}: row=${JSON.stringify(opened.row)} brand=${JSON.stringify(opened.brand.box)}`,
      );
      // The cluster this member carries: the Hub switcher is Installation-wide, and `docs` ALSO enables the
      // Layout selector — the two conditions the acceptance names.
      harness.check(
        rows,
        `${member.id}.carriesTheSpokeSwitcher`,
        opened.cluster.present === true && opened.cluster.controls.length > 0,
        `controls=${JSON.stringify(opened.cluster.controls)}`,
      );
      harness.check(
        rows,
        `${member.id}.${member.spokeId === "docs" ? "alsoCarriesTheLayoutSelector" : "carriesNoLayoutSelector"}`,
        member.spokeId === "docs"
          ? opened.layoutControl !== null
          : opened.layoutControl === null,
        `layoutControl=${JSON.stringify(opened.layoutControl)}`,
      );

      const arrangements = new Map();
      const frameByWidth = new Map();
      // FOUNDATION-UI-R1F — the same per-width selection evidence for a Spoke-owned compact alternative.
      const selectionByWidth = new Map();
      const memberVariant = {
        id: member.id,
        logo: member.role,
        logoCompact: member.identityUrls?.logoCompact ?? null,
      };
      for (const { width, category } of VIEWPORTS) {
        let seen = await readHeaderAt(cdp, width);
        // The same bounded wait for the browser's own answer, for a member that authors a compact alternative.
        const entitledArtwork = expectedArtworkAt(memberVariant, width);
        if (entitledArtwork !== null) seen = await waitForSelection(cdp, entitledArtwork, 2500);
        arrangements.set(width, arrangementOf(seen));
        frameByWidth.set(width, seen.frameWidth);
        selectionByWidth.set(width, {
          currentSrc: seen.logo ? seen.logo.currentSrc : null,
          naturalWidth: seen.logo ? seen.logo.naturalWidth : 0,
          naturalHeight: seen.logo ? seen.logo.naturalHeight : 0,
          complete: seen.logo ? seen.logo.complete === true : false,
        });
        assertRow(harness, rows, `${member.id}.${category}.w${width}`, seen, memberVariant);
        assertArtDirection(harness, rows, `${member.id}.${category}.w${width}`, seen, memberVariant);
        // FOUNDATION-UI-R1F — SPOKE SCOPING, measured: when the compact artwork is the selection, it must be
        // served from THIS member's own namespace (`/spokes/<segment>/assets/**`) — never from another Spoke's,
        // and never from the shared platform tree. Each member authors a DIFFERENT-sized compact mark, so the
        // intrinsic size of what loaded identifies the file as well as the URL does.
        if (memberVariant.logoCompact && seen.logo && seen.logo.currentSrc) {
          const selectedTheCompactArtwork =
            basenameOf(seen.logo.currentSrc) === basenameOf(memberVariant.logoCompact);
          harness.check(
            rows,
            `${member.id}.${category}.w${width}.selection.servedFromTheMembersOwnNamespace`,
            !selectedTheCompactArtwork || seen.logo.currentSrc.includes(`/spokes/${member.spokeId}/assets/`),
            `currentSrc=${seen.logo.currentSrc} spoke=${member.spokeId}`,
          );
        }
        harness.check(
          rows,
          `${member.id}.${category}.w${width}.viewport.applied`,
          seen.viewportWidth === width,
          `requested=${width} innerWidth=${seen.viewportWidth}`,
        );
        // ── FOUNDATION-UI-R1E — THE DISPLAY MAXIMUM, WHEREVER THE ARTWORK IS WIDER THAN IT ────────────────
        // The case is what it claims to be (the artwork's NATURAL width exceeds the header's display maximum), and
        // where the controls share the mark's line the mark no longer occupies the header's WHOLE content width:
        // that is the owner's corrected expectation for exceptionally wide artwork, and it is exactly what lets the
        // cluster sit beside it instead of being pushed below on a wide desktop. The rendered size itself is asserted
        // by `assertRow` (never wider than the permitted maximum, never enlarged, never distorted) and the arrangement
        // by the fit rule, so nothing is restated here.
        if (member.widerThanTheDisplayMaximum !== true) continue;
        // FOUNDATION-UI-R1F — the claim is about the member's PRIMARY artwork, so it is made where that artwork is
        // the SELECTION: below the compact boundary the member's own compact mark is on screen, and a compact mark
        // is small by definition (its own limits are asserted by `assertRow`, exactly like the primary's).
        const selectedThePrimaryArtwork =
          !member.identityUrls?.logoCompact ||
          basenameOf(seen.logo && seen.logo.currentSrc) !== basenameOf(member.identityUrls.logoCompact);
        harness.check(
          rows,
          `${member.id}.${category}.w${width}.displayMaximum.theArtworkIsWiderThanTheDisplayMaximum`,
          !selectedThePrimaryArtwork || (!!seen.logo && seen.logo.naturalWidth > seen.logoLimits.inline),
          `natural=${seen.logo && seen.logo.naturalWidth} maximum=${seen.logoLimits.inline} selectedThePrimaryArtwork=${selectedThePrimaryArtwork}`,
        );
        harness.check(
          rows,
          `${member.id}.${category}.w${width}.displayMaximum.doesNotOccupyTheWholeHeaderWhereTheControlsShare`,
          !selectedThePrimaryArtwork ||
            (!!seen.logo &&
              (arrangementOf(seen) !== "one-line" || seen.logo.size.width <= seen.content.width - 1)),
          `width=${seen.logo && seen.logo.size.width} content=${seen.content.width} arrangement=${arrangementOf(seen)}`,
        );
      }
      for (const { category, widths } of VIEWPORT_BANDS) {
        console.log(
          `[header-identity] ${member.id}.${category}: ${widths.map((width) => `w${width}=${arrangements.get(width)}`).join(" ")}`,
        );
        harness.check(
          rows,
          `${member.id}.${category}.measuredEveryNamedWidth`,
          widths.every((width) => arrangements.has(width)),
          `widths=${widths.join(",")}`,
        );
      }
      proveTransitions(harness, rows, member.id, arrangements);
      proveFrameConsistencyAcrossBoundaries(harness, rows, member.id, frameByWidth);
      // FOUNDATION-UI-R1F — the Spoke-scoped half of the art-direction proof: at 599px the member's OWN compact
      // artwork is on screen (served from ITS namespace), at 600px its primary artwork, in both sizes of the
      // member's artwork, without a reload.
      proveArtDirectionAcrossWidths(harness, rows, member.id, selectionByWidth, memberVariant);
      await proveSelectionRoundTrip(harness, rows, member.id, cdp, memberVariant);
      await proveNavigationBoundaries(harness, rows, cdp, member.id);
      await proveBelowFloorFallback(harness, rows, cdp, member.id);
      for (const [width, height] of HEIGHT_CASES) {
        const seen = await readHeaderAt(cdp, width, height);
        assertRow(harness, rows, `${member.id}.height.w${width}x${height}`, seen, { id: member.id, logo: member.role });
        harness.check(
          rows,
          `${member.id}.height.w${width}x${height}.viewport.applied`,
          seen.viewportWidth === width,
          `requested=${width} innerWidth=${seen.viewportWidth}`,
        );
      }
    }
  } finally {
    if (cdp !== null) await cdp.close();
    if (server !== null) await harness.stopServer(server);
    for (const directory of owned) harness.rmSync(directory, { recursive: true, force: true });
    harness.rmSync(installation.root, { recursive: true, force: true });
  }
}








/**
 * FOUNDATION-UI-R1F — WHICH ARTWORK THE BROWSER SELECTED, PROVED ACROSS EVERY MEASURED WIDTH.
 *
 * The browser's own answer (`img.currentSrc`) is compared with the side of the boundary the width is on, so the
 * selection rule is judged by the BROWSER rather than by the markup that expresses it — and the intrinsic size of
 * what LOADED is compared across the boundary too, because a different URL could otherwise be a rewrite to the
 * same file. Every measured width must also have completed loading its artwork: an unloaded or missing image is a
 * broken identity, whatever its URL says.
 */
function proveArtDirectionAcrossWidths(harness, rows, tag, selectionByWidth, variant) {
  const compact = variant.logoCompact ?? null;
  const primary = variant.logo ?? null;
  if (primary === null || compact === null) return;
  const compactName = basenameOf(compact);
  const primaryName = basenameOf(primary);
  const widths = [...selectionByWidth.keys()].sort((left, right) => left - right);
  const below = widths.filter((width) => width < 600);
  const atOrAbove = widths.filter((width) => width >= 600);
  const selected = (width) => basenameOf(selectionByWidth.get(width)?.currentSrc);
  const lastBelow = below[below.length - 1];
  const firstAtOrAbove = atOrAbove[0];

  harness.check(
    rows,
    `${tag}.selection.everyWidthBelowTheBoundarySelectedTheCompactArtwork`,
    below.length > 0 && below.every((width) => selected(width) === compactName),
    below.map((width) => `${width}:${selected(width)}`).join(" "),
  );
  harness.check(
    rows,
    `${tag}.selection.everyWidthAtOrAboveTheBoundarySelectedThePrimaryArtwork`,
    atOrAbove.length > 0 && atOrAbove.every((width) => selected(width) === primaryName),
    atOrAbove.map((width) => `${width}:${selected(width)}`).join(" "),
  );
  // THE PAIR THE OWNER NAMED, said explicitly rather than left implied by the two sides above.
  harness.check(
    rows,
    `${tag}.selection.at599PixelsTheCompactArtwork`,
    selectionByWidth.has(599) && selected(599) === compactName,
    `599=${selected(599)} expected=${compactName}`,
  );
  harness.check(
    rows,
    `${tag}.selection.at600PixelsThePrimaryArtwork`,
    selectionByWidth.has(600) && selected(600) === primaryName,
    `600=${selected(600)} expected=${primaryName}`,
  );
  harness.check(
    rows,
    `${tag}.selection.theTwoSidesDiffer`,
    lastBelow !== undefined && firstAtOrAbove !== undefined && selected(lastBelow) !== selected(firstAtOrAbove),
    `${lastBelow}=${selected(lastBelow)} ${firstAtOrAbove}=${selected(firstAtOrAbove)}`,
  );
  const intrinsic = (width) => {
    const entry = selectionByWidth.get(width);
    return `${entry?.naturalWidth}x${entry?.naturalHeight}`;
  };
  harness.check(
    rows,
    `${tag}.selection.aDifferentFileWasFetchedOnEachSideOfTheBoundary`,
    lastBelow !== undefined && firstAtOrAbove !== undefined && intrinsic(lastBelow) !== intrinsic(firstAtOrAbove),
    `${lastBelow}=${intrinsic(lastBelow)} ${firstAtOrAbove}=${intrinsic(firstAtOrAbove)}`,
  );
  const unloaded = widths.filter((width) => selectionByWidth.get(width)?.complete !== true);
  harness.check(
    rows,
    `${tag}.selection.everySelectedArtworkCompletedLoading`,
    unloaded.length === 0,
    `unloaded=${unloaded.join(",")}`,
  );
  harness.check(
    rows,
    `${tag}.selection.everyNamedWidthWasMeasured`,
    widths.length === WIDTHS.length,
    `measured=${widths.length} named=${WIDTHS.length}`,
  );
}

/**
 * FOUNDATION-UI-R1F — RESIZING ACROSS THE BOUNDARY IN BOTH DIRECTIONS, WITHOUT RELOADING THE PAGE.
 *
 * The page is navigated to ONCE and then only RESIZED: 600 → 599 → 600 → 599. A selection that depended on
 * client-side state, a hydration pass or a resize listener would answer the first width and then keep its answer;
 * a native media query must answer all four. Each step also waits for the newly selected artwork to LOAD, so the
 * proof is that the browser fetched and decoded the OTHER file — not merely that a URL attribute changed.
 */
async function proveSelectionRoundTrip(harness, rows, tag, cdp, variant) {
  if (!variant.logo || !variant.logoCompact) return;
  const walk = [600, 599, 600, 599];
  const expected = walk.map((width) =>
    width < 600 ? basenameOf(variant.logoCompact) : basenameOf(variant.logo),
  );
  const answers = [];
  for (const [index, width] of walk.entries()) {
    await cdp.setViewport(width, 900);
    const settled = await waitForSelection(cdp, expected[index], 4000);
    // …and then let the newly selected artwork finish loading, so the proof is that the browser FETCHED it.
    const loaded = await waitForSelectedArtwork(cdp, 2000);
    answers.push({
      width,
      name: basenameOf(settled.logo && settled.logo.currentSrc),
      loaded: !!loaded.logo && loaded.logo.complete === true && loaded.logo.naturalWidth > 0,
    });
  }
  harness.check(
    rows,
    `${tag}.selection.theAnswerFollowsEveryResizeWithoutReloading`,
    answers.every((answer, index) => answer.name === expected[index]),
    answers.map((answer, index) => `${answer.width}=${answer.name} (expected ${expected[index]})`).join(" "),
  );
  harness.check(
    rows,
    `${tag}.selection.everyResizeLoadedItsArtwork`,
    answers.every((answer) => answer.loaded),
    JSON.stringify(answers),
  );
}

/**
 * THE FIT RULE (FOUNDATION-UI-R1E): the CLUSTER moves, the MARK is never squeezed to keep a shared row.
 *
 * Both directions are decided by the widths the row must find room for — the brand's PERMITTED width (the width the
 * mark is entitled to render at, computed from the page's own limits) and the cluster's MAX-CONTENT width — never by
 * the widths they happened to end up with. Where those two fit together they share the line; where they cannot
 * coexist, the cluster is ENTIRELY below the brand. A ±1px band is deliberately ambiguous: at an exact boundary a
 * browser may resolve either way, and a pass must never depend on which way it went.
 *
 * A graphic identity is the case this ruling is about, so only it is asserted here: the TEXT fallback may break
 * inside itself, and its own wrapping contract is proved by the boundary bisection and the transitions.
 */
function proveFitRule(harness, rows, tag, seen, variant) {
  if (variant.logo === null || !seen.logo || !seen.cluster.present || seen.cluster.maxContentWidth === null) return;
  const { naturalWidth, naturalHeight } = seen.logo;
  if (!(naturalWidth > 0 && naturalHeight > 0)) return;
  const scale = Math.min(1, seen.logoLimits.inline / naturalWidth, seen.logoLimits.block / naturalHeight);
  // The brand carries at least the mark's permitted width; its LINK also owns the >= 44px hit-area contract, so the
  // MEASURED link is the floor of the brand's permitted width (a restated 44 here would be a second authority).
  const permittedBrand = Math.max(seen.brand.linkBox ? seen.brand.linkBox.width : 0, naturalWidth * scale);
  const room = permittedBrand + (seen.row.columnGap ?? 0) + seen.cluster.maxContentWidth;
  const fits = room <= seen.content.width + 1;
  const cannotCoexist = room > seen.content.width - 1;
  const arrangement = arrangementOf(seen);
  harness.check(
    rows,
    `${tag}.fit.theClusterSharesTheLineOnlyWhenThePermittedWidthsFit`,
    (fits && cannotCoexist) || (fits ? arrangement === "one-line" : arrangement === "cluster-below"),
    `room=${Math.round(room)} content=${seen.content.width} arrangement=${arrangement} brand=${Math.round(permittedBrand)} cluster=${seen.cluster.maxContentWidth} gap=${seen.row.columnGap}`,
  );
}

/**
 * THE MARK'S DISPLAY CONTRACT (FOUNDATION-UI-R1E) — or, for the text fallback, that there is no graphic at all.
 *
 * The ruling is expressed in the row's OWN currency, with every limit read from the page: the permitted maximum
 * inline size is the SMALLER of the header's own token and the width available to the mark, and the permitted
 * maximum block size is the shared display token. An image whose intrinsic size is already smaller than both limits
 * renders at its own size — never enlarged to fill the permitted area — and both limits are asserted against the
 * RENDERED rectangle, as is the intrinsic ratio (a stretched or cropped mark fails the ratio and the expected-size
 * comparison even where a width-only assertion would pass). Nothing here is restated from the stylesheet.
 */
function assertLogo(harness, rows, tag, seen, variant) {
  if (variant.logo === null) {
    harness.check(
      rows,
      `${tag}.identity.isTheTextFallback`,
      seen.logo === null && seen.brand.text.length > 0,
      `logo=${JSON.stringify(seen.logo)} text="${seen.brand.text}"`,
    );
    return;
  }
  const logo = seen.logo;
  const loaded = !!logo && logo.complete === true && logo.naturalWidth > 0 && logo.naturalHeight > 0;
  harness.check(rows, `${tag}.logo.loaded`, loaded, JSON.stringify(logo));
  if (!loaded) return;

  const permittedWidth = Math.min(seen.logoLimits.inline, seen.content.width);
  const permittedHeight = seen.logoLimits.block;
  const scale = Math.min(1, permittedWidth / logo.naturalWidth, permittedHeight / logo.naturalHeight);
  const expectedWidth = logo.naturalWidth * scale;
  const expectedHeight = logo.naturalHeight * scale;
  const renderedRatio = logo.size.height > 0 ? logo.size.width / logo.size.height : 0;
  const naturalRatio = logo.naturalWidth / logo.naturalHeight;

  harness.check(
    rows,
    `${tag}.logo.widthNeverExceedsItsPermittedMaximum`,
    logo.size.width <= permittedWidth + 1,
    `width=${logo.size.width} permitted=${permittedWidth} (token=${seen.logoLimits.inline} content=${seen.content.width})`,
  );
  harness.check(
    rows,
    `${tag}.logo.heightNeverExceedsTheAcceptedLimit`,
    logo.size.height <= permittedHeight + 1,
    `height=${logo.size.height} permitted=${permittedHeight}`,
  );
  harness.check(
    rows,
    `${tag}.logo.neverEnlargedBeyondItsNaturalSize`,
    logo.size.width <= logo.naturalWidth + 1 && logo.size.height <= logo.naturalHeight + 1,
    `rendered=${logo.size.width}x${logo.size.height} natural=${logo.naturalWidth}x${logo.naturalHeight}`,
  );
  harness.check(
    rows,
    `${tag}.logo.scaledToFitNeverCroppedOrStretched`,
    Math.abs(logo.size.width - expectedWidth) <= 1.5 && Math.abs(logo.size.height - expectedHeight) <= 1.5,
    `rendered=${logo.size.width}x${logo.size.height} expected=${Math.round(expectedWidth * 100) / 100}x${Math.round(expectedHeight * 100) / 100} scale=${scale.toFixed(4)}`,
  );
  harness.check(
    rows,
    `${tag}.logo.preservesItsIntrinsicAspectRatio`,
    renderedRatio > 0 && Math.abs(renderedRatio - naturalRatio) <= Math.max(0.02 * naturalRatio, 0.05),
    `rendered=${renderedRatio.toFixed(3)} natural=${naturalRatio.toFixed(3)}`,
  );
  harness.check(
    rows,
    `${tag}.logo.rendersContainRatherThanCrop`,
    logo.objectFit === "contain",
    `object-fit=${logo.objectFit}`,
  );
  harness.check(
    rows,
    `${tag}.logo.insideTheContentBox`,
    logo.box.left >= seen.content.left - 1 && logo.box.right <= seen.content.right + 1,
    JSON.stringify(logo.box),
  );
}
