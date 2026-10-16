import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/*
 * NAV1B — THE HEADER'S TWO SEMANTIC ROWS, AS MARKUP.
 *
 * The reported defect was that the header had ONE wrapping row, so a control's position depended on
 * the width of the controls beside it: the sidebar disclosure travelled between header lines (and
 * grew with the header's typography), and the contextual dropdowns changed rows with the viewport.
 * The contract these assertions pin is ownership, not styling: the TOP row owns the identity and
 * the navigation-MODE selector (anchored right), the SECOND row owns every other contextual
 * control, and neither assignment changes at a breakpoint.
 *
 * The static-render idiom matches the shell suites: the client controls beside the header call hooks
 * with no context under `renderToStaticMarkup`, so they are stubbed (no browser dependency). The
 * GEOMETRY those rows produce is proven in the browser matrix.
 */
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [value, () => undefined];
    },
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/en",
}));

import { SiteHeader } from "@/components/site/site-header";
import { resolveUiConfig, type UiConfigInput } from "@/core/ui";

import { compatibilityChrome } from "../support/compatibility-chrome";

/** The stylesheet, for the graphic-identity contract's scoping guard. */
const GLOBALS_SOURCE = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** The header module itself, for the ownership contracts that are structural (guarded rows). */
const HEADER_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "components", "site", "site-header.tsx"),
  "utf8",
);

const headerHtml = (ui: UiConfigInput) =>
  renderToStaticMarkup(
    SiteHeader({ ...compatibilityChrome(), locale: "en", resolved: resolveUiConfig(ui) }),
  );

/** The switcher enabled → the visitor has MORE than one effective presentation to choose from. */
const switcherOn = headerHtml({ layoutSwitcher: { enabled: true } });
/** The switcher absent → exactly ONE effective option, so no selector may render. */
const switcherOff = headerHtml({});

/** The opening tag of the element carrying `marker` (its own class/attribute contract). */
function openTag(html: string, marker: string): string {
  const at = html.indexOf(marker);
  expect(at, `expected an element carrying ${marker}`).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1);
}

/** Document order: does `first` appear before `second`? */
function precedes(html: string, first: string, second: string): boolean {
  const a = html.indexOf(first);
  const b = html.indexOf(second);
  return a > -1 && b > -1 && a < b;
}

describe("NAV1B — the second row owns every OTHER header control", () => {
  it("places the contextual selectors below the top row, in one wrapping row", () => {
    // The row exists for a deployment that configures contextual controls, it comes AFTER the top
    // row, and the shared Stack primitive owns its flow (a flex-wrap row).
    expect(precedes(switcherOn, "ui-site-header-top", "ui-site-header-context")).toBe(true);
    const contextTag = openTag(switcherOn, "ui-site-header-context");
    expect(contextTag).toContain("flex-wrap");
    expect(contextTag).toContain("items-center");
    // The navigation-mode selector belongs to the TOP row: it precedes the control row, and the
    // control row never carries it.
    expect(precedes(switcherOn, "data-ui-layout-switcher", "ui-site-header-context")).toBe(true);
  });

  it("renders the secondary row only when it has a control to place in it", () => {
    // The row is guarded by ONE derived condition, so a deployment with no site/location/language
    // control and no header navigation reserves no empty row. (Its GEOMETRY, when the controls do
    // exist, is proven in the browser matrix.)
    expect(HEADER_SOURCE).toContain("{hasSecondaryControls ? (");
    expect(HEADER_SOURCE).toContain("const hasSecondaryControls =");
    expect(HEADER_SOURCE).toContain(
      "hasHeaderNav || siteSelectorPresent || hasLocations || languageSelectorPresent;",
    );
  });
});

describe("NAV1B — the header composes no navigation of its own", () => {
  it("never composes the mobile disclosure (the shell owns it at the sidebar boundary)", () => {
    for (const html of [switcherOn, switcherOff]) {
      expect(html).not.toContain("shell-mobile-nav");
      expect(html).not.toContain("ui-shell-sidebar-disclosure");
      expect(html).not.toContain("ui-shell-mobile-nav-trigger");
    }
  });

  it("composes no ≥md top navigation for the shipped layouts (menu-bar closes its top menu)", () => {
    // NAV1B — neither shipped layout presents a ≥md header navigation: the sidebar layout puts its
    // navigation in the rail, and the menu-bar layout in the sticky bottom bar at every width.
    expect(switcherOn).not.toContain('data-ui-shell-part="top-nav"');
    expect(switcherOn).not.toContain('aria-label="Primary navigation"');
  });

  it("still composes a ≥md top navigation for a CUSTOM header-slot composition that presents one", () => {
    // The header navigation was not deleted, only moved OUT of the top row: a custom composition
    // that presents it (no switcher involved) still renders it — in the SECOND row, with its own
    // width gate — so the capability itself is unchanged.
    const html = headerHtml({ navigation: { desktop: "top", tablet: "top-compact" } });
    expect(html).toContain('aria-label="Primary navigation"');
    expect(precedes(html, "ui-site-header-context", 'aria-label="Primary navigation"')).toBe(true);
    // …and it is still never the mobile disclosure.
    expect(html).not.toContain("shell-mobile-nav");
  });
});

/*
 * NAV1B-V2 (FOUNDATION-UI-R1) — THE TOP ROW WRAPS BY CONTENT, AND THE BRAND IS NEVER COVERED.
 *
 * The former NAV1B-V1 arrangement answered "the selector keeps its top-right place" with a GRID whose
 * graphic case gave the identity and the control cluster the SAME cell, right-aligned the cluster over the
 * artwork and gave it a raised, OPAQUE surface — a control covering the brand. FOUNDATION-UI-R1 replaces that
 * strategy instead of compensating for it: ONE row, BOTH identity kinds, a WRAPPING FLEX ROW in which the brand
 * comes first, the cluster follows it right-anchored, and the cluster drops ENTIRELY BELOW the brand when the
 * two cannot share a line.
 *
 * These are SOURCE/STYLESHEET guards on purpose: the arrangement is declared ONCE in `globals.css` — so the
 * text and graphic kinds share it verbatim — and the RENDERED geometry (the two boxes sharing a line without
 * overlap, the cluster entirely below the brand at narrow widths, the logo keeping its proportions, no page
 * overflow, unobstructed hit targets) is proved in the browser matrix's `header-rows` scenario.
 */
describe("NAV1B-V2 — the top row wraps by content, and the brand is never covered", () => {
  /** The declarations of ONE rule, from its selector to its closing brace (`globals.css`). */
  function ruleBody(selector: string): string {
    const start = GLOBALS_SOURCE.indexOf(selector);
    expect(start, `expected a rule for ${selector}`).toBeGreaterThan(-1);
    return withoutComments(GLOBALS_SOURCE.slice(start, GLOBALS_SOURCE.indexOf("}", start)));
  }

  /** The whole NAV1B-V2 block: the row, its two occupants and the brand link. */
  function rowContract(): string {
    const start = GLOBALS_SOURCE.indexOf(".ui-site-header-top {");
    expect(start).toBeGreaterThan(-1);
    return withoutComments(
      GLOBALS_SOURCE.slice(start, GLOBALS_SOURCE.indexOf(".ui-page-banner {", start)),
    );
  }

  /**
   * A stylesheet block WITHOUT its prose: the contract guards below assert DECLARATIONS, and the block's own
   * commentary deliberately names the things it forbids (a stacked `position:`, a covering `z-index`), which
   * would otherwise satisfy the "must not contain" assertions it explains.
   */
  function withoutComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, "");
  }

  it("renders ONE row contract for BOTH identity kinds (no graphic-only row, no grid cell)", () => {
    // ONE row element carrying ONE class string: the graphic and text branches no longer disagree about the
    // row's layout, so a configured lockup is not a special case of it.
    expect(HEADER_SOURCE.match(/className="ui-site-header-top"/g) ?? []).toHaveLength(1);
    expect(HEADER_SOURCE).not.toContain("ui-site-header-top--graphic");
    expect(HEADER_SOURCE).not.toContain("justify-self-end");
    expect(HEADER_SOURCE).not.toContain("grid-cols-");
    // The brand is the row's FIRST occupant in document order, and it is marked as the identity.
    expect(precedes(switcherOn, '<div class="ui-site-header-top">', "ui-site-header-identity")).toBe(true);
  });

  it("declares the row as a wrapping flex row with the brand first and the cluster right-anchored", () => {
    const row = ruleBody(".ui-site-header-top {");
    expect(row).toContain("display: flex;");
    expect(row).toContain("flex-wrap: wrap;");
    expect(row).toContain("align-items: flex-start;");
    // Content-driven spacing: the occupants are separated on a line AND between lines.
    expect(row).toContain("column-gap: 1rem;");
    expect(row).toContain("row-gap: 0.5rem;");

    // The brand yields WIDTH, never position: it may break or clamp inside itself.
    const identity = ruleBody(".ui-site-header-identity {");
    expect(identity).toContain("flex: 1 1 auto;");
    expect(identity).toContain("min-width: 0;");

    // The cluster never shrinks below its controls, and the SAME right-edge anchor applies whether it shares
    // the brand's line or has a line of its own.
    const cluster = ruleBody(".ui-site-header-controls {");
    expect(cluster).toContain("flex: 0 0 auto;");
    expect(cluster).toContain("margin-inline-start: auto;");
  });

  it("keeps NO stacking, no shared cell and no opaque cover anywhere in the row", () => {
    const contract = rowContract();
    expect(contract).not.toContain("grid-area");
    expect(contract).not.toContain("grid-template-columns");
    expect(contract).not.toContain("z-index");
    expect(contract).not.toContain("position:");
    expect(contract).not.toContain("background-color");
    // …and the replaced arrangement's modifier is gone from the stylesheet entirely.
    expect(GLOBALS_SOURCE).not.toContain("ui-site-header-top--graphic");
  });

  it("keeps the graphic's proportions: a fixed lockup height, a natural width and a proportional clamp", () => {
    const logo = ruleBody(".ui-site-header-logo,");
    expect(logo).toContain("height: var(--ui-logo-display-size);");
    expect(logo).toContain("width: auto;");
    expect(logo).toContain("max-width: 100%;");
    expect(logo).toContain("object-fit: contain;");
    // The rendered lockup keeps the accepted 2rem height, and the brand link stays lockup-sized rather than
    // row-wide (so its hit area follows the artwork).
    expect(HEADER_SOURCE).toContain("ui-site-header-logo h-8 w-auto");
    const brand = ruleBody(".ui-site-header-brand {");
    expect(brand).toContain("width: max-content;");
    expect(brand).toContain("max-width: 100%;");
  });
});

describe("NAV1B — the header's top row owns the brand and the navigation-MODE selector", () => {
  it("keeps the mode selector in the TOP row, right-anchored, and out of the control row", () => {
    // The row carries the marker class ALONE: the arrangement comes from the stylesheet's NAV1B-V2 contract
    // (asserted above), so no utility class can disagree with it here.
    expect(openTag(switcherOn, "ui-site-header-top")).toBe('<div class="ui-site-header-top">');
    // Both occupants of the top row precede the control row, and the cluster is anchored at the right edge of
    // the padded content by its own auto margin — on the brand's line and on a line of its own alike.
    expect(precedes(switcherOn, "ui-site-header-identity", "ui-site-header-context")).toBe(true);
    expect(precedes(switcherOn, "ui-site-header-mode", "ui-site-header-context")).toBe(true);
    // R1 — the mode selector and the (optional) cross-Spoke switcher share ONE right-anchored cluster, and its
    // OWN wrapping flow (not a grid cell) is what keeps two controls visible when they cannot share ITS line.
    expect(openTag(switcherOn, "ui-site-header-controls")).toContain("flex flex-wrap");
    expect(precedes(switcherOn, "ui-site-header-controls", "ui-site-header-context")).toBe(true);
    // The mode row wraps the ONE control, and both stay in the top region (before the control row).
    expect(precedes(switcherOn, "ui-site-header-mode", "data-ui-layout-switcher")).toBe(true);
    expect(precedes(switcherOn, "data-ui-layout-switcher", "ui-site-header-context")).toBe(true);
  });

  it("renders the selector ONLY when more than one presentation is actually available", () => {
    // NAV1B — the switcher's own `enabled` semantics already express this: disabled means the site
    // presents exactly ONE effective option, so there is nothing to select and no control renders.
    expect(switcherOff).not.toContain("data-ui-layout-switcher");
    expect(switcherOff).not.toContain("ui-site-header-mode");
    // The identity is still the top row's only occupant.
    expect(switcherOff).toContain("ui-site-header-top");
    expect(switcherOff).toContain("ui-site-header-identity");
  });

  it("lets the brand yield width — never its place — so the selector is never moved onto it", () => {
    // The identity may shrink to any width (`min-width: 0`, part of the stylesheet's row contract) and its text
    // may break inside itself (`break-words`), so a long brand wraps INSIDE its own line instead of being
    // covered by the cluster. The cluster's place is decided by the ROW's content-driven wrapping, never by a
    // hard-coded brand width and never by a viewport breakpoint.
    expect(openTag(switcherOn, "ui-site-header-identity")).toContain("break-words");
    expect(HEADER_SOURCE).not.toContain("min-w-0");
    expect(precedes(switcherOn, "ui-site-header-identity", "ui-site-header-controls")).toBe(true);
  });
});
