import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { parseSiteConfig } from "@/config/loader";
import { uiConfigSchema } from "@/config/schema";
import {
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  FOUNDATION_UI_CAPABILITIES,
  MOBILE_NAVIGATION_PATTERNS,
  resolveUiConfig,
  SHELL_VARIANTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
} from "@/core/ui";

/**
 * UI-01 — Architecture & Contract tests.
 *
 * These tests encode the CONTRACT DECISIONS, not just the implementation:
 *  - the vocabulary is closed (one canonical presentation, no selectable
 *    profiles — the retired `ui.preset` key is rejected);
 *  - the capability claim row is complete (every roadmap §24 matrix column);
 *  - an absent `ui` block, an empty block and a partially-specified block all
 *    parse successfully — nothing is injected at the contract surface;
 *  - invalid values and unknown keys fail clearly;
 *  - the shipped reference configuration declares no presentation key and
 *    resolves the canonical composition.
 */

const baseConfig = {
  site: {
    url: "https://example.com",
    name: "Example",
    tagline: "An example site",
    description: "A site used for testing.",
  },
  i18n: {
    defaultLocale: "en",
    locales: [{ code: "en", label: "English" }],
  },
  contact: { email: "hello@example.com" },
  socialLinks: [
    { platform: "github", label: "GitHub", href: "https://github.com/example" },
  ],
  navigation: [{ label: "Home", href: "/" }],
};

const validUiBlock = {
  shell: { header: "standard", footer: "standard" },
  navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
  density: "comfortable",
  content: { width: "standard" },
  cta: { enabled: true, action: "book", label: "Book Now", style: "standard" },
  theme: { mode: "system", radius: "medium" },
};

describe("UI-01 vocabulary — the closed configuration vocabulary", () => {
  it("rejects the retired presentation-selection key at the schema level", () => {
    expect(uiConfigSchema.safeParse({ preset: "classic" }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ preset: "adaptive" }).success).toBe(false);
  });

  it("the schema admits every vocabulary value (schema ↔ vocabulary agreement)", () => {
    for (const shell of SHELL_VARIANTS) {
      expect(
        uiConfigSchema.safeParse({ shell: { header: shell, footer: shell } }).success,
      ).toBe(true);
    }
    for (const desktop of DESKTOP_NAVIGATION_PATTERNS) {
      expect(uiConfigSchema.safeParse({ navigation: { desktop } }).success).toBe(true);
    }
    for (const tablet of TABLET_NAVIGATION_PATTERNS) {
      expect(uiConfigSchema.safeParse({ navigation: { tablet } }).success).toBe(true);
    }
    for (const mobile of MOBILE_NAVIGATION_PATTERNS) {
      expect(uiConfigSchema.safeParse({ navigation: { mobile } }).success).toBe(true);
    }
    for (const density of UI_DENSITIES) {
      expect(uiConfigSchema.safeParse({ density }).success).toBe(true);
    }
    for (const width of CONTENT_WIDTHS) {
      expect(uiConfigSchema.safeParse({ content: { width } }).success).toBe(true);
    }
    for (const style of CTA_STYLES) {
      expect(uiConfigSchema.safeParse({ cta: { style } }).success).toBe(true);
    }
    for (const action of CTA_ACTIONS) {
      expect(uiConfigSchema.safeParse({ cta: { action } }).success).toBe(true);
    }
    for (const mode of THEME_MODES) {
      expect(uiConfigSchema.safeParse({ theme: { mode } }).success).toBe(true);
    }
    for (const radius of THEME_RADII) {
      expect(uiConfigSchema.safeParse({ theme: { radius } }).success).toBe(true);
    }
  });

  it("keeps the navigation vocabulary disjoint per viewport (roadmap §15)", () => {
    // A value valid on one tier must not silently mean something else on
    // another: `mobile: "sidebar"` is invalid by construction.
    expect(MOBILE_NAVIGATION_PATTERNS).not.toContain("sidebar");
    expect(TABLET_NAVIGATION_PATTERNS).not.toContain("sidebar");
    expect(DESKTOP_NAVIGATION_PATTERNS).not.toContain("drawer");
  });
});

describe("UI-01 capability claims — one complete contract row", () => {
  const capabilityKeys = [
    "topNavigation",
    "sidebar",
    "collapsibleSidebar",
    "bottomMobileNavigation",
    "mobileDrawer",
    "primaryCta",
    "overlayNavigation",
    "secondaryPanel",
    "complexNavigation",
    "visualFirst",
    "applicationDashboard",
  ] as const;

  it("the claim row is complete per the agreed contract (every §24 matrix column)", () => {
    for (const key of capabilityKeys) {
      expect(FOUNDATION_UI_CAPABILITIES[key], `capabilities.${key}`).toBeDefined();
      expect(
        ["supported", "optional", "limited", "unsupported"],
        `capabilities.${key}`,
      ).toContain(FOUNDATION_UI_CAPABILITIES[key]);
    }
    expect(Object.keys(FOUNDATION_UI_CAPABILITIES).sort()).toEqual([...capabilityKeys].sort());
  });

  it("the supported claims match the canonical resolved composition", () => {
    const resolved = resolveUiConfig({});
    // sidebar / collapsibleSidebar: resolved leaves select the aside rail.
    expect(SHELL_VARIANTS).toContain(resolved.shell.header);
    expect(DESKTOP_NAVIGATION_PATTERNS).toContain(resolved.navigation.desktop);
    expect(resolved.navigation.desktop).toBe("sidebar");
    expect(resolved.shell.sidebar.collapsible).toBe(true);
    // bottomMobileNavigation: the canonical mobile composition.
    expect(MOBILE_NAVIGATION_PATTERNS).toContain(resolved.navigation.mobile);
    expect(resolved.navigation.mobile).toBe("bottom-bar");
    expect(CTA_STYLES).toContain(resolved.cta.style);
  });
});

describe("UI-01 — no presentation selection at the contract surface", () => {
  it("{} parses successfully at the schema level", () => {
    expect(uiConfigSchema.safeParse({}).success).toBe(true);
  });

  it("a partially-specified ui block parses and injects nothing", () => {
    const parsed = uiConfigSchema.safeParse({ density: "comfortable" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ density: "comfortable" });
      expect(parsed.data).not.toHaveProperty("preset");
      expect(parsed.data.density).toBe("comfortable");
    }
  });

  it("an absent ui block leaves the flattened site config ui undefined", () => {
    expect(parseSiteConfig(baseConfig).ui).toBeUndefined();
  });

  it("an empty ui block loads as an empty object", () => {
    const config = parseSiteConfig({ ...baseConfig, ui: {} });
    expect(config.ui).toEqual({});
  });

  it("no selection key exists — the resolved composition comes from the canonical defaults", () => {
    expect(uiConfigSchema.safeParse({}).success).toBe(true);
    const resolved = resolveUiConfig(parseSiteConfig({ ...baseConfig, ui: {} }).ui ?? {});
    expect(Object.keys(resolved)).not.toContain("preset");
    expect(resolved.navigation.desktop).toBe("sidebar");
  });
});

describe("FS-2 — the shipped Foundation reference site presents the canonical UI", () => {
  it("site.config.json declares NO presentation key: the canonical composition is the engine default", () => {
    // Owner decision (2026-09): the Foundation presents ONE canonical
    // presentation. The shipped config therefore selects nothing — the resolved
    // composition comes from `FOUNDATION_UI_DEFAULTS`, not from a config leaf.
    expect(siteConfig.ui).toBeDefined();
    expect(siteConfig.ui).not.toHaveProperty("preset");
    expect(siteConfig.ui).not.toHaveProperty("presetComparison");
    // The reference site ships no explicit navigation/shell leaves (FS-2), so
    // the canonical composition governs: sidebar ≥md / collapsed-sidebar tablet
    // / bottom-bar <md — one presentation, one composition.
    expect(siteConfig.ui?.navigation).toBeUndefined();
    expect(siteConfig.ui?.shell).toBeUndefined();
  });
});

describe("UI-01 — invalid or unknown configuration fails clearly", () => {
  it("rejects the retired `preset` key (unknown key, never a silent profile selection)", () => {
    const parsed = uiConfigSchema.safeParse({ preset: "glamorous" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.message.includes("preset"))).toBe(true);
    }
    expect(uiConfigSchema.safeParse({ preset: "classic" }).success).toBe(false);
  });

  it("rejects an unknown ui key loudly (config typo)", () => {
    expect(() =>
      parseSiteConfig({ ...baseConfig, ui: { presets: "classic" } }),
    ).toThrow(/presets/);
  });

  it("rejects a cross-tier navigation value (roadmap §21 example)", () => {
    expect(() =>
      parseSiteConfig({
        ...baseConfig,
        ui: { navigation: { mobile: "sidebar" } },
      }),
    ).toThrow(/must be one of: drawer, bottom-bar, top, overlay/);
  });

  it("rejects an unknown density value", () => {
    expect(() =>
      parseSiteConfig({ ...baseConfig, ui: { density: "cozy" } }),
    ).toThrow(/must be one of: compact, comfortable, spacious/);
  });
});

describe("UI-01 — loader mapping", () => {
  it("maps the ui namespace through the validated loader", () => {
    const config = parseSiteConfig({ ...baseConfig, ui: validUiBlock });
    expect(config.ui).toEqual(validUiBlock);
    expect(config.ui).not.toHaveProperty("preset");
  });

  it("the shipped Foundation reference site ui block maps through the validated loader with no presentation key", () => {
    const config = parseSiteConfig({ ...baseConfig, ui: siteConfig.ui ?? {} });
    expect(config.ui).toBeDefined();
    expect(config.ui).not.toHaveProperty("preset");
    // …and the canonical composition still resolves (from the Foundation defaults).
    const resolved = resolveUiConfig(config.ui ?? {});
    expect(resolved.navigation.desktop).toBe("sidebar");
    expect(resolved.navigation.mobile).toBe("bottom-bar");
  });
});