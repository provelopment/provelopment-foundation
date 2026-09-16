import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * Same stateless hook stubs as sidebar.test.tsx — `Sidebar` is a client
 * component using useState; these stubs capture the deterministic INITIAL
 * state for markup assertions. Real geometry/keyboard behavior is verified by
 * the CDP browser matrix.
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

import { Sidebar } from "@/components/ui/sidebar";

const globals = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");
const rail = createElement("span", null, "rail");

/**
 * P6-3A — the persistent horizontal sidebar rail (desktop/tablet sidebar
 * compositions). Collapse is a HORIZONTAL WIDTH state (`data-collapsed`), never
 * `display:none`: the rail is always present with a thin border, expands to the
 * intended width showing icons + labels, and contracts to a narrow icon-only
 * rail. Mobile navigation architecture is deliberately unchanged by P6-3A.
 */
describe("P6-3A — persistent horizontal sidebar rail", () => {
  it("collapse is a width state, never display:none — the panel is always rendered", () => {
    const collapsed = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, collapsed: true, children: rail }),
    );
    const expanded = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, children: rail }),
    );
    // Persistent DOM: the panel element is present in BOTH states, never hidden.
    expect(collapsed).toContain('id="s-panel" class="ui-sidebar-rail-panel"');
    expect(expanded).toContain('id="s-panel" class="ui-sidebar-rail-panel"');
    expect(collapsed).not.toContain('class="hidden"');
    expect(expanded).not.toContain('class="hidden"');
    // A stable width-state hook for the CSS + tests.
    expect(collapsed).toContain('data-collapsed="true"');
    expect(expanded).toContain('data-collapsed="false"');
    // The rail is a real `nav` landmark with the persistent-rail class.
    expect(collapsed).toContain('class="ui-sidebar-rail"');
  });

  it("the toggle remains present + semantically correct in both states (never a dead-end)", () => {
    const collapsed = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, collapsed: true, showLabel: "Show Sidebar", hideLabel: "Hide Sidebar", open: { icon: "sidebar-open.svg", text: undefined }, close: { icon: "sidebar-close.svg", text: undefined }, children: rail }),
    );
    const expanded = renderToStaticMarkup(
      Sidebar({ label: "Navigation", id: "s", collapsible: true, showLabel: "Show Sidebar", hideLabel: "Hide Sidebar", open: { icon: "sidebar-open.svg", text: undefined }, close: { icon: "sidebar-close.svg", text: undefined }, children: rail }),
    );
    expect(collapsed).toContain('type="button"');
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).toContain('aria-controls="s-panel"');
    expect(expanded).toContain('aria-expanded="true"');
    // ONE Show/Hide Sidebar vocabulary (P6-1 preserved).
    expect(collapsed).toContain("Show Sidebar");
    expect(expanded).toContain("Hide Sidebar");
  });
});

describe("P6-3B — rail CSS contract (derived width, icon sizes, full-height border, paired icons)", () => {
  it("expanded width + a thin border + a horizontal width transition", () => {
    expect(globals).toMatch(/--ui-sidebar-rail-expanded:\s*13\.75rem/);
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\s*\\{[^}]*width:\\s*var\\(--ui-sidebar-rail-expanded\\)"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\s*\\{[^}]*border-inline-end:\\s*1px solid var\\(--border\\)"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\s*\\{[^}]*transition:\\s*width\\s+200ms"));
  });

  it("collapsed rail uses its OWN symmetric geometry token (no hard-coded px)", () => {
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\[data-collapsed=\"true\"\\]\\s*\\{[^}]*width:\\s*var\\(--ui-sidebar-rail-collapsed\\)"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\[data-collapsed=\"true\"\\]\\s*\\{[^}]*padding-inline:\\s*var\\(--ui-sidebar-rail-collapsed-pad\\)"));
    // Owner ruling (2026-09): the collapsed rail is the control icon plus EQUAL
    // inline padding on both sides (one width for desktop and tablet), and the
    // inline-end padding is reduced by the rail's own border so the contents
    // centre between the rail's OUTER edges.
    expect(globals).toMatch(
      /--ui-sidebar-rail-collapsed:\s*calc\(\s*var\(--ui-sidebar-control-icon-size\)\s*\+\s*var\(--ui-sidebar-rail-collapsed-pad\)\s*\*\s*2\s*\)/,
    );
    expect(globals).toMatch(/--ui-sidebar-rail-collapsed-pad:\s*0\.375rem/);
    expect(globals).toMatch(
      /padding-inline:\s*var\(--ui-sidebar-rail-collapsed-pad\)\s*\n?\s*calc\(var\(--ui-sidebar-rail-collapsed-pad\)\s*-\s*var\(--ui-sidebar-rail-border\)\)/,
    );
    expect(globals).not.toMatch(/--ui-sidebar-icon-size\s*:/);
  });

  it("full-height border: the frame + band child + rail all stretch to the shell row", () => {
    expect(globals).toMatch(new RegExp("\\.ui-shell-sidebar\\s*>\\s*div\\s*\\{[^}]*height:\\s*100%"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\s*\\{[^}]*height:\\s*100%"));
  });

  it("P6-3C (owner ruling 2026-09) — page icons are EXACTLY 16px; the CONTROL is EXACTLY 24px", () => {
    // Navigation-ITEM (page icon) token: declared ONCE at 1rem = 16px. The
    // former at-`lg` 2rem override is deliberately GONE — desktop and tablet
    // share one sizing contract, expanded and collapsed alike.
    expect(globals).toMatch(/--ui-sidebar-nav-icon-size:\s*1rem/);
    expect(globals).not.toMatch(/--ui-sidebar-nav-icon-size:\s*2rem/);
    expect(globals).not.toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-nav-icon-size"),
    );
    expect(globals).toMatch(new RegExp("\\.ui-shell-sidebar \\.ui-nav-item-icon\\s*\\{[^}]*width:\\s*var\\(--ui-sidebar-nav-icon-size\\)"));
    // The show/hide CONTROL has its OWN, DIFFERENT contract (2026-09 closure
    // pass): exactly 24px on desktop AND tablet, one value, no breakpoint
    // override. It is not a page icon, and it no longer derives the rail.
    expect(globals).toMatch(/--ui-sidebar-control-icon-size:\s*1\.5rem/);
    expect(globals).not.toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-control-icon-size"),
    );
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-toggle-icon\\s*\\{[^}]*width:\\s*var\\(--ui-sidebar-control-icon-size\\)"));
    // Mobile disclosure control icon sized at the component level
    // (`h-8 w-8` in ShellMobileNav) rather than by an unlayered global override.
    const shellMobileNav = readFileSync(
      path.join(process.cwd(), "src", "components", "shell", "shell-mobile-nav.tsx"),
      "utf8",
    );
    expect(shellMobileNav).toContain('className="ui-mobile-nav-icon h-8 w-8 shrink-0"');
  });

  it("collapsed labels are sr-only (never overflow-clipped) and paired icons swap on data-collapsed", () => {
    expect(globals).toMatch(/\.ui-sidebar-rail\[data-collapsed="true"\]\s*li\.ui-nav-item--has-icon\s*\.ui-nav-item-label/);
    expect(globals).toMatch(new RegExp("\\.ui-nav-item-icon-closed\\s*\\{[^}]*display:\\s*none"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\[data-collapsed=\"true\"\\] \\.ui-nav-item-icon-open\\s*\\{[^}]*display:\\s*none"));
    expect(globals).toMatch(new RegExp("\\.ui-sidebar-rail\\[data-collapsed=\"true\"\\] \\.ui-nav-item-icon-closed\\s*\\{[^}]*display:\\s*inline-block"));
  });

  it("responsive shell: the aside row applies at `md` (tablet rail beside content, not stacked above it)", () => {
    const engine = readFileSync(
      path.join(process.cwd(), "src", "components", "shell", "shell-engine.tsx"),
      "utf8",
    );
    expect(engine).toContain("md:flex-row md:flex-wrap");
    expect(engine).not.toContain("lg:flex-row");
    expect(engine).toContain('sidebarClassName="ui-shell-sidebar hidden md:block md:shrink-0"');
    expect(engine).not.toContain("lg:w-60");
  });
});
