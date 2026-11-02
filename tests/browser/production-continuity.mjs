// tests/browser/production-continuity.mjs
// FOUNDATION-UI1-A1 — THE PRODUCTION-MODE CONTINUITY PROOF.
//
// WHY THIS FILE EXISTS, separate from `matrix.mjs`:
//
// The owner-visible defect (`OPEN → CLOSED → OPEN` while navigating an OPEN sidebar) was reported on the
// LIVE production site and was NOT reproducible by the dev-mode matrix, which asserted the destination
// state ("open stays open") and passed throughout. The visible part was the GEOMETRY: the rail's canonical
// CLOSED state was committed and corrected inside one commit, so no wrong frame was painted, but the
// browser still started the rail's `width 200ms` CSS transition — the rail visibly collapsed and expanded
// again on every navigation.
//
// The matrix now judges that interval too (`continuity.*` rows, dev server). This script is the smallest
// additional proof that runs against PRODUCTION-MODE OUTPUT — the mode the owner actually uses — instead of
// duplicating the 500+ check suite: build, serve, and assert the same continuity invariant through the same
// real controls.
//
// OWNERSHIP: this file is owned by the browser test directory (`tests/browser/`), is NOT wired into any CI
// job (a production build is minutes, not seconds), and is run explicitly:
//
//   node tests/browser/production-continuity.mjs
//
// It serves the repository's own deployment (the reference deployment — `synthetic: false` semantics), so
// the composition it exercises is the shipped one. It writes nothing itself: the build's own output is
// Next's, and the operator reads the run's report from the console.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { dirname, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Cdp, findChrome } from "./cdp.mjs";
import { HYDRATION_SETTLE_MS, READINESS_POLL_MS, READINESS_TIMEOUT_MS, readinessProbeExpression } from "./readiness.mjs";
import {
  expectedName,
  observedSemantics,
  readSemanticsHooks,
  semanticsAgree,
  semanticsDisagreement,
  semanticsOf,
  sidebarSemanticsReader,
} from "./sidebar-semantics.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const NEXT_BIN = join(ROOT, "node_modules", "next", "dist", "bin", "next");
const PORT = 4300 + (Math.floor(Math.random() * 400) % 400);
/**
 * THE SHIPPED REFERENCE'S OWN PUBLIC ROUTES, ON ITS OWN DECLARED HOST (GEO-04 C09-R15).
 *
 * Verified first-hand from `deployment/efs/manifest.json` before use, not carried over: every binding of
 * `foundation-publication` has `prefix: []`, `siteMode: "closed"`, `siteIds: ["main"]` and
 * `defaultLocale: "en-001"`, so the locale is the FIRST address segment — `/en-001` and `/en-001/about`.
 *
 * The HOST is part of the proof, not a convenience. The reference's boundary matches the exact `Host`
 * claim, and `localhost` is refused there (a sibling deployment scenario pins that refusal at 404). Driving
 * the real hostname against a local server is the harness's own supported mechanism
 * (`Cdp.connect(chrome, { hostResolverRules })`): the mapping lives only inside this Chrome process and the
 * production hostname dispatch still matches the authored claim, so no alias and no permissive fallback is
 * introduced. The retired `/ww/en` was a legacy Site code that no binding publishes.
 */
const HOST = "foundation-template.provelopment.com";
const BASE = `http://${HOST}:${PORT}`;
const HOME = "/en-001";
const ABOUT = "/en-001/about";

const rows = [];
function check(name, ok, detail = "") {
  rows.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

/**
 * The preference contract, READ FROM THE APP'S OWN SOURCE (the ONE authority, `src/components/ui/sidebar-contract.ts`), so
 * this proof observes exactly what the app writes and cannot agree with a stale copy of a key or a marker.
 */
const PREFERENCE_SOURCE = readFileSync(join(ROOT, "src", "components", "ui", "sidebar-contract.ts"), "utf8");
const KEY = (() => {
  const match = /SIDEBAR_PREFERENCE_STORAGE_KEY\s*=\s*"([^"]+)"/.exec(PREFERENCE_SOURCE);
  if (!match) throw new Error("the sidebar preference key must be declared in @/components/ui/sidebar-contract.ts");
  return match[1];
})();
const BOOT_MARKER = (() => {
  const match = /SIDEBAR_PREFERENCE_ATTRIBUTE\s*=\s*"([^"]+)"/.exec(PREFERENCE_SOURCE);
  if (!match) throw new Error("the sidebar boot marker must be declared in @/components/ui/sidebar-contract.ts");
  return match[1];
})();
/**
 * UI1-A3-A1 — the attribute the CONTROL declares its OPEN-state accessible name in, read from the same
 * authority (so this proof cannot agree with a stale copy of it, exactly like the key and the marker above)
 * by the same shared parser the matrix gate uses. A missing declaration is reported as a FAILING row below,
 * never as a crash here: the proof must be able to run against a candidate that has not declared it yet —
 * that is what makes it a proof.
 */
const OPEN_NAME_ATTRIBUTE = readSemanticsHooks(PREFERENCE_SOURCE).openNameAttribute;
/** The collapsed rail's own width: anything at or below it is the icon column the visitor sees as CLOSED. */
const NARROW_MAX = 64;

/**
 * The recorder: `data-collapsed` writes on a rail (with their value) and `width` transitions on a rail — the
 * same two channels the matrix uses — PLUS, since UI1-A2, the rail's PAINTED geometry per animation frame
 * and the document's boot marker, because the defect this file exists for now includes a FIRST-PAINT defect
 * that no attribute channel can see.
 */
/**
 * UI1-A3 — THE DISCLOSURE CONTROL'S PRESENTED CONTENT, as ONE source string shared by the boot recorder and
 * the runtime reader (they must agree byte-for-byte, so the reader exists once).
 *
 * The rail's own geometry being OPEN was never the whole contract: the control at the top of the rail ALSO
 * presents state — an artwork and a label. UI1-A2's fingerprint ignored both, which is exactly why a
 * stored-OPEN reload could paint the CLOSED-state control and swap it at hydration while every A2 row stayed
 * green. What is read here is what the control PRESENTS (the variant whose computed `display` is not `none`),
 * identified by its stable state-pair hook class and by the asset it actually paints — never by screen
 * coordinates, and never by assuming how many variants the markup contains.
 */
const CONTROL_READER = `const control = (rail) => {
  const toggle = rail.querySelector('.ui-sidebar-toggle');
  if (!toggle) return 'none';
  const icons = [...toggle.querySelectorAll('.ui-sidebar-toggle-icon')];
  // The label hook marks the state PAIR; markup without it (a single, React-chosen label) is read as the one
  // label the control declares, so the reading answers in both worlds.
  const labels = (() => {
    const paired = [...toggle.querySelectorAll('.ui-sidebar-toggle-label')];
    return paired.length > 0 ? paired : [...toggle.querySelectorAll('span')];
  })();
  const presentedIcon = icons.find((el) => getComputedStyle(el).display !== 'none') || null;
  const presentedLabel = labels.find((el) => getComputedStyle(el).display !== 'none') || null;
  const displayed = (els) => els.filter((el) => getComputedStyle(el).display !== 'none').length;
  const variantOf = (el) => !el ? 'none'
    : el.classList.contains('ui-sidebar-toggle-icon-open') || el.classList.contains('ui-sidebar-toggle-label-open') ? 'open'
    : el.classList.contains('ui-sidebar-toggle-icon-closed') || el.classList.contains('ui-sidebar-toggle-label-closed') ? 'closed'
    : 'unpaired';
  const assetOf = (el) => el ? (el.getAttribute('src') || '').replace('/assets/', '') : 'none';
  return [
    'icon=' + assetOf(presentedIcon) + '@' + variantOf(presentedIcon),
    'label=' + (presentedLabel ? '"' + (presentedLabel.textContent || '').trim() + '"' : 'none') + '@' + variantOf(presentedLabel),
    'variants=' + icons.length + 'icon/' + labels.length + 'label',
    'presented=' + displayed(icons) + 'icon/' + displayed(labels) + 'label',
  ].join(' ');
};`;

/**
 * UI1-A3-A1 — THE CONTROL'S SEMANTICS, read by the SHARED reader (tests/browser/sidebar-semantics.mjs).
 *
 * A3 repaired what the control PRESENTS; what it CLAIMS is a second channel. This file shares ONE reader
 * with the matrix gate, so both judge the same facts by the same rule and neither can drift — and the hook
 * names it needs are read from the app's own contract module, never copied.
 */
const SEMANTIC_READER = sidebarSemanticsReader({ marker: BOOT_MARKER, openNameAttribute: OPEN_NAME_ATTRIBUTE });

const RECORDER = `(() => {
  const record = { writes: [], transitions: [], console: [], frames: [], bootFp: null };
  window.__ui1a1 = record;
  const isRail = (el) => !!el && el.nodeType === 1 && typeof el.id === 'string' && el.id.indexOf('shell-sidebar') === 0;
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  ${CONTROL_READER}
  ${SEMANTIC_READER}
  const fingerprint = (rail) => {
    if (!rail) return null;
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const toggle = rail.querySelector('.ui-sidebar-toggle');
    const label = rail.querySelector('.ui-nav-item-label');
    const iconOpen = rail.querySelector('.ui-nav-item-icon-open');
    const iconClosed = rail.querySelector('.ui-nav-item-icon-closed');
    const railCs = cs(rail);
    const toggleCs = cs(toggle);
    const labelCs = cs(label);
    return [
      'railW=' + Math.round(rail.getBoundingClientRect().width),
      'railPad=' + railCs.paddingInlineStart + '/' + railCs.paddingInlineEnd,
      'toggle=' + (toggleCs ? toggleCs.justifyContent + '|' + toggleCs.marginInlineStart + '|' + toggleCs.paddingInlineStart : 'n/a'),
      'label=' + (labelCs ? labelCs.position + '|' + labelCs.clipPath + '|' + Math.round(label.getBoundingClientRect().width) : 'n/a'),
      'listPad=' + cs(rail.querySelector('ul')).paddingInlineStart,
      'icons=' + (cs(iconOpen) ? cs(iconOpen).display : 'n/a') + '/' + (cs(iconClosed) ? cs(iconClosed).display : 'n/a'),
      'control=' + control(rail),
      'sem=' + semanticProjection(rail),
    ].join('  ');
  };
  const sample = () => {
    if (record.frames.length < 200) {
      const desktop = document.querySelector('#shell-sidebar-desktop-rail');
      const rail = shown(desktop) ? desktop : null;
      if (rail && record.bootFp === null) record.bootFp = fingerprint(rail);
      record.frames.push({
        t: Math.round(performance.now()),
        w: desktop ? Math.round(desktop.getBoundingClientRect().width) : null,
        attr: desktop ? desktop.getAttribute('data-collapsed') : null,
        boot: document.documentElement.getAttribute(${JSON.stringify(BOOT_MARKER)}),
        // UI1-A3 — what the disclosure CONTROL presents in this very frame.
        ctl: rail ? control(rail) : null,
        // UI1-A3-A1 — and what it CLAIMS in this very frame (aria-expanded, accessible name, and the
        // declarations those are judged against) — plus the same claims projected to what must be identical
        // between the boot presentation and the hydrated runtime.
        sem: rail ? semantics(rail) : null,
        semFp: rail ? semanticProjection(rail) : null,
      });
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    const result = setAttribute.call(this, name, value);
    try { if (name === 'data-collapsed' && isRail(this)) record.writes.push({ id: this.id, value: String(value), t: Math.round(performance.now()) }); } catch (error) { /* best effort */ }
    return result;
  };
  for (const type of ['transitionrun', 'transitionstart']) {
    document.addEventListener(type, (event) => {
      try { if (event.propertyName === 'width' && isRail(event.target)) record.transitions.push({ id: event.target.id, type, t: Math.round(performance.now()) }); } catch (error) { /* best effort */ }
    }, true);
  }
  for (const level of ['error', 'warn']) {
    const reported = console[level];
    console[level] = function (...args) {
      try { record.console.push(String(args[0])); } catch (error) { /* best effort */ }
      return reported.apply(this, args);
    };
  }
})()`;

const RESET = `(() => { const record = window.__ui1a1; if (!record) return false; record.writes = []; record.transitions = []; record.frames = []; record.bootFp = null; return true; })()`;
const READ = `(() => JSON.stringify(window.__ui1a1 || { writes: [], transitions: [], console: [], frames: [], bootFp: null }))()`;
const STATE = `(() => {
  const shown = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const rail = [document.querySelector('#shell-sidebar-desktop-rail'), document.querySelector('#shell-sidebar-tablet-rail')].find(shown) || null;
  const toggle = rail ? rail.querySelector('.ui-sidebar-toggle') : null;
  return JSON.stringify({
    path: location.pathname,
    collapsed: rail ? rail.getAttribute('data-collapsed') : null,
    expanded: toggle ? toggle.getAttribute('aria-expanded') : null,
    stored: window.localStorage.getItem('foundation.sidebar'),
  });
})()`;

const RUNTIME_FINGERPRINT = `(() => {
  const cs = (el) => (el ? getComputedStyle(el) : null);
  ${CONTROL_READER}
  ${SEMANTIC_READER}
  const rail = document.querySelector('#shell-sidebar-desktop-rail');
  if (!rail) return null;
  const toggle = rail.querySelector('.ui-sidebar-toggle');
  const label = rail.querySelector('.ui-nav-item-label');
  const iconOpen = rail.querySelector('.ui-nav-item-icon-open');
  const iconClosed = rail.querySelector('.ui-nav-item-icon-closed');
  const railCs = cs(rail);
  const toggleCs = cs(toggle);
  const labelCs = cs(label);
  return [
    'railW=' + Math.round(rail.getBoundingClientRect().width),
    'railPad=' + railCs.paddingInlineStart + '/' + railCs.paddingInlineEnd,
    'toggle=' + (toggleCs ? toggleCs.justifyContent + '|' + toggleCs.marginInlineStart + '|' + toggleCs.paddingInlineStart : 'n/a'),
    'label=' + (labelCs ? labelCs.position + '|' + labelCs.clipPath + '|' + Math.round(label.getBoundingClientRect().width) : 'n/a'),
    'listPad=' + cs(rail.querySelector('ul')).paddingInlineStart,
    'icons=' + (cs(iconOpen) ? cs(iconOpen).display : 'n/a') + '/' + (cs(iconClosed) ? cs(iconClosed).display : 'n/a'),
    'control=' + control(rail),
    'sem=' + semanticProjection(rail),
  ].join('  ');
})()`;

/** The control's PRESENTED content as the runtime has it — the reference every boot frame is compared against. */
const RUNTIME_CONTROL = `(() => {
  ${CONTROL_READER}
  const rail = document.querySelector('#shell-sidebar-desktop-rail');
  return rail ? control(rail) : null;
})()`;

/**
 * UI1-A3-A1 — the same facts as the hydrated runtime presents them, plus the two facts the DOM cannot answer
 * on its own: the control's COMPUTED accessible name and expanded state as the browser's own accessibility
 * tree reports them (what a screen reader is actually told), and how many operable disclosure controls the
 * presented rail contains.
 */
const RUNTIME_SEMANTICS = `(() => {
  ${SEMANTIC_READER}
  const rail = document.querySelector('#shell-sidebar-desktop-rail');
  if (!rail) return null;
  return JSON.stringify({
    projection: semanticProjection(rail),
    facts: semanticFacts(rail),
    controls: rail.querySelectorAll('.ui-sidebar-toggle').length,
    // The label the runtime presents, so a boot reading can be compared against the runtime's own copy.
    presentedLabel: semanticFacts(rail) ? semanticFacts(rail).presentedLabel : null,
  });
})()`;

/** The state variant a `control` reading says is PRESENTED (`open` | `closed` | `unpaired` | `none`). */
function presentedIconVariant(reading) {
  const match = /icon=[^@]*@([a-z]+)/.exec(reading ?? "");
  return match ? match[1] : "none";
}

/** How many variants the same reading says are on screen at once. */
function presentedCounts(reading) {
  const match = /presented=(\d+)icon\/(\d+)label/.exec(reading ?? "");
  return match ? { icons: Number(match[1]), labels: Number(match[2]) } : null;
}


async function waitReady(cdp, path = null) {
  const end = Date.now() + READINESS_TIMEOUT_MS;
  let observed = null;
  while (Date.now() < end) {
    observed = await cdp.evaluate(readinessProbeExpression(path === null ? null : { path }));
    if (observed.satisfied) {
      await sleep(HYDRATION_SETTLE_MS);
      return true;
    }
    await sleep(READINESS_POLL_MS);
  }
  return false;
}

const probe = async (cdp) => JSON.parse(await cdp.evaluate(STATE));
const readRecorder = async (cdp) => JSON.parse(await cdp.evaluate(READ));
const resetRecorder = (cdp) => cdp.evaluate(RESET);

/**
 * UI1-A3-A1 — WHAT THE BROWSER'S OWN ACCESSIBILITY TREE SAYS.
 *
 * The rows above judge the facts the tree is COMPUTED from; these judge the tree itself, for the state the
 * visitor is left with: role, COMPUTED accessible name and the `expanded` property, straight from
 * `Accessibility.getPartialAXTree` (the same channel a screen reader consumes). It is the independent
 * confirmation that nothing in the repair traded one contradiction for another — e.g. by making an icon
 * `aria-hidden` while the name moved somewhere else, or by leaving two disclosure controls where one is
 * styled away but still announced.
 */
async function accessibilityRows(cdp, label, expected) {
  const runtime = JSON.parse(await cdp.evaluate(RUNTIME_SEMANTICS));
  const wanted = runtime && runtime.facts ? expectedName(runtime.facts, expected) : null;
  await cdp.send("Accessibility.enable", {});
  const document = await cdp.send("DOM.getDocument", { depth: -1 });
  const found = await cdp.send("DOM.querySelector", {
    nodeId: document.root.nodeId,
    selector: "#shell-sidebar-desktop-rail .ui-sidebar-toggle",
  });
  const tree = await cdp.send("Accessibility.getPartialAXTree", {
    nodeId: found.nodeId,
    fetchRelatives: false,
  });
  const nodes = tree.nodes ?? [];
  const button = nodes.find((entry) => entry.role && entry.role.value === "button") ?? null;
  const properties = new Map(
    ((button && button.properties) || []).map((property) => [property.name, property.value && property.value.value]),
  );
  check(
    `production.accessibility.${label}.role`,
    Boolean(button),
    `roles=${JSON.stringify(nodes.map((entry) => entry.role && entry.role.value))}`,
  );
  check(
    `production.accessibility.${label}.computedName`,
    Boolean(button) && Boolean(wanted) && button.name && button.name.value === wanted,
    `name="${button && button.name ? button.name.value : "none"}" expected="${wanted}"`,
  );
  check(
    `production.accessibility.${label}.computedExpanded`,
    Boolean(button) && properties.has("expanded") && String(properties.get("expanded")) === (expected === "open" ? "true" : "false"),
    `expanded=${String(properties.get("expanded"))}`,
  );
}

/**
 * UI1-A2 — THE FIRST-PAINT CONTRACT OF ONE PRODUCTION-MODE DOCUMENT LOAD, as rows.
 *
 * Judged on what is ON SCREEN: the state painted by the first frame that shows a rail, every painted state
 * of the document, whether the boot presentation is the SAME presentation the runtime presents (labels,
 * icons, control inset, list inset and geometry — not just a width), and whether the boot interval started a
 * width transition. A stored OPEN preference must be on screen from the first painted frame; a stored CLOSED
 * or absent preference must be continuously CLOSED.
 */
async function firstPaintRows(cdp, label, expected) {
  const recorded = await readRecorder(cdp);
  const painted = recorded.frames.filter((frame) => typeof frame.w === "number" && frame.w > 0);
  const states = painted.map((frame) => (frame.w <= NARROW_MAX ? "closed" : "open"));
  const runtime = await probe(cdp);
  check(
    `production.firstPaint.${label}.firstPaintedState`,
    states.length > 0 && states[0] === expected,
    `firstPainted=${states[0] ?? "none"} width=${painted.length ? painted[0].w : "n/a"} widths=${JSON.stringify([...new Set(painted.map((frame) => frame.w))])}`,
  );
  check(
    `production.firstPaint.${label}.neverPaintedOpposite`,
    states.length > 0 && states.every((state) => state === expected),
    `states=${JSON.stringify([...new Set(states)])}`,
  );
  check(
    `production.firstPaint.${label}.startsNoWidthTransition`,
    recorded.transitions.length === 0,
    `transitions=${JSON.stringify(recorded.transitions)}`,
  );
  check(
    `production.firstPaint.${label}.bootPresentationMatchesRuntime`,
    Boolean(recorded.bootFp) && recorded.bootFp === (await cdp.evaluate(RUNTIME_FINGERPRINT)),
    `boot=${recorded.bootFp}`,
  );
  check(
    `production.firstPaint.${label}.stateIsTheStoredPreference`,
    runtime.collapsed === (expected === "open" ? "false" : "true"),
    JSON.stringify(runtime),
  );

  // ── UI1-A3 — THE DISCLOSURE CONTROL IS PART OF THE STATE, NOT A DECORATION ─────────────────────────
  // The owner observed a stored-OPEN reload whose RAIL was continuously open (A2 succeeded) while the
  // control at the top of that rail still flipped its artwork and its label: the canonical CLOSED-state
  // control was painted first and swapped when React adopted the stored preference. These three rows are
  // that defect, measured: what the control PRESENTS must be the state's variant from the first painted
  // frame, it must be the same content the hydrated runtime presents, and exactly one variant may be on
  // screen at a time (never both, never the wrong one).
  const runtimeControl = await cdp.evaluate(RUNTIME_CONTROL);
  const controlFrames = painted.map((frame) => frame.ctl).filter((reading) => typeof reading === "string");
  const expectedVariant = expected === "open" ? "open" : "closed";
  const variants = controlFrames.map(presentedIconVariant);
  check(
    `production.firstPaint.${label}.controlPresentsTheStateVariant`,
    controlFrames.length > 0 && variants.every((variant) => variant === expectedVariant),
    `firstPresented=${variants[0] ?? "none"} variants=${JSON.stringify([...new Set(variants)])}`,
  );
  check(
    `production.firstPaint.${label}.controlContentStableFromFirstFrame`,
    controlFrames.length > 0 && controlFrames.every((reading) => reading === runtimeControl),
    `first=${controlFrames[0] ?? "none"} runtime=${runtimeControl}`,
  );
  const ambiguous = controlFrames
    .map((reading) => ({ reading, counts: presentedCounts(reading) }))
    .filter((entry) => !entry.counts || entry.counts.icons !== 1 || entry.counts.labels > 1);
  check(
    `production.firstPaint.${label}.controlPresentsExactlyOneVariantPerFrame`,
    controlFrames.length > 0 && ambiguous.length === 0,
    ambiguous.length === 0 ? `${controlFrames[0]} (${controlFrames.length} frames)` : JSON.stringify(ambiguous.slice(0, 3)),
  );

  // ── UI1-A3-A1 — AND IT CLAIMS THE SAME STATE ──────────────────────────────────────────────────────
  // Presentation and accessibility are ONE contract: while the rail is presented OPEN, the control must say
  // so — `aria-expanded="true"` and the OPEN action's name — from the FIRST frame the control is on screen,
  // not from the first frame React has committed. That interval is the whole point: a static document paints
  // long before the bundle runs, so a semantic claim that only arrives with hydration is a contradiction
  // every assistive-technology visitor sees. These rows judge the FACTS the accessibility tree is computed
  // from, on every sampled frame, and require the boot reading to be byte-identical to the runtime's own.
  const runtimeSemantics = JSON.parse(await cdp.evaluate(RUNTIME_SEMANTICS));
  const semanticFrames = painted
    .map((frame) => ({ facts: semanticsOf(frame), projection: typeof frame.semFp === "string" ? frame.semFp : null }))
    .filter((frame) => frame.facts !== null);
  const disagreements = semanticFrames
    .map((frame) => semanticsDisagreement(frame.facts, expected))
    .filter((disagreement) => disagreement !== null);
  check(
    `production.firstPaint.${label}.controlSemanticsMatchPresentedState`,
    semanticFrames.length > 0 && disagreements.length === 0,
    disagreements.length === 0
      ? `${JSON.stringify(runtimeSemantics.facts)} (${semanticFrames.length} frames)`
      : `${disagreements.length}/${semanticFrames.length} frames: ${disagreements[0]}`,
  );
  check(
    `production.firstPaint.${label}.neverObservedOppositeSemantics`,
    semanticFrames.length > 0 && semanticFrames.every((frame) => semanticsAgree(frame.facts, expected)),
    `observed=${observedSemantics(semanticFrames.map((frame) => frame.facts))}`,
  );
  check(
    `production.firstPaint.${label}.controlSemanticsStableFromFirstFrame`,
    semanticFrames.length > 0 && semanticFrames[0].projection === runtimeSemantics.projection,
    `first=${semanticFrames[0] ? semanticFrames[0].projection : "none"} runtime=${runtimeSemantics.projection}`,
  );
  check(
    `production.firstPaint.${label}.oneOperableDisclosureControl`,
    runtimeSemantics.controls === 1,
    `controls=${runtimeSemantics.controls}`,
  );
  await accessibilityRows(cdp, label, expected);
  return recorded;
}

/** Stop a server process and wait until it is really gone (the matrix's established hand-over). */
async function stopServer(proc) {
  if (!proc) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      proc.kill("SIGTERM");
    }
  } catch {
    /* already gone */
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (proc.exitCode !== null && proc.exitCode !== undefined) return;
    await sleep(250);
  }
}

/**
 * One bounded request to the LOCAL server under the DECLARED Host.
 *
 * Node has no mapping for the reference's real hostname (only Chrome gets one), so the readiness probe
 * speaks HTTP directly and sends the authored `Host` itself — the same claim the browser will send. A 404
 * here is the boundary refusing a host, which is exactly what must not be mistaken for "not ready yet".
 */
function statusViaDeclaredHost(pathname, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const request = httpRequest(
      { host: "127.0.0.1", port: PORT, path: pathname, method: "GET", headers: { host: HOST } },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy();
      resolve(0);
    });
    request.on("error", () => resolve(0));
    request.end();
  });
}

async function waitForServer(pathname, timeoutMs = 300000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const status = await statusViaDeclaredHost(pathname);
    if (status >= 200 && status < 400) return true;
    await sleep(250);
  }
  return false;
}

/** The control reading of the LAST frame the recorder kept (what the observer last saw the control present). */
function lastControlReading(observed) {
  const readings = (observed.frames ?? []).map((frame) => frame.ctl).filter((reading) => typeof reading === "string");
  return readings.length > 0 ? readings[readings.length - 1] : null;
}

/**
 * One production-mode navigation, judged by the same invariant as the matrix rows: the rail may be
 * replaced, but it may not commit the opposite state and may not start a width transition.
 */
async function continuityLeg(cdp, { label, selector, path, expected, expectedState, closesOnSelection = false }) {
  await resetRecorder(cdp);
  const clicked = await cdp.clickCenter(selector);
  const ready = await waitReady(cdp, path);
  const after = await probe(cdp);
  const observed = await readRecorder(cdp);
  const opposite = observed.writes.filter((write) => write.value !== expectedState);
  check(
    `production.${label}.destination`,
    Boolean(clicked) && ready && after.path === path && after.collapsed === expected,
    JSON.stringify(after),
  );
  check(`production.${label}.commitsNoOppositeState`, opposite.length === 0, `writes=${JSON.stringify(observed.writes)}`);
  if (closesOnSelection) {
    // NAV1D-V2 — THE DELIBERATE CLOSE. Selecting a destination dismisses the expanded OVERLAY, so this
    // interval is ALLOWED to change the presented variant (open → closed) and to animate the width the
    // rail already animates on an explicit toggle. What it must never do is re-open: the close is the
    // last thing that happens to the rail, so the destination page is presented closed.
    const frameVariants = observed.frames.map((frame) => presentedIconVariant(frame.ctl));
    const firstClosedVariant = frameVariants.indexOf("closed");
    check(
      `production.${label}.selectionClosesAndStaysClosed`,
      firstClosedVariant !== -1 && frameVariants.slice(firstClosedVariant).includes("open") === false,
      `variants=${JSON.stringify(frameVariants)}`,
    );
    return observed;
  }
  check(
    `production.${label}.startsNoWidthTransition`,
    observed.transitions.length === 0,
    `transitions=${JSON.stringify(observed.transitions)}`,
  );
  // UI1-A3 — and the control's PRESENTED content never flips to the other state's variant on the way.
  const expectedVariant = expectedState === "false" ? "open" : "closed";
  const controlFrames = observed.frames.map((frame) => frame.ctl).filter((reading) => typeof reading === "string");
  const variants = controlFrames.map(presentedIconVariant);
  check(
    `production.${label}.controlPresentsTheStateVariant`,
    controlFrames.length > 0 && variants.every((variant) => variant === expectedVariant),
    `variants=${JSON.stringify([...new Set(variants)])} frames=${controlFrames.length}`,
  );
  // UI1-A3-A1 — and neither do its CLAIMS: across the whole navigation interval the control must keep
  // announcing the state the visitor is in (a replacement rail may be created, but a rail that arrives
  // claiming the opposite state is the same defect one layer down).
  const expectedSemantics = expectedState === "false" ? "open" : "closed";
  const semanticFrames = observed.frames.map((frame) => semanticsOf(frame)).filter((facts) => facts !== null);
  const disagreements = semanticFrames
    .map((facts) => semanticsDisagreement(facts, expectedSemantics))
    .filter((disagreement) => disagreement !== null);
  check(
    `production.${label}.controlSemanticsMatchPresentedState`,
    semanticFrames.length > 0 && disagreements.length === 0,
    disagreements.length === 0
      ? `${semanticFrames.length} frames continuously ${expectedSemantics}`
      : `${disagreements.length}/${semanticFrames.length} frames: ${disagreements[0]}`,
  );
  return observed;
}
/**
 * One production-mode build, served by `next start`, judged by the same invariant as the matrix rows: during
 * a real navigation the rail may be replaced, but it may not commit the opposite state and may not start its
 * width transition.
 */
async function runProductionContinuity() {
  const chrome = findChrome();
  if (!chrome) throw new Error("no Chrome/Chromium/Edge binary found");

  console.log(`[production-continuity] next build (reference deployment), then next start -p ${PORT}`);
  const build = spawn(process.execPath, [NEXT_BIN, "build"], { cwd: ROOT, stdio: "inherit", windowsHide: true });
  const built = await new Promise((resolve) => build.on("exit", (code) => resolve(code ?? 1)));
  check("production.buildSucceeded", built === 0, `next build exit=${built}`);
  if (built !== 0) return rows;

  // UI1-A3-A1 — the contract that carries the CONTROL's semantics must be declared by the app's own
  // authority, exactly like the storage key and the boot marker above: a candidate that declares none cannot
  // present the OPEN state's name before hydration in the mode where the name is author-supplied.
  check(
    "production.contract.declaresControlOpenNameHook",
    typeof OPEN_NAME_ATTRIBUTE === "string" && OPEN_NAME_ATTRIBUTE.length > 0,
    `attribute=${OPEN_NAME_ATTRIBUTE}`,
  );

  const server = spawn(process.execPath, [NEXT_BIN, "start", "-p", String(PORT)], {
    cwd: ROOT,
    stdio: "ignore",
    windowsHide: true,
  });
  const started = await waitForServer(HOME);
  check("production.servingProductionOutput", started, `${BASE}${HOME}`);
  if (!started) {
    await stopServer(server);
    return rows;
  }

  let cdp = null;
  try {
    cdp = await Cdp.connect(chrome, { hostResolverRules: `MAP ${HOST} 127.0.0.1` });
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER });
    await cdp.setViewport(1280, 900);
    await cdp.navigate(`${BASE}${HOME}`);
    await waitReady(cdp);

    // A defined starting point: no preference, then the visitor's own choice through the real control.
    await cdp.evaluate(`window.localStorage.removeItem(${JSON.stringify(KEY)}); true`);
    await cdp.reload();
    await waitReady(cdp);
    const fresh = await probe(cdp);
    check("production.freshDocumentIsCanonicalClosed", fresh.collapsed === "true" && fresh.stored === null, JSON.stringify(fresh));
    // UI1-A2 — and the canonical document is continuously CLOSED on screen: no OPEN frame, no transition.
    await firstPaintRows(cdp, "noPreference", "closed");

    await resetRecorder(cdp);
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    const opened = await probe(cdp);
    const toggleRecorder = await readRecorder(cdp);
    check(
      "production.explicitToggleOpensAndStillAnimates",
      opened.collapsed === "false" && opened.stored === "open" && toggleRecorder.transitions.length > 0,
      `state=${JSON.stringify(opened)} transitions=${JSON.stringify(toggleRecorder.transitions)}`,
    );
    // UI1-A3 — an explicit toggle is the ONE moment the control's content is ENTITLED to change: it must end
    // on the OPEN state's variant (and the row above keeps that change an animation, never a jump).
    check(
      "production.explicitToggle.openedControlPresentsTheOpenVariant",
      presentedIconVariant(lastControlReading(toggleRecorder)) === "open",
      `control=${lastControlReading(toggleRecorder)}`,
    );
    // UI1-A3-A1 — …and an explicit toggle is likewise the one moment its CLAIMS may change: the runtime must
    // end on the OPEN state's semantics, with the visitor's own choice persisted in the same breath.
    const openedSemantics = JSON.parse(await cdp.evaluate(RUNTIME_SEMANTICS));
    check(
      "production.explicitToggle.openedControlClaimsTheOpenState",
      semanticsAgree(openedSemantics.facts, "open") && opened.stored === "open",
      `semantics=${openedSemantics.projection} stored=${opened.stored}`,
    );

    // ── the owner's defect, judged on production-mode output ──────────────────────────────────────
    // UI1-A2 — FIRST, the whole-document case the owner reported: an actual reload with the preference stored
    // OPEN must present the OPEN rail from its first painted frame, with no CLOSED frame and no boot-induced
    // width transition. This is the production-mode counterpart of the matrix's `firstPaint.*` rows.
    await cdp.reload();
    await waitReady(cdp);
    await firstPaintRows(cdp, "openRefresh", "open");

    // NAV-POLICY — THE ACCEPTED SOURCE CONTRACT, NOT A MEASUREMENT OF CONVENIENCE.
    //
    // `SIDEBAR_SELECTION_POLICY_BY_BAND` is `{ mobile: "close", tablet: "preserve", desktop: "preserve" }` and
    // `closeForSelection` routes through `railDismissesOnSelection`: on this desktop band a destination
    // selection PRESERVES the visitor's preference, so an OPEN rail stays OPEN and only an explicit toggle
    // changes it. Both legs below are therefore run from a VERIFIED OPEN precondition and must end OPEN.
    //
    // R15's own defect, corrected here: it toggled the rail CLOSED between the two legs and then asserted the
    // closed state it had just created — so its `open.aboutToHome` case never had the precondition it claimed,
    // and its "Home behaves differently" reading was an artefact of the test's own setup, not of the product.
    const startsOpen = async (label) => {
      const state = await probe(cdp);
      check(
        `production.${label}.startsOpen`,
        state.collapsed === "false" && state.stored === "open",
        JSON.stringify(state),
      );
      return state;
    };

    await startsOpen("open.homeToAbout");
    await continuityLeg(cdp, { label: "open.homeToAbout", selector: '#shell-sidebar-desktop-rail a[href$="/about"]', path: ABOUT, expected: "false", expectedState: "false" });

    // NO disclosure toggle here: Home is selected from the SAME OPEN preference the visitor set, which is the
    // only way the `preserve` policy can be observed on the second destination.
    await startsOpen("open.aboutToHome");
    await continuityLeg(cdp, { label: "open.aboutToHome", selector: "#shell-sidebar-desktop-rail ul li:first-child a", path: HOME, expected: "false", expectedState: "false" });

    // ── the reciprocal proof for the state that already looked smooth ─────────────────────────────
    // Both selection legs above ended OPEN (policy `preserve`), so the rail is closed DELIBERATELY, once, by a
    // visitor toggle — and only that interval is recorded.
    await resetRecorder(cdp);
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    const closedToggle = await readRecorder(cdp);
    check(
      "production.explicitToggle.closedControlPresentsTheClosedVariant",
      presentedIconVariant(lastControlReading(closedToggle)) === "closed",
      `control=${lastControlReading(closedToggle)}`,
    );
    const closedSemantics = JSON.parse(await cdp.evaluate(RUNTIME_SEMANTICS));
    check(
      "production.explicitToggle.closedControlClaimsTheClosedState",
      semanticsAgree(closedSemantics.facts, "closed") && (await probe(cdp)).stored === "closed",
      `semantics=${closedSemantics.projection}`,
    );
    const closedState = await probe(cdp);
    check(
      "production.closed.homeToAbout.startsClosed",
      closedState.collapsed === "true" && closedState.stored === "closed",
      JSON.stringify(closedState),
    );
    await continuityLeg(cdp, { label: "closed.homeToAbout", selector: '#shell-sidebar-desktop-rail a[href$="/about"]', path: ABOUT, expected: "true", expectedState: "true" });

    // ── the reciprocal whole-document case: a stored CLOSED preference, on an actual reload ───────
    await cdp.reload();
    await waitReady(cdp);
    await firstPaintRows(cdp, "closedRefresh", "closed");

    // ── a route-changing selector while OPEN is the same contract ────────────────────────────────
    //
    // GEO-04 C09-R15: the reference publishes ONE Site (`main`) on every binding, so the retired site
    // selector is gone — replacing it with a `ww` alias or a second Site would be inventing publication
    // authority. The SHIPPED shell still offers its DECLARED locales (`en-001`, `de-DE`), and a language
    // change is the same route-changing interaction: it must land on the declared qualified route, keep the
    // rail's state, commit no opposite state and start no width transition. Absence of the control is a
    // FAILURE here, never a silent pass.
    await cdp.clickCenter("#shell-sidebar-desktop-rail .ui-sidebar-toggle");
    await sleep(250);
    const language = JSON.parse(
      await cdp.evaluate(`(() => {
        const control = document.querySelector('select[data-selector="language"]');
        if (!control) return JSON.stringify({ current: null, next: null });
        const next = [...control.options].map((option) => option.value).find((value) => value !== control.value) ?? null;
        return JSON.stringify({ current: control.value, next: next });
      })()`),
    );
    check(
      "production.selector.languageChangeWhileOpen.hasAnotherDeclaredLocale",
      Boolean(language.next),
      `control=${JSON.stringify(language)}`,
    );
    if (language.next) {
      await resetRecorder(cdp);
      await cdp.evaluate(`(() => {
        const control = document.querySelector('select[data-selector="language"]');
        control.value = ${JSON.stringify(language.next)};
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      })()`);
      const switched = `/${language.next}/about`;
      const ready = await waitReady(cdp, switched);
      const after = await probe(cdp);
      const observed = await readRecorder(cdp);
      check(
        "production.selector.languageChangeWhileOpen.keepsState",
        ready && after.path === switched && after.collapsed === "false",
        JSON.stringify(after),
      );
      check(
        "production.selector.languageChangeWhileOpen.commitsNoOppositeState",
        observed.writes.filter((write) => write.value !== "false").length === 0,
        `writes=${JSON.stringify(observed.writes)}`,
      );
      check(
        "production.selector.languageChangeWhileOpen.startsNoWidthTransition",
        observed.transitions.length === 0,
        `transitions=${JSON.stringify(observed.transitions)}`,
      );
    }

    // ── hydration / console ──────────────────────────────────────────────────────────────────────
    const finalRecorder = await readRecorder(cdp);
    const hydration = finalRecorder.console.filter((message) => /hydrat|did not match|server rendered text|Warning:/i.test(message));
    check("production.console.zeroHydrationWarnings", hydration.length === 0, hydration.join(" | "));
    check("production.console.zeroErrorsAndWarnings", finalRecorder.console.length === 0, finalRecorder.console.join(" | "));
  } finally {
    if (cdp) await cdp.close();
    await stopServer(server);
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await runProductionContinuity();
  const failures = rows.filter((row) => !row.ok);
  console.log(`PRODUCTION-CONTINUITY-TOTAL=${rows.length} PASSED=${rows.length - failures.length} FAILED=${failures.length}`);
  process.exitCode = rows.length > 0 && failures.length === 0 ? 0 : 1;
}
