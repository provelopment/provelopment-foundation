import { describe, expect, it } from "vitest";

import {
  FOUNDATION_UI_CAPABILITIES,
  resolveShellPattern,
  resolveUiConfig,
  type ResolvedUiConfig,
  type UiFoundationCapabilities,
} from "@/core/ui";

/**
 * P0-6 — Capability-Claim Gate (test-enforced).
 *
 * The Foundation's §24 capability matrix is CLAIM DATA, not decoration. This
 * module is the single enforcement point that keeps every claim truthful:
 *
 *  - TRUTH TABLE: the audited claim row (`TRUTH_TABLE`) is the ONLY claim
 *    source. Any drift between `FOUNDATION_UI_CAPABILITIES` and this table fails
 *    CI — a level cannot be raised to `supported`/`optional` without also adding
 *    the implementation + (for supported) the browser verification AND updating
 *    this table at the same time.
 *  - EVIDENCE BINDING: for every capability claimed `supported` by the canonical
 *    composition, an executable assertion below ties the claim to the resolved
 *    configuration/decision-core evidence. Browser evidence is cited by
 *    matrix-row name in comments (the browser matrix is the behavior gate).
 *
 * Claim vocabulary (defined in `src/core/ui/defaults.ts` and
 * `plan/ui-ux-capability-inventory.md` §1):
 *  - supported   → the resolved canonical composition implements AND
 *                  browser-verifies the behavior.
 *  - optional    → shared capability implemented + verified at Foundation
 *                  level; the canonical composition does not enable it by
 *                  default but a user can configure it.
 *  - limited     → the shared capability exists only partially (documented
 *                  limitation); not the full contract.
 *  - unsupported → not claimed (roadmap "—"); absence is the default. A
 *                  primitive/config field existing in source is NOT evidence.
 *                  Custom configurations are never capability-gated.
 */

/** The audited (P0-3/P0-4/P0-5 evidence) capability-claim truth row. */
const TRUTH_TABLE: UiFoundationCapabilities = {
  topNavigation: "optional",
  sidebar: "supported",
  collapsibleSidebar: "supported",
  bottomMobileNavigation: "supported",
  mobileDrawer: "supported",
  primaryCta: "supported",
  overlayNavigation: "unsupported",
  secondaryPanel: "unsupported",
  complexNavigation: "limited",
  visualFirst: "unsupported",
  applicationDashboard: "limited",
};

/** The canonical resolved configuration (the ONE presentation), optionally with a CTA. */
function resolved(withCta = false): ResolvedUiConfig {
  return resolveUiConfig(
    withCta ? { cta: { enabled: true, label: "Book", href: "/book", style: "standard" } } : {},
  );
}

describe("P0-6 — capability-claim gate (the Foundation claims only what the architecture verifies)", () => {
  it("the capability matrix matches the audited TRUTH_TABLE (drift → CI failure)", () => {
    expect(FOUNDATION_UI_CAPABILITIES).toEqual(TRUTH_TABLE);
  });

  it("sidebar + collapsibleSidebar claims are backed by the resolved collapsible-rail composition (P0-1; browser: aside.* collapse/expand)", () => {
    const r = resolved();
    expect(r.navigation.desktop).toBe("sidebar");
    expect(r.shell.sidebar.collapsible).toBe(true);
  });

  it("bottomMobileNavigation supported resolves the bottom-bar composition (browser: bar.visible/ariaCurrent/cta)", () => {
    expect(resolved().navigation.mobile).toBe("bottom-bar");
  });

  it("mobileDrawer supported resolves a configured drawer composition (browser: {mobile}.nav.visible/ariaCurrent)", () => {
    // The canonical composition composes the bottom bar on mobile; the drawer
    // remains a supported shared capability reachable by explicit configuration.
    const drawer = resolveUiConfig({ navigation: { mobile: "drawer" } });
    expect(drawer.navigation.mobile).toBe("drawer");
    const dec = resolveShellPattern(drawer);
    expect(dec.mobile.primitiveKind).toBe("drawer");
    expect(dec.mobile.trigger).toBe(true);
  });

  it("topNavigation optional resolves a header-slot composition when configured (browser: {desktop,tablet}.nav.visible/ariaCurrent)", () => {
    const topBar = resolveUiConfig({ navigation: { desktop: "top", tablet: "top-compact" } });
    expect(topBar.navigation.desktop).toBe("top");
    const dec = resolveShellPattern(topBar);
    expect(dec.desktop.primitiveKind).toBe("top-bar");
    expect(dec.desktop.slot).toBe("header");
    // Not composed by the canonical defaults (hence "optional", not "supported").
    expect(resolved().navigation.desktop).toBe("sidebar");
  });

  it("primaryCta supported — a complete CTA reaches a non-none ctaSlot at every viewport (P0-2)", () => {
    const dec = resolveShellPattern(resolved(true));
    expect(dec.desktop.ctaSlot).not.toBe("none");
    expect(dec.tablet.ctaSlot).not.toBe("none");
    expect(dec.mobile.ctaSlot).not.toBe("none");
  });

  it("overlayNavigation unsupported in the canonical composition even though the shared primitive exists (browser: overlay.*)", () => {
    // The overlay primitive is implemented + browser-verified, but the canonical
    // composition does not use it — so the honest claim is `unsupported` (a
    // primitive existing in source is NOT evidence of support).
    expect(resolved().navigation.mobile).toBe("bottom-bar");
    const overlay = resolveUiConfig({ navigation: { desktop: "floating", tablet: "floating", mobile: "overlay" } });
    expect(resolveShellPattern(overlay).mobile.primitiveKind).toBe("overlay");
  });

  it("P0-4-gated capabilities are never claimed above their truthful level", () => {
    const c = FOUNDATION_UI_CAPABILITIES;
    // Secondary panel: no content source / composition / responsive contract
    // exists (the AppShell slot alone is NOT a capability). Always unsupported
    // until the owner decisions land.
    expect(c.secondaryPanel).toBe("unsupported");
    // Complex/grouped navigation: no grouping data model or consumer exists —
    // the shared capability is flat-nav only → limited (never supported).
    expect(c.complexNavigation).toBe("limited");
    // Application-dashboard: an app-like shell exists but NO dashboard features
    // → never supported.
    expect(["limited", "unsupported"]).toContain(c.applicationDashboard);
    // Visual-first: the distinct floating/minimal presentation is C-deferred
    // → never supported.
    expect(["limited", "unsupported"]).toContain(c.visualFirst);
  });
});
