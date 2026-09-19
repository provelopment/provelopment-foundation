import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `ShellMobileNav`
 * (client) uses useState/useEffect, which have no context under
 * `renderToStaticMarkup`; per D1 we add no browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs (evaluating lazy initializers)
 * so markup captures the deterministic INITIAL state (drawer closed). The
 * behavioral matrix (keyboard/focus/Escape/scroll/reduced-motion/close control/
 * width) is the mandatory UI-10/P5-1 browser gate.

 * P5-1/P6-1 — Sidebar-parity SSR contract (what closed markup must ALWAYS expose):
 *  - the mobile trigger renders the recognizable open-sidebar icon (svg with
 *    the shared `ui-mobile-nav-icon` marker) PLUS the explicit action label
 *    ("Show navigation" — the ONE P6-1 vocabulary — never a bare "Menu"/
 *    "Primary navigation" trigger on the closed control);
 *  - the trigger conveys disclosure state via `aria-expanded="false"` and
 *    `aria-controls="<id>-panel"` (deterministic B1 relationship);
 *  - CLOSED-by-default SSR: zero dialog, zero backdrop, zero close
 *    control/focusables — even when `closeLabel` is supplied (the close
 *    button renders only inside the OPEN panel, client-side, via the shared
 *    Drawer/OverlayNavigation path).
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

import { ShellMobileNav } from "@/components/shell";

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

describe("ShellMobileNav — P5-1 mobile sidebar contract (closed SSR)", () => {
  it("trigger exposes the recognizable open icon + \"Show navigation\" action label", () => {
    const html = renderToStaticMarkup(
      ShellMobileNav({
        pattern: "drawer",
        triggerLabel: "Show navigation",
        id: "shell-mobile-nav",
        className: "md:hidden",
        closeLabel: "Hide navigation",
        children: el("nav", null, "Nav content"),
      }),
    );
    expect(html).toContain("Show navigation");
    // P5-5/P6-1 — the open control icon is now a configurable asset (`<img>` with
    // the shared ui-mobile-nav-icon marker); the P5-1 browser contract (the
    // marker + the visible "Show navigation" label) is unchanged.
    expect(html).toMatch(/<img[^>]*class="[^"]*ui-mobile-nav-icon/);
    expect(html).toContain('/assets/sidebar-open.svg');
    // The trigger is not an icon-only control: the visible action label is the
    // accessible name, with the icon decorative (aria-hidden by the SVG itself).
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
  });

  it("closed SSR renders no dialog/backdrop/close control — even with closeLabel supplied", () => {
    const html = renderToStaticMarkup(
      ShellMobileNav({
        pattern: "overlay",
        triggerLabel: "Show navigation",
        id: "shell-mobile-nav",
        className: "md:hidden",
        closeLabel: "Hide navigation",
        children: el("nav", null, "Nav content"),
      }),
    );
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("ui-drawer-backdrop");
    expect(html).not.toContain("ui-drawer-close");
    // The overlay pattern additionally scopes its panel sizing class (unchanged
    // P0-1 contract) — never rendered while closed either.
    expect(html).not.toContain("ui-overlay-panel");
  });

  it("the trigger carries the deterministic ids/relationship the matrix asserts when open", () => {
    const html = renderToStaticMarkup(
      ShellMobileNav({
        pattern: "drawer",
        triggerLabel: "Show navigation",
        id: "shell-client-nav",
        className: "md:hidden",
        children: el("ul", null),
      }),
    );
    expect(html).toContain('id="shell-client-nav"');
    expect(html).toContain('aria-controls="shell-client-nav-panel"');
  });
});