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
          objectFit: getComputedStyle(logo).objectFit,
        }
      : null,
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
    documentScrollWidth: document.documentElement.scrollWidth,
    documentClientWidth: document.documentElement.clientWidth,
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
  config.site = { ...config.site, assets };
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** The arrangement a measurement shows: the cluster on the brand's line, or the cluster entirely below it. */
function arrangementOf(seen) {
  return seen.cluster.present && seen.cluster.belowBrand ? "cluster-below" : "one-line";
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
        for (const { width, category } of VIEWPORTS) {
          const seen = await readHeaderAt(cdp, width);
          arrangements.set(width, arrangementOf(seen));
          navigationByWidth.set(`${variant.id}|${width}`, seen.navigation.surfaces);
          frameByWidth.set(width, seen.frameWidth);
          assertRow(harness, rows, `${variant.id}.${category}.w${width}`, seen, variant);
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
 * `public/spokes/**` at all. The two identity kinds the generic environment cannot express are therefore measured
 * on a TEST-OWNED Hub — the four-Spoke fixture the Spoke switcher is already proved with:
 *
 *   · a LOCKUP (several times a mark's width at the accepted lockup height), and
 *   · an EXCEPTIONALLY WIDE lockup (wider than the header's own content box at EVERY measured width, which is
 *     what makes the proportional clamp the binding constraint rather than an accident of one narrow viewport),
 *
 * and the same members give the cluster both of its conditions: the Spoke switcher ALONE (`primary`), the Spoke
 * switcher AND the Layout selector (`docs`), and the text fallback with the switcher alone (`catalog`).
 *
 * The artwork is AUTHORED HERE, for this scenario's own members, and installed into the generated namespace each
 * member owns under OWNERSHIP: a namespace or file that already exists belongs to another execution or another
 * Installation and is REFUSED rather than overwritten, and only what this scenario created is removed. The
 * members' own configurations are patched in the DISPOSABLE installation tree (OS temp) so each points at its own
 * artwork; nothing authored in the repository is touched.
 */
const LOCKUP_ROLE = "ui-r1-lockup.svg";
const WIDE_LOCKUP_ROLE = "ui-r1-wide-lockup.svg";

const HUB_IDENTITIES = [
  {
    id: "hubSpokeAlone",
    spokeId: "primary",
    role: LOCKUP_ROLE,
    // 480x128 — 3.75:1: 120px wide at the accepted 2rem lockup height, the shape a configured lockup really has.
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="128" viewBox="0 0 480 128" role="presentation"><rect x="0" y="52" width="480" height="24" rx="12" fill="#0f172a"/></svg>\n',
    label: "a configured graphical lockup beside the Spoke switcher alone",
  },
  {
    id: "hubLongLockup",
    spokeId: "docs",
    role: WIDE_LOCKUP_ROLE,
    // 2048x32 — 64:1: 2048px wide at the accepted lockup height, wider than the header's content box everywhere.
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="32" viewBox="0 0 2048 32" role="presentation"><rect x="0" y="12" width="2048" height="8" fill="#0f172a"/></svg>\n',
    label: "an exceptionally wide lockup beside the Spoke switcher AND the Layout selector",
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
}

/** Point a member's OWN configuration (in the DISPOSABLE installation tree) at its own artwork. */
async function configureMemberIdentity(harness, installationRoot, spokeId, logoUrl) {
  const file = path.join(installationRoot, "spokes", spokeId, "site.config.json");
  const config = JSON.parse(await readFile(file, "utf8"));
  config.site = { ...config.site, assets: { ...(config.site?.assets ?? {}), logo: logoUrl } };
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
      await configureMemberIdentity(
        harness,
        installation.root,
        member.spokeId,
        identityLogoUrl(member.hostname, member.spokeId, member.role),
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
      for (const { width, category } of VIEWPORTS) {
        const seen = await readHeaderAt(cdp, width);
        arrangements.set(width, arrangementOf(seen));
        frameByWidth.set(width, seen.frameWidth);
        assertRow(harness, rows, `${member.id}.${category}.w${width}`, seen, { id: member.id, logo: member.role });
        harness.check(
          rows,
          `${member.id}.${category}.w${width}.viewport.applied`,
          seen.viewportWidth === width,
          `requested=${width} innerWidth=${seen.viewportWidth}`,
        );
        // THE PROPORTIONAL CLAMP, wherever the artwork is wider than the header itself: the row renders the clamped
        // width, never the artwork's natural width, and never a distorted or cropped version of it.
        if (member.role !== WIDE_LOCKUP_ROLE) continue;
        const naturalAtLockupHeight = seen.logo
          ? Math.round((seen.logo.naturalWidth / seen.logo.naturalHeight) * seen.logo.box.height)
          : 0;
        harness.check(
          rows,
          `${member.id}.${category}.w${width}.clamp.artworkIsWiderThanTheHeaderItself`,
          !!seen.logo && seen.content.width < naturalAtLockupHeight,
          `content=${seen.content.width} naturalAtLockupHeight=${naturalAtLockupHeight}`,
        );
        harness.check(
          rows,
          `${member.id}.${category}.w${width}.clamp.artworkIsClampedToTheContentWidth`,
          !!seen.logo &&
            seen.logo.box.width >= seen.content.width - 2 &&
            seen.logo.box.width <= seen.content.width + 1,
          `width=${seen.logo && seen.logo.box.width} content=${seen.content.width}`,
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
 * THE GRAPHIC'S PROPORTIONS — or, for the text fallback, that there is no graphic at all.
 *
 * `contain` plus a fixed lockup height is what makes a clamp proportional: the box may be narrower than the
 * artwork's natural width, and the artwork inside is then scaled (never stretched, never cropped). The brand's own
 * link is what carries the rendered width, so "it keeps its natural width when that fits" is asserted against the
 * ratio the FILE declares rather than against a number written down here.
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
  const naturalWidthAtLockupHeight = Math.round((logo.naturalWidth / logo.naturalHeight) * logo.box.height);
  const entitled = Math.min(naturalWidthAtLockupHeight, seen.content.width);
  harness.check(rows, `${tag}.logo.keepsItsLockupHeight`, logo.box.height === 32, `height=${logo.box.height}`);
  harness.check(
    rows,
    `${tag}.logo.keepsItsIntrinsicProportions`,
    logo.objectFit === "contain",
    `object-fit=${logo.objectFit}`,
  );
  harness.check(
    rows,
    `${tag}.logo.naturalWidthUnlessItCannotFit`,
    logo.box.width >= entitled - 2 && logo.box.width <= seen.content.width + 1,
    `width=${logo.box.width} entitled=${entitled} natural=${logo.naturalWidth}x${logo.naturalHeight} content=${seen.content.width}`,
  );
  harness.check(
    rows,
    `${tag}.logo.insideTheContentBox`,
    logo.box.left >= seen.content.left - 1 && logo.box.right <= seen.content.right + 1,
    JSON.stringify(logo.box),
  );
}
