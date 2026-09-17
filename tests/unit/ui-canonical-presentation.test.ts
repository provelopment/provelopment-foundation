import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { FOUNDATION_UI_CAPABILITIES, FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import { resolveUiConfig } from "@/core/ui";

/**
 * The canonical Foundation presentation (the flattened default decision).
 *
 * Founder-approved contract (the UI-05 milestone contract (retired plan; Git history) §2,
 * amended by the single-presentation closure — the project changelog (Git history)):
 *  - there is ONE canonical presentation and NO selection layer: a config that
 *    omits a leaf resolves the Foundation default for it;
 *  - the values the canonical presentation used are ordinary entries in
 *    FOUNDATION_UI_DEFAULTS (`navigation.desktop/tablet/mobile`, collapsible rail);
 *  - explicit developer overrides still win per leaf;
 *  - the shipped reference config declares no selection key and resolves the
 *    canonical composition (sidebar ≥md / collapsed-sidebar tablet / bottom-bar <md).
 */
describe("Canonical Foundation presentation — flattened defaults", () => {
  it("FOUNDATION_UI_DEFAULTS carries the canonical composition values", () => {
    expect(FOUNDATION_UI_DEFAULTS.navigation.desktop).toBe("sidebar");
    expect(FOUNDATION_UI_DEFAULTS.navigation.tablet).toBe("collapsed-sidebar");
    expect(FOUNDATION_UI_DEFAULTS.navigation.mobile).toBe("bottom-bar");
    expect(FOUNDATION_UI_DEFAULTS.shell.sidebar.collapsible).toBe(true);
    expect(FOUNDATION_UI_DEFAULTS.shell.header).toBe("standard");
    expect(FOUNDATION_UI_DEFAULTS.shell.footer).toBe("standard");
    expect(FOUNDATION_UI_DEFAULTS.cta.style).toBe("standard");
    expect(FOUNDATION_UI_DEFAULTS.density).toBe("comfortable");
    expect(FOUNDATION_UI_DEFAULTS.content.width).toBe("standard");
    expect(FOUNDATION_UI_DEFAULTS.theme.radius).toBe("medium");
    expect(FOUNDATION_UI_DEFAULTS.theme.mode).toBe("system");
  });

  it("an empty config resolves exactly the canonical defaults", () => {
    const resolved = resolveUiConfig({});
    expect(resolved.navigation.desktop).toBe(FOUNDATION_UI_DEFAULTS.navigation.desktop);
    expect(resolved.navigation.tablet).toBe(FOUNDATION_UI_DEFAULTS.navigation.tablet);
    expect(resolved.navigation.mobile).toBe(FOUNDATION_UI_DEFAULTS.navigation.mobile);
    expect(resolved.shell).toEqual(FOUNDATION_UI_DEFAULTS.shell);
    expect(resolved.cta.style).toBe(FOUNDATION_UI_DEFAULTS.cta.style);
    expect(resolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(resolved.content).toEqual(FOUNDATION_UI_DEFAULTS.content);
    expect(resolved.presentation).toEqual(FOUNDATION_UI_DEFAULTS.presentation);
    // P5-5 — the control leaves are neutral (adopter configuration):
    expect(resolved.navigation.sidebar.mode).toBe("open");
    expect(resolved.navigation.top.mode).toBe("open");
    expect(resolved.navigation.bottom.mode).toBe("open");
  });

  it("explicit per-leaf overrides still win over the canonical defaults", () => {
    const resolved = resolveUiConfig({
      navigation: { mobile: "drawer" },
      density: "compact",
    });
    expect(resolved.navigation.desktop).toBe("sidebar"); // canonical default fills
    expect(resolved.navigation.mobile).toBe("drawer"); // override wins
    expect(resolved.density).toBe("compact"); // override wins
  });

  it("the config surface carries NO presentation-selection key", () => {
    const resolved = resolveUiConfig({} as Parameters<typeof resolveUiConfig>[0]);
    expect(Object.keys(resolved)).not.toContain("preset");
  });

  it("the shipped Foundation reference site resolves the canonical composition (FS-2)", () => {
    // `site.config.json` declares no presentation key and no navigation/shell
    // leaves, so the canonical defaults govern: sidebar ≥md / collapsed-sidebar
    // tablet / bottom-bar <md.
    const demoResolved = resolveUiConfig(siteConfig.ui ?? {});
    expect(demoResolved.navigation.desktop).toBe("sidebar");
    expect(demoResolved.navigation.tablet).toBe("collapsed-sidebar");
    expect(demoResolved.navigation.mobile).toBe("bottom-bar");
    expect(demoResolved.shell).toEqual({ header: "standard", footer: "standard", sidebar: { collapsible: true } });
    expect(demoResolved.navigation.sidebar.mode).toBe("open");
    expect(demoResolved.navigation.top.mode).toBe("open");
    expect(demoResolved.navigation.bottom.mode).toBe("open");
  });

  it("the capability claims are ONE audited row for the canonical presentation", () => {
    expect(FOUNDATION_UI_CAPABILITIES.sidebar).toBe("supported");
    expect(FOUNDATION_UI_CAPABILITIES.collapsibleSidebar).toBe("supported");
    expect(FOUNDATION_UI_CAPABILITIES.bottomMobileNavigation).toBe("supported");
    expect(FOUNDATION_UI_CAPABILITIES.mobileDrawer).toBe("supported");
    expect(FOUNDATION_UI_CAPABILITIES.primaryCta).toBe("supported");
  });
});
