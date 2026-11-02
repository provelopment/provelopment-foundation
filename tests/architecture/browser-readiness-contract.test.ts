import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  HYDRATION_SETTLE_MS,
  READINESS_POLL_MS,
  READINESS_TIMEOUT_MS,
  readinessFailureMessage,
  readinessProbeExpression,
} from "../browser/readiness.mjs";

/**
 * ONE PAGE, TWO READINESS LAYERS (FOUNDATION-BR1)
 * ===============================================
 *
 * `document ready` and `client navigation committed` are different states, and the browser harness needs
 * both:
 *
 *   · a FULL navigation (`cdp.navigate`) reaches a new page by loading a document, so "the document
 *     finished loading and the shell's chrome is present" is the right thing to await;
 *   · a VISITOR action (a Site, Language or Location choice) navigates WITHOUT a document load, so the
 *     document-level facts are ALREADY TRUE when the transition starts and can never observe it. The only
 *     observable a transition produces is the state the next assertion reads: the resulting route, and
 *     the body that route renders.
 *
 * The historical transient this suite keeps closed: the multisite scenario dispatched a Language choice
 * and probed 400 ms later with the settle-only contract, so whenever the transition had not committed the
 * probe described the PREVIOUS page — two language-switch checks failed naming `/ca/fr/about` while the
 * third (which only required the France marker to be ABSENT) passed against that same stale page. The
 * defect is probabilistic: an unperturbed transition normally commits well inside the settle window, which
 * is why every later full run passed.
 *
 * The stubbed page below is that exact situation, so the semantics are proved WITHOUT a browser: the
 * expressions `readiness.mjs` exports are self-contained, and evaluating them against a stub is the whole
 * contract. The harness itself is asserted to have ONE readiness vocabulary and to await every Site or
 * Language choice with the route its assertion reads (the same source-level style as
 * `browser-execution-ownership.test.ts`).
 */
const ROOT = process.cwd();
const harness = readFileSync(path.join(ROOT, "tests", "browser", "matrix.mjs"), "utf8");

interface StubPage {
  /** The route the browser is on. */
  path: string;
  /** `document.readyState`. */
  readyState: string;
  /** Whether the shell's own chrome is in the DOM. */
  shell: boolean;
  /** `document.body.textContent`. */
  body: string;
}

interface Observation {
  url: string;
  readyState: string;
  shell: boolean;
  expected: boolean;
  satisfied: boolean;
}

/** The page the historical language switch STARTED on. */
const BEFORE_SWITCH: StubPage = {
  path: "/ca/fr/about",
  readyState: "complete",
  shell: true,
  body: "ZZ-CANADA-FRENCH-BODY",
};

/** The page the same switch is supposed to produce. */
const AFTER_SWITCH: StubPage = {
  path: "/ca/en/about",
  readyState: "complete",
  shell: true,
  body: "ZZ-CANADA-ENGLISH-BODY",
};

const EXPECTED_AFTER_SWITCH = { path: "/ca/en/about", body: "ZZ-CANADA-ENGLISH-BODY" };

/** Evaluates one of the module's expressions against a stubbed page. */
function observe(
  page: StubPage,
  expected: { path: string; body?: string | null } | null = null,
): Observation {
  const stubDocument = {
    readyState: page.readyState,
    body: { textContent: page.body },
    querySelector: (selector: string) =>
      page.shell && (selector === "#shell-mobile-nav" || selector === ".ui-shell-bottom-bar")
        ? { selector }
        : null,
  };
  const stubLocation = { pathname: page.path, href: `http://localhost:3800${page.path}` };
  return new Function(
    "document",
    "location",
    `return ${readinessProbeExpression(expected)};`,
  )(stubDocument, stubLocation) as Observation;
}

describe("the document layer and the client-transition layer are different states", () => {
  it("a loaded document with the shell's chrome IS the document layer", () => {
    expect(observe(BEFORE_SWITCH).satisfied).toBe(true);
  });

  it("a document still loading is not ready, and neither is one that never had the shell", () => {
    // The second case is why a timeout must report the observation: a localized 404 or a dev-server
    // error document is "complete" and can never satisfy this layer, whatever the wait's budget.
    expect(observe({ ...BEFORE_SWITCH, readyState: "interactive" }).satisfied).toBe(false);
    expect(observe({ ...BEFORE_SWITCH, shell: false }).satisfied).toBe(false);
  });

  it("the PREVIOUS page of a client transition is entirely ready at the document layer", () => {
    // Exactly the historical probe: ready document, shell present — and the wrong page.
    const stale = observe(BEFORE_SWITCH, EXPECTED_AFTER_SWITCH);
    expect(stale.shell).toBe(true);
    expect(stale.readyState).toBe("complete");
    expect(stale.expected).toBe(false);
    expect(stale.satisfied).toBe(false);
  });

  it("the page the transition produces satisfies the same probe", () => {
    const committed = observe(AFTER_SWITCH, EXPECTED_AFTER_SWITCH);
    expect(committed.expected).toBe(true);
    expect(committed.satisfied).toBe(true);
  });

  it("a committed route with the previous body is not committed either", () => {
    // The body is part of what the assertion reads, so it is part of what is awaited.
    expect(
      observe({ ...AFTER_SWITCH, body: BEFORE_SWITCH.body }, EXPECTED_AFTER_SWITCH).satisfied,
    ).toBe(false);
  });

  it("a route-only expectation is satisfied by the route, without a marker", () => {
    expect(observe({ ...AFTER_SWITCH, body: "" }, { path: "/ca/en/about" }).satisfied).toBe(true);
  });
});

describe("the budget is the harness's established bound, not a raised one", () => {
  it("keeps the 20s readiness budget, the 200ms poll and the 400ms settle", () => {
    // BR1's repair changes WHAT is awaited, never HOW LONG: a raised timeout would mask nondeterminism
    // instead of removing it, and the observed stale window is not a budget question at all.
    expect(READINESS_TIMEOUT_MS).toBe(20000);
    expect(READINESS_POLL_MS).toBe(200);
    expect(HYDRATION_SETTLE_MS).toBe(400);
  });
});

describe("a readiness failure says what was awaited and what was observed", () => {
  it("names the awaited route and the document it saw, instead of claiming a cause", () => {
    const message = readinessFailureMessage(
      observe(BEFORE_SWITCH, EXPECTED_AFTER_SWITCH),
      EXPECTED_AFTER_SWITCH,
    );
    expect(message).toContain("/ca/en/about");
    expect(message).toContain("ZZ-CANADA-ENGLISH-BODY");
    expect(message).toContain("http://localhost:3800/ca/fr/about");
    expect(message).toContain('readyState="complete"');
    expect(message).toContain("20000");
    // The historical message asserted a hydration cause this harness cannot establish.
    expect(message).not.toMatch(/hydrat/i);
  });

  it("reports the document layer, and an absent observation, without inventing one", () => {
    const documentLayer = readinessFailureMessage(observe({ ...BEFORE_SWITCH, shell: false }), null);
    expect(documentLayer).toContain("shell");
    expect(documentLayer).toContain("shell=false");
    expect(documentLayer).not.toMatch(/hydrat/i);
    expect(readinessFailureMessage(null)).toContain("no observation was taken");
  });
});

describe("the harness keeps ONE readiness vocabulary", () => {
  it("evaluates the module's expression and keeps no second copy of the conditions", () => {
    expect(harness).toContain('from "./readiness.mjs"');
    expect(harness).toContain("readinessProbeExpression(expected)");
    expect(harness).toContain("readinessFailureMessage(observed, expected)");
    // The document-level condition lives in the module only.
    expect(harness).not.toMatch(/rd === 'complete' && \(t \|\| b\)/);
  });

  it("awaits the resulting route after every Site or Language choice", () => {
    const lines = harness.split(/\r?\n/);
    const transitions = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => /await cdp\.evaluate\(multisiteChoose\("(site|language)"/.test(line));
    // The multisite scenario's client ROUTE transitions are its LANGUAGE choices: two of them, one into the
    // second qualified locale and one back (GEO-04 C09-R13). There is no Site transition to count any more —
    // each Site is published behind its OWN closed single-Site binding, so a Site "switch" is not an
    // interaction this model offers, and requiring one would re-introduce the geography this stage retires.
    // The per-transition loop below is unchanged and remains the guard's real protection: whatever
    // transitions exist must await the route they produce.
    expect(transitions.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((line) => /await cdp\.evaluate\(multisiteChoose\("site"/.test(line))).toBe(false);
    for (const { line, index } of transitions) {
      const next = lines.slice(index + 1, index + 4).find((candidate) => candidate.includes("waitReady("));
      expect(next, `after ${line.trim()}`).toBeDefined();
      expect(next, `after ${line.trim()}`).toMatch(/waitReady\(cdp, \{/);
    }
    // A Layout choice changes presentation, not the route: it is not a transition and is not awaited as
    // one (React flushes a discrete change event before the next evaluation, so there is no window).
    expect(lines.some((line) => /multisiteChoose\("layout"/.test(line))).toBe(true);
  });

  it("waits for a DESCRIPTOR's own publication, never materialising a generic Installation beside it", () => {
    // GEO-04 C09-R19: an `efsInstallation` descriptor is the caller's Installation. The harness must not also
    // build its own throwaway one — it would be served by nothing, owned by nobody and still have to be cleaned.
    expect(harness).toContain('const generic = synthetic && deploymentRoot === null && efsInstallation === null;');
    // The descriptor branch still selects the DESCRIPTOR's environment, in that order.
    expect(harness).toContain("installationEnvironment(efsInstallation)");
  });
});
