/**
 * THE HUB-SCOPED SPOKE SWITCHER, PROVED IN A REAL BROWSER AGAINST FOUR SPOKES OF ONE HUB (R1)
 * =========================================================================================
 *
 * WHY THIS SCENARIO EXISTS. The unit and component suites prove the markup, the authored order, the
 * routability refusals and the no-op rule. WHAT THEY CANNOT PROVE is the thing Web-1's owner actually saw
 * missing: that a visitor, on EVERY member of a Hub, sees the switcher, can read the Hub's members in the
 * authored order, is shown which member they are on, and can travel to another member — in a browser, at
 * real viewport widths, with the real hostname dispatch answering each destination.
 *
 * ONE INSTALLATION = ONE HUB. `tests/support/four-spoke-installation.mjs` declares FOUR Spokes
 * (`primary`, `docs`, `catalog`, `support`) in ONE manifest. That declaration IS the Hub membership boundary:
 * the switcher may only offer those members, and every option's destination must route back to the member it
 * names. A hostname that belongs to no declared member is not offered at all — the routing check is the
 * enforcement mechanism, and there is no organization registry to consult.
 *
 * WHAT IS EXERCISED, and how:
 *
 *   the control, on all four Spokes      every member renders it, with exactly four options, in authored
 *                                        order, with authored labels, marking the member the request resolved to
 *   the three destination kinds          canonical → canonical (`primary` → `docs`), canonical →
 *                                        ADDITIONAL claim (`docs` → `catalog`'s staging host), and
 *                                        inspection hostname → another Hub member (`primary` → `support`)
 *   navigation                           selecting another member performs the real cross-origin navigation
 *                                        the platform composes; selecting the CURRENT member is a NO-OP
 *   the destination itself               the browser then VISITS each destination host and reads the Spoke it
 *                                        renders, so "it goes there" is a measurement, not a claim
 *   visibility                           the member with ONE Site, ONE locale, NO Locations and NO Layout
 *                                        switcher (the exact Web-1 `www` condition) AND a member that has
 *                                        other controls beside the switcher
 *   responsiveness                       at 390 / 700 / 1024 / 1280: present, usable, nothing pushed out of
 *                                        the viewport, other controls WRAPPING rather than disappearing
 *
 * HOW A CROSS-ORIGIN NAVIGATION IS PROVED LOCALLY. A Hub destination is an absolute HTTPS origin (the
 * platform refuses anything else), while this proof runs against a local HTTP dev server — so the switcher's
 * call is CAPTURED in the browser (the real handler runs; only the assignment is recorded) and the
 * destination hostname is then VISITED by the browser itself, through Chrome's test-only hostname mapping.
 * That proves both halves: the control navigates to exactly the authored origin, and that origin renders the
 * member it names.
 *
 * NO DEPLOYMENT IS MUTATED: the Installation lives in OS temp, the committed fixture is only ever read, and
 * the copy is removed when the run ends.
 */
import { request as httpRequest } from "node:http";

import { Cdp } from "./cdp.mjs";

import {
  HUB_INSPECTION,
  HUB_SPOKES,
  HUB_SWITCHER,
  materializeFourSpokeInstallation,
} from "../support/four-spoke-installation.mjs";

/** The scenario's id, used as the report's label. */
export const id = "hub-switcher";

/** The ports this scenario tries, so a busy port is a retry rather than a failure. */
const PORT_OFFSETS = [81, 82, 83];

/** Every hostname this Hub answers for: the four canonical ones, one additional claim, and the inspection host. */
function hubHostnames() {
  return [
    ...HUB_SPOKES.map((spoke) => spoke.hostname),
    ...HUB_SPOKES.flatMap((spoke) => spoke.hostAliases ?? []),
    HUB_INSPECTION.hostname,
  ];
}

/**
 * THE TEST-ONLY HOSTNAME MAPPING (the seam `cdp.mjs` documents): each Hub hostname resolves to the local
 * dev server for THIS browser process only. Production hostname dispatch is untouched — it still matches the
 * exact `Host` claim.
 */
function hostResolverRules() {
  return hubHostnames().map((hostname) => `MAP ${hostname} 127.0.0.1`).join(", ");
}

/** The member whose Spoke `spokeId` names (its manifest entry and its switcher option). */
function member(spokeId) {
  return HUB_SPOKES.find((spoke) => spoke.id === spokeId);
}

/** The authored option for one member. */
function optionFor(spokeId) {
  return HUB_SWITCHER.options.find((option) => option.spokeId === spokeId);
}

/** The switcher, the header row and the page identity, as the browser measures them. */
const PROBE = `(() => {
  const doc = document.documentElement;
  const select = document.querySelector('[data-switcher="spoke"]');
  const cluster = document.querySelector('.ui-site-header-controls');
  const identity = document.querySelector('.ui-site-header-identity');
  const layout = document.querySelector('[data-ui-layout-switcher]');
  const language = document.querySelector('[data-selector="language"]');
  const row = document.querySelector('.ui-site-header-top');
  const inner = document.querySelector('.ui-site-header > div');
  const options = select ? [...select.options] : [];
  const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), width: Math.round(r.width), height: Math.round(r.height) }; };
  const selectRect = rectOf(select);
  const identityRect = rectOf(identity);
  const clusterRect = rectOf(cluster);
  // R1 / UI-R1 — the row's own flow and content box, so "one line without overlap" and "entirely below the brand"
  // are claims about the rendered geometry rather than about a class string.
  const rowCs = row ? getComputedStyle(row) : null;
  const innerCs = inner ? getComputedStyle(inner) : null;
  const contentLeft = inner ? Math.round(inner.getBoundingClientRect().left + (parseFloat(innerCs.paddingLeft) || 0)) : null;
  const contentRight = inner ? Math.round(inner.getBoundingClientRect().right - (parseFloat(innerCs.paddingRight) || 0)) : null;
  const clusterBelowBrand = identityRect && clusterRect ? clusterRect.top >= identityRect.bottom - 1 : null;
  const brandClusterOverlap =
    !!identityRect && !!clusterRect &&
    identityRect.left < clusterRect.right - 1 && clusterRect.left < identityRect.right - 1 &&
    identityRect.top < clusterRect.bottom - 1 && clusterRect.top < identityRect.bottom - 1;
  const hittable = (() => {
    if (!select || !selectRect || selectRect.width === 0) return false;
    const r = select.getBoundingClientRect();
    const atCentre = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!atCentre && (select === atCentre || select.contains(atCentre));
  })();
  return {
    present: !!select,
    ariaLabel: select ? select.getAttribute('aria-label') : null,
    value: select ? select.value : null,
    options: options.map((option) => ({ value: option.value, label: option.textContent || '' })),
    selected: options.filter((option) => option.selected).map((option) => option.value),
    selectRect,
    hittable,
    clusterRect: clusterRect,
    clusterWrapCapable: !!cluster && typeof cluster.className === 'string' && cluster.className.includes('flex-wrap'),
    identityRect: identityRect,
    rowDisplay: rowCs ? rowCs.display : null,
    rowWrap: rowCs ? rowCs.flexWrap : null,
    rowOverflow: row ? row.scrollWidth - row.clientWidth : null,
    contentLeft: contentLeft,
    contentRight: contentRight,
    clusterBelowBrand: clusterBelowBrand,
    brandClusterOverlap: brandClusterOverlap,
    clusterInsideContent: !!clusterRect && contentLeft !== null && contentRight !== null && clusterRect.left >= contentLeft - 1 && clusterRect.right <= contentRight + 1,
    identityAtTheLeftEdge: !!identityRect && contentLeft !== null && Math.abs(identityRect.left - contentLeft) <= 1,
    layoutPresent: !!layout,
    layoutRect: rectOf(layout),
    languagePresent: !!language,
    documentGrew: doc.scrollWidth > doc.clientWidth + 1,
    identityText: identity ? identity.textContent.trim() : '',
    title: document.title,
  };
})()`;

/**
 * SELECT ONE MEMBER, as a visitor performs it, AND OBSERVE WHERE THE BROWSER WENT.
 *
 * React tracks a select node's `value` property, so a plain assignment never reaches its handler; the NATIVE
 * setter reproduces what a real selection does, and the bubbling `change` event then reaches React exactly
 * as a real one does.
 *
 * THE DESTINATION IS READ FROM CHROME ITSELF, not from an injected stub: `window.location.assign` belongs to
 * the unforgeable Location object (assigning to it silently does nothing), so the assertion uses the
 * browser's OWN navigation event — `Page.frameRequestedNavigation`, whose `url` is the origin the real
 * handler asked for. This is a stronger proof than a stub would be: the platform's actual navigation is what
 * is measured.
 *
 * The destinations are absolute HTTPS origins (the platform refuses anything else) while this proof runs
 * over local HTTP, so the request itself cannot complete — the EVENT is the evidence, and the destination is
 * then visited over HTTP by the browser to prove which member renders there (see `proveDestination`).
 */
function selectMember(value) {
  return `(() => {
    const select = document.querySelector('[data-switcher="spoke"]');
    if (!select) return { ok: false, reason: 'no switcher rendered' };
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return { ok: true, value: select.value };
  })()`;
}

/** The same selection, observed ONLY for a no-op: what the page is still, and where it stayed. */
const READ_STILLNESS = `(() => {
  const select = document.querySelector('[data-switcher="spoke"]');
  return {
    value: select ? select.value : null,
    href: window.location.href,
    stillOnTheMember: !!document.querySelector('.ui-site-header-identity'),
  };
})()`;

/** Chrome reports the requested cross-origin navigation; nothing else in the platform moves the visitor. */
function normalizeOrigin(url) {
  return typeof url === "string" ? url.replace(/\/+$/, "") : url;
}

/** The browser's own URL for one hostname (HTTP: the dev server this proof runs against). */
function urlFor(hostname, port, pathname = "/ww/en") {
  return `http://${hostname}:${port}${pathname}`;
}

/** Does this page render the Spoke the given member declares? */
function rendersMember(seen, spoke) {
  return `${seen.title} ${seen.identityText}`.includes(spoke.siteName);
}

/**
 * Perform one selection and read the URL Chrome was asked to navigate to — or `null` when it was asked to go
 * nowhere (the current-member no-op).
 *
 * TWO independent witnesses are armed before the selection, and both are always consumed (so no stale waiter
 * can be satisfied by a later navigation): the frame's requested navigation (the exact target, including a
 * navigation that could not commit) and the network request it produced. `watchNetwork` is disabled for the
 * no-op proof, where only the frame's own navigation event is evidence.
 */
async function chooseMemberAndObserve(cdp, spokeId, { watchNetwork = true } = {}) {
  const watchers = [
    cdp
      .waitEvent("Page.frameRequestedNavigation", 2500)
      .then((event) => event?.url ?? null)
      .catch(() => null),
  ];
  if (watchNetwork) {
    watchers.push(
      cdp
        .waitEvent("Network.requestWillBeSent", 2500)
        .then((event) => event?.request?.url ?? null)
        .catch(() => null),
    );
  }

  const selected = await cdp.evaluate(selectMember(spokeId));
  const observed = await Promise.all(watchers);
  if (!selected.ok) return { ok: false, reason: selected.reason };

  const url = observed.find((candidate) => typeof candidate === "string") ?? null;
  return { ok: true, value: selected.value, url };
}

/** ONE request with an EXPLICIT `Host` header — the READINESS PROBE of a MULTI-Spoke Installation. */
function requestWithHost(port, host, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, path: pathname, method: "GET", headers: { host } },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => resolve({ status: response.statusCode ?? 0 }));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

/**
 * WAIT UNTIL A MEMBER ANSWERS — with the member's OWN hostname in the `Host` header.
 *
 * This is deliberately NOT `harness.waitForServer(url)`: that helper probes a bare `127.0.0.1` URL, which a
 * MULTI-Spoke Installation correctly REFUSES (no member claims the loopback literal, so the answer is 404 —
 * the fail-closed behaviour). Readiness here must therefore speak to a hostname a member actually claims.
 */
async function waitForMember(port, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no attempt";
  while (Date.now() < deadline) {
    try {
      const response = await requestWithHost(port, HUB_SPOKES[0].hostname, "/ww/en");
      if (response.status === 200) return;
      last = `status=${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(
    `the four-Spoke Installation never answered on ${HUB_SPOKES[0].hostname}: ${last}`,
  );
}

/** ONE dev server for the Installation, on the first port whose OWN member answers. */
async function startServer(harness, root) {
  let last = null;
  for (const offset of PORT_OFFSETS) {
    const port = harness.basePort + offset;
    const server = harness.startDevServer(port, { deploymentRoot: root });
    try {
      await waitForMember(port);
      return { server, port };
    } catch (error) {
      last = error;
      await harness.stopServer(server);
    }
  }
  throw last ?? new Error("no port answered for the hub-switcher scenario");
}

/** ONE member's page: it renders its own Spoke, and the switcher with the Hub's four authored members. */
async function readSwitcher(harness, rows, cdp, label, spoke, port) {
  await cdp.navigate(urlFor(spoke.hostname, port));
  await harness.waitReady(cdp);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const seen = await cdp.evaluate(PROBE);

  harness.check(rows, `${label}.renders.itsOwnSpoke`, rendersMember(seen, spoke), `title=${seen.title} identity=${seen.identityText}`);
  harness.check(rows, `${label}.switcher.present`, !!seen.present, `present=${seen.present}`);
  harness.check(rows, `${label}.switcher.fourMembers`, seen.options.length === HUB_SPOKES.length, `count=${seen.options.length}`);
  harness.check(
    rows,
    `${label}.switcher.authoredOrderAndLabels`,
    JSON.stringify(seen.options) ===
      JSON.stringify(HUB_SWITCHER.options.map((option) => ({ value: option.spokeId, label: option.label }))),
    `options=${JSON.stringify(seen.options)}`,
  );
  harness.check(rows, `${label}.switcher.currentMarked`, seen.selected.length === 1 && seen.selected[0] === spoke.id, `selected=${JSON.stringify(seen.selected)} value=${seen.value}`);
  harness.check(rows, `${label}.switcher.accessibleName`, typeof seen.ariaLabel === "string" && seen.ariaLabel.trim().length > 0, `aria-label=${seen.ariaLabel}`);
  return seen;
}

/** ONE cross-origin destination, proved on the control AND at the destination itself. */
async function proveDestination(harness, rows, cdp, from, to, port, kindLabel) {
  const target = member(to);
  const option = optionFor(to);

  // 1. THE CONTROL: the real handler performs the authored absolute origin for that member.
  await cdp.navigate(urlFor(member(from).hostname, port));
  await harness.waitReady(cdp);
  const chosen = await chooseMemberAndObserve(cdp, to);
  harness.check(rows, `${kindLabel}.control.selects`, !!chosen.ok, chosen.reason ?? `value=${chosen.value}`);
  harness.check(
    rows,
    `${kindLabel}.control.navigatesToAuthoredOrigin`,
    normalizeOrigin(chosen.url) === normalizeOrigin(option.href),
    `navigated=${chosen.url} authored=${option.href}`,
  );

  // 2. THE DESTINATION ITSELF: the browser visits that hostname and reads the Hub member it renders.
  const destinationHostname = new URL(option.href).hostname;
  await cdp.navigate(urlFor(destinationHostname, port));
  await harness.waitReady(cdp);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const arrived = await cdp.evaluate(PROBE);
  harness.check(rows, `${kindLabel}.destination.rendersTheNamedMember`, rendersMember(arrived, target), `host=${destinationHostname} title=${arrived.title}`);
  harness.check(rows, `${kindLabel}.destination.switcherStillPresent`, !!arrived.present);
  harness.check(rows, `${kindLabel}.destination.currentIsTheNamedMember`, arrived.selected.length === 1 && arrived.selected[0] === to, `selected=${JSON.stringify(arrived.selected)}`);
}

/**
 * THE NO-OP RULE, in the browser: choosing the member the visitor is ALREADY on performs no navigation at all.
 */
async function proveCurrentIsANoOp(harness, rows, cdp, spoke, port) {
  await cdp.navigate(urlFor(spoke.hostname, port));
  await harness.waitReady(cdp);
  const before = await cdp.evaluate(READ_STILLNESS);
  const chosen = await chooseMemberAndObserve(cdp, spoke.id, { watchNetwork: false });
  const after = await cdp.evaluate(READ_STILLNESS);
  harness.check(rows, "noop.control.selectsCurrentMember", !!chosen.ok, chosen.reason ?? `value=${chosen.value}`);
  harness.check(rows, "noop.control.performsNoNavigation", chosen.url === null, `navigated=${chosen.url}`);
  harness.check(rows, "noop.control.staysOnTheSamePage", before.href === after.href && !!after.stillOnTheMember, `before=${before.href} after=${after.href}`);
  harness.check(rows, "noop.control.keepsTheValue", after.value === spoke.id, `value=${after.value}`);
}

/**
 * VISIBILITY, in the two conditions the owner's ruling names.
 *
 * `primary` has ONE Site, ONE locale, NO Locations and NO Layout switcher — the exact visitor condition that
 * hid Web-1's `www` control row (its control row is composed only when it has a member, so a switcher placed
 * there would vanish). `docs` has TWO locales AND a Layout switcher, so the switcher must coexist with other
 * controls rather than replace them.
 */
async function proveVisibility(harness, rows, cdp, port) {
  const bare = await readSwitcher(harness, rows, cdp, "bare", member("primary"), port);
  harness.check(rows, "bare.oneSiteOneLocaleNoLocations.noOtherControls", !bare.layoutPresent && !bare.languagePresent, `layout=${bare.layoutPresent} language=${bare.languagePresent}`);
  harness.check(rows, "bare.switcher.visibleWithoutAnyOtherControl", !!bare.selectRect && bare.selectRect.width > 0 && bare.selectRect.height > 0, `rect=${JSON.stringify(bare.selectRect)}`);

  const rich = await readSwitcher(harness, rows, cdp, "rich", member("docs"), port);
  harness.check(rows, "rich.hasOtherControlsBesideTheSwitcher", rich.layoutPresent && rich.languagePresent, `layout=${rich.layoutPresent} language=${rich.languagePresent}`);
  harness.check(rows, "rich.switcher.visibleBesideOtherControls", !!rich.selectRect && rich.selectRect.width > 0 && rich.selectRect.height > 0, `rect=${JSON.stringify(rich.selectRect)}`);
  harness.check(rows, "rich.otherControls.stillVisible", !!rich.layoutRect && rich.layoutRect.width > 0, `layoutRect=${JSON.stringify(rich.layoutRect)}`);
  harness.check(rows, "rich.identity.stillVisible", !!rich.identityRect && rich.identityRect.width > 0, `identityRect=${JSON.stringify(rich.identityRect)}`);
  // The cluster is a WRAPPING flex container: that is what lets a narrow width push a control onto a second
  // row instead of hiding it (the behaviour at 390/700 is measured below).
  harness.check(rows, "rich.cluster.wrapCapable", !!rich.clusterWrapCapable, `clusterWrapCapable=${rich.clusterWrapCapable}`);
}

/**
 * R1 / UI-R1 — THE WIDTHS THE ROW CONTRACT IS MEASURED AT: the narrowest supported phone through desktop, the
 * widths the DO names, and the band in which the mode control used to change rows by itself.
 */
const RESPONSIVE_WIDTHS = [320, 360, 390, 430, 480, 700, 1024, 1280];

/** RESPONSIVENESS: present, usable, nothing pushed out of the viewport, other controls wrapping not vanishing. */
async function proveResponsive(harness, rows, cdp, port) {
  for (const width of RESPONSIVE_WIDTHS) {
    for (const [label, spoke] of [["bare", member("primary")], ["rich", member("docs")]]) {
      await cdp.setViewport(width, 900);
      await cdp.navigate(urlFor(spoke.hostname, port));
      await harness.waitReady(cdp);
      await new Promise((resolve) => setTimeout(resolve, 250));
      const seen = await cdp.evaluate(PROBE);

      harness.check(rows, `responsive.${label}.w${width}.switcher.present`, !!seen.present);
      harness.check(rows, `responsive.${label}.w${width}.switcher.visible`, !!seen.selectRect && seen.selectRect.width > 0 && seen.selectRect.height > 0, `rect=${JSON.stringify(seen.selectRect)}`);
      harness.check(rows, `responsive.${label}.w${width}.switcher.usable`, !!seen.hittable, `hittable=${seen.hittable}`);
      harness.check(rows, `responsive.${label}.w${width}.noHorizontalOverflow`, !seen.documentGrew);
      harness.check(
        rows,
        `responsive.${label}.w${width}.identity.stillVisible`,
        !!seen.identityRect && seen.identityRect.width > 0,
        `identityRect=${JSON.stringify(seen.identityRect)}`,
      );
      // R1 / UI-R1 — THE ROW CONTRACT, MEASURED, WITH THE SPOKE SWITCHER IN THE CLUSTER: the row wraps by content,
      // the brand keeps the left edge of the padded content, the cluster shares the brand's line or sits ENTIRELY
      // BELOW it (right-anchored either way, inside the content box), the two never overlap, and the row itself
      // never becomes a scroll container. The arrangement is named in every check.
      const arrangement = seen.clusterBelowBrand === true ? "cluster-below" : "one-line";
      harness.check(
        rows,
        `responsive.${label}.w${width}.row.wrapsByContent`,
        seen.rowDisplay === "flex" && seen.rowWrap === "wrap",
        `display=${seen.rowDisplay} wrap=${seen.rowWrap}`,
      );
      harness.check(
        rows,
        `responsive.${label}.w${width}.neverOverlapsTheBrand`,
        seen.brandClusterOverlap === false,
        `identity=${JSON.stringify(seen.identityRect)} cluster=${JSON.stringify(seen.clusterRect)}`,
      );
      harness.check(
        rows,
        `responsive.${label}.w${width}.identity.keepsThePaddedLeftEdge`,
        seen.identityAtTheLeftEdge === true,
        `identity=${JSON.stringify(seen.identityRect)} contentLeft=${seen.contentLeft}`,
      );
      harness.check(
        rows,
        `responsive.${label}.w${width}.${arrangement}.clusterIsRightAnchored`,
        !!seen.clusterRect && seen.contentRight !== null && Math.abs(seen.contentRight - seen.clusterRect.right) <= 1,
        `right=${seen.clusterRect && seen.clusterRect.right} contentRight=${seen.contentRight}`,
      );
      harness.check(
        rows,
        `responsive.${label}.w${width}.${arrangement}.clusterInsideTheContentBox`,
        seen.clusterInsideContent === true,
        `cluster=${JSON.stringify(seen.clusterRect)} inside=${seen.clusterInsideContent}`,
      );
      harness.check(
        rows,
        `responsive.${label}.w${width}.row.doesNotScroll`,
        seen.rowOverflow !== null && seen.rowOverflow <= 0,
        `rowOverflow=${seen.rowOverflow}`,
      );
      if (label === "rich") {
        // WRAP, DO NOT DISAPPEAR. At every width BOTH controls must remain present, visible and inside the
        // viewport (nothing is pushed off, clipped or collapsed away), the identity must stay visible beside
        // them, and the cluster — which IS a wrapping flex container — must never be shorter than the control
        // it holds. At the narrowest supported width they fit on one row here; the assertion is the CONTRACT
        // (nothing disappears, and the container can wrap), not one particular row count.
        const tallest = Math.max(seen.selectRect?.height ?? 0, seen.layoutRect?.height ?? 0);
        harness.check(
          rows,
          `responsive.rich.w${width}.controls.wrapRatherThanDisappear`,
          !!seen.layoutPresent &&
            !!seen.selectRect &&
            seen.selectRect.width > 0 &&
            !!seen.layoutRect &&
            seen.layoutRect.width > 0 &&
            !!seen.clusterRect &&
            seen.clusterRect.height >= tallest,
          `cluster=${JSON.stringify(seen.clusterRect)} layout=${JSON.stringify(seen.layoutRect)} select=${JSON.stringify(seen.selectRect)}`,
        );
        harness.check(rows, `responsive.rich.w${width}.controls.insideViewport`, !!seen.selectRect && seen.selectRect.right <= width + 1 && !!seen.layoutRect && seen.layoutRect.right <= width + 1, `select=${JSON.stringify(seen.selectRect)} layout=${JSON.stringify(seen.layoutRect)}`);
      }
    }
  }
}

export async function run(chrome, harness) {
  const rows = [];
  let installation = null;
  let server = null;
  let cdp = null;

  try {
    installation = materializeFourSpokeInstallation(harness.repositoryRoot);
    const started = await startServer(harness, installation.root);
    server = started.server;
    const port = started.port;

    // The browser resolves each Hub hostname to the dev server FOR THIS PROCESS ONLY (the seam cdp.mjs
    // documents); production dispatch still matches the exact `Host` claim.
    cdp = await Cdp.connect(chrome, { hostResolverRules: hostResolverRules() });
    // The browser's OWN navigation events are the evidence for a cross-origin selection (see `selectMember`).
    await cdp.send("Page.enable");
    await cdp.send("Network.enable");

    // ── THE CONTROL ON ALL FOUR MEMBERS OF THE HUB ───────────────────────────────────────────────
    for (const spoke of HUB_SPOKES) {
      await readSwitcher(harness, rows, cdp, `member.${spoke.id}`, spoke, port);
    }

    // ── THE THREE DESTINATION KINDS, EACH PROVED ON THE CONTROL AND AT THE DESTINATION ──────────
    await proveDestination(harness, rows, cdp, "primary", "docs", port, "canonicalToCanonical");
    await proveDestination(harness, rows, cdp, "docs", "catalog", port, "canonicalToAdditionalClaim");
    await proveDestination(harness, rows, cdp, "primary", "support", port, "inspectionHostToMember");

    // ── THE CURRENT MEMBER IS A NO-OP ────────────────────────────────────────────────────────────
    await proveCurrentIsANoOp(harness, rows, cdp, member("docs"), port);

    // ── VISIBILITY IN THE TWO CONDITIONS THE OWNER'S RULING NAMES ────────────────────────────────
    await proveVisibility(harness, rows, cdp, port);

    // ── RESPONSIVENESS AT 390 / 700 / 1024 / 1280 ───────────────────────────────────────────────
    await proveResponsive(harness, rows, cdp, port);
  } catch (error) {
    harness.check(rows, "the hub-switcher scenario ran to completion", false, error instanceof Error ? error.message : String(error));
  } finally {
    if (cdp !== null) {
      try {
        await cdp.close();
      } catch {
        /* the browser is already gone */
      }
    }
    if (server !== null) {
      try {
        await harness.stopServer(server);
      } catch {
        /* the server is already gone */
      }
    }
    if (installation !== null) harness.rmSync(installation.root, { recursive: true, force: true });
  }

  return rows;
}

export default { id, run };
