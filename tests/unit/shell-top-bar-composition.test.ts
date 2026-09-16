import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `ShellMobileNav`
 * (client) uses useState/useEffect, which have no context under
 * `renderToStaticMarkup`; per D1 we add no browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs (evaluating lazy initializers)
 * so markup captures the deterministic INITIAL state (drawer closed). The
 * behavioral matrix (keyboard/focus/Escape/scroll/reduced-motion) is the
 * mandatory UI-10 gate.
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

import { siteConfig } from "@/config";
import { getDictionary } from "@/config/i18n";
import { ShellEngine, ShellMobileNav } from "@/components/shell";
import { resolveShellPattern, resolveUiConfig, type UiConfigInput } from "@/core/ui";

/**
 * The configuration leaves for this composition family (explicit adopter/engine
 * configuration — the Foundation's canonical presentation is separate).
 */
const TOP_BAR_UI = {
  "navigation": {
    "desktop": "top",
    "tablet": "top-compact",
    "mobile": "drawer"
  },
  "shell": {
    "header": "standard",
    "footer": "standard",
    "sidebar": {
      "collapsible": false
    }
  },
  "cta": {
    "style": "standard"
  },
  "presentation": {
    "typography": "editorial",
    "rhythm": "structured",
    "surface": "paper",
    "header": "rule",
    "hero": "split"
  },
  "density": "comfortable",
  "content": {
    "width": "standard"
  },
  "theme": {
    "radius": "small"
  }
} satisfies UiConfigInput;

/**
 * UI-06 — Top-bar preset through the Shell Engine (declarative proof).
 *
 * These server-render tests prove that Top-bar (the first non-default preset)
 * requires ZERO Top-bar-specific engine logic:
 *  - the decision core maps Top-bar to the long-shipped header-slot trajectories
 *    (top-bar ≥md, closed drawer <md) — no sidebar, no bottom bar;
 *  - `ShellEngine` SSR for `{"preset":"classic"}` is BYTE-IDENTICAL to SSR for
 *    the explicit classic leaves (same machinery, both paths);
 *  - the content-layer wiring (one ≥md `nav` landmark + one closed-by-default
 *    <md `ShellMobileNav` drawer) satisfies the landmark/duplicate-id/focus
 *    contract — inactive drawer contributes no links or focusables at SSR;
 *  - CTA stays neutral (no label/href → nothing), and a complete CTA lands in
 *    the header slot only.
 *  - D3: the Top-bar assembly never emits the adaptive-only i18n values
 *    (`moreMenu`, the Show/Hide vocabulary).
 */

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const headerPlain = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

const navList = el(
  "ul",
  null,
  el("li", null, el("a", { href: "/en" }, "Home")),
  el("li", null, el("a", { href: "/en/about" }, "About")),
);

/** Mirrors the SiteHeader wiring for a header-slot composition (Top-bar). */
function classicHeader() {
  return el(
    "header",
    null,
    el("nav", { "aria-label": "Primary navigation", className: "hidden md:block" }, navList),
    ShellMobileNav({
      pattern: "drawer",
      triggerLabel: "Menu",
      id: "shell-mobile-nav",
      className: "md:hidden",
      children: navList,
    }),
  );
}

const allIds = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

const base = { locale: "en", pageBindings: [] };

describe("ShellEngine — Top-bar decision trajectories (no aside, no bottom bar)", () => {
  it("resolveShellPattern(classic) = header/header/drawer with no aside/bottom", () => {
    const d = resolveShellPattern(resolveUiConfig(TOP_BAR_UI));
    expect(d.desktop.primitiveKind).toBe("top-bar");
    expect(d.desktop.slot).toBe("header");
    expect(d.tablet.primitiveKind).toBe("top-bar");
    expect(d.tablet.slot).toBe("header");
    expect(d.mobile.primitiveKind).toBe("drawer");
    expect(d.mobile.slot).toBe("header");
    expect(d.mobile.trigger).toBe(true);
    expect(d.cta.present).toBe(false);
  });

  it("P6-3C — classic + enabled CTA: EVERY viewport resolves the ONE top CTA slot", () => {
    const d = resolveShellPattern(
      resolveUiConfig({ ...TOP_BAR_UI, cta: { enabled: true, action: "book", label: "Book", style: "standard" } }),
    );
    expect(d.desktop.ctaSlot).toBe("top");
    expect(d.tablet.ctaSlot).toBe("top");
    expect(d.mobile.ctaSlot).toBe("top"); // the drawer never carries the CTA (P6-3C)
    expect(d.cta.present).toBe(true);
  });

  it("engine SSR emits no sidebar bands, no bottom bar, and the plain flex-column wrapper", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig(TOP_BAR_UI), header: headerPlain, main, footer, mainId: "main", ...base }),
    );
    expect(html).toContain('class="flex flex-col flex-1"');
    expect(html).not.toContain("shell-sidebar");
    expect(html).not.toContain("ui-shell-sidebar");
    expect(html).not.toContain("lg:flex-row");
    expect(html).not.toContain("ui-shell-bottom-bar");
    expect(html).toContain('<main id="main">');
  });
});

describe("ShellEngine — Top-bar is byte-identical to explicit classic leaves (D6)", () => {
  it("decision cores match and SSR strings are identical across both paths", () => {
    const fromPreset = resolveUiConfig(TOP_BAR_UI);
    const fromLeaves = resolveUiConfig({
      navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
    });
    expect(resolveShellPattern(fromPreset)).toEqual(resolveShellPattern(fromLeaves));

    const propsPreset = { resolved: fromPreset, header: headerPlain, main, footer, mainId: "main", ...base };
    const propsLeaves = { resolved: fromLeaves, header: headerPlain, main, footer, mainId: "main", ...base };
    expect(renderToStaticMarkup(ShellEngine(propsPreset))).toBe(renderToStaticMarkup(ShellEngine(propsLeaves)));
  });
});

describe("ShellEngine — Top-bar navigation landmark correctness", () => {
  it("one ≥md nav landmark + one closed-by-default drawer; no duplicate ids; no focusable drawer content", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig(TOP_BAR_UI), header: classicHeader(), main, footer, mainId: "main", ...base }),
    );
    // The engine renders NO additional landmark for a header-slot composition:
    expect(html.match(/aria-label="Primary navigation"/g) ?? []).toHaveLength(1);
    expect(html).toContain('<nav aria-label="Primary navigation" class="hidden md:block">');
    // Deterministic trigger/control relationship (B1): the trigger owns the id;
    // aria-controls resolves to the `${id}-panel` id that exists only when open.
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    expect(html).not.toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("md:hidden");
    // Closed drawer contributes no dialog, no links, no focusables:
    expect(html).not.toContain('role="dialog"');
    expect(html.match(/href="\/en[^"]*"/g) ?? []).toHaveLength(2); // only the ≥md nav links
    // No duplicate ids anywhere:
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("ShellEngine — Top-bar CTA neutrality (D1/D2)", () => {
  it("renders NO CTA for defaults-only classic even when label+href are supplied", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig(TOP_BAR_UI), header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/book");
  });

  it("demo-style CTA (enabled + label, no href) renders nothing — engine never invents a href", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig(siteConfig.ui ?? {}), header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book Now", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
  });

  it("a complete CTA renders exactly once in the header slot", () => {
    const resolved = resolveUiConfig({
      ...TOP_BAR_UI,
      cta: { enabled: true, action: "book", label: "Book", style: "standard" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: classicHeader(), main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).toContain("ui-shell-header-row");
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    expect(html).toContain("/book");
    // Never inside a dialog / drawer:
    expect(html).not.toContain('role="dialog"');
  });
});

describe("ShellEngine — D3: Top-bar never emits the adaptive-only i18n values", () => {
  it("moreMenu and the Show/Hide Sidebar vocabulary are absent from the Top-bar assembly", () => {
    const dictionary = getDictionary("en");
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig(TOP_BAR_UI), header: classicHeader(), main, footer, mainId: "main", ...base }),
    );
    expect(html).not.toContain(dictionary.navigation.moreMenu);
    expect(html).not.toContain(dictionary.navigation.showSidebar);
    expect(html).not.toContain(dictionary.navigation.hideSidebar);
  });
});