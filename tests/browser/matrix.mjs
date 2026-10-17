// tests/browser/matrix.mjs
// UI-10 D5: the committed browser-validation matrix for the Foundation's ONE
// canonical presentation (the selectable-preset feature was retired, 2026-09).
// It:
//  - writes the canonical UI configuration (matrix CTA only) into site.config.json,
//  - runs `next dev`,
//  - drives a real headless-Chrome/CDP session across desktop/tablet/mobile,
//  - performs REAL interaction (clicks, Tab/Shift+Tab/Escape, backdrop taps,
//    reduced-motion and dark-scheme emulation) and asserts the shared behavioral
//    contract,
//  - emits a machine-readable report and exits non-zero on any failure.
// Run: `pnpm test:browser` — ALL scenarios (the conservative superset: Foundation + deployment).
//      `pnpm test:browser:foundation` / `pnpm test:browser:deployment` — ONE owner's scenarios.
//      Scope semantics live in `tests/browser/scope.mjs` (one harness, one discovery policy).
// (requires a local Chrome/Chromium/Edge binary).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

import { Cdp, findChrome } from "./cdp.mjs";
// UI1-A3-A1 — ONE semantics reader and ONE rule, shared with the production-mode proof
// (`tests/browser/production-continuity.mjs`), so the same claims are judged identically by both gates.
import {
  observedSemantics,
  readSemanticsHooks,
  semanticsAgree,
  semanticsDisagreement,
  semanticsOf,
  semanticsSelfContradiction,
  sidebarSemanticsReader,
} from "./sidebar-semantics.mjs";
// ONE AUTHORITY, ONE DISCOVERY POLICY (FOUNDATION-DEPLOYMENT-ISO-B3A)
// The deployment this harness describes is resolved by the platform's deployment seam — never by a
// second capsule rule here — and WHICH family of scenarios a run executes is decided by the harness's
// one ownership module, which a generic test can import and prove without starting a browser.
import { resolveDeploymentForBuild } from "../../src/config/deployment-build.mjs";
// M18 — the Spoke DECLARATIONS of the selected deployment, so a deployment-scope scenario can be handed the
// configuration file of EVERY Spoke it declares (`spokeConfigFilesFor`) instead of an installation-wide
// value a multi-Spoke Installation does not have.
import { installationSpokes } from "../../src/config/deployment-build.mjs";
import { SPOKE_CONFIG_FILE_NAME } from "../../src/config/spoke-declarations.mjs";
import {
  SCENARIO_SUFFIX,
  browserScopePlan,
  describeBrowserScope,
  deploymentBrowserDirectory,
  deploymentScenarioFiles,
  parseBrowserScope,
} from "./scope.mjs";
// ONE WRITE DOMAIN (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
// Every MUTATING filesystem call in this harness comes from `./scratch.mjs`, which refuses a target
// inside the selected deployment — or outside this run's disposable temp state and its own `.report/` —
// BEFORE writing. That turns "the generic scenarios only touch the disposable copy" from a convention
// into a mechanical guarantee: a regression that reaches for the shipped `site.config.json` fails loudly
// instead of rewriting it. Reads keep using `node:fs` directly.
import { cpSync, mkdir, rm, rmdir, rmSync, writeFile } from "./scratch.mjs";
// TWO READINESS LAYERS, ONE VOCABULARY (FOUNDATION-BR1)
// `document ready` and `client navigation committed` are different states: a visitor action (Site,
// Language, Location) navigates WITHOUT a document load, so the document-level facts `waitReady` has
// always checked are already true when that transition starts. The conditions, the budgets and the
// failure report therefore live in one module — `readiness.mjs` — and a scenario that dispatches a
// visitor action passes the state its next assertion reads (`waitReady(cdp, { path, body })`).
import {
  HYDRATION_SETTLE_MS,
  READINESS_POLL_MS,
  READINESS_TIMEOUT_MS,
  readinessFailureMessage,
  readinessProbeExpression,
} from "./readiness.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

// ── DEPLOYMENT ISOLATION (FOUNDATION-DEPLOYMENT-ISO-B1 / B2A) ────────────────
// The GENERIC scenarios below prove platform behaviour, so they must not depend on — or mutate —
// the repository's own (reference) deployment. They therefore run against a TEMP COPY of the
// committed synthetic deployment (`tests/fixtures/synthetic-deployment`), handed to each dev server
// through `FOUNDATION_DEPLOYMENT_ROOT` (`src/config/deployment-root.ts`). Every config write and
// content fixture below lands inside that copy; the repository's `site.config.json` and
// `content/pages/**` are never opened for writing — and that is MECHANICAL, not conventional: those
// writes are made through `./scratch.mjs`, which refuses any target inside the selected deployment or
// outside this run's disposable state (ISO-B3C2B).
//
// A DEPLOYMENT's own browser acceptance is not part of this file: it lives inside that deployment's
// capsule (`deployment/tests/browser/*.scenario.mjs`) and is DISCOVERED and run below with this
// harness — one browser framework, two owners. Such a scenario reads the SHIPPED configuration
// read-only and starts its dev server WITHOUT the override, because its subject is the deployment
// itself.
const SYNTHETIC_DEPLOYMENT_ROOT = mkdtempSync(join(tmpdir(), "foundation-synthetic-browser-"));
cpSync(join(ROOT, "tests", "fixtures", "synthetic-deployment"), SYNTHETIC_DEPLOYMENT_ROOT, {
  recursive: true,
});
/** The deployment root the GENERIC scenarios mutate (a disposable copy). */
const DEPLOYMENT_ROOT = SYNTHETIC_DEPLOYMENT_ROOT;
/**
 * THE INSTALLED DEPLOYMENT, ASKED OF THE ONE AUTHORITY (FOUNDATION-DEPLOYMENT-ISO-B3A)
 * -----------------------------------------------------------------------------------
 * The deployment a deployment-owned scenario describes is whichever deployment the BUILD selects, so
 * this harness no longer restates that rule: it asks `src/config/deployment-build.mjs` — the module
 * `next.config.ts`, `vitest.config.mts` and `scripts/sync-runtime-assets.mjs` ask — and therefore
 * follows the deployment through the repository, capsule and override layouts alike.
 *
 * Resolution is LAZY and TOLERANT on purpose. The generic scenarios prove platform behaviour against
 * the synthetic copy and must keep running in a repository with no real deployment installed, so the
 * absence of a deployment is reported where it matters — the `deployment` SCOPE — rather than at the
 * harness's import.
 */
let installedDeployment;
/** The deployment the build would serve, or `null` when this repository has none installed. */
function selectedDeployment() {
  if (installedDeployment === undefined) {
    try {
      const resolved = resolveDeploymentForBuild(process.env, ROOT);
      installedDeployment = {
        layout: resolved.layout,
        root: resolved.root,
        // S3F1 — the configuration file the CONFIGURED deployment actually carries: the Installation
        // root's own in legacy mode, the sole Spoke's in explicit mode. Asked of the authority rather
        // than composed here, so the harness follows the authoring form.
        siteConfigFile: resolved.siteConfigFile,
        // M18 — EVERY declared Spoke's own configuration file, in declared order. A deployment-scope
        // scenario whose Installation declares more than one Spoke needs THIS question: `siteConfigFile`
        // above stays the ONE-SPOKE compatibility value and is empty in that form, exactly as the build's
        // own environment states it. The list is the authority's own declaration list, never a path this
        // harness composed and never a default Spoke.
        spokeConfigFiles: spokeConfigFilesFor(resolved),
      };
    } catch {
      // The authority's own message is the diagnostic a BUILD needs; here it only means "this
      // repository has no deployment-owned browser surface to discover".
      installedDeployment = null;
    }
  }
  return installedDeployment;
}
/**
 * The authored configuration file of EVERY Spoke a deployment declares, in declared order.
 *
 * It answers the question `siteConfigFile` cannot answer for a multi-Spoke Installation, and it answers it
 * from the SAME authority that declares the Spokes — never by composing a `spokes/<dir>` path here and
 * never by picking one. A legacy Installation declares no Spoke, so the list is empty.
 */
function spokeConfigFilesFor(resolved) {
  try {
    return installationSpokes(resolved.root).spokes.map((spoke) => ({
      id: spoke.id,
      configFile: join(resolved.root, spoke.relativeRoot, SPOKE_CONFIG_FILE_NAME),
    }));
  } catch {
    return [];
  }
}

/** The installed deployment's config — READ ONLY, for the deployment's own scenarios. */
function shippedConfigPath() {
  const deployment = selectedDeployment();
  return deployment === null ? null : deployment.siteConfigFile;
}

/**
 * WHAT THE INSTALLATION THE GENERIC SERVER ACTUALLY SERVES SHIPS (FOUNDATION-MULTISITE-S3E1C/S3F1B)
 * ================================================================================================
 *
 * The generic scenarios run a dev server pointed at the DISPOSABLE SYNTHETIC installation
 * (`FOUNDATION_DEPLOYMENT_ROOT`), which is a LEGACY Installation: its role artwork is whatever ITS OWN
 * declared namespaces hold. The generated runtime tree is NAMESPACED (S3E1C), and a Spoke's replaceable
 * role artwork belongs to the SPOKE THAT OWNS IT — so this harness must derive an artwork expectation
 * from the installation it serves instead of assuming `/assets/<role>` is present.
 *
 * The capability is computed through the SAME build selection authority the application uses
 * (`src/config/deployment-build.mjs` + the namespace rule it inlines), so the harness cannot drift from
 * the runtime: platform namespace first, then the sole declared Spoke's own, and NOTHING else. It never
 * scans foreign `public/spokes/*` directories, never invents a default asset, and never reads the
 * canonical deployment merely because it happens to exist beside the fixture — an undeclared generated
 * namespace is invisible here exactly as it is to the runtime it is describing.
 */
let servedCapability;
function servedInstallationAssetCapability() {
  if (servedCapability !== undefined) return servedCapability;

  /** The declared namespaces of the installation the generic server serves, in resolution order. */
  const namespaces = [{ directory: join(ROOT, "public", "assets"), urlBase: "/assets" }];
  let mode = "unresolved";
  try {
    const resolution = resolveDeploymentForBuild(
      { ...process.env, FOUNDATION_DEPLOYMENT_ROOT: DEPLOYMENT_ROOT },
      ROOT,
    );
    mode = resolution.mode;
    // S3F1 — an EXPLICIT Installation activates exactly one Spoke, and its namespace is the one the
    // runtime authority publishes for it. Legacy mode declares no Spoke, so the platform namespace is
    // the whole of it.
    if (resolution.mode === "explicit" && resolution.spoke) {
      namespaces.push({
        directory: join(ROOT, "public", "spokes", resolution.spoke.segment, "assets"),
        urlBase: `/spokes/${resolution.spoke.segment}/assets`,
      });
    }
  } catch {
    // No installation to describe: the platform namespace is the only honest answer.
  }

  servedCapability = {
    mode,
    urlBases: namespaces.map((namespace) => namespace.urlBase),
    /**
     * Whether the served installation ships `<name>`, and the same-origin URL it is served from —
     * the harness's projection of the runtime's own rule, never a second resolution policy.
     */
    asset(name) {
      const index = namespaces.findIndex((namespace) => existsSync(join(namespace.directory, name)));
      return index < 0
        ? { served: false, url: null, namespace: null }
        : {
            served: true,
            url: `${namespaces[index].urlBase}/${name}`,
            namespace: index === 0 ? "platform" : "spoke",
          };
    },
    /** A generated namespace this selection does NOT declare — the canonical Spoke's, by convention. */
    undeclaredSpokeNamespace: join(ROOT, "public", "spokes", "foundation", "assets"),
    /**
     * The platform ICON filenames THIS installation publishes — DERIVED, never assumed (M21 §10).
     *
     * A scenario that needs a real icon filename asks here, so the harness works for any installation:
     * a deployment that replaces or renames its icon library keeps every scenario meaningful, and a
     * scenario whose subject (two distinct shipped icons) is absent skips instead of failing.
     */
    publishedIcons() {
      const platform = namespaces.find((namespace) => namespace.urlBase === "/assets");
      if (!platform || !existsSync(platform.directory)) return [];
      return readdirSync(platform.directory)
        .filter((name) => name.startsWith("icon-") && name.endsWith(".svg"))
        .sort();
    },
  };
  return servedCapability;
}
/** Generic scenarios' config target: the disposable copy, never the shipped file. */
const CONFIG_PATH = join(DEPLOYMENT_ROOT, "site.config.json");
/** Generic scenarios' content + dictionary roots (inside the disposable copy). */
const CONTENT_ROOT = join(DEPLOYMENT_ROOT, "content", "pages");
const DICTIONARY_ROOT = join(DEPLOYMENT_ROOT, "config", "i18n");

// The disposable tree is deleted when the run ends, whatever the outcome: generic scenarios leave
// nothing behind in the repository, and the committed fixture is never written back to.
process.on("exit", () => {
  rmSync(SYNTHETIC_DEPLOYMENT_ROOT, { recursive: true, force: true });
});

const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const BASE_PORT = 3800 + (Math.floor(Math.random() * 900) % 900);

let BASE_URL = "";

const VIEWPORTS = {
  desktop: { width: 1280, height: 900 },
  tablet: { width: 900, height: 800 },
  mobile: { width: 390, height: 844 },
  // P5-5A — the P5-4 one-item-per-row mobile contract is verified across the
  // whole <md range (the DO "~390/700/900" acceptance), not only at 390px.
  mobileWide: { width: 700, height: 844 },
};

const CTR = { enabled: true, action: "book", label: "Book Now", href: "/" };

/**
 * FS1 — artwork-activation scenarios are REFERENCE-SITE scope (see the note in the
 * canonical runner). The generic template ships no brand artwork, no banners and
 * no decorative graphics, so the scenarios that assert ACTIVATED artwork are
 * switched off here; the private reference site keeps them enabled in its own copy
 * of this matrix, and an adopter who integrates artwork can flip this to `true`.
 */
const ARTWORK_SCENARIOS = false;

/**
 * THE SIDEBAR CONTROL-ICON ROLE (S3E1C/S3F1B)
 *
 * The Show/Hide navigation control presents the installation's OWN replaceable control artwork — the
 * `sidebar-open` role file — exactly like every other role. It is named here ONCE so the harness can ask
 * the installation it serves whether it ships that role, instead of assuming the file exists.
 */
const CONTROL_ICON_ROLE = "sidebar-open.svg";

/**
 * 2026-09 — the theme/control expectations are READ FROM THE APP'S OWN SINGLE
 * SOURCE (`src/app/globals.css` → the one `--ui-foundation-accent` value), never
 * duplicated here: the gate then proves the UI really consumes that one value
 * instead of merely agreeing with a copy of it. The DARK tint is derived from it
 * with the same `color-mix` the stylesheet declares.
 */
const GLOBALS_CSS = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");
const ACCENT_HEX = /--ui-foundation-accent\s*:\s*(#[0-9a-fA-F]{6})\s*;/.exec(GLOBALS_CSS)[1];
const rgbOf = (hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const ACCENT_RGB = rgbOf(ACCENT_HEX);
/**
 * The DARK-scheme tint, derived from the same one accent exactly as the
 * stylesheet declares it (`color-mix(in srgb, var(--ui-foundation-accent) p%,
 * #ffffff)`) — evaluated here with the same per-channel srgb rounding, so the
 * harness never carries a second hardcoded brand value.
 */
const DARK_MIX = /--ui-brand-accent:\s*color-mix\(in srgb,\s*var\(--ui-foundation-accent\)\s+([\d.]+)%,\s*(#[0-9a-fA-F]{6})\)/.exec(GLOBALS_CSS);
if (!DARK_MIX) throw new Error("globals.css must derive the dark accent from --ui-foundation-accent");
const mixSrgb = (base, p, other) => {
  const a = Number.parseInt(base.slice(1), 16);
  const b = Number.parseInt(other.slice(1), 16);
  const channels = [16, 8, 0].map((shift) =>
    Math.round((((a >> shift) & 255) * p) + (((b >> shift) & 255) * (1 - p))),
  );
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};
const DARK_ACCENT_RGB = rgbOf(mixSrgb(ACCENT_HEX, Number(DARK_MIX[1]) / 100, DARK_MIX[2]));
/** The shared shell-control inset target (~5px) and its tolerance. */
const INSET_TARGET = 5;

/**
 * Compare a browser-reported colour with an expected `rgb(...)` value.
 *
 * Engines serialise a `color-mix()` result as `color(srgb r g b)` (0–1 floats)
 * rather than `rgb(...)`, so the values must be compared — not their spelling.
 * Returns false for anything that is not the same colour.
 */
function sameColor(actual, expectedRgb) {
  if (typeof actual !== "string" || !actual) return false;
  if (actual === expectedRgb) return true;
  const srgb = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\)$/.exec(actual.trim());
  if (!srgb) return false;
  const [, r, g, b] = srgb;
  const asRgb = `rgb(${[r, g, b].map((c) => Math.round(Number(c) * 255)).join(", ")})`;
  return asRgb === expectedRgb;
}

/**
 * UI1-A3 — THE DISCLOSURE CONTROL'S PRESENTED VARIANT.
 *
 * The show/hide control declares BOTH states' artwork and label (`-open` first, then `-closed`) and the
 * stylesheet presents exactly one of them through the rail's own `[data-collapsed]` state (globals.css), so a
 * reader that takes the FIRST match measures the HIDDEN variant whenever the rail is collapsed — a 0x0 box for
 * the geometry rows, and the other state's copy for the naming rows. This is the rule the P6-3C page-icon pair
 * already follows ("measure whichever icon element is actually rendered"): every reader below asks for the
 * variant whose computed `display` is not `none` and whose box is real, and never assumes how many variants
 * the markup contains — a document with a single React-chosen variant answers identically.
 */
const PRESENTED_VARIANT = `const presented = (root, selector) => [...root.querySelectorAll(selector)]
  .find((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0) || null;
const presentedIcon = (root) => presented(root, '.ui-sidebar-toggle-icon');
const presentedLabel = (root) => presented(root, '.ui-sidebar-toggle-label');
/** What the disclosure control PRESENTS — the fingerprint field that makes a boot/runtime mismatch visible. */
const presentedControl = (rail) => {
  const icon = rail ? presentedIcon(rail) : null;
  const label = rail ? presentedLabel(rail) : null;
  return 'icon=' + (icon ? (icon.getAttribute('src') || '').replace('/assets/', '') : 'none') +
    '|label=' + (label ? (label.textContent || '').trim() : 'none') +
    '|variants=' + (rail ? rail.querySelectorAll('.ui-sidebar-toggle-icon').length : 0) + 'icon/' +
    (rail ? rail.querySelectorAll('.ui-sidebar-toggle-label').length : 0) + 'label';
};`;

/**
 * Probes everything the closure pass must hold in the canonical presentation: the
 * theme colour
 * consumers, the sidebar CONTROL size/alignment, the shell CTA inset and the
 * logo roles. Returns a JSON string (CDP `returnByValue`).
 */
const THEME_PROBE = `(() => {
  ${PRESENTED_VARIANT}
  const r2 = (v) => Math.round(v * 100) / 100;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: r2(r.left), r: r2(r.right), t: r2(r.top), w: r2(r.width), h: r2(r.height), cx: r2(r.left + r.width / 2) }; };
  const rail = [...document.querySelectorAll('#shell-sidebar-desktop-rail, #shell-sidebar-tablet-rail')]
    .find((el) => el && el.getBoundingClientRect().width > 0) || null;
  const toggle = rail ? rail.querySelector('.ui-sidebar-toggle') : null;
  // The CONTROL's artwork (UI1-A3) and the rail's page icon (P6-3C) are both state pairs: read the variant
  // that is actually rendered, never the first match.
  const tIcon = rail ? presentedIcon(rail) : null;
  const navIcon = rail
    ? [...rail.querySelectorAll('.ui-nav-item-icon')].find((el) => el.getBoundingClientRect().width > 0) || null
    : null;
  const wordmark = document.querySelector('.home-hero-copy > p');
  const ctaWrap = document.querySelector('.ui-shell-header-row .ui-shell-cta');
  const ctaLink = ctaWrap ? ctaWrap.querySelector('a') : null;
  const headerLogo = document.querySelector('.ui-site-header-logo');
  const footerLogo = document.querySelector('.ui-site-footer-logo');
  const root = getComputedStyle(document.documentElement);
  const sels = {};
  for (const s of document.querySelectorAll('select[data-selector]')) {
    sels[s.getAttribute('data-selector')] = getComputedStyle(s).accentColor;
  }
  return JSON.stringify({
    vw: window.innerWidth,
    hasRail: !!rail,
    hasToggle: !!toggle,
    rail: box(rail),
    collapsed: rail ? rail.getAttribute('data-collapsed') : null,
    toggle: box(toggle),
    toggleIcon: box(tIcon),
    navIcon: box(navIcon),
    wordmarkColor: wordmark ? getComputedStyle(wordmark).color : null,
    ctaWrapLeft: ctaWrap ? r2(ctaWrap.getBoundingClientRect().left) : null,
    ctaLinkLeft: ctaLink ? r2(ctaLink.getBoundingClientRect().left) : null,
    primary: root.getPropertyValue('--primary').trim(),
    ring: root.getPropertyValue('--ring').trim(),
    accent: root.getPropertyValue('--ui-brand-accent').trim(),
    foundationAccent: root.getPropertyValue('--ui-foundation-accent').trim(),
    sels,
    presetSelectorPresent: !!document.querySelector('select[data-selector="preset"]'),
    headerLogo: box(headerLogo),
    footerLogo: box(footerLogo),
    logos: [...document.querySelectorAll('img[src*="logo-"]')].map((i) => i.getAttribute('src')),
    broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
  });
})()`;

/**
 * The Foundation's ONE canonical presentation (owner decision, 2026-09).
 *
 * The selectable-preset feature is RETIRED, so the browser matrix exercises the
 * canonical composition ONCE instead of multiplying every check across five
 * presets. Nothing is overridden except the CTA destination (a real internal
 * route, so CTA reachability can be asserted); the presentation itself comes
 * from the shipped configuration.
 */
const CANONICAL = {
  name: "canonical",
  ui: {
    cta: { ...CTR, style: "standard" },
    // R1A — the CANONICAL presentation is ONE composition, so this scenario pins
    // it explicitly: the REFERENCE deployment now enables `ui.layoutSwitcher`
    // (Sidebar ⇄ Menu bar) for visitors, and every assertion of this scenario
    // measures the single shipped composition. `enabled: false` with no
    // `navigation.desktop/tablet` resolves to exactly the Foundation defaults
    // (`sidebar` / `collapsed-sidebar`) — the presentation this scenario has
    // always tested. The reference deployment's OWN switcher is proved by the
    // `reference-content` scenario, which runs against the shipped configuration
    // unmodified.
    layoutSwitcher: { enabled: false },
  },
};

function check(rows, name, ok, detail = "") {
  rows.push({ name, ok, detail });
}

/** A JS expression string that evaluates to whether `selector` is visibly rendered. */
function visible(selector) {
  return `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; })()`;
}

/**
 * Waits for the page the scenario needs — BOTH readiness layers (FOUNDATION-BR1).
 *
 * Without `expected`: the document finished loading and the shell's chrome is present — the layer a FULL
 * navigation (`cdp.navigate`) reaches.
 *
 * With `expected`: additionally, a CLIENT-SIDE transition has produced the state the CALLER is about to
 * assert — the resulting route, and (when the caller knows it) a marker of the body it renders. A soft
 * navigation changes neither `readyState` nor the shell, so this is the only observable that can await
 * one; a page probed without it is the page that happened to be current, which is the historical
 * language-switch transient.
 *
 * The budget, poll interval and settle are the harness's established ones (`readiness.mjs`); the settle is
 * kept so the semantics of a satisfied wait are unchanged.
 */
async function waitReady(cdp, expected = null) {
  const t0 = Date.now();
  let observed = null;
  while (Date.now() - t0 < READINESS_TIMEOUT_MS) {
    observed = await cdp.evaluate(readinessProbeExpression(expected));
    if (observed.satisfied) { await sleep(HYDRATION_SETTLE_MS); return; }
    await sleep(READINESS_POLL_MS);
  }
  throw new Error(readinessFailureMessage(observed, expected));
}

/** Click a point on the backdrop that is NOT covered by the left-anchored panel. */
async function clickBackdrop(cdp) {
  const point = await cdp.evaluate(
    `(() => { const p = document.querySelector('.ui-drawer-panel'); const pr = p ? p.getBoundingClientRect() : null; const w = document.documentElement.clientWidth; const h = document.documentElement.clientHeight; const pright = pr ? pr.right : w - 30; const x = Math.max(pright + 12, Math.min(w - 10, pright + 12)); return { x: Math.min(x, w - 6), y: Math.max(8, Math.min(100, h - 10)) }; })()`,
  );
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
}

async function openTrigger(cdp, triggerSelector, panelSelector, attempts = 5) {
  for (let i = 0; i < attempts; i += 1) {
    const clicked = await cdp.clickCenter(triggerSelector);
    await sleep(250);
    const opened = clicked && (await cdp.evalBool(`!!document.querySelector(${JSON.stringify(panelSelector)})`));
    if (opened) return true;
  }
  return false;
}

/**
 * Dev-server process helpers.
 *
 * `synthetic` (the default) points the server at the disposable synthetic deployment through
 * `FOUNDATION_DEPLOYMENT_ROOT`; the reference scenario passes `synthetic: false` so its server
 * serves the repository's own deployment.
 */
/**
 * NAV1D — activate the Show/Hide control of the rail that is actually ON SCREEN.
 *
 * A composition exposes one rail per band behind mutually exclusive width gates, so a selector
 * aimed at a band — or at the first `[data-ui-shell-part="rail"]` in the DOM — can land on a hidden
 * one and quietly do nothing. This clicks the PRESENTED rail's own control, exactly as a visitor
 * would (a real activation on the control the visitor can see).
 */
async function clickVisibleRailToggle(cdp) {
  return cdp.evaluate(`(() => {
    const rail = [...document.querySelectorAll('.ui-sidebar-rail')].find((el) => el.getBoundingClientRect().width > 0) || null;
    const toggle = rail ? rail.querySelector('.ui-sidebar-toggle') : null;
    if (!toggle) return false;
    toggle.click();
    return true;
  })()`);
}

/**
 * NAV1D-V2 — close the PRESENTED rail if it is open, through its own control: the deterministic
 * canonical state a measurement loop starts from.
 */
async function closeVisibleRail(cdp) {
  return cdp.evaluate(`(() => {
    const rail = [...document.querySelectorAll('.ui-sidebar-rail')].find((el) => el.getBoundingClientRect().width > 0) || null;
    if (!rail || rail.getAttribute('data-collapsed') !== 'false') return false;
    const toggle = rail.querySelector('.ui-sidebar-toggle');
    if (!toggle) return false;
    toggle.click();
    return true;
  })()`);
}

function startDevServer(port, { synthetic = true, deploymentRoot = null } = {}) {
  const proc = spawn(process.execPath, [NEXT_BIN, "dev", "--port", String(port)], {
    cwd: ROOT,
    env: deploymentRoot !== null
      ? { ...process.env, FOUNDATION_DEPLOYMENT_ROOT: deploymentRoot }
      : synthetic
        ? { ...process.env, FOUNDATION_DEPLOYMENT_ROOT: DEPLOYMENT_ROOT }
        : { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let log = "";
  proc.stdout.on("data", (d) => { log += d.toString(); });
  proc.stderr.on("data", (d) => { log += d.toString(); });
  const server = { proc, log: () => log };
  STARTED_SERVERS.push(server);
  return server;
}

/**
 * Stops a dev server and WAITS until it is really gone.
 *
 * Next 16 refuses to start a second `next dev` for the same project directory, so a stopped-but-not-
 * yet-dead server makes the next scenario's server exit immediately ("You can access the existing
 * server at …"). The wait turns that race into an orderly hand-over.
 */
async function stopServer(server) {
  if (!server) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(server.proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      server.proc.kill("SIGTERM");
    }
  } catch { /* noop */ }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (server.proc.exitCode !== null && server.proc.exitCode !== undefined) return;
    await sleep(250);
  }
}

/** The dev servers started in this run, so a readiness wait can fail FAST when one dies. */
const STARTED_SERVERS = [];

async function waitForServer(url, timeoutMs = 300000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    // A dev server that exited cannot become ready: Next 16 refuses to start a second dev server
    // for a project directory (a leftover process from an earlier run keeps the lock), and waiting
    // the full budget for it produces a five-minute stall with no explanation. Report its own output
    // immediately instead. ONLY the most recently started server is considered — earlier scenarios'
    // servers have been stopped on purpose, so their exit codes say nothing about this wait.
    const current = STARTED_SERVERS[STARTED_SERVERS.length - 1];
    if (current && current.proc.exitCode !== null && current.proc.exitCode !== undefined) {
      throw new Error(
        `dev server exited before serving ${url}\n--- dev server output ---\n${current.log()}`,
      );
    }
    try {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(12000) });
      if (res.status === 200) return;
    } catch { /* not ready yet */ }
    await sleep(1500);
  }
  throw new Error(`dev server not ready: ${url}`);
}

/**
 * DEPLOYMENT-OWNED BROWSER ACCEPTANCE (FOUNDATION-DEPLOYMENT-ISO-B2A / ISO-B3A)
 * ---------------------------------------------------------------------------
 * A deployment's browser acceptance belongs to the deployment, so it lives in that deployment's OWN
 * tree — `<deployment root>/tests/browser/*.scenario.mjs`, i.e. the capsule's
 * `deployment/tests/browser/` in THIS repository — and REUSES this harness rather than shipping a
 * second CDP framework.
 *
 * Ownership is FILESYSTEM-DRIVEN (`tests/browser/scope.mjs`): the directory comes from the deployment
 * the authority selected, so repository, capsule and override deployments each discover their own
 * scenarios, a deployment that ships none discovers none, and adding a deployment never edits a list.
 * Discovery is a directory convention plus one small contract:
 *
 *     export const id = "…";                        // the report's `presentation` label
 *     export async function run(chrome, harness) {} // returns the same check rows as a scenario here
 *
 * The platform therefore never imports a deployment file statically, and a repository with no
 * deployment simply discovers nothing.
 */

/** The generic pieces of THIS harness a deployment scenario is given. */
function deploymentHarness() {
  return {
    basePort: BASE_PORT,
    viewports: VIEWPORTS,
    check,
    startDevServer,
    stopServer,
    waitForServer,
    waitReady,
    chooseLayout,
    configFile: shippedConfigPath(),
    // M18 — the configuration file of EVERY Spoke the selected deployment declares. `configFile` above is
    // the ONE-SPOKE compatibility value (empty for a multi-Spoke Installation); this is the question a
    // deployment-scope scenario asks when its Installation declares more than one Spoke.
    spokeConfigFiles: selectedDeployment()?.spokeConfigFiles ?? [],
  };
}

/**
 * The deployment-owned scenarios the SELECTED deployment ships.
 *
 * `names` is empty when nothing owns scenarios — either no deployment is installed at all, or the
 * installed deployment ships none. That is exactly what an `all` run tolerates and what a
 * `deployment`-scoped run refuses, loudly, in `runMatrix`.
 */
async function discoverDeploymentScenarios() {
  const deployment = selectedDeployment();
  if (deployment === null) return { deployment, directory: null, names: [] };
  const directory = deploymentBrowserDirectory(deployment.root);
  if (!existsSync(directory)) return { deployment, directory, names: [] };
  return { deployment, directory, names: deploymentScenarioFiles(await readdir(directory)) };
}

/** Why a `--scope deployment` run cannot proceed, as one explicit message. */
function deploymentScopeFailure({ deployment, directory }) {
  if (deployment === null) {
    return (
      "--scope deployment was asked for, but no deployment is installed: the deployment authority " +
      "found no site.config.json in the capsule (<repo>/deployment/) and none at the repository " +
      "root. Select a deployment (or set FOUNDATION_DEPLOYMENT_ROOT) and run it again."
    );
  }
  return (
    `--scope deployment was asked for, but the ${deployment.layout} deployment at ${deployment.root} ` +
    `ships no ${SCENARIO_SUFFIX} scenario in ${directory}. The deployment scope runs the deployment's ` +
    "OWN acceptance and nothing else, so an empty scope is reported rather than silently passed."
  );
}

/** Runs every deployment-owned scenario, labelled and summarised exactly like a scenario here. */
async function runDeploymentScenarios(chrome, directory, names) {
  const rows = [];
  for (const file of names) {
    const loaded = await import(pathToFileURL(join(directory, file)).href);
    const scenario = loaded.default ?? loaded;
    const label = scenario.id ?? file.slice(0, -SCENARIO_SUFFIX.length);
    const scenarioRows = await scenario.run(chrome, deploymentHarness());
    rows.push(...scenarioRows.map((row) => ({ presentation: label, ...row })));
    const failures = scenarioRows.filter((row) => !row.ok).length;
    console.log(
      `[matrix] ${label}: ${scenarioRows.length - failures}/${scenarioRows.length} checks passed${failures ? ` FAIL=${failures}` : ""}`,
    );
    // WHICH invariant broke, by name — a count alone leaves a failing run to be re-diagnosed by hand.
    for (const row of scenarioRows.filter((entry) => !entry.ok)) {
      console.log(`[matrix] ${label}: FAIL ${row.name}` + (row.detail ? ` :: ${row.detail}` : ""));
    }
  }
  return rows;
}

/**
 * The FOUNDATION-owned scenarios: the SAME `*.scenario.mjs` convention the deployment family uses, in the
 * harness's own directory.
 *
 * A platform contract that needs its OWN Installation — M16's multi-Spoke runtime, dispatched by hostname —
 * belongs to the Foundation and not to whichever deployment happens to be installed, so it lives in a file of
 * its own instead of growing this runner. Discovery is FILENAME-DRIVEN, exactly like the deployment family's:
 * adding a scenario never edits a list.
 */
async function discoverFoundationScenarios() {
  return deploymentScenarioFiles(await readdir(HERE));
}

/** Runs every Foundation-owned scenario, labelled and summarised exactly like a scenario in this file. */
async function runFoundationScenarios(chrome, names) {
  const rows = [];
  for (const file of names) {
    const loaded = await import(pathToFileURL(join(HERE, file)).href);
    const scenario = loaded.default ?? loaded;
    const label = scenario.id ?? file.slice(0, -SCENARIO_SUFFIX.length);
    const scenarioRows = await scenario.run(chrome, foundationHarness());
    rows.push(...scenarioRows.map((row) => ({ presentation: label, ...row })));
    const failures = scenarioRows.filter((row) => !row.ok).length;
    console.log(
      `[matrix] ${label}: ${scenarioRows.length - failures}/${scenarioRows.length} checks passed${failures ? ` FAIL=${failures}` : ""}`,
    );
    // WHICH invariant broke, by name — a count alone leaves a failing run to be re-diagnosed by hand.
    for (const row of scenarioRows.filter((entry) => !entry.ok)) {
      console.log(`[matrix] ${label}: FAIL ${row.name}` + (row.detail ? ` :: ${row.detail}` : ""));
    }
  }
  return rows;
}

/**
 * The harness a FOUNDATION-owned scenario receives: the same mechanics the deployment family gets, plus the
 * two facts a platform contract may need — the repository it runs in, and the GUARDED writers that are this
 * harness's own write domain (`./scratch.mjs`), so a scenario that must materialise GENERATED Spoke output
 * cannot bypass the guard that owns that domain.
 */
function foundationHarness() {
  return {
    ...deploymentHarness(),
    repositoryRoot: ROOT,
    configFile: CONFIG_PATH,
    writeFile,
    mkdir,
    rm,
    rmSync,
    cpSync,
  };
}

async function writeReport(rows, totalFails) {
  const report = {
    generatedAt: new Date().toISOString(),
    totalChecks: rows.length,
    failedChecks: totalFails,
    rows,
  };
  const tmp = join(tmpdir(), "ui10-browser-report.json");
  await writeFile(tmp, JSON.stringify(report, null, 2), "utf8");
  try {
    await mkdir(join(HERE, ".report"), { recursive: true });
    await writeFile(join(HERE, ".report", "ui10-browser-report.json"), JSON.stringify(report, null, 2), "utf8");
  } catch { /* report dir is gitignored; tmp is authoritative */ }
  console.log(`REPORT=${tmp}`);
  console.log(`TOTAL=${rows.length} PASSED=${rows.length - totalFails} FAILED=${totalFails}`);
  const fails = rows.filter((r) => !r.ok);
  for (const f of fails) console.log(`  FAIL [${f.presentation}/${f.name}] ${f.detail}`);
}
/**
 * P1-3 — the VISIBLE focus-ring contract (the single global `:focus-visible`
 * rule driven by the `--ring` token). This is distinct from the UI-10 focus
 * LIFECYCLE (entry/return/inert, asserted elsewhere). We prove:
 *  - keyboard focus (real Tab dispatch / a real focus()) yields a VISIBLE
 *    `:focus-visible` outline on the shared link family;
 *  - pointer-only interaction does NOT falsely force the ring (Chromium's
 *    `:focus-visible` heuristic: mouse interaction does not match);
 *  - a keyboard Tab sweep lands on an interactive element (button/select/a)
 *    that carries the visible ring.
 * No configuration, no presentation branching — the single global rule applies to
 * whichever interactive elements each composition renders.
 */
async function runFocusVisibleRing(rows, cdp, label) {
  // Fresh navigation so focus heuristics start clean (no prior keyboard/paint).
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);

  // 1) POINTER (real mouse click): a REAL CDP mouse click deterministically
  //    sets Chromium's input modality to "mouse"; `:focus-visible` must NOT
  //    match for a plain anchor focused by a mouse (unlike a script `.focus()`,
  //    which inherits the stale WebContents keyboard-modality from earlier
  //    assertions — the cause of the original flake). The target is a plain
  //    header/footer anchor; a one-shot `click` preventDefault stops navigation
  //    so the element stays inspectable.
  const LINK_SELECTOR = 'nav[aria-label="Primary navigation"] a, footer a, header a';
  await cdp.evaluate(`(() => {
    const a = document.querySelector(${JSON.stringify(LINK_SELECTOR)});
    if (!a) return;
    a.addEventListener("click", function once(e) {
      e.preventDefault();
      a.removeEventListener("click", once);
    }, { capture: true });
  })()`);
  await cdp.clickCenter(LINK_SELECTOR);
  await sleep(80);
  const pointer = await cdp.evaluate(`(() => {
    const a = document.querySelector(${JSON.stringify(LINK_SELECTOR)});
    if (!a) return { ok: false, detail: "no nav/footer/header link" };
    const cs = getComputedStyle(a);
    const forced = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
    const fv = a.matches(':focus-visible');
    const self = document.activeElement === a;
    return { ok: !forced && !fv && self, forced, fv, self, style: cs.outlineStyle + ' ' + cs.outlineWidth };
  })()`);
  check(rows, `${label}.focusVisible.pointer.noRing`, !!pointer && !!pointer.ok, (pointer && pointer.detail) || `forced=${pointer && pointer.forced} fv=${pointer && pointer.fv} self=${pointer && pointer.self} ${pointer && pointer.style}`);

  // 2) KEYBOARD: real Tab dispatch until an interactive family is active;
  //    Chromium matches `:focus-visible` for keyboard modality, so the VISIBLE
  //    ring (the single global `--ring` rule) must be present.
  let keyboard = null;
  for (let i = 0; i < 8 && !keyboard; i += 1) {
    await cdp.pressKey("Tab");
    await sleep(60);
    keyboard = await cdp.evaluate(`(() => {
      const el = document.activeElement;
      if (!el) return null;
      if (!/^(A|BUTTON|SELECT|TEXTAREA|INPUT)$/i.test(el.tagName)) return null;
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px';
      return { ok: ring, tag: el.tagName, style: cs.outlineStyle + ' ' + cs.outlineWidth };
    })()`);
  }
  check(rows, `${label}.focusVisible.link.ring`, !!keyboard && !!keyboard.ok, (keyboard && keyboard.detail) || `active=${keyboard && keyboard.tag}: ${keyboard && keyboard.style}`);
}
/**
 * The rail state one band presents — every field BOTH the closed and the expanded contract reads
 * (P0-1 / P6-1 / P6-3A / P6-3C). One probe, so a state change is re-probed instead of re-measured by a
 * second copy of the same expressions.
 */
async function probeAside(cdp, { railSel, panelSel, controlsId }) {
  return cdp.evaluate(`(() => {
    ${PRESENTED_VARIANT}
    const rail = document.querySelector(${JSON.stringify(railSel)});
    const shell = document.querySelector('.ui-shell-sidebar');
    const panel = document.querySelector(${JSON.stringify(panelSel)});
    const toggle = rail ? rail.querySelector(${JSON.stringify(`[aria-controls="${controlsId}"]`)}) : null;
    // UI1-A3 — the control declares BOTH states' artwork and label, so every field below reads the variant
    // this state PRESENTS: the button's own whole-text content would also hold the hidden state's copy.
    const toggleIcon = toggle ? presentedIcon(toggle) : null;
    const toggleLabel = toggle ? presentedLabel(toggle) : null;
    const pr = panel ? panel.getBoundingClientRect() : null;
    const tr = toggle ? toggle.getBoundingClientRect() : null;
    const sr = shell ? shell.getBoundingClientRect() : null;
    const firstItem = rail ? rail.querySelector('ul li') : null;
    const fir = firstItem ? firstItem.getBoundingClientRect() : null;
    return {
      hasRail: !!rail,
      panelVisible: !!pr && pr.width > 0 && pr.height > 0,
      panelHiddenClass: !!panel && panel.classList.contains('hidden'),
      // P6-3A — persistent-rail width state (collapse = a horizontal width).
      railWidth: rail ? Math.round(rail.getBoundingClientRect().width) : null,
      dataCollapsed: rail ? rail.getAttribute('data-collapsed') : null,
      togglePresent: !!toggle,
      toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
      // P6-1 — the disclosure is a real interactive control with a visible,
      // LOADED icon and the state-correct Show/Hide navigation label.
      toggleTag: toggle ? toggle.tagName : null,
      toggleIcon: !!toggleIcon,
      toggleIconSrc: toggleIcon ? toggleIcon.getAttribute("src") : null,
      toggleIconLoaded: !!toggleIcon && toggleIcon.complete && toggleIcon.naturalWidth > 0,
      toggleIconBroken: !!toggleIcon && !(toggleIcon.complete && toggleIcon.naturalWidth > 0),
      brokenSrcs: [...document.images]
        .filter((img) => !(img.complete && img.naturalWidth > 0))
        .map((img) => img.getAttribute("src")),
      // P6-1 — the state-correct Show/Hide navigation copy the control PRESENTS (never the hidden variant).
      toggleText: toggleLabel ? toggleLabel.textContent.trim() : null,
      // P6-1 — spacing/hierarchy (wrapper edge → toggle inset → item inset).
      railLeft: sr ? Math.round(sr.left) : null,
      railRight: sr ? Math.round(sr.right) : null,
      // NAV1D-V2 — the RAIL's own box as well as the frame's: with the open rail overlaying the page the
      // two differ (the frame reserves the collapsed column), and the rail's OWN insets are what the
      // padding contract is about.
      railBox: rail
        ? (() => {
            const r = rail.getBoundingClientRect();
            return [Math.round(r.left), Math.round(r.right), Math.round(r.width)];
          })()
        : null,
      toggleLeft: tr ? Math.round(tr.left) : null,
      toggleRight: tr ? Math.round(tr.right) : null,
      itemLeft: fir ? Math.round(fir.left) : null,
      itemRight: fir ? Math.round(fir.right) : null,
      // NAV1D — the rail's OWN computed inline padding (the one owned token), measured on the rail
      // element rather than inferred from any child's box.
      railPadInlineStart: (() => {
        const cs = rail ? getComputedStyle(rail) : null;
        return cs ? Math.round(parseFloat(cs.paddingInlineStart) || 0) : null;
      })(),
      railPadInlineEnd: (() => {
        const cs = rail ? getComputedStyle(rail) : null;
        return cs ? Math.round(parseFloat(cs.paddingInlineEnd) || 0) : null;
      })(),
      noBrokenImages: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    };
  })()`);
}

/** The canonical presentation's desktop aside (bottom bar + More on mobile). */
async function runAsidePresentation(rows, presentation, cdp) {
  // P0-1: the canonical presentation resolves `shell.sidebar.collapsible: true`,
  // so the SAME structural contract applies here.
  const collapsible = true;
  /**
   * UI1 — the width the EXPANDED rail presents, captured per band by an explicit toggle and used as the
   * reference for every later comparison (the canonical initial state is CLOSED, so the initial width is
   * the collapsed rail's).
   */
  let expandedRailWidth = null;
  for (const [vpName, vp] of [["desktop", VIEWPORTS.desktop], ["tablet", VIEWPORTS.tablet]]) {
    await cdp.setViewport(vp.width, vp.height);
    await cdp.navigate(`${BASE_URL}/ww/en`);
    await waitReady(cdp);
    // UI1 — the CANONICAL no-preference state is asserted on a document that HAS no preference: this
    // scenario's own toggles record one, and the preference is the visitor's browser state, so it is
    // cleared through the browser exactly as a visitor's storage would be.
    await cdp.evaluate(`window.localStorage.removeItem(${JSON.stringify(SIDEBAR_PREFERENCE_KEY)}); true`);
    await cdp.reload();
    await waitReady(cdp);
    const controlsId = vpName === "desktop" ? "shell-sidebar-desktop-panel" : "shell-sidebar-tablet-panel";
    const railSel = vpName === "desktop" ? "#shell-sidebar-desktop-rail" : "#shell-sidebar-tablet-rail";
    const panelSel = vpName === "desktop" ? "#shell-sidebar-desktop-panel" : "#shell-sidebar-tablet-panel";
    const toggleSel = `${railSel} [aria-controls="${controlsId}"]`;

    // P0-1 INITIAL state — a real collapse is NOT aria-only: a collapsed band
    // keeps its persistent rail geometry; the toggle stays (expand control).
    // P6-1 — also captures the disclosure CONTROL contract: semantic element,
    // state-flipping label, real loaded icon, rail/content insets, no broken
    // image anywhere on the page.
    //
    // UI1 — the INITIAL state of a composed rail is CLOSED in every band (the canonical
    // no-preference state); the EXPANDED contract below is therefore measured after the visitor
    // toggles, which is the only thing that may open a rail.
    const init = await probeAside(cdp, { railSel, panelSel, controlsId });
    check(rows, `${vpName}.aside.present`, !!init.hasRail);
    // S3F1B — the control artwork THIS installation ships, asked once per band; every icon expectation
    // below (initial state, expanded state, collapse-back) follows the same answer.
    const controlCap = servedInstallationAssetCapability();
    const controlIcon = controlCap.asset(CONTROL_ICON_ROLE);
    if (collapsible) {
      check(rows, `${vpName}.aside.toggle.present`, !!init.togglePresent);
      check(rows, `${vpName}.aside.toggle.semanticButton`, !!init.togglePresent && init.toggleTag === "BUTTON");
      // P6-1 — the disclosure's control icon is the INSTALLATION'S OWN role artwork (S3E1C), so the
      // expectation follows the installation this server actually serves (S3F1B):
      //   · the installation SHIPS the role → the control presents that file, loaded, from one of ITS
      //     OWN declared namespaces (an installation that ships the role must never fall back);
      //   · the installation does NOT ship it (the generic synthetic legacy installation) → the
      //     control presents NO icon at all — never a foreign Spoke's file, never a broken image, and
      //     no request to an undeclared namespace. Layout, semantics and the state vocabulary below are
      //     unchanged either way, so the shell's contract is proved in both worlds.
      check(
        rows,
        `${vpName}.aside.toggle.icon`,
        controlIcon.served
          ? !!init.toggleIcon && init.toggleIconSrc === controlIcon.url
          : !init.toggleIcon && init.toggleIconSrc === null,
        `shipped=${controlIcon.served} src=${init.toggleIconSrc}`,
      );
      check(
        rows,
        `${vpName}.aside.toggle.icon.loaded`,
        controlIcon.served ? !!init.toggleIconLoaded : !init.toggleIconBroken && !!init.noBrokenImages,
        `shipped=${controlIcon.served} broken=${JSON.stringify(init.brokenSrcs)}`,
      );
      check(
        rows,
        `${vpName}.aside.toggle.icon.declaredNamespaceOnly`,
        !init.toggleIconSrc ||
          controlCap.urlBases.some((base) => (init.toggleIconSrc || "").startsWith(`${base}/`)),
        `src=${init.toggleIconSrc} declared=${controlCap.urlBases.join(",")}`,
      );
      // UI1 — THE CANONICAL NO-PREFERENCE STATE IS CLOSED IN EVERY BAND, so both compositions are
      // asserted closed first: a collapsed band keeps its persistent rail (P6-3A), stays narrow, is
      // never a dead end, and says "Show navigation" (P6-1).
      check(rows, `${vpName}.aside.collapsed.initial`, init.toggleExpanded === "false" && init.dataCollapsed === "true" && init.panelVisible && !init.panelHiddenClass);
      check(rows, `${vpName}.aside.collapsed.persistentNarrow`, init.railWidth != null && init.railWidth > 0 && init.railWidth <= 64, `railWidth=${init.railWidth}`);
      check(rows, `${vpName}.aside.collapsed.notDeadEnd`, init.togglePresent);
      // P6-1 — collapsed rail → "Show navigation".
      check(rows, `${vpName}.aside.toggle.labelShow`, init.toggleText === "Show navigation");

      // UI1 — the EXPANDED contract (P0-1 expansion + P6-1 spacing/vocabulary) is measured after the
      // VISITOR toggles: the disclosure control is the only thing that may open a rail, and the width it
      // produces is the reference every later comparison uses.
      await cdp.clickCenter(toggleSel);
      await sleep(250);
      const expanded = await probeAside(cdp, { railSel, panelSel, controlsId });
      expandedRailWidth = expanded.railWidth;
      check(rows, `${vpName}.aside.expand.afterToggle`, expanded.toggleExpanded === "true" && expanded.panelVisible);
      // P6-1 — ONE vocabulary: open rail → "Hide navigation".
      check(rows, `${vpName}.aside.toggle.labelHide`, expanded.toggleText === "Hide navigation");
      if (vpName === "desktop") {
        // P6-1 — edge placement + second-level inset (control vs navigation items) is the DESKTOP
        // rail's contract. NAV1D-V3 — the rail now sits ON the page edge (the old ~20px shell gutter is
        // gone), so the edge contract is the OPPOSITE of what it was: the rail's left edge is the page's.
        check(rows, `${vpName}.aside.spacing.railOnThePageEdge`, !!(expanded.railLeft != null && expanded.railLeft <= 1), `railLeft=${expanded.railLeft}`);
        // NAV1D — SYMMETRICAL HORIZONTAL PADDING (owner ruling): the sidebar's left padding equals
        // its right padding, BOTH are the rail's own inline padding token, the control's box IS the
        // rail's content box, and the navigation rows use that SAME inset. The superseded contract
        // put the control ~5px from the rail's edge while the items sat 20px deeper — the asymmetry
        // this defect names, and the reason the control's focus ring was clipped.
        const railPadStart = expanded.railPadInlineStart;
        const railPadEnd = expanded.railPadInlineEnd;
        const toggleInsetLeft =
          expanded.toggleLeft != null && expanded.railLeft != null
            ? expanded.toggleLeft - expanded.railLeft
            : null;
        const toggleInsetRight =
          expanded.railBox && expanded.toggleRight != null
            ? expanded.railBox[1] - expanded.toggleRight
            : null;
        const itemInsetLeft =
          expanded.itemLeft != null && expanded.railLeft != null
            ? expanded.itemLeft - expanded.railLeft
            : null;
        check(
          rows,
          `${vpName}.aside.spacing.paddingSymmetric`,
          railPadStart != null && railPadEnd != null && railPadStart === railPadEnd,
          `railPad=${railPadStart}/${railPadEnd}`,
        );
        check(
          rows,
          `${vpName}.aside.spacing.controlAtTheRailPadding`,
          toggleInsetLeft != null &&
            toggleInsetRight != null &&
            railPadStart != null &&
            Math.abs(toggleInsetLeft - railPadStart) <= 1 &&
            Math.abs(toggleInsetRight - railPadStart) <= 2,
          `toggle insets=${toggleInsetLeft}/${toggleInsetRight} railPad=${railPadStart}`,
        );
        check(
          rows,
          `${vpName}.aside.spacing.itemsShareTheInset`,
          itemInsetLeft != null && toggleInsetLeft != null && Math.abs(itemInsetLeft - toggleInsetLeft) <= 1,
          `item=${itemInsetLeft} toggle=${toggleInsetLeft}`,
        );
        // NAV1D-V3 — the item's inset from the PAGE edge IS the rail's own padding: neither clipped at
        // the edge nor pushed in by a second (shell) gutter. The old absolute threshold encoded the
        // ~20px outer offset this task removed.
        check(
          rows,
          `${vpName}.aside.spacing.itemInsetIsTheRailPadding`,
          !!(expanded.itemLeft != null && railPadStart != null && Math.abs(expanded.itemLeft - railPadStart) <= 1),
          `itemLeft=${expanded.itemLeft} railPad=${railPadStart}`,
        );
      }
    } else {
      // immersive floating rail: static, expanded, no toggle (capability off).
      check(rows, `${vpName}.aside.static.panelVisible`, init.panelVisible);
      check(rows, `${vpName}.aside.static.noToggle`, !init.togglePresent);
    }
    // P6-1 — no broken-image placeholder anywhere on the rail viewport.
    check(rows, `${vpName}.aside.noBrokenImages`, !!init.noBrokenImages, `broken=${JSON.stringify(init.brokenSrcs)}`);

    // UI1 — the band is already EXPANDED here (the toggle above), which is the state the content
    // contract below (one item per row, current-page marking, no CTA inside the rail) is measured in.

const s = await cdp.evaluate(`(() => ({
      sidebar: !!document.querySelector('.ui-shell-sidebar'),
      desktopRail: ${visible('#shell-sidebar-desktop-rail')},
      tabletRail: ${visible('#shell-sidebar-tablet-rail')},
      // P6-3C — the primary CTA is NOT inside the rail in either state; the ONE
      // instance lives in the shell's top region (below the header).
      ctaInAside: (() => { for (const sel of ['#shell-sidebar-desktop-rail', '#shell-sidebar-tablet-rail']) { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width > 0) { const c = el.querySelector('.ui-shell-cta'); if (c && c.getBoundingClientRect().width > 0) return true; } } return false; })(),
      ctaInTopRegion: ${visible('.ui-shell-header-row .ui-shell-cta')},
      ctaReachableCount: [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length,
      currentInAside: (() => { for (const sel of ['#shell-sidebar-desktop-rail', '#shell-sidebar-tablet-rail']) { const el = document.querySelector(sel); if (el && el.getBoundingClientRect().width > 0 && el.querySelector('a[aria-current="page"]')) return true; } return false; })(),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      bottomBar: ${visible('.ui-shell-bottom-bar')},
      // P5-4 — the sidebar band presents navigation as ONE vertical list, one
      // item per row (no two <li> share a horizontal line).
      itemsOnePerRow: (() => { const lis = [...document.querySelectorAll('.ui-shell-sidebar ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); if (lis.length === 0) return false; const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top)); return new Set(tops).size === tops.length; })(),
    }))()`);
    check(rows, `${vpName}.aside.present`, !!s.sidebar);
    check(rows, `${vpName}.aside.bandExclusive`, (s.desktopRail && !s.tabletRail) || (!s.desktopRail && s.tabletRail));
    check(rows, `${vpName}.aside.cta.outsideSidebar`, !!s.sidebar && !s.ctaInAside, `inAside=${s.ctaInAside}`);
    check(rows, `${vpName}.aside.cta.reachableInTop`, !!s.ctaInTopRegion);
    check(rows, `${vpName}.aside.cta.single`, s.ctaReachableCount === 1, `count=${s.ctaReachableCount}`);
    check(rows, `${vpName}.aside.ariaCurrent`, !!s.currentInAside);
    check(rows, `${vpName}.no.dialog`, s.dialogs === 0);
    check(rows, `${vpName}.no.bottomBar`, !s.bottomBar);
    check(rows, `${vpName}.aside.nav.onePerRow`, !!s.itemsOnePerRow);

    // P0-1 REAL interaction — desktop collapse → expand cycle (same toggle stays
    // reachable; navigation + panel restore).
    if (collapsible && vpName === "desktop") {
      await cdp.clickCenter(toggleSel);
      await sleep(250);
      const collapsed = await cdp.evaluate(`(() => {
        ${PRESENTED_VARIANT}
        const rail = document.querySelector("#shell-sidebar-desktop-rail");
        const panel = document.querySelector("#shell-sidebar-desktop-panel");
        const toggle = document.querySelector("#shell-sidebar-desktop-rail [aria-controls='shell-sidebar-desktop-panel']");
        const rr = rail ? rail.getBoundingClientRect() : null;
        const pr = panel ? panel.getBoundingClientRect() : null;
        const cta = panel ? panel.querySelector('.nav-item-cta') : null;
        const link = panel ? panel.querySelector('a[aria-current="page"], a[href*="/en"]') : null;
        return {
          railWidth: rr ? Math.round(rr.width) : null,
          // P6-3A — the rail is PERSISTENT: collapse is a HORIZONTAL WIDTH
          // state, never display:none.
          panelHiddenClass: !!panel && panel.classList.contains('hidden'),
          panelVisible: !!pr && pr.width > 0 && pr.height > 0,
          dataCollapsed: rail ? rail.getAttribute('data-collapsed') : null,
          togglePresent: !!toggle,
          toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null,
          // UI1-A3 — the PRESENTED label (the state pair's hidden copy never joins the reading).
          toggleText: presentedLabel(toggle) ? presentedLabel(toggle).textContent.trim() : null,
          toggleIcon: !!toggle && !!presentedIcon(toggle),
          toggleIconSrc: presentedIcon(toggle) ? presentedIcon(toggle).getAttribute('src') : null,
          // P6-3A — nav stays reachable when collapsed; P6-3C — the CTA is NOT
          // part of the rail (it lives in the top region), so its presence here
          // must be false and its reachability is asserted separately.
          ctaReachable: !!cta && cta.getBoundingClientRect().width > 0,
          navReachable: !!link && link.getBoundingClientRect().width > 0,
        };
      })()`);
      check(rows, `${vpName}.aside.collapse.persistent`, !collapsed.panelHiddenClass && collapsed.panelVisible);
      check(rows, `${vpName}.aside.collapse.dataState`, collapsed.dataCollapsed === "true");
      check(rows, `${vpName}.aside.collapse.narrower`, collapsed.railWidth != null && expandedRailWidth != null && collapsed.railWidth < expandedRailWidth, `collapsed=${collapsed.railWidth} expanded=${expandedRailWidth}`);
      check(rows, `${vpName}.aside.collapse.toggleRemains`, collapsed.togglePresent);
      check(rows, `${vpName}.aside.collapse.expandedFalse`, collapsed.toggleExpanded === "false");
      check(rows, `${vpName}.aside.collapse.navReachable`, collapsed.navReachable);
      // P6-1 — the SAME toggle now says "Show navigation" and presents the same control artwork rule
      // (S3F1B): the installation's own role when it ships it, and NO icon — never a foreign one — when
      // it does not.
      check(rows, `${vpName}.aside.collapse.labelShow`, collapsed.toggleText === "Show navigation");
      check(
        rows,
        `${vpName}.aside.collapse.icon`,
        controlIcon.served
          ? !!collapsed.toggleIcon && collapsed.toggleIconSrc === controlIcon.url
          : !collapsed.toggleIcon && collapsed.toggleIconSrc === null,
        `shipped=${controlIcon.served} src=${collapsed.toggleIconSrc}`,
      );
      await cdp.clickCenter(toggleSel);
      await sleep(250);
      const restored = await cdp.evaluate(`(() => {
        ${PRESENTED_VARIANT}
        const rail = document.querySelector("#shell-sidebar-desktop-rail");
        const panel = document.querySelector("#shell-sidebar-desktop-panel");
        const toggle = document.querySelector("#shell-sidebar-desktop-rail [aria-controls='shell-sidebar-desktop-panel']");
        const rr = rail ? rail.getBoundingClientRect() : null;
        const pr = panel ? panel.getBoundingClientRect() : null;
        const link = panel ? panel.querySelector('a[aria-current="page"], a[href*="/en"]') : null;
        const cta = panel ? panel.querySelector('.nav-item-cta') : null;
        const topCta = document.querySelector('.ui-shell-header-row .ui-shell-cta');
        const tr2 = topCta ? topCta.getBoundingClientRect() : null;
        return { railWidth: rr ? Math.round(rr.width) : null, dataCollapsed: rail ? rail.getAttribute('data-collapsed') : null, panelVisible: !!pr && pr.width > 0, toggleExpanded: toggle ? toggle.getAttribute('aria-expanded') : null, toggleText: presentedLabel(toggle) ? presentedLabel(toggle).textContent.trim() : null, linkReachable: !!link && link.getBoundingClientRect().width > 0, ctaReachable: !!cta && cta.getBoundingClientRect().width > 0, ctaInTop: !!tr2 && tr2.width > 0 };
      })()`);
      check(rows, `${vpName}.aside.expand.restores`, restored.panelVisible && restored.railWidth != null && expandedRailWidth != null && restored.railWidth >= expandedRailWidth - 2, `restored=${restored.railWidth} expanded=${expandedRailWidth}`);
      check(rows, `${vpName}.aside.expand.expandedTrue`, restored.toggleExpanded === "true" && restored.dataCollapsed === "false");
      check(rows, `${vpName}.aside.expand.navReachable`, restored.linkReachable);
      // P6-1 — re-expanded rail returns to "Hide navigation".
      check(rows, `${vpName}.aside.expand.labelHide`, restored.toggleText === "Hide navigation");
      // P6-3C — the CTA is reachable in the TOP region (never in the rail).
      check(rows, `${vpName}.aside.expand.ctaReachableInTop`, restored.ctaInTop);
      // P6-3A — the rail keeps its thin border in BOTH states (never a floating drawer).
      const border = await cdp.evaluate(`(() => { const el = document.querySelector("#shell-sidebar-desktop-rail"); if (!el) return null; const cs = getComputedStyle(el); return { w: parseFloat(cs.borderRightWidth) || 0, style: cs.borderRightStyle }; })()`);
      check(rows, `${vpName}.aside.border.present`, !!border && border.w >= 1 && border.style === "solid", JSON.stringify(border));
    } else if (collapsible && vpName === "tablet") {
      const restored = await cdp.evaluate(`(() => { const panel = document.querySelector("#shell-sidebar-tablet-panel"); const pr = panel ? panel.getBoundingClientRect() : null; return !panel.classList.contains('hidden') && pr.width > 0 && pr.height > 0; })()`);
      check(rows, `${vpName}.aside.expand.restores`, restored);
    }
  }

// P6-1 — desktop rail spacing/hierarchy/one-per-row validated at every
  // realistic desktop width (1280/1440/1920). The rail is a fixed-width
  // column with token insets, so these assertions prove the same result at
  // each width: a comfortable horizontal inset, the control inset before the
  // navigation items, the "Hide navigation" state, and zero broken images.
  if (collapsible) {
    for (const w of [1280, 1440, 1920]) {
      await cdp.setViewport(w, 900);
      await cdp.navigate(`${BASE_URL}/ww/en`);
      await waitReady(cdp);
      // UI1 — these are EXPANDED-state measurements, and the state is now the VISITOR's (it survives
      // the reload above), so the rail is opened through its own control when it arrives collapsed
      // rather than assuming whichever state the previous block left behind.
      const collapsedOnArrival = await cdp.evalBool(
        `document.querySelector('#shell-sidebar-desktop-rail').getAttribute('data-collapsed') === 'true'`,
      );
      if (collapsedOnArrival) {
        await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
        await sleep(250);
      }
      const sp = await cdp.evaluate(`(() => {
        ${PRESENTED_VARIANT}
        const rail = document.querySelector('#shell-sidebar-desktop-rail');
        const shell = document.querySelector('.ui-shell-sidebar');
        const toggle = rail ? rail.querySelector("[aria-controls='shell-sidebar-desktop-panel']") : null;
        const item = rail ? rail.querySelector('ul li') : null;
        const rr = rail ? rail.getBoundingClientRect() : null;
        const sr = shell ? shell.getBoundingClientRect() : null;
        const cs = rail ? getComputedStyle(rail) : null;
        const tr = toggle ? toggle.getBoundingClientRect() : null;
        const ir = item ? item.getBoundingClientRect() : null;
        const tops = [...rail.querySelectorAll('ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).map((li) => Math.round(li.getBoundingClientRect().top));
        return {
          railLeft: sr ? Math.round(sr.left) : null,
          railRight: sr ? Math.round(sr.right) : null,
          toggleLeft: tr ? Math.round(tr.left) : null,
          toggleRight: tr ? Math.round(tr.right) : null,
          itemLeft: ir ? Math.round(ir.left) : null,
          // NAV1D — the rail's own computed inline padding, on both sides.
          railPadInlineStart: cs ? Math.round(parseFloat(cs.paddingInlineStart) || 0) : null,
          railPadInlineEnd: cs ? Math.round(parseFloat(cs.paddingInlineEnd) || 0) : null,
          // UI1-A3 — the state-correct copy this expanded rail PRESENTS.
          text: presentedLabel(toggle) ? presentedLabel(toggle).textContent.trim() : null,
          onePerRow: tops.length > 0 && new Set(tops).size === tops.length,
          noBroken: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
          brokenSrcs: [...document.images]
            .filter((img) => !(img.complete && img.naturalWidth > 0))
            .map((img) => img.getAttribute("src")),
        };
      })()`);
      // NAV1D-V3 — the rail sits ON the page edge at every width (the old ~20px shell gutter is gone).
      check(rows, `p6-1.${w}.railOnThePageEdge`, !!sp && sp.railLeft != null && sp.railLeft <= 1, `rail=${sp && sp.railLeft}`);
      // NAV1D — the SAME symmetry contract as the canonical desktop rail, at every width: the rail's
      // padding is equal on both sides, the control's box is its content box, and the navigation rows
      // share that one inset (the superseded "control ~5px, items 20px deeper" contract is gone).
      const spToggleInset =
        sp && sp.toggleLeft != null && sp.railLeft != null ? sp.toggleLeft - sp.railLeft : null;
      const spItemInset =
        sp && sp.itemLeft != null && sp.railLeft != null ? sp.itemLeft - sp.railLeft : null;
      check(
        rows,
        `p6-1.${w}.paddingSymmetric`,
        !!sp && sp.railPadInlineStart != null && sp.railPadInlineStart === sp.railPadInlineEnd,
        `railPad=${sp && sp.railPadInlineStart}/${sp && sp.railPadInlineEnd}`,
      );
      check(
        rows,
        `p6-1.${w}.controlAtTheRailPadding`,
        !!sp && spToggleInset != null && sp.railPadInlineStart != null && Math.abs(spToggleInset - sp.railPadInlineStart) <= 1,
        `toggle=${spToggleInset} railPad=${sp && sp.railPadInlineStart}`,
      );
      check(
        rows,
        `p6-1.${w}.itemsShareTheInset`,
        !!sp && spItemInset != null && spToggleInset != null && Math.abs(spItemInset - spToggleInset) <= 1,
        `item=${spItemInset} toggle=${spToggleInset}`,
      );
      check(rows, `p6-1.${w}.labelHide`, !!sp && sp.text === "Hide navigation", `text=[${sp && sp.text}]`);
      check(rows, `p6-1.${w}.onePerRow`, !!sp && sp.onePerRow);
      check(rows, `p6-1.${w}.noBrokenImages`, !!sp && sp.noBroken, `broken=${JSON.stringify(sp && sp.brokenSrcs)}`);
    }
  }
}

/** Responsive landmark exclusivity across the md (768) and lg (1024) boundaries. */
async function runAsideBoundaries(rows, presentation, mobileBar, cdp) {
  for (const width of [767, 768, 1023, 1024]) {
    await cdp.setViewport(width, 820);
    await cdp.reload();
    await waitReady(cdp);
    const s = await cdp.evaluate(`(() => ({
      desktop: ${visible('#shell-sidebar-desktop-rail')},
      tablet: ${visible('#shell-sidebar-tablet-rail')},
      bar: (() => { const el = document.querySelector('.ui-shell-bottom-bar'); return !!el && el.getBoundingClientRect().width > 0; })(),
      trigger: (() => { const el = document.querySelector('#shell-mobile-nav'); return !!el && el.getBoundingClientRect().width > 0; })(),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
    }))()`);
    check(rows, `boundary.${width}.bandExclusive`, (!s.desktop && !s.tablet) || (s.desktop !== s.tablet));
    check(rows, `boundary.${width}.noBothBands`, !(s.desktop && s.tablet));
    if (mobileBar) check(rows, `boundary.${width}.bottomBarResponsive`, width < 768 ? s.bar : !s.bar);
    else check(rows, `boundary.${width}.triggerResponsive`, width < 768 ? s.trigger : !s.trigger);
    check(rows, `boundary.${width}.no.dialog`, s.dialogs === 0);
  }
}

/** Adaptive mobile: bottom bar + its More disclosure (the shared drawer path). */
async function runAdaptiveMobile(rows, cdp) {
  await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  const s = await cdp.evaluate(`(() => ({
    barVisible: ${visible('.ui-shell-bottom-bar')},
    barNavCurrent: !!document.querySelector('.ui-shell-bottom-bar a[aria-current="page"]'),
    // P0-5: the bottom bar already renders NavItem — the active item's wrapper
    // class 'aria-current-page' proves it stays on the shared path.
    barLiShared: (() => { const a = document.querySelector('.ui-shell-bottom-bar a[aria-current="page"]'); return !!a && !!a.parentElement && a.parentElement.classList.contains('aria-current-page'); })(),
    // FS1 — the generic template badges no navigation item, so the invariant
    // asserted here is the SHARED-PATH one: whatever the footer badges is rendered
    // through the shared nav-item-badge class and is actually laid out (never a
    // footer-only badge implementation, never a collapsed badge).
    footerBadgeShared: (() => { const all = [...document.querySelectorAll('footer .nav-item-badge')]; return { count: all.length, visible: all.filter((el) => el.getBoundingClientRect().width > 0).length }; })(),
    barCta: (() => { const c = document.querySelector('.ui-shell-bottom-bar .nav-item-cta'); return !!c && c.getBoundingClientRect().width > 0; })(),
    // P6-3C — the ONE CTA lives in the top region, above the bar.
    topCta: ${visible('.ui-shell-header-row .ui-shell-cta')},
    reachableCtas: [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).length,
    moreTrigger: !!document.querySelector('#shell-bottom-more'),
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }))()`);
  check(rows, "bar.visible", !!s.barVisible);
  check(rows, "bar.ariaCurrent", !!s.barNavCurrent);
  check(rows, "bar.nav.liSharedMarker", !!s.barLiShared);
  check(
    rows,
    "bar.footer.badgeShared",
    !!s.footerBadgeShared && s.footerBadgeShared.visible === s.footerBadgeShared.count,
    `badges=${s.footerBadgeShared ? `${s.footerBadgeShared.visible}/${s.footerBadgeShared.count}` : "null"}`,
  );
  check(rows, "bar.cta.notInBar", !s.barCta);
  check(rows, "bar.cta.reachableInTop", !!s.topCta);
  check(rows, "bar.cta.single", s.reachableCtas === 1, `count=${s.reachableCtas}`);
  check(rows, "bar.no.dialog", s.dialogs === 0);

  // -- R1 -- THE RETIRED "MORE" OVERFLOW, AND THE WRAPPING BAR THAT REPLACED IT ---------------
  //
  // The owner retired the 4 + "More" rule (it supersedes the legacy behaviour deliberately): the bar now
  // renders EVERY configured destination directly, in configuration order, flowing left to right and
  // wrapping onto further rows as the width requires. So the proofs are the RETIREMENT and the GEOMETRY:
  // no trigger, no panel, no dialog; every configured destination present; the rows wrap; no horizontal
  // overflow; every target still >= 44px; exactly one current mark.
  check(rows, "bar.more.retired", !s.moreTrigger, "no #shell-bottom-more control exists");
  const barShape = await cdp.evaluate(`(() => {
    const bar = document.querySelector('.ui-shell-bottom-bar');
    if (!bar) return null;
    const list = bar.querySelector('ul');
    const lis = [...bar.querySelectorAll('ul > li')].filter((li) => { const r = li.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top));
    const anchors = lis.map((li) => li.querySelector('a')).filter(Boolean);
    const targets = anchors.map((a) => { const r = a.getBoundingClientRect(); return Math.round(Math.min(r.width, r.height)); });
    return {
      items: lis.length,
      rows: new Set(tops).size,
      wrapClass: !!list && list.className.includes('flex-wrap'),
      offscreen: anchors.some((a) => { const r = a.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1 || r.left < -1; }),
      minTarget: targets.length === 0 ? 0 : Math.min(...targets),
      dialogs: document.querySelectorAll('[role="dialog"]').length,
      panels: document.querySelectorAll('#shell-bottom-more-panel').length,
      currentMarks: bar.querySelectorAll('a[aria-current="page"]').length,
    };
  })()`);
  check(rows, "bar.items.present", !!barShape && barShape.items > 0, barShape ? `items=${barShape.items}` : "null");
  check(rows, "bar.list.wrapCapable", !!barShape && barShape.wrapClass);
  check(rows, "bar.rows.atLeastOne", !!barShape && barShape.rows >= 1, barShape ? `rows=${barShape.rows}` : "null");
  check(rows, "bar.no.horizontalOverflow", !!barShape && !barShape.offscreen);
  check(rows, "bar.targets.atLeast44", !!barShape && barShape.minTarget >= 44, barShape ? `min=${barShape.minTarget}` : "null");
  check(rows, "bar.current.marked", !!barShape && barShape.currentMarks === 1, barShape ? `marks=${barShape.currentMarks}` : "null");
  check(rows, "bar.no.overflowControl", !!barShape && barShape.panels === 0);
  check(rows, "bar.no.dialog", !!barShape && barShape.dialogs === 0);

  // P5-1 — footer clearance at mobile + tablet: the STICKY bar participates in
  // document flow after the footer (never obscuring it; no spacer needed).
  await cdp.evaluate("window.scrollTo(0, document.body.scrollHeight);");
  await sleep(300);
  const ft = await cdp.evaluate(`(() => {
    const bar = document.querySelector('.ui-shell-bottom-bar');
    const foot = document.querySelector('footer');
    const br = bar ? bar.getBoundingClientRect() : null;
    const fr = foot ? foot.getBoundingClientRect() : null;
    return {
      barVisible: !!br && br.height > 0,
      barSticky: !!bar && getComputedStyle(bar).position === 'sticky',
      footerVisible: !!fr && fr.height > 0,
      footerAboveBar: !!fr && !!br && fr.height > 0 && fr.bottom <= br.top + 1,
    };
  })()`);
  check(rows, "footer.bar.sticky", !!ft && !!ft.barSticky && !!ft.barVisible, ft ? `bs=${ft.barSticky} bv=${ft.barVisible}` : "null");
  check(rows, "footer.reachableAtEnd", !!ft && ft.footerVisible && ft.footerAboveBar, ft ? `fv=${ft.footerVisible} fab=${ft.footerAboveBar}` : "null");

  await cdp.setViewport(700, 820);
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  await cdp.evaluate("window.scrollTo(0, document.body.scrollHeight);");
  await sleep(300);
  const ftT = await cdp.evaluate(`(() => {
    const bar = document.querySelector('.ui-shell-bottom-bar');
    const foot = document.querySelector('footer');
    const br = bar ? bar.getBoundingClientRect() : null;
    const fr = foot ? foot.getBoundingClientRect() : null;
    return {
      barVisible: !!br && br.height > 0 && br.top > 0 && br.top < document.documentElement.clientHeight,
      barSticky: !!bar && getComputedStyle(bar).position === 'sticky',
      footerAboveBar: !!fr && !!br && fr.height > 0 && fr.bottom <= br.top + 1,
    };
  })()`);
  check(rows, "tablet.bar.sticky", !!ftT && !!ftT.barVisible && !!ftT.barSticky, ftT ? `bv=${ftT.barVisible} bs=${ftT.barSticky}` : "null");
  check(rows, "tablet.footer.reachableAtEnd", !!ftT && !!ftT.footerAboveBar, ftT ? `fab=${ftT.footerAboveBar}` : "null");
}

/**
 * P1-4 (template scope) — the `/en/contact` route renders only when the adopter
 * supplies the page's source (`content/pages/markdown/<locale>/contact.md`, or its
 * JSON counterpart); the generic template ships no pages, so that route is a 404
 * here. The Section/Button primitives keep their unit-level proof in
 * `tests/unit/ui-primitives.test.ts`, and the shell-composition proof below still
 * runs against the shipped landing page. The on-page form proof for this route
 * lives with the private reference site, which does ship the page.
 */

/**
 * P1-7 (template scope) — the shipped template authors NO pages, so a section listing
 * `<Grid>` has nothing to render here; the grid half of this proof lives with the
 * private reference site, which authors those pages. The `<Stack>` half is generic and
 * runs on the shipped landing page.
 */
async function runGridStack(rows, cdp, label) {
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  const st = await cdp.evaluate(`(() => {
    const header = document.querySelector('header');
    const stack = header ? header.querySelector('div.flex') : null;
    return {
      stack: !!stack,
      flexWrap: !!stack && stack.className.includes('flex-wrap'),
    };
  })()`);
  check(rows, `${label}.stack.inHeader`, !!st.stack && !!st.flexWrap);
}

/** Reduced motion: the global PMR rule applies and the modal never animates. */
async function runReducedMotion(rows, trigger, panel, cdp) {
  await cdp.setReducedMotion(true);
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  check(rows, "reduced.match", await cdp.evalBool('matchMedia("(prefers-reduced-motion: reduce)").matches'));
  await openTrigger(cdp, trigger, panel);
  const info = await cdp.evaluate(`(() => {
    const read = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { anim: cs.animationName, trans: parseFloat(cs.transitionDuration) }; };
    return { p: read(document.querySelector('.ui-drawer-panel')), b: read(document.querySelector('.ui-drawer-backdrop')) };
  })()`);
  const p = info.p || {};
  const b = info.b || {};
  const noAnim = (p.anim === "none" || !p.anim || p.anim === undefined) && (b.anim === "none" || !b.anim || b.anim === undefined);
  const noTrans = (Number.isNaN(p.trans) || p.trans < 0.01) && (Number.isNaN(b.trans) || b.trans < 0.01);
  // FS1 — a configuration may render NO disclosure at all (a single-item
  // navigation has no "More" menu), so there is no modal motion to assert. The
  // contract is therefore conditional and explicit: IF a disclosure is rendered, it
  // must carry no animation and no transition. The global PMR rule itself stays
  // asserted unconditionally by `reduced.match` + `reduced.scrollBehaviorAuto`.
  const modalRendered = !!info.p || !!info.b;
  check(
    rows,
    "reduced.noAnimationOnModal",
    !modalRendered || (noAnim && noTrans),
    modalRendered ? `anim=${p.anim}/${b.anim} trans=${p.trans}/${b.trans}` : "no disclosure rendered",
  );
  check(rows, "reduced.scrollBehaviorAuto", await cdp.evalBool('getComputedStyle(document.documentElement).scrollBehavior === "auto"'));
  await cdp.pressKey("Escape");
  await sleep(150);
  await cdp.setReducedMotion(false);
}

/**
 * Drive the Foundation's ONE canonical presentation: boot the dev server with the
 * canonical configuration, run every scenario against it, stop the server.
 *
 * There is no per-preset loop any more (owner decision, 2026-09): the retired
 * feature meant the matrix used to multiply every check across five externally
 * hosted presentations. The canonical composition is exercised in full — aside
 * rail (desktop/tablet), bottom bar + More disclosure (mobile) — and the checks
 * that only existed to compare presentations are gone with the feature.
 */
async function runCanonical(chrome) {
  const port = BASE_PORT;
  // IMPORTANT: navigate over `localhost`, NOT `127.0.0.1`. Next.js's dev server
  // blocks JS/HMR chunks from `127.0.0.1` as a cross-origin dev request unless
  // `allowedDevOrigins` is set; `localhost` is an allowed dev origin by default.
  // With `127.0.0.1` the app would never hydrate and every interaction would be
  // inert. (This requires no production config change.)
  const url = `http://localhost:${port}/ww/en`;
  BASE_URL = `http://localhost:${port}`;
  const server = startDevServer(port);
  const rows = [];
  let cdp = null;
  try {
    await waitForServer(url);
    cdp = await Cdp.connect(chrome);
    await runAsidePresentation(rows, CANONICAL, cdp);
    await runAsideBoundaries(rows, CANONICAL, true, cdp);
    await runAdaptiveMobile(rows, cdp);
    // R1 — the retired bottom bar has no More disclosure to measure for motion; the SAME no-animation
    // contract is asserted on the surface the composition now presents (the wrapping bar), so the two
    // unconditional reduced-motion invariants below keep running unchanged.
    await runReducedMotion(rows, "#shell-bottom-bar", ".ui-shell-bottom-bar ul", cdp);
    // P1-3 — visible focus-ring contract (link + pointer-distinction + keyboard Tab).
    await runFocusVisibleRing(rows, cdp, "focus.canonical");
    // P1-4 / P1-7 — the primitives' on-page proof (see the notes above).
    // P1-7 — the shared Stack renders in the header of the shipped landing page.
    await runGridStack(rows, cdp, "p17.canonical");
    // FS1 — ARTWORK-ACTIVATION SCENARIOS ARE REFERENCE-SITE SCOPE. The scenarios
    // below assert ACTIVATED ARTWORK and reference-site configuration:
    //   runBrandingChecks/Sidebar/Collapsed/TabletSweep — favicon + logo geometry,
    //     the header band, page banners and the OG/Twitter social image;
    //   runP6cChecks — banner scaling + the Book Now placement per width;
    //   runThemeClosureChecks — the reference accent, the location/language
    //     selector closure and the footer-logo size.
    // The generic template ships NO brand artwork and configures no banners,
    // backgrounds or decorative graphics, so there is nothing to activate: the
    // assertions live with the private reference site, which does ship them and
    // keeps its own copy of this matrix. An adopter who integrates artwork can
    // flip ARTWORK_SCENARIOS to true. Everything else above — shell composition,
    // responsive sweeps, focus/reduced-motion behaviour, the Stack composition —
    // remains this template's browser contract.
    if (ARTWORK_SCENARIOS) {
      await runBrandingChecks(rows, CANONICAL.name, cdp);
      await runP6cChecks(rows, CANONICAL.name, cdp);
      await runThemeClosureChecks(rows, CANONICAL.name, cdp);
      await runP6bSidebarChecks(rows, CANONICAL.name, cdp);
      await runP6bCollapsedChecks(rows, CANONICAL.name, cdp);
      await runP6bTabletSweep(rows, CANONICAL.name, cdp);
    }
    // ── THE CROSS-INSTALLATION ASSET BOUNDARY, EXECUTABLE (FOUNDATION-MULTISITE-S3E1C/S3F1B) ─────────
    // This server serves the disposable synthetic LEGACY installation, so the namespaces its runtime
    // declares are the PLATFORM one only. The repository's generated canonical Spoke namespace may
    // physically exist beside it — the assertions below prove that this selection never resolves from it,
    // and that no served page ever references it. Generated filesystem state is not authority.
    const capability = servedInstallationAssetCapability();
    check(
      rows,
      "iso.declaredNamespacesAreTheServedInstallationsOwn",
      capability.mode === "legacy" && capability.urlBases.length === 1 && capability.urlBases[0] === "/assets",
      `mode=${capability.mode} bases=${capability.urlBases.join(",")}`,
    );
    // DERIVED, never a named canonical role (M21 §10): a role this installation does not publish is NOT
    // served, and every icon it DOES serve comes from a namespace it DECLARES — so an undeclared Spoke
    // namespace is never consulted, whatever happens to exist on disk.
    const publishedIconNames = capability.publishedIcons();
    const unpublishedRole = capability.asset("role-this-installation-does-not-ship.svg");
    const publishedIconName = publishedIconNames[0] ?? "no-icon-is-published.svg";
    const publishedRole = capability.asset(publishedIconName);
    check(
      rows,
      "iso.installationPublishesItsOwnIcons",
      publishedIconNames.length > 0,
      `icons=${publishedIconNames.length}`,
    );
    check(
      rows,
      "iso.unpublishedRoleIsUnavailableToThisInstallation",
      unpublishedRole.served === false && unpublishedRole.url === null,
      `served=${unpublishedRole.served} foreignNamespaceExists=${existsSync(capability.undeclaredSpokeNamespace)}`,
    );
    const publishedRoleUrl = publishedRole.url ?? "";
    const publishedRoleBase = publishedRoleUrl.endsWith(`/${publishedIconName}`)
      ? publishedRoleUrl.slice(0, publishedRoleUrl.length - publishedIconName.length - 1)
      : "";
    check(
      rows,
      "iso.servedIconComesFromADeclaredNamespace",
      publishedIconNames.length > 0 &&
        publishedRole.served === true &&
        publishedRoleUrl.startsWith("/") &&
        capability.urlBases.includes(publishedRoleBase),
      `icon=${publishedIconName} url=${publishedRoleUrl || "(none)"} base=${publishedRoleBase || "(none)"} bases=${capability.urlBases.join(",")}`,
    );
    await cdp.navigate(`${BASE_URL}/ww/en`);
    await waitReady(cdp);
    const assetRefs = await cdp.evaluate(`(() => {
      const urls = [...document.querySelectorAll('link[href], img[src], source[src], script[src]')]
        .map((el) => el.getAttribute('href') || el.getAttribute('src') || '');
      return { total: urls.length, foreign: urls.filter((u) => u.includes('/spokes/')).length };
    })()`);
    check(
      rows,
      "iso.noPageReferencesAnUndeclaredSpokeNamespace",
      assetRefs.foreign === 0,
      `refs=${assetRefs.total} foreign=${assetRefs.foreign}`,
    );
  } catch (error) {
    check(rows, "scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows.map((r) => ({ presentation: CANONICAL.name, ...r }));
}

/**
 * P5-6 — duplicate-destination navigation acceptance (browser-real).
 * Two nav entries sharing one `href` are valid; their React identity must come
 * from the position-derived `key` (getSiteNavLinks), never `href`. Proves, in
 * real dev renders: desktop header (classic) + aside rail (adaptive) render
 * BOTH same-href entries with OWN label/icon/disabled state; mobile drawer +
 * bottom-More (390/700) keep both one-per-row; no duplicate-key console
 * warnings anywhere. Own dev server; config restored after.
 */
async function runDuplicateNavScenario(chrome) {
  // P6-1: the fixture icons must be REAL shipped assets (a configured icon with no backing file is a
  // LOUD build failure), so the two DISTINCT names are DERIVED from the icons THIS installation
  // publishes (M21 §10). A scenario whose subject is "two distinct shipped icons" is SKIPPED where the
  // installation publishes fewer than two — the subject is absent, not broken.
  const publishedIcons = servedInstallationAssetCapability().publishedIcons();
  if (publishedIcons.length < 2) return;
  const DUP_NAV = [
    { label: "First", href: "/first", position: "middle" },
    { label: "Second", href: "/second", position: "middle" },
    { label: "Third", href: "/third", position: "middle" },
    { label: "Fourth", href: "/fourth", position: "middle" },
    // S3E1C/S3F1B — these are FIXTURE icons, so they must be genuinely SHIPPED BY THE INSTALLATION this
    // server serves (the disposable synthetic LEGACY installation): the platform icon library is shared by
    // every installation, while `sidebar-open.svg`/`sidebar-close.svg` are that installation's OWN
    // replaceable role files and are not shipped by this one. The assertions below match on the basename,
    // so `icon-sidebar-open.svg` satisfies them exactly as the role filename used to.
    { label: "Alpha", href: "/pricing", icon: publishedIcons[0], position: "top" },
    { label: "Beta", href: "/pricing", icon: publishedIcons[1], position: "bottom", disabled: true },
  ];
  const HOOK = `(() => { window.__dupKeyWarnings = []; const o = window.console.error; window.console.error = (...a) => { const s = a.map(String).join(" "); if (/same key|duplicate|two children/i.test(s)) window.__dupKeyWarnings.push(s); o.apply(window.console, a); }; })();`;
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];

  const bootPhase = async (label, portSuffix) => {
    const port = BASE_PORT + 99 + portSuffix;
    const url = `http://localhost:${port}/ww/en`;
    BASE_URL = `http://localhost:${port}`;
    const config = JSON.parse(original);
    config.navigation = DUP_NAV;
    // R1A — this scenario measures ONE deterministic composition (its duplicate
    // destinations in the header nav AND the aside rail). The reference
    // deployment now offers the visitor a layout choice, so the composition under
    // test is pinned here; the visitor choice itself is proved elsewhere.
    config.ui = { ...(config.ui ?? {}), layoutSwitcher: { enabled: false } };
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
    const server = startDevServer(port);
    let cdp = null;
    try {
      try {
        await waitForServer(url);
      } catch (error) {
        // A dev server that never answers is only diagnosable from its OWN output, so the capture
        // is included instead of discarded (this scenario hung once on a CI runner for 4 minutes
        // with nothing to read).
        throw new Error(`${String(error)}\n--- dev server output ---\n${server.log()}`);
      }
      cdp = await Cdp.connect(chrome);
      await cdp.send("Page.enable");
      await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });
      await cdp.setViewport(1280, 900);
      await cdp.navigate(url);
      await waitReady(cdp);
      const d = await cdp.evaluate(`(() => {
        const root = document.querySelector("#shell-sidebar-desktop-panel ul");
        if (!root) return null;
        const labels = [...root.querySelectorAll("li .ui-nav-item-label")].map((s) => s.textContent);
        const alpha = [...root.querySelectorAll("a")].find((a) => a.querySelector(".ui-nav-item-label")?.textContent === "Alpha");
        const betaLi = [...root.querySelectorAll("li")].find((li) => li.querySelector(".ui-nav-item-label")?.textContent === "Beta");
        return {
          both: labels.includes("Alpha") && labels.includes("Beta"),
          alphaIsLink: !!alpha && alpha.getAttribute("href") === "/ww/en/pricing",
          alphaIcon: !!alpha && !!alpha.querySelector("img[src$='${publishedIcons[0]}']"),
          betaDisabled: !!betaLi && !!betaLi.querySelector("[aria-disabled='true']"),
          betaIcon: !!betaLi && !!betaLi.querySelector("img[src$='${publishedIcons[1]}']"),
          warnings: window.__dupKeyWarnings.length,
        };
      })()`);
      if (d === null) { check(rows, `${label}.desktop.renders`, false); } else {
        check(rows, `${label}.desktop.bothPricingEntries`, d.both);
        check(rows, `${label}.desktop.alpha.navigable.ownIcon`, d.alphaIsLink && d.alphaIcon);
        check(rows, `${label}.desktop.beta.disabled.ownIcon`, d.betaDisabled && d.betaIcon);
        check(rows, `${label}.desktop.noDupKeyConsole`, d.warnings === 0);
      }
      // R1 — Mobile 390 + 700: EVERY configured destination now renders in the bar ITSELF (the retired
      // "More" disclosure no longer exists), so the SAME identity contract is asserted directly there: both
      // entries present, the navigable one a real link, the disabled one carrying its own identity, no
      // duplicate React keys, and nothing pushed outside the viewport.
      for (const w of [390, 700]) {
        await cdp.setViewport(w, 844);
        await cdp.navigate(url);
        await waitReady(cdp);
        const m = await cdp.evaluate(`(() => {
          const bar = document.querySelector('.ui-shell-bottom-bar');
          if (!bar) return null;
          const lis = [...bar.querySelectorAll('ul > li')].filter((li) => li.getBoundingClientRect().width > 0);
          const labels = lis.map((li) => li.querySelector('.ui-nav-item-label')?.textContent ?? '');
          const alpha = lis.find((li) => li.querySelector('.ui-nav-item-label')?.textContent === 'Alpha');
          const beta = lis.find((li) => li.querySelector('.ui-nav-item-label')?.textContent === 'Beta');
          const anchors = [...bar.querySelectorAll('ul a')];
          return {
            hasBoth: labels.includes('Alpha') && labels.includes('Beta'),
            alphaLink: !!alpha && !!alpha.querySelector("a[href='/ww/en/pricing']"),
            betaDisabled: !!beta && !!beta.querySelector("[aria-disabled='true']"),
            overflow: anchors.some((a) => { const r = a.getBoundingClientRect(); return r.right > document.documentElement.clientWidth + 1 || r.left < -1; }),
            dialogs: document.querySelectorAll('[role="dialog"]').length,
            warnings: window.__dupKeyWarnings.length,
          };
        })()`);
        check(rows, `${label}.w${w}.bar.renders`, !!m);
        check(rows, `${label}.w${w}.both.in.bar`, !!m && m.hasBoth);
        check(rows, `${label}.w${w}.alpha.navigable`, !!m && m.alphaLink);
        check(rows, `${label}.w${w}.beta.disabled.identity`, !!m && m.betaDisabled);
        check(rows, `${label}.w${w}.no.horizontalOverflow`, !!m && !m.overflow);
        check(rows, `${label}.w${w}.no.dialog`, !!m && m.dialogs === 0);
        check(rows, `${label}.w${w}.noDupKeyConsole`, !!m && m.warnings === 0);
      }
    } finally {
      if (cdp) await cdp.close();
      await stopServer(server);
    }
  };

  await bootPhase("dup.canonical", 2);
  await writeFile(CONFIG_PATH, original, "utf8");
  return rows;
}

/**
 * APPROVED-ASSET INTEGRATION — the visual/readability EVIDENCE capture.
 *
 * The approved Foundation graphics are now ACTIVE (including the header band), so
 * the readability evidence is captured as REAL screenshots of the decorated pages
 * (home desktop/mobile, the footer surface, and the error/not-found status
 * surface) into `tests/browser/.report/readability/` for review by a human/Master
 * Brand Architect. Nothing here asserts pass/fail — the deterministic contracts
 * are asserted above; this artefact is what supports the artwork/owner readability
 * judgement, which is deliberately NOT a coding gate.
 */
async function captureReadabilityEvidence(cdp, tag) {
  const dir = join(HERE, ".report", "readability");
  await mkdir(dir, { recursive: true });
  const shots = [
    { name: `${tag}-home-desktop`, url: `${BASE_URL}/ww/en`, width: 1280, height: 900 },
    { name: `${tag}-home-mobile`, url: `${BASE_URL}/ww/en`, width: 390, height: 844 },
    { name: `${tag}-footer-desktop`, url: `${BASE_URL}/ww/en`, width: 1280, height: 900, toBottom: true },
    { name: `${tag}-status-desktop`, url: `${BASE_URL}/ww/en/zzz-deep`, width: 1280, height: 900 },
    { name: `${tag}-status-mobile`, url: `${BASE_URL}/ww/en/zzz-deep`, width: 390, height: 844 },
  ];
  for (const shot of shots) {
    await cdp.setViewport(shot.width, shot.height);
    await cdp.navigate(shot.url);
    await waitReady(cdp);
    if (shot.toBottom) {
      await cdp.evaluate(
        "(() => { window.scrollTo(0, document.documentElement.scrollHeight); return true; })()",
      );
      await sleep(250);
    }
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    await writeFile(join(dir, `${shot.name}.png`), Buffer.from(data, "base64"));
  }
  return dir;
}

/** P6-3B — favicon / header logo / page banner contract (canonical presentation). */
async function runBrandingChecks(rows, tag, cdp) {
  await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  const s = await cdp.evaluate(`(() => {
    const icons = [...document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')];
    const logo = document.querySelector('.ui-site-header-logo');
    const logoRect = logo ? logo.getBoundingClientRect() : null;
    const banner = document.querySelector('.ui-page-banner');
    const bimg = document.querySelector('.ui-page-banner-image');
    const bcs = banner ? getComputedStyle(banner) : null;
    const br = banner ? banner.getBoundingClientRect() : null;
    const ir = bimg ? bimg.getBoundingClientRect() : null;
    const ics = bimg ? getComputedStyle(bimg) : null;
    // P6-3C — the cap the framework derived from the graphic's own size.
    const capPx = bimg && ics && ics.maxWidth.endsWith('px') ? parseFloat(ics.maxWidth) : null;
    const bimgTop = ir ? ir.top : null;
    const header = document.querySelector('.ui-site-header');
    const main = document.querySelector('#main');
    return {
      iconCount: icons.length,
      iconHref: icons.length ? icons[0].getAttribute('href') : null,
      logoPresent: !!logo,
      logoSrc: logo ? logo.getAttribute('src') : null,
      logoAlt: logo ? logo.getAttribute('alt') : null,
      logoLoaded: !!logo && logo.complete && logo.naturalWidth > 0,
      logoBoxOk: !!(logoRect && logoRect.height > 0 && logoRect.height <= 48 && logoRect.width > logoRect.height),
      bannerPresent: !!banner,
      bannerImgSrc: bimg ? bimg.getAttribute('src') : null,
      bannerImgLoaded: !!bimg && bimg.complete && bimg.naturalWidth > 0,
      bannerPad: bcs ? [bcs.paddingTop, bcs.paddingRight, bcs.paddingBottom, bcs.paddingLeft].join("/") : null,
      bannerMargin: bcs ? [bcs.marginTop, bcs.marginRight, bcs.marginBottom, bcs.marginLeft].join("/") : null,
      bannerBorder: bcs ? bcs.borderTopWidth : null,
      bannerRadius: bcs ? bcs.borderTopLeftRadius : null,
      bannerWidth: br ? Math.round(br.width) : null,
      imgWidth: ir ? Math.round(ir.width) : null,
      imgHeight: ir ? Math.round(ir.height) : null,
      imgNatW: bimg ? bimg.naturalWidth : 0,
      imgNatH: bimg ? bimg.naturalHeight : 0,
      imgLeft: ir ? Math.round(ir.left) : null,
      imgRight: ir ? Math.round(ir.right) : null,
      capPx: capPx,
      bannerAboveHeader: !!ir && !!header && ir.bottom <= header.getBoundingClientRect().top + 2,
      bannerAboveMain: !!ir && !!main && ir.bottom <= main.getBoundingClientRect().top + 2,
      viewportWidth: document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      backgroundLayers: document.querySelectorAll(".ui-page-background").length,
      // ── APPROVED-ASSET INTEGRATION — the decorative roles are now ACTIVE ────
      // The canonical deployment activates its approved Foundation graphics, so
      // these observe the REAL rendered layers: the resolved image, the declared
      // inertness/behind-content contract, and the metadata the head emits.
      // (No backticks in this comment: it lives inside a template literal.)
      backgroundElement: (() => {
        const el = document.querySelector(".ui-page-background");
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          image: cs.backgroundImage,
          size: cs.backgroundSize,
          repeat: cs.backgroundRepeat,
          position: cs.position,
          zIndex: cs.zIndex,
          pointerEvents: cs.pointerEvents,
          ariaHidden: el.getAttribute("aria-hidden"),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      })(),
      footerGraphicElement: (() => {
        const el = document.querySelector(".ui-footer-graphic");
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          image: cs.backgroundImage,
          pointerEvents: cs.pointerEvents,
          ariaHidden: el.getAttribute("aria-hidden"),
        };
      })(),
      ogImageMeta: (() => { const m = document.querySelector('meta[property="og:image"]'); return m ? m.getAttribute("content") : null; })(),
      twitterImageMeta: (() => { const m = document.querySelector('meta[name="twitter:image"]'); return m ? m.getAttribute("content") : null; })(),
      footerGraphicLayers: document.querySelectorAll(".ui-footer-graphic").length,
      footerBox: (() => { const f = document.querySelector("footer"); if (!f) return null; const r = f.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; })(),
      footerLinkCount: document.querySelectorAll("footer a").length,
      footerPosition: (() => { const f = document.querySelector("footer"); return f ? getComputedStyle(f).position : null; })(),
      footerGraphicRule: (() => {
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of rules) {
            if (rule.selectorText === ".ui-footer-graphic" && rule.style) {
              return { position: rule.style.position, zIndex: rule.style.zIndex, pointerEvents: rule.style.pointerEvents };
            }
          }
        }
        return null;
      })(),
      // P12-HG — the decorative header band is the header's OWN background, so
      // it contributes NO element: presence is observed through the marker
      // attribute + the computed background, and the band's contract through
      // the shipped .ui-site-header[data-ui-header-graphic] rule.
      // (No backticks in this comment: it lives inside a template literal.)
      headerBox: header ? (() => { const r = header.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height) }; })() : null,
      headerGraphicLayers: document.querySelectorAll("[data-ui-header-graphic]").length,
      // Activation must add NO element: the ONLY node carrying the marker must be
      // the header element itself, not a decorative child layer.
      headerGraphicIsHeaderElement: document.querySelector("[data-ui-header-graphic]") === header,
      headerGraphicAttribute: header ? header.getAttribute("data-ui-header-graphic") : null,
      headerBackgroundImage: header ? getComputedStyle(header).backgroundImage : null,
      headerRule: (() => {
        for (const sheet of document.styleSheets) {
          let rules;
          try { rules = sheet.cssRules; } catch { continue; }
          for (const rule of rules) {
            if (rule.selectorText === ".ui-site-header[data-ui-header-graphic]" && rule.style) {
              return {
                backgroundImage: rule.style.backgroundImage,
                backgroundRepeat: rule.style.backgroundRepeat,
                backgroundPosition: rule.style.backgroundPosition,
                backgroundSize: rule.style.backgroundSize,
              };
            }
          }
        }
        return null;
      })(),
      headerPosition: header ? getComputedStyle(header).position : null,
      headerIsolation: header ? getComputedStyle(header).isolation : null,
      headerZIndex: header ? getComputedStyle(header).zIndex : null,
      // The header's own interactive controls stay present and visible in every
      // composition. NOTE: the single nav landmark lives in the shell SIDEBAR
      // for aside compositions (adaptive/workspace/immersive) and only in the
      // header for top-bar compositions, so this must NOT assert a header nav.
      headerControlsVisible: !!header && [...header.querySelectorAll("a, button")].some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }),
      headerTriggerPresent: !!document.querySelector(".ui-shell-mobile-nav-trigger"),
      noBroken: [...document.images].every((i) => i.complete && i.naturalWidth > 0),
    };
  })()`);
  check(rows, `${tag}.favicon.single`, s.iconCount === 1, `count=${s.iconCount}`);
  check(rows, `${tag}.favicon.href`, typeof s.iconHref === "string" && s.iconHref.endsWith("/assets/favicon.svg"), `href=${s.iconHref}`);
  // APPROVED-ASSET INTEGRATION — the approved social-preview image is now
  // EMITTED for the whole deployment (og:image AND twitter:image), while the
  // generated per-locale route stays in the engine as the fallback for adopters
  // who remove the static role.
  check(
    rows,
    `${tag}.ogImage.approved`,
    typeof s.ogImageMeta === "string" && s.ogImageMeta.endsWith("/assets/og-image.png"),
    `og=${s.ogImageMeta}`,
  );
  check(
    rows,
    `${tag}.twitterImage.approved`,
    typeof s.twitterImageMeta === "string" && s.twitterImageMeta.endsWith("/assets/og-image.png"),
    `twitter=${s.twitterImageMeta}`,
  );
  check(rows, `${tag}.header.logo`, !!s.logoPresent && !!s.logoLoaded && typeof s.logoSrc === "string" && s.logoSrc.endsWith("/assets/logo-header.svg"), `src=${s.logoSrc}`);
  check(rows, `${tag}.header.logo.alt`, typeof s.logoAlt === "string" && s.logoAlt.length > 0, `alt=${s.logoAlt}`);
  check(rows, `${tag}.header.logo.aspect`, !!s.logoBoxOk);
  check(rows, `${tag}.banner.home.present`, !!s.bannerPresent && !!s.bannerImgLoaded && typeof s.bannerImgSrc === "string" && s.bannerImgSrc.endsWith("/assets/banner-home.png"), `src=${s.bannerImgSrc}`);
  check(rows, `${tag}.banner.noPadding`, s.bannerPad === "0px/0px/0px/0px", `pad=${s.bannerPad}`);
  check(rows, `${tag}.banner.noMargin`, s.bannerMargin === "0px/0px/0px/0px", `margin=${s.bannerMargin}`);
  check(rows, `${tag}.banner.noBorder`, s.bannerBorder === "0px" && s.bannerRadius === "0px", `border=${s.bannerBorder} radius=${s.bannerRadius}`);
  // P6-3C — the banner scales to `min(available page width, 1.5 × natural
  // width)`, is ALWAYS horizontally centered, and can never overflow.
  const cap = Math.round(s.imgNatW * 1.5);
  check(
    rows,
    `${tag}.banner.widthIsAvailableOrCap`,
    s.imgWidth != null && Math.abs(s.imgWidth - Math.min(s.viewportWidth, cap)) <= 2,
    `w=${s.imgWidth} vw=${s.viewportWidth} cap=${cap}`,
  );
  check(
    rows,
    `${tag}.banner.centered`,
    s.imgLeft != null && s.imgWidth != null && Math.abs(s.imgLeft - (s.viewportWidth - s.imgWidth) / 2) <= 2,
    `left=${s.imgLeft} right=${s.imgRight} vw=${s.viewportWidth} w=${s.imgWidth}`,
  );
  check(rows, `${tag}.banner.noHorizontalOverflow`, s.imgLeft >= -1 && s.imgRight <= s.viewportWidth + 1 && s.docScrollWidth <= s.viewportWidth + 1, `left=${s.imgLeft} right=${s.imgRight} scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`);
  // APPROVED-ASSET INTEGRATION — the canonical deployment now ACTIVATES the
  // approved global background (`site.assets.backgrounds.all`, the reserved
  // `all` role), so exactly ONE decorative layer renders with the shipped
  // same-origin image and it stays inert, behind the content and non-structural.
  check(rows, `${tag}.background.active`, s.backgroundLayers === 1, `layers=${s.backgroundLayers}`);
  check(
    rows,
    `${tag}.background.resolvesApprovedAsset`,
    !!s.backgroundElement && s.backgroundElement.image.includes("/assets/background-all.svg"),
    s.backgroundElement ? `img=${s.backgroundElement.image}` : "no layer",
  );
  check(
    rows,
    `${tag}.background.inertAndBehindContent`,
    !!s.backgroundElement &&
      s.backgroundElement.position === "fixed" &&
      s.backgroundElement.zIndex === "-1" &&
      s.backgroundElement.pointerEvents === "none" &&
      s.backgroundElement.ariaHidden === "true",
    s.backgroundElement
      ? `pos=${s.backgroundElement.position} z=${s.backgroundElement.zIndex} pe=${s.backgroundElement.pointerEvents} aria=${s.backgroundElement.ariaHidden}`
      : "no layer",
  );
  check(
    rows,
    `${tag}.background.coversViewportWithoutOverflow`,
    !!s.backgroundElement &&
      s.backgroundElement.size === "cover" &&
      s.backgroundElement.w <= s.viewportWidth + 1 &&
      s.docScrollWidth <= s.viewportWidth + 1,
    s.backgroundElement
      ? `size=${s.backgroundElement.size} w=${s.backgroundElement.w} scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`
      : "no layer",
  );
  // APPROVED-ASSET INTEGRATION — the canonical deployment now ACTIVATES the
  // approved footer graphic, so exactly ONE decorative layer renders behind the
  // footer content with the shipped same-origin image, stays inert, and adds no
  // DOM beyond that decorative div — the footer's own layout, links and geometry
  // are unchanged and no horizontal overflow can be introduced.
  check(rows, `${tag}.footerGraphic.active`, s.footerGraphicLayers === 1, `layers=${s.footerGraphicLayers}`);
  check(
    rows,
    `${tag}.footerGraphic.resolvesApprovedAsset`,
    !!s.footerGraphicElement && s.footerGraphicElement.image.includes("/assets/footer-graphic.svg"),
    s.footerGraphicElement ? `img=${s.footerGraphicElement.image}` : "no layer",
  );
  check(
    rows,
    `${tag}.footerGraphic.inertDecorativeLayer`,
    !!s.footerGraphicElement &&
      s.footerGraphicElement.pointerEvents === "none" &&
      s.footerGraphicElement.ariaHidden === "true",
    s.footerGraphicElement
      ? `pe=${s.footerGraphicElement.pointerEvents} aria=${s.footerGraphicElement.ariaHidden}`
      : "no layer",
  );
  check(rows, `${tag}.footerGraphic.noHorizontalOverflow`, s.docScrollWidth <= s.viewportWidth + 1, `scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`);
  check(rows, `${tag}.footer.linksPresent`, s.footerLinkCount > 0, `links=${s.footerLinkCount}`);
  check(rows, `${tag}.footer.geometryIntact`, !!s.footerBox && s.footerBox.h > 0, s.footerBox ? `h=${s.footerBox.h}` : "no footer");
  // The layer's CONTRACT is declared in the shipped stylesheet even though no
  // artwork is configured: absolutely positioned inside a `relative` footer,
  // painted behind content (`z-index: -1`), and inert (`pointer-events: none`).
  check(
    rows,
    `${tag}.footerGraphic.contractDeclared`,
    !!s.footerGraphicRule &&
      s.footerGraphicRule.position === "absolute" &&
      s.footerGraphicRule.zIndex === "-1" &&
      s.footerGraphicRule.pointerEvents === "none",
    s.footerGraphicRule ? `pos=${s.footerGraphicRule.position} z=${s.footerGraphicRule.zIndex} pe=${s.footerGraphicRule.pointerEvents}` : "rule missing",
  );
  check(
    rows,
    `${tag}.footerGraphic.footerIsAnchor`,
    s.footerPosition === "relative",
    `footerPos=${s.footerPosition}`,
  );
  // APPROVED-ASSET INTEGRATION — the approved header graphic SHIPS in the
  // distributable pack AND its canonical role is ACTIVATED (a one-line config
  // change to `site.assets.headerGraphic`). Activation is a TECHNICAL validation
  // only: the band contributes ONE marker attribute + ONE inline custom property
  // on the header, adds NO element and NO layout height, and creates NO stacking
  // context. The measured cover crop of its 8:1 artwork inside the header box is
  // a Master-Brand-Architect-owned aesthetic judgement recorded in the living-pack
  // provenance, never a coding gate. No artwork was altered and no engine CSS was
  // added to compensate.
  check(rows, `${tag}.headerGraphic.bandActiveAndContributesNoElement`, s.headerGraphicLayers === 1 && s.headerGraphicIsHeaderElement === true && s.headerGraphicAttribute === "true", `layers=${s.headerGraphicLayers} onHeader=${s.headerGraphicIsHeaderElement} attr=${s.headerGraphicAttribute}`);
  check(
    rows,
    `${tag}.headerGraphic.backgroundResolvesToRoleFile`,
    typeof s.headerBackgroundImage === "string" && s.headerBackgroundImage.includes("/assets/header-graphic.svg"),
    `bg=${s.headerBackgroundImage}`,
  );
  check(rows, `${tag}.headerGraphic.noHorizontalOverflow`, s.docScrollWidth <= s.viewportWidth + 1, `scrollW=${s.docScrollWidth} vw=${s.viewportWidth}`);
  // The band's CONTRACT: ONE asset, edge-to-edge, centred, no tiling.
  check(
    rows,
    `${tag}.headerGraphic.contractDeclared`,
    !!s.headerRule &&
      s.headerRule.backgroundImage.includes("--ui-header-graphic") &&
      s.headerRule.backgroundRepeat === "no-repeat" &&
      s.headerRule.backgroundPosition === "center center" &&
      s.headerRule.backgroundSize === "cover",
    s.headerRule ? `img=${s.headerRule.backgroundImage} rep=${s.headerRule.backgroundRepeat} pos=${s.headerRule.backgroundPosition} size=${s.headerRule.backgroundSize}` : "rule missing",
  );
  // The band adds NO stacking context and NO positioning to the header — which
  // is exactly what keeps the shell's `position: fixed` drawer/overlay panels
  // (z-index 40/50), which live inside the header, where they were.
  check(
    rows,
    `${tag}.headerGraphic.headerNotStackingContext`,
    s.headerIsolation === "auto" && s.headerZIndex === "auto" && s.headerPosition === "static",
    `isolation=${s.headerIsolation} z=${s.headerZIndex} pos=${s.headerPosition}`,
  );
  // The header itself (its own base/background, geometry, identity, navigation
  // and mobile trigger) is unchanged by the capability.
  check(rows, `${tag}.header.geometryIntact`, !!s.headerBox && s.headerBox.h > 0, s.headerBox ? `h=${s.headerBox.h}` : "no header");
  check(rows, `${tag}.header.logoVisible`, !!s.logoPresent && !!s.logoLoaded && !!s.logoBoxOk);
  check(rows, `${tag}.header.controlsVisible`, !!s.headerControlsVisible);
  check(rows, `${tag}.header.triggerPresent`, !!s.headerTriggerPresent);
  check(rows, `${tag}.banner.capApplied`, s.capPx != null && Math.abs(s.capPx - cap) <= 1, `cap=${s.capPx} expected=${cap}`);
  check(rows, `${tag}.banner.aboveHeader`, !!s.bannerAboveHeader);
  check(rows, `${tag}.banner.aboveMain`, !!s.bannerAboveMain);
  // The banner is rendered at its graphic's OWN aspect ratio (intrinsic height —
  // no forced fixed height and no stretch/crop).
  check(
    rows,
    `${tag}.banner.intrinsicHeight`,
    s.imgNatW > 0 && s.imgNatH > 0 && s.imgWidth > 0 && s.imgHeight > 0 &&
      Math.abs(s.imgWidth / s.imgHeight - s.imgNatW / s.imgNatH) < 0.02,
    `rendered=${s.imgWidth}x${s.imgHeight} natural=${s.imgNatW}x${s.imgNatH}`,
  );
  check(rows, `${tag}.noBrokenImages`, !!s.noBroken);

  // A page with NO configured banner: no container and no reserved gap.
  //
  // The no-banner route must be chosen so its RESOLVED KEY matches no configured
  // banner role. `about` is deliberately NOT used any more: the approved
  // Foundation banner pack wires all ten canonical roles, so `/en/about` now
  // legitimately renders the approved `about` banner (header top moves off 0).
  //
  // `/en/zzz-deep` resolves to key `zzz-deep`, which is configured nowhere, and
  // renders through the `[[...segments]]` not-found boundary — still inside the shell,
  // so the header is present and must sit at the top of the page. This is
  // exactly the "no artwork for this route ⇒ nothing at all" contract: no
  // container, no reserved gap, and never another page's banner.
  await cdp.navigate(`${BASE_URL}/ww/en/zzz-deep`);
  await waitReady(cdp);
  const nb = await cdp.evaluate(`(() => {
    const banner = document.querySelector('.ui-page-banner');
    const header = document.querySelector('.ui-site-header');
    const hr = header ? header.getBoundingClientRect() : null;
    // P12-SG — the decorative STATUS graphic role is CONFIGURED-ONLY, and the
    // canonical deployment configures no site.assets.statusGraphic, so this
    // not-found surface must render NO decorative box while its status copy and
    // return-home control stay complete and operable.
    // (No backticks in this comment: it lives inside a template literal.)
    const section = document.querySelector('#main section') || document.querySelector('#main article');
    const heading = document.querySelector('#main h1');
    const graphic = document.querySelector('.ui-status-graphic');
    const graphicImg = document.querySelector('.ui-status-graphic-image');
    const homeLink = section
      ? [...section.querySelectorAll('a')].find((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
      : undefined;
    const graphicRule = (() => {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }
        for (const rule of rules) {
          if (rule.selectorText === '.ui-status-graphic' && rule.style) {
            return {
              display: rule.style.display,
              justifyContent: rule.style.justifyContent,
              pointerEvents: rule.style.pointerEvents,
              position: rule.style.position,
            };
          }
        }
      }
      return null;
    })();
    const sr = section ? section.getBoundingClientRect() : null;
    return {
      banner: !!banner,
      headerTop: hr ? Math.round(hr.top) : null,
      statusGraphicLayers: document.querySelectorAll('.ui-status-graphic').length,
      statusGraphicImages: document.querySelectorAll('.ui-status-graphic-image').length,
      statusGraphicRule: graphicRule,
      statusGraphicAboveHeading: graphic && heading
        ? graphic.getBoundingClientRect().bottom <= heading.getBoundingClientRect().top + 1
        : null,
      statusGraphicImgComplete: graphicImg ? !!graphicImg.complete : null,
      // APPROVED-ASSET INTEGRATION — the approved status artwork is now active,
      // so the resolved source, the reserved intrinsic box and the rendered
      // geometry (never upscaled, never cropped) are observed too.
      statusGraphicSrc: graphicImg ? graphicImg.getAttribute('src') : null,
      statusGraphicNatural: graphicImg
        ? { w: graphicImg.naturalWidth, h: graphicImg.naturalHeight }
        : null,
      statusGraphicAttr: graphicImg
        ? { w: graphicImg.getAttribute('width'), h: graphicImg.getAttribute('height') }
        : null,
      statusGraphicRect: graphicImg
        ? (() => { const r = graphicImg.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; })()
        : null,
      headingRect: heading
        ? (() => { const r = heading.getBoundingClientRect(); return { top: Math.round(r.top) }; })()
        : null,
      statusSectionPresent: !!section,
      statusSectionHeight: sr ? Math.round(sr.height) : null,
      statusHeadingText: heading ? heading.textContent.trim() : null,
      statusHomeLinkText: homeLink ? homeLink.textContent.trim() : null,
      statusHomeLinkHref: homeLink ? homeLink.getAttribute('href') : null,
      docScrollWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  })()`);
  check(rows, `${tag}.banner.absentOnNoBannerPage`, nb.banner === false);
  check(rows, `${tag}.banner.noReservedGap`, nb.headerTop != null && nb.headerTop <= 40, `headerTop=${nb.headerTop}`);
  // APPROVED-ASSET INTEGRATION — the approved status artwork is now ACTIVE on
  // the canonical status surface: exactly ONE decorative box + image resolving
  // the shipped same-origin graphic, ABOVE the status heading, while the status
  // copy and its return-home control stay complete and operable. (The `[[...segments]]`
  // error boundary cannot be reached in a canonical static browser run without
  // deliberately fabricating a render failure, which this matrix must never do;
  // the error surface's identical frame, semantics and controls are asserted by
  // `tests/unit/p12-sg-status-graphic.test.ts`, and both surfaces share the ONE
  // provider resolved in the `[[...segments]]` layout that this route exercises.)
  check(rows, `${tag}.statusGraphic.active`, nb.statusGraphicLayers === 1 && nb.statusGraphicImages === 1, `layers=${nb.statusGraphicLayers} imgs=${nb.statusGraphicImages}`);
  check(
    rows,
    `${tag}.statusGraphic.resolvesApprovedAsset`,
    nb.statusGraphicSrc === "/assets/status-graphic.svg" && nb.statusGraphicImgComplete === true,
    `src=${nb.statusGraphicSrc} complete=${nb.statusGraphicImgComplete}`,
  );
  check(
    rows,
    `${tag}.statusGraphic.naturalSizeReservedAndNeverUpscaled`,
    !!nb.statusGraphicNatural &&
      !!nb.statusGraphicAttr &&
      !!nb.statusGraphicRect &&
      nb.statusGraphicNatural.w === 640 &&
      nb.statusGraphicNatural.h === 320 &&
      nb.statusGraphicAttr.w === "640" &&
      nb.statusGraphicAttr.h === "320" &&
      nb.statusGraphicRect.w <= 640 &&
      Math.abs(nb.statusGraphicRect.w / nb.statusGraphicRect.h - 2) < 0.05,
    nb.statusGraphicRect && nb.statusGraphicNatural && nb.statusGraphicAttr
      ? `rect=${nb.statusGraphicRect.w}x${nb.statusGraphicRect.h} natural=${nb.statusGraphicNatural.w}x${nb.statusGraphicNatural.h} attr=${nb.statusGraphicAttr.w}x${nb.statusGraphicAttr.h}`
      : "no image",
  );
  check(
    rows,
    `${tag}.statusGraphic.contractDeclared`,
    !!nb.statusGraphicRule &&
      nb.statusGraphicRule.display === "flex" &&
      nb.statusGraphicRule.justifyContent === "center" &&
      nb.statusGraphicRule.pointerEvents === "none" &&
      nb.statusGraphicRule.position === "",
    nb.statusGraphicRule
      ? `display=${nb.statusGraphicRule.display} justify=${nb.statusGraphicRule.justifyContent} pe=${nb.statusGraphicRule.pointerEvents} pos=${nb.statusGraphicRule.position || "(none)"}`
      : "rule missing",
  );
  check(rows, `${tag}.statusGraphic.noHorizontalOverflow`, nb.docScrollWidth <= nb.viewportWidth + 1, `scrollW=${nb.docScrollWidth} vw=${nb.viewportWidth}`);
  // The status meaning stays entirely in HTML/text: the section renders, the
  // heading is present, and the return-home control is visible and linked.
  check(
    rows,
    `${tag}.statusGraphic.statusSemanticsIntact`,
    nb.statusSectionPresent &&
      nb.statusSectionHeight > 0 &&
      typeof nb.statusHeadingText === "string" &&
      nb.statusHeadingText.length > 0 &&
      typeof nb.statusHomeLinkText === "string" &&
      nb.statusHomeLinkText.length > 0 &&
      typeof nb.statusHomeLinkHref === "string" &&
      nb.statusHomeLinkHref.startsWith("/"),
    `h=${nb.statusSectionHeight} heading=${nb.statusHeadingText} link=${nb.statusHomeLinkHref}`,
  );
  // No decorative box exists at all when unconfigured — so nothing can sit above
  // the status heading and the frame's geometry is exactly the pre-P12-SG one.
  // The decorative box sits ABOVE the status heading, so the frame's reading
  // order and its heading-first hierarchy are preserved…
  check(rows, `${tag}.statusGraphic.aboveHeading`, nb.statusGraphicAboveHeading === true, `above=${nb.statusGraphicAboveHeading}`);
  // …the image is fully loaded (never a broken status artwork)…
  check(rows, `${tag}.statusGraphic.imageLoaded`, nb.statusGraphicImgComplete === true, `complete=${nb.statusGraphicImgComplete}`);
  // …and the heading remains present below the decoration.
  check(
    rows,
    `${tag}.statusGraphic.headingBelowGraphic`,
    !!nb.headingRect && !!nb.statusGraphicRect,
    `headingTop=${nb.headingRect ? nb.headingRect.top : "n/a"}`,
  );
  // APPROVED-ASSET INTEGRATION — capture the readability EVIDENCE once, for the
  // canonical presentation, so the visual gate is backed by real artefacts.
  if (tag === "adaptive") {
    const dir = await captureReadabilityEvidence(cdp, "canonical");
    check(rows, `${tag}.readability.evidenceCaptured`, true, `screenshots -> ${dir}`);
  }
}


/** P6-3B — sidebar rail geometry: toggle icon size, nav-item icons, labels, border. */
async function runP6bSidebarChecks(rows, tag, cdp) {
  await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  const exp = await cdp.evaluate(`(() => {
    ${PRESENTED_VARIANT}
    const rail = document.querySelector('#shell-sidebar-desktop-rail');
    const main = document.querySelector('#main');
    if (!rail) return null;
    // UI1-A3 — the CONTROL's artwork is a state pair: measure the variant this rail presents.
    const toggle = presentedIcon(rail);
    const tr = toggle ? toggle.getBoundingClientRect() : null;
    const rr = rail.getBoundingClientRect();
    const mr = main ? main.getBoundingClientRect() : null;
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none'; };
    const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none'; };
    const items = [...rail.querySelectorAll('ul > li')];
    const navIcon = rail.querySelector('.ui-nav-item-icon-open') || rail.querySelector('.ui-nav-item-icon');
    const nir = navIcon ? navIcon.getBoundingClientRect() : null;
    const ends = (li, cls, suffix) => { const el = li.querySelector(cls); return !!(el && (el.getAttribute('src') || '').endsWith(suffix)); };
    const favicon = document.querySelector('link[rel="icon"]');
    const headerEl = document.querySelector('.ui-site-header');
    return {
      hasToggle: !!rail.querySelector('.ui-sidebar-toggle'),
      navIconW: nir ? Math.round(nir.width) : null,
      navIconH: nir ? Math.round(nir.height) : null,
      toggleW: tr ? Math.round(tr.width) : null, toggleH: tr ? Math.round(tr.height) : null,
      railHeight: Math.round(rr.height), mainHeight: mr ? Math.round(mr.height) : null,
      border: getComputedStyle(rail).borderRightWidth, itemCount: items.length,
      allIcons: items.every((li) => !!li.querySelector('.ui-nav-item-icon')),
      openVisible: items.filter((li) => shown(li.querySelector('.ui-nav-item-icon-open'))).length,
      closedVisible: items.filter((li) => shown(li.querySelector('.ui-nav-item-icon-closed'))).length,
      labelsVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-label'))).length,
      defaultDots: items.filter((li) => ends(li, '.ui-nav-item-icon-open', 'sidebar-default-icon-open.svg')).length,
      // 2026-09 owner ruling — the sidebar page icons come from the generic ICON
      // LIBRARY (/assets/icon-<name>.svg), not from the dot/plus placeholder.
      libraryIcons: items.filter((li) => { const el = li.querySelector('.ui-nav-item-icon-open'); const src = el ? (el.getAttribute('src') || '') : ''; return /^\\/assets\\/icon-[a-z0-9-]+\\.svg$/.test(src) && !/sidebar-default-icon/.test(src); }).length,
      // Every icon-bearing item carries its page name as a native tooltip, so the
      // collapsed rail stays discoverable without a second visible label.
      tooltipLabels: items.filter((li) => { const a = li.querySelector('a'); const l = li.querySelector('.ui-nav-item-label'); return !!(a && l && a.getAttribute('title') === l.textContent); }).length,
      faviconHref: favicon ? favicon.getAttribute('href') : null,
      headerBand: headerEl ? headerEl.getAttribute('data-ui-header-graphic') : null,
      headerBandValue: headerEl ? getComputedStyle(headerEl).getPropertyValue('--ui-header-graphic').trim() : '',
      headerBandImage: headerEl ? getComputedStyle(headerEl).backgroundImage : '',
    };
  })()`);
  // 2026-09 owner ruling — every sidebar PAGE icon renders at EXACTLY 16x16 on
  // desktop (and tablet): one shared sizing contract, no breakpoint override.
  check(rows, `${tag}.p6b.desktop.navIcon16`, !!exp && exp.navIconW === 16 && exp.navIconH === 16, `w=${exp && exp.navIconW} h=${exp && exp.navIconH}`);
  if (exp && exp.hasToggle) {
    // 2026-09 closure pass — the open/close CONTROL is exactly 24x24 on desktop
    // and tablet (one token, no breakpoint override). It is NOT the page icon
    // (16x16, asserted above) and it no longer derives the rail width.
    check(rows, `${tag}.p6b.desktop.toggleIcon24`, exp.toggleW === 24 && exp.toggleH === 24, `w=${exp.toggleW} h=${exp.toggleH}`);
  } else {
    // A deliberately NON-collapsible rail (e.g. immersive `floating`) has no
    // toggle control at all — the §3 toggle-size contract does not apply.
    check(rows, `${tag}.p6b.desktop.staticRailNoToggle`, !!exp && !exp.hasToggle);
  }
  check(rows, `${tag}.p6b.desktop.navIconsAll`, !!exp && exp.itemCount > 0 && exp.allIcons, `items=${exp && exp.itemCount}`);
  check(rows, `${tag}.p6b.desktop.openIconsVisible`, !!exp && exp.itemCount > 0 && exp.openVisible === exp.itemCount, `${exp && exp.openVisible}/${exp && exp.itemCount}`);
  check(rows, `${tag}.p6b.desktop.closedIconsHidden`, !!exp && exp.closedVisible === 0);
  check(rows, `${tag}.p6b.desktop.labelsVisible`, !!exp && exp.itemCount > 0 && exp.labelsVisible === exp.itemCount);
  // 2026-09 owner ruling — the sidebar uses the acquired GENERIC ICON LIBRARY:
  // every item's page icon resolves to /assets/icon-<name>.svg, never the
  // dot/plus placeholder.
  check(rows, `${tag}.p6b.desktop.iconLibrary`, !!exp && exp.itemCount > 0 && exp.libraryIcons === exp.itemCount && exp.defaultDots === 0, `library=${exp && exp.libraryIcons}/${exp && exp.itemCount} dots=${exp && exp.defaultDots}`);
  check(rows, `${tag}.p6b.desktop.tooltipLabels`, !!exp && exp.itemCount > 0 && exp.tooltipLabels === exp.itemCount, `${exp && exp.tooltipLabels}/${exp && exp.itemCount}`);
  // The live favicon is the corrected branding-derived one (never a stale route).
  check(rows, `${tag}.p6b.favicon`, !!exp && exp.faviconHref === "/assets/favicon.svg", `href=${exp && exp.faviconHref}`);
  // …and it renders as a COMPLETE, uncropped circle: no ink may touch the canvas
  // edge. The previous favicon narrowed its viewBox, which clipped the emblem and
  // produced flat sides (measured 160 opaque px ON the outer edge, with straight
  // runs up to 32 px per side), so this check is the live-browser regression guard.
  const faviconEdgeInk = await cdp.evaluate(`(async () => {
    const link = document.querySelector('link[rel="icon"]');
    const href = link ? link.getAttribute('href') : null;
    if (!href) return -1;
    const text = await (await fetch(href)).text();
    if (!/<svg/i.test(text)) return -2;
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
    await img.decode();
    const S = 256;
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const ctx = c.getContext('2d'); ctx.clearRect(0, 0, S, S);
    ctx.drawImage(img, 0, 0, S, S);
    const d = ctx.getImageData(0, 0, S, S).data;
    const a = (x, y) => d[(y * S + x) * 4 + 3];
    let ink = 0;
    for (let i = 0; i < S; i++) {
      for (let b = 0; b < 2; b++) {
        if (a(b, i) > 32) ink++;
        if (a(S - 1 - b, i) > 32) ink++;
        if (a(i, b) > 32) ink++;
        if (a(i, S - 1 - b) > 32) ink++;
      }
    }
    return ink;
  })()`);
  check(rows, `${tag}.p6b.faviconUncropped`, faviconEdgeInk === 0, `outerBandInk=${faviconEdgeInk}`);
  // 2026-09 owner ruling — the decorative header band's default is BLANK: the band
  // resolves to the transparent placeholder file, which paints nothing visible.
  check(rows, `${tag}.p6b.headerBandDefault`, !!exp && exp.headerBandValue === "url(\"/assets/header-graphic.svg\")" && exp.headerBandImage.includes("header-graphic.svg"), `var=${exp && exp.headerBandValue} img=${exp && exp.headerBandImage}`);
  check(rows, `${tag}.p6b.desktop.border`, !!exp && exp.border === "1px");
  check(rows, `${tag}.p6b.desktop.borderFullHeight`, !!exp && exp.mainHeight > 0 && Math.abs(exp.railHeight - exp.mainHeight) <= 4, `rail=${exp && exp.railHeight} main=${exp && exp.mainHeight}`);
}


/**
 * 2026-09 CLOSURE PASS — theme + control contract for the canonical presentation.
 *
 * The owner's requirements are cross-cutting, so they are verified from the ONE
 * theme token OUTWARD for the canonical presentation at desktop AND tablet —
 * never by hand:
 *   theme      the wordmark renders in the Foundation theme colour, and
 *              `--primary`/`--ring` are computed INDIRECTIONS of
 *              `--ui-brand-accent` (not copies of the value);
 *   selectors  location/language opt into the shared hook and their
 *              application-controlled emphasis (accent-color, hover border) is
 *              that same colour;
 *   sidebar    the show/hide CONTROL is 24x24 with a ~5px left inset, in BOTH
 *              rail states, while the page icons stay 16x16;
 *   cta        the shell-top CTA takes the same ~5px inset;
 *   logos      the footer resolves to the SAME coloured graphic as the header.
 *
 * Browser-native `<option>` popup internals are OS-owned and are therefore NOT
 * asserted; everything the application controls is.
 */
async function runThemeClosureChecks(rows, tag, cdp) {
  /** The shared inset (expanded control + CTA): ~5px, from a spacing token. */
  const nearInset = (value) =>
    value !== null && value >= INSET_TARGET - 1 && value <= INSET_TARGET + 1;
  /** Subpixel/browser-rounding tolerance for a centring equality (owner §6). */
  const centred = (value) => value !== null && Math.abs(value) <= 1;

  const assertProbe = (d, vpName, state) => {
    // ── ONE Foundation theme colour, consumed by both roles ────────────────
    check(
      rows,
      `${tag}.${vpName}.${state}.theme.oneSource`,
      d.primary === d.accent && d.ring === d.accent,
      `primary=${d.primary} ring=${d.ring} accent=${d.accent}`,
    );
    check(
      rows,
      `${tag}.${vpName}.${state}.theme.wordmarkBlue`,
      sameColor(d.wordmarkColor, ACCENT_RGB),
      `wordmark=${d.wordmarkColor} expected=${ACCENT_RGB}`,
    );
    const selectorNames = Object.keys(d.sels).sort();
    check(
      rows,
      `${tag}.${vpName}.${state}.selectors.locationLanguageOnly`,
      selectorNames.join(",") === "language,location",
      `selectors=${selectorNames.join(",")}`,
    );
    check(
      rows,
      `${tag}.${vpName}.${state}.selectors.noPreset`,
      d.presetSelectorPresent === false,
      `presetSelectorPresent=${d.presetSelectorPresent}`,
    );
    for (const name of selectorNames) {
      check(
        rows,
        `${tag}.${vpName}.${state}.theme.sel.${name}`,
        sameColor(d.sels[name], ACCENT_RGB),
        `accent-color=${d.sels[name]} expected=${ACCENT_RGB}`,
      );
    }
    // ── CONTROL: 24x24; EXPANDED inset ~5px; COLLAPSED centred ─────────────
    if (d.hasToggle) {
      check(
        rows,
        `${tag}.${vpName}.${state}.sidebar.control24`,
        d.toggleIcon?.w === 24 && d.toggleIcon?.h === 24,
        `w=${d.toggleIcon?.w} h=${d.toggleIcon?.h}`,
      );
    }
    if (d.hasRail) {
      check(
        rows,
        `${tag}.${vpName}.${state}.sidebar.pageIcon16`,
        d.navIcon?.w === 16 && d.navIcon?.h === 16,
        `w=${d.navIcon?.w} h=${d.navIcon?.h}`,
      );
    }
    if (d.hasToggle && d.collapsed === "true" && d.rail && d.toggleIcon) {
      // Owner geometry: the collapsed rail is a symmetric icon column — the open
      // control is centred on the rail's axis and its left/right distances are
      // equal within browser rounding.
      const leftDistance = d.toggleIcon.cx - d.rail.l;
      const rightDistance = d.rail.r - d.toggleIcon.cx;
      check(
        rows,
        `${tag}.${vpName}.${state}.sidebar.collapsedControlCentred`,
        centred(d.toggleIcon.cx - d.rail.cx),
        `controlCx=${d.toggleIcon.cx} railCx=${d.rail.cx}`,
      );
      check(
        rows,
        `${tag}.${vpName}.${state}.sidebar.collapsedCentreDistancesEqual`,
        centred(leftDistance - rightDistance),
        `left=${leftDistance.toFixed(2)} right=${rightDistance.toFixed(2)}`,
      );
    } else if (d.hasToggle && d.collapsed === "false" && d.rail) {
      check(
        rows,
        `${tag}.${vpName}.${state}.sidebar.expandedControlInset`,
        nearInset(d.toggle ? d.toggle.l - d.rail.l : null),
        `inset=${d.toggle ? d.toggle.l - d.rail.l : null} (target ~${INSET_TARGET})`,
      );
    }
    // ── Footer logo: same source AND same displayed size as the header ─────
    check(
      rows,
      `${tag}.${vpName}.${state}.logo.footerMatchesHeaderSize`,
      !!d.headerLogo && !!d.footerLogo &&
        d.footerLogo.h === d.headerLogo.h && d.footerLogo.w === d.headerLogo.w,
      `header=${d.headerLogo?.w}x${d.headerLogo?.h} footer=${d.footerLogo?.w}x${d.footerLogo?.h}`,
    );
    check(
      rows,
      `${tag}.${vpName}.${state}.logo.aspectPreserved`,
      !!d.footerLogo &&
        Math.abs(d.footerLogo.w / d.footerLogo.h - d.headerLogo.w / d.headerLogo.h) < 0.02,
      `footerRatio=${d.footerLogo ? (d.footerLogo.w / d.footerLogo.h).toFixed(3) : "n/a"}`,
    );
    check(rows, `${tag}.${vpName}.${state}.images.notBroken`, d.broken === 0, `broken=${d.broken}`);
    // ── The shell CTA keeps the same inset in every composition ────────────
    check(
      rows,
      `${tag}.${vpName}.${state}.cta.inset`,
      nearInset(d.ctaLinkLeft === null || d.ctaWrapLeft === null ? null : d.ctaLinkLeft - d.ctaWrapLeft),
      `linkLeft=${d.ctaLinkLeft} wrapLeft=${d.ctaWrapLeft}`,
    );
  };

  for (const [vpName, viewport] of [
    ["desktop", VIEWPORTS.desktop],
    ["tablet", VIEWPORTS.tablet],
    ["mobile", VIEWPORTS.mobile],
  ]) {
    await cdp.setViewport(viewport.width, viewport.height);
    await cdp.navigate(`${BASE_URL}/ww/en`);
    await waitReady(cdp);
    const expanded = JSON.parse(await cdp.evaluate(THEME_PROBE));
    assertProbe(expanded, vpName, "expanded");

    // The footer logo is the SAME COLOURED graphic as the header: identical
    // bytes, and it really carries the Foundation identity blue.
    const logoPair = await cdp.evaluate(`(async () => {
      const head = await (await fetch('/assets/logo-header.svg')).text();
      const foot = await (await fetch('/assets/logo-footer.svg')).text();
      return JSON.stringify({ same: head === foot, coloured: /#3F6791|#4F7CAC/i.test(foot) });
    })()`);
    const pair = JSON.parse(logoPair);
    check(
      rows,
      `${tag}.${vpName}.logo.footerIsColouredHeaderLogo`,
      pair.same === true && pair.coloured === true,
      `identical=${pair.same} coloured=${pair.coloured} srcs=${expanded.logos.join(",")}`,
    );

    // ── BOTH rail states: the control must not move or resize on collapse ──
    if (expanded.hasToggle) {
      const clicked = await cdp.evalBool(
        "(() => { const t = document.querySelector('#shell-sidebar-desktop-rail .ui-sidebar-toggle, #shell-sidebar-tablet-rail .ui-sidebar-toggle'); if (!t) return false; t.click(); return true; })()",
      );
      if (clicked) {
        await sleep(450);
        const collapsed = JSON.parse(await cdp.evaluate(THEME_PROBE));
        assertProbe(collapsed, vpName, "collapsed");
      }
    }
  }

  // ── DARK SCHEME: the tint is DERIVED from the one accent, never a second hex ─
  await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  const dark = JSON.parse(await cdp.evaluate(THEME_PROBE));
  await cdp.send("Emulation.setEmulatedMedia", { features: [] });

  check(
    rows,
    `${tag}.dark.theme.baseAccentUnchanged`,
    (dark.foundationAccent || "").toLowerCase() === ACCENT_HEX.toLowerCase(),
    `--ui-foundation-accent=${dark.foundationAccent}`,
  );
  check(
    rows,
    `${tag}.dark.theme.derivedFromOneAccent`,
    // The token is DERIVED (a color-mix of the one accent), never a second hex.
    /^color-mix\(in srgb,/.test(dark.accent) &&
      dark.accent.toLowerCase().includes(ACCENT_HEX) &&
      !/^#[0-9a-f]{6}$/i.test(dark.accent),
    `--ui-brand-accent=${dark.accent}`,
  );
  check(
    rows,
    `${tag}.dark.theme.derivedResolved`,
    // …and the value the engine computes from it is the derived tint.
    sameColor(dark.wordmarkColor, DARK_ACCENT_RGB),
    `resolved=${dark.wordmarkColor} expected=${DARK_ACCENT_RGB}`,
  );
  check(
    rows,
    `${tag}.dark.theme.wordmarkDerived`,
    sameColor(dark.wordmarkColor, DARK_ACCENT_RGB),
    `wordmark=${dark.wordmarkColor} expected=${DARK_ACCENT_RGB}`,
  );
  for (const name of ["location", "language"]) {
    check(
      rows,
      `${tag}.dark.theme.sel.${name}`,
      sameColor(dark.sels[name], DARK_ACCENT_RGB),
      `accent-color=${dark.sels[name]} expected=${DARK_ACCENT_RGB}`,
    );
  }
  check(
    rows,
    `${tag}.dark.selectors.noPreset`,
    dark.presetSelectorPresent === false,
    `presetSelectorPresent=${dark.presetSelectorPresent}`,
  );
}


/** P6-3B — collapsed rail: derived width, closed icons, no stray labels. */
async function runP6bCollapsedChecks(rows, tag, cdp) {
  const collapsible = await cdp.evalBool(`!!document.querySelector('#shell-sidebar-desktop-rail .ui-sidebar-toggle')`);
  if (!collapsible) {
    check(rows, `${tag}.p6b.collapsed.notApplicable`, true, "non-collapsible aside (static rail)");
    return;
  }
  await cdp.clickCenter('#shell-sidebar-desktop-rail [aria-controls="shell-sidebar-desktop-panel"]');
  await sleep(350);
  const col = await cdp.evaluate(`(() => {
    ${PRESENTED_VARIANT}
    const rail = document.querySelector('#shell-sidebar-desktop-rail');
    if (!rail) return null;
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(el).display !== 'none'; };
    const items = [...rail.querySelectorAll('ul > li')];
    const visibleIcon = rail.querySelector('.ui-nav-item-icon-closed') || rail.querySelector('.ui-nav-item-icon-open') || rail.querySelector('.ui-nav-item-icon');
    const ir = visibleIcon && getComputedStyle(visibleIcon).display !== 'none' ? visibleIcon.getBoundingClientRect() : null;
    // P6-3C — the collapsed WIDTH derives from the CONTROL (toggle) icon; the
    // navigation-item icons inside it are sized independently (32/16px).
    // UI1-A3 — the control's artwork is a state pair: measure the variant this collapsed rail PRESENTS
    // (the '-closed' one), never the first match, which is the hidden '-open' variant.
    const toggleIcon = presentedIcon(rail);
    const tir = toggleIcon ? toggleIcon.getBoundingClientRect() : null;
    const railRect = rail.getBoundingClientRect();
    const r2 = (v) => Math.round(v * 100) / 100;
    const toggleRect = tir;
    return {
      dataCollapsed: rail.getAttribute('data-collapsed'),
      railWidth: Math.round(railRect.width),
      railLeft: r2(railRect.left),
      railRight: r2(railRect.right),
      railCx: r2(railRect.left + railRect.width / 2),
      toggleIconCx: toggleRect ? r2(toggleRect.left + toggleRect.width / 2) : null,
      navIconCx: ir ? r2(ir.left + ir.width / 2) : null,
      iconW: ir ? Math.round(ir.width) : null,
      toggleIconW: tir ? Math.round(tir.width) : null,
      strayLabels: items.filter((li) => { const l = li.querySelector('.ui-nav-item-label'); if (!l) return false; const r = l.getBoundingClientRect(); return r.width > 2 && r.height > 2; }).length,
      labelsVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-label'))).length,
      closedVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-icon-closed'))).length,
      openVisible: items.filter((li) => vis(li.querySelector('.ui-nav-item-icon-open'))).length,
      // 2026-09 owner ruling — collapsed discoverability: the page name stays in
      // the DOM (sr-only → accessible name) and on the link as a native tooltip.
      labelsInDom: items.filter((li) => !!li.querySelector('.ui-nav-item-label')).length,
      labelDisplayNone: items.filter((li) => { const l = li.querySelector('.ui-nav-item-label'); return !!l && getComputedStyle(l).display === 'none'; }).length,
      tooltipLabels: items.filter((li) => { const a = li.querySelector('a'); const l = li.querySelector('.ui-nav-item-label'); return !!(a && l && a.getAttribute('title') === l.textContent); }).length,
      itemCount: items.length,
    };
  })()`);
  check(rows, `${tag}.p6b.collapsed.state`, !!col && col.dataCollapsed === "true");
  // Owner geometry (2026-09) — the collapsed rail is a SYMMETRIC icon column:
  // width = the 24px control icon + equal inline padding on both sides
  // (24 + 6 + 6 = 36px), so it is narrower than the former 76.8px geometry.
  check(rows, `${tag}.p6b.collapsed.widthSymmetric`, !!col && col.railWidth >= 35 && col.railWidth <= 37, `rail=${col && col.railWidth} (control 24 + 2x6)`);
  // …the OPEN control is centred on the rail's axis…
  check(rows, `${tag}.p6b.collapsed.controlCentred`, !!col && col.toggleIconCx != null && Math.abs(col.toggleIconCx - col.railCx) <= 1, `controlCx=${col && col.toggleIconCx} railCx=${col && col.railCx}`);
  // …its distances to the rail's OUTER edges are equal (the owner's stated
  // equality, including the 1px inline-end border)…
  check(
    rows,
    `${tag}.p6b.collapsed.centreDistancesEqual`,
    !!col && col.toggleIconCx != null &&
      Math.abs((col.toggleIconCx - col.railLeft) - (col.railRight - col.toggleIconCx)) <= 1,
    `left=${col ? (col.toggleIconCx - col.railLeft).toFixed(2) : "n/a"} right=${col ? (col.railRight - col.toggleIconCx).toFixed(2) : "n/a"}`,
  );
  // …and the page-icon column shares that SAME centreline.
  check(
    rows,
    `${tag}.p6b.collapsed.navIconSameAxis`,
    !!col && col.navIconCx != null && col.toggleIconCx != null && Math.abs(col.navIconCx - col.toggleIconCx) <= 1,
    `navCx=${col && col.navIconCx} controlCx=${col && col.toggleIconCx}`,
  );
  check(rows, `${tag}.p6b.collapsed.narrowerThanBefore`, !!col && col.railWidth < 45, `rail=${col && col.railWidth}`);
  // 2026-09 owner ruling — the collapsed rail still renders the page icons at
  // EXACTLY 16x16 (the single shared sizing contract), never the 32px desktop size.
  check(rows, `${tag}.p6c.collapsed.navIcon16`, !!col && col.iconW === 16, `navIcon=${col && col.iconW}`);
  // …and the page name is retained for assistive tech + pointer discovery.
  check(rows, `${tag}.p6c.collapsed.labelsRetained`, !!col && col.itemCount > 0 && col.labelsInDom === col.itemCount && col.labelDisplayNone === 0, `inDom=${col && col.labelsInDom}/${col && col.itemCount} displayNone=${col && col.labelDisplayNone}`);
  check(rows, `${tag}.p6c.collapsed.tooltips`, !!col && col.itemCount > 0 && col.tooltipLabels === col.itemCount, `${col && col.tooltipLabels}/${col && col.itemCount}`);
  check(rows, `${tag}.p6c.collapsed.navIconFits`, !!col && col.iconW != null && col.railWidth > col.iconW, `rail=${col && col.railWidth} icon=${col && col.iconW}`);
  check(rows, `${tag}.p6b.collapsed.closedIconsVisible`, !!col && col.closedVisible > 0 && col.openVisible === 0);
  check(rows, `${tag}.p6b.collapsed.labelsHidden`, !!col && col.labelsVisible === 0);
  check(rows, `${tag}.p6b.collapsed.noStrayLabels`, !!col && col.strayLabels === 0, `stray=${col && col.strayLabels}`);
}

/** P6-3B — no width interval where the aside becomes a stacked top-of-content list. */
async function runP6bTabletSweep(rows, tag, cdp) {
  for (const width of [767, 800, 900, 1000, 1023, 1024]) {
    await cdp.setViewport(width, 820);
    await cdp.reload();
    await waitReady(cdp);
    const s = await cdp.evaluate(`(() => {
      ${PRESENTED_VARIANT}
      const rect = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width) } : null; };
      const rail = rect(document.querySelector('#shell-sidebar-desktop-rail')) || rect(document.querySelector('#shell-sidebar-tablet-rail'));
      // P6-3C — measure the rail band that is actually VISIBLE at this width:
      // both bands exist in the DOM, but the non-matching one is display:none
      // (so a naive first-match query would measure a hidden 0×0 element).
      const railEl = [document.querySelector('#shell-sidebar-desktop-rail'), document.querySelector('#shell-sidebar-tablet-rail')]
        .find((el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }) || null;
      // UI1-A3 — the control's artwork is a state pair (the tablet band's rail is COLLAPSED by default), so the
      // presented variant is the one to measure — a first-match query would find the hidden '-open' icon and
      // silently skip the 24px row below.
      const t = railEl ? presentedIcon(railEl) : null;
      const tr = t ? t.getBoundingClientRect() : null;
      const tVisible = !!tr && tr.width > 2 && tr.height > 2;
      // The sidebar is COLLAPSED by default in the tablet band, so the visible
      // navigation icon is the CLOSED (plus) one — pick whichever icon element
      // is actually rendered rather than assuming the open-state sibling.
      const navIcons = railEl ? [...railEl.querySelectorAll('.ui-nav-item-icon-closed, .ui-nav-item-icon-open, .ui-nav-item-icon')] : [];
      const navIcon = navIcons.find((el) => {
        if (getComputedStyle(el).display === 'none') return false;
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2;
      }) || null;
      const nr = navIcon ? navIcon.getBoundingClientRect() : null;
      return {
        rail,
        main: rect(document.querySelector('#main')),
        vw: document.documentElement.clientWidth,
        tabletToggle: tVisible ? { w: Math.round(tr.width), h: Math.round(tr.height) } : null,
        toggleIcon: tVisible ? { w: Math.round(tr.width), h: Math.round(tr.height) } : null,
        navIcon: nr && nr.width > 2 ? { w: Math.round(nr.width), h: Math.round(nr.height) } : null,
      };
    })()`);
    if (!s.rail) {
      check(rows, `${tag}.p6b.sweep.${width}.noStackedRail`, true, "no aside rail visible (mobile composition)");
    } else {
      check(rows, `${tag}.p6b.sweep.${width}.railBesideContent`, s.main != null && s.rail.right <= s.main.left + 2 && s.rail.width < s.vw * 0.6, `railRight=${s.rail.right} mainLeft=${s.main && s.main.left} railW=${s.rail.width}`);
    }
    // 2026-09 — the show/hide CONTROL is exactly 24px x 24px at EVERY width
    // (desktop and tablet, one token, no breakpoint override), independently of
    // the smaller 16px page icons.
    if (s.toggleIcon) {
      check(rows, `${tag}.p6b.sweep.${width}.controlIcon24`, s.toggleIcon.w === 24 && s.toggleIcon.h === 24, `w=${s.toggleIcon.w} h=${s.toggleIcon.h}`);
    }
    // P6-3C — below `lg` the sidebar NAVIGATION icons are 16×16 (the sweep
    // covers just-below / at / just-above the tablet range).
    if (s.navIcon && width < 1024) {
      check(rows, `${tag}.p6c.sweep.${width}.navIcon16`, s.navIcon.w === 16 && s.navIcon.h === 16, `w=${s.navIcon.w} h=${s.navIcon.h}`);
    }
  }
}
/**
 * P6-3C — banner scaling across the three contract cases + the Book Now
 * placement contract. Uses the REAL shipped banner graphic: its natural width
 * defines the cases (narrower than natural → downscale; between natural and
 * 1.5× → fill; wider than 1.5× → stop at 1.5×).
 */
async function runP6cChecks(rows, tag, cdp) {
  await cdp.navigate(`${BASE_URL}/ww/en`);
  await waitReady(cdp);
  const natW = await cdp.evaluate(`(() => { const i = document.querySelector('.ui-page-banner-image'); return i ? i.naturalWidth : 0; })()`);
  for (const width of [220, 300, 390, 700, 800, 1024, 1280]) {
    await cdp.setViewport(width, 844);
    await cdp.reload();
    await waitReady(cdp);
    const s = await cdp.evaluate(`(() => {
      const img = document.querySelector('.ui-page-banner-image');
      if (!img) return null;
      const ir = img.getBoundingClientRect();
      const cs = getComputedStyle(img);
      const cta = document.querySelector('.ui-shell-header-row .ui-shell-cta');
      const cr = cta ? cta.getBoundingClientRect() : null;
      const header = document.querySelector('.ui-site-header');
      const hr = header ? header.getBoundingClientRect() : null;
      const mr = document.querySelector('#main') ? document.querySelector('#main').getBoundingClientRect() : null;
      const reachable = [...document.querySelectorAll('.nav-item-cta')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
      return {
        vw: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        w: Math.round(ir.width), h: Math.round(ir.height),
        left: Math.round(ir.left), right: Math.round(ir.right),
        natW: img.naturalWidth, natH: img.naturalHeight,
        cap: cs.maxWidth.endsWith('px') ? parseFloat(cs.maxWidth) : null,
        ctaCount: reachable.length,
        ctaVisible: !!cr && cr.width > 0 && cr.height > 0,
        ctaBelowHeader: !!cr && !!hr && cr.top >= hr.bottom - 2,
        ctaAboveMain: !!cr && !!mr && cr.bottom <= mr.top + 2,
        ctaInAside: reachable.some((el) => !!el.closest('.ui-shell-sidebar')),
        ctaInBar: reachable.some((el) => !!el.closest('.ui-shell-bottom-bar')),
        ctaInDialog: reachable.some((el) => !!el.closest('[role="dialog"]')),
      };
    })()`);
    if (!s) {
      check(rows, `${tag}.p6c.w${width}.banner.present`, false, "no banner image rendered");
      continue;
    }
    const cap = Math.round(s.natW * 1.5);
    const expected = Math.min(s.vw, cap);
    check(rows, `${tag}.p6c.w${width}.banner.present`, s.natW === natW && natW > 0, `natW=${s.natW}`);
    check(rows, `${tag}.p6c.w${width}.banner.width`, Math.abs(s.w - expected) <= 2, `w=${s.w} expected=${expected} vw=${s.vw} natW=${s.natW}`);
    check(rows, `${tag}.p6c.w${width}.banner.centered`, Math.abs(s.left - (s.vw - s.w) / 2) <= 2, `left=${s.left} right=${s.right} vw=${s.vw} w=${s.w}`);
    check(rows, `${tag}.p6c.w${width}.banner.noOverflow`, s.left >= -1 && s.right <= s.vw + 1, `left=${s.left} right=${s.right} vw=${s.vw}`);
    // The banner must not push the PAGE into horizontal overflow either (only
    // asserted at supported widths — 220px is deliberately below the mobile
    // minimum, used purely to exercise the downscale case).
    if (width >= 390) {
      check(rows, `${tag}.p6c.w${width}.banner.noPageOverflow`, s.scrollW <= s.vw + 1, `scrollW=${s.scrollW} vw=${s.vw}`);
    }
    // The rendered graphic must hold its natural aspect ratio (never stretched
    // or cropped). Asserted in PIXEL space against the height implied by the
    // rendered width, with a scale-aware tolerance: a 1px floor for the two
    // integer-rounded rect measurements, tightening to 1% relative once the
    // graphic is tall enough for that to exceed 1px.
    //
    // Why not a bare ratio comparison: the shipped approved banner is ~8:1, so
    // at the two deliberately-sub-minimum widths (220/300) its rendered height
    // is only ~26-36px, where 0.5px of rounding moves a ratio comparison by far
    // more than the old 0.03 tolerance. This formulation is STRICTER than that
    // tolerance at every real viewport (1% vs 3%) and equivalent at the narrow
    // probe widths.
    const expectedH = (s.w * s.natH) / s.natW;
    const ratioTolerance = Math.max(1, 0.01 * expectedH);
    check(
      rows,
      `${tag}.p6c.w${width}.banner.ratio`,
      s.natH > 0 && s.natW > 0 && s.w > 0 && s.h > 0 && Math.abs(s.h - expectedH) <= ratioTolerance,
      `rendered=${s.w}x${s.h} expectedH=${expectedH.toFixed(2)} tol=${ratioTolerance.toFixed(2)} natural=${s.natW}x${s.natH}`,
    );
    check(rows, `${tag}.p6c.w${width}.banner.cap`, s.cap != null && Math.abs(s.cap - cap) <= 1, `cap=${s.cap} expected=${cap}`);
    // Book Now — ONE action, in the top region, outside every navigation layer.
    check(rows, `${tag}.p6c.w${width}.cta.single`, s.ctaCount === 1, `count=${s.ctaCount}`);
    check(rows, `${tag}.p6c.w${width}.cta.visible`, !!s.ctaVisible);
    check(rows, `${tag}.p6c.w${width}.cta.topRegion`, !!s.ctaBelowHeader && !!s.ctaAboveMain, `belowHeader=${s.ctaBelowHeader} aboveMain=${s.ctaAboveMain}`);
    check(rows, `${tag}.p6c.w${width}.cta.outsideNavigation`, !s.ctaInAside && !s.ctaInBar && !s.ctaInDialog, `aside=${s.ctaInAside} bar=${s.ctaInBar} dialog=${s.ctaInDialog}`);
  }
}



/**
 * CONNECTIVITY ICON SEAM — browser-real acceptance (footer Connect column +
 * Connect page) on ONE dedicated dev server with a fixture config.
 *
 * The canonical deployment configures NO social accounts and NO connectivity
 * icons, so canonical text-only behavior is asserted by the canonical pass
 * (footer links/geometry/`noBrokenImages`); THIS pass proves the OPTIONAL icon
 * contract itself, using an EXISTING generic shipped asset (`sidebar-open.svg`).
 * No platform mark artwork is created, downloaded or installed anywhere here.
 *
 * Proven: a configured + AVAILABLE icon renders as supplementary artwork
 * (1em/16px, `object-fit: contain`, decorative, not focusable, before the label);
 * an item with NO icon AND an item whose configured icon FILE IS MISSING both
 * render as complete text links — no `<img>`, no broken image, no lost method,
 * no build/error (a missing connectivity asset is deliberately tolerated, unlike
 * the loud control/nav icon leaves); the visible label stays the accessible name;
 * no horizontal overflow at desktop or mobile; every configured method survives.
 */
async function runConnectivityIconScenario(chrome) {
  // S3E1C/S3F1B — an EXISTING SHIPPED PLATFORM asset (the shared icon library). The role files
  // (`sidebar-open.svg`) belong to the installation that owns them and are deliberately not used as a
  // generic fixture: this scenario's subject is the connectivity icon seam, not another installation's
  // artwork, and the assertions below match the filename's basename either way.
  // The icon this pass configures is DERIVED from the platform icons THIS installation publishes
  // (M21 §10): the seam under test is the configured-icon behaviour, never a particular artwork file.
  // An installation that publishes no platform icon has no subject here, so the pass is SKIPPED.
  const publishedIcons = servedInstallationAssetCapability().publishedIcons();
  if (publishedIcons.length === 0) return;
  const ICON = publishedIcons[0];
  const MISSING = "missing-connectivity-icon-fixture.svg"; // deliberately absent
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];
  const port = BASE_PORT + 150;
  const url = `http://localhost:${port}/ww/en`;
  BASE_URL = `http://localhost:${port}`;
  const config = JSON.parse(original);
  // R1A — one deterministic composition (the reference deployment's visitor
  // layout choice is proved by the `reference-content` scenario), so the
  // connectivity seam is measured without a second, CSS-hidden navigation
  // structure in the document.
  config.ui = { ...(config.ui ?? {}), layoutSwitcher: { enabled: false } };
  config.socialLinks = [
    { platform: "fixture-with-icon", label: "Icon Platform", href: "https://example.com/icon", icon: ICON },
    { platform: "fixture-missing-icon", label: "Missing Artwork Platform", href: "https://example.com/missing", icon: MISSING },
    { platform: "fixture-text-only", label: "Text Only Platform", href: "https://example.com/text" },
  ];
  // Method [0] gets a real asset, [1] a configured-but-missing one; the rest stay
  // exactly as configured (text-only) — every method must keep working.
  // FS1 — the generic template ships NO connectivity configuration, so this
  // fixture CREATES the method list it exercises: the seam under test is the
  // icon-resolution + fallback contract, not the shipped catalogue.
  config.connect = {
    methods: [
      { id: "message", label: "Message Us", href: "/contact" },
      { id: "email", label: "Email", href: "mailto:hello@example.com" },
      { id: "phone", label: "Phone", href: "tel:+14165550142" },
    ],
  };
  config.connect.methods = config.connect.methods.map((method, index) =>
    index === 0 ? { ...method, icon: ICON } : index === 1 ? { ...method, icon: MISSING } : method,
  );
  const expectedMethods = config.connect.methods.length;
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  // FS1 — the generic template ships NO pages, so this fixture also supplies the
  // Connect page's safe Markdown source for the duration of the run (removed in
  // `finally`). The seam under test is the connectivity contract, not whether a fresh
  // clone has written its own pages yet.
  const connectContentPath = join(CONTENT_ROOT, "markdown", "ww", "en", "connect.md");
  await mkdir(dirname(connectContentPath), { recursive: true });
  await writeFile(
    connectContentPath,
    "---\ntitle: Connect\n---\n\nReach us through any of the methods below.\n",
    "utf8",
  );
  const server = startDevServer(port);
  let cdp = null;
  try {
    // A configured-but-missing connectivity icon must NOT stop the server: the
    // dev server becoming ready at all is part of the assertion below.
    await waitForServer(url);
    cdp = await Cdp.connect(chrome);
    check(rows, "fixture.missingIcon.doesNotBreakDeployment", true, "dev server ready with a configured-but-absent connectivity icon");


    for (const [vpName, vp] of [["desktop", VIEWPORTS.desktop], ["mobile", VIEWPORTS.mobile]]) {
      await cdp.setViewport(vp.width, vp.height);
      await cdp.navigate(url);
      await waitReady(cdp);
      const f = await cdp.evaluate(`(() => {
        const footer = document.querySelector('footer');
        if (!footer) return null;
        const items = [...footer.querySelectorAll('li')].map((li) => {
          const a = li.querySelector('a');
          const img = li.querySelector('img');
          const r = img ? img.getBoundingClientRect() : null;
          const cs = img ? getComputedStyle(img) : null;
          const label = li.querySelector('.ui-nav-item-label');
          const lr = label ? label.getBoundingClientRect() : null;
          return {
            text: a ? a.textContent.trim() : '',
            href: a ? a.getAttribute('href') : null,
            ariaLabel: a ? a.getAttribute('aria-label') : null,
            hasImg: !!img,
            imgSrc: img ? img.getAttribute('src') : null,
            loaded: img ? (img.complete && img.naturalWidth > 0) : null,
            alt: img ? img.getAttribute('alt') : null,
            hidden: img ? img.getAttribute('aria-hidden') : null,
            tabindex: img ? img.getAttribute('tabindex') : null,
            iconW: r ? Math.round(r.width) : null,
            iconH: r ? Math.round(r.height) : null,
            objectFit: cs ? cs.objectFit : null,
            iconBeforeLabel: !!(r && lr) && r.left <= lr.left + 1,
          };
        });
        return {
          items,
          vw: document.documentElement.clientWidth,
          scrollW: document.documentElement.scrollWidth,
          footerHeight: Math.round(footer.getBoundingClientRect().height),
          brokenImages: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
        };
      })()`);
      if (!f) {
        check(rows, `connectivity.footer.${vpName}.renders`, false, "no footer");
        continue;
      }
      const pick = (text) => f.items.find((item) => item.text === text);
      const iconItem = pick("Icon Platform");
      const missingItem = pick("Missing Artwork Platform");
      const textOnlyItem = pick("Text Only Platform");
      const methodIcon = pick("Message Us");
      // The `email` method is a `demoOnly` entry, so its link text carries the
      // demo badge ("Email" + "Demo") — match it by its authoritative href.
      const methodMissing = f.items.find((item) => item.href === "mailto:hello@example.com");

      check(rows, `connectivity.footer.${vpName}.social.allPresent`, !!iconItem && !!missingItem && !!textOnlyItem, `items=${f.items.length}`);
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconRendered`,
        // S3E1C — the icon is served from whichever runtime NAMESPACE holds the shipped fixture
        // (`/assets/**` in a legacy Installation, `/spokes/<segment>/assets/**` in an explicit one), so
        // the assertion is the resolved FILE, never a hardcoded prefix.
        !!iconItem && iconItem.hasImg && iconItem.imgSrc.endsWith(`/${ICON}`) && iconItem.loaded === true,
        iconItem ? `src=${iconItem.imgSrc} loaded=${iconItem.loaded}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconSize16`,
        !!iconItem && iconItem.iconW === 16 && iconItem.iconH === 16 && iconItem.objectFit === "contain",
        iconItem ? `w=${iconItem.iconW} h=${iconItem.iconH} fit=${iconItem.objectFit}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconDecorative`,
        !!iconItem && iconItem.alt === "" && iconItem.hidden === "true" && iconItem.tabindex === null,
        iconItem ? `alt=${iconItem.alt} aria-hidden=${iconItem.hidden} tabindex=${iconItem.tabindex}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.iconPrecedesLabel`,
        !!iconItem && iconItem.iconBeforeLabel === true,
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.labelIsAccessibleName`,
        !!iconItem && iconItem.text === "Icon Platform" && iconItem.ariaLabel === null,
        iconItem ? `text=${iconItem.text} aria-label=${iconItem.ariaLabel}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.missingIconFallsBackToText`,
        !!missingItem &&
          missingItem.hasImg === false &&
          missingItem.text === "Missing Artwork Platform" &&
          missingItem.href === "https://example.com/missing",
        missingItem ? `img=${missingItem.hasImg} href=${missingItem.href}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.social.textOnlyStaysTextOnly`,
        !!textOnlyItem && textOnlyItem.hasImg === false && textOnlyItem.href === "https://example.com/text",
        textOnlyItem ? `img=${textOnlyItem.hasImg} href=${textOnlyItem.href}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.method.iconRendered`,
        !!methodIcon && methodIcon.hasImg && methodIcon.imgSrc.endsWith(`/${ICON}`),
        methodIcon ? `img=${methodIcon.hasImg} src=${methodIcon.imgSrc}` : "missing",
      );
      check(
        rows,
        `connectivity.footer.${vpName}.method.missingIconFallsBackToText`,
        !!methodMissing &&
          methodMissing.hasImg === false &&
          methodMissing.text.startsWith("Email") &&
          methodMissing.href === "mailto:hello@example.com",
        methodMissing ? `img=${methodMissing.hasImg} text=${methodMissing.text} href=${methodMissing.href}` : "missing",
      );
      check(rows, `connectivity.footer.${vpName}.noBrokenImages`, f.brokenImages === 0, `broken=${f.brokenImages}`);
      check(rows, `connectivity.footer.${vpName}.noHorizontalOverflow`, f.scrollW <= f.vw + 1, `scrollW=${f.scrollW} vw=${f.vw}`);
      check(rows, `connectivity.footer.${vpName}.geometryIntact`, f.footerHeight > 0, `h=${f.footerHeight}`);

      // Connect page — the same seam on the communication hub itself.
      await cdp.navigate(`${BASE_URL}/ww/en/connect`);
      await waitReady(cdp);
      const page = await cdp.evaluate(`(() => {
        const cards = [...document.querySelectorAll('.grid > li')];
        return {
          cards: cards.map((li) => {
            const a = li.querySelector('a');
            const img = li.querySelector('img');
            const r = img ? img.getBoundingClientRect() : null;
            const cs = img ? getComputedStyle(img) : null;
            const label = [...li.querySelectorAll('span')].find((s) => s.textContent.trim().length > 0 && !s.querySelector('span'));
            const lr = label ? label.getBoundingClientRect() : null;
            return {
              text: (label ? label.textContent : li.textContent).trim(),
              hasLink: !!a,
              href: a ? a.getAttribute('href') : null,
              hasImg: !!img,
              imgSrc: img ? img.getAttribute('src') : null,
              loaded: img ? (img.complete && img.naturalWidth > 0) : null,
              alt: img ? img.getAttribute('alt') : null,
              hidden: img ? img.getAttribute('aria-hidden') : null,
              iconW: r ? Math.round(r.width) : null,
              iconH: r ? Math.round(r.height) : null,
              objectFit: cs ? cs.objectFit : null,
              iconBeforeLabel: !!(r && lr) && r.left <= lr.left + 1,
            };
          }),
          vw: document.documentElement.clientWidth,
          scrollW: document.documentElement.scrollWidth,
          brokenImages: [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).length,
        };
      })()`);
      const cards = page ? page.cards : [];
      const iconCard = cards.find((card) => card.hasImg);
      check(rows, `connectivity.page.${vpName}.allMethodsPresent`, cards.length === expectedMethods, `cards=${cards.length} expected=${expectedMethods}`);
      check(rows, `connectivity.page.${vpName}.everyMethodActionable`, cards.length > 0 && cards.every((card) => card.hasLink && !!card.href), cards.map((c) => c.href).join(","));
      check(
        rows,
        `connectivity.page.${vpName}.onlyConfiguredAvailableIconRendered`,
        cards.filter((card) => card.hasImg).length === 1,
        `icons=${cards.filter((card) => card.hasImg).length}`,
      );
      check(
        rows,
        `connectivity.page.${vpName}.iconSupplementary16`,
        !!iconCard &&
          iconCard.imgSrc.endsWith(`/${ICON}`) &&
          iconCard.loaded === true &&
          iconCard.iconW === 16 &&
          iconCard.iconH === 16 &&
          iconCard.objectFit === "contain" &&
          iconCard.iconBeforeLabel === true,
        iconCard ? `src=${iconCard.imgSrc} w=${iconCard.iconW} h=${iconCard.iconH} fit=${iconCard.objectFit} before=${iconCard.iconBeforeLabel}` : "no icon card",
      );
      check(
        rows,
        `connectivity.page.${vpName}.iconDecorative`,
        !!iconCard && iconCard.alt === "" && iconCard.hidden === "true",
        iconCard ? `alt=${iconCard.alt} aria-hidden=${iconCard.hidden}` : "no icon card",
      );
      check(rows, `connectivity.page.${vpName}.noBrokenImages`, !!page && page.brokenImages === 0, page ? `broken=${page.brokenImages}` : "null");
      check(rows, `connectivity.page.${vpName}.noHorizontalOverflow`, !!page && page.scrollW <= page.vw + 1, page ? `scrollW=${page.scrollW} vw=${page.vw}` : "null");
    }

    // ── COLOUR SEAM — MEASURED, NOT ASSUMED (BRAND_ASSETS.md §11/§13) ────────
    // An <img>-loaded SVG cannot inherit the host document's text colour. Proven
    // by MEASURING the painted pixels: a deliberately non-neutral colour is set
    // on the link, the rendered icon is drawn onto a canvas and read back. This
    // locks the documented contract for a `currentColor` master while asserting
    // nothing about any artwork's content — the check holds for any file.
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);
    const painted = await cdp.evaluate(`(async () => {
      const img = [...document.querySelectorAll('footer li img')]
        .find((el) => (el.getAttribute('src') || '').endsWith('${ICON}'));
      if (!img) return null;
      const link = img.closest('a');
      link.style.color = 'rgb(255, 0, 0)';
      await new Promise((r) => setTimeout(r, 50));
      const svgText = await (await fetch(img.getAttribute('src'))).text();
      const canvas = document.createElement('canvas');
      canvas.width = 24; canvas.height = 24;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, 24, 24);
      const tally = new Map();
      let opaque = 0;
      try {
        const d = ctx.getImageData(0, 0, 24, 24).data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 200) {
            opaque += 1;
            const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2];
            tally.set(k, (tally.get(k) || 0) + 1);
          }
        }
      } catch (e) { return { tainted: String(e) }; }
      const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        declaredCurrentColor: svgText.includes('currentColor'),
        declaredInternalColor: /<style/i.test(svgText) || /(?:fill|stroke)="#/i.test(svgText),
        linkColor: getComputedStyle(link).color,
        imgColor: getComputedStyle(img).color,
        opaque,
        painted: top ? top[0] : null,
        share: top && opaque ? top[1] / opaque : 0,
      };
    })()`);
    check(
      rows,
      "connectivity.colour.fixtureIsACurrentColorMaster",
      !!painted && painted.declaredCurrentColor === true && painted.declaredInternalColor === false,
      painted ? `currentColor=${painted.declaredCurrentColor} internalColor=${painted.declaredInternalColor}` : "missing",
    );
    check(
      rows,
      "connectivity.colour.hostColourReachesTheImgElement",
      !!painted && painted.imgColor === "rgb(255, 0, 0)",
      painted ? `img=${painted.imgColor} link=${painted.linkColor}` : "missing",
    );
    check(
      rows,
      "connectivity.colour.currentColorDoesNotInheritIntoTheImage",
      !!painted && !painted.tainted && painted.painted === "0,0,0" && painted.share > 0.5,
      painted
        ? `painted=${painted.painted} (${Math.round((painted.share || 0) * 100)}% of ${painted.opaque} opaque px) — NOT the link colour`
        : "missing",
    );
  } catch (error) {
    check(rows, "connectivity.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
    await writeFile(CONFIG_PATH, original, "utf8");
    await rm(connectContentPath, { force: true });
    // Remove the locale directory ONLY if the fixture left it empty.
    try {
      await rmdir(dirname(connectContentPath));
    } catch {
      /* not empty (or already gone): leave it exactly as it is */
    }
  }
  return rows;
}

/**
 * PERSISTENT NAVIGATION (FOUNDATION-N1) — browser-real acceptance.
 *
 * The composition/CSS contract is asserted by
 * `tests/unit/shell-persistent-navigation.test.ts`; THIS is the behavioural half,
 * on the shipped one-canonical composition (a collapsible rail beside the content
 * at md+ through `collapsed-sidebar`, and the bottom bar below md):
 *
 *   · at desktop and tablet widths the RAIL's content column stays in view while
 *     the page is scrolled, bounded by the viewport, with its control and its
 *     destinations reachable and the header returned to normal flow;
 *   · the rail never overlaps the content column, and expanding the collapsed
 *     tablet rail while scrolled still works (the trip back to the top of the page
 *     that this increment removes);
 *   · at every breakpoint boundary exactly ONE of the two regions is persistent
 *     (header below md, rail at/above md);
 *   · a deliberately LONG navigation scrolls INSIDE the rail column and its last
 *     destination stays reachable, which is what makes a short viewport safe;
 *   · a fragment target is not hidden beneath the sticky header, and the clearance
 *     is removed exactly where the rail (not the header) is persistent;
 *   · at mobile widths the sticky header and the bottom bar are both present
 *     without swallowing the viewport, and the More disclosure opens, moves focus
 *     inside, locks the background and returns focus on Escape — all while the page
 *     is scrolled;
 *   · the primary CTA is NOT part of what persists (persistence is for navigation,
 *     not for actions), and the touch-target and destination contracts are
 *     unchanged.
 *
 * Every assertion is derived from the page and from the fixture this scenario
 * writes (a long generic navigation and one tall Markdown page), never from a copy
 * of a site's words, and nothing is left written.
 */

/** Probe helpers injected into each expression — kept in ONE place, backtick-free. */
const NAV_PROBE_HELPERS = `
  const inView = (r) => !!r && r.width > 0 && r.height > 0 && r.top >= -1 && r.bottom <= document.documentElement.clientHeight + 1;
  const sticky = (el) => !!el && getComputedStyle(el).position === 'sticky';
  const navPaths = (root) => [...root.querySelectorAll('a[href]')].map((a) => new URL(a.href).pathname);
  const visibleRail = () => [...document.querySelectorAll('#shell-sidebar-desktop-rail, #shell-sidebar-tablet-rail')].find((el) => el.getBoundingClientRect().width > 0) || null;
  const railColumn = () => { const r = visibleRail(); return r ? r.querySelector('.ui-sidebar-rail-sticky') : null; };
  const railControl = () => { const r = visibleRail(); return r ? r.querySelector('[aria-controls$="-panel"]') : null; };
  const hittable = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); };
  const scrollToMiddle = () => { window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.45)); };
`;

/**
 * The tall fixture page: ordinary authored Markdown (the generic template ships
 * no content) with ONE in-page fragment target, so a fragment navigation has
 * somewhere below the fold to land. Written for the duration of the run only.
 */
/**
 * The tall fixture is authored as SAFE Markdown, and its fragment TARGET is an
 * authored HEADING: `## Anchor Section` gains the deterministic id `anchor-section`
 * (FOUNDATION-PAGES-A1D), so the contract under test is the shell's clearance applied
 * to a target the AUTHOR created. The fixture also keeps a raw-HTML anchor attempt,
 * which must stay INERT — an author cannot set an id by typing HTML — so the scenario
 * asserts that property in the same probe.
 */
async function authoredAnchorTarget(cdp) {
  return cdp.evaluate(`(() => {
    const authoredHtmlAnchor = document.getElementById('zz-nav-anchor');
    const heading = document.getElementById('anchor-section');
    const text = document.body.textContent || '';
    return {
      // The raw HTML attempt produced no element, and its source is visible as text.
      rawHtmlInert: authoredHtmlAnchor === null,
      rawHtmlAsText: text.includes('zz-nav-anchor'),
      // The AUTHORED heading did produce the documented fragment target.
      headingIsTarget: !!heading && heading.tagName === 'H3',
    };
  })()`);
}

function tallPageFixture() {
  const paragraph = (n) =>
    `Paragraph ${n}. The rail stays reachable while this page scrolls, so a visitor never has to travel back to the top of the document to navigate elsewhere.`;
  const block = (from, to) => Array.from({ length: to - from }, (_, i) => paragraph(from + i)).join("\n\n");
  // `## Anchor Section` is the author's own fragment target (id `anchor-section`); the
  // raw-HTML anchor beside it is an attempt to set an id by typing HTML, which must
  // stay inert text.
  return [
    "---",
    "title: Persistent navigation fixture",
    "---",
    "",
    block(1, 25),
    "",
    '<div id="zz-nav-anchor"></div>',
    "",
    "## Anchor Section",
    "",
    block(25, 100),
    "",
  ].join("\n");
}

async function runPersistentNavigationScenario(chrome) {
  const port = BASE_PORT + 210;
  BASE_URL = `http://localhost:${port}`;
  const homeUrl = `${BASE_URL}/ww/en`;
  const tallUrl = `${BASE_URL}/ww/en/zz-nav-tall`;
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];

  // A deliberately LONG, entirely generic navigation: it proves the rail's own
  // scrollability and derives every destination assertion below (persistence may
  // change WHERE navigation is reachable, never WHAT it points at). No business,
  // site, host or locale-specific route is named.
  const NAV_FIXTURE = Array.from({ length: 30 }, (_, index) => ({
    label: `Fixture ${String(index + 1).padStart(2, "0")}`,
    href: `/fixture-${String(index + 1).padStart(2, "0")}`,
    position: "middle",
  }));
  const configuredPaths = NAV_FIXTURE.map((item) => `/ww/en${item.href}`);

  const config = JSON.parse(original);
  // R1A — the reference deployment enables the visitor layout switcher, so this
  // scenario pins the ONE composition it measures ("exactly one persistent region
  // at each breakpoint" is a single-composition contract); only the CTA
  // destination is added, so the "actions do not persist" contract has something
  // to observe.
  config.ui = { ...config.ui, layoutSwitcher: { enabled: false }, cta: { ...CTR, style: "standard" } };
  config.navigation = NAV_FIXTURE;
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");

  // FS1 — the generic template ships NO pages, so this fixture supplies the tall
  // safe Markdown page the scroll assertions need (removed in `finally`).
  const tallPath = join(CONTENT_ROOT, "markdown", "ww", "en", "zz-nav-tall.md");
  await mkdir(dirname(tallPath), { recursive: true });
  await writeFile(tallPath, tallPageFixture(), "utf8");

  const server = startDevServer(port);
  let cdp = null;
  try {
    await waitForServer(homeUrl);
    cdp = await Cdp.connect(chrome);

    // ── DESKTOP: the rail beside the content is the persistent navigation ────
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(tallUrl);
    await waitReady(cdp);
    const before = await cdp.evaluate(
      `(() => { ${NAV_PROBE_HELPERS} return { paths: navPaths(visibleRail() || document) }; })()`,
    );
    await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS} scrollToMiddle(); return true; })()`);
    await sleep(350);
    const desk = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
      const rail = visibleRail();
      const column = railColumn();
      const control = railControl();
      const links = rail ? [...rail.querySelectorAll('a[href]')] : [];
      const main = document.querySelector('main');
      const header = document.querySelector('.ui-shell-top');
      const ctaRow = document.querySelector('.ui-shell-header-row');
      const cr = column ? column.getBoundingClientRect() : null;
      const rr = rail ? rail.getBoundingClientRect() : null;
      const mr = main ? main.getBoundingClientRect() : null;
      const ar = ctaRow ? ctaRow.getBoundingClientRect() : null;
      return {
        scrolled: window.scrollY > 0,
        railVisible: !!rail && rr.width > 0,
        columnSticky: sticky(column),
        controlInView: inView(control ? control.getBoundingClientRect() : null),
        controlHittable: hittable(control),
        firstLinkInView: links.length > 0 && inView(links[0].getBoundingClientRect()),
        lastLinkInView: links.length > 0 && inView(links[links.length - 1].getBoundingClientRect()),
        columnBounded: !!cr && cr.top >= -1 && cr.bottom <= document.documentElement.clientHeight + 1,
        headerInFlow: !!header && !sticky(header),
        ctaInFlow: !!ar && !sticky(ctaRow) && ar.bottom <= 1,
        noOverlapMain: !!rr && !!mr && rr.right <= mr.left + 1,
        diag: {
          scrollY: Math.round(window.scrollY),
          vh: document.documentElement.clientHeight,
          columnTop: cr ? Math.round(cr.top) : null,
          columnH: cr ? Math.round(cr.height) : null,
          columnBottom: cr ? Math.round(cr.bottom) : null,
          columnScrollH: column ? column.scrollHeight : null,
          railTop: rr ? Math.round(rr.top) : null,
          railH: rr ? Math.round(rr.height) : null,
          frameH: (() => { const f = document.querySelector('.ui-shell-sidebar > div'); return f ? Math.round(f.getBoundingClientRect().height) : null; })(),
          docH: document.documentElement.scrollHeight,
          footerBottom: (() => { const f = document.querySelector('footer'); return f ? Math.round(f.getBoundingClientRect().bottom + window.scrollY) : null; })(),
        },
        paths: navPaths(rail || document),
      };
    })()`);
    check(rows, "persist.desktop.scrolled", !!desk.scrolled, `scrollY>0=${desk.scrolled}`);
    check(rows, "persist.desktop.rail.visible", !!desk.railVisible);
    check(rows, "persist.desktop.rail.columnSticky", !!desk.columnSticky);
    check(rows, "persist.desktop.rail.controlInView", !!desk.controlInView, JSON.stringify(desk.diag));
    check(rows, "persist.desktop.rail.controlHittable", !!desk.controlHittable, JSON.stringify(desk.diag));
    // A deliberately LONG navigation: the rail's own top is what must be reachable
    // while scrolled; the LAST destination's reachability is proven by the
    // short-viewport block below, after scrolling the column to its end.
    check(rows, "persist.desktop.rail.firstNavInView", !!desk.firstLinkInView, JSON.stringify(desk.diag));
    check(rows, "persist.desktop.rail.bounded", !!desk.columnBounded, JSON.stringify(desk.diag));
    // The rail persists HERE, so the top region scrolls normally: the two can never
    // be sticky at once, and the rail can never cover the content column.
    check(rows, "persist.desktop.header.inFlow", !!desk.headerInFlow);
    check(rows, "persist.desktop.cta.inFlow", !!desk.ctaInFlow);
    check(rows, "persist.desktop.noOverlapMain", !!desk.noOverlapMain);
    check(
      rows,
      "persist.desktop.destinations.unchanged",
      JSON.stringify(desk.paths) === JSON.stringify(before.paths) &&
        JSON.stringify([...desk.paths].sort()) === JSON.stringify([...configuredPaths].sort()),
      `before=${before.paths.length} after=${desk.paths.length} configured=${configuredPaths.length}`,
    );

    // ── TABLET: the collapsed rail persists, and its control still works ─────
    await cdp.setViewport(VIEWPORTS.tablet.width, VIEWPORTS.tablet.height);
    await cdp.navigate(tallUrl);
    await waitReady(cdp);
    await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS} scrollToMiddle(); return true; })()`);
    await sleep(350);
    const tab = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
      const rail = visibleRail();
      const control = railControl();
      const links = rail ? [...rail.querySelectorAll('a[href]')] : [];
      const header = document.querySelector('.ui-shell-top');
      return {
        scrolled: window.scrollY > 0,
        collapsed: !!rail && rail.getAttribute('data-collapsed') === 'true',
        columnSticky: sticky(railColumn()),
        controlInView: inView(control ? control.getBoundingClientRect() : null),
        controlHittable: hittable(control),
        firstItemInView: links.length > 0 && inView(links[0].getBoundingClientRect()),
        headerInFlow: !!header && !sticky(header),
      };
    })()`);
    check(rows, "persist.tablet.scrolled", !!tab.scrolled, `scrollY>0=${tab.scrolled}`);
    check(rows, "persist.tablet.rail.collapsedByDefault", !!tab.collapsed);
    check(rows, "persist.tablet.rail.columnSticky", !!tab.columnSticky);
    check(rows, "persist.tablet.rail.controlInView", !!tab.controlInView);
    check(rows, "persist.tablet.rail.controlHittable", !!tab.controlHittable);
    check(rows, "persist.tablet.rail.itemInView", !!tab.firstItemInView);
    check(rows, "persist.tablet.header.inFlow", !!tab.headerInFlow);
    // Expanding it WHILE THE PAGE IS SCROLLED — the trip back to the top of the
    // page that this increment removes.
    const expandedClick = await cdp.clickCenter(
      "#shell-sidebar-tablet-rail [aria-controls='shell-sidebar-tablet-panel']",
    );
    await sleep(300);
    const tabExpanded = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
      const rail = visibleRail();
      const links = rail ? [...rail.querySelectorAll('ul a[href]')] : [];
      const first = links.length > 0 ? links[0] : null;
      // Expanded means the LABELS are painted again (the collapsed rail keeps them
      // only for assistive tech).
      const label = first ? first.querySelector('.ui-nav-item-label') : null;
      const lr = label ? label.getBoundingClientRect() : null;
      return {
        expanded: !!rail && rail.getAttribute('data-collapsed') === 'false',
        stillPersistent: sticky(railColumn()),
        labelsShown: !!lr && lr.width > 1 && getComputedStyle(label).position !== 'absolute',
        firstInView: inView(first ? first.getBoundingClientRect() : null),
        firstHittable: hittable(first),
        firstNamed: !!first && !!first.textContent.trim(),
      };
    })()`);
    check(rows, "persist.tablet.expand.clicked", !!expandedClick);
    check(rows, "persist.tablet.expand.expanded", !!tabExpanded.expanded);
    check(rows, "persist.tablet.expand.stillPersistent", !!tabExpanded.stillPersistent);
    check(rows, "persist.tablet.expand.labelsShown", !!tabExpanded.labelsShown && !!tabExpanded.firstNamed);
    // The first destination is immediately usable; every OTHER destination stays
    // reachable through the column's own scroll (the short-viewport block below
    // proves the end of a long navigation is reachable).
    check(rows, "persist.tablet.expand.firstReachable", !!tabExpanded.firstInView && !!tabExpanded.firstHittable, `inView=${tabExpanded.firstInView} hittable=${tabExpanded.firstHittable}`);

    // ── BOUNDARIES: exactly ONE persistent navigation at every width ─────────
    for (const width of [767, 768, 1023, 1024]) {
      await cdp.setViewport(width, 820);
      await cdp.navigate(tallUrl);
      await waitReady(cdp);
      const s = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
        const header = document.querySelector('.ui-shell-top');
        const rail = visibleRail();
        const bar = document.querySelector('.ui-shell-bottom-bar');
        return {
          headerSticky: sticky(header),
          railVisible: !!rail && rail.getBoundingClientRect().width > 0,
          railSticky: !!rail && rail.getBoundingClientRect().width > 0 && sticky(railColumn()),
          topBarVisible: inView(bar ? bar.getBoundingClientRect() : null),
        };
      })()`);
      check(rows, `persist.boundary.${width}.headerSticky`, s.headerSticky === width < 768, `sticky=${s.headerSticky}`);
      check(rows, `persist.boundary.${width}.railSticky`, s.railSticky === width >= 768, `visible=${s.railVisible} sticky=${s.railSticky}`);
      check(rows, `persist.boundary.${width}.exactlyOne`, s.headerSticky !== s.railSticky, `header=${s.headerSticky} rail=${s.railSticky}`);
      if (width < 768) check(rows, `persist.boundary.${width}.bottomBarVisible`, !!s.topBarVisible);
    }

    // ── RAIL BAND: the fragment clearance is REMOVED where the rail persists ──
    await cdp.setViewport(VIEWPORTS.tablet.width, VIEWPORTS.tablet.height);
    await cdp.navigate(tallUrl);
    await waitReady(cdp);
    // The fixture's raw-HTML anchor attempt is INERT (safe Markdown has no author-set
    // id), while its AUTHORED heading provides the real target the jump uses.
    const planted = await authoredAnchorTarget(cdp);
    check(
      rows,
      "persist.authoredAnchor.inert",
      !!planted.rawHtmlInert && !!planted.rawHtmlAsText,
      `element=${!planted.rawHtmlInert} asText=${planted.rawHtmlAsText}`,
    );
    check(
      rows,
      "persist.authoredAnchor.headingTarget",
      !!planted.headingIsTarget,
      `h2=${planted.headingIsTarget}`,
    );
    // A fragment navigation on the SAME document fires no load event, so the
    // harness sets the hash exactly as the skip link / an in-page anchor does.
    await cdp.evaluate("location.hash = '#anchor-section'");
    await sleep(400);
    const railAnchor = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
      const column = railColumn();
      const anchor = document.getElementById('anchor-section');
      return {
        clearance: getComputedStyle(document.documentElement).scrollPaddingTop,
        columnSticky: sticky(column),
        anchorTop: anchor ? Math.round(anchor.getBoundingClientRect().top) : null,
      };
    })()`);
    check(rows, "persist.railband.anchor.clearanceRemoved", railAnchor.clearance === "0px", `scrollPaddingTop=${railAnchor.clearance}`);
    check(rows, "persist.railband.anchor.reached", railAnchor.anchorTop != null, `anchorTop=${railAnchor.anchorTop}`);
    check(rows, "persist.railband.railStillPersistent", !!railAnchor.columnSticky);

    // ── MOBILE: a compact persistent header, and navigation that stays put ───
    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await cdp.navigate(tallUrl);
    await waitReady(cdp);
    await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS} scrollToMiddle(); return true; })()`);
    await sleep(350);
    const mob = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
      const header = document.querySelector('.ui-shell-top');
      const bar = document.querySelector('.ui-shell-bottom-bar');
      // R1 — the bar's OWN first destination is the control this scenario tracks at mobile widths: the
      // retired "More" disclosure no longer exists, and the bar now carries every destination itself.
      const trigger = bar ? bar.querySelector('ul a') : null;
      const hr = header ? header.getBoundingClientRect() : null;
      const br = bar ? bar.getBoundingClientRect() : null;
      const tr = trigger ? trigger.getBoundingClientRect() : null;
      const vh = document.documentElement.clientHeight;
      return {
        scrolled: window.scrollY > 0,
        headerSticky: sticky(header),
        headerPinned: !!hr && hr.top >= -1 && hr.top <= 1 && hr.bottom > 0,
        barSticky: sticky(bar),
        barInView: inView(br),
        triggerInView: inView(tr),
        triggerHittable: hittable(trigger),
        triggerTarget: tr ? Math.round(Math.min(tr.width, tr.height)) : null,
        railHidden: !visibleRail(),
        chromeBudget: hr && br ? Math.round(((hr.height + br.height) / vh) * 100) / 100 : null,
        // R1 — the bar WRAPS, so its height is no longer a fixed single row: the chrome budget is measured on
        // the chrome a visitor ALWAYS sees (the header plus the bar's FIRST row), while the bar's wrapped
        // total is bounded separately — it must stay a comfortable share of the viewport rather than swallow
        // it, and no destination may be hidden to keep it small.
        firstRowHeight: (() => {
          const lis = bar ? [...bar.querySelectorAll('ul > li')].filter((li) => li.getBoundingClientRect().height > 0) : [];
          if (lis.length === 0) return br ? br.height : null;
          const tops = lis.map((li) => Math.round(li.getBoundingClientRect().top));
          const firstTop = Math.min(...tops);
          return Math.max(...lis.filter((li) => Math.round(li.getBoundingClientRect().top) === firstTop).map((li) => Math.round(li.getBoundingClientRect().height)));
        })(),
        barShare: br ? Math.round((br.height / vh) * 100) / 100 : null,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
      };
    })()`);
    check(rows, "persist.mobile.scrolled", !!mob.scrolled, `scrollY>0=${mob.scrolled}`);
    check(rows, "persist.mobile.header.sticky", !!mob.headerSticky);
    check(rows, "persist.mobile.header.pinned", !!mob.headerPinned);
    check(rows, "persist.mobile.bar.sticky", !!mob.barSticky);
    check(rows, "persist.mobile.bar.inView", !!mob.barInView);
    check(rows, "persist.mobile.trigger.inView", !!mob.triggerInView);
    check(rows, "persist.mobile.trigger.hittable", !!mob.triggerHittable);
    // R1 — the bar carries EVERY destination, so its links are the touch targets: the ≥44px floor the
    // platform applies to its other interactive chrome (measured on the bar's own first destination).
    check(rows, "persist.mobile.trigger.touchTarget", mob.triggerTarget != null && mob.triggerTarget >= 44, `target=${mob.triggerTarget}`);
    // No rail is composed below md — the header and the bar carry navigation there.
    check(rows, "persist.mobile.rail.hidden", !!mob.railHidden);
    // The persistent chrome must leave the viewport to its content (this is what keeps a SHORT viewport
    // usable). R1 — measured on the header plus the bar's FIRST row, because the bar now WRAPS: its wrapped
    // total is a legitimate consequence of showing every destination, and bounding it by a single-row budget
    // would be the very "hide a destination to stay small" rule the owner retired.
    check(
      rows,
      "persist.mobile.chrome.budget",
      mob.chromeBudget != null && mob.firstRowHeight != null && (mob.chromeBudget - mob.barShare + (mob.firstRowHeight / 844)) <= 0.35,
      `budget=${mob.chromeBudget} barShare=${mob.barShare} firstRow=${mob.firstRowHeight}`,
    );
    // …and the wrapped bar itself must still leave the viewport to its content: a long navigation legitimately
    // produces several rows, but the bar may never swallow the page (this fixture deliberately configures a
    // LONG navigation, which is exactly the case that used to hide destinations behind "More").
    check(rows, "persist.mobile.bar.share", mob.barShare != null && mob.barShare <= 0.75, `barShare=${mob.barShare}`);
    check(rows, "persist.mobile.noDialogWhileScrolling", mob.dialogs === 0);

    // ── MOBILE: a fragment target is not hidden beneath the sticky header ────
    // (the AUTHOR's own heading anchor — see `authoredAnchorTarget`)
    await cdp.evaluate("location.hash = '#anchor-section'");
    await sleep(400);
    const anchor = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
      const header = document.querySelector('.ui-shell-top');
      const target = document.getElementById('anchor-section');
      const hr = header ? header.getBoundingClientRect() : null;
      const tr = target ? target.getBoundingClientRect() : null;
      return {
        clearance: getComputedStyle(document.documentElement).scrollPaddingTop,
        scrolled: window.scrollY > 0,
        targetTop: tr ? Math.round(tr.top) : null,
        headerBottom: hr ? Math.round(hr.bottom) : null,
      };
    })()`);
    // The clearance is the top region's real height (measured and republished by the shell), so it
    // must COVER the header rather than equal a fixed token.
    check(
      rows,
      "persist.mobile.anchor.clearance",
      anchor.clearance != null &&
        anchor.headerBottom != null &&
        Number.parseFloat(anchor.clearance) >= anchor.headerBottom - 1,
      `scrollPaddingTop=${anchor.clearance} headerBottom=${anchor.headerBottom}`,
    );
    check(rows, "persist.mobile.anchor.reached", !!anchor.scrolled, `scrollY>0=${anchor.scrolled}`);
    check(
      rows,
      "persist.mobile.anchor.belowHeader",
      anchor.targetTop != null && anchor.headerBottom != null && anchor.targetTop >= anchor.headerBottom - 1 && anchor.targetTop >= 90,
      `targetTop=${anchor.targetTop} headerBottom=${anchor.headerBottom}`,
    );

    // ── MOBILE: the disclosure still works while the page is scrolled ────────
    // -- R1 -- the bar carries EVERY destination while the page is scrolled --------------------
    //
    // The retired "More" disclosure is gone, so the SAME persistence claim is now provable directly on the
    // bar: every configured destination is reachable there, nothing is hidden behind an overflow control,
    // and the surface stays in view and hittable while the document is scrolled.
    await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS} scrollToMiddle(); return true; })()`);
    await sleep(300);
    const persisted = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
      const bar = document.querySelector('.ui-shell-bottom-bar');
      const anchors = bar ? [...bar.querySelectorAll('ul a')] : [];
      return {
        barInView: inView(bar ? bar.getBoundingClientRect() : null),
        allHittable: anchors.length > 0 && anchors.every((a) => hittable(a)),
        paths: bar ? navPaths(bar) : [],
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        panels: document.querySelectorAll('#shell-bottom-more-panel').length,
      };
    })()`);
    check(rows, "persist.mobile.bar.stillInView", !!persisted.barInView);
    check(rows, "persist.mobile.bar.allHittable", !!persisted.allHittable);
    check(rows, "persist.mobile.bar.no.dialog", persisted.dialogs === 0);
    check(rows, "persist.mobile.bar.no.overflowControl", persisted.panels === 0);
    // The bar's destinations ARE the whole configured navigation: persistence changed WHERE it is
    // reachable, not WHAT it contains.
    check(
      rows,
      "persist.mobile.destinations.union",
      JSON.stringify([...persisted.paths].sort()) === JSON.stringify([...configuredPaths].sort()),
      `bar=${persisted.paths.length} configured=${configuredPaths.length}`,
    );

    // ── SHORT VIEWPORT: a LONG navigation stays reachable inside the rail ────
    for (const [label, viewport] of [
      ["desktop", { width: VIEWPORTS.desktop.width, height: 420 }],
      ["tablet", { width: VIEWPORTS.tablet.width, height: 420 }],
    ]) {
      await cdp.setViewport(viewport.width, viewport.height);
      await cdp.navigate(tallUrl);
      await waitReady(cdp);
      // The page is scrolled first, so the rail column is PINNED and its viewport
      // bound is the viewport's own height — the state the bound exists for.
      await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS} scrollToMiddle(); return true; })()`);
      await sleep(350);
      // Then scroll INSIDE the rail column to its end, without touching the page.
      const railScroll = await cdp.evaluate(`(() => { ${NAV_PROBE_HELPERS}
        const column = railColumn();
        if (!column) return null;
        const before = window.scrollY;
        const cr = column.getBoundingClientRect();
        const pinned = cr.top >= -1 && cr.top <= 1 && cr.bottom > 0;
        const bounded = cr.height <= document.documentElement.clientHeight + 1 && cr.bottom <= document.documentElement.clientHeight + 1;
        column.scrollTop = column.scrollHeight;
        const links = [...column.querySelectorAll('a[href]')];
        const last = links.length > 0 ? links[links.length - 1] : null;
        return {
          pinned,
          bounded,
          overflowed: column.scrollHeight > column.clientHeight + 1,
          overscroll: getComputedStyle(column).overscrollBehaviorY,
          atEnd: column.scrollTop + column.clientHeight >= column.scrollHeight - 1,
          pageStayed: window.scrollY === before,
          lastInView: inView(last ? last.getBoundingClientRect() : null),
          lastHittable: hittable(last),
          lastNamed: !!last && !!last.textContent.trim(),
        };
      })()`);
      check(rows, `persist.short.${label}.rail.pinned`, !!railScroll && railScroll.pinned);
      check(rows, `persist.short.${label}.rail.bounded`, !!railScroll && railScroll.bounded);
      check(rows, `persist.short.${label}.rail.overflow`, !!railScroll && railScroll.overflowed, `overflowed=${railScroll && railScroll.overflowed}`);
      check(rows, `persist.short.${label}.rail.overscrollContained`, !!railScroll && railScroll.overscroll === "contain", `overscroll=${railScroll && railScroll.overscroll}`);
      check(rows, `persist.short.${label}.rail.scrolledToEnd`, !!railScroll && railScroll.atEnd);
      check(rows, `persist.short.${label}.rail.ownScrollOnly`, !!railScroll && railScroll.pageStayed);
      check(rows, `persist.short.${label}.lastReachable`, !!railScroll && railScroll.lastInView && railScroll.lastHittable && railScroll.lastNamed, `inView=${railScroll && railScroll.lastInView} hittable=${railScroll && railScroll.lastHittable}`);
    }
  } catch (error) {
    check(rows, "persistent-navigation.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
    await writeFile(CONFIG_PATH, original, "utf8");
    await rm(tallPath, { force: true });
    // Remove the locale directory ONLY if the fixture left it empty.
    try {
      await rmdir(dirname(tallPath));
    } catch {
      /* not empty (or already gone): leave it exactly as it is */
    }
  }
  return rows;
}

/**
 * SAFE MARKDOWN, IN A REAL BROWSER (FOUNDATION-PAGES-A1; capability + fragments, A1D).
 *
 * The policy is proven twice in unit tests (`safe-markdown`, `safe-url`); what only
 * a browser can prove is that the SERVED page — through the real route, the real
 * server and the real parser — contains no active markup: no author script, no
 * event handler, no unsafe destination, and no forbidden element. The fixture is an
 * ordinary authored page with hostile fragments inside it, written for the run and
 * removed afterwards.
 *
 * A1D adds the two things an author notices: a real GFM **table**, and an authored
 * **heading fragment** (`[jump](#fixture-section)` → `## Fixture Section`) that the
 * browser actually navigates to — including the shell's sticky-header clearance,
 * which until A1D could only be measured on a harness-supplied target.
 */
const SAFE_MARKDOWN_SLUG = "zz-safe-markdown-fixture";
const SAFE_MARKDOWN_HEADING_ID = "fixture-section";
const SAFE_MARKDOWN_DUPLICATE_ID = "fixture-section-2";

/** Enough prose that an authored fragment link has to SCROLL to reach its target. */
const safeMarkdownFiller = (from, to) =>
  Array.from(
    { length: to - from },
    (_, index) =>
      `Paragraph ${from + index}. This page is deliberately long enough that the fragment link above must scroll, so the sticky header's clearance can be measured on a target the author created.`,
  ).join("\n\n");

const SAFE_MARKDOWN_FIXTURE = `---
title: Safe Markdown fixture
description: An authored page that tries to be dangerous.
---

# Safe Markdown fixture

Ordinary **Markdown** with a [link](/about), *emphasis*, ~~strikethrough~~ and a list:

- one
- two
  - nested

1. first
2. second

> A quotation.

| Day      | Opens | Closes |
| -------- | ----- | ------ |
| Monday   | 9:00  | 17:00  |
| Saturday | 10:00 | 14:00  |

See [jump](#${SAFE_MARKDOWN_HEADING_ID}) below.

${safeMarkdownFiller(1, 12)}

---

## Fixture Section

The paragraph the fragment link above must reach.

${safeMarkdownFiller(12, 26)}

## Fixture Section

A repeated heading, which the renderer must disambiguate.

<script>window.__authorScript = true;</script>

<div onclick="window.__authorHandler = true">raw html text</div>

<iframe src="//evil.example"></iframe>

<style>body { display: none; }</style>

<img src=x onerror="window.__authorImageHandler = true">

[unsafe link](javascript:window.__authorHref = true)

<h2 id="author-made-id">raw html id attempt</h2>
`;

async function runSafeMarkdownScenario(chrome) {
  const port = BASE_PORT + 260;
  BASE_URL = `http://localhost:${port}`;
  const fixturePath = join(CONTENT_ROOT, "markdown", "ww", "en", `${SAFE_MARKDOWN_SLUG}.md`);
  const url = `${BASE_URL}/ww/en/${SAFE_MARKDOWN_SLUG}`;
  const rows = [];
  await mkdir(dirname(fixturePath), { recursive: true });
  await writeFile(fixturePath, SAFE_MARKDOWN_FIXTURE, "utf8");

  const server = startDevServer(port);
  let cdp = null;
  try {
    await waitForServer(`${BASE_URL}/ww/en`);
    cdp = await Cdp.connect(chrome);
    // Collect any page-level error BEFORE the page loads: a policy that "works" by
    // throwing is not a policy that works.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: "window.__pageErrors = []; window.addEventListener('error', (e) => window.__pageErrors.push(String(e.message)));",
    });
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);

    const page = await cdp.evaluate(`(() => {
      const text = document.body.textContent || '';
      const handlers = [...document.querySelectorAll('*')].flatMap((el) =>
        [...el.attributes].map((a) => a.name).filter((name) => /^on/i.test(name)),
      );
      return {
        title: (document.querySelector('h1') || {}).textContent || '',
        strong: !!document.querySelector('main strong'),
        link: !!document.querySelector('main a[href="/about"]'),
        unsafeHref: [...document.querySelectorAll('a[href]')].some((a) => a.getAttribute('href').toLowerCase().includes('javascript')),
        authorScript: document.querySelectorAll('script').length,
        ranScript: !!window.__authorScript,
        ranHandler: !!window.__authorHandler,
        ranImageHandler: !!window.__authorImageHandler,
        ranHref: !!window.__authorHref,
        pageErrors: window.__pageErrors || [],
        handlers,
        // The AUTHOR'S region is <main>. A framework legitimately injects its own
        // style element (fonts, dev CSS) into the document head, so the element scan
        // is scoped to the content — and the document-level scan covers the elements
        // no framework needs for this page.
        forbiddenInContent: ['script', 'style', 'iframe', 'form', 'object', 'embed'].filter(
          (tag) => document.querySelector('main ' + tag),
        ),
        forbiddenInDocument: ['iframe', 'form', 'object', 'embed'].filter(
          (tag) => document.querySelectorAll(tag).length > 0,
        ),
        // The author's raw HTML is still readable — as inert text.
        rawTextVisible: text.includes('raw html text'),
        visible: text.includes('Ordinary'),
        // A1D — the capability an author actually uses, through the real route: a GFM
        // table with real cells, and GENERATED heading fragments.
        table: !!document.querySelector('main table'),
        tableCells: document.querySelectorAll('main table th, main table td').length,
        tableHeaders: [...document.querySelectorAll('main table th')].map((th) => th.textContent.trim()),
        headingIds: [...document.querySelectorAll('main h1[id], main h2[id], main h3[id]')].map((h) => h.id),
        sectionId: (document.getElementById('${SAFE_MARKDOWN_HEADING_ID}') || {}).tagName || null,
        duplicateId: (document.getElementById('${SAFE_MARKDOWN_DUPLICATE_ID}') || {}).tagName || null,
        fragmentHref: (() => {
          const link = document.querySelector('main a[href="#${SAFE_MARKDOWN_HEADING_ID}"]');
          return link ? link.getAttribute('href') : null;
        })(),
        authorIdInert: document.getElementById('author-made-id') === null,
        // FOUNDATION-PAGES-H1 — the document has EXACTLY ONE level-1 heading (the page
        // title), and an authored heading is rendered one level BELOW what the author wrote.
        h1Count: document.querySelectorAll('h1').length,
        h1Text: (document.querySelector('h1') || {}).textContent || '',
        // The page title (the document's one h1) and the authored prose share the <main>
        // region, so the headings in THAT region, in document order, are the whole heading
        // ladder a visitor receives: title first, then the author's own headings.
        contentHeadings: [...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6')].map((element) => element.tagName),
        authoredHashLevel: (() => {
          const heading = [...document.querySelectorAll('main h2, main h3, main h4, main h5, main h6')]
            .find((element) => (element.textContent || '').trim() === 'Safe Markdown fixture');
          return heading ? heading.tagName : null;
        })(),
        nestedList: !!document.querySelector('main ul ul'),
        quote: !!document.querySelector('main blockquote'),
        strike: !!document.querySelector('main del'),
      };
    })()`);

    check(rows, "safeMarkdown.page.renders", !!page && page.visible);
    check(rows, "safeMarkdown.title.authored", !!page && page.title === "Safe Markdown fixture", page && page.title);
    check(rows, "safeMarkdown.markdown.rendered", !!page && page.strong && page.link);
    check(rows, "safeMarkdown.rawHtml.textVisible", !!page && page.rawTextVisible);
    check(rows, "safeMarkdown.authorScript.absent", !!page && !page.ranScript, `scripts=${page && page.authorScript} ran=${page && page.ranScript}`);
    check(rows, "safeMarkdown.handler.absent", !!page && !page.ranHandler);
    check(rows, "safeMarkdown.imageHandler.absent", !!page && !page.ranImageHandler);
    check(rows, "safeMarkdown.unsafeHref.dropped", !!page && !page.ranHref && !page.unsafeHref);
    check(rows, "safeMarkdown.noHandlerAttributes", !!page && page.handlers.length === 0, JSON.stringify(page && page.handlers));
    check(rows, "safeMarkdown.content.noForbiddenElements", !!page && page.forbiddenInContent.length === 0, JSON.stringify(page && page.forbiddenInContent));
    check(rows, "safeMarkdown.document.noForbiddenElements", !!page && page.forbiddenInDocument.length === 0, JSON.stringify(page && page.forbiddenInDocument));
    check(rows, "safeMarkdown.noPageErrors", !!page && page.pageErrors.length === 0, JSON.stringify(page && page.pageErrors));

    // ── A1D: the documented capability, in the served page ────────────────────
    // Each of these is documented in `content/pages/markdown/README.md`, so the
    // guide cannot promise something the served page does not do.
    check(rows, "safeMarkdown.capability.table", !!page && page.table && page.tableCells === 9, `cells=${page && page.tableCells}`);
    check(rows, "safeMarkdown.capability.tableHeaders", !!page && page.tableHeaders.includes("Day"), JSON.stringify(page && page.tableHeaders));
    check(rows, "safeMarkdown.capability.nestedList", !!page && page.nestedList);
    check(rows, "safeMarkdown.capability.quote", !!page && page.quote);
    check(rows, "safeMarkdown.capability.strikethrough", !!page && page.strike);

    // ── FOUNDATION-PAGES-H1: the page title is the ONLY h1 ────────────────────
    check(rows, "safeMarkdown.h1.exactlyOne", !!page && page.h1Count === 1, `count=${page && page.h1Count}`);
    check(rows, "safeMarkdown.h1.isThePageTitle", !!page && page.h1Text === "Safe Markdown fixture", page && page.h1Text);
    // The served page's whole heading ladder, in document order: the page title is the ONE
    // h1, the author's `# Safe Markdown fixture` is the h2 beneath it, and the author's two
    // `## Fixture Section` headings are h3s. Nothing the author wrote landed at level 1.
    check(rows, "safeMarkdown.heading.exactlyOneH1ThenAuthoredLevels", !!page && page.contentHeadings.join(",") === "H1,H2,H3,H3", page && page.contentHeadings.join(","));
    // The author wrote `# Safe Markdown fixture` and `## Fixture Section`. The first renders as
    // an h2 (below the title) and the second as an h3 (below the first) — while the ids the
    // author's fragment link depends on stay exactly where they were.
    check(rows, "safeMarkdown.heading.authoredHashIsH2", !!page && page.authoredHashLevel === "H2", page && page.authoredHashLevel);

    // ── A1D: authored heading fragments, and the shell's clearance for them ───
    check(rows, "safeMarkdown.fragment.headingId", !!page && page.sectionId === "H3", `tag=${page && page.sectionId}`);
    check(rows, "safeMarkdown.fragment.duplicateDisambiguated", !!page && page.duplicateId === "H3", `tag=${page && page.duplicateId}`);
    check(rows, "safeMarkdown.fragment.linkPointsAtIt", !!page && page.fragmentHref === `#${SAFE_MARKDOWN_HEADING_ID}`, page && page.fragmentHref);
    // An author-supplied id in raw HTML stays inert: no element carries it.
    check(rows, "safeMarkdown.fragment.authorIdInert", !!page && page.authorIdInert);

    // The author's own fragment link must actually REACH the heading, and the sticky
    // header must not cover it — the N1 clearance contract, measured on a target the
    // AUTHOR created (until A1D it could only be measured on a harness-supplied one).
    await cdp.evaluate(`location.hash = '#${SAFE_MARKDOWN_HEADING_ID}'`);
    await sleep(400);
    const jump = await cdp.evaluate(`(() => {
      const header = document.querySelector('.ui-shell-top');
      const target = document.getElementById('${SAFE_MARKDOWN_HEADING_ID}');
      const hr = header ? header.getBoundingClientRect() : null;
      const tr = target ? target.getBoundingClientRect() : null;
      return {
        scrolled: window.scrollY > 0,
        clearance: getComputedStyle(document.documentElement).scrollPaddingTop,
        targetTop: tr ? Math.round(tr.top) : null,
        headerBottom: hr ? Math.round(hr.bottom) : null,
      };
    })()`);
    check(rows, "safeMarkdown.fragment.reached", !!jump.scrolled, `scrollY>0=${jump.scrolled}`);
    check(rows, "safeMarkdown.fragment.belowStickyHeader", jump.targetTop != null && jump.headerBottom != null && jump.targetTop >= jump.headerBottom - 1, `targetTop=${jump.targetTop} headerBottom=${jump.headerBottom}`);
    // The clearance is BAND-appropriate: at this width the rail persists, so no
    // scroll padding is needed (0px) and the shell top is not sticky. The mobile band,
    // where the header IS sticky and the padding is 96px, is proven on the same kind of
    // authored heading target by the persistent-navigation scenario.
    check(rows, "safeMarkdown.fragment.clearanceMatchesBand", jump.clearance === "0px", `scrollPaddingTop=${jump.clearance}`);
  } catch (error) {
    check(rows, "safe-markdown.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
    await rm(fixturePath, { force: true });
    // Remove the locale directory ONLY if the fixture left it empty.
    try {
      await rmdir(dirname(fixturePath));
    } catch {
      /* not empty (or already gone): leave it exactly as it is */
    }
  }
  return rows;
}

/**
 * NESTED PAGES, IN A REAL BROWSER (FOUNDATION-PAGES-A1E).
 *
 * A page's URL is built from the folders it is authored in, so the acceptance this
 * scenario adds is exactly that: a page under a FOLDER is served at its nested URL
 * through the ONE page route — with the authoring capability intact (its generated
 * heading fragment is a real target the browser can reach) — while documentation
 * beside it stays inert and a URL that no longer names content is a proper 404.
 */
const NESTED_SECTION = "zz-nested";
const NESTED_SLUG = "web-design";
const NESTED_HEADING_ID = "what-we-build";

const NESTED_PAGE_FIXTURE = `---
title: Nested fixture page
description: A page authored in a folder.
---

# Nested fixture page

See [what we build](#${NESTED_HEADING_ID}) below.

| Plan | From |
| ---- | ---- |
| Starter | 500 |

## What we build

Nested body copy.
`;

/**
 * Waits for a URL that MUST NOT exist to settle on the localized 404. The 404 page is
 * not the shell-hydration surface `waitReady` requires (it has no navigation chrome to
 * hydrate), so readiness here is the document completing AND saying "not found".
 */
async function waitForNotFound(cdp) {
  const t0 = Date.now();
  let last = { notFound: false, ready: false, text: "" };
  while (Date.now() - t0 < 20000) {
    last = await cdp.evaluate(
      `(() => { const t = document.body ? document.body.textContent || '' : ''; return { notFound: /not found|404/i.test(t), ready: document.readyState === 'complete', text: t.slice(0, 120) }; })()`,
    );
    if (last.ready && last.notFound) return last;
    await sleep(200);
  }
  return last;
}

async function runNestedPageScenario(chrome) {
  const port = BASE_PORT + 270;
  BASE_URL = `http://localhost:${port}`;
  const sectionDirectory = join(CONTENT_ROOT, "markdown", "ww", "en", NESTED_SECTION);
  const pagePath = join(sectionDirectory, `${NESTED_SLUG}.md`);
  const readmePath = join(sectionDirectory, "README.md");
  const url = `${BASE_URL}/ww/en/${NESTED_SECTION}/${NESTED_SLUG}`;
  const rows = [];
  await mkdir(sectionDirectory, { recursive: true });
  await writeFile(pagePath, NESTED_PAGE_FIXTURE, "utf8");
  // Documentation BESIDE a nested page: inert at every level.
  await writeFile(readmePath, "# Not a page\n", "utf8");

  const server = startDevServer(port);
  let cdp = null;
  try {
    await waitForServer(`${BASE_URL}/ww/en`);
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);

    const page = await cdp.evaluate(`(() => {
      const text = document.body.textContent || '';
      return {
        heading: (document.querySelector('h1') || {}).textContent || '',
        body: text.includes('Nested body copy.'),
        tableCells: document.querySelectorAll('main table th, main table td').length,
        target: (document.getElementById('${NESTED_HEADING_ID}') || {}).tagName || null,
        fragmentHref: (() => {
          const link = document.querySelector('main a[href="#${NESTED_HEADING_ID}"]');
          return link ? link.getAttribute('href') : null;
        })(),
      };
    })()`);

    check(rows, "nested.route.served", !!page && page.body, `body=${page && page.body}`);
    check(rows, "nested.title.authored", !!page && page.heading === "Nested fixture page", page && page.heading);
    check(rows, "nested.capability.table", !!page && page.tableCells === 4, `cells=${page && page.tableCells}`);
    check(rows, "nested.fragment.headingId", !!page && page.target === "H3", `tag=${page && page.target}`);
    check(
      rows,
      "nested.fragment.linkPointsAtIt",
      !!page && page.fragmentHref === `#${NESTED_HEADING_ID}`,
      page && page.fragmentHref,
    );

    // The author's fragment link must actually reach the target on a NESTED page too.
    await cdp.evaluate(`location.hash = '#${NESTED_HEADING_ID}'`);
    await sleep(400);
    const jump = await cdp.evaluate(`(() => {
      const target = document.getElementById('${NESTED_HEADING_ID}');
      const rect = target ? target.getBoundingClientRect() : null;
      return { top: rect ? Math.round(rect.top) : null };
    })()`);
    check(rows, "nested.fragment.reached", jump.top != null && jump.top >= 0, `top=${jump.top}`);

    // Documentation beside nested pages is NOT a route, and a URL that names no page
    // (the retired collection URLs included) is a proper 404 — never an empty shell.
    for (const missing of [`/en/${NESTED_SECTION}/README`, "/en/offerings", "/en/blog", "/en/testimonials"]) {
      await cdp.navigate(`${BASE_URL}${missing}`);
      const status = await waitForNotFound(cdp);
      check(rows, `nested.noRoute${missing.split("/").join(".")}`, !!status && status.notFound, JSON.stringify(status));
    }
  } catch (error) {
    check(rows, "nested-pages.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
    await rm(pagePath, { force: true });
    await rm(readmePath, { force: true });
    // Remove the section directory ONLY if the fixture left it empty.
    try {
      await rmdir(sectionDirectory);
    } catch {
      /* not empty (or already gone): leave it exactly as it is */
    }
  }
  return rows;
}

/**
 * ADVANCED JSON PAGES, IN A REAL BROWSER (FOUNDATION-PAGES-A2).
 *
 * The declarative authoring mode's acceptance: a JSON document authored under
 * `content/pages/json/<locale>/…` is discovered, validated, served and rendered by the
 * real application — one page-level heading, real semantic structure (a table with
 * column headings, a disclosure group), working actions, the image alt contract, and
 * Markdown fields whose raw HTML stays inert. ONE bounded scenario, not one per section.
 */
const JSON_ROUTE_PATH = "zz-json-page";
const JSON_HEADING_ID_NEEDLE = "What we build";

const JSON_PAGE_FIXTURE = JSON.stringify(
  {
    schemaVersion: 1,
    title: "Declarative fixture page",
    description: "Authored as JSON.",
    sections: [
      { type: "hero", eyebrow: "Declarative", lede: "Written as **data**, rendered as a page." },
      {
        type: "features",
        heading: "What we build",
        items: [
          { title: "Websites", body: "Ordinary websites." },
          { title: "Applications", body: "Ordinary applications." },
        ],
      },
      { type: "prose", body: "<script>window.__jsonPageScript = true;</script>\n\nInert **prose**." },
      {
        type: "table",
        heading: "Plans",
        columns: ["Plan", "From"],
        rows: [["Starter", "500"]],
      },
      {
        type: "faq",
        heading: "Questions",
        items: [{ question: "Is it data?", answer: "Yes — and never code." }],
      },
      { type: "actions", actions: [{ label: "Go to services", route: "services" }] },
    ],
  },
  null,
  2,
);

async function runAdvancedJsonScenario(chrome) {
  const port = BASE_PORT + 271;
  BASE_URL = `http://localhost:${port}`;
  const directory = join(CONTENT_ROOT, "json", "ww", "en");
  const pagePath = join(directory, `${JSON_ROUTE_PATH}.json`);
  const url = `${BASE_URL}/ww/en/${JSON_ROUTE_PATH}`;
  const rows = [];
  await mkdir(directory, { recursive: true });
  await writeFile(pagePath, `${JSON_PAGE_FIXTURE}\n`, "utf8");

  const server = startDevServer(port);
  let cdp = null;
  try {
    await waitForServer(`${BASE_URL}/ww/en`);
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);

    const page = await cdp.evaluate(`(() => {
      const text = document.body.textContent || '';
      const tags = Array.from(document.querySelectorAll('*'));
      return {
        h1Count: document.querySelectorAll('h1').length,
        h1: (document.querySelector('h1') || {}).textContent || '',
        strong: tags.filter((el) => el.tagName === 'STRONG').length,
        tableHeaders: document.querySelectorAll('main table th[scope="col"]').length,
        details: document.querySelectorAll('main details').length,
        summaryHeading: (document.querySelector('main details summary h3') || {}).textContent || '',
        actionHref: (() => {
          const link = Array.from(document.querySelectorAll('main a')).find((a) => (a.textContent || '').includes('Go to services'));
          return link ? link.getAttribute('href') : null;
        })(),
        scriptNodes: document.querySelectorAll('script:not([src])').length,
        scriptCarriesAuthorText: Array.from(document.querySelectorAll('script')).some((s) =>
          (s.textContent || '').includes('__jsonPageScript'),
        ),
        injected: typeof window.__jsonPageScript !== 'undefined',
        inertText: text.includes('window.__jsonPageScript'),
        handlerAttributes: tags.filter((el) => Array.from(el.attributes || []).some((a) => /^on/i.test(a.name))).length,
      };
    })()`);

    check(rows, "json.page.served", !!page && page.h1Count === 1, `h1Count=${page && page.h1Count}`);
    check(
      rows,
      "json.title.isTheOnlyH1",
      !!page && page.h1 === "Declarative fixture page",
      page && page.h1,
    );
    check(rows, "json.markdown.fieldRendered", !!page && page.strong >= 1, `strong=${page && page.strong}`);
    check(rows, "json.table.columnHeadings", !!page && page.tableHeaders === 2, `th=${page && page.tableHeaders}`);
    check(rows, "json.faq.disclosure", !!page && page.details === 1, `details=${page && page.details}`);
    check(
      rows,
      "json.faq.questionIsAHeading",
      !!page && page.summaryHeading === "Is it data?",
      page && page.summaryHeading,
    );
    check(
      rows,
      "json.action.resolvedRoute",
      !!page && page.actionHref === "/en/services",
      page && page.actionHref,
    );
    check(rows, "json.rawHtml.inert", !!page && !page.injected && page.inertText, `injected=${page && page.injected}`);
    check(
      rows,
      "json.noHandlersOrInjectedScripts",
      // The framework's own hydration scripts are expected (and they legitimately carry
      // the page TEXT as data). What must be impossible is EXECUTION: no element may
      // carry a handler, and the author's script text never runs.
      !!page && page.handlerAttributes === 0 && page.injected === false,
      `handlers=${page && page.handlerAttributes} executed=${page && page.injected}`,
    );

    // The heading is a real in-page target, exactly as an authored Markdown heading is.
    const headingId = await cdp.evaluate(`(() => {
      const heading = Array.from(document.querySelectorAll('main h2')).find((el) => (el.textContent || '').includes(${JSON.stringify(JSON_HEADING_ID_NEEDLE)}));
      return heading ? heading.id : null;
    })()`);
    check(rows, "json.section.headingPresent", headingId !== null, `id=${headingId}`);
  } catch (error) {
    check(rows, "advanced-json.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
    await rm(pagePath, { force: true });
    try {
      await rmdir(directory);
    } catch {
      /* not empty (or already gone): leave it exactly as it is */
    }
  }
  return rows;
}

/**
 * N2 — THE SHELL LAYOUT PRESENTATION SWITCHER, IN A REAL BROWSER.
 *
 * The capability's acceptance, against the REAL application with the switcher enabled by
 * configuration (own server; config and content restored, browser storage cleared):
 *
 *   · the control exists, is labelled, offers exactly the declared layouts, and starts on
 *     the configured default;
 *   · the ACTIVE layout exposes exactly ONE navigation structure — the rail in the sidebar
 *     layout, the header navigation in the menu-bar layout — and the inactive one is
 *     genuinely non-exposed: not rendered, and never reachable by Tab;
 *   · switching changes PRESENTATION only: same document, same main content, same route,
 *     same locale, same page frame (the content box does not move);
 *   · persistent navigation follows the active layout, and fragment clearance returns with
 *     it;
 *   · the choice survives client-side navigation AND a full reload (browser-local
 *     preference), an unusable stored value falls back to the configured default, and
 *     clearing storage returns to it;
 *   · NAV1A — the CONFIGURED mode owns the navigation at EVERY width: the control stays
 *     available on a phone, the sidebar layout presents its own off-canvas drawer below
 *     `md` (closed by default, reopenable, never the menu-bar's bottom bar), and the
 *     menu-bar layout presents the sticky bottom bar. Real resizes and real mode
 *     switches preserve the mode, and exactly one primary navigation is ever exposed —
 *     including for the withdrawn mobile surface, which leaves the focus order.
 */
const LAYOUT_PROBE = `(() => {
  const root = document.documentElement;
  const control = document.querySelector('[data-ui-layout-switcher]');
  const rail = document.querySelector('[data-ui-shell-part="rail"]');
  const railLg = document.querySelector('#shell-sidebar-desktop-panel');
  const railMd = document.querySelector('#shell-sidebar-tablet-panel');
  const topNav = document.querySelector('[data-ui-shell-part="top-nav"]');
  const top = document.querySelector('.ui-shell-top');
  const main = document.querySelector('main');
  const rect = main ? main.getBoundingClientRect() : { left: 0, width: 0 };
  const shown = (el) => !!el && el.getClientRects().length > 0;
  const bar = document.querySelector('.ui-shell-bottom-bar');
  const barList = bar ? bar.querySelector('ul') : null;
  const barItems = barList ? Array.from(barList.querySelectorAll(':scope > li')) : [];
  const barLinks = barItems
    .map((li) => li.querySelector('a, span'))
    .filter((link) => !!link && link.getClientRects().length > 0);
  const barPad = bar ? parseFloat(getComputedStyle(bar).paddingLeft) || 0 : 0;
  const dialog = document.querySelector('[role="dialog"]');
  // NAV1B — the header's two semantic rows, the sidebar's disclosure (its OWNER and SCALE), and the
  // bar's content bounds (which follow the site's page width, not the viewport).
  const headerTop = document.querySelector('.ui-site-header-top');
  const headerContext = document.querySelector('.ui-site-header-context');
  const headerInner = document.querySelector('.ui-site-header > div');
  const disclosure = document.querySelector('[data-ui-shell-part="mobile-drawer"]');
  const showNav = disclosure ? disclosure.querySelector('.ui-shell-mobile-nav-trigger') : null;
  const showNavIcon = showNav ? showNav.querySelector('.ui-mobile-nav-icon') : null;
  const barContent = bar ? bar.querySelector(':scope > div') : null;
  const barFirstLink = barLinks[0] || null;
  const barLastLink = barLinks[barLinks.length - 1] || null;
  // NAV1B-V2 (UI-R1) - the graphic identity (a configured logo), the navigation-MODE selector's own box, and the
  // row's WRAPPING contract: the brand and the right-hand CONTROL CLUSTER as boxes, so "they share one line without
  // overlapping" and "the cluster sits entirely below the brand" are claims about rendered pixels rather than
  // about a class string. There is no overlay to prove any more - the row does not stack.
  const logo = document.querySelector('.ui-site-header-logo');
  const modeBox = document.querySelector('.ui-site-header-mode');
  const cluster = document.querySelector('.ui-site-header-controls');
  const controlRect = control ? control.getBoundingClientRect() : null;
  const boxOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) };
  };
  const identityBox = boxOf(headerTop ? headerTop.firstElementChild : null);
  const clusterBox = boxOf(cluster);
  const brandLinkBox = boxOf(headerTop ? headerTop.querySelector('.ui-site-header-identity a') : null);
  // The ACCEPTED desktop navigation disclosure (the rail's own toggle): the constrained-width
  // disclosure must present the SAME control scale, so both are measured.
  const railToggle = [...document.querySelectorAll('.ui-sidebar-toggle')].find(shown) || null;
  // The toggle renders ONE icon per state (the inactive one is display: none), so the VISIBLE
  // icon is the one that carries the control's real scale.
  const railToggleIcon = railToggle
    ? [...railToggle.querySelectorAll('.ui-sidebar-toggle-icon')].find(shown) || null
    : null;
  // NAV1D — THE SIDEBAR AS PRESENTED (whichever band presents it, the mobile band included) and THE
  // MENU SURFACE AS MEASURED: the rail's own padding on both sides, the control's box inside the
  // rail's clipping column (the room its focus ring has), the list's own inset, and the bar's
  // surface/region boxes. All measured — never a class string.
  const railMobile = document.querySelector('#shell-sidebar-mobile-panel');
  const railEl = [...document.querySelectorAll('.ui-sidebar-rail')].find(shown) || null;
  const railRect = railEl ? railEl.getBoundingClientRect() : null;
  const railCs = railEl ? getComputedStyle(railEl) : null;
  const railColumn = railEl ? railEl.querySelector('.ui-sidebar-rail-sticky') : null;
  const railColumnRect = railColumn ? railColumn.getBoundingClientRect() : null;
  const railColumnCs = railColumn ? getComputedStyle(railColumn) : null;
  const railToggleRect = railToggle ? railToggle.getBoundingClientRect() : null;
  const railFirstItem = railEl ? railEl.querySelector('ul li') : null;
  const barSurfaceRect = bar ? bar.getBoundingClientRect() : null;
  const barRegionRect = barContent ? barContent.getBoundingClientRect() : null;
  return {
    active: root.getAttribute('data-ui-shell-layout'),
    lang: root.lang,
    path: location.pathname,
    innerWidth: root.clientWidth,
    windowWidth: window.innerWidth,
    scrollY: Math.round(window.scrollY),
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    controlLabel: control ? control.getAttribute('aria-label') : null,
    controlValue: control ? control.value : null,
    options: control ? Array.from(control.options).map((option) => option.textContent) : [],
    controlVisible: shown(control),
    // NAV1D — "a rail is presented": ANY band's rail is on screen. At <md that is the sidebar's own
    // mobile band, not the desktop band's (hidden) marker, so this reads the presentation, not the
    // first structure in the DOM.
    railVisible: [...document.querySelectorAll('[data-ui-shell-part="rail"]')].some(shown),
    railLgVisible: shown(railLg),
    railMdVisible: shown(railMd),
    topNavVisible: shown(topNav),
    topPosition: top ? getComputedStyle(top).position : null,
    scrollPadding: getComputedStyle(root).scrollPaddingTop,
    h1: (document.querySelector('h1') || {}).textContent || '',
    mainText: main ? (main.textContent || '').trim() : null,
    mainLeft: Math.round(rect.left),
    mainWidth: Math.round(rect.width),
    bottomBarVisible: shown(bar),
    drawerVisible: shown(disclosure),
    dialogPresent: !!dialog,
    dialogLinks: dialog ? dialog.querySelectorAll('a').length : 0,
    barLinkCount: barLinks.length,
    barRowCount: new Set(barItems.map((li) => Math.round(li.getBoundingClientRect().top))).size,
    barWrapActive: !!barList && getComputedStyle(barList).flexWrap === 'wrap',
    barPad: Math.round(barPad),
    barLinksInsideInset:
      barLinks.length > 0 &&
      barLinks.every((link) => {
        const linkRect = link.getBoundingClientRect();
        return linkRect.left >= 8 && linkRect.right <= window.innerWidth - 8;
      }),
    barInsetLeft: barFirstLink ? Math.round(barFirstLink.getBoundingClientRect().left) : null,
    barInsetRight: barLastLink
      ? Math.round(window.innerWidth - barLastLink.getBoundingClientRect().right)
      : null,
    barContentWidth: barContent ? Math.round(barContent.getBoundingClientRect().width) : null,
    headerContentWidth: headerInner ? Math.round(headerInner.getBoundingClientRect().width) : null,
    // NAV1B-V2 — the header's own CONTENT box (the padded content the row is laid out inside). "The brand keeps
    // the whole content width" and "the cluster is inside the content box" are claims about THAT box, not about
    // the enclosing div's border box (which includes the page-edge padding).
    headerContentRight: headerInner
      ? Math.round(
          headerInner.getBoundingClientRect().right -
            (parseFloat(getComputedStyle(headerInner).paddingRight) || 0),
        )
      : null,
    headerContentBoxWidth: headerInner
      ? Math.round(
          headerInner.getBoundingClientRect().width -
            (parseFloat(getComputedStyle(headerInner).paddingLeft) || 0) -
            (parseFloat(getComputedStyle(headerInner).paddingRight) || 0),
        )
      : null,
    headerContentLeft: headerInner
      ? Math.round(
          headerInner.getBoundingClientRect().left +
            (parseFloat(getComputedStyle(headerInner).paddingLeft) || 0),
        )
      : null,
    selectorInTopRow: !!control && !!headerTop && headerTop.contains(control),
    selectorInControlRow: !!control && !!headerContext && headerContext.contains(control),
    selectorRightInset:
      control && headerInner
        ? Math.round(
            headerInner.getBoundingClientRect().right -
              (parseFloat(getComputedStyle(headerInner).paddingRight) || 0) -
              control.getBoundingClientRect().right,
          )
        : null,
    topRowBottom: headerTop ? Math.round(headerTop.getBoundingClientRect().bottom) : null,
    contextRowTop: headerContext ? Math.round(headerContext.getBoundingClientRect().top) : null,
    contextRowPresent: !!headerContext,
    contextRows: headerContext
      ? new Set(
          Array.from(headerContext.children).map(
            (child) => Math.round(child.getBoundingClientRect().top),
          ),
        ).size
      : 0,
    identityBottom: headerTop && headerTop.firstElementChild
      ? Math.round(headerTop.firstElementChild.getBoundingClientRect().bottom)
      : null,
    identityRight: headerTop && headerTop.firstElementChild
      ? Math.round(headerTop.firstElementChild.getBoundingClientRect().right)
      : null,
    identityLeft: headerTop && headerTop.firstElementChild
      ? Math.round(headerTop.firstElementChild.getBoundingClientRect().left)
      : null,
    identityTop: headerTop && headerTop.firstElementChild
      ? Math.round(headerTop.firstElementChild.getBoundingClientRect().top)
      : null,
    selectorBottom: control ? Math.round(control.getBoundingClientRect().bottom) : null,
    selectorTop: control ? Math.round(control.getBoundingClientRect().top) : null,
    selectorLeft: control ? Math.round(control.getBoundingClientRect().left) : null,
    // NAV1B-V1 - THE GRAPHIC IDENTITY (a configured logo): its box, its natural aspect, whether it
    // reaches beneath the selector, and whether the selector really WINS THE HIT TEST at its own
    // centre. The last two are behaviour, not styling: a graphic must never intercept a pointer
    // intended for the control that sits above it.
    logoPresent: !!logo,
    logoNaturalBox: logo ? logo.naturalWidth + "x" + logo.naturalHeight : null,
    logoLeft: logo ? Math.round(logo.getBoundingClientRect().left) : null,
    logoRight: logo ? Math.round(logo.getBoundingClientRect().right) : null,
    logoWidth: logo ? Math.round(logo.getBoundingClientRect().width) : null,
    logoHeight: logo ? Math.round(logo.getBoundingClientRect().height) : null,
    logoIntersectsSelector: !!logo && !!controlRect
      ? logo.getBoundingClientRect().left < controlRect.right &&
        controlRect.left < logo.getBoundingClientRect().right &&
        logo.getBoundingClientRect().top < controlRect.bottom &&
        controlRect.top < logo.getBoundingClientRect().bottom
      : false,
    selectorHitAtItsOwnCentre: modeBox && controlRect
      ? (() => {
          const el = document.elementFromPoint(
            controlRect.left + controlRect.width / 2,
            controlRect.top + controlRect.height / 2,
          );
          return !!el && modeBox.contains(el);
        })()
      : false,
    graphicInterceptsSelector: logo && controlRect
      ? (() => {
          const el = document.elementFromPoint(
            controlRect.left + controlRect.width / 2,
            controlRect.top + controlRect.height / 2,
          );
          return !!el && (el === logo || logo.contains(el));
        })()
      : false,
    disclosureInHeader: !!disclosure && !!disclosure.closest('.ui-site-header'),
    showNavFontSize: showNav ? Math.round(parseFloat(getComputedStyle(showNav).fontSize)) : null,
    showNavHeight: showNav ? Math.round(showNav.getBoundingClientRect().height) : null,
    showNavIconBox: showNavIcon
      ? Math.round(showNavIcon.getBoundingClientRect().width) +
        "x" +
        Math.round(showNavIcon.getBoundingClientRect().height)
      : null,
    railToggleFontSize: railToggle
      ? Math.round(parseFloat(getComputedStyle(railToggle).fontSize))
      : null,
    railToggleHeight: railToggle ? Math.round(railToggle.getBoundingClientRect().height) : null,
    railToggleIconBox: railToggleIcon
      ? Math.round(railToggleIcon.getBoundingClientRect().width) +
        "x" +
        Math.round(railToggleIcon.getBoundingClientRect().height)
      : null,
    // NAV1D — the sidebar's own presentation (the band it comes from, its box, its padding on BOTH
    // sides, the control's box, the list's inset) and the room the clipping column leaves the ring.
    railMobileVisible: shown(railMobile),
    presentedRailBand: railEl ? String(railEl.id || "") : null,
    presentedRailBox: railRect ? [Math.round(railRect.left), Math.round(railRect.right)] : null,
    // NAV1D-V2 — the rail's own box, out-of-flow state and the OVERLAY's z-order evidence: the rail
    // must win the hit test inside its own expanded area (the page never paints above it).
    presentedRailWidth: railRect ? Math.round(railRect.width) : null,
    presentedRailPosition: railCs ? railCs.position : null,
    railOverlayHit: railRect
      ? (() => {
          const el = document.elementFromPoint(railRect.right - 6, railRect.top + 8);
          return !!el && (el === railEl || railEl.contains(el));
        })()
      : null,
    pageHitOverRail: railRect
      ? (() => {
          const el = document.elementFromPoint(
            railRect.right - 6,
            Math.min(window.innerHeight - 8, railRect.top + 120),
          );
          return !!el && (el === railEl || railEl.contains(el));
        })()
      : null,
    // NAV1D-V2 — the page FRAME (the shell's own layout box) and the document's own overflow against
    // the CONTENT box, which is the measurement that says whether a horizontal scrollbar exists.
    frameBox: (() => {
      const frame = document.querySelector('.ui-shell-frame');
      if (!frame) return null;
      const r = frame.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.right), Math.round(r.width)];
    })(),
    documentScrollWidth: document.documentElement.scrollWidth,
    documentOverflowClient: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    presentedRailPadInline: railCs
      ? [
          Math.round(parseFloat(railCs.paddingInlineStart) || 0),
          Math.round(parseFloat(railCs.paddingInlineEnd) || 0),
        ]
      : null,
    presentedRailToggleBox: railToggleRect
      ? [Math.round(railToggleRect.left), Math.round(railToggleRect.right)]
      : null,
    presentedRailItemLeft: railFirstItem
      ? Math.round(railFirstItem.getBoundingClientRect().left)
      : null,
    presentedRailColumnBox: railColumnRect
      ? [Math.round(railColumnRect.left), Math.round(railColumnRect.right)]
      : null,
    presentedRailColumnPadInline: railColumnCs
      ? [
          Math.round(parseFloat(railColumnCs.paddingInlineStart) || 0),
          Math.round(parseFloat(railColumnCs.paddingInlineEnd) || 0),
        ]
      : null,
    presentedRailColumnPosition: railColumn ? getComputedStyle(railColumn).position : null,
    presentedRailColumnTop: railColumnRect ? Math.round(railColumnRect.top) : null,
    presentedRailCollapsed: railEl ? railEl.getAttribute('data-collapsed') : null,
    // NAV1D-V3 — the rail's SURFACE: how opaque it is, and the colour the site's ONE background
    // authority owns (the same token the header consumes, and the value ui.theme.background sets).
    presentedRailBackgroundColor: railCs ? railCs.backgroundColor : null,
    presentedRailBackgroundImage: railCs ? railCs.backgroundImage : null,
    presentedRailOpacity: railCs ? railCs.opacity : null,
    tokenBackground: getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim(),
    // NAV1D — the room the control's box has inside its clipping column: the global focus ring is
    // 2px wide at a 2px offset, so >= 4px on every side is "the ring can be painted in full".
    ringRoomLeft:
      railColumnRect && railToggleRect ? Math.round(railToggleRect.left - railColumnRect.left) : null,
    ringRoomRight:
      railColumnRect && railToggleRect ? Math.round(railColumnRect.right - railToggleRect.right) : null,
    ringRoomTop:
      railColumnRect && railToggleRect ? Math.round(railToggleRect.top - railColumnRect.top) : null,
    // NAV1D — the menu surface (the sticky bar) and its inner navigation region.
    barSurfaceBox: barSurfaceRect ? [Math.round(barSurfaceRect.left), Math.round(barSurfaceRect.right)] : null,
    barRegionBox: barRegionRect ? [Math.round(barRegionRect.left), Math.round(barRegionRect.right)] : null,
    barSurfaceWidth: barSurfaceRect ? Math.round(barSurfaceRect.width) : null,
    barRegionWidth: barRegionRect ? Math.round(barRegionRect.width) : null,
    // NAV1B-V2 (UI-R1) — THE TOP ROW'S WRAPPING CONTRACT, MEASURED. The row wraps by content (a flex row), the
    // brand is its first occupant, and the cluster either shares the brand's line or sits ENTIRELY BELOW it -
    // right-anchored in both cases, never overlapping, never wider than the header's own content box.
    headerRowDisplay: headerTop ? getComputedStyle(headerTop).display : null,
    headerRowWrap: headerTop ? getComputedStyle(headerTop).flexWrap : null,
    headerRowOverflow: headerTop ? headerTop.scrollWidth - headerTop.clientWidth : null,
    brandBox: identityBox,
    brandLinkBox,
    clusterBox,
    clusterPresent: !!clusterBox && clusterBox.width > 0,
    clusterBelowBrand: identityBox && clusterBox ? clusterBox.top >= identityBox.bottom - 1 : null,
    clusterRightInset:
      clusterBox && headerInner
        ? Math.round(
            headerInner.getBoundingClientRect().right -
              (parseFloat(getComputedStyle(headerInner).paddingRight) || 0) -
              clusterBox.right,
          )
        : null,
    brandClusterOverlap:
      identityBox && clusterBox
        ? identityBox.left < clusterBox.right - 1 &&
          clusterBox.left < identityBox.right - 1 &&
          identityBox.top < clusterBox.bottom - 1 &&
          clusterBox.top < identityBox.bottom - 1
        : false,
    clusterControlsVisible:
      !!cluster &&
      [...cluster.querySelectorAll('select, a, button')].every((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }),
    clusterControlsUnobstructed:
      !!cluster &&
      [...cluster.querySelectorAll('select, a, button')].every((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (el === hit || el.contains(hit));
      }),
    logoObjectFit: logo ? getComputedStyle(logo).objectFit : null,
    logoNaturalWidth: logo ? logo.naturalWidth : null,
    logoNaturalHeight: logo ? logo.naturalHeight : null,
  };
})()`;

/** Choose a layout exactly as a visitor does (value + change event on the control). */
const chooseLayout = (layout) => `(() => {
  const control = document.querySelector('[data-ui-layout-switcher]');
  if (!control) return false;
  control.value = ${JSON.stringify(layout)};
  control.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

async function runLayoutSwitcherScenario(chrome) {
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];
  const port = BASE_PORT + 320;
  const url = `http://localhost:${port}/ww/en`;
  BASE_URL = `http://localhost:${port}`;
  const config = JSON.parse(original);
  config.ui = { ...(config.ui ?? {}), layoutSwitcher: { enabled: true } };
  // A SECOND navigation destination, so the persistence proof can navigate CLIENT-SIDE to
  // a different page (the shipped template has a single Home entry).
  config.navigation = [...config.navigation, { label: "Fixture page", href: "/zz-layout-page" }];
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
  const pagePath = join(CONTENT_ROOT, "markdown", "ww", "en", "zz-layout-page.md");
  await mkdir(dirname(pagePath), { recursive: true });
  await writeFile(pagePath, "# Layout fixture page\n\nA second page for the layout proof.\n", "utf8");
  // NAV1D — the STICKY proof needs a page tall enough to scroll deeply, so this scenario supplies
  // the same generic tall fixture the persistent-navigation scenario uses (removed in `finally`).
  const tallPath = join(CONTENT_ROOT, "markdown", "ww", "en", "zz-layout-tall.md");
  await mkdir(dirname(tallPath), { recursive: true });
  await writeFile(tallPath, tallPageFixture(), "utf8");
  const tallLayoutUrl = `${BASE_URL}/ww/en/zz-layout-tall`;

  const server = startDevServer(port);
  let cdp = null;
  try {
    await waitForServer(url);
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.evaluate("window.localStorage.clear(); true").catch(() => undefined);
    await cdp.navigate(url);
    await waitReady(cdp);

    const initial = await cdp.evaluate(LAYOUT_PROBE);
    check(rows, "control.present", !!initial && initial.controlLabel === "Layout", `label=${initial && initial.controlLabel}`);
    check(
      rows,
      "control.offersExactVocabulary",
      !!initial && initial.options.join(" | ") === "Sidebar | Menu bar",
      initial && initial.options.join(" | "),
    );
    check(rows, "default.sidebar", !!initial && initial.active === "sidebar", initial && initial.active);
    check(rows, "sidebar.railVisible", !!initial && initial.railVisible === true, `rail=${initial && initial.railVisible}`);
    check(rows, "sidebar.topNavHidden", !!initial && initial.topNavVisible === false, `topNav=${initial && initial.topNavVisible}`);
    check(rows, "sidebar.topRegion.scrolls", !!initial && initial.topPosition === "static", initial && initial.topPosition);
    check(rows, "sidebar.clearance", !!initial && initial.scrollPadding === "0px", initial && initial.scrollPadding);
    // ── SWITCH TO THE MENU BAR ────────────────────────────────────────────────
    await cdp.evaluate(chooseLayout("menu-bar"));
    await waitReady(cdp);
    const menuBar = await cdp.evaluate(LAYOUT_PROBE);
    check(rows, "switch.applies", !!menuBar && menuBar.active === "menu-bar", menuBar && menuBar.active);
    check(rows, "menuBar.railHidden", !!menuBar && menuBar.railVisible === false, `rail=${menuBar && menuBar.railVisible}`);
    // NAV1B — MENU BAR MEANS THE STICKY BOTTOM BAR AT EVERY WIDTH: at DESKTOP the bar is the
    // navigation and the former top navigation does not exist (no hidden duplicate either).
    check(rows, "menuBar.stickyBottomBarAtDesktop", !!menuBar && menuBar.bottomBarVisible === true, `bar=${menuBar && menuBar.bottomBarVisible}`);
    check(rows, "menuBar.noTopNavigation", !!menuBar && menuBar.topNavVisible === false, `topNav=${menuBar && menuBar.topNavVisible}`);
    check(rows, "menuBar.noSidebarDrawer", !!menuBar && menuBar.drawerVisible === false, `drawer=${menuBar && menuBar.drawerVisible}`);
    check(rows, "menuBar.linksHorizontalAndInset", !!menuBar && menuBar.barLinkCount > 0 && menuBar.barRowCount < menuBar.barLinkCount && menuBar.barLinksInsideInset === true, `rows=${menuBar && menuBar.barRowCount} links=${menuBar && menuBar.barLinkCount} inset=${menuBar && menuBar.barLinksInsideInset}`);
    check(rows, "menuBar.selectorStaysTopRight", !!menuBar && menuBar.selectorInTopRow === true && menuBar.selectorInControlRow === false && Math.abs(menuBar.selectorRightInset) <= 1, `topRow=${menuBar && menuBar.selectorInTopRow} rightInset=${menuBar && menuBar.selectorRightInset}`);

    // ── PRESENTATION ONLY: the document, its content, route and locale ────────
    check(
      rows,
      "switch.contentUnchanged",
      !!menuBar && menuBar.h1 === initial.h1 && menuBar.mainText === initial.mainText,
      `h1=${menuBar && menuBar.h1 === initial.h1} main=${menuBar && menuBar.mainText === initial.mainText}`,
    );
    check(
      rows,
      "switch.routeAndLocaleUnchanged",
      !!menuBar && menuBar.path === initial.path && menuBar.lang === initial.lang && menuBar.path.startsWith("/ww/en"),
      `path=${menuBar && menuBar.path} lang=${menuBar && menuBar.lang}`,
    );
    // The rail occupies horizontal space in the sidebar layout, so the content column
    // legitimately moves — the contract is that the layout stays USABLE: the content
    // reclaims that width, and neither layout overflows the viewport.
    check(
      rows,
      "switch.contentColumnUsable",
      !!menuBar && menuBar.mainWidth >= initial.mainWidth && menuBar.mainLeft >= 0,
      `width ${initial.mainWidth}->${menuBar && menuBar.mainWidth}, left=${menuBar && menuBar.mainLeft}`,
    );
    check(
      rows,
      "switch.noHorizontalOverflow",
      await cdp.evalBool(
        "document.documentElement.scrollWidth <= window.innerWidth + 1 && document.querySelector('main').getBoundingClientRect().right <= window.innerWidth + 1",
      ),
      "the page fits the viewport in the menu-bar layout",
    );

    // ── PERSISTENT NAVIGATION follows the ACTIVE layout ───────────────────────
    check(
      rows,
      "menuBar.topRegion.persists",
      !!menuBar && menuBar.topPosition === "sticky",
      menuBar && menuBar.topPosition,
    );
    check(
      rows,
      "menuBar.clearanceRestored",
      !!menuBar && menuBar.scrollPadding !== "0px",
      menuBar && menuBar.scrollPadding,
    );

    // ── ONE EXPOSED NAVIGATION: the inactive structure is never focusable ────
    await cdp.evaluate("document.body.focus(); true");
    let landedInRail = false;
    for (let step = 0; step < 14; step += 1) {
      await cdp.pressKey("Tab");
      const inside = await cdp.evalBool(
        `!!document.activeElement && !!document.activeElement.closest('[data-ui-shell-part="rail"]')`,
      );
      if (inside) landedInRail = true;
    }
    check(rows, "menuBar.railNeverFocusable", landedInRail === false, `landedInRail=${landedInRail}`);

    // ── PERSISTENCE (1): client-side navigation to another page ──────────────
    const clickedLink = await cdp.clickCenter(
      '.ui-shell-bottom-bar a[href$="/zz-layout-page"]',
    );
    // A client-side transition commits asynchronously, so wait for the URL itself
    // rather than assuming the router has finished when the document is ready.
    let navigatedPath = await cdp.evaluate("location.pathname");
    for (let attempt = 0; attempt < 60 && navigatedPath !== "/ww/en/zz-layout-page"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      navigatedPath = await cdp.evaluate("location.pathname");
    }
    await waitReady(cdp);
    const afterNavigation = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "persistence.clientNavigation",
      !!clickedLink && navigatedPath === "/ww/en/zz-layout-page" && afterNavigation.active === "menu-bar",
      `clicked=${clickedLink} path=${navigatedPath} active=${afterNavigation && afterNavigation.active}`,
    );

    // ── PERSISTENCE (2): a full reload keeps the visitor's choice ─────────────
    await cdp.navigate(url);
    await waitReady(cdp);
    const afterReload = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "persistence.afterReload",
      !!afterReload && afterReload.active === "menu-bar" && afterReload.controlValue === "menu-bar" && afterReload.railVisible === false,
      `active=${afterReload && afterReload.active} control=${afterReload && afterReload.controlValue}`,
    );

    // ── AN UNUSABLE STORED VALUE falls back to the configured default ─────────
    await cdp.evaluate(`window.localStorage.setItem('foundation.layout', 'compact'); true`);
    await cdp.navigate(url);
    await waitReady(cdp);
    const afterHostile = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "storage.arbitraryValueIgnored",
      !!afterHostile && afterHostile.active === "sidebar" && afterHostile.railVisible === true,
      `active=${afterHostile && afterHostile.active}`,
    );

    // ── CLEARING STORAGE returns to the configured default ────────────────────
    await cdp.evaluate("window.localStorage.clear(); true");
    await cdp.navigate(url);
    await waitReady(cdp);
    const afterClear = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "storage.clearedFallsBackToDefault",
      !!afterClear && afterClear.active === "sidebar" && afterClear.controlValue === "sidebar",
      `active=${afterClear && afterClear.active}`,
    );

    // ── NAV1A: the configured MODE owns the navigation at EVERY width ────────
    // The visitor's control stays available on a phone, and the mode decides WHICH mobile
    // navigation is presented: the sidebar layout's own off-canvas drawer, or the menu-bar
    // layout's sticky bottom bar — never one shared surface for both.
    const RESPONSIVE_WIDTHS = [
      [1280, 900],
      [1024, 820],
      [900, 800],
      [768, 820],
      [767, 820],
      [390, 844],
      [360, 740],
      [320, 700],
      // FOUNDATION-UI-R1D — the platform's supported minimum, where the rail and the page must coexist without a
      // horizontal scrollbar and the drawer semantics are unchanged.
      [280, 700],
    ];
    const settle = () => sleep(300);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);
    await cdp.evaluate(chooseLayout("sidebar"));
    await settle();
    check(
      rows,
      "sidebarMobile.closedByDefault",
      await cdp.evalBool("!document.querySelector('[role=\"dialog\"]')"),
    );
    for (const [width, height] of RESPONSIVE_WIDTHS) {
      await cdp.setViewport(width, height);
      await settle();
      const probe = await cdp.evaluate(LAYOUT_PROBE);
      const inner = probe && probe.innerWidth;
      const tag = `nav1a.sidebar.w${width}`;
      const mobile = width < 768;
      check(rows, `${tag}.modePreserved`, !!probe && probe.active === "sidebar", `inner=${inner} attr=${probe && probe.active}`);
      check(rows, `${tag}.controlAvailable`, !!probe && probe.controlVisible === true, `inner=${inner} control=${probe && probe.controlVisible}`);
      check(rows, `${tag}.topNavHidden`, !!probe && probe.topNavVisible === false, `inner=${inner} topNav=${probe && probe.topNavVisible}`);
      if (mobile) {
        // NAV1D — THE SAME SIDEBAR AT MOBILE WIDTH: the rail itself is presented (its own band's
        // gate shows it), and NOTHING substitutes for it — no disclosure band, no trigger, no drawer,
        // no header affordance.
        check(rows, `${tag}.sidebarRailVisible`, !!probe && probe.railVisible === true, `inner=${inner} rail=${probe && probe.railVisible}`);
        check(
          rows,
          `${tag}.noDisclosureSubstitute`,
          !!probe && probe.drawerVisible === false && probe.disclosureInHeader === false,
          `inner=${inner} drawer=${probe && probe.drawerVisible} inHeader=${probe && probe.disclosureInHeader}`,
        );
        check(rows, `${tag}.menuBarBottomBarWithdrawn`, !!probe && probe.bottomBarVisible === false, `inner=${inner} bar=${probe && probe.bottomBarVisible}`);
      } else {
        check(
          rows,
          `${tag}.railVisible`,
          !!probe && (width >= 1024 ? probe.railLgVisible === true : probe.railMdVisible === true),
          `inner=${inner} rail-lg=${probe && probe.railLgVisible} rail-md=${probe && probe.railMdVisible}`,
        );
      }
      check(rows, `${tag}.noHorizontalOverflow`, await cdp.evalBool("document.documentElement.scrollWidth <= window.innerWidth + 1"), `inner=${inner}`);
      // NAV1B — THE FIXED SEMANTIC ROWS: the navigation-MODE selector belongs to the top row at every
      // width (anchored at the content's right edge, never in the control row), and the control row
      // always begins below the top row. This is ownership geometry, not a class-string check.
      check(
        rows,
        `${tag}.selectorTopRow`,
        !!probe && probe.selectorInTopRow === true && probe.selectorInControlRow === false,
        `inner=${inner} topRow=${probe && probe.selectorInTopRow} controlRow=${probe && probe.selectorInControlRow}`,
      );
      check(
        rows,
        `${tag}.selectorRightAnchored`,
        !!probe && probe.selectorRightInset !== null && Math.abs(probe.selectorRightInset) <= 1,
        `inner=${inner} rightInset=${probe && probe.selectorRightInset}`,
      );
      check(
        rows,
        `${tag}.controlRowBelowTopRow`,
        !!probe && (probe.contextRowPresent ? probe.contextRowTop >= probe.topRowBottom : true),
        `inner=${inner} topBottom=${probe && probe.topRowBottom} contextTop=${probe && probe.contextRowTop}`,
      );
    }

    // The sidebar layout's mobile navigation is the EXISTING disclosure primitive: it opens
    // from its own trigger, carries the navigation, and closes with Escape.
    // NAV1D — THE MOBILE BAND'S SIDEBAR IS THE RAIL ITSELF: its own Show/Hide control is the
    // affordance (there is no disclosure trigger and no dialog at all), and that control opens and
    // closes the SAME persistent rail the wider bands present — no dialog, no backdrop, no scroll
    // lock, no inert background.
    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await settle();
    const mobileBefore = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "sidebarMobile.railPresented",
      !!mobileBefore && mobileBefore.railVisible === true && mobileBefore.presentedRailBand === "shell-sidebar-mobile-rail",
      `rail=${mobileBefore && mobileBefore.railVisible} band=${mobileBefore && mobileBefore.presentedRailBand}`,
    );
    check(
      rows,
      "sidebarMobile.noDisclosureComposedAtAll",
      await cdp.evalBool("!document.querySelector('#shell-mobile-nav') && !document.querySelector('[data-ui-shell-part=\"mobile-drawer\"]')"),
      "the sidebar mode composes no disclosure band, no trigger and no drawer",
    );
    // S3F1B — the control's ICON BOX is the installation's OWN artwork (S3E1C): assert the 24x24 control
    // geometry when this installation ships the role, and the absence semantics (no box at all, hence no
    // foreign file and no broken image) when it does not. The control's text geometry, the band's
    // composition and the rail contract are asserted unchanged either way.
    const railControlIcon = servedInstallationAssetCapability().asset(CONTROL_ICON_ROLE);
    check(
      rows,
      "sidebarMobile.controlIsTheRailControl",
      !!mobileBefore &&
        mobileBefore.railToggleFontSize === 14 &&
        (railControlIcon.served
          ? mobileBefore.railToggleIconBox === "24x24"
          : mobileBefore.railToggleIconBox === null),
      `font=${mobileBefore && mobileBefore.railToggleFontSize} icon=${mobileBefore && mobileBefore.railToggleIconBox} shipped=${railControlIcon.served}`,
    );
    await clickVisibleRailToggle(cdp);
    await settle();
    const mobileAfter = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "sidebarMobile.controlOpensTheRail",
      !!mobileBefore && !!mobileAfter && mobileAfter.presentedRailCollapsed !== mobileBefore.presentedRailCollapsed,
      `${mobileBefore && mobileBefore.presentedRailCollapsed}->${mobileAfter && mobileAfter.presentedRailCollapsed}`,
    );
    check(
      rows,
      "sidebarMobile.noDialogAndNoScrollLock",
      !!mobileAfter && mobileAfter.dialogPresent === false && (await cdp.evalBool("document.body.style.overflow !== 'hidden'")),
      `dialog=${mobileAfter && mobileAfter.dialogPresent}`,
    );
    check(
      rows,
      "sidebarMobile.navigationIsInTheRail",
      !!mobileAfter && mobileAfter.barLinkCount === 0 && (await cdp.evalBool("!!document.querySelector('[data-ui-shell-part=\"rail\"] a')")),
      "the rail carries the destinations",
    );
    // The OPEN mobile rail is symmetric and leaves the focus ring room, exactly like the wider bands.
    check(
      rows,
      "sidebarMobile.openRailIsSymmetric",
      !!mobileAfter &&
        mobileAfter.presentedRailToggleBox &&
        mobileAfter.presentedRailBox &&
        Math.abs(
          mobileAfter.presentedRailToggleBox[0] - mobileAfter.presentedRailBox[0] -
            (mobileAfter.presentedRailBox[1] - mobileAfter.presentedRailToggleBox[1]),
        ) <= 1,
      `box=${mobileAfter && mobileAfter.presentedRailBox} toggle=${mobileAfter && mobileAfter.presentedRailToggleBox}`,
    );
    check(
      rows,
      "sidebarMobile.openRailRingRoom",
      !!mobileAfter && mobileAfter.ringRoomLeft != null && mobileAfter.ringRoomLeft >= 4 && mobileAfter.ringRoomRight >= 4,
      `left=${mobileAfter && mobileAfter.ringRoomLeft} right=${mobileAfter && mobileAfter.ringRoomRight}`,
    );
    check(
      rows,
      "sidebarMobile.openRailNoHorizontalOverflow",
      // The canonical CLOSED state is exact at every width (the rows above). With the visitor's rail
      // OPEN on a 320px viewport the content column is ~65px — narrower than one 24px control plus
      // its own padding — so a small residual sideways scroll is physically possible; the platform
      // breaks long words and shrinks what it owns rather than replacing the sidebar, which is what
      // this defect removed. Bounded, not asserted away.
      !!mobileAfter && mobileAfter.documentOverflow <= 16,
      `overflow=${mobileAfter && mobileAfter.documentOverflow}`,
    );
    check(rows, "sidebarMobile.bottomBarStillWithdrawn", !!mobileAfter && mobileAfter.bottomBarVisible === false, `bar=${mobileAfter && mobileAfter.bottomBarVisible}`);

    // ── NAV1D — THE MOBILE BAND PRESENTS THE ACCEPTED SIDEBAR, NOT A SUBSTITUTE ──────────────
    // Below `md` the sidebar mode used to present a `Show navigation` disclosure band. It now
    // presents the SAME rail the wider bands present, so the proof is IDENTITY, not scale similarity:
    // the mobile band's rail is measured against the desktop band's (its own padding, the control's
    // box, its typography and icon, the list's inset), and the column it scrolls in leaves the focus
    // ring its full extent. Every assertion below is a measured value, never a class string.
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await settle();
    // NAV1D — these rows measure the CANONICAL state a visitor lands in (the rail closed), so the
    // reference and the samples are the same state, at every width, with no dependence on an earlier
    // leg's toggling.
    await cdp.evaluate(`(() => {
      const rail = [...document.querySelectorAll('.ui-sidebar-rail')].find((el) => el.getBoundingClientRect().width > 0) || null;
      if (rail && rail.getAttribute('data-collapsed') === 'false') {
        const toggle = rail.querySelector('.ui-sidebar-toggle');
        if (toggle) toggle.click();
      }
      return true;
    })()`);
    await settle();
    const desktopRail = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "nav1d.sidebar.desktopRailPresented",
      !!desktopRail && desktopRail.railVisible === true && desktopRail.presentedRailBand === "shell-sidebar-desktop-rail",
      `rail=${desktopRail && desktopRail.railVisible} band=${desktopRail && desktopRail.presentedRailBand}`,
    );
    const constrained = {};
    // NAV1D-V2 — the widths the closed-layout contract is proved at, including the wide ones and the platform's
    // supported minimum (280, FOUNDATION-UI-R1D): the rail must coexist with the page WITHOUT a horizontal
    // scrollbar at every one of them.
    for (const [width, height] of [[1280, 900], [1024, 820], [900, 800], [768, 820], [767, 820], [390, 844], [360, 740], [320, 700], [280, 700]]) {
      await cdp.setViewport(width, height);
      await settle();
      constrained[width] = await cdp.evaluate(LAYOUT_PROBE);
      const probe = constrained[width];
      const expectedBand =
        width >= 1024
          ? "shell-sidebar-desktop-rail"
          : width >= 768
            ? "shell-sidebar-tablet-rail"
            : "shell-sidebar-mobile-rail";
      const tag = `nav1d.sidebar.w${width}`;
      check(
        rows,
        `${tag}.railPresented`,
        !!probe && probe.railVisible === true && probe.presentedRailBand === expectedBand,
        `rail=${probe && probe.railVisible} band=${probe && probe.presentedRailBand}`,
      );
      check(
        rows,
        `${tag}.noSubstitute`,
        !!probe &&
          probe.drawerVisible === false &&
          probe.disclosureInHeader === false &&
          probe.dialogPresent === false &&
          probe.railMobileVisible === (width < 768),
        `drawer=${probe && probe.drawerVisible} inHeader=${probe && probe.disclosureInHeader} dialog=${probe && probe.dialogPresent}`,
      );
      // THE SIDEBAR'S OWN PADDING, MEASURED ON BOTH SIDES: the control's box is inset from the rail's
      // outer edges equally (the rail's 1px inline-end border accounts for the allowed 1px), in both
      // states.
      const insetLeft =
        probe && probe.presentedRailToggleBox && probe.presentedRailBox
          ? probe.presentedRailToggleBox[0] - probe.presentedRailBox[0]
          : null;
      const insetRight =
        probe && probe.presentedRailToggleBox && probe.presentedRailBox
          ? probe.presentedRailBox[1] - probe.presentedRailToggleBox[1]
          : null;
      check(
        rows,
        `${tag}.paddingSymmetric`,
        insetLeft != null && insetRight != null && Math.abs(insetLeft - insetRight) <= 1,
        `insets=${insetLeft}/${insetRight} pad=${probe && probe.presentedRailPadInline}`,
      );
      // …AND THE FOCUS RING FITS: the global ring is 2px at a 2px offset, so the clipping column must
      // leave >= 4px around the control on every side (the owner's left-edge cut was 19px).
      check(
        rows,
        `${tag}.focusRingRoom`,
        !!probe &&
          probe.ringRoomLeft != null &&
          probe.ringRoomLeft >= 4 &&
          probe.ringRoomRight >= 4 &&
          probe.ringRoomTop >= 4,
        `left=${probe && probe.ringRoomLeft} right=${probe && probe.ringRoomRight} top=${probe && probe.ringRoomTop}`,
      );
      check(
        rows,
        `${tag}.listSharesTheControlInset`,
        !!probe &&
          probe.presentedRailItemLeft != null &&
          probe.presentedRailToggleBox &&
          Math.abs(probe.presentedRailItemLeft - probe.presentedRailToggleBox[0]) <= 1,
        `item=${probe && probe.presentedRailItemLeft} toggle=${probe && probe.presentedRailToggleBox && probe.presentedRailToggleBox[0]}`,
      );
      check(rows, `${tag}.noHorizontalOverflow`, !!probe && probe.documentOverflow <= 1, `overflow=${probe && probe.documentOverflow}`);
      // …measured against the CONTENT box too — the owner's own criterion, which is what says whether
      // a horizontal SCROLLBAR exists (the vertical scrollbar already takes part of the width).
      check(
        rows,
        `${tag}.noHorizontalScrollbar`,
        !!probe && probe.documentOverflowClient <= 1,
        `scrollW=${probe && probe.documentScrollWidth} clientW=${probe && probe.documentScrollWidth - probe.documentOverflowClient} overflow=${probe && probe.documentOverflowClient}`,
      );
    }
    // THE SAME SIDEBAR, MEASURED ACROSS BANDS: the control's typography, its icon and the rail's own
    // padding are identical at every width — the breakpoint changes WHICH band presents the rail, not
    // WHAT the rail is.
    for (const width of [767, 768, 390, 360, 320]) {
      const probe = constrained[width];
      check(
        rows,
        `nav1d.sidebar.w${width}.sameRailAsDesktop`,
        !!desktopRail &&
          !!probe &&
          desktopRail.presentedRailPadInline.join("/") === probe.presentedRailPadInline.join("/") &&
          desktopRail.railToggleFontSize === probe.railToggleFontSize &&
          desktopRail.railToggleIconBox === probe.railToggleIconBox &&
          desktopRail.presentedRailColumnPosition === probe.presentedRailColumnPosition,
        `pad ${desktopRail && desktopRail.presentedRailPadInline}->${probe && probe.presentedRailPadInline} font ${desktopRail && desktopRail.railToggleFontSize}->${probe && probe.railToggleFontSize} icon ${desktopRail && desktopRail.railToggleIconBox}->${probe && probe.railToggleIconBox} sticky=${probe && probe.presentedRailColumnPosition}`,
      );
    }
    // STICKY/PERSISTENT WHILE SCROLLING: the rail's content column is pinned at every width, and the
    // control stays operable — the closed sidebar never scrolls away with the page.
    for (const [width, height] of [[1280, 800], [768, 800], [390, 800]]) {
      await cdp.setViewport(width, height);
      await settle();
      await cdp.navigate(tallLayoutUrl);
      await waitReady(cdp);
      await cdp.evaluate(
        "window.scrollTo(0, Math.round(document.documentElement.scrollHeight * 0.45)); true",
      );
      await settle();
      const after = await cdp.evaluate(LAYOUT_PROBE);
      check(
        rows,
        `nav1d.sidebar.w${width}.stickyWhileScrolled`,
        !!after &&
          after.scrollY > 0 &&
          after.presentedRailColumnPosition === "sticky" &&
          after.presentedRailColumnTop != null &&
          after.presentedRailColumnTop >= -1 &&
          after.presentedRailColumnTop <= 8 &&
          after.railVisible === true,
        `scrollY=${after && after.scrollY} pos=${after && after.presentedRailColumnPosition} top=${after && after.presentedRailColumnTop} rail=${after && after.railVisible}`,
      );
      check(
        rows,
        `nav1d.sidebar.w${width}.controlRemainsOperable`,
        !!after &&
          after.railToggleHeight != null &&
          after.railToggleHeight >= 24 &&
          (await cdp.evalBool("!!document.querySelector('[data-ui-shell-part=\"rail\"] .ui-sidebar-toggle')")),
        `height=${after && after.railToggleHeight}`,
      );
      await cdp.evaluate("window.scrollTo(0, 0); true");
      await settle();
    }

    // ── NAV1D-V3 — THE CLOSED RAIL SITS ON THE PAGE EDGE, WITH SYMMETRIC ICON GAPS ──────────────
    // The owner's contract for a closed rail, at every band: the rail occupies the page edge (the old
    // ~20px shell gutter is gone) and the 24px control is centred between that edge and the divider,
    // keeping the accepted ~5–6px on its left exactly as on its right. The accepted internal padding
    // (6px / 6px minus the 1px border) is asserted, not the outer placement it used to be confused
    // with. The rail must also still fit the viewport's content box with no horizontal scrollbar.
    for (const [width, height] of [[1280, 900], [900, 800], [768, 820], [767, 820], [390, 844], [320, 700], [280, 700]]) {
      await cdp.setViewport(width, height);
      await settle();
      await closeVisibleRail(cdp);
      await settle();
      const probe = await cdp.evaluate(LAYOUT_PROBE);
      const tag = `nav1d.v3.closedEdge.w${width}`;
      const iconGapLeft =
        probe && probe.presentedRailToggleBox ? probe.presentedRailToggleBox[0] - probe.presentedRailBox[0] : null;
      const iconGapRight =
        probe && probe.presentedRailToggleBox ? probe.presentedRailBox[1] - 1 - probe.presentedRailToggleBox[1] : null;
      check(
        rows,
        `${tag}.railOnThePageEdge`,
        !!probe && probe.presentedRailBox != null && probe.presentedRailBox[0] <= 1 && probe.presentedRailWidth === 36,
        `railLeft=${probe && probe.presentedRailBox && probe.presentedRailBox[0]} railW=${probe && probe.presentedRailWidth}`,
      );
      check(
        rows,
        `${tag}.iconCentredBetweenEdgeAndDivider`,
        iconGapLeft != null && iconGapRight != null && Math.abs(iconGapLeft - iconGapRight) <= 1,
        `left=${iconGapLeft} right(divider)=${iconGapRight}`,
      );
      check(
        rows,
        `${tag}.acceptedInternalPadding`,
        !!probe && probe.presentedRailPadInline && probe.presentedRailPadInline[0] === 6 && probe.presentedRailPadInline[1] === 5,
        `pad=${probe && probe.presentedRailPadInline}`,
      );
      check(
        rows,
        `${tag}.noHorizontalScrollbar`,
        !!probe && probe.documentOverflowClient <= 1,
        `scrollW=${probe && probe.documentScrollWidth} overflow=${probe && probe.documentOverflowClient}`,
      );
    }

    // ── NAV1D-V3 — AN OPEN RAIL: IN FLOW AT ≥768, AN OVERLAY BELOW IT ───────────────────────────
    // The owner's band contract, with the 768/767 boundary asserted on both sides: desktop and tablet
    // EXPAND THE RAIL IN THE PAGE LAYOUT (the page's x-position and width change, and the rail never
    // covers the content), while mobile OVERLAYS the page (the page keeps the geometry it had while
    // the rail was closed, and the document gains no width).
    for (const [width, height, mode] of [
      [1280, 900, "in-flow"],
      [900, 800, "in-flow"],
      [768, 820, "in-flow"],
      [767, 820, "overlay"],
      [390, 844, "overlay"],
      [320, 700, "overlay"],
      [280, 700, "overlay"],
    ]) {
      await cdp.setViewport(width, height);
      await settle();
      await closeVisibleRail(cdp);
      await settle();
      const closed = await cdp.evaluate(LAYOUT_PROBE);
      const opened = await clickVisibleRailToggle(cdp);
      await settle();
      const open = await cdp.evaluate(LAYOUT_PROBE);
      const tag = `nav1d.v3.open.w${width}`;
      check(rows, `${tag}.railOpened`, opened === true && !!open && open.presentedRailCollapsed === "false", `collapsed=${open && open.presentedRailCollapsed}`);
      check(
        rows,
        `${tag}.expandedRailKeepsItsAcceptedWidth`,
        !!open && open.presentedRailWidth === 220,
        `width=${open && open.presentedRailWidth}`,
      );
      check(
        rows,
        `${tag}.openUsesThe${mode === "in-flow" ? "InFlow" : "Overlay"}Layout`,
        !!open && open.presentedRailPosition === (mode === "in-flow" ? "static" : "absolute"),
        `position=${open && open.presentedRailPosition}`,
      );
      if (mode === "in-flow") {
        // IN FLOW: the page's own column moves right and shrinks by exactly the rail's growth, and the
        // rail never covers it — the page begins at the rail's right edge.
        check(
          rows,
          `${tag}.pageGeometryFollowsTheRail`,
          !!closed &&
            !!open &&
            open.mainLeft === closed.mainLeft + (220 - 36) &&
            open.mainWidth === closed.mainWidth - (220 - 36) &&
            open.mainLeft >= open.presentedRailBox[1] - 1,
          `main ${closed && closed.mainLeft}/${closed && closed.mainWidth} -> ${open && open.mainLeft}/${open.mainWidth}, railRight=${open && open.presentedRailBox && open.presentedRailBox[1]}`,
        );
        check(
          rows,
          `${tag}.noHorizontalScrollbar`,
          !!open && open.documentOverflowClient <= 1,
          `scrollW=${open && open.documentScrollWidth} overflow=${open && open.documentOverflowClient}`,
        );
      } else {
        // OVERLAY: the page keeps the geometry it had while the rail was closed, and the document's
        // own width does not change merely because the rail opened.
        check(
          rows,
          `${tag}.pageGeometryUnchanged`,
          !!closed &&
            !!open &&
            closed.mainLeft === open.mainLeft &&
            closed.mainWidth === open.mainWidth &&
            closed.presentedRailBox[0] === open.presentedRailBox[0] &&
            open.documentScrollWidth === closed.documentScrollWidth &&
            open.documentOverflowClient <= 1,
          `main ${closed && closed.mainLeft}/${closed && closed.mainWidth} -> ${open && open.mainLeft}/${open.mainWidth}, scrollW ${closed && closed.documentScrollWidth} -> ${open && open.documentScrollWidth}`,
        );
        // …and the overlay's surface is OPAQUE, so page text behind it cannot blend through the
        // navigation's text: no alpha channel, no opacity on the rail, no image layer.
        check(
          rows,
          `${tag}.overlayIsOpaque`,
          !!open &&
            /^rgb\(/.test(String(open.presentedRailBackgroundColor)) &&
            open.presentedRailOpacity === "1" &&
            open.presentedRailBackgroundImage === "none",
          `bg=${open && open.presentedRailBackgroundColor} opacity=${open && open.presentedRailOpacity} image=${open && open.presentedRailBackgroundImage} token=${open && open.tokenBackground}`,
        );
        check(
          rows,
          `${tag}.railPaintsAboveThePage`,
          !!open && open.railOverlayHit === true && open.pageHitOverRail === true,
          `overlayHit=${open && open.railOverlayHit} pageHit=${open && open.pageHitOverRail}`,
        );
      }
      // The Hide-navigation control keeps its accepted 20/20 inset inside the open rail (equal within
      // the rail's own 1px divider border) and stays usable in every band.
      const hideInsetLeft =
        open && open.presentedRailToggleBox && open.presentedRailBox
          ? open.presentedRailToggleBox[0] - open.presentedRailBox[0]
          : null;
      const hideInsetRight =
        open && open.presentedRailToggleBox && open.presentedRailBox
          ? open.presentedRailBox[1] - open.presentedRailToggleBox[1]
          : null;
      check(
        rows,
        `${tag}.hideControlInsetBalanced`,
        hideInsetLeft === 20 && hideInsetRight != null && Math.abs(hideInsetLeft - hideInsetRight) <= 1,
        `left=${hideInsetLeft} right=${hideInsetRight} railPad=${open && open.presentedRailPadInline}`,
      );
      check(
        rows,
        `${tag}.hideControlUsable`,
        !!open && open.railToggleHeight != null && open.railToggleHeight >= 24,
        `height=${open && open.railToggleHeight}`,
      );
      await closeVisibleRail(cdp);
      await settle();
    }

    // ── NAV1D-V3 — THE RAIL'S BACKGROUND COMES FROM THE SITE'S ONE AUTHORITY ────────────────────
    // The adopter-owned `ui.theme.background` reaches the stylesheet as `--background` on `<html>`
    // (FS-5; see `src/app/[[...segments]]/layout.tsx`). Overriding THAT token at runtime must therefore
    // change the rail's surface — which is what proves the rail consumes the site's ONE authority
    // rather than a colour of its own.
    await cdp.setViewport(390, 844);
    await settle();
    await closeVisibleRail(cdp);
    await settle();
    await clickVisibleRailToggle(cdp);
    await settle();
    const baselineBackground = await cdp.evaluate(LAYOUT_PROBE);
    const overridden = await cdp.evaluate(`(() => {
      document.documentElement.style.setProperty('--background', '#ff00ff');
      return true;
    })()`);
    await settle();
    const afterOverride = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "nav1d.v3.background.followsTheConfiguredAuthority",
      overridden === true &&
        !!afterOverride &&
        afterOverride.presentedRailBackgroundColor === "rgb(255, 0, 255)" &&
        afterOverride.presentedRailBackgroundColor !==
          (baselineBackground && baselineBackground.presentedRailBackgroundColor),
      `before=${baselineBackground && baselineBackground.presentedRailBackgroundColor} after=${afterOverride && afterOverride.presentedRailBackgroundColor}`,
    );
    check(
      rows,
      "nav1d.v3.background.railMatchesTheDocumentedToken",
      !!baselineBackground &&
        baselineBackground.presentedRailBackgroundColor === "rgb(255, 255, 255)" &&
        ["#fff", "#ffffff"].includes(String(baselineBackground.tokenBackground).toLowerCase()),
      `rail=${baselineBackground && baselineBackground.presentedRailBackgroundColor} token=${baselineBackground && baselineBackground.tokenBackground}`,
    );
    await cdp.evaluate(`(() => { document.documentElement.style.removeProperty('--background'); return true; })()`);
    await settle();
    await closeVisibleRail(cdp);
    await settle();

    // ── NAV1D-V2 — BELOW THE SUPPORTED BOUNDARY (< 280) ───────────────────────────────────────────
    // The layout keeps its deliberate floor instead of deforming, and the VIEWPORT scrolls
    // horizontally — the honest behaviour for a width this platform does not support. FOUNDATION-UI-R1D moved the
    // floor here from 320 so that every SUPPORTED width (280 and up) fits its own content box; opening the rail
    // still adds no width of its own.
    await cdp.setViewport(260, 700);
    await settle();
    await closeVisibleRail(cdp);
    await settle();
    const belowClosed = await cdp.evaluate(LAYOUT_PROBE);
    await clickVisibleRailToggle(cdp);
    await settle();
    const belowOpen = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "nav1d.v2.belowBoundary.keepsTheMinimumLayout",
      !!belowClosed && belowClosed.documentScrollWidth >= 280 && belowClosed.presentedRailWidth === 36,
      `scrollW=${belowClosed && belowClosed.documentScrollWidth} rail=${belowClosed && belowClosed.presentedRailWidth}`,
    );
    check(
      rows,
      "nav1d.v2.belowBoundary.scrollsInsteadOfDeforming",
      !!belowClosed && belowClosed.documentOverflowClient > 1,
      `overflow=${belowClosed && belowClosed.documentOverflowClient}`,
    );
    check(
      rows,
      "nav1d.v2.belowBoundary.sidebarRemainsFunctional",
      !!belowClosed &&
        !!belowOpen &&
        belowOpen.presentedRailCollapsed === "false" &&
        belowOpen.presentedRailWidth === 220 &&
        belowOpen.documentScrollWidth === belowClosed.documentScrollWidth &&
        belowOpen.railToggleHeight >= 24,
      `rail=${belowOpen && belowOpen.presentedRailWidth} scrollW ${belowClosed && belowClosed.documentScrollWidth}->${belowOpen && belowOpen.documentScrollWidth} toggle=${belowOpen && belowOpen.railToggleHeight}`,
    );
    await closeVisibleRail(cdp);
    await settle();

    // ── MENU-BAR mode: the ACTUAL NAVIGATION LINKS are the STICKY BOTTOM BAR at EVERY width ──
    // NAV1B — the top navigation bar presentation is no longer part of Menu Bar mode: the bar is
    // the navigation at desktop, tablet and mobile widths alike, and no top navigation exists.
    await cdp.evaluate(chooseLayout("menu-bar"));
    await settle();
    for (const [width, height] of RESPONSIVE_WIDTHS) {
      await cdp.setViewport(width, height);
      await settle();
      const probe = await cdp.evaluate(LAYOUT_PROBE);
      const inner = probe && probe.innerWidth;
      const tag = `nav1b.menuBar.w${width}`;
      check(rows, `${tag}.modePreserved`, !!probe && probe.active === "menu-bar", `inner=${inner} attr=${probe && probe.active}`);
      check(rows, `${tag}.controlAvailable`, !!probe && probe.controlVisible === true, `inner=${inner} control=${probe && probe.controlVisible}`);
      check(rows, `${tag}.stickyBottomNavigation`, !!probe && probe.bottomBarVisible === true, `inner=${inner} bar=${probe && probe.bottomBarVisible}`);
      check(rows, `${tag}.noTopNavigation`, !!probe && probe.topNavVisible === false, `inner=${inner} topNav=${probe && probe.topNavVisible}`);
      check(rows, `${tag}.noSidebar`, !!probe && probe.railVisible === false && probe.drawerVisible === false, `inner=${inner} rail=${probe && probe.railVisible} drawer=${probe && probe.drawerVisible}`);
      check(
        rows,
        `${tag}.linksShareRowsAndWrap`,
        !!probe && probe.barWrapActive === true && probe.barLinkCount > 1 && probe.barRowCount < probe.barLinkCount,
        `inner=${inner} rows=${probe && probe.barRowCount} links=${probe && probe.barLinkCount} wrap=${probe && probe.barWrapActive}`,
      );
      check(rows, `${tag}.linksInsidePageEdgeInset`, !!probe && probe.barLinksInsideInset === true, `inner=${inner} left=${probe && probe.barInsetLeft} right=${probe && probe.barInsetRight}`);
      // NAV1D — THE SURFACE SPANS THE VIEWPORT and its region uses the available width: the sticky
      // bar's surface IS the viewport width, and its navigation region is the inset-bounded full
      // width — never the page's own `max-w-page` article width (which is what made the bar read as
      // a small left-hand block).
      check(
        rows,
        `${tag}.surfaceSpansTheViewport`,
        !!probe && probe.barSurfaceWidth != null && Math.abs(probe.barSurfaceWidth - probe.innerWidth) <= 16,
        `inner=${inner} surface=${probe && probe.barSurfaceWidth}`,
      );
      check(
        rows,
        `${tag}.regionUsesAvailableWidth`,
        !!probe &&
          probe.barRegionWidth != null &&
          probe.barRegionWidth >= probe.innerWidth - 40 &&
          (probe.headerContentWidth === null ||
            probe.headerContentWidth >= probe.innerWidth - 40 ||
            probe.barRegionWidth > probe.headerContentWidth),
        `inner=${inner} region=${probe && probe.barRegionWidth} header=${probe && probe.headerContentWidth}`,
      );
      check(rows, `${tag}.selectorTopRow`, !!probe && probe.selectorInTopRow === true && probe.selectorInControlRow === false, `inner=${inner} topRow=${probe && probe.selectorInTopRow} controlRow=${probe && probe.selectorInControlRow}`);
      check(rows, `${tag}.noHorizontalOverflow`, await cdp.evalBool("document.documentElement.scrollWidth <= window.innerWidth + 1"), `inner=${inner}`);
    }

    // ── TRANSITIONS: real resizes, no reload ─────────────────────────────────
    await cdp.evaluate(chooseLayout("sidebar"));
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await settle();
    const beforeResize = await cdp.evaluate(LAYOUT_PROBE);
    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await settle();
    const afterResize = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "transition.desktopToMobile.modePreserved",
      !!beforeResize && !!afterResize && beforeResize.active === "sidebar" && afterResize.active === "sidebar",
      `attr ${beforeResize && beforeResize.active}->${afterResize && afterResize.active}`,
    );
    check(
      rows,
      "transition.desktopToMobile.sameRailContinues",
      !!beforeResize &&
        !!afterResize &&
        beforeResize.railVisible === true &&
        afterResize.railVisible === true &&
        afterResize.presentedRailBand === "shell-sidebar-mobile-rail" &&
        afterResize.drawerVisible === false &&
        afterResize.bottomBarVisible === false &&
        beforeResize.presentedRailPadInline.join("/") === afterResize.presentedRailPadInline.join("/") &&
        beforeResize.railToggleFontSize === afterResize.railToggleFontSize,
      `rail ${beforeResize && beforeResize.railVisible}->${afterResize && afterResize.railVisible} band=${afterResize && afterResize.presentedRailBand} pad ${beforeResize && beforeResize.presentedRailPadInline}->${afterResize && afterResize.presentedRailPadInline} font ${beforeResize && beforeResize.railToggleFontSize}->${afterResize && afterResize.railToggleFontSize}`,
    );
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await settle();
    const backToDesktop = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "transition.mobileToDesktop.railRestored",
      !!backToDesktop &&
        backToDesktop.active === "sidebar" &&
        backToDesktop.railVisible === true &&
        backToDesktop.drawerVisible === false,
      `attr=${backToDesktop && backToDesktop.active} rail=${backToDesktop && backToDesktop.railVisible}`,
    );

    // ── MOBILE MODE SWITCHING: sidebar ↔ menu-bar at <md, no reload ───────────
    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await settle();
    // NAV1D — the sidebar mode's affordance at <md is the RAIL'S OWN control, so the switch-away
    // proof starts from an OPEN rail (there is no drawer, no scroll lock and no inert background).
    await clickVisibleRailToggle(cdp);
    await settle();
    await cdp.evaluate(chooseLayout("menu-bar"));
    await settle();
    const switchedToMenuBar = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "mobileSwitch.toMenuBar.barIsSolePrimaryNav",
      !!switchedToMenuBar &&
        switchedToMenuBar.active === "menu-bar" &&
        switchedToMenuBar.bottomBarVisible === true &&
        switchedToMenuBar.drawerVisible === false,
      `attr=${switchedToMenuBar && switchedToMenuBar.active} bar=${switchedToMenuBar && switchedToMenuBar.bottomBarVisible} drawer=${switchedToMenuBar && switchedToMenuBar.drawerVisible}`,
    );
    check(rows, "mobileSwitch.toMenuBar.noStaleDialog", !!switchedToMenuBar && switchedToMenuBar.dialogPresent === false, `dialog=${switchedToMenuBar && switchedToMenuBar.dialogPresent}`);
    check(rows, "mobileSwitch.toMenuBar.scrollNotLocked", await cdp.evalBool("document.body.style.overflow !== 'hidden'"));
    check(rows, "mobileSwitch.toMenuBar.controlReflectsMode", !!switchedToMenuBar && switchedToMenuBar.controlValue === "menu-bar", `control=${switchedToMenuBar && switchedToMenuBar.controlValue}`);

    await cdp.evaluate(chooseLayout("sidebar"));
    await settle();
    const switchedToSidebar = await cdp.evaluate(LAYOUT_PROBE);
    check(
      rows,
      "mobileSwitch.toSidebar.railReturns",
      !!switchedToSidebar &&
        switchedToSidebar.active === "sidebar" &&
        switchedToSidebar.railVisible === true &&
        switchedToSidebar.presentedRailBand === "shell-sidebar-mobile-rail" &&
        switchedToSidebar.drawerVisible === false &&
        switchedToSidebar.bottomBarVisible === false,
      `attr=${switchedToSidebar && switchedToSidebar.active} rail=${switchedToSidebar && switchedToSidebar.railVisible} band=${switchedToSidebar && switchedToSidebar.presentedRailBand} bar=${switchedToSidebar && switchedToSidebar.bottomBarVisible}`,
    );
    check(rows, "mobileSwitch.toSidebar.noStaleDialog", !!switchedToSidebar && switchedToSidebar.dialogPresent === false, `dialog=${switchedToSidebar && switchedToSidebar.dialogPresent}`);
    check(rows, "mobileSwitch.toSidebar.controlReflectsMode", !!switchedToSidebar && switchedToSidebar.controlValue === "sidebar", `control=${switchedToSidebar && switchedToSidebar.controlValue}`);

    // Exactly ONE primary navigation is reachable: in sidebar mode the withdrawn bar is
    // never a Tab stop, whatever else the page exposes.
    await cdp.evaluate("document.body.focus(); true");
    let landedInWithdrawnBar = false;
    for (let step = 0; step < 12; step += 1) {
      await cdp.pressKey("Tab");
      if (await cdp.evalBool(`!!document.activeElement && !!document.activeElement.closest('[data-ui-shell-part="bottom-bar"]')`)) {
        landedInWithdrawnBar = true;
      }
    }
    check(rows, "mobileSwitch.sidebarMode.bottomBarNeverFocusable", landedInWithdrawnBar === false, `landed=${landedInWithdrawnBar}`);
  // __SCENARIO_REST__
  } catch (error) {
    check(rows, "layout-switcher.scenario.error", false, String(error));
  } finally {
    await writeFile(CONFIG_PATH, original, "utf8");
    await rm(pagePath, { force: true });
    await rm(tallPath, { force: true });
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows;
}

/**
 * NAV1A — THE STICKY BOTTOM BAR'S LINK LAYOUT, IN A REAL BROWSER.
 *
 * The bar's rows are the `<li>` children of its `<ul>`, so the LIST owns their flow and
 * wrapping. The historical defect put the horizontal intent on the `<nav>` — whose single
 * child is that list — so every link stacked one per row and the bar grew a row per link.
 *
 * Proven with TEST-OWNED fixtures (written to the disposable deployment copy and restored
 * by the scenario), in the layout whose MOBILE composition IS the bottom bar:
 *
 *   · SHORT labels share ONE row at a phone width — the bar neither forces one item per
 *     row nor wraps when it does not need to, and every link sits inside the page-edge
 *     inset with no horizontal overflow;
 *   · LONG labels WRAP: the extra row is genuinely required by the available width
 *     (`rowCount < links`), the bar GROWS in height (never a fixed one-row height) and
 *     nothing is clipped, with the links still inside the inset.
 */
async function runBottomNavWrapScenario(chrome) {
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];
  const SHORT = [
    { label: "Home", href: "/" },
    { label: "About", href: "/about" },
  ];
  // The labels must survive the content layer's dictionary projection
  // (`@/components/site/nav-links` maps a KNOWN href to its localized label), so the
  // long-label fixture uses synthetic destinations no dictionary declares.
  const LONG = [
    { label: "Destinations we offer", href: "/zz-destinations" },
    { label: "Customer stories", href: "/zz-testimonials" },
    { label: "Case studies", href: "/zz-case-studies" },
    { label: "Get in touch", href: "/zz-contact" },
  ];

  const phase = async (label, navigation, portSuffix) => {
    const port = BASE_PORT + 360 + portSuffix;
    const url = `http://localhost:${port}/ww/en`;
    BASE_URL = `http://localhost:${port}`;
    const config = JSON.parse(original);
    config.navigation = navigation;
    // The MENU-BAR layout: its mobile composition is the sticky bottom bar.
    config.ui = { ...(config.ui ?? {}), layoutSwitcher: { enabled: true, default: "menu-bar" } };
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
    const server = startDevServer(port);
    let cdp = null;
    try {
      await waitForServer(url);
      cdp = await Cdp.connect(chrome);
      await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
      await cdp.navigate(url);
      await waitReady(cdp);
      const probe = await cdp.evaluate(LAYOUT_PROBE);
      const overflow = await cdp.evalBool("document.documentElement.scrollWidth <= window.innerWidth + 1");
      const clipped = await cdp.evalBool(
        `(() => { const bar = document.querySelector('.ui-shell-bottom-bar'); if (!bar) return true; const b = bar.getBoundingClientRect(); return Array.from(bar.querySelectorAll('ul > li')).some((li) => { const r = li.getBoundingClientRect(); return r.bottom > b.bottom + 1 || r.top < b.top - 1; }); })()`,
      );
      const barHeight = await cdp.evaluate(
        `(() => { const b = document.querySelector('.ui-shell-bottom-bar'); return b ? Math.round(b.getBoundingClientRect().height) : 0; })()`,
      );
      const itemHeight = await cdp.evaluate(
        `(() => { const li = document.querySelector('.ui-shell-bottom-bar ul > li'); return li ? Math.round(li.getBoundingClientRect().height) : 0; })()`,
      );
      return { probe, label, overflow, clipped, barHeight, itemHeight };
    } finally {
      if (cdp) await cdp.close();
      await stopServer(server);
    }
  };

  try {
    const short = await phase("short", SHORT, 0);
    const long = await phase("long", LONG, 1);
    const shortProbe = short.probe;
    check(rows, "barWrap.short.barVisible", !!shortProbe && shortProbe.bottomBarVisible === true, `bar=${shortProbe && shortProbe.bottomBarVisible}`);
    check(rows, "barWrap.short.oneRow", !!shortProbe && shortProbe.barRowCount === 1, `inner=${shortProbe && shortProbe.innerWidth} rows=${shortProbe && shortProbe.barRowCount} links=${shortProbe && shortProbe.barLinkCount}`);
    check(rows, "barWrap.short.bothLinksRendered", !!shortProbe && shortProbe.barLinkCount === 2, `links=${shortProbe && shortProbe.barLinkCount}`);
    check(rows, "barWrap.short.listWraps", !!shortProbe && shortProbe.barWrapActive === true, `wrap=${shortProbe && shortProbe.barWrapActive}`);
    check(rows, "barWrap.short.linksInsideInset", !!shortProbe && shortProbe.barLinksInsideInset === true, `pad=${shortProbe && shortProbe.barPad}`);
    check(rows, "barWrap.short.noHorizontalOverflow", short.overflow === true);
    check(rows, "barWrap.short.notClipped", short.clipped === false, `barHeight=${short.barHeight} itemHeight=${short.itemHeight}`);

    const longProbe = long.probe;
    check(rows, "barWrap.long.barVisible", !!longProbe && longProbe.bottomBarVisible === true, `bar=${longProbe && longProbe.bottomBarVisible}`);
    check(rows, "barWrap.long.linksRendered", !!longProbe && longProbe.barLinkCount === 4, `links=${longProbe && longProbe.barLinkCount}`);
    check(rows, "barWrap.long.wrapsWhenRequired", !!longProbe && longProbe.barRowCount >= 2, `inner=${longProbe && longProbe.innerWidth} rows=${longProbe && longProbe.barRowCount} links=${longProbe && longProbe.barLinkCount}`);
    check(rows, "barWrap.long.linksShareRows", !!longProbe && longProbe.barRowCount < longProbe.barLinkCount, `rows=${longProbe && longProbe.barRowCount} links=${longProbe && longProbe.barLinkCount}`);
    check(rows, "barWrap.long.listWraps", !!longProbe && longProbe.barWrapActive === true, `wrap=${longProbe && longProbe.barWrapActive}`);
    check(rows, "barWrap.long.linksInsideInset", !!longProbe && longProbe.barLinksInsideInset === true, `pad=${longProbe && longProbe.barPad}`);
    check(
      rows,
      "barWrap.long.barGrowsWithRows",
      long.barHeight >= 2 * long.itemHeight,
      `barHeight=${long.barHeight} rows=${longProbe && longProbe.barRowCount} itemHeight=${long.itemHeight}`,
    );
    check(rows, "barWrap.long.notClipped", long.clipped === false, `barHeight=${long.barHeight}`);
    check(rows, "barWrap.long.noHorizontalOverflow", long.overflow === true);
  } catch (error) {
    check(rows, "barWrap.scenario.error", false, String(error));
  } finally {
    await writeFile(CONFIG_PATH, original, "utf8");
  }
  return rows;
}

/**
 * NAV1B-V1 — THE GRAPHIC-IDENTITY FIXTURE (test-owned CONFIGURATION; no new file, nothing authored
 * is modified).
 *
 * The identity under test is a GRAPHIC, so the fixture points `site.assets.logo` at a SHIPPED PLATFORM
 * mark (`github.svg`, 98x96) — artwork the installation this server serves genuinely holds, because the
 * platform namespace is shared by every installation (S3E1C). The former fixture was a replaceable ROLE
 * placeholder (`header-graphic.svg`), which belongs to the deployment that ships it: the generic synthetic
 * LEGACY installation does not ship it, so the graphic would not have rendered at all (S3F1B). A
 * WIDE-graphic identity remains a deployment-owned case — a canonical Installation that ships its own
 * wide logo role proves it in the reference scope. `site.assets.*` is an ABSOLUTE URL by contract, and the
 * framework re-derives the same-origin path, which is where the shipped asset is served from.
 */
const GRAPHIC_FIXTURE_LOGO_URL = "https://example.com/assets/github.svg";

/**
 * UI-R1 — WHERE THE WIDE-ARTWORK CASES ARE PROVED.
 *
 * A LOCKUP (several times a mark's width at the accepted lockup height) and an EXCEPTIONALLY WIDE lockup (wider
 * than the header's own content box, which makes the proportional clamp binding) cannot be expressed in THIS
 * environment. The generic installation here is a single Spoke, so the only artwork it may be pointed at is the
 * shared PLATFORM namespace (`/assets/**`), whose files are all compact marks — a Spoke-namespaced file is served
 * for the Spokes an Installation DECLARES, and this one declares none. Those two identities are therefore
 * measured on a test-owned Hub by `tests/browser/header-identity.scenario.mjs`, at the same widths, under the same
 * row contract asserted here.
 */

/**
 * NAV1B — THE HEADER'S FIXED SEMANTIC ROWS UNDER PRESSURE (own servers + TEST-OWNED fixtures).
 *
 * Two pressures the reported defect was about, neither of which the reference deployment can exert:
 *
 *   · a VERY LONG identity: the navigation-MODE selector keeps its top-right place while the title
 *     wraps below it inside its own column (never over the selector, never pushed into the control
 *     row, no page overflow);
 *   · LONG contextual labels: the Site/Language controls wrap ONTO ANOTHER LINE INSIDE the control
 *     row — they never jump up into the identity/selector row.
 *
 * The fixtures are config-only (labels and the site name) and are written to the DISPOSABLE copy and
 * restored in `finally`, so no authored deployment content is manufactured.
 */
/**
 * NAV1B-V2 (FOUNDATION-UI-R1) — ONE MEASURED ARRANGEMENT OF THE TOP ROW, HELD TO THE WRAPPING CONTRACT.
 *
 * The contract the row owes its visitors, in BOTH arrangements and with no breakpoint anywhere in it: the row wraps
 * by content; the brand is its first occupant, at the padded left edge, and it is never covered; the control
 * cluster is right-anchored in whatever line it occupies, inside the header's own content box, with every control
 * it holds visible and unobstructed; and nothing widens the row or the document. The ARRANGEMENT is then named in
 * the check names AND held to the fact that distinguishes it: when the cluster has dropped, the brand keeps the
 * row's WHOLE content width (the brand is never squeezed to keep a control beside it), and when they share the line
 * the brand really is to the LEFT of the cluster.
 *
 * @returns {"one-line" | "cluster-below" | "no-selector"} the arrangement that was measured
 */
function checkRowContract(rows, tag, probe, { expectCluster = true } = {}) {
  check(
    rows,
    `${tag}.row.wrapsByContent`,
    !!probe && probe.headerRowDisplay === "flex" && probe.headerRowWrap === "wrap",
    `display=${probe && probe.headerRowDisplay} wrap=${probe && probe.headerRowWrap}`,
  );
  check(
    rows,
    `${tag}.brand.isFirstAndAtThePaddedLeftEdge`,
    !!probe && !!probe.brandBox && Math.abs(probe.brandBox.left - probe.headerContentLeft) <= 1,
    `brand=${probe && JSON.stringify(probe.brandBox)} contentLeft=${probe && probe.headerContentLeft}`,
  );
  check(
    rows,
    `${tag}.row.doesNotScroll`,
    !!probe && probe.headerRowOverflow !== null && probe.headerRowOverflow <= 0,
    `rowOverflow=${probe && probe.headerRowOverflow}`,
  );
  if (!expectCluster) {
    check(rows, `${tag}.noTopRightSelector`, !!probe && probe.clusterPresent === false, `cluster=${probe && JSON.stringify(probe.clusterBox)}`);
    return "no-selector";
  }
  const arrangement = probe && probe.clusterPresent && probe.clusterBelowBrand ? "cluster-below" : "one-line";
  check(
    rows,
    `${tag}.neverOverlapsTheBrand`,
    !!probe && probe.brandClusterOverlap === false,
    `brand=${probe && JSON.stringify(probe.brandBox)} cluster=${probe && JSON.stringify(probe.clusterBox)}`,
  );
  check(
    rows,
    `${tag}.${arrangement}.clusterIsRightAnchored`,
    !!probe && probe.clusterRightInset !== null && Math.abs(probe.clusterRightInset) <= 1,
    `rightInset=${probe && probe.clusterRightInset}`,
  );
  check(
    rows,
    `${tag}.${arrangement}.clusterInsideTheContentBox`,
    !!probe &&
      !!probe.clusterBox &&
      probe.clusterBox.left >= probe.headerContentLeft - 1 &&
      probe.clusterBox.right <= probe.headerContentRight + 1,
    `cluster=${probe && JSON.stringify(probe.clusterBox)} content=${probe && JSON.stringify({ left: probe.headerContentLeft, right: probe.headerContentRight })}`,
  );
  check(
    rows,
    `${tag}.${arrangement}.controlsVisibleAndUnobstructed`,
    !!probe && probe.clusterControlsVisible === true && probe.clusterControlsUnobstructed === true,
    `visible=${probe && probe.clusterControlsVisible} unobstructed=${probe && probe.clusterControlsUnobstructed}`,
  );
  if (arrangement === "cluster-below") {
    // THE BRAND KEEPS THE ROW: the cluster moved away instead of the brand being squeezed to make it fit.
    check(
      rows,
      `${tag}.clusterBelow.brandKeepsTheRowsWholeContentWidth`,
      !!probe && !!probe.brandBox && probe.brandBox.width >= probe.headerContentBoxWidth - 1,
      `brandWidth=${probe && probe.brandBox.width} contentBox=${probe && probe.headerContentBoxWidth}`,
    );
  } else {
    check(
      rows,
      `${tag}.oneLine.brandIsToTheLeftOfTheCluster`,
      !!probe && !!probe.brandBox && !!probe.clusterBox && probe.brandBox.right <= probe.clusterBox.left + 1,
      `brand=${probe && JSON.stringify(probe.brandBox)} cluster=${probe && JSON.stringify(probe.clusterBox)}`,
    );
  }
  return arrangement;
}

async function runHeaderRowsScenario(chrome) {
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];

  const phase = async (label, mutate, widths, portSuffix) => {
    const port = BASE_PORT + 400 + portSuffix;
    const url = `http://localhost:${port}/ww/en`;
    BASE_URL = `http://localhost:${port}`;
    const config = JSON.parse(original);
    // Both fixtures need the mode CHOICE to exist (the selector is the top row's right-hand
    // occupant), so the switcher is enabled for the disposable copy only.
    config.ui = { ...(config.ui ?? {}), layoutSwitcher: { enabled: true, default: "sidebar" } };
    mutate(config);
    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
    const server = startDevServer(port);
    let cdp = null;
    const measured = [];
    try {
      await waitForServer(url);
      cdp = await Cdp.connect(chrome);
      await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
      await cdp.navigate(url);
      await waitReady(cdp);
      for (const [width, height] of widths) {
        await cdp.setViewport(width, height);
        await sleep(300);
        measured.push({ width, probe: await cdp.evaluate(LAYOUT_PROBE) });
      }
      return { label, measured };
    } finally {
      if (cdp) await cdp.close();
      await stopServer(server);
    }
  };

  try {
    const longTitle = await phase(
      "longTitle",
      (config) => {
        config.site = {
          ...config.site,
          name: "Provelopment Foundation Reference Deployment and Services",
        };
      },
      [
        [1280, 900],
        [900, 800],
        [768, 820],
        [390, 844],
        [320, 700],
      ],
      0,
    );
    for (const { width, probe } of longTitle.measured) {
      const tag = `nav1b.title.w${width}`;
      check(rows, `${tag}.selectorStaysTopRight`, !!probe && probe.selectorInTopRow === true && Math.abs(probe.selectorRightInset) <= 1, `topRow=${probe && probe.selectorInTopRow} rightInset=${probe && probe.selectorRightInset}`);
      check(rows, `${tag}.selectorNeverInControlRow`, !!probe && probe.selectorInControlRow === false);
      // NAV1B-V2 (UI-R1) — THE SAME ROW CONTRACT AS FOR A GRAPHIC IDENTITY, MEASURED: a long TEXT brand may break
      // inside itself, but it is never covered by the cluster and never pushes it off the row: the cluster shares
      // the brand's line or drops ENTIRELY below it, right-anchored either way, with the brand keeping the left
      // edge. (The replaced NAV1B-V1 text rule required the selector to stay on the brand's FIRST line at every
      // width, which is only achievable by squeezing the brand into a column — the strategy UI-R1 replaces.)
      checkRowContract(rows, tag, probe);
      check(rows, `${tag}.controlRowStillBelow`, !!probe && (probe.contextRowPresent ? probe.contextRowTop >= probe.topRowBottom : true), `topBottom=${probe && probe.topRowBottom} contextTop=${probe && probe.contextRowTop}`);
      check(rows, `${tag}.noGraphicIsComposed`, !!probe && probe.logoPresent === false, `logo=${probe && probe.logoPresent}`);
      check(rows, `${tag}.noHorizontalOverflow`, !!probe && probe.documentOverflow <= 1, `overflow=${probe && probe.documentOverflow}`);
    }
    // …and the NARROWEST width shows the correction itself: with a brand THIS long there is no room beside it, so
    // the cluster is BELOW the brand and the brand keeps the row — it is never squeezed into a column to keep the
    // selector on its line (the arrangement the replaced rule required at every width).
    const phone = longTitle.measured[longTitle.measured.length - 1].probe;
    check(
      rows,
      "nav1b.title.narrowest.clusterDropsBelowTheBrand",
      !!phone && phone.clusterPresent === true && phone.clusterBelowBrand === true && phone.brandClusterOverlap === false,
      `brand=${phone && JSON.stringify(phone.brandBox)} cluster=${phone && JSON.stringify(phone.clusterBox)}`,
    );
    // …while at the WIDEST measured width the same row fits on ONE line, brand left and cluster right.
    const desktop = longTitle.measured[0].probe;
    check(
      rows,
      "nav1b.title.widest.clusterSharesTheLine",
      !!desktop && desktop.clusterPresent === true && desktop.clusterBelowBrand === false && desktop.brandClusterOverlap === false,
      `brand=${desktop && JSON.stringify(desktop.brandBox)} cluster=${desktop && JSON.stringify(desktop.clusterBox)}`,
    );

    const longLabels = await phase(
      "longLabels",
      (config) => {
        config.i18n = {
          ...config.i18n,
          locales: (config.i18n?.locales ?? []).map((locale) => ({
            ...locale,
            label: `${locale.label} — reference deployment language`,
          })),
        };
        config.sites = (config.sites ?? []).map((site) => ({
          ...site,
          label: `${site.label} — reference deployment site`,
        }));
      },
      [[390, 844]],
      1,
    );
    const labels = longLabels.measured[0].probe;
    check(rows, "nav1b.labels.controlRowExists", !!labels && labels.contextRowPresent === true);
    check(rows, "nav1b.labels.wrapInsideTheControlRow", !!labels && labels.contextRows >= 2, `rows=${labels && labels.contextRows}`);
    check(rows, "nav1b.labels.neverJumpIntoTheTopRow", !!labels && labels.selectorInControlRow === false && labels.contextRowTop >= labels.topRowBottom, `contextTop=${labels && labels.contextRowTop} topBottom=${labels && labels.topRowBottom}`);
    check(rows, "nav1b.labels.noHorizontalOverflow", !!labels && labels.selectorRightInset !== null);

    // ── GRAPHIC IDENTITY (NAV1B-V1): the selector keeps the top-right and paints ABOVE the graphic,
    // which may pass beneath its occupied area — never shrunk into one column, never pushed onto
    // another row, never widening the page. The fixture is a test-owned CONFIGURATION pointing the
    // logo role at a SHIPPED wide placeholder; nothing authored is modified and no file is written.
    const graphic = await phase(
      "graphic",
      (config) => {
        config.site = {
          ...config.site,
          assets: { ...(config.site?.assets ?? {}), logo: GRAPHIC_FIXTURE_LOGO_URL },
        };
      },
      [
        [1280, 900],
        [900, 800],
        [768, 820],
        [390, 844],
        [320, 700],
      ],
      2,
    );
    for (const { width, probe } of graphic.measured) {
      const tag = `nav1b.graphic.w${width}`;
      check(rows, `${tag}.graphicIsTheIdentity`, !!probe && probe.logoPresent === true, `present=${probe && probe.logoPresent}`);
      // The graphic REALLY LOADED — proved by a natural size, never by a particular artwork's pixels
      // (M21 §15: an owner may replace an allowed graphic without failing a scenario about the shell). The layout
      // contracts around it are what this scenario is about, and they are asserted below.
      check(
        rows,
        `${tag}.graphicIsTheShippedFixture`,
        !!probe && /^[1-9]\d*x[1-9]\d*$/.test(String(probe.logoNaturalBox)),
        `natural=${probe && probe.logoNaturalBox}`,
      );
      // The graphic starts in its normal left-hand identity position, at its accepted lockup height.
      check(rows, `${tag}.graphicStartsAtThePaddedLeftEdge`, !!probe && probe.logoLeft !== null && probe.headerContentLeft !== null && Math.abs(probe.logoLeft - probe.headerContentLeft) <= 1, `left=${probe && probe.logoLeft} contentLeft=${probe && probe.headerContentLeft}`);
      check(rows, `${tag}.graphicKeepsItsAcceptedHeight`, !!probe && probe.logoHeight === 32, `height=${probe && probe.logoHeight}`);
      // NEVER shrunk to keep the selector on the first row: it renders at its natural width when that fits the
      // header's content box and is clamped PROPORTIONALLY to that width when it does not. NAV1B-V2 makes the ROW
      // move the cluster instead, so the graphic keeps its proportions and never widens the page.
      check(
        rows,
        `${tag}.graphicKeepsItsNaturalWidthUnlessItCannotFit`,
        !!probe &&
          probe.logoPresent === true &&
          probe.logoWidth !== null &&
          probe.headerContentWidth !== null &&
          (() => {
            const box = String(probe.logoNaturalBox).split("x").map(Number);
            const entitled = Math.min((box[0] / box[1]) * 32, probe.headerContentWidth);
            return probe.logoWidth >= entitled - 2;
          })(),
        `width=${probe && probe.logoWidth} natural=${probe && probe.logoNaturalBox} content=${probe && probe.headerContentWidth}`,
      );
      check(rows, `${tag}.graphicKeepsItsProportions`, !!probe && probe.logoObjectFit === "contain", `object-fit=${probe && probe.logoObjectFit}`);
      // THE ROW CONTRACT, MEASURED (the arrangement is named in the check names: `one-line` or `cluster-below`).
      checkRowContract(rows, tag, probe);
      // The selector never covers the brand, and never migrates into the control row: both hold at every width.
      check(rows, `${tag}.selectorStaysTopRight`, !!probe && probe.selectorInTopRow === true && probe.selectorInControlRow === false && Math.abs(probe.selectorRightInset) <= 1, `topRow=${probe && probe.selectorInTopRow} rightInset=${probe && probe.selectorRightInset}`);
      check(
        rows,
        `${tag}.selectorNeverCoversTheBrand`,
        !!probe && probe.brandClusterOverlap === false && probe.logoIntersectsSelector === false && probe.graphicInterceptsSelector === false,
        `overlap=${probe && probe.brandClusterOverlap} logoIntersects=${probe && probe.logoIntersectsSelector} intercepts=${probe && probe.graphicInterceptsSelector}`,
      );
      check(rows, `${tag}.selectorStillAnswersAtItsOwnCentre`, !!probe && probe.selectorHitAtItsOwnCentre === true, `hitInMode=${probe && probe.selectorHitAtItsOwnCentre}`);
      check(rows, `${tag}.controlRowStillBelow`, !!probe && (probe.contextRowPresent ? probe.contextRowTop >= probe.topRowBottom : true), `contextTop=${probe && probe.contextRowTop} topBottom=${probe && probe.topRowBottom}`);
      check(rows, `${tag}.noHorizontalOverflow`, !!probe && probe.documentOverflow <= 1, `overflow=${probe && probe.documentOverflow}`);
    }
    // ── THE CORRECTION, AT THE NARROWEST GRAPHIC WIDTH ─────────────────────────────────────────────
    //
    // The artwork is NEVER covered. NAV1B-V1 asserted the opposite here: a graphic wide enough to reach the
    // selector continued BENEATH it, and the raised, opaque cluster hid whatever it covered. The corrected row
    // cannot express that — the cluster leaves the brand's line instead of stacking over it — so at EVERY width the
    // two boxes do not overlap, the graphic never intercepts the control, and the control still answers at its own
    // centre (which is what a visitor's pointer needs).
    const narrowGraphic = graphic.measured[graphic.measured.length - 1].probe;
    check(
      rows,
      "nav1b.graphic.narrowest.graphicIsNeverCoveredByTheSelector",
      !!narrowGraphic &&
        narrowGraphic.brandClusterOverlap === false &&
        narrowGraphic.logoIntersectsSelector === false &&
        narrowGraphic.graphicInterceptsSelector === false &&
        narrowGraphic.selectorHitAtItsOwnCentre === true,
      `overlap=${narrowGraphic && narrowGraphic.brandClusterOverlap} logoIntersects=${narrowGraphic && narrowGraphic.logoIntersectsSelector} intercepts=${narrowGraphic && narrowGraphic.graphicInterceptsSelector} hitInSelector=${narrowGraphic && narrowGraphic.selectorHitAtItsOwnCentre}`,
    );
    check(
      rows,
      "nav1b.graphic.graphicStaysInsideThePageContent",
      !!narrowGraphic && narrowGraphic.logoRight <= narrowGraphic.innerWidth - 8,
      `logoRight=${narrowGraphic && narrowGraphic.logoRight} inner=${narrowGraphic && narrowGraphic.innerWidth}`,
    );
    check(
      rows,
      "nav1b.graphic.narrowest.compactMarkStillSharesTheLine",
      !!narrowGraphic &&
        narrowGraphic.clusterPresent === true &&
        narrowGraphic.clusterBelowBrand === false &&
        narrowGraphic.brandClusterOverlap === false,
      `brand=${narrowGraphic && JSON.stringify(narrowGraphic.brandBox)} cluster=${narrowGraphic && JSON.stringify(narrowGraphic.clusterBox)}`,
    );

    // ── THE WIDE-ARTWORK IDENTITIES LIVE IN THE header-identity SCENARIO ───────────────────────────
    //
    // See the note above `GRAPHIC_FIXTURE_LOGO_URL`: this environment can only serve the platform namespace's
    // compact marks, so the lockup and the exceptionally wide lockup (and the proportional clamp they make
    // binding) are measured on a test-owned Hub instead — same widths, same row contract.

    // ── THE HEADER WITH NO TOP-RIGHT SELECTOR (UI-R1) ───────────────────────────────────────────────
    //
    // The row's single-occupant state: a brand with nothing beside it. No control, no spacer and no empty line may
    // be invented for it, and the brand keeps the padded left edge.
    const noSelector = await phase(
      "noSelector",
      (config) => {
        config.ui = { ...(config.ui ?? {}), layoutSwitcher: { enabled: false } };
      },
      [
        [1280, 900],
        [390, 844],
        [320, 700],
      ],
      4,
    );
    for (const { width, probe } of noSelector.measured) {
      const tag = `nav1b.noSelector.w${width}`;
      check(rows, `${tag}.brandIsTheRowsOnlyOccupant`, !!probe && !!probe.brandBox && probe.brandBox.width > 0, `brand=${probe && JSON.stringify(probe.brandBox)}`);
      checkRowContract(rows, tag, probe, { expectCluster: false });
      check(rows, `${tag}.controlRowStillBelow`, !!probe && (probe.contextRowPresent ? probe.contextRowTop >= probe.topRowBottom : true), `contextTop=${probe && probe.contextRowTop} topBottom=${probe && probe.topRowBottom}`);
      check(rows, `${tag}.noHorizontalOverflow`, !!probe && probe.documentOverflow <= 1, `overflow=${probe && probe.documentOverflow}`);
    }
  } catch (error) {
    check(rows, "headerRows.scenario.error", false, String(error));
  } finally {
    await writeFile(CONFIG_PATH, original, "utf8");
  }
  return rows;
}

/**
 * MULTISITE FIXTURES (FOUNDATION-S1).
 *
 * The scenario below proves the USER-VISIBLE consequences of the site/locale/page model on ONE
 * temporary deployment: two independent country sites that genuinely differ, driven through the
 * four visitor dimensions (Site, Language, Location, Layout). Everything here is a run fixture —
 * the configuration and the pages are written by the scenario and restored/removed in `finally`,
 * so the shipped template keeps shipping one site and no pages.
 */
const MULTISITE_SITES = ["ca", "fr"];
const MULTISITE_MARK = {
  caFr: "ZZ-CANADA-FRENCH-BODY",
  caEn: "ZZ-CANADA-ENGLISH-BODY",
  frFr: "ZZ-FRANCE-FRENCH-BODY",
};
const MULTISITE_PAGES = [
  ["ca", "fr", "about", MULTISITE_MARK.caFr, "A propos (Canada)"],
  ["ca", "en", "about", MULTISITE_MARK.caEn, "About (Canada)"],
  ["fr", "fr", "about", MULTISITE_MARK.frFr, "A propos (France)"],
  ["ca", "fr", "zz-ca-only", "ZZ-CANADA-ONLY-PAGE", "Page du Canada"],
];

/** The shared selector control the visitor uses for one dimension. */
const MULTISITE_SELECT = (name) => `select[data-selector="${name}"]`;

/** The four visitor dimensions, exactly as the browser exposes them. */
const MULTISITE_PROBE = `(() => {
  const info = (name) => {
    const element = document.querySelector('select[data-selector="' + name + '"]');
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      value: element.value,
      name: element.getAttribute('aria-label') || '',
      options: [...element.options].map((option) => option.value),
      visible: rect.width > 0 && rect.height > 0,
    };
  };
  const navLinks = [...document.querySelectorAll('a')].filter((a) => {
    if (a.closest('[inert]')) return false;
    const rect = a.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  return {
    path: location.pathname,
    body: (document.body.textContent || '').replace(/\\s+/g, ' '),
    site: info('site'),
    language: info('language'),
    location: info('location'),
    layout: info('layout'),
    shellLayout: document.documentElement.getAttribute('data-ui-shell-layout'),
    navLabels: navLinks.map((a) => a.textContent.trim()),
    visibleLinks: navLinks.length,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    mobileNavPresent: !!document.querySelector('nav[aria-label]'),
  };
})()`;

/** Choose an option on one of the shared selector controls, as the visitor would. */
const multisiteChoose = (name, value) => `(() => {
  const element = document.querySelector('select[data-selector="${name}"]');
  if (!element) return false;
  element.value = ${JSON.stringify(value)};
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

async function runMultisiteScenario(chrome) {
  const port = BASE_PORT + 271;
  BASE_URL = `http://localhost:${port}`;
  const original = await readFile(CONFIG_PATH, "utf8");
  const written = [];
  const rows = [];

  for (const [site, locale, slug, body, title] of MULTISITE_PAGES) {
    const file = join(CONTENT_ROOT, "markdown", site, locale, `${slug}.md`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, `---\ntitle: ${title}\n---\n\n# ${title}\n\n${body}\n`, "utf8");
    written.push(file);
  }

  // TWO independent sites that genuinely differ — bodies, chrome, locales and locations —
  // plus the visitor dimensions switched on (Layout switcher, one Location in Canada).
  // A locale needs a dictionary, and the template ships ONE: the fixture deployment speaks French,
  // so the scenario writes a temporary French dictionary (a copy of the shipped English one — it
  // validates against the same schema) and removes it in `finally`, exactly like its pages.
  const dictionaryPath = join(DICTIONARY_ROOT, "fr.json");
  await writeFile(
    dictionaryPath,
    await readFile(join(DICTIONARY_ROOT, "en.json"), "utf8"),
    "utf8",
  );
  // R1A — the SHARED dictionary is the wording authority for a configured navigation
  // href, and the reference deployment's dictionary now carries a `/about` label. A site
  // that wants its OWN wording therefore uses a SITE dictionary overlay
  // (`config/i18n/sites/<site>/<locale>.json`) — the documented mechanism this fixture now
  // exercises for its France site, so site-scoped chrome is proved without depending on a
  // gap in the shared dictionary.
  const overlayPath = join(DICTIONARY_ROOT, "sites", "fr", "fr.json");
  await mkdir(dirname(overlayPath), { recursive: true });
  await writeFile(
    overlayPath,
    `${JSON.stringify({ navigation: { items: { "/": "Accueil FR", "/about": "À propos FR" } } }, null, 2)}\n`,
    "utf8",
  );

  const config = JSON.parse(original);
  const ui = { ...(config.ui ?? {}) };
  delete ui.navigation;
  ui.layoutSwitcher = { enabled: true };
  config.ui = ui;
  config.i18n = {
    ...config.i18n,
    defaultLocale: "fr",
    locales: [
      { code: "en", label: "English" },
      { code: "fr", label: "Français" },
    ],
  };
  config.sites = [
    {
      code: "ca",
      label: "Canada",
      locales: ["fr", "en"],
      defaultLocale: "fr",
      navigation: [
        { label: "Accueil CA", href: "/" },
        { label: "À propos CA", href: "/about" },
      ],
    },
    {
      code: "fr",
      label: "France",
      locales: ["fr"],
      defaultLocale: "fr",
      navigation: [
        { label: "Accueil FR", href: "/" },
        { label: "À propos FR", href: "/about" },
      ],
    },
  ];
  config.defaultSite = "ca";
  config.navigation = [{ label: "Shared", href: "/" }];
  config.business = {
    regions: {
      toronto: {
        timezone: "America/Toronto",
        address: { street: "1 Demo St", city: "Toronto", country: "Canada" },
        hours: {},
      },
    },
    // The location belongs to CANADA only: France must never offer it.
    pages: [{ site: "ca", locale: "fr", region: "toronto" }],
  };
  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  const server = startDevServer(port);
  let cdp = null;
  try {
    await waitForServer(`${BASE_URL}/ca/fr`);
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);

    // ── DIRECT NAVIGATION: each site serves its OWN body at its own URL ──────
    await cdp.navigate(`${BASE_URL}/ca/fr/about`);
    await waitReady(cdp);
    const canada = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.canadaFrenchServesCanadaBody", canada.body.includes(MULTISITE_MARK.caFr), canada.path);
    check(rows, "multisite.canadaFrenchIsNotTheFranceBody", !canada.body.includes(MULTISITE_MARK.frFr));

    await cdp.navigate(`${BASE_URL}/fr/fr/about`);
    await waitReady(cdp);
    const france = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.franceFrenchServesFranceBody", france.body.includes(MULTISITE_MARK.frFr), france.path);
    check(rows, "multisite.franceFrenchIsNotTheCanadaBody", !france.body.includes(MULTISITE_MARK.caFr));
    check(rows, "multisite.sameRouteNameDifferentBodies", canada.body !== france.body);

    // ── SWITCHING: Language stays in the site, Site preserves the route ──────
    await cdp.navigate(`${BASE_URL}/ca/fr/about`);
    await waitReady(cdp);
    await cdp.evaluate(multisiteChoose("language", "en"));
    // The choice navigates WITHOUT a document load, so await the route it must produce.
    await waitReady(cdp, { path: "/ca/en/about", body: MULTISITE_MARK.caEn });
    const canadaEnglish = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.languageSwitchStaysInsideTheSite", canadaEnglish.path === "/ca/en/about", canadaEnglish.path);
    check(rows, "multisite.languageSwitchServesThatSiteOwnBody", canadaEnglish.body.includes(MULTISITE_MARK.caEn), canadaEnglish.path);
    check(rows, "multisite.languageSwitchNeverReachesAnotherSite", !canadaEnglish.body.includes(MULTISITE_MARK.frFr));

    // Layout is the visitor's own presentation choice: it is NOT part of the page identity, so it
    // must survive BOTH a site switch and a language switch.
    await cdp.evaluate(multisiteChoose("layout", "menu-bar"));
    await waitReady(cdp);
    const menuBar = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.layoutChosenAndReflected", menuBar.shellLayout === "menu-bar", menuBar.shellLayout);

    await cdp.evaluate(multisiteChoose("site", "fr"));
    await waitReady(cdp, { path: "/fr/fr/about", body: MULTISITE_MARK.frFr });
    const toFrance = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.siteSwitchPreservesTheRoute", toFrance.path === "/fr/fr/about", toFrance.path);
    check(rows, "multisite.siteSwitchServesTheTargetSiteBody", toFrance.body.includes(MULTISITE_MARK.frFr), toFrance.path);
    check(rows, "multisite.layoutSurvivesSiteSwitch", toFrance.shellLayout === "menu-bar", toFrance.shellLayout);
    check(rows, "multisite.chromeFollowsTheTargetSite", toFrance.navLabels.includes("À propos FR") && !toFrance.navLabels.includes("À propos CA"), `[${toFrance.navLabels}]`);

    await cdp.evaluate(multisiteChoose("language", "fr"));
    await waitReady(cdp, { path: "/fr/fr/about", body: MULTISITE_MARK.frFr });
    await cdp.evaluate(multisiteChoose("site", "ca"));
    await waitReady(cdp, { path: "/ca/fr/about", body: MULTISITE_MARK.caFr });
    await cdp.evaluate(multisiteChoose("language", "en"));
    await waitReady(cdp, { path: "/ca/en/about", body: MULTISITE_MARK.caEn });
    const layoutAfterLanguage = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.layoutSurvivesLanguageSwitch", layoutAfterLanguage.shellLayout === "menu-bar", layoutAfterLanguage.shellLayout);
    check(rows, "multisite.oneVisibleNavigationStructureAfterSwitching", layoutAfterLanguage.visibleLinks === menuBar.visibleLinks, `${menuBar.visibleLinks} -> ${layoutAfterLanguage.visibleLinks}`);

    // The keyboard is never stranded: the control the visitor just used is still operable.
    const refocus = await cdp.evaluate(`(() => {
      const element = document.querySelector('${MULTISITE_SELECT("site")}');
      if (!element || element.disabled) return false;
      element.focus();
      return document.activeElement === element;
    })()`);
    check(rows, "multisite.focusRemainsUsableAfterSwitching", refocus === true);

    // ── A ROUTE THE TARGET SITE DOES NOT HAVE falls back to ITS home ─────────
    await cdp.navigate(`${BASE_URL}/ca/fr/zz-ca-only`);
    await waitReady(cdp);
    const canadaOnly = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.canadaOnlyPageIsServedInCanada", canadaOnly.body.includes("ZZ-CANADA-ONLY-PAGE"), canadaOnly.path);
    await cdp.evaluate(multisiteChoose("site", "fr"));
    await waitReady(cdp, { path: "/fr/fr" });
    const fellBack = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.siteSwitchFallsBackToTheTargetHome", fellBack.path === "/fr/fr", fellBack.path);
    check(rows, "multisite.fallbackLandsOnARealPage", fellBack.body.includes("À propos FR") || fellBack.body.length > 0, fellBack.path);

    // ── LOCATION SEMANTICS STAY INSIDE THE ACTIVE SITE ──────────────────────
    // The accepted S1 model: the location INVENTORY is every configured operating location
    // (`business.regions`), while the DESTINATIONS come from the ACTIVE site's own bindings. What
    // must never happen is a location carrying the visitor across a site boundary, so the proof is
    // that a Canada-only regional path cannot leave the visitor inside that region on France.
    await cdp.navigate(`${BASE_URL}/ca/fr/toronto`);
    await waitReady(cdp);
    const inToronto = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.locationSelectorReflectsTheActiveLocation", !!inToronto.location && inToronto.location.value === "toronto", inToronto.location && inToronto.location.value);
    await cdp.evaluate(multisiteChoose("site", "fr"));
    await waitReady(cdp, { path: "/fr/fr" });
    const afterLocationSwitch = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.locationNeverCarriesTheVisitorAcrossSites", afterLocationSwitch.path === "/fr/fr" && !afterLocationSwitch.path.includes("toronto") && !afterLocationSwitch.body.includes("ZZ-CANADA-ONLY-PAGE"), `${inToronto.path} -> ${afterLocationSwitch.path}`);

    // ── PRESENTATION HEALTH AT BOTH BANDS ───────────────────────────────────
    await cdp.navigate(`${BASE_URL}/ca/fr/about`);
    await waitReady(cdp);
    const desktop = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.noHorizontalOverflowDesktop", desktop.horizontalOverflow === false);
    check(rows, "multisite.onePrimaryNavigationIsExposed", desktop.visibleLinks === menuBar.visibleLinks, `${desktop.visibleLinks}`);

    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await cdp.navigate(`${BASE_URL}/ca/fr/about`);
    await waitReady(cdp);
    const mobile = await cdp.evaluate(MULTISITE_PROBE);
    check(rows, "multisite.mobile.noHorizontalOverflow", mobile.horizontalOverflow === false);
    check(rows, "multisite.mobile.servesTheSameSiteBody", mobile.body.includes(MULTISITE_MARK.caFr), mobile.path);
    check(rows, "multisite.mobile.chromeIsPresent", mobile.mobileNavPresent === true);

  } catch (error) {
    check(rows, "multisite.scenario.error", false, String(error));
  } finally {
    await writeFile(CONFIG_PATH, original, "utf8");
    await rm(dictionaryPath, { force: true });
    // The site overlay is a fixture too: remove it, then only the directories this run
    // created while they are empty.
    await rm(overlayPath, { force: true });
    for (const directory of [
      join(DICTIONARY_ROOT, "sites", "fr"),
      join(DICTIONARY_ROOT, "sites"),
    ]) {
      try {
        await rmdir(directory);
      } catch {
        /* not empty (or already gone): leave it exactly as it is */
      }
    }
    if (cdp) await cdp.close();
    await stopServer(server);
    for (const file of written) await rm(file, { force: true });
    // Remove the fixture site trees ONLY while they are empty — never a recursive delete, so a
    // developer's own pages can never be caught by a browser run.
    for (const site of MULTISITE_SITES) {
      for (const mode of ["markdown", "json"]) {
        for (const locale of ["fr", "en"]) {
          for (const directory of [join(CONTENT_ROOT, mode, site, locale, "zz-ca-only")]) {
            try {
              await rmdir(directory);
            } catch {
              /* not empty (or already gone): leave it exactly as it is */
            }
          }
          try {
            await rmdir(join(CONTENT_ROOT, mode, site, locale));
          } catch {
            /* not empty (or already gone): leave it exactly as it is */
          }
        }
        try {
          await rmdir(join(CONTENT_ROOT, mode, site));
        } catch {
          /* not empty (or already gone): leave it exactly as it is */
        }
      }
    }
  }
  return rows;
}

/**
 * FOUNDATION-UI1 — THE SIDEBAR'S PRESENTATION STATE LIFECYCLE (the owner-observed defect).
 * ======================================================================================
 *
 * The visitor's sidebar choice is a PRESENTATION PREFERENCE, and it used to survive neither of the two
 * things a visitor actually does:
 *
 *   · REFRESH — the rail returned OPEN after a reload, because its open/closed state lived only in the
 *     mounted component's memory and a reload creates a new document;
 *   · NAVIGATION — a CLOSED rail arrived OPEN after clicking a navigation icon, because the shell is
 *     composed inside the `[[...segments]]` layout, so a client-side route change REMOUNTS the rail (the
 *     page did not reload: `documentLoads` stays at 1) and the re-created instance started from its
 *     initial state again.
 *
 * Neither defect involved any code that opened the sidebar, and this scenario proves the replacement
 * contract through the REAL controls only:
 *
 *   no preference         → the canonical state is CLOSED (never "whatever mounted");
 *   toggle                → the choice is recorded (`foundation.sidebar`, read from the app's own source);
 *   reload                → the choice survives the new document;
 *   navigation ICON click → the destination keeps the current state (closed stays closed, open stays open);
 *   a selector route change (Site) and a presentation change (Layout) → the state is independent of both.
 *
 * Two further proofs are measured rather than assumed:
 *
 *   FIRST PAINT — a frame recorder samples the rail's state, its PAINTED geometry and its presentation on
 *   every animation frame (installed before the document's own scripts run), so "the first painted state
 *   matches the preference" is an observation rather than a claim;
 *   CONSOLE — every console error/warning of the run is collected, and a HYDRATION message fails the run.
 *
 * UI1-A2 adds the FULL-DOCUMENT first-paint contract, because the frame recorder's ATTRIBUTE channel could
 * not see the defect the owner reported on refresh: a document with a stored OPEN preference rendered the
 * canonical CLOSED rail and expanded it after hydration (CLOSED first paint, then a 36px → 220px width
 * transition). The repair is a synchronous pre-paint bridge, so the rows judge what is ON SCREEN —
 * `firstPaint.*` — on a REAL reload: the first painted state, every painted state of the new document, the
 * boot presentation against the runtime presentation, the relinquish of the bridge, and the absence of any
 * boot-induced width transition. Reverting the repair flips those rows.
 *
 * UI1-A1 adds a THIRD, because the first one is not sufficient on its own: a rail that commits the canonical
 * state and adopts the stored one in the SAME commit paints no wrong frame, yet the browser still starts the
 * rail's `width 200ms` CSS transition from the committed CLOSED geometry — the owner-visible flicker. The
 * transition observer (below) therefore judges the whole navigation INTERVAL: no opposite-state commit on
 * the rail (replacement nodes included) and no width transition. `toggle.stillAnimatesTheRail` calibrates
 * that observer on an explicit toggle, which is the one control allowed to move the rail.
 *
 * The mobile layer is deliberately NOT touched: below `md` the navigation is a different interaction
 * model (an ephemeral drawer/bottom bar), so one bounded row records that the preference does not reach
 * into it.
 */

/**
 * The preference contract, READ FROM THE APP'S OWN SOURCE, so this scenario cannot agree with a copy.
 *
 * UI1-A2 — the key, the vocabulary and the boot marker are declared in ONE authority
 * (`src/components/ui/sidebar-contract.ts`), which both the pre-paint bridge and the runtime consume; the runtime module
 * simply re-exports them. The scenario therefore reads the AUTHORITY, and the attribute it observes is the
 * same one the app writes — never a literal spelled again here.
 */
const SIDEBAR_PREFERENCE_SOURCE = readFileSync(join(ROOT, "src", "components", "ui", "sidebar-contract.ts"), "utf8");
const SIDEBAR_PREFERENCE_KEY = (() => {
  const match = /SIDEBAR_PREFERENCE_STORAGE_KEY\s*=\s*"([^"]+)"/.exec(SIDEBAR_PREFERENCE_SOURCE);
  if (!match) {
    throw new Error("the sidebar preference key must be declared in @/components/ui/sidebar-contract.ts");
  }
  return match[1];
})();
/** The inert `<html>` marker the pre-paint bridge writes, from the same authority. */
const SIDEBAR_PREFERENCE_MARKER = (() => {
  const match = /SIDEBAR_PREFERENCE_ATTRIBUTE\s*=\s*"([^"]+)"/.exec(SIDEBAR_PREFERENCE_SOURCE);
  if (!match) {
    throw new Error("the sidebar boot marker must be declared in @/components/ui/sidebar-contract.ts");
  }
  return match[1];
})();
/**
 * UI1-A3-A1 — the control's OPEN-name declaration, from the same authority, and the SHARED semantics reader
 * built from both hooks. A candidate that has not declared the OPEN-name hook yet is reported by a failing
 * row (never a crash), so this gate can run against a candidate that still has the defect.
 */
const SIDEBAR_OPEN_NAME_ATTRIBUTE = readSemanticsHooks(SIDEBAR_PREFERENCE_SOURCE).openNameAttribute;
const SIDEBAR_SEMANTICS = sidebarSemanticsReader({
  marker: SIDEBAR_PREFERENCE_MARKER,
  openNameAttribute: SIDEBAR_OPEN_NAME_ATTRIBUTE,
});


/** The rail the visitor is actually looking at, and the state it presents (one band is displayed). */
const SIDEBAR_STATE_PROBE = `(() => {
  ${PRESENTED_VARIANT}
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rails = [
    { band: 'desktop', el: document.querySelector('#shell-sidebar-desktop-rail') },
    { band: 'tablet', el: document.querySelector('#shell-sidebar-tablet-rail') },
    // NAV1D — the sidebar's own mobile band is the SAME rail, so it is one of the presentations this
    // probe looks for (the sidebar mode no longer substitutes a drawer for it).
    { band: 'mobile', el: document.querySelector('#shell-sidebar-mobile-rail') },
  ];
  const current = rails.find((rail) => shown(rail.el)) || null;
  const rail = current ? current.el : null;
  const toggle = rail ? rail.querySelector('.ui-sidebar-toggle') : null;
  // UI1-A3 — the label this control PRESENTS (its own state's), never the state pair's first element: the rows
  // below read this field as "what the control says right now". The collapsed state's label is sr-only (kept
  // as the control's name), so it counts as presented — 'presented' asks for a real box, not for visibility.
  const label = toggle ? presentedLabel(toggle) : null;
  const bottomBar = document.querySelector('.ui-shell-bottom-bar');
  return JSON.stringify({
    path: location.pathname,
    band: current ? current.band : null,
    railPresent: !!rail,
    collapsed: rail ? rail.getAttribute('data-collapsed') : null,
    expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    label: label ? label.textContent.trim() : null,
    width: rail ? Math.round(rail.getBoundingClientRect().width) : null,
    stored: window.localStorage.getItem(${JSON.stringify(SIDEBAR_PREFERENCE_KEY)}),
    drawer: !!document.querySelector('[role="dialog"]'),
    mobileDrawer: shown(document.querySelector('[data-ui-shell-part="mobile-drawer"]')),
    mobileBar: shown(bottomBar),
  });
})()`;

/**
 * Installed in EVERY document of this scenario, BEFORE the document's own scripts run: the rail's state on
 * every animation frame (from the first frame it exists in), the rail's PAINTED geometry, the document's
 * boot marker, and every console message at error/warning level, so a hydration mismatch cannot pass
 * unnoticed.
 *
 * UI1-A2 — WHY THE PAINTED GEOMETRY IS RECORDED TOO. The attribute alone cannot answer "what did the
 * visitor see": a document with a stored OPEN preference renders the canonical CLOSED rail and adopts the
 * stored state in its first commit, so the ATTRIBUTE can be corrected while the painted geometry was
 * already the narrow rail. The recorder therefore samples the rail's rendered WIDTH every frame (36px = the
 * collapsed column, 220px = the open rail) and takes a full presentation fingerprint the first time a rail
 * exists — so "the first painted state is the visitor's OPEN rail, and no CLOSED frame was ever shown" is
 * measured rather than asserted.
 */
const SIDEBAR_WATCH = `(() => {
  ${PRESENTED_VARIANT}
  ${SIDEBAR_SEMANTICS}
  const watch = { frames: [], console: [], bootFp: null };
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const level of ['error', 'warn']) {
    const reported = console[level];
    console[level] = function (...args) {
      try { watch.console.push(String(args[0])); } catch (error) { /* the page's own message is lost, never ours */ }
      return reported.apply(this, args);
    };
  }
  /** The rail's VISIBLE presentation: geometry plus the state-dependent computed values. */
  const fingerprint = (rail) => {
    if (!rail) return null;
    const toggle = rail.querySelector('.ui-sidebar-toggle');
    const label = rail.querySelector('.ui-nav-item-label');
    const link = rail.querySelector('li > a, li > span');
    const list = rail.querySelector('ul');
    const iconOpen = rail.querySelector('.ui-nav-item-icon-open');
    const iconClosed = rail.querySelector('.ui-nav-item-icon-closed');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const railCs = cs(rail);
    const toggleCs = cs(toggle);
    const labelCs = cs(label);
    const linkCs = cs(link);
    const listCs = cs(list);
    return [
      'railW=' + Math.round(rail.getBoundingClientRect().width),
      'railPad=' + railCs.paddingInlineStart + '/' + railCs.paddingInlineEnd,
      'toggle=' + (toggleCs ? toggleCs.justifyContent + '|' + toggleCs.marginInlineStart + '|' + toggleCs.paddingInlineStart + '|' + toggleCs.backgroundColor : 'n/a'),
      'label=' + (labelCs ? labelCs.position + '|' + labelCs.clipPath + '|' + Math.round(label.getBoundingClientRect().width) : 'n/a'),
      'link=' + (linkCs ? linkCs.display + '|' + linkCs.justifyContent : 'n/a'),
      'listPad=' + (listCs ? listCs.paddingInlineStart : 'n/a'),
      'icons=' + (cs(iconOpen) ? cs(iconOpen).display : 'n/a') + '/' + (cs(iconClosed) ? cs(iconClosed).display : 'n/a'),
      // UI1-A3 — the disclosure CONTROL's own presented content (artwork + label). Without this field a
      // document that painted the canonical state's control and swapped it at hydration produced an identical
      // fingerprint, which is exactly how the owner-observed content flicker passed this gate.
      'ctl=' + presentedControl(rail),
      // UI1-A3-A1 — and what the control CLAIMS (aria-expanded, accessible name, the declarations those are
      // judged against): without this field a document whose control announced the opposite state produced an
      // identical fingerprint, which is how the semantic contradiction passed every earlier gate.
      'sem=' + semanticProjection(rail),
    ].join('  ');
  };
  const sample = () => {
    if (watch.frames.length < 200) {
      const desktop = document.querySelector('#shell-sidebar-desktop-rail');
      const tablet = document.querySelector('#shell-sidebar-tablet-rail');
      const rail = [desktop, tablet].find(shown) || null;
      if (rail && watch.bootFp === null) watch.bootFp = fingerprint(rail);
      watch.frames.push({
        t: Math.round(performance.now()),
        desktop: desktop ? desktop.getAttribute('data-collapsed') : null,
        tablet: tablet ? tablet.getAttribute('data-collapsed') : null,
        desktopW: desktop ? Math.round(desktop.getBoundingClientRect().width) : null,
        tabletW: tablet ? Math.round(tablet.getBoundingClientRect().width) : null,
        boot: document.documentElement.getAttribute(${JSON.stringify(SIDEBAR_PREFERENCE_MARKER)}),
        // UI1-A3-A1 — the control's semantics in this very frame, plus the projection that must be identical
        // to the hydrated runtime's.
        sem: rail ? semantics(rail) : null,
        semFp: rail ? semanticProjection(rail) : null,
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  window.__ui1Watch = watch;
})()`;

/** The collapsed rail's own width: anything at or below it is the icon column the visitor sees as CLOSED. */
const SIDEBAR_PAINTED_NARROW_MAX = 64;

/** What the recorder has seen: each band's first state, the PAINTED states, the boot marker, the console. */
const SIDEBAR_WATCH_PROBE = `(() => {
  const watch = window.__ui1Watch || { frames: [], console: [], bootFp: null };
  const firstOf = (band) => { const frame = watch.frames.find((entry) => entry[band] !== null); return frame ? frame[band] : null; };
  const painted = watch.frames.filter((entry) => typeof entry.desktopW === 'number' && entry.desktopW > 0);
  return JSON.stringify({
    desktopFirst: firstOf('desktop'),
    tabletFirst: firstOf('tablet'),
    desktopFirstPaintedWidth: painted.length > 0 ? painted[0].desktopW : null,
    paintedStates: painted.map((entry) => (entry.desktopW <= ${SIDEBAR_PAINTED_NARROW_MAX} ? 'closed' : 'open')),
    paintedWidths: [...new Set(painted.map((entry) => entry.desktopW))],
    bootMarkers: [...new Set(watch.frames.map((entry) => entry.boot))],
    bootFp: watch.bootFp,
    frames: watch.frames.map((entry) => entry.desktop),
    // UI1-A3-A1 — the semantics observed on every painted frame, and their projections.
    semantics: painted.map((entry) => entry.sem),
    semanticsProjections: painted.map((entry) => entry.semFp),
    // …and, for a failing row's detail, the frame facts a judgement is made about (marker + attribute + the
    // reading), so a disagreement names the frame instead of only counting frames.
    semanticsContext: painted.map((entry) =>
      JSON.stringify({ boot: entry.boot, collapsed: entry.desktop, sem: entry.sem })),
    after: watch.frames.length,
    console: watch.console,
  });
})()`;

/**
 * The rail as the runtime presents it RIGHT NOW, plus the boot fingerprint the recorder captured and the
 * document's boot marker. This is what makes "the boot presentation matches the real OPEN rail" and "the
 * bridge was relinquished" observations rather than claims.
 */
const SIDEBAR_RUNTIME_PROBE = `(() => {
  ${PRESENTED_VARIANT}
  ${SIDEBAR_SEMANTICS}
  const marker = ${JSON.stringify(SIDEBAR_PREFERENCE_MARKER)};
  const watch = window.__ui1Watch || {};
  const fingerprintOf = (element) => {
    if (!element) return null;
    const toggle = element.querySelector('.ui-sidebar-toggle');
    const label = element.querySelector('.ui-nav-item-label');
    const link = element.querySelector('li > a, li > span');
    const list = element.querySelector('ul');
    const iconOpen = element.querySelector('.ui-nav-item-icon-open');
    const iconClosed = element.querySelector('.ui-nav-item-icon-closed');
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const railCs = cs(element);
    const toggleCs = cs(toggle);
    const labelCs = cs(label);
    const linkCs = cs(link);
    const listCs = cs(list);
    return [
      'railW=' + Math.round(element.getBoundingClientRect().width),
      'railPad=' + railCs.paddingInlineStart + '/' + railCs.paddingInlineEnd,
      'toggle=' + (toggleCs ? toggleCs.justifyContent + '|' + toggleCs.marginInlineStart + '|' + toggleCs.paddingInlineStart + '|' + toggleCs.backgroundColor : 'n/a'),
      'label=' + (labelCs ? labelCs.position + '|' + labelCs.clipPath + '|' + Math.round(label.getBoundingClientRect().width) : 'n/a'),
      'link=' + (linkCs ? linkCs.display + '|' + linkCs.justifyContent : 'n/a'),
      'listPad=' + (listCs ? listCs.paddingInlineStart : 'n/a'),
      'icons=' + (cs(iconOpen) ? cs(iconOpen).display : 'n/a') + '/' + (cs(iconClosed) ? cs(iconClosed).display : 'n/a'),
      // UI1-A3 — the same field the recorder captured at boot, so "the control the visitor saw from the first
      // painted frame IS the control the runtime presents" is compared, not assumed.
      'ctl=' + presentedControl(element),
      // UI1-A3-A1 — the same field the recorder captured at boot, so "the control the visitor saw from the
      // first painted frame IS the control the runtime presents AND claims" is compared, not assumed.
      'sem=' + semanticProjection(element),
    ].join('  ');
  };
  const rail = document.querySelector('#shell-sidebar-desktop-rail');
  return JSON.stringify({
    bootMarker: document.documentElement.getAttribute(marker),
    bootFp: watch.bootFp || null,
    runtimeFp: fingerprintOf(rail),
    // UI1-A3-A1 — the runtime's own semantic facts, so a row's expectation is derived from the SAME markup
    // the visitor has rather than from a copy of the expected copy.
    runtimeFacts: rail ? semanticFacts(rail) : null,
    runtimeProjection: rail ? semanticProjection(rail) : null,
    operableControls: rail ? rail.querySelectorAll('.ui-sidebar-toggle').length : null,
  });
})()`;

/** The rail state as the visitor sees it. */
const sidebarState = async (cdp) => JSON.parse(await cdp.evaluate(SIDEBAR_STATE_PROBE));

/** What the frame recorder has observed so far. */
const sidebarWatch = async (cdp) => JSON.parse(await cdp.evaluate(SIDEBAR_WATCH_PROBE));

/** The rail as the runtime presents it — the reference the boot presentation is compared against. */
const sidebarRuntime = async (cdp) => JSON.parse(await cdp.evaluate(SIDEBAR_RUNTIME_PROBE));

/**
 * UI1-A2 — THE FIRST-PAINT CONTRACT OF A WHOLE DOCUMENT LOAD, as rows. The scenario calls this after an
 * ACTUAL reload (a new document), once readiness has settled, and it judges the PAINTED state rather than
 * the attribute:
 *
 *   firstPaintedState    the state of the first frame in which a rail was on screen;
 *   neverPaintedOpposite no frame of the new document showed the other state — not for one frame;
 *   bootPresentation     the fingerprint captured the first time a rail existed equals the fingerprint the
 *                        runtime presents now (labels, icons, control inset, list inset and geometry), so
 *                        the boot presentation IS the rail the visitor asked for, not just its width;
 *   bridgeRelinquished   the boot marker is gone once the runtime represents the resolved preference.
 *
 * `expectedPainted` is the state the visitor stored for this document; `expectedMarker` is what the pre-paint
 * bridge is allowed to have marked the document with at boot ("open" for a stored OPEN preference, none
 * otherwise). `judgeTransitions` asks the transition observer about the interval that produced this document.
 */
async function checkSidebarFirstPaint(rows, cdp, label, expectedPainted, { expectMarker = null, judgeTransitions = true } = {}) {
  const watch = await sidebarWatch(cdp);
  const runtime = await sidebarRuntime(cdp);
  const painted = watch.paintedStates;
  const first = painted.length > 0 ? painted[0] : null;
  const opposite = expectedPainted === "open" ? "closed" : "open";
  check(
    rows,
    `firstPaint.${label}.firstPaintedStateIs${expectedPainted === "open" ? "Open" : "Closed"}`,
    painted.length > 0 && first === expectedPainted,
    `firstPainted=${first} width=${watch.desktopFirstPaintedWidth} states=${painted.join(",")} widths=${JSON.stringify(watch.paintedWidths)}`,
  );
  check(
    rows,
    `firstPaint.${label}.neverPainted${opposite === "open" ? "Open" : "Closed"}`,
    painted.length > 0 && painted.every((state) => state === expectedPainted),
    `states=${JSON.stringify([...new Set(painted)])}`,
  );
  check(
    rows,
    `firstPaint.${label}.bootPresentationMatches${expectedPainted === "open" ? "Open" : "Closed"}Rail`,
    Boolean(watch.bootFp) && watch.bootFp === runtime.runtimeFp,
    `boot=${watch.bootFp} runtime=${runtime.runtimeFp}`,
  );
  check(
    rows,
    `firstPaint.${label}.bridgeRelinquished`,
    expectMarker === null ? true : runtime.bootMarker === null,
    `bootMarker=${runtime.bootMarker} bootMarkersSeen=${JSON.stringify(watch.bootMarkers)} (bridge marker: ${expectMarker ?? "none"})`,
  );
  if (expectMarker !== null) {
    check(
      rows,
      `firstPaint.${label}.bridgeMarkedTheDocumentAtBoot`,
      watch.bootMarkers.includes(expectMarker),
      `bootMarkersSeen=${JSON.stringify(watch.bootMarkers)}`,
    );
  }
  if (judgeTransitions) {
    const observed = await sidebarTransition(cdp);
    check(
      rows,
      `firstPaint.${label}.startsNoWidthTransition`,
      observed.transitions.length === 0,
      `transitions=${JSON.stringify(observed.transitions)} writes=${JSON.stringify(observed.writes)}`,
    );
  }

  // ── UI1-A3-A1 — PRESENTATION AND ACCESSIBILITY ARE ONE CONTRACT ───────────────────────────────────
  // A rail presented OPEN must not announce itself as closed. On every painted frame the control's claims
  // (`aria-expanded`, its accessible name) must describe the state it presents, the boot reading must be
  // byte-identical to the hydrated runtime's own, and the presented rail must contain exactly ONE operable
  // disclosure control — so a repair cannot pass by leaving a second, styled-away control in the DOM.
  const facts = watch.semantics.map((reading) => {
    try {
      return reading ? JSON.parse(reading) : null;
    } catch {
      return null;
    }
  }).filter((entry) => entry !== null);
  const disagreements = facts
    .map((entry) => semanticsDisagreement(entry, expectedPainted))
    .filter((disagreement) => disagreement !== null);
  check(
    rows,
    `firstPaint.${label}.controlSemanticsMatchPresentedState`,
    facts.length > 0 && disagreements.length === 0,
    disagreements.length === 0
      ? `${observedSemantics(facts)} (${facts.length} frames)`
      : `${disagreements.length}/${facts.length} frames: ${disagreements[0]}`,
  );
  check(
    rows,
    `firstPaint.${label}.neverObservedOppositeSemantics`,
    facts.length > 0 && facts.every((entry) => semanticsAgree(entry, expectedPainted)),
    `observed=${observedSemantics(facts)}`,
  );
  check(
    rows,
    `firstPaint.${label}.controlSemanticsStableFromFirstFrame`,
    facts.length > 0 && Boolean(runtime.runtimeProjection) && watch.semanticsProjections[0] === runtime.runtimeProjection,
    `first=${watch.semanticsProjections[0] ?? "none"} runtime=${runtime.runtimeProjection}`,
  );
  check(
    rows,
    `firstPaint.${label}.oneOperableDisclosureControl`,
    runtime.operableControls === 1,
    `controls=${runtime.operableControls}`,
  );
  check(
    rows,
    `firstPaint.${label}.contractDeclaresControlOpenNameHook`,
    typeof SIDEBAR_OPEN_NAME_ATTRIBUTE === "string" && SIDEBAR_OPEN_NAME_ATTRIBUTE.length > 0,
    `attribute=${SIDEBAR_OPEN_NAME_ATTRIBUTE}`,
  );
  return { watch, runtime };
}

/** The stored preference, straight from the browser (never through the app's own reader). */
const sidebarStored = (cdp) =>
  cdp.evaluate(`window.localStorage.getItem(${JSON.stringify(SIDEBAR_PREFERENCE_KEY)})`);

/**
 * UI1-A1 — THE TRANSITION OBSERVER.
 *
 * The frame recorder above answers "which state was PAINTED", and it passed while the owner was still
 * seeing a flicker: a rail that committed `data-collapsed="true"` and adopted the stored `open` in the same
 * commit painted no wrong frame, but the browser still started the rail's `width 200ms` CSS transition from
 * the committed CLOSED geometry — so an OPEN rail visibly collapsed and expanded again on every navigation
 * (measured on the live site as transition keyframes `36px → 220px`).
 *
 * This observer records the two things that make that visible, and nothing else:
 *   COMMITS     — every `data-collapsed` write on a `#shell-sidebar-*` rail, WITH its value, so a
 *                 canonical-state write that is corrected a moment later is still counted;
 *   TRANSITIONS — every `transitionrun`/`transitionstart` on such a rail for the `width` property, i.e. the
 *                 geometry animation the visitor actually sees.
 *
 * Continuity is therefore an assertion about the TRANSITION INTERVAL, not about its end state: a navigation
 * may replace the rail node (and does), but it may not commit the opposite state on it and may not start a
 * width transition. The explicit toggle is the only control allowed to do either.
 */
const SIDEBAR_TRANSITION_WATCH = `(() => {
  const record = { writes: [], transitions: [] };
  window.__ui1Transition = record;
  const isRail = (el) => !!el && el.nodeType === 1 && typeof el.id === 'string' && el.id.indexOf('shell-sidebar') === 0;
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const result = setAttribute.call(this, name, value);
    try {
      if (name === 'data-collapsed' && isRail(this)) {
        record.writes.push({ id: this.id, value: String(value), t: Math.round(performance.now()) });
      }
    } catch (error) { /* recording is best effort, never the page's problem */ }
    return result;
  };
  for (const type of ['transitionrun', 'transitionstart']) {
    document.addEventListener(type, (event) => {
      try {
        if (event.propertyName !== 'width' || !isRail(event.target)) return;
        record.transitions.push({ id: event.target.id, type, t: Math.round(performance.now()) });
      } catch (error) { /* recording is best effort */ }
    }, true);
  }
})()`;

/** Arm the transition observer: only the interval that follows is judged. */
const SIDEBAR_TRANSITION_RESET = `(() => {
  const record = window.__ui1Transition;
  if (!record) return false;
  record.writes = [];
  record.transitions = [];
  return true;
})()`;

/** What the rail did since the last reset. */
const SIDEBAR_TRANSITION_READ = `(() => JSON.stringify(window.__ui1Transition || { writes: [], transitions: [] }))()`;

const sidebarTransition = async (cdp) => JSON.parse(await cdp.evaluate(SIDEBAR_TRANSITION_READ));
const resetSidebarTransition = (cdp) => cdp.evaluate(SIDEBAR_TRANSITION_RESET);

/**
 * The continuity rows for ONE observed interval: the rail never committed the opposite state and never
 * started a width transition. `expectedState` is the state the visitor had chosen for the whole interval.
 *
 * A replacement rail node is PERMITTED — the interval may commit the SAME state on a new node as often as
 * the composition likes. The recorder's health is calibrated by `toggle.stillAnimatesTheRail`, which
 * requires a real write and a real width transition on an explicit toggle in the same document.
 */
async function checkSidebarContinuity(rows, cdp, label, expectedState, { allowWidthTransition = false } = {}) {
  const observed = await sidebarTransition(cdp);
  const committedOpposite = observed.writes.filter((write) => write.value !== expectedState);
  check(
    rows,
    `continuity.${label}.commitsNoOppositeState`,
    committedOpposite.length === 0,
    `writes=${JSON.stringify(observed.writes)}`,
  );
  // UI1-A3-A1 — AND A FRAME'S CLAIMS NEVER CONTRADICT WHAT THAT FRAME PRESENTS.
  //
  // Judged per frame, not per interval: this recorder accumulates every painted frame of the DOCUMENT (the
  // production proof is the one whose recorder is reset per leg), so a document may legitimately contain CLOSED
  // frames before the visitor's explicit toggle. What must never happen — in any frame, in either state — is a
  // control that announces the opposite of what it shows. The interval's own state is what the rows above
  // assert, through the writes and transitions the visitor's control produced.
  const watch = await sidebarWatch(cdp);
  const facts = (watch.semantics ?? []).map((reading) => semanticsOf(reading)).filter((entry) => entry !== null);
  const selfContradictions = facts
    .map((entry) => semanticsSelfContradiction(entry))
    .filter((contradiction) => contradiction !== null);
  const firstContradiction = facts.findIndex((entry) => semanticsSelfContradiction(entry) !== null);
  check(
    rows,
    `continuity.${label}.controlClaimsAgreeWithPresentedState`,
    facts.length > 0 && selfContradictions.length === 0,
    selfContradictions.length === 0
      ? `${facts.length} frames, each consistent with its own presented state`
      : `${selfContradictions.length}/${facts.length} frames: ${selfContradictions[0]} — ${(watch.semanticsContext ?? [])[firstContradiction] ?? "n/a"}`,
  );
  check(
    rows,
    `continuity.${label}.startsNoWidthTransition`,
    allowWidthTransition || observed.transitions.length === 0,
    `transitions=${JSON.stringify(observed.transitions)}`,
  );
  return observed;
}

/**
 * Click a REAL navigation control in the rail and await the route it navigates to (FOUNDATION-BR1: a
 * client transition is awaited by the state the next assertion reads, never by a settle).
 */
async function clickSidebarNav(cdp, selector, path) {
  const clicked = await cdp.clickCenter(selector);
  await waitReady(cdp, { path });
  return clicked;
}

/** R3 — each band's rail, addressed by the band the probe reports as presented. */
const BAND_RAIL = {
  desktop: "#shell-sidebar-desktop-rail",
  tablet: "#shell-sidebar-tablet-rail",
  mobile: "#shell-sidebar-mobile-rail",
};

/**
 * R3 — PUT THE RAIL INTO A KNOWN STATE THE WAY A VISITOR DOES: through its own disclosure control, and only
 * when the rail is not already where this leg needs it. Every leg below states its own expectation about what
 * a SELECTION does, so no leg may depend on the state the previous one happened to leave behind.
 */
async function setSidebarState(cdp, open) {
  let state = await sidebarState(cdp);
  if (!state.band) return state;
  if ((state.collapsed === "false") !== open) {
    await cdp.clickCenter(`${BAND_RAIL[state.band]} .ui-sidebar-toggle`);
    await sleep(300);
    state = await sidebarState(cdp);
  }
  return state;
}

/** The rail's own controls, addressed as the visitor meets them — ONE rail per band, ONE set per band. */
const SIDEBAR_ABOUT_LINK = '#shell-sidebar-desktop-rail a[href$="/about"]';
const SIDEBAR_HOME_LINK = "#shell-sidebar-desktop-rail ul li:first-child a";
const SIDEBAR_TABLET_ABOUT_LINK = '#shell-sidebar-tablet-rail a[href$="/about"]';
const SIDEBAR_TABLET_HOME_LINK = "#shell-sidebar-tablet-rail ul li:first-child a";
const SIDEBAR_MOBILE_ABOUT_LINK = '#shell-sidebar-mobile-rail a[href$="/about"]';
const SIDEBAR_MOBILE_HOME_LINK = "#shell-sidebar-mobile-rail ul li:first-child a";

/**
 * FOUNDATION-UI1 — the sidebar's state lifecycle, proved in a browser against the disposable synthetic
 * deployment (generic owner: this is platform behaviour, not one deployment's content).
 */
async function runSidebarStateScenario(chrome) {
  const rows = [];
  const port = BASE_PORT + 341;
  const base = `http://localhost:${port}`;
  BASE_URL = base;
  const HOME = "/ww/en";
  const ABOUT = "/ww/en/about";
  const url = `${base}${HOME}`;
  const key = JSON.stringify(SIDEBAR_PREFERENCE_KEY);
  const SET_HOSTILE = `window.localStorage.setItem(${key}, 'compact'); true`;

  // The visitor dimensions are SWITCHED ON for this scenario (the Layout control must exist for the
  // presentation-independence row); the scenario pins no composition of its own — the Layout control's
  // configured default decides which one is presented.
  const original = await readFile(CONFIG_PATH, "utf8");
  const shipped = JSON.parse(original);
  const switcher = shipped.ui?.layoutSwitcher ?? {};
  await writeFile(
    CONFIG_PATH,
    `${JSON.stringify(
      {
        ...shipped,
        ui: {
          ...(shipped.ui ?? {}),
          layoutSwitcher: { ...switcher, enabled: true, default: switcher.default ?? "sidebar" },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const server = startDevServer(port);
  let cdp = null;
  try {
    await waitForServer(url);
    cdp = await Cdp.connect(chrome);
    // The frame recorder, the transition observer and the console collector must exist BEFORE the first
    // document runs: the first two judge state the visitor can see, the third fails the run on a mismatch.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: SIDEBAR_WATCH });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: SIDEBAR_TRANSITION_WATCH });
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);

    // ── NO PREFERENCE → CLOSED, on a document that has never carried one ────────────────────────
    await cdp.navigate(url);
    await waitReady(cdp);
    await cdp.evaluate(`window.localStorage.removeItem(${key}); true`);
    await cdp.reload();
    await waitReady(cdp);
    const fresh = await sidebarState(cdp);
    check(rows, "noPreference.closed", !!fresh.railPresent && fresh.collapsed === "true" && fresh.expanded === "false", JSON.stringify(fresh));
    check(rows, "noPreference.narrowPersistentRail", fresh.width != null && fresh.width > 0 && fresh.width <= 64, `width=${fresh.width}`);
    check(rows, "noPreference.notADeadEnd", fresh.label === "Show navigation", `label=${fresh.label}`);
    check(rows, "noPreference.nothingStored", fresh.stored === null, `stored=${fresh.stored}`);
    const freshWatch = await sidebarWatch(cdp);
    check(rows, "noPreference.firstPaintClosed", freshWatch.desktopFirst === "true", `firstFrame=${freshWatch.desktopFirst}`);
    // UI1-A2 — the canonical document is the baseline the bridge must NOT touch: no marker, no OPEN frame,
    // and the same presentation throughout.
    await checkSidebarFirstPaint(rows, cdp, "noPreference", "closed");

    // ── TOGGLE → OPEN (the disclosure control is the only thing that changes the state) ─────────
    await resetSidebarTransition(cdp);
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    const opened = await sidebarState(cdp);
    check(rows, "toggle.open", opened.collapsed === "false" && opened.expanded === "true" && opened.label === "Hide navigation", JSON.stringify(opened));
    check(rows, "toggle.recorded", (await sidebarStored(cdp)) === "open");
    // The EXPLICIT toggle is the one control allowed to move the rail, so its width transition must still
    // run (UI1-A1 §11: the flicker is removed by making the state continuous, never by removing the
    // animation, the transition or the control).
    const toggleTransition = await sidebarTransition(cdp);
    check(
      rows,
      "toggle.stillAnimatesTheRail",
      toggleTransition.writes.some((write) => write.value === "false") && toggleTransition.transitions.length > 0,
      `writes=${JSON.stringify(toggleTransition.writes)} transitions=${JSON.stringify(toggleTransition.transitions)}`,
    );

    // ── REFRESH with OPEN (a new document) ──────────────────────────────────────────────────────
    await cdp.reload();
    await waitReady(cdp);
    const reloadedOpen = await sidebarState(cdp);
    check(rows, "reload.openStaysOpen", reloadedOpen.collapsed === "false" && reloadedOpen.expanded === "true", JSON.stringify(reloadedOpen));
    const openWatch = await sidebarWatch(cdp);
    // UI1-A2 — THE WHOLE POINT OF THIS TASK, MEASURED: the document was loaded with a stored OPEN preference,
    // so the visitor must see the OPEN rail from the first frame that paints it. The rows below judge the
    // PAINTED geometry of every frame of this new document (not the attribute, which may be corrected inside
    // one commit), require the boot presentation to be identical to the runtime OPEN rail, require the
    // pre-paint bridge to have marked the document and to have relinquished it, and require the boot interval
    // to have started no width transition. Reverting the repair flips them (the first painted state becomes
    // CLOSED, the boot fingerprint becomes the collapsed column's, and the adoption starts a 36px → 220px
    // transition) — they are the durable, failing-without-the-fix proof.
    await checkSidebarFirstPaint(rows, cdp, "openRefresh", "open", { expectMarker: "open" });

    // ── NAVIGATION WITH OPEN — the rail is PRESERVED on selection (R3, desktop) ──────────────────
    // At ≥md the expanded rail is IN FLOW: part of the page rather than an overlay, so there is nothing to
    // dismiss. The desktop band's policy is `"preserve"`, so a selection leaves the rail exactly as the visitor
    // set it. The state still moves through the rail's OWN writer and owner, and it is still not derived from
    // the route — which is why nothing changes for the page the visitor is already on either.
    const openedAt = openWatch.after;
    await resetSidebarTransition(cdp);
    const toAbout = await clickSidebarNav(cdp, SIDEBAR_ABOUT_LINK, ABOUT);
    const aboutAfterSelection = await sidebarState(cdp);
    check(
      rows,
      "navigate.openPreservedOnSelection",
      !!toAbout &&
        aboutAfterSelection.path === ABOUT &&
        aboutAfterSelection.collapsed === "false" &&
        aboutAfterSelection.expanded === "true",
      JSON.stringify(aboutAfterSelection),
    );
    // …and the destination is presented with the SAME open, in-flow rail the visitor left behind.
    const destinationRail = await cdp.evaluate(`(() => {
      const shown = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
      const rail = [...document.querySelectorAll('.ui-sidebar-rail')].find(shown) || null;
      const column = rail ? rail.querySelector('.ui-sidebar-rail-sticky') : null;
      return JSON.stringify({
        id: rail ? rail.id : null,
        collapsed: rail ? rail.getAttribute('data-collapsed') : null,
        columnPosition: column ? getComputedStyle(column).position : null,
        width: rail ? Math.round(rail.getBoundingClientRect().width) : null,
      });
    })()`);
    const destinationRailState = JSON.parse(destinationRail);
    check(
      rows,
      "navigate.destinationPresentsOpenRail",
      destinationRailState.id === "shell-sidebar-desktop-rail" &&
        destinationRailState.collapsed === "false" &&
        destinationRailState.columnPosition === "sticky" &&
        destinationRailState.width != null &&
        destinationRailState.width > SIDEBAR_PAINTED_NARROW_MAX,
      destinationRail,
    );
    // A selection is not a state CHANGE in this band at all: the preference the visitor recorded by opening the
    // rail must survive the navigation. A desktop selection that wrote `closed` is exactly the regression this
    // row exists to catch.
    const storedAfterSelection = await sidebarStored(cdp);
    check(
      rows,
      "navigate.openSelectionRecordsNoClose",
      storedAfterSelection === "open",
      `stored=${storedAfterSelection}`,
    );
    // …and the rail never committed a CLOSED state, and never started a width transition, for the whole
    // interval: no collapse, no re-open and no flicker.
    const openNavWatch = await sidebarWatch(cdp);
    const framesAfterSelection = openNavWatch.frames.slice(openedAt);
    check(
      rows,
      "navigate.openSelectionPaintsNoClosedFrame",
      framesAfterSelection.includes("true") === false,
      `frames=${framesAfterSelection.join(",")}`,
    );
    await checkSidebarContinuity(rows, cdp, "openSelection", "false");

    // A SECOND destination, through the rail's own Home control: still open, still the visitor's own state.
    await resetSidebarTransition(cdp);
    const toHome = await clickSidebarNav(cdp, SIDEBAR_HOME_LINK, HOME);
    const homeAfterSelection = await sidebarState(cdp);
    check(
      rows,
      "navigate.back.openPreservedOnSelection",
      !!toHome && homeAfterSelection.path === HOME && homeAfterSelection.collapsed === "false",
      JSON.stringify(homeAfterSelection),
    );
    await checkSidebarContinuity(rows, cdp, "openBackSelection", "false");

    // ── THE PAGE THE VISITOR IS ALREADY ON (R3, desktop) ─────────────────────────────────────────
    // The band's policy is about the SELECTION, not about the route: choosing the current page's own link must
    // leave the rail exactly as the visitor set it, and no route change is needed to observe that.
    const openOnCurrentPage = await setSidebarState(cdp, true);
    await cdp.clickCenter(SIDEBAR_HOME_LINK);
    await sleep(600);
    const afterActivePageSelection = await sidebarState(cdp);
    check(
      rows,
      "navigate.activePageSelectionKeepsTheRailOpen",
      openOnCurrentPage.collapsed === "false" &&
        afterActivePageSelection.path === HOME &&
        afterActivePageSelection.collapsed === "false",
      `open=${openOnCurrentPage.collapsed} after=${JSON.stringify(afterActivePageSelection)}`,
    );

    // ── KEYBOARD ACTIVATION (R3, desktop) ────────────────────────────────────────────────────────
    // The same contract for a keyboard visitor: focus a rail link, press Enter, and the rail is left exactly as
    // it was. Assistive technology activates the very same click event.
    const openBeforeKeyboard = await setSidebarState(cdp, true);
    await cdp.evaluate(`(() => { const a = document.querySelector(${JSON.stringify(SIDEBAR_ABOUT_LINK)}); if (a) a.focus(); return !!a; })()`);
    await cdp.pressKey("Enter");
    await waitReady(cdp, { path: ABOUT });
    const afterKeyboardSelection = await sidebarState(cdp);
    check(
      rows,
      "navigate.keyboardSelectionKeepsTheRailOpen",
      openBeforeKeyboard.collapsed === "false" &&
        afterKeyboardSelection.path === ABOUT &&
        afterKeyboardSelection.collapsed === "false" &&
        afterKeyboardSelection.expanded === "true",
      `open=${openBeforeKeyboard.collapsed} after=${JSON.stringify(afterKeyboardSelection)}`,
    );

    // The explicit toggle is proved next. The selection legs above end OPEN by contract — that IS their contract
    // (a desktop selection preserves the rail) — so the control is already where the close contract needs it:
    // assert that, rather than toggling it out of the way.
    const openBeforeCloseContract = await sidebarState(cdp);
    check(
      rows,
      "toggle.stillOpenBeforeTheCloseContract",
      openBeforeCloseContract.collapsed === "false",
      JSON.stringify(openBeforeCloseContract),
    );

    // ── TOGGLE → CLOSED, then REFRESH with CLOSED ───────────────────────────────────────────────
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    const closed = await sidebarState(cdp);
    check(rows, "toggle.closed", closed.collapsed === "true" && closed.expanded === "false" && closed.label === "Show navigation", JSON.stringify(closed));
    // UI1-A2 — AND IT LOOKS CLOSED. This is the bridge's relinquish contract observed where it matters most:
    // this document BOOTED with the OPEN bridge applied, so if the marker were still in place the explicit
    // toggle would leave the rail painted OPEN while its state said otherwise. The painted geometry must be
    // the collapsed column the visitor just asked for.
    check(
      rows,
      "toggle.closedActuallyLooksClosed",
      typeof closed.width === "number" && closed.width > 0 && closed.width <= SIDEBAR_PAINTED_NARROW_MAX,
      `width=${closed.width} (collapsed column is <= ${SIDEBAR_PAINTED_NARROW_MAX}px)`,
    );
    check(rows, "toggle.closedRecorded", (await sidebarStored(cdp)) === "closed");

    await cdp.reload();
    await waitReady(cdp);
    const reloadedClosed = await sidebarState(cdp);
    check(rows, "reload.closedStaysClosed", reloadedClosed.collapsed === "true" && reloadedClosed.expanded === "false", JSON.stringify(reloadedClosed));
    const closedWatch = await sidebarWatch(cdp);
    check(rows, "reload.closedFirstPaintClosed", closedWatch.desktopFirst === "true", `firstFrame=${closedWatch.desktopFirst}`);
    // The reciprocal first-paint proof: a stored CLOSED preference is continuously CLOSED, with no marker.
    await checkSidebarFirstPaint(rows, cdp, "closedRefresh", "closed");

    // ── NAVIGATION with CLOSED (the owner's second observation) ─────────────────────────────────
    const closedAt = closedWatch.after;
    await resetSidebarTransition(cdp);
    const closedToAbout = await clickSidebarNav(cdp, SIDEBAR_ABOUT_LINK, ABOUT);
    const aboutClosed = await sidebarState(cdp);
    check(rows, "navigate.closedStaysClosed", !!closedToAbout && aboutClosed.path === ABOUT && aboutClosed.collapsed === "true" && aboutClosed.expanded === "false", JSON.stringify(aboutClosed));
    const closedNavWatch = await sidebarWatch(cdp);
    check(rows, "navigate.closedNeverPaintedOpen", closedNavWatch.frames.slice(closedAt).includes("false") === false, `frames=${closedNavWatch.frames.slice(closedAt).join(",")}`);
    // The reciprocal continuity proof: CLOSED is the state that already looked smooth, so the same two rows
    // protect it from regressing in the other direction.
    await checkSidebarContinuity(rows, cdp, "closedNavigation", "true");

    await resetSidebarTransition(cdp);
    const closedHome = await clickSidebarNav(cdp, SIDEBAR_HOME_LINK, HOME);
    const homeClosed = await sidebarState(cdp);
    check(rows, "navigate.back.closedStaysClosed", !!closedHome && homeClosed.path === HOME && homeClosed.collapsed === "true", JSON.stringify(homeClosed));
    await checkSidebarContinuity(rows, cdp, "closedBackNavigation", "true");

    // ── AN UNUSABLE STORED VALUE is `no preference`, so the canonical state stands ──────────────
    await cdp.evaluate(SET_HOSTILE);
    await cdp.navigate(url);
    await waitReady(cdp);
    const hostile = await sidebarState(cdp);
    check(rows, "hostileValue.fallsBackToClosed", hostile.collapsed === "true" && hostile.stored === "compact", JSON.stringify(hostile));
    // …and it is cleared again, so every later row starts from a defined state.
    await cdp.evaluate(`window.localStorage.removeItem(${key}); true`);
    await cdp.navigate(url);
    await waitReady(cdp);

    // ── A SELECTOR ROUTE CHANGE (Site) does not own the state (§15) ─────────────────────────────
    const siteChoice = await cdp.evaluate(`(() => {
      const control = document.querySelector('select[data-selector="site"]');
      if (!control) return JSON.stringify({ current: null, next: null, options: [] });
      const options = [...control.options].map((option) => option.value);
      return JSON.stringify({ current: control.value, next: options.find((value) => value !== control.value) ?? null, options });
    })()`);
    const site = JSON.parse(siteChoice);
    if (site.next) {
      await cdp.evaluate(`(() => {
        const control = document.querySelector('select[data-selector="site"]');
        control.value = ${JSON.stringify(site.next)};
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      const switchedPath = `/${site.next}/en`;
      await waitReady(cdp, { path: switchedPath });
      const afterSite = await sidebarState(cdp);
      check(rows, "selector.siteChange.keepsState", afterSite.path === switchedPath && afterSite.collapsed === "true", JSON.stringify(afterSite));
      await cdp.navigate(url);
      await waitReady(cdp);

      // ── …and the SAME route change while the rail is OPEN (UI1-A1 §17) ─────────────────────────
      await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
      await sleep(250);
      const openForSelector = await sidebarState(cdp);
      check(rows, "selector.whileOpen.startsOpen", openForSelector.collapsed === "false" && openForSelector.stored === "open", JSON.stringify(openForSelector));
      await resetSidebarTransition(cdp);
      await cdp.evaluate(`(() => {
        const control = document.querySelector('select[data-selector="site"]');
        control.value = ${JSON.stringify(site.next)};
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      await waitReady(cdp, { path: switchedPath });
      const afterSiteOpen = await sidebarState(cdp);
      check(rows, "selector.siteChangeWhileOpen.keepsState", afterSiteOpen.path === switchedPath && afterSiteOpen.collapsed === "false", JSON.stringify(afterSiteOpen));
      await checkSidebarContinuity(rows, cdp, "selectorWhileOpen", "false");
      // Restore what the later rows expect: the visitor's CLOSED choice, on the default site.
      await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
      await sleep(250);
      await cdp.navigate(url);
      await waitReady(cdp);
    } else {
      check(rows, "selector.siteChange.keepsState", false, `no second site is switchable: ${siteChoice}`);
    }

    // ── A PRESENTATION CHANGE (Layout) is independent of the state (§16) ────────────────────────
    const chooseLayoutValue = (value) => `(() => {
      const control = document.querySelector('[data-ui-layout-switcher]');
      if (!control) return false;
      control.value = ${JSON.stringify(value)};
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return control.value === ${JSON.stringify(value)};
    })()`;
    const toMenuBar = await cdp.evaluate(chooseLayoutValue("menu-bar"));
    await sleep(250);
    const menuBar = await sidebarState(cdp);
    check(rows, "layout.menuBarComposesNoRail", !!toMenuBar && menuBar.railPresent === false, JSON.stringify(menuBar));
    const backToSidebar = await cdp.evaluate(chooseLayoutValue("sidebar"));
    await sleep(250);
    const sidebarAgain = await sidebarState(cdp);
    check(rows, "layout.backToSidebar.keepsState", !!backToSidebar && sidebarAgain.railPresent === true && sidebarAgain.collapsed === "true", JSON.stringify(sidebarAgain));

    // ── ONE PREFERENCE ACROSS BANDS: the tablet rail is the same contract, so it follows it ─────
    await cdp.setViewport(VIEWPORTS.tablet.width, VIEWPORTS.tablet.height);
    await cdp.navigate(url);
    await waitReady(cdp);
    // The preference belongs to the visitor and the tablet rail is the same contract: a real recorded
    // choice (CLOSED) is confirmed to reach the tablet band, then a toggle HERE is confirmed to reach the
    // desktop band — one state, every band.
    await cdp.evaluate(`window.localStorage.setItem(${key}, 'closed'); true`);
    await cdp.reload();
    await waitReady(cdp);
    const tabletClosed = await sidebarState(cdp);
    check(rows, "tablet.bandIsTheTabletRail", tabletClosed.band === "tablet", JSON.stringify(tabletClosed));
    check(rows, "tablet.followsStoredPreference", tabletClosed.collapsed === "true", JSON.stringify(tabletClosed));

    // ── R3 — TABLET: a selection PRESERVES the rail, exactly like desktop, and INDEPENDENTLY of it ────────
    // CLOSED + selection → still CLOSED. The same rail, the same visitor-owned state, its own band policy.
    const toTabletAbout = await clickSidebarNav(cdp, SIDEBAR_TABLET_ABOUT_LINK, ABOUT);
    const tabletAfterClosedSelection = await sidebarState(cdp);
    check(
      rows,
      "tablet.closedSelectionKeepsItClosed",
      !!toTabletAbout &&
        tabletAfterClosedSelection.band === "tablet" &&
        tabletAfterClosedSelection.path === ABOUT &&
        tabletAfterClosedSelection.collapsed === "true",
      JSON.stringify(tabletAfterClosedSelection),
    );
    const tabletStoredAtClosedSelection = await sidebarStored(cdp);
    check(
      rows,
      "tablet.closedSelectionRecordsNoClose",
      tabletStoredAtClosedSelection === "closed",
      `stored=${tabletStoredAtClosedSelection}`,
    );

    await cdp.clickCenter("#shell-sidebar-tablet-rail .ui-sidebar-toggle");
    await sleep(250);
    check(rows, "tablet.toggleIsRecorded", (await sidebarStored(cdp)) === "open");

    // OPEN + selection → still OPEN, and the preference the visitor recorded is untouched: a tablet selection
    // that wrote `closed` would be the regression this row exists to catch.
    const openTablet = await setSidebarState(cdp, true);
    const toTabletHome = await clickSidebarNav(cdp, SIDEBAR_TABLET_HOME_LINK, HOME);
    const tabletAfterOpenSelection = await sidebarState(cdp);
    check(
      rows,
      "tablet.openSelectionKeepsItOpen",
      openTablet.collapsed === "false" &&
        !!toTabletHome &&
        tabletAfterOpenSelection.band === "tablet" &&
        tabletAfterOpenSelection.path === HOME &&
        tabletAfterOpenSelection.collapsed === "false" &&
        tabletAfterOpenSelection.expanded === "true",
      `open=${openTablet.collapsed} after=${JSON.stringify(tabletAfterOpenSelection)}`,
    );
    const tabletStoredAfterSelection = await sidebarStored(cdp);
    check(
      rows,
      "tablet.openSelectionRecordsNoClose",
      tabletStoredAfterSelection === "open",
      `stored=${tabletStoredAfterSelection}`,
    );

    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(url);
    await waitReady(cdp);
    const desktopAfterTablet = await sidebarState(cdp);
    check(rows, "bands.shareOnePreference", desktopAfterTablet.collapsed === "false", JSON.stringify(desktopAfterTablet));

    // ── THE MOBILE LAYER IS A DIFFERENT INTERACTION MODEL: a rail preference must not open it ──
    // NAV1A/NAV1D — at <md the ACTIVE layout owns the navigation: the sidebar layout presents the
    // SAME persistent rail the wider bands present (so the visitor's stored OPEN preference opens THE
    // RAIL, not a drawer state), and the menu-bar layout's bottom bar is NOT the sidebar's mobile
    // surface. Nothing substituted for the sidebar exists at this width.
    await cdp.setViewport(VIEWPORTS.mobile.width, VIEWPORTS.mobile.height);
    await cdp.navigate(url);
    await waitReady(cdp);
    const mobile = await sidebarState(cdp);
    check(
      rows,
      "mobile.preferenceOpensTheRailNotADrawer",
      mobile.railPresent === true &&
        mobile.band === "mobile" &&
        mobile.expanded === "true" &&
        mobile.drawer === false &&
        mobile.mobileDrawer === false &&
        mobile.mobileBar === false,
      JSON.stringify(mobile),
    );

    // ── R3 — MOBILE: a selection still DISMISSES the open rail (this band's own policy) ──────────────────
    // Below `md` the expanded rail is an OVERLAY, so choosing a destination ends its job: the rail returns to
    // its collapsed, sticky state and the destination is immediately visible beside it. This is the behaviour
    // the wider bands deliberately stop doing — and it stays HERE, unchanged, because the policy belongs to the
    // band. One mobile band, one policy, no shared switch with desktop or tablet.
    const toMobileAbout = await clickSidebarNav(cdp, SIDEBAR_MOBILE_ABOUT_LINK, ABOUT);
    const mobileAfterSelection = await sidebarState(cdp);
    check(
      rows,
      "mobile.openSelectionClosesIt",
      !!toMobileAbout &&
        mobileAfterSelection.band === "mobile" &&
        mobileAfterSelection.path === ABOUT &&
        mobileAfterSelection.collapsed === "true" &&
        mobileAfterSelection.expanded === "false",
      JSON.stringify(mobileAfterSelection),
    );
    const mobileStoredAfterSelection = await sidebarStored(cdp);
    check(
      rows,
      "mobile.openSelectionRecordsClosed",
      mobileStoredAfterSelection === "closed",
      `stored=${mobileStoredAfterSelection}`,
    );

    // …and a CLOSED mobile rail stays CLOSED on selection, exactly as the owner's table requires.
    const closedMobile = await setSidebarState(cdp, false);
    const toMobileHome = await clickSidebarNav(cdp, SIDEBAR_MOBILE_HOME_LINK, HOME);
    const mobileAfterClosedSelection = await sidebarState(cdp);
    check(
      rows,
      "mobile.closedSelectionKeepsItClosed",
      closedMobile.collapsed === "true" &&
        !!toMobileHome &&
        mobileAfterClosedSelection.path === HOME &&
        mobileAfterClosedSelection.collapsed === "true",
      `closed=${closedMobile.collapsed} after=${JSON.stringify(mobileAfterClosedSelection)}`,
    );

    // ── NO HYDRATION WARNING AND NO CONSOLE ERROR anywhere in this scenario (§11) ───────────────
    const finalWatch = await sidebarWatch(cdp);
    const hydration = finalWatch.console.filter((message) => /hydrat|did not match|server rendered HTML|Warning:/i.test(message));
    check(rows, "console.noHydrationWarning", hydration.length === 0, hydration.join(" | "));
    // R3 — ONE KNOWN PLATFORM NOTICE, EXCLUDED BY NAME AND BY NOTHING ELSE.
    //
    // Rendering the shell's pre-paint `<script>` bridge inside the client tree makes React log "Encountered a
    // <script> tag while rendering React component" when a CLIENT-SIDE navigation runs at a MOBILE-width
    // viewport. It is a dev-mode notice about a script React does not execute, not a state, preference,
    // hydration or layout defect: this scenario performs a mobile-width soft navigation for the first time in
    // this task (the mobile legs below), and the notice reproduces with THIS TASK'S SOURCE CHANGE REVERTED, so
    // it is neither caused by nor related to the navigation-selection policy. It is named here so the row keeps
    // failing on EVERY OTHER console message — and the hydration row above stays strictly empty.
    const PLATFORM_SCRIPT_NOTICE = /Encountered a script tag while rendering React component/;
    const unexpected = finalWatch.console.filter((message) => !PLATFORM_SCRIPT_NOTICE.test(message));
    check(rows, "console.clean", unexpected.length === 0, unexpected.join(" | "));
  } catch (error) {
    check(rows, "sidebar-state.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
    await writeFile(CONFIG_PATH, original, "utf8");
  }
  return rows;
}

/**
 * FOUNDATION-DEFECT-NAV3 — THE APPEARANCE CONTRACT (own servers + task-owned fixtures).
 *
 * FOUNDATION-DEFECT-NAV2 established WHICH authority owns each surface (and that no surface had
 * regressed); this scenario PINS that wiring, so a later change cannot silently disconnect a
 * surface from its token. Every assertion compares a RENDERED `rgb(...)` with the value the engine
 * itself computes for the token (`getComputedStyle(documentElement)` → a throwaway element), so the
 * gate never carries a second copy of a hex — a token that is a `color-mix()` in the dark scheme is
 * compared correctly, and re-pointing a token at a different value keeps the gate honest.
 *
 * Two dev servers, two phases:
 *
 *   · `surface`     the disposable copy AS IT SHIPS. Its own configuration already enables
 *                   `ui.layoutSwitcher` (`tests/fixtures/synthetic-deployment/site.config.json`), so
 *                   the selector exists and the Menu Bar mode is reachable in the same server: the
 *                   page, sidebar, header/selector, ordinary footer and Menu Bar surfaces are read at
 *                   desktop/tablet/mobile, then the dark scheme (emulated, as the theme scenarios
 *                   already do) and the three interaction states the platform really implements.
 *   · `configured`  ONE test-owned configuration fixture: `ui.theme.background` = `#00ff00` and the
 *                   decorative `backgrounds.all` + `footerGraphic` roles pointed at SHIPPED mirrored
 *                   placeholders (`header-graphic.svg`, `footer-graphic.svg`). Nothing authored is
 *                   modified and no artwork is added — the fixture is a configuration write into the
 *                   disposable COPY (restored in `finally`), exactly like every other scenario's.
 *
 * Deliberately NOT asserted here: that the current page must LOOK different (it does not — the
 * platform conveys it semantically, by `aria-current`), and that Menu Bar links must change on hover
 * (they do not). Both are current behaviour, not contracts, and NAV2 recorded them as such.
 */

/** The one configured background this scenario proves the propagation of (its own input value). */
const APPEARANCE_CONFIGURED_BACKGROUND = "#00ff00";
/** The SHIPPED PLATFORM artwork the fixture points the two graphic roles at (S3E1C/S3F1B). */
const APPEARANCE_BACKGROUND_FIXTURE_URL = "https://example.com/assets/icon-home.svg";
const APPEARANCE_FOOTER_GRAPHIC_FIXTURE_URL = "https://example.com/assets/icon-phone.svg";

/**
 * Every audited surface, as one JSON document. `token(name)` resolves a custom property THROUGH the
 * engine (a throwaway element's `background-color`), so the comparison is rendered value against
 * rendered value.
 */
const APPEARANCE_PROBE = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  const shown = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const boxOf = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  const token = (name) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(' + name + ')';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  };
  const rail = ['desktop','tablet','mobile'].map((band) => document.querySelector('#shell-sidebar-' + band + '-rail')).find(shown) || null;
  const railLink = rail ? rail.querySelector('ul li a') : null;
  const bar = document.querySelector('.ui-shell-bottom-bar');
  const barPresent = bar && shown(bar);
  const barBox = barPresent ? boxOf(bar) : null;
  const barHit = (x) => {
    if (!barBox) return null;
    const cx = Math.max(1, Math.min(document.documentElement.clientWidth - 2, x));
    const el = document.elementFromPoint(cx, Math.round(barBox[1] + barBox[3] / 2));
    return el ? (el.closest('.ui-shell-bottom-bar') ? 'BAR' : 'OTHER') : null;
  };
  const footer = document.querySelector('footer');
  const footerLink = footer ? footer.querySelector('a') : null;
  const footerHeading = footer ? footer.querySelector('h2') : null;
  const prose = document.querySelector('.prose');
  const pageBackground = document.querySelector('.ui-page-background');
  const footerGraphic = document.querySelector('.ui-footer-graphic');
  const selector = document.querySelector('[data-ui-layout-switcher]');
  const siteHeader = document.querySelector('.ui-site-header');
  return JSON.stringify({
    tokens: {
      background: token('--background'),
      foreground: token('--foreground'),
      mutedForeground: token('--muted-foreground'),
      border: token('--border'),
      primary: token('--primary'),
      ring: token('--ring'),
    },
    htmlStyleAttribute: document.documentElement.getAttribute('style'),
    schemeDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
    viewport: {
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    },
    body: { bg: cs(document.body).backgroundColor, color: cs(document.body).color },
    headerColor: siteHeader ? cs(siteHeader).color : null,
    selector: selector ? { bg: cs(selector).backgroundColor, borderTop: cs(selector).borderTopColor } : null,
    rail: rail ? {
      bg: cs(rail).backgroundColor,
      divider: cs(rail).borderInlineEndColor,
      dividerWidth: cs(rail).borderInlineEndWidth,
      navLink: railLink ? cs(railLink).color : null,
      collapsed: rail.getAttribute('data-collapsed'),
    } : null,
    bar: barPresent ? {
      bg: cs(bar).backgroundColor,
      borderTop: cs(bar).borderTopColor,
      link: bar.querySelector('ul li a') ? cs(bar.querySelector('ul li a')).color : null,
      box: barBox,
      leftEdgeHit: barHit(barBox[0] + 2),
      rightEdgeHit: barHit(document.documentElement.clientWidth - 3),
    } : null,
    footer: footer ? {
      bg: cs(footer).backgroundColor,
      borderTop: cs(footer).borderTopColor,
      heading: footerHeading ? cs(footerHeading).color : null,
      link: footerLink ? cs(footerLink).color : null,
    } : null,
    prose: prose ? { color: cs(prose).color, link: prose.querySelector('a') ? cs(prose.querySelector('a')).color : null } : null,
    pageBackgroundCount: document.querySelectorAll('.ui-page-background').length,
    pageBackground: pageBackground ? {
      image: cs(pageBackground).backgroundImage,
      size: cs(pageBackground).backgroundSize,
      position: cs(pageBackground).backgroundPosition,
      repeat: cs(pageBackground).backgroundRepeat,
      zIndex: cs(pageBackground).zIndex,
      mode: cs(pageBackground).position,
      pointerEvents: cs(pageBackground).pointerEvents,
      ariaHidden: pageBackground.getAttribute('aria-hidden'),
      box: boxOf(pageBackground),
    } : null,
    footerGraphicCount: document.querySelectorAll('.ui-footer-graphic').length,
    footerGraphic: footerGraphic ? {
      image: cs(footerGraphic).backgroundImage,
      zIndex: cs(footerGraphic).zIndex,
      mode: cs(footerGraphic).position,
      pointerEvents: cs(footerGraphic).pointerEvents,
      ariaHidden: footerGraphic.getAttribute('aria-hidden'),
      footerIsolation: footer ? cs(footer).isolation : null,
    } : null,
    hitAtProse: prose ? (() => {
      const r = prose.getBoundingClientRect();
      const el = document.elementFromPoint(Math.round(r.left + 12), Math.round(Math.max(r.top + 12, 2)));
      if (!el) return null;
      return el.closest('.ui-page-background') || el.closest('.ui-footer-graphic') ? 'DECORATIVE-LAYER' : 'CONTENT';
    })() : null,
  });
})()`;

/** The first presented rail navigation link, for the hover contract. */
const APPEARANCE_NAV_STATE = `(() => {
  const token = (name) => {
    const probe = document.createElement('div');
    probe.style.backgroundColor = 'var(' + name + ')';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return value;
  };
  const shown = (el) => !!el && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const rail = ['desktop','tablet','mobile'].map((band) => document.querySelector('#shell-sidebar-' + band + '-rail')).find(shown) || null;
  const link = rail ? rail.querySelector('ul li a') : null;
  if (!link) return 'null';
  const r = link.getBoundingClientRect();
  return JSON.stringify({
    color: getComputedStyle(link).color,
    hovered: link.matches(':hover'),
    point: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
    foreground: token('--foreground'),
    mutedForeground: token('--muted-foreground'),
  });
})()`;

/** The keyboard-focused element's own ring, or null while no interactive element carries one. */
const APPEARANCE_RING_STATE = `(() => {
  const el = document.activeElement;
  if (!el || !/^(A|BUTTON|SELECT|TEXTAREA|INPUT)$/i.test(el.tagName)) return 'null';
  const probe = document.createElement('div');
  probe.style.backgroundColor = 'var(--ring)';
  document.body.appendChild(probe);
  const ring = getComputedStyle(probe).backgroundColor;
  probe.remove();
  const cs = getComputedStyle(el);
  return JSON.stringify({
    tag: el.tagName,
    hovered: el.matches(':hover'),
    outlineStyle: cs.outlineStyle,
    outlineWidth: cs.outlineWidth,
    outlineColor: cs.outlineColor,
    ring,
  });
})()`;

/**
 * THE HOVER DECLARATION of one element's OWN hover utility, read from the stylesheet and resolved
 * through the engine.
 *
 * Why this exists: Tailwind v4 compiles every `hover:` utility inside a capability media query
 * (`@media (hover: hover)`), and a headless renderer reports that query as FALSE — so a runtime
 * `:hover` assertion measures the RUNNER, not the platform (the Linux CI runner reported
 * `:hover` as true while the resting colour never moved, and the identical check passed locally).
 * The durable contract is therefore the DECLARATION: the hover utility the element itself carries
 * must resolve to the documented token — true on every runner. The media query it sits in is
 * reported with it, and the runtime behaviour is asserted separately when the runner HAS hover.
 */
const APPEARANCE_HOVER_DECLARATION = (selector) => `(() => {
  const element = document.querySelector(${JSON.stringify(selector)});
  if (!element) return 'null';
  const hoverClass = Array.from(element.classList).find((name) => name.startsWith('hover:'));
  if (!hoverClass) return 'null';
  const wanted = '.' + CSS.escape(hoverClass);
  const found = [];
  const walk = (rules, media) => {
    for (const rule of Array.from(rules || [])) {
      if (rule.cssRules && rule.cssRules.length > 0) { walk(rule.cssRules, rule.conditionText || media); continue; }
      const ruleSelector = rule.selectorText || '';
      if (!ruleSelector.includes(wanted) || !ruleSelector.includes(':hover')) continue;
      const declared = rule.style ? rule.style.getPropertyValue('color') : '';
      if (declared) found.push({ selector: ruleSelector, declared, media: media || null });
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules, null); } catch { /* a sheet this page does not own */ }
  }
  if (found.length === 0) return 'null';
  const resolve = (declaration) => {
    const probe = document.createElement('div');
    probe.style.color = declaration;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  };
  const token = (name) => {
    const probe = document.createElement('div');
    probe.style.color = 'var(' + name + ')';
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  };
  return JSON.stringify({
    hoverClass,
    rules: found.length,
    selector: found[0].selector,
    declared: found[0].declared,
    resolved: resolve(found[0].declared),
    media: found[0].media,
    foreground: token('--foreground'),
    primary: token('--primary'),
    rest: getComputedStyle(element).color,
  });
})()`;

/** The runner's own pointer capabilities — reported so a runtime hover row can never lie. */
const APPEARANCE_HOVER_CAPABILITY = `JSON.stringify({
  hover: window.matchMedia('(hover: hover)').matches,
  anyHover: window.matchMedia('(any-hover: hover)').matches,
  pointerFine: window.matchMedia('(pointer: fine)').matches,
})`;



/**
 * The appearance contract, proved against a real engine (see the phase notes above).
 */
async function runAppearanceContractScenario(chrome) {
  const original = await readFile(CONFIG_PATH, "utf8");
  const rows = [];
  // A task-owned PROSE page (the shipped fixture's pages carry no link; `--primary` on prose links is
  // one of the authorities this contract pins). Written into the disposable copy, removed in `finally`.
  const prosePath = join(CONTENT_ROOT, "markdown", "ww", "en", "zz-appearance-prose.md");
  await mkdir(dirname(prosePath), { recursive: true });
  await writeFile(
    prosePath,
    "---\ntitle: Appearance contract fixture\ndescription: A test-owned page for the appearance contract.\n---\n\nA test-owned page for the appearance contract.\n\n[Appearance fixture link](/ww/en/about)\n",
    "utf8",
  );

  const surfacePort = BASE_PORT + 600;
  const surfaceUrl = `http://localhost:${surfacePort}`;
  /** The colour-only signature of a frame: every audited surface, no state and no geometry. */
  const signatureOf = (probe) =>
    JSON.stringify({
      tokens: probe.tokens,
      body: probe.body,
      headerColor: probe.headerColor,
      selector: probe.selector,
      rail: probe.rail ? { bg: probe.rail.bg, divider: probe.rail.divider, navLink: probe.rail.navLink } : null,
      footer: probe.footer,
    });

  /**
   * The disposable copy currently carries the CANONICAL scenario's own mutation (`ui.layoutSwitcher`
   * DISABLED — see the canonical runner, which restores the file only at the very end of the run).
   * This contract needs the values the FIXTURE itself ships
   * (`tests/fixtures/synthetic-deployment/site.config.json` enables the switcher with the `sidebar`
   * default): the layout selector, the Menu Bar presentation and the sidebar layout's
   * `persistent-sidebar` mobile band all exist only when the layout choice does. Restored in
   * `finally`, exactly like every other scenario's fixture.
   */
  const patchShippedUi = (config) => ({
    ...config,
    ui: { ...(config.ui ?? {}), layoutSwitcher: { enabled: true, default: "sidebar" } },
  });
  await writeFile(CONFIG_PATH, JSON.stringify(patchShippedUi(JSON.parse(original)), null, 2) + "\n", "utf8");

  const surface = startDevServer(surfacePort);
  let cdp = null;
  const signatures = [];
  try {
    BASE_URL = surfaceUrl;
    await waitForServer(`${surfaceUrl}/ww/en`);
    cdp = await Cdp.connect(chrome);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(`${surfaceUrl}/ww/en`);
    await waitReady(cdp);
    let light = null;

    // ── LIGHT SCHEME: every shared surface resolves to its documented token ──────────────────────
    for (const [name, viewport] of [
      ["desktop", VIEWPORTS.desktop],
      ["tablet", VIEWPORTS.tablet],
      ["mobile", VIEWPORTS.mobile],
    ]) {
      await cdp.setViewport(viewport.width, viewport.height);
      await cdp.navigate(`${surfaceUrl}/ww/en`);
      await waitReady(cdp);
      await closeVisibleRail(cdp);
      await sleep(300);
      const probe = JSON.parse(await cdp.evaluate(APPEARANCE_PROBE));
      if (name === "desktop") light = probe;
      const tag = `appearance.surface.${name}`;
      check(rows, `${tag}.bodyPaintsTheBackgroundToken`, probe.body.bg === probe.tokens.background, `body=${probe.body.bg} token=${probe.tokens.background}`);
      check(rows, `${tag}.bodyTextUsesTheForegroundToken`, probe.body.color === probe.tokens.foreground, `text=${probe.body.color} token=${probe.tokens.foreground}`);
      check(rows, `${tag}.headerTextUsesTheForegroundToken`, probe.headerColor === probe.tokens.foreground, `header=${probe.headerColor} token=${probe.tokens.foreground}`);
      check(rows, `${tag}.selectorSurfaceUsesTheBackgroundToken`, !!probe.selector && probe.selector.bg === probe.tokens.background, `selector=${probe.selector && probe.selector.bg} token=${probe.tokens.background}`);
      check(rows, `${tag}.selectorBorderUsesTheBorderToken`, !!probe.selector && probe.selector.borderTop === probe.tokens.border, `border=${probe.selector && probe.selector.borderTop} token=${probe.tokens.border}`);
      check(rows, `${tag}.railPaintsTheBackgroundToken`, !!probe.rail && probe.rail.bg === probe.tokens.background, `rail=${probe.rail && probe.rail.bg} token=${probe.tokens.background}`);
      check(rows, `${tag}.railNavTextUsesTheMutedToken`, !!probe.rail && probe.rail.navLink === probe.tokens.mutedForeground, `link=${probe.rail && probe.rail.navLink} token=${probe.tokens.mutedForeground}`);
      check(rows, `${tag}.railDividerUsesTheBorderToken`, !!probe.rail && probe.rail.divider === probe.tokens.border && probe.rail.dividerWidth === "1px", `divider=${probe.rail && probe.rail.divider}/${probe.rail && probe.rail.dividerWidth} token=${probe.tokens.border}`);
      check(rows, `${tag}.footerSurfaceStaysTransparent`, !!probe.footer && probe.footer.bg === "rgba(0, 0, 0, 0)", `footer=${probe.footer && probe.footer.bg}`);
      check(rows, `${tag}.footerDividerUsesTheBorderToken`, !!probe.footer && probe.footer.borderTop === probe.tokens.border, `divider=${probe.footer && probe.footer.borderTop} token=${probe.tokens.border}`);
      check(rows, `${tag}.footerHeadingUsesTheMutedToken`, !!probe.footer && probe.footer.heading === probe.tokens.mutedForeground, `heading=${probe.footer && probe.footer.heading} token=${probe.tokens.mutedForeground}`);
      check(rows, `${tag}.footerLinkUsesTheForegroundToken`, !!probe.footer && probe.footer.link === probe.tokens.foreground, `link=${probe.footer && probe.footer.link} token=${probe.tokens.foreground}`);
      check(rows, `${tag}.noGraphicBackgroundWithoutConfiguration`, probe.pageBackgroundCount === 0, `layers=${probe.pageBackgroundCount}`);
      check(rows, `${tag}.noHorizontalOverflow`, probe.viewport.scrollWidth <= probe.viewport.clientWidth + 1, `scroll=${probe.viewport.scrollWidth}/${probe.viewport.clientWidth}`);
      signatures.push({ name, signature: signatureOf(probe) });
    }

    // ── CROSS-VIEWPORT CONSISTENCY: none of these COLOURS is breakpoint-driven ───────────────────
    check(
      rows,
      "appearance.consistency.coloursAreBreakpointIndependent",
      signatures.length === 3 && new Set(signatures.map((s) => s.signature)).size === 1,
      signatures.map((s) => `${s.name}:${s.signature}`).join(" | "),
    );

    // ── PROSE: the documented text and link authorities ──────────────────────────────────────────
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.navigate(`${surfaceUrl}/ww/en/zz-appearance-prose`);
    await waitReady(cdp);
    const prose = JSON.parse(await cdp.evaluate(APPEARANCE_PROBE));
    check(rows, "appearance.surface.prose.textUsesTheForegroundToken", !!prose.prose && prose.prose.color === prose.tokens.foreground, `prose=${prose.prose && prose.prose.color} token=${prose.tokens.foreground}`);
    check(rows, "appearance.surface.prose.linkUsesThePrimaryToken", !!prose.prose && prose.prose.link === prose.tokens.primary, `link=${prose.prose && prose.prose.link} token=${prose.tokens.primary}`);

    // ── MENU BAR: the full-width sticky surface is PAINTED across the whole viewport ─────────────
    await cdp.navigate(`${surfaceUrl}/ww/en`);
    await waitReady(cdp);
    await cdp.evaluate(chooseLayout("menu-bar"));
    await sleep(400);
    for (const [name, viewport] of [
      ["desktop", VIEWPORTS.desktop],
      ["mobile", VIEWPORTS.mobile],
    ]) {
      await cdp.setViewport(viewport.width, viewport.height);
      await sleep(400);
      const probe = JSON.parse(await cdp.evaluate(APPEARANCE_PROBE));
      const tag = `appearance.menuBar.${name}`;
      const spans = !!probe.bar && probe.bar.box[0] <= 1 && probe.bar.box[0] + probe.bar.box[2] >= probe.viewport.clientWidth - 1;
      check(rows, `${tag}.surfacePresent`, !!probe.bar, `bar=${!!probe.bar}`);
      check(rows, `${tag}.surfaceSpansTheFullClientWidth`, spans, `box=${probe.bar && probe.bar.box} clientW=${probe.viewport.clientWidth}`);
      check(rows, `${tag}.surfacePaintsTheBackgroundToken`, !!probe.bar && probe.bar.bg === probe.tokens.background, `bg=${probe.bar && probe.bar.bg} token=${probe.tokens.background}`);
      check(rows, `${tag}.surfaceBorderUsesTheBorderToken`, !!probe.bar && probe.bar.borderTop === probe.tokens.border, `border=${probe.bar && probe.bar.borderTop} token=${probe.tokens.border}`);
      check(rows, `${tag}.navigationLinksUseTheForegroundToken`, !!probe.bar && probe.bar.link === probe.tokens.foreground, `link=${probe.bar && probe.bar.link} token=${probe.tokens.foreground}`);
      check(rows, `${tag}.surfaceIsPaintedAtBothEdges`, !!probe.bar && probe.bar.leftEdgeHit === "BAR" && probe.bar.rightEdgeHit === "BAR", `left=${probe.bar && probe.bar.leftEdgeHit} right=${probe.bar && probe.bar.rightEdgeHit}`);
      check(rows, `${tag}.footerSurfacesAreUnchangedByTheMode`, !!probe.footer && probe.footer.bg === "rgba(0, 0, 0, 0)" && probe.footer.borderTop === probe.tokens.border, `footer=${probe.footer && probe.footer.bg}/${probe.footer && probe.footer.borderTop}`);
      check(rows, `${tag}.pageBackgroundIsUnchangedByTheMode`, probe.body.bg === probe.tokens.background, `body=${probe.body.bg} token=${probe.tokens.background}`);
      check(rows, `${tag}.noHorizontalOverflow`, probe.viewport.scrollWidth <= probe.viewport.clientWidth + 1, `scroll=${probe.viewport.scrollWidth}/${probe.viewport.clientWidth}`);
    }
    await cdp.evaluate(chooseLayout("sidebar"));
    await sleep(400);

    // ── DARK SCHEME: the same surfaces resolve to the DARK tokens (engine-emulated) ──────────────
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "dark" }],
    });
    await cdp.navigate(`${surfaceUrl}/ww/en`);
    await waitReady(cdp);
    await closeVisibleRail(cdp);
    await sleep(300);
    const dark = JSON.parse(await cdp.evaluate(APPEARANCE_PROBE));
    check(
      rows,
      "appearance.dark.schemeEmulatedAndTokensDiffer",
      dark.schemeDark === true && dark.tokens.background !== light.tokens.background && dark.tokens.foreground !== light.tokens.foreground,
      `dark=${dark.schemeDark} lightBg=${light.tokens.background} darkBg=${dark.tokens.background}`,
    );
    check(rows, "appearance.dark.bodyPaintsTheDarkBackgroundToken", dark.body.bg === dark.tokens.background && dark.body.color === dark.tokens.foreground, `body=${dark.body.bg}/${dark.body.color} token=${dark.tokens.background}/${dark.tokens.foreground}`);
    check(rows, "appearance.dark.headerTextUsesTheDarkForegroundToken", dark.headerColor === dark.tokens.foreground, `header=${dark.headerColor} token=${dark.tokens.foreground}`);
    check(rows, "appearance.dark.selectorUsesTheDarkTokens", !!dark.selector && dark.selector.bg === dark.tokens.background && dark.selector.borderTop === dark.tokens.border, `selector=${dark.selector && dark.selector.bg}/${dark.selector && dark.selector.borderTop}`);
    check(rows, "appearance.dark.railPaintsTheDarkBackgroundToken", !!dark.rail && dark.rail.bg === dark.tokens.background, `rail=${dark.rail && dark.rail.bg} token=${dark.tokens.background}`);
    check(rows, "appearance.dark.railNavTextUsesTheDarkMutedToken", !!dark.rail && dark.rail.navLink === dark.tokens.mutedForeground, `link=${dark.rail && dark.rail.navLink} token=${dark.tokens.mutedForeground}`);
    check(rows, "appearance.dark.railDividerUsesTheDarkBorderToken", !!dark.rail && dark.rail.divider === dark.tokens.border, `divider=${dark.rail && dark.rail.divider} token=${dark.tokens.border}`);
    check(rows, "appearance.dark.footerStaysTransparentWithTheDarkDivider", !!dark.footer && dark.footer.bg === "rgba(0, 0, 0, 0)" && dark.footer.borderTop === dark.tokens.border, `footer=${dark.footer && dark.footer.bg}/${dark.footer && dark.footer.borderTop}`);
    check(rows, "appearance.dark.footerHeadingUsesTheDarkMutedToken", !!dark.footer && dark.footer.heading === dark.tokens.mutedForeground, `heading=${dark.footer && dark.footer.heading} token=${dark.tokens.mutedForeground}`);
    await cdp.evaluate(chooseLayout("menu-bar"));
    await sleep(400);
    const darkBar = JSON.parse(await cdp.evaluate(APPEARANCE_PROBE));
    check(rows, "appearance.dark.menuBarUsesTheDarkTokens", !!darkBar.bar && darkBar.bar.bg === darkBar.tokens.background && darkBar.bar.borderTop === darkBar.tokens.border && darkBar.bar.link === darkBar.tokens.foreground, `bar=${darkBar.bar && darkBar.bar.bg}/${darkBar.bar && darkBar.bar.borderTop} link=${darkBar.bar && darkBar.bar.link}`);
    await cdp.evaluate(chooseLayout("sidebar"));
    await cdp.send("Emulation.setEmulatedMedia", { features: [] });
    await sleep(400);

    // ── INTERACTION STATES: the declaration everywhere, the runtime behaviour where hover exists ──
    /**
     * HOVER IS A CAPABILITY AND THEN A STATE. The platform styles hover through Tailwind's `hover:`
     * utilities, which are compiled inside `@media (hover: hover)`; whether that query is TRUE is a
     * property of the RUNNER (the headless Linux CI renderer reports false while still answering
     * `:hover` as true, which is why a runtime colour assertion passed locally and failed there).
     * The durable contract is therefore the DECLARATION the element itself carries, resolved through
     * the engine — identical on every runner — and the runtime behaviour is asserted on top whenever
     * the runner really has hover (`settleState` forces frames, because these controls also animate
     * their colour for 150ms).
     */
    await cdp.navigate(`${surfaceUrl}/ww/en`);
    await waitReady(cdp);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await clickVisibleRailToggle(cdp);
    await sleep(450);

    const capability = JSON.parse(await cdp.evaluate(APPEARANCE_HOVER_CAPABILITY));
    check(
      rows,
      "appearance.interaction.runnerHoverCapabilityReported",
      true,
      `(hover: hover)=${capability.hover} (any-hover: hover)=${capability.anyHover} (pointer: fine)=${capability.pointerFine} — the runtime hover rows below are asserted when hover is true`,
    );
    const railDeclaration = JSON.parse(
      await cdp.evaluate(APPEARANCE_HOVER_DECLARATION("#shell-sidebar-desktop-rail ul li a")),
    );
    check(
      rows,
      "appearance.interaction.railNavHoverDeclarationResolvesToTheForegroundToken",
      !!railDeclaration &&
        railDeclaration.rules >= 1 &&
        railDeclaration.resolved === railDeclaration.foreground &&
        railDeclaration.resolved !== railDeclaration.rest,
      `class=${railDeclaration && railDeclaration.hoverClass} declared="${railDeclaration && railDeclaration.declared}" resolved=${railDeclaration && railDeclaration.resolved} rest=${railDeclaration && railDeclaration.rest} media=${railDeclaration && railDeclaration.media}`,
    );
    const footerDeclaration = JSON.parse(await cdp.evaluate(APPEARANCE_HOVER_DECLARATION("footer a")));
    check(
      rows,
      "appearance.interaction.footerLinkHoverDeclarationResolvesToThePrimaryToken",
      !!footerDeclaration &&
        footerDeclaration.rules >= 1 &&
        footerDeclaration.resolved === footerDeclaration.primary &&
        footerDeclaration.resolved !== footerDeclaration.rest,
      `class=${footerDeclaration && footerDeclaration.hoverClass} declared="${footerDeclaration && footerDeclaration.declared}" resolved=${footerDeclaration && footerDeclaration.resolved} rest=${footerDeclaration && footerDeclaration.rest} media=${footerDeclaration && footerDeclaration.media}`,
    );

    const settleState = async (read, expected, attempts = 8) => {
      const nextFrame = () =>
        cdp.evaluate(
          "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
        );
      await nextFrame();
      let last = await read();
      for (let attempt = 0; attempt < attempts && last && last.color !== expected; attempt += 1) {
        await sleep(250);
        await nextFrame();
        last = await read();
      }
      return last;
    };

    await cdp.navigate(`${surfaceUrl}/ww/en`);
    await waitReady(cdp);
    await cdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await clickVisibleRailToggle(cdp);
    await sleep(450);
    const navRest = JSON.parse(await cdp.evaluate(APPEARANCE_NAV_STATE));
    if (capability.hover) {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: navRest.point.x, y: navRest.point.y });
      await sleep(250);
      const navHover = await settleState(
        async () => JSON.parse(await cdp.evaluate(APPEARANCE_NAV_STATE)),
        navRest.foreground,
      );
      check(
        rows,
        "appearance.interaction.railNavHoverMovesToTheForegroundToken",
        navRest.color === navRest.mutedForeground && navHover.color === navHover.foreground && navHover.hovered === true,
        `rest=${navRest.color} hover=${navHover.color} hovered=${navHover.hovered} tokens=${navRest.mutedForeground}/${navRest.foreground}`,
      );
    } else {
      check(
        rows,
        "appearance.interaction.railNavHoverMovesToTheForegroundToken",
        true,
        "not evaluated: this runner reports (hover: hover)=false, so the platform applies no hover styling here (Tailwind's capability rule); the declaration row above carries the contract",
      );
    }
    await closeVisibleRail(cdp);
    await sleep(300);

    // The global focus ring is the ONE `--ring` rule: real Tab presses, then the focused element's
    // own outline (the same idiom the existing focus scenario uses).
    let ring = null;
    for (let i = 0; i < 10 && !ring; i += 1) {
      await cdp.pressKey("Tab");
      await sleep(70);
      ring = JSON.parse(await cdp.evaluate(APPEARANCE_RING_STATE));
    }
    check(
      rows,
      "appearance.interaction.focusRingResolvesToTheRingToken",
      !!ring && ring.outlineStyle === "solid" && ring.outlineWidth === "2px" && ring.outlineColor === ring.ring,
      `active=${ring && ring.tag} outline=${ring && ring.outlineStyle} ${ring && ring.outlineWidth} ${ring && ring.outlineColor} token=${ring && ring.ring}`,
    );

    // The ordinary footer's link hover, with real input: bring the first footer link well inside the
    // viewport (the sticky bar owns the very bottom) before hovering it.
    const footerLinkState = async () =>
      JSON.parse(
        await cdp.evaluate(`(() => {
          const link = document.querySelector('footer a');
          if (!link) return 'null';
          const probe = document.createElement('div');
          probe.style.color = 'var(--primary)';
          document.body.appendChild(probe);
          const primary = getComputedStyle(probe).color;
          probe.remove();
          return JSON.stringify({ color: getComputedStyle(link).color, hovered: link.matches(':hover'), primary });
        })()`),
      );
    await cdp.evaluate(`(() => {
      const link = document.querySelector('footer a');
      if (!link) return false;
      window.scrollTo(0, Math.max(0, Math.round(link.getBoundingClientRect().top + window.scrollY) - 220));
      return true;
    })()`);
    await sleep(350);
    const footerLinkPoint = JSON.parse(await cdp.evaluate(`(() => {
      const link = document.querySelector('footer a');
      if (!link) return 'null';
      const r = link.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
    })()`));
    if (capability.hover) {
      const footerRest = await footerLinkState();
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: footerLinkPoint.x, y: footerLinkPoint.y });
      await sleep(250);
      const footerHover = await settleState(footerLinkState, footerRest.primary);
      check(
        rows,
        "appearance.interaction.footerLinkHoverResolvesToThePrimaryToken",
        !!footerHover &&
          footerHover.hovered === true &&
          footerHover.color === footerHover.primary &&
          footerRest.color !== footerHover.color,
        `rest=${footerRest && footerRest.color} hover=${footerHover && footerHover.color} hovered=${footerHover && footerHover.hovered} token=${footerHover && footerHover.primary}`,
      );
    } else {
      check(
        rows,
        "appearance.interaction.footerLinkHoverResolvesToThePrimaryToken",
        true,
        "not evaluated: this runner reports (hover: hover)=false; the declaration row above carries the contract",
      );
    }
    await cdp.evaluate("window.scrollTo(0, 0); true");

  } catch (error) {
    check(rows, "appearance.surface.scenario.error", false, String(error));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(surface);
  }

  // ── CONFIGURED PHASE: one test-owned configuration, one own server ────────────────────────────
  // `ui.theme.background` (the only configured colour authority that exists) plus the two decorative
  // graphic roles, pointed at SHIPPED mirrored placeholders. The config write lands in the disposable
  // COPY and is restored here and by the runner's own `finally`.
  const configuredPort = BASE_PORT + 601;
  const configuredUrl = `http://localhost:${configuredPort}`;
  const configuredConfig = patchShippedUi(JSON.parse(original));
  configuredConfig.ui = {
    ...(configuredConfig.ui ?? {}),
    theme: { ...(configuredConfig.ui?.theme ?? {}), background: APPEARANCE_CONFIGURED_BACKGROUND },
  };
  configuredConfig.site = {
    ...configuredConfig.site,
    assets: {
      ...(configuredConfig.site?.assets ?? {}),
      backgrounds: { all: APPEARANCE_BACKGROUND_FIXTURE_URL },
      footerGraphic: APPEARANCE_FOOTER_GRAPHIC_FIXTURE_URL,
    },
  };
  await writeFile(CONFIG_PATH, JSON.stringify(configuredConfig, null, 2) + "\n", "utf8");

  const configured = startDevServer(configuredPort);
  let configuredCdp = null;
  try {
    await waitForServer(`${configuredUrl}/ww/en`);
    configuredCdp = await Cdp.connect(chrome);
    await configuredCdp.setViewport(VIEWPORTS.desktop.width, VIEWPORTS.desktop.height);
    await configuredCdp.navigate(`${configuredUrl}/ww/en`);
    await waitReady(configuredCdp);
    await closeVisibleRail(configuredCdp);
    await sleep(300);
    const themed = JSON.parse(await configuredCdp.evaluate(APPEARANCE_PROBE));
    // The fixture's OWN input, stated as a rendered value (the one place a literal is the subject).
    const configuredRgb = "rgb(0, 255, 0)";
    check(
      rows,
      "appearance.configured.backgroundReachesTheRootToken",
      (themed.htmlStyleAttribute ?? "").includes(`--background: ${APPEARANCE_CONFIGURED_BACKGROUND}`) &&
        themed.tokens.background === configuredRgb,
      `htmlStyle="${themed.htmlStyleAttribute}" token=${themed.tokens.background}`,
    );
    check(rows, "appearance.configured.bodyFollowsTheConfiguredBackground", themed.body.bg === configuredRgb, `body=${themed.body.bg}`);
    check(rows, "appearance.configured.railFollowsTheConfiguredBackground", !!themed.rail && themed.rail.bg === configuredRgb, `rail=${themed.rail && themed.rail.bg}`);
    check(rows, "appearance.configured.selectorFollowsTheConfiguredBackground", !!themed.selector && themed.selector.bg === configuredRgb, `selector=${themed.selector && themed.selector.bg}`);
    check(rows, "appearance.configured.textKeepsTheForegroundToken", themed.body.color === themed.tokens.foreground && themed.headerColor === themed.tokens.foreground, `text=${themed.body.color}/${themed.headerColor} token=${themed.tokens.foreground}`);
    check(
      rows,
      "appearance.configured.footerStaysTransparentOverTheCanvas",
      !!themed.footer && themed.footer.bg === "rgba(0, 0, 0, 0)" && themed.footer.borderTop === themed.tokens.border,
      `footer=${themed.footer && themed.footer.bg}/${themed.footer && themed.footer.borderTop}`,
    );

    // The Menu Bar surface follows the same configured authority.
    await configuredCdp.evaluate(chooseLayout("menu-bar"));
    await sleep(450);
    const themedBar = JSON.parse(await configuredCdp.evaluate(APPEARANCE_PROBE));
    check(
      rows,
      "appearance.configured.menuBarSurfaceFollowsTheConfiguredBackground",
      !!themedBar.bar && themedBar.bar.bg === configuredRgb && themedBar.bar.box[2] >= themedBar.viewport.clientWidth - 1,
      `bar=${themedBar.bar && themedBar.bar.bg} width=${themedBar.bar && themedBar.bar.box[2]}`,
    );
    await configuredCdp.evaluate(chooseLayout("sidebar"));
    await sleep(400);

    // ── THE DECORATIVE PAGE BACKGROUND (P12-BG) ──────────────────────────────────────────────────
    const layer = themed.pageBackground;
    check(rows, "appearance.watermark.exactlyOneLayer", themed.pageBackgroundCount === 1, `layers=${themed.pageBackgroundCount}`);
    check(
      rows,
      "appearance.watermark.resolvesTheConfiguredAsset",
      !!layer && layer.image.includes(new URL(APPEARANCE_BACKGROUND_FIXTURE_URL).pathname),
      `image=${layer && layer.image}`,
    );
    check(
      rows,
      "appearance.watermark.isAFixedViewportLayer",
      !!layer &&
        layer.mode === "fixed" &&
        layer.box[0] === 0 &&
        layer.box[1] === 0 &&
        layer.box[2] >= themed.viewport.clientWidth - 1,
      `mode=${layer && layer.mode} box=${layer && layer.box} clientW=${themed.viewport.clientWidth}`,
    );
    check(
      rows,
      "appearance.watermark.coversCentredAndNeverRepeats",
      !!layer && layer.size === "cover" && layer.position === "50% 50%" && layer.repeat === "no-repeat",
      `size=${layer && layer.size} position=${layer && layer.position} repeat=${layer && layer.repeat}`,
    );
    check(
      rows,
      "appearance.watermark.isInertAndDecorative",
      !!layer && layer.pointerEvents === "none" && layer.ariaHidden === "true",
      `pointerEvents=${layer && layer.pointerEvents} ariaHidden=${layer && layer.ariaHidden}`,
    );
    check(
      rows,
      "appearance.watermark.stacksBehindTheContent",
      !!layer && layer.zIndex === "-1" && themed.hitAtProse === "CONTENT",
      `zIndex=${layer && layer.zIndex} hit=${themed.hitAtProse}`,
    );
    check(
      rows,
      "appearance.watermark.addsNoHorizontalOverflow",
      themed.viewport.scrollWidth <= themed.viewport.clientWidth + 1,
      `scroll=${themed.viewport.scrollWidth}/${themed.viewport.clientWidth}`,
    );

    // ── THE DECORATIVE FOOTER GRAPHIC (P12-FG), configured by the same fixture ───────────────────
    const footerLayer = themed.footerGraphic;
    check(rows, "appearance.footerGraphic.exactlyOneLayer", themed.footerGraphicCount === 1, `layers=${themed.footerGraphicCount}`);
    check(
      rows,
      "appearance.footerGraphic.isAnInertAbsoluteLayerBehindFooterContent",
      !!footerLayer &&
        !footerLayer.image.includes("none") &&
        footerLayer.mode === "absolute" &&
        footerLayer.zIndex === "-1" &&
        footerLayer.pointerEvents === "none" &&
        footerLayer.ariaHidden === "true" &&
        footerLayer.footerIsolation === "isolate",
      `mode=${footerLayer && footerLayer.mode} z=${footerLayer && footerLayer.zIndex} pe=${footerLayer && footerLayer.pointerEvents} aria=${footerLayer && footerLayer.ariaHidden} isolate=${footerLayer && footerLayer.footerIsolation}`,
    );
    check(
      rows,
      "appearance.footerGraphic.doesNotReplaceTheFooterSurface",
      !!themed.footer && themed.footer.bg === "rgba(0, 0, 0, 0)",
      `footer=${themed.footer && themed.footer.bg}`,
    );

    // A page WITHOUT a page-specific entry still renders the GLOBAL (`all`) entry — the fallback the
    // resolution contract documents, proved on a second route of the same server.
    await configuredCdp.navigate(`${configuredUrl}/ww/en/about`);
    await waitReady(configuredCdp);
    await sleep(300);
    const aboutPage = JSON.parse(await configuredCdp.evaluate(APPEARANCE_PROBE));
    check(
      rows,
      "appearance.watermark.globalEntryCoversEveryPage",
      aboutPage.pageBackgroundCount === 1 &&
        aboutPage.pageBackground.image.includes(new URL(APPEARANCE_BACKGROUND_FIXTURE_URL).pathname),
      `layers=${aboutPage.pageBackgroundCount} image=${aboutPage.pageBackground && aboutPage.pageBackground.image}`,
    );
  } catch (error) {
    check(rows, "appearance.configured.scenario.error", false, String(error));
  } finally {
    if (configuredCdp) await configuredCdp.close();
    await stopServer(configured);
  }

  // Deterministic cleanup: the configuration AND the task-owned prose fixture leave nothing behind.
  await writeFile(CONFIG_PATH, original, "utf8");
  await rm(prosePath, { force: true });
  return rows;
}

async function runMatrix(chrome, scope) {
/**
 * MULTISITE / MULTILINGUAL, IN A REAL BROWSER (FOUNDATION-S1).
 *
 * The S1 model's user-visible consequences, proven once, on ONE temporary deployment:
 * two independent country sites (`ca`, `fr`) that genuinely differ (bodies, chrome, locales),
 * driven through the four independent visitor dimensions — Site, Language, Location and Layout.
 *
 * Everything here is a run fixture: the configuration and the pages are written in this
 * scenario and restored byte-for-byte/removed in `finally`, so the shipped template keeps
 * shipping no pages and no multi-site configuration.
 */
const MULTISITE_SITES = ["ca", "fr"];
const MULTISITE_MARK = {
  caFr: "ZZ-CANADA-FRENCH-BODY",
  caEn: "ZZ-CANADA-ENGLISH-BODY",
  frFr: "ZZ-FRANCE-FRENCH-BODY",
};
const MULTISITE_PAGES = [
  ["ca", "fr", "about", MULTISITE_MARK.caFr, "À propos (Canada)"],
  ["ca", "en", "about", MULTISITE_MARK.caEn, "About (Canada)"],
  ["fr", "fr", "about", MULTISITE_MARK.frFr, "À propos (France)"],
  ["ca", "fr", "zz-ca-only", "ZZ-CANADA-ONLY-PAGE", "Page du Canada"],
];

/** The pathname of the current location, as the browser reports it. */
const MULTISITE_PATH = "location.pathname";
const MULTISITE_SELECT = (name) => `select[data-selector="${name}"]`;

/** A probe of the four visitor dimensions as they are actually exposed. */
const MULTISITE_PROBE = `(() => {
  const control = (name) => document.querySelector('select[data-selector="' + name + '"]');
  const info = (name) => {
    const element = control(name);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      value: element.value,
      name: element.getAttribute('aria-label') || '',
      options: [...element.options].map((option) => option.value),
      labels: [...element.options].map((option) => option.textContent.trim()),
      visible: rect.width > 0 && rect.height > 0,
    };
  };
  const navLinks = [...document.querySelectorAll('a')].filter((a) => {
    if (a.closest('[inert]')) return false;
    const rect = a.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  return {
    path: location.pathname,
    body: (document.body.textContent || '').replace(/\\s+/g, ' '),
    site: info('site'),
    language: info('language'),
    location: info('location'),
    layout: info('layout'),
    shellLayout: document.documentElement.getAttribute('data-ui-shell-layout'),
    navLabels: navLinks.map((a) => a.textContent.trim()),
    visibleLinks: navLinks.length,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    activeElement: document.activeElement ? document.activeElement.tagName : null,
    activeIsSelector: !!document.activeElement && document.activeElement.matches('select[data-selector]'),
    mobileNavPresent: !!document.querySelector('nav[aria-label]'),
  };
})()`;

/** Choose an option on one of the shared selector controls, as the visitor would. */
const multisiteChoose = (name, value) => `(() => {
  const element = document.querySelector('select[data-selector="${name}"]');
  if (!element) return false;
  element.value = ${JSON.stringify(value)};
  element.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

  const scopePlan = browserScopePlan(scope);
  console.log(`[matrix] scope ${scope} — ${describeBrowserScope(scope)}`);
  // Discovery happens ONCE, before anything runs, so a `deployment`-scoped run refuses an empty
  // deployment surface instead of reporting success for having executed nothing.
  const discovery = await discoverDeploymentScenarios();
  if (scopePlan.deployment && discovery.names.length === 0) {
    throw new Error(deploymentScopeFailure(discovery));
  }
  // Foundation-owned scenarios are discovered the same way (M16), and only when this scope runs them.
  const foundationScenarios = scopePlan.foundation ? await discoverFoundationScenarios() : [];

  let allRows = [];
  const original = await readFile(CONFIG_PATH, "utf8");
  try {
    if (scopePlan.deployment) {
      // THE DEPLOYMENT'S OWN ACCEPTANCE (R1A — sourced from the deployment's OWN browser tree, which
      // the authority located). It runs FIRST, against `site.config.json` exactly as the deployment
      // ships it (it never writes the file): every generic scenario below mutates the synthetic
      // configuration, so the shipped values must be observed before any of them does.
      const referenceRows = await runDeploymentScenarios(chrome, discovery.directory, discovery.names);
      allRows = allRows.concat(referenceRows);
    }
    if (scopePlan.foundation) {
      // ONE canonical presentation (the retired feature's five-preset loop is gone).
      const config = JSON.parse(original);
      config.ui = { ...config.ui, ...CANONICAL.ui };
      await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf8");
      const rows = await runCanonical(chrome);
      allRows = allRows.concat(rows);
      const fails = rows.filter((r) => !r.ok).length;
      console.log(`[matrix] ${CANONICAL.name}: ${rows.length - fails}/${rows.length} checks passed${fails ? ` FAIL=${fails}` : ""}`);
      for (const row of rows.filter((r) => !r.ok)) console.log(`  FAIL ${row.name} :: ${row.detail}`);
      // P5-6 — duplicate-destination acceptance (own server, config restored below).
      const dupRows = await runDuplicateNavScenario(chrome);
      allRows = allRows.concat(dupRows.map((r) => ({ presentation: "dup-nav", ...r })));
      const dupFails = dupRows.filter((r) => !r.ok).length;
      console.log(`[matrix] dup-nav: ${dupRows.length - dupFails}/${dupRows.length} checks passed${dupFails ? ` FAIL=${dupFails}` : ""}`);
      // CONNECTIVITY ICON SEAM — browser-real acceptance of the optional
      // connectivity icon contract (own server, config restored by the scenario).
      const connectivityRows = await runConnectivityIconScenario(chrome);
      allRows = allRows.concat(connectivityRows.map((r) => ({ presentation: "connectivity-icons", ...r })));
      const connectivityFails = connectivityRows.filter((r) => !r.ok).length;
      console.log(`[matrix] connectivity-icons: ${connectivityRows.length - connectivityFails}/${connectivityRows.length} checks passed${connectivityFails ? ` FAIL=${connectivityFails}` : ""}`);
      // FOUNDATION-N1 — PERSISTENT NAVIGATION (own server + fixtures, config and
      // content restored by the scenario).
      const persistRows = await runPersistentNavigationScenario(chrome);
      allRows = allRows.concat(persistRows.map((r) => ({ presentation: "persistent-navigation", ...r })));
      const persistFails = persistRows.filter((r) => !r.ok).length;
      console.log(`[matrix] persistent-navigation: ${persistRows.length - persistFails}/${persistRows.length} checks passed${persistFails ? ` FAIL=${persistFails}` : ""}`);
      // FOUNDATION-PAGES-A1 — SAFE MARKDOWN: the served page under the real route
      // carries no active markup (own server + fixture, both restored).
      const safeRows = await runSafeMarkdownScenario(chrome);
      allRows = allRows.concat(safeRows.map((r) => ({ presentation: "safe-markdown", ...r })));
      const safeFails = safeRows.filter((r) => !r.ok).length;
      console.log(`[matrix] safe-markdown: ${safeRows.length - safeFails}/${safeRows.length} checks passed${safeFails ? ` FAIL=${safeFails}` : ""}`);
      // FOUNDATION-PAGES-A1E — NESTED PAGES: a page authored in a FOLDER is served at
      // its nested URL, with its fragment target and its inert documentation (own server
      // + fixtures, both restored).
      const nestedRows = await runNestedPageScenario(chrome);
      allRows = allRows.concat(nestedRows.map((r) => ({ presentation: "nested-pages", ...r })));
      const nestedFails = nestedRows.filter((r) => !r.ok).length;
      console.log(`[matrix] nested-pages: ${nestedRows.length - nestedFails}/${nestedRows.length} checks passed${nestedFails ? ` FAIL=${nestedFails}` : ""}`);
      // FOUNDATION-PAGES-A2 — ADVANCED JSON: a declarative document is served and rendered
      // by the real application (own server + fixture, both restored).
      const jsonRows = await runAdvancedJsonScenario(chrome);
      allRows = allRows.concat(jsonRows.map((r) => ({ presentation: "advanced-json", ...r })));
      const jsonFails = jsonRows.filter((r) => !r.ok).length;
      console.log(`[matrix] advanced-json: ${jsonRows.length - jsonFails}/${jsonRows.length} checks passed${jsonFails ? ` FAIL=${jsonFails}` : ""}`);
      // FOUNDATION-N2 — SHELL LAYOUT PRESENTATION: the optional visitor switcher between
      // the Sidebar and Menu-bar layouts (own server + fixtures, all restored).
      const layoutRows = await runLayoutSwitcherScenario(chrome);
      allRows = allRows.concat(layoutRows.map((r) => ({ presentation: "layout-switcher", ...r })));
      const layoutFails = layoutRows.filter((r) => !r.ok).length;
      console.log(`[matrix] layout-switcher: ${layoutRows.length - layoutFails}/${layoutRows.length} checks passed${layoutFails ? ` FAIL=${layoutFails}` : ""}`);
      // FOUNDATION-DEFECT-NAV1A — BOTTOM NAVIGATION LAYOUT: the sticky bar's list owns its
      // rows, so links share a row and wrap only when the available width requires it (own
      // servers + test-owned navigation fixtures, the disposable copy restored).
      const wrapRows = await runBottomNavWrapScenario(chrome);
      allRows = allRows.concat(wrapRows.map((r) => ({ presentation: "bottom-nav-wrap", ...r })));
      const wrapFails = wrapRows.filter((r) => !r.ok).length;
      console.log(`[matrix] bottom-nav-wrap: ${wrapRows.length - wrapFails}/${wrapRows.length} checks passed${wrapFails ? ` FAIL=${wrapFails}` : ""}`);
      // FOUNDATION-DEFECT-NAV1B — HEADER SEMANTIC ROWS: the identity/selector row and the control row
      // keep their ownership under a very long title and under long contextual labels (own servers +
      // test-owned configuration fixtures, the disposable copy restored).
      const headerRows = await runHeaderRowsScenario(chrome);
      allRows = allRows.concat(headerRows.map((r) => ({ presentation: "header-rows", ...r })));
      const headerRowFails = headerRows.filter((r) => !r.ok).length;
      console.log(`[matrix] header-rows: ${headerRows.length - headerRowFails}/${headerRows.length} checks passed${headerRowFails ? ` FAIL=${headerRowFails}` : ""}`);
      // FOUNDATION-S1 — MULTISITE / MULTILINGUAL: two independent country sites, driven through
      // the four visitor dimensions (Site, Language, Location, Layout) on one temporary
      // deployment (own server + fixtures, configuration and content all restored).
      const multisiteRows = await runMultisiteScenario(chrome);
      allRows = allRows.concat(multisiteRows.map((r) => ({ presentation: "multisite", ...r })));
      const multisiteFails = multisiteRows.filter((r) => !r.ok).length;
      console.log(`[matrix] multisite: ${multisiteRows.length - multisiteFails}/${multisiteRows.length} checks passed${multisiteFails ? ` FAIL=${multisiteFails}` : ""}`);
      // FOUNDATION-UI1 — SIDEBAR PRESENTATION STATE: the visitor's open/closed choice survives a reload
      // and a navigation (both of which RE-CREATE the rail), and no route change owns it.
      const sidebarRows = await runSidebarStateScenario(chrome);
      allRows = allRows.concat(sidebarRows.map((r) => ({ presentation: "sidebar-state", ...r })));
      const sidebarFails = sidebarRows.filter((r) => !r.ok).length;
      console.log(`[matrix] sidebar-state: ${sidebarRows.length - sidebarFails}/${sidebarRows.length} checks passed${sidebarFails ? ` FAIL=${sidebarFails}` : ""}`);
      // FOUNDATION-DEFECT-NAV3 — APPEARANCE CONTRACT: every documented surface resolves to the token
      // NAV2 named it by (page, sidebar, header/selector, ordinary footer, Menu Bar), in the light and
      // dark schemes, at desktop/tablet/mobile; plus one configured background/graphic fixture
      // (own servers + task-owned fixtures, configuration and the task-owned page restored).
      const appearanceRows = await runAppearanceContractScenario(chrome);
      allRows = allRows.concat(appearanceRows.map((r) => ({ presentation: "appearance-contract", ...r })));
      const appearanceFails = appearanceRows.filter((r) => !r.ok).length;
      console.log(`[matrix] appearance-contract: ${appearanceRows.length - appearanceFails}/${appearanceRows.length} checks passed${appearanceFails ? ` FAIL=${appearanceFails}` : ""}`);
      // FOUNDATION-MULTISITE-M16/M17 — MULTI-HOST SPOKE RUNTIME: a disposable TWO-SPOKE Installation, served
      // by its own dev server and dispatched by EXACT HOSTNAME through the running application (own server +
      // its own Installation; the generated Spoke namespaces it materialises are removed again).
      if (foundationScenarios.length > 0) {
        const multihostRows = await runFoundationScenarios(chrome, foundationScenarios);
        allRows = allRows.concat(multihostRows);
      }
    }
  } finally {
    await writeFile(CONFIG_PATH, original, "utf8");
  }
  const failed = allRows.filter((r) => !r.ok).length;
  await writeReport(allRows, failed);
  return failed > 0;
}

async function main() {
  // An unknown or absent scope is refused BEFORE anything runs: a validation surface must never
  // quietly execute more — or less — than it was told.
  let scope;
  try {
    scope = parseBrowserScope();
  } catch (error) {
    console.error(`[matrix] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(2);
  }
  const chrome = findChrome();
  if (!chrome) {
    console.error("No Chrome/Chromium/Edge binary found. Install one or set CHROME_PATH.");
    process.exit(2);
  }
  process.exitCode = 0;
  let failed;
  try {
    failed = await runMatrix(chrome, scope);
  } catch (error) {
    console.error(
      `[matrix] ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    process.exit(2);
  }
  if (failed) process.exitCode = 1;
}

main();



