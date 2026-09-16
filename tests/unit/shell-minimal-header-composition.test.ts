import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `ShellMobileNav`
 * (client) uses useState/useEffect, which have no context under
 * `renderToStaticMarkup`; per D1 we add no browser/testing dependency, so this
 * suite provides minimal STATELESS hook stubs. `mockForcedOpen` toggles the
 * deterministic drawer disclosure so BOTH invariants are provable under static
 * rendering: CLOSED SSR (no dialog, no CTA, nothing focusable from the drawer)
 * and the OPEN composition (the drawer CTA is a child of the dialog). The
 * behavioral matrix (keyboard/focus/Escape/scroll/reduced-motion) is the
 * mandatory UI-10 browser gate.
 */
let mockForcedOpen = false;

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const value = typeof initial === "function" ? (initial as () => unknown)() : initial;
      return [mockForcedOpen ? "open" : value, () => undefined];
    },
    useEffect: () => undefined,
    useRef: () => ({ current: null }),
  };
});

// `SiteHeader` composes client switchers that read `next/navigation`; stub the
// hooks so the REAL content-layer wiring (the mobile drawer CTA consumer) is
// testable under static rendering.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/en",
}));

import { SiteHeader } from "@/components/site/site-header";
import { ShellEngine } from "@/components/shell";
import { getDictionary } from "@/config/i18n";
import { resolveShellPattern, resolveUiConfig, type UiConfigInput } from "@/core/ui";
/**
 * The configuration leaves for the top-bar composition family (explicit engine
 * configuration; the Foundation's canonical presentation is separate).
 */
const TOP_BAR_UI = {
  navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
  shell: { header: "standard", footer: "standard", sidebar: { collapsible: false } },
  cta: { style: "standard" },
  presentation: { typography: "editorial", rhythm: "structured", surface: "paper", header: "rule", hero: "split" },
  density: "comfortable",
  content: { width: "standard" },
  theme: { radius: "small" },
} satisfies UiConfigInput;


/**
 * The configuration leaves for this composition family (explicit adopter/engine
 * configuration — the Foundation's canonical presentation is separate).
 */
const MINIMAL_HEADER_UI = {
  "navigation": {
    "desktop": "minimal",
    "tablet": "top-compact",
    "mobile": "drawer"
  },
  "shell": {
    "header": "minimal",
    "footer": "standard",
    "sidebar": {
      "collapsible": false
    }
  },
  "cta": {
    "style": "prominent"
  },
  "presentation": {
    "typography": "minimal",
    "rhythm": "airy",
    "surface": "minimal",
    "header": "bare",
    "hero": "center"
  },
  "density": "comfortable",
  "content": {
    "width": "narrow"
  },
  "theme": {
    "radius": "medium"
  }
} satisfies UiConfigInput;

beforeEach(() => {
  mockForcedOpen = false;
});
afterEach(() => {
  mockForcedOpen = false;
});

/**
 * UI-07 — Minimal-header preset through the Shell Engine + content layer.
 *
 * These server-render tests prove Minimal-header with the SMALLEST declarative
 * extension (D1/D2/D3), with no engine-architecture change:
 *  - the decision core maps Minimal-header to header-slot trajectories
 *    (minimal ≥md, top-compact tablet, closed drawer <md) — no sidebar,
 *    no bottom bar;
 *  - the engine's CTA appears exactly once in the header slot for an
 *    enabled + label + href CTA, with `ui-cta-prominent` ONLY for `style:
 *    "prominent"` (a vocabulary-value branch, never identity);
 *  - missing href/label/disabled produces NO CTA anywhere — the Foundation
 *    never invents a destination;
 *  - the CTA resolves to the ONE top slot for every viewport (P6-3C): it is
 *    never composed into the aside rail or a mobile disclosure, so `SiteHeader`
 *    (the content layer) composes NO CTA at all — closed SSR contributes nothing
 *    focusable and opening the drawer exposes navigation only;
 *  - the consumer branches purely on decision-core VALUES — the same consumer
 *    serves a Minimal-header config with a complete CTA (not Minimal-header-specific);
 *  - D3: `moreMenu`/Show-Hide vocabulary values stay absent from the Minimal-header
 *    assembly.
 */

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const headerPlain = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

const base = { locale: "en", pageBindings: [] };

const allIds = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

describe("ShellEngine — Minimal-header decision trajectories (no aside, no bottom bar)", () => {
  it("resolveShellPattern(focus) = minimal/header, top-compact/header, drawer/header+trigger", () => {
    const d = resolveShellPattern(resolveUiConfig(MINIMAL_HEADER_UI));
    expect(d.desktop.primitiveKind).toBe("minimal");
    expect(d.desktop.slot).toBe("header");
    expect(d.desktop.ctaSlot).toBe("none");
    expect(d.tablet.primitiveKind).toBe("top-bar");
    expect(d.tablet.slot).toBe("header");
    expect(d.mobile.primitiveKind).toBe("drawer");
    expect(d.mobile.slot).toBe("header");
    expect(d.mobile.trigger).toBe(true);
    expect(d.mobile.ctaSlot).toBe("none");
    expect(d.cta.present).toBe(false);
  });

  it("P6-3C — focus + complete CTA: the ONE top slot at every viewport (no aside, no bottom)", () => {
    const d = resolveShellPattern(
      resolveUiConfig({ ...MINIMAL_HEADER_UI, cta: { enabled: true, action: "book", label: "Book", href: "/booking", style: "prominent" } }),
    );
    expect(d.desktop.ctaSlot).toBe("top");
    expect(d.tablet.ctaSlot).toBe("top");
    expect(d.mobile.ctaSlot).toBe("top");
    expect(d.cta.present).toBe(true);
  });
});

describe("ShellEngine — Minimal-header SSR shell (no sidebar, no bottom bar, neutral CTA)", () => {
  it("renders the plain flex-column wrapper with NO sidebar bands / NO bottom bar", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig(MINIMAL_HEADER_UI), header: headerPlain, main, footer, mainId: "main", ...base }),
    );
    // P5-3 — Minimal-header resolves the narrow content column, so the wrapper carries
    // `max-w-screen-md` (the narrow intent), not the plain default wrapper.
    expect(html).toContain('class="flex flex-col flex-1 max-w-screen-md"');
    expect(html).not.toContain("shell-sidebar");
    expect(html).not.toContain("ui-shell-sidebar");
    expect(html).not.toContain("lg:flex-row");
    expect(html).not.toContain("ui-shell-bottom-bar");
    expect(html).toContain('<main id="main">');
  });

  it("renders NO CTA for defaults-only focus even when label+href are supplied (enabled false)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({ resolved: resolveUiConfig(MINIMAL_HEADER_UI), header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/booking", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("enabled + label but NO href renders nothing — a destination is never inferred", () => {
    const resolved = resolveUiConfig({ ...MINIMAL_HEADER_UI, cta: { enabled: true, action: "book", label: "Book Now" } });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book Now", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
  });
});

describe("ShellEngine — Minimal-header desktop/tablet CTA (header slot, D3 prominent)", () => {
  it("enabled + label + href renders EXACTLY ONE CTA in the header path with the prominent treatment", () => {
    const resolved = resolveUiConfig({
      ...MINIMAL_HEADER_UI,
      // P5-3 — the prominent CTA treatment is this composition's declared style
      // (it used to be supplied by the retired presentation profile; an explicit
      // `cta` object replaces the whole block, so it must be stated here).
      cta: { enabled: true, action: "book", label: "Book Now", href: "/booking", style: "prominent" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book Now", ctaHref: "/booking", ...base }),
    );
    expect(html).toContain("ui-shell-header-row");
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    expect(html).toContain("/booking");
    expect(html).toContain("ui-cta-prominent"); // declared composition style
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("standard-style override renders the CTA WITHOUT the prominent treatment", () => {
    const resolved = resolveUiConfig({
      ...MINIMAL_HEADER_UI,
      cta: { enabled: true, action: "book", label: "Book", href: "/book", style: "standard" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/book", ...base }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).not.toContain("ui-cta-prominent");
  });

  it("disabled + label + href renders nothing", () => {
    const resolved = resolveUiConfig({
      ...MINIMAL_HEADER_UI,
      cta: { enabled: false, action: "book", label: "Book", href: "/booking" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaLabel: "Book", ctaHref: "/booking", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("enabled + href but MISSING label renders nothing", () => {
    const resolved = resolveUiConfig({
      ...MINIMAL_HEADER_UI,
      cta: { enabled: true, action: "book", href: "/booking" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({ resolved, header: headerPlain, main, footer, mainId: "main", ctaHref: "/booking", ...base }),
    );
    expect(html).not.toContain("nav-item-cta");
  });
});
describe("SiteHeader — Minimal-header mobile drawer (navigation only; P6-3C: no CTA in the disclosure)", () => {
  const resolvedCta = resolveUiConfig({
    ...MINIMAL_HEADER_UI,
    cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
  });

  it("CLOSED SSR: trigger present; NO dialog, NO CTA, nothing focusable; one ≥md nav landmark; no duplicate ids", () => {
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    // Deterministic trigger/control relationship (B1): the trigger owns the
    // deterministic id; aria-controls resolves to the `${id}-panel` panel id.
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    expect(html).not.toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("md:hidden");
    // One ≥md nav landmark (Minimal-header desktop `minimal` renders the full list in
    // the header slot — no invented "minimalization", D4).
    expect(html.match(/aria-label="Primary navigation"/g) ?? []).toHaveLength(1);
    // Closed drawer contributes no dialog, no CTA, no drawer links/focusables:
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("P6-3C — OPEN drawer (forced): the disclosure carries NAVIGATION only (no CTA inside it)", () => {
    mockForcedOpen = true;
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    // Exactly ONE dialog (the mobile drawer) and NO CTA inside it: the single
    // Book Now lives in the shell's top region (engine-composed).
    expect(html.match(/role="dialog"/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
    // B1: the trigger owns `shell-mobile-nav`; the dialog panel uses
    // `shell-mobile-nav-panel` and is NAMED BY the trigger (aria-labelledby).
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-labelledby="shell-mobile-nav"');
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    // D1/D3 open-state markup: focusable panel + dismissing backdrop.
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("ui-drawer-panel");
    expect(html).toContain("ui-drawer-backdrop");
  });

  it("OPEN drawer with enabled + label but NO href: still no CTA inside the dialog (never invented)", () => {
    mockForcedOpen = true;
    const resolvedNoHref = resolveUiConfig({
      ...MINIMAL_HEADER_UI,
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedNoHref }));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
  });

  it("the disclosure consumer is generic (vocabulary-driven), NOT Minimal-header-specific: a Minimal-header config's open drawer is CTA-free too", () => {
    mockForcedOpen = true;
    const resolvedMinimalHeader = resolveUiConfig({
      ...TOP_BAR_UI,
      cta: { enabled: true, action: "book", label: "Book", href: "/book", style: "standard" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedMinimalHeader }));
    expect(html).toContain('role="dialog"');
    // P6-3C — no CTA is composed into ANY disclosure, for any composition: the one
    // action always lives in the shell's top region instead.
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/book");
  });
});

describe("SiteHeader — D3 genericity: Minimal-header never emits the adaptive-only desktop rail", () => {
  it("the Minimal-header assembly has no rail disclosure, no adaptive bottom-bar label, and no close-control text in SSR", () => {
    const dictionary = getDictionary("en");
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolveUiConfig(MINIMAL_HEADER_UI) }));
    // P6-1 — the Show/Hide Sidebar vocabulary is SHARED (not adaptive-only):
    // the Minimal-header drawer trigger correctly says "Show Sidebar" in the header.
    expect(html).toContain(dictionary.navigation.showSidebar);
    // What MUST stay absent: the adaptive bottom-bar label + the desktop rail
    // disclosure control (and its "Hide Sidebar" close text only exists inside
    // the CLOSED-by-default drawer → no rail control and no hide label in SSR).
    expect(html).not.toContain(dictionary.navigation.moreMenu);
    expect(html).not.toContain(dictionary.navigation.hideSidebar);
    expect(html).not.toContain("ui-sidebar-toggle");
  });
});