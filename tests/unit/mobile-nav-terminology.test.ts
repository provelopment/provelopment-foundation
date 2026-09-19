import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * VIS1P — THE SHARED MOBILE NAVIGATION CONTROL'S TERMINOLOGY CONTRACT
 *
 * The shared shell's mobile disclosure is used by every navigation composition:
 * the drawer (this site), the sidebar rail, and the overlay. Its label was
 * `Show navigation` / `Hide navigation`, which named ONE visual composition rather than
 * the thing the control actually does. The shared control must describe
 * NAVIGATION, not a particular composition, so the vocabulary is now
 * composition-neutral: `Show navigation` / `Hide navigation`.
 *
 * This suite pins the CONTRACT:
 *   · the SHIPPED English copy is the neutral wording;
 *   · collapsed shows the show term, expanded shows the hide term;
 *   · the retired wording no longer exists in the shared control's implementation
 *     or in the rendered output;
 *   · the copy change altered NOTHING else — the >=44px hit area, the disclosure
 *     wiring and the `md:hidden` scope are all still present.
 *
 * The ban is deliberately NARROW and focused on this control's user-visible copy.
 * `sidebar` remains a first-class concept in this product (composition kinds,
 * config paths, CSS classes, icon assets), so there is no repository-wide ban.
 */

/** The disclosure state the mocked hook reports, per test. */
let disclosureState: "open" | "closed" = "closed";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: () => [disclosureState, () => undefined],
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
  };
});

import { ShellMobileNav } from "@/components/shell";
import { getDictionary } from "@/config/i18n";

const dictionary = getDictionary("en");

/**
 * The RETIRED composition-specific terms.
 *
 * Built from parts deliberately: these are the exact strings this suite exists to
 * prove ABSENT, so they must not be silently rewritten by a project-wide copy
 * sweep.
 */
const RETIRED_TERMS = ["Show", "Hide", "Close"].map((verb) => [verb, "Sidebar"].join(" "));

/** The shared control, rendered through the SHIPPED copy (not a mock). */
const mobileNavHtml = (): string =>
  renderToStaticMarkup(
    ShellMobileNav({
      pattern: "drawer",
      triggerLabel: dictionary.navigation.showSidebar,
      id: "shell-mobile-nav",
      className: "md:hidden",
      closeLabel: dictionary.navigation.hideSidebar,
      children: null,
    }),
  );

describe("VIS1P — the shared mobile navigation control names navigation, not a composition", () => {
  it("ships composition-neutral copy", () => {
    expect(dictionary.navigation.showSidebar).toBe("Show navigation");
    expect(dictionary.navigation.hideSidebar).toBe("Hide navigation");
  });

  it("collapsed state exposes the SHOW term and not the HIDE term", () => {
    disclosureState = "closed";
    const html = mobileNavHtml();
    expect(html).toContain("Show navigation");
    expect(html).not.toContain("Hide navigation");
  });

  it("expanded state exposes the HIDE term", () => {
    disclosureState = "open";
    const html = mobileNavHtml();
    // The drawer's own close control carries the hide term.
    expect(html).toContain("Hide navigation");
    expect(html).toContain('aria-expanded="true"');
  });

  it("never renders the retired composition-specific wording", () => {
    for (const state of ["closed", "open"] as const) {
      disclosureState = state;
      const html = mobileNavHtml();
      for (const term of RETIRED_TERMS) {
        expect(html, `${state} should not render "${term}"`).not.toContain(term);
      }
    }
  });

  it("the shared control's implementation carries no retired wording", () => {
    // Focused on the control's own sources — NOT a repository-wide ban on the
    // ordinary word `sidebar`, which this product still legitimately uses for the
    // sidebar composition (kinds, config paths, CSS classes, icon assets).
    const root = path.resolve(__dirname, "../..");
    const sources = [
      "src/components/shell/shell-mobile-nav.tsx",
      "src/components/shell/shell-engine.tsx",
      "src/components/ui/sidebar.tsx",
      "src/config/i18n/dictionary.ts",
    ];
    for (const file of sources) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const term of RETIRED_TERMS) {
        expect(source, `${file} should not contain "${term}"`).not.toContain(term);
      }
    }
  });

  it("changed the COPY only — behaviour and the >=44px contract are untouched", () => {
    disclosureState = "closed";
    const html = mobileNavHtml();
    // VIS1C's contract survives this copy change.
    expect(html).toContain("min-h-11");
    expect(html).toContain("min-w-11");
    expect(html).toContain("ui-shell-mobile-nav-trigger");
    expect(html).toContain("md:hidden");
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    expect(html).toContain('aria-expanded="false"');
    // The artwork keeps its visual scale — no geometry change.
    expect(html).toContain("ui-mobile-nav-icon h-8 w-8 shrink-0");
  });
});
