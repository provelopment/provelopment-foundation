import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * NOTE: the Shell Engine (server) renders without hooks. `Sidebar` /
 * `ShellMobileNav` and the client switchers call hooks with no context under
 * `renderToStaticMarkup`; per the established D1 pattern we add no browser/testing
 * dependency, so this suite provides minimal STATELESS hook stubs. `mockForcedOpen`
 * toggles the deterministic mobile-overlay/drawer disclosure so BOTH invariants are
 * provable under static rendering: CLOSED SSR (no dialog, no CTA, nothing focusable)
 * and the OPEN composition (the CTA is a child of the dialog). The behavioral matrix
 * (keyboard/focus/Escape/backdrop/reduced-motion) is the mandatory UI-10 browser
 * gate — it is NOT duplicated here.
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
// hooks so the REAL content-layer wiring (the mobile CTA consumer) is testable
// under static rendering.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined }),
  usePathname: () => "/en",
}));

import { SiteHeader } from "@/components/site/site-header";
import { ShellEngine } from "@/components/shell";
import { getDictionary } from "@/config/i18n";
import { resolveShellPattern, resolveUiConfig, type UiConfigInput } from "@/core/ui";
/**
 * The configuration leaves for the sidebar+drawer composition family (explicit
 * engine configuration; the Foundation's canonical presentation is separate).
 */
const SIDEBAR_DRAWER_UI = {
  navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" },
  shell: { header: "standard", footer: "standard", sidebar: { collapsible: true } },
  cta: { style: "standard" },
  presentation: { typography: "utility", rhythm: "dense", surface: "instrument", header: "compact", hero: "concise" },
  density: "compact",
  content: { width: "wide" },
  theme: { radius: "none" },
} satisfies UiConfigInput;


/**
 * The configuration leaves for this composition family (explicit adopter/engine
 * configuration — the Foundation's canonical presentation is separate).
 */
const FLOATING_OVERLAY_UI = {
  "navigation": {
    "desktop": "floating",
    "tablet": "floating",
    "mobile": "overlay"
  },
  "shell": {
    "header": "minimal",
    "footer": "standard",
    "sidebar": {
      "collapsible": false
    }
  },
  "cta": {
    "style": "standard"
  },
  "presentation": {
    "typography": "expressive",
    "rhythm": "spacious",
    "surface": "layered",
    "header": "elevated",
    "hero": "showcase"
  },
  "density": "spacious",
  "content": {
    "width": "wide"
  },
  "theme": {
    "radius": "large"
  }
} satisfies UiConfigInput;

beforeEach(() => {
  mockForcedOpen = false;
});
afterEach(() => {
  mockForcedOpen = false;
});

/**
 * UI-09 — Floating-overlay preset through the Shell Engine + content layer.
 *
 * These server-render tests prove the Floating-overlay SHELL is a declarative
 * composition (the fourth architectural proof after Floating-overlay UI-06, Floating-overlay UI-07,
 * Floating-overlay UI-08), with ONE minimal vocabulary-driven content-layer consumer fix
 * that makes the already-declared mobile overlay CTA observable:
 *  - the decision core maps Floating-overlay to aside trajectories (desktop `floating`
 *    and tablet `floating` both live in the ASIDE slot) plus the mobile `overlay`;
 *  - desktop/tablet `floating` resolves through the EXISTING aside composition —
 *    two mutually-exclusive responsive `Sidebar` bands with distinct ids (same
 *    machinery as Floating-overlay/Floating-overlay). This proves what the architecture ACTUALLY
 *    guarantees; it does NOT assert any invented distinct floating treatment;
 *  - mobile `overlay` resolves through the existing `ShellMobileNav
 *    pattern="overlay"` → `OverlayNavigation` (a Drawer composition), closed by
 *    default at SSR (no dialog/CTA/focusable);
 *  - standard CTA: renders in the aside ≥md and inside the overlay <md when
 *    enabled + label + href (aside via UI-05; overlay via the UI-09 consumer fix);
 *    disabled/no-href/no-label → no CTA; no invented destination;
 *  - drawer behavior is unchanged (the consumer still serves `drawer`);
 *  - CTA does not leak into the desktop/header path; deterministic IDs/ARIA; no
 *    duplicate landmarks/IDs; no bottom bar; i18n inertness.
 *
 * These tests assert PRESENT STRUCTURE only — they do NOT invent `floating` or
 * `minimal` visual contracts, both of which remain deferred (see
 * todo-milestone-ui-09.md §5).
 */

const el = (type: string, props: Record<string, unknown> | null, ...children: ReactNode[]) =>
  createElement(type, props, ...children);

const headerPlain = el("header", null, "Brand");
const footer = el("footer", null, "Foot");
const main = el("p", null, "Body");

const base = { locale: "en", pageBindings: [] };

const allIds = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);

const rail = el("ul", null, el("li", null, el("a", { href: "/en/1" }, "One")));
const immersive = resolveUiConfig(FLOATING_OVERLAY_UI);
const immersiveWithCta = resolveUiConfig({
  ...FLOATING_OVERLAY_UI,
  cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
});

describe("ShellEngine — Floating-overlay desktop/tablet floating (existing aside composition)", () => {
  it("renders a standard header, the floating→aside trajectory, and NO bottom bar", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersive,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ...base,
      }),
    );
    expect(html).toContain("<header>Brand</header>");
    expect(html).toContain("ui-shell-sidebar");
    // Floating resolves through the EXISTING aside → two responsive Sidebar bands:
    expect(html).toContain('id="shell-sidebar-desktop-rail"');
    expect(html).toContain('id="shell-sidebar-tablet-rail"');
    expect(html).toContain('class="hidden lg:block"');
    expect(html).toContain('class="hidden md:block lg:hidden"');
    // No bottom-bar composition:
    expect(html).not.toContain("shell-bottom-bar");
    expect(html).not.toContain("ui-shell-bottom-bar");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the desktop+tablet aside bands are mutually exclusive (+ distinct ids, one landmark per width)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersive,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ...base,
      }),
    );
    expect(html.match(/aria-label="Primary"/g) ?? []).toHaveLength(2); // both bands present
    expect(html).toContain("flex flex-col flex-1 md:flex-row md:flex-wrap");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("renders NO aside CTA for defaults-only immersive (enabled false)", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersive,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book Now",
        ctaHref: "/booking",
        ...base,
      }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("enabled + label + NO href renders no aside CTA (a destination is never invented)", () => {
    const resolved = resolveUiConfig({
      ...FLOATING_OVERLAY_UI,
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book Now",
        ...base,
      }),
    );
    expect(html).not.toContain("nav-item-cta");
  });

  it("P6-3C — enabled + label + href renders the CTA in the TOP region, OUTSIDE the floating rail", () => {
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved: immersiveWithCta,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book Now",
        ctaHref: "/booking",
        ...base,
      }),
    );
    expect(html).toContain("nav-item-cta");
    expect(html).toContain("/booking");
    expect(html).not.toContain("ui-cta-prominent"); // immersive composition style stays standard
    // One action, after the header and BEFORE the floating rail:
    expect(html.match(/nav-item-cta/g) ?? []).toHaveLength(1);
    expect(html.indexOf("nav-item-cta")).toBeGreaterThan(html.indexOf("<header>"));
    expect(html.indexOf("nav-item-cta")).toBeLessThan(html.indexOf("shell-sidebar-desktop-rail"));
  });

  it("disabled + label + href renders nothing", () => {
    const resolved = resolveUiConfig({
      ...FLOATING_OVERLAY_UI,
      cta: { enabled: false, action: "book", label: "Book", href: "/booking" },
    });
    const html = renderToStaticMarkup(
      ShellEngine({
        resolved,
        header: headerPlain,
        main,
        footer,
        mainId: "main",
        navigationLabel: "Primary",
        asideContent: rail,
        ctaLabel: "Book",
        ctaHref: "/booking",
        ...base,
      }),
    );
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });
});

describe("ShellEngine — Floating-overlay decision trajectories (floating aside, overlay, no bottom bar)", () => {
  it("resolveShellPattern(immersive) maps floating/floating to aside, overlay to header+trigger", () => {
    const d = resolveShellPattern(immersive);
    expect(d.desktop.primitiveKind).toBe("floating");
    expect(d.desktop.slot).toBe("aside");
    expect(d.tablet.primitiveKind).toBe("floating");
    expect(d.tablet.slot).toBe("aside");
    expect(d.mobile.primitiveKind).toBe("overlay");
    expect(d.mobile.slot).toBe("header");
    expect(d.mobile.trigger).toBe(true);
  });

  it("P6-3C — immersive + complete CTA: the ONE top slot at every viewport (no aside, no bottom)", () => {
    const d = resolveShellPattern(immersiveWithCta);
    expect(d.desktop.ctaSlot).toBe("top");
    expect(d.tablet.ctaSlot).toBe("top");
    expect(d.mobile.ctaSlot).toBe("top");
    expect(d.cta.present).toBe(true);
  });
});

describe("SiteHeader — Floating-overlay mobile overlay (navigation only; P6-3C: no CTA in the disclosure)", () => {
  const resolvedCta = resolveUiConfig({
    ...FLOATING_OVERLAY_UI,
    cta: { enabled: true, action: "book", label: "Book Now", href: "/booking" },
  });

  it("CLOSED SSR: trigger present; NO dialog/CTA/focusable; single nav landmark; no duplicate ids", () => {
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('aria-controls="shell-mobile-nav-panel"');
    expect(html).not.toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("md:hidden");
    // Floating-overlay (aside composition) exposes its single ≥md nav landmark in the
    // shell SIDEBAR (both desktop+tablet slots are aside), not in the header:
    expect(html).not.toContain('aria-label="Primary navigation"');
    // Closed overlay contributes no dialog, no CTA, no links/focusables:
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
    const ids = allIds(html);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("P6-3C — OPEN overlay (forced): the disclosure carries NAVIGATION only (no CTA inside it)", () => {
    mockForcedOpen = true;
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html.match(/role="dialog"/g) ?? []).toHaveLength(1);
    // No CTA is composed into the overlay: the ONE Book Now lives in the shell's
    // top region (engine-composed), independently of the disclosure.
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
    // B1: trigger owns the id; panel uses `-panel` id and is named by trigger.
    expect(html).toContain('id="shell-mobile-nav"');
    expect(html).toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-labelledby="shell-mobile-nav"');
    expect(html).toContain("ui-drawer-backdrop");
  });

  it("OPEN overlay with enabled + label but NO href: still no CTA inside the dialog (never invented)", () => {
    mockForcedOpen = true;
    const resolvedNoHref = resolveUiConfig({
      ...FLOATING_OVERLAY_UI,
      cta: { enabled: true, action: "book", label: "Book Now" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedNoHref }));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
  });

  it("OPEN overlay with disabled CTA: still no CTA inside the dialog", () => {
    mockForcedOpen = true;
    const resolvedDisabled = resolveUiConfig({
      ...FLOATING_OVERLAY_UI,
      cta: { enabled: false, action: "book", label: "Book", href: "/booking" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedDisabled }));
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/booking");
  });

  it("the CTA does not leak into the desktop/header path for the overlay composition", () => {
    // Floating-overlay's desktop/tablet slots are aside and its mobile layer is the
    // overlay: `SiteHeader` therefore composes NO CTA in any state (P6-3C — the
    // single Book Now is engine-composed in the shell's top region).
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedCta }));
    expect(html).not.toContain("ui-shell-header-row");
    // In the CLOSED header there is no CTA anywhere:
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("ui-shell-cta");
  });
});

describe("SiteHeader — the disclosure consumer is CTA-free for every mobile pattern (P6-3C)", () => {
  // A drawer-based configuration (sidebar-drawer) with a complete CTA composes NO CTA inside
  // the DRAWER anymore: the one action lives in the shell's top region for every
  // pattern. Uses the same forced-open hook.
  it("a drawer-pattern configuration composes no CTA inside the drawer dialog", () => {
    mockForcedOpen = true;
    const resolvedDrawer = resolveUiConfig({
      ...SIDEBAR_DRAWER_UI,
      cta: { enabled: true, action: "book", label: "Book", href: "/book" },
    });
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: resolvedDrawer }));
    expect(html.match(/role="dialog"/g) ?? []).toHaveLength(1);
    expect(html).not.toContain("nav-item-cta");
    expect(html).not.toContain("/book");
    // B1: drawer-parity path uses the same corrected panel relationship.
    expect(html).toContain('id="shell-mobile-nav-panel"');
    expect(html).toContain('aria-labelledby="shell-mobile-nav"');
  });
});

describe("SiteHeader — Floating-overlay (overlay, not bottom-bar) never emits the bottom-bar-only i18n value", () => {
  it("moreMenu dictionary value is absent from the Floating-overlay header assembly", () => {
    const dictionary = getDictionary("en");
    const html = renderToStaticMarkup(SiteHeader({ locale: "en", resolved: immersive }));
    expect(html).not.toContain(dictionary.navigation.moreMenu);
  });
});

