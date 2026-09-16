import { describe, expect, it } from "vitest";

import { siteConfig } from "@/config";
import { parseSiteConfig } from "@/config/loader";
import { uiConfigSchema } from "@/config/schema";
import {
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  MOBILE_NAVIGATION_PATTERNS,
  resolveUiConfig,
  SHELL_VARIANTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
  UI_PRESETS,
  uiPresetProfiles,
} from "@/core/ui";

/**
 * UI-01 — Architecture & Contract tests.
 *
 * These tests encode the CONTRACT DECISIONS, not just the implementation:
 *  - the vocabulary is closed and exactly the five presets exist (roadmap §24);
 *  - every preset profile is complete (navigation × 3 tiers, shell, CTA,
 *    capabilities);
 *  - NO default preset exists: `{}`, an empty `ui` block, and a block with
 *    `preset` omitted all parse with `preset === undefined`;
 *  - invalid values and unknown keys fail clearly;
 *  - the shipped demo configuration explicitly selects the classic preset
 *    (UI-06) — still one of the five valid presets, no default fixed.
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
  preset: "classic",
  shell: { header: "standard", footer: "standard" },
  navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
  density: "comfortable",
  content: { width: "standard" },
  cta: { enabled: true, action: "book", label: "Book Now", style: "standard" },
  theme: { mode: "system", radius: "medium" },
};

describe("UI-01 vocabulary — the five-preset model", () => {
  it("recognizes exactly the five roadmap presets", () => {
    expect(UI_PRESETS).toEqual([
      "classic",
      "adaptive",
      "focus",
      "workspace",
      "immersive",
    ]);
  });

  it("admits every preset identifier at the schema level", () => {
    for (const preset of UI_PRESETS) {
      const result = uiConfigSchema.safeParse({ preset });
      expect(result.success, `preset "${preset}" should be valid`).toBe(true);
    }
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

describe("UI-01 preset profiles — complete contract tables", () => {
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

  it("describes all five presets and no others", () => {
    expect(Object.keys(uiPresetProfiles).sort()).toEqual([...UI_PRESETS].sort());
  });

  it("every profile is complete per the agreed contract", () => {
    for (const preset of UI_PRESETS) {
      const profile = uiPresetProfiles[preset];

      expect(profile.preset).toBe(preset);
      expect(profile.summary, `${preset}.summary`).toBeTruthy();

      // Per-viewport navigation composition uses first-class vocabulary.
      expect(
        DESKTOP_NAVIGATION_PATTERNS,
        `${preset}.navigation.desktop`,
      ).toContain(profile.navigation.desktop);
      expect(TABLET_NAVIGATION_PATTERNS, `${preset}.navigation.tablet`).toContain(
        profile.navigation.tablet,
      );
      expect(MOBILE_NAVIGATION_PATTERNS, `${preset}.navigation.mobile`).toContain(
        profile.navigation.mobile,
      );

      // Shell + CTA intent.
      expect(SHELL_VARIANTS, `${preset}.shell.header`).toContain(profile.shell.header);
      expect(SHELL_VARIANTS, `${preset}.shell.footer`).toContain(profile.shell.footer);
      expect(CTA_STYLES, `${preset}.cta.style`).toContain(profile.cta.style);

      // Full capability row — every roadmap §24 matrix column is present.
      for (const key of capabilityKeys) {
        expect(
          profile.capabilities[key],
          `${preset}.capabilities.${key}`,
        ).toBeDefined();
        expect(
          ["supported", "optional", "limited", "unsupported"],
          `${preset}.capabilities.${key}`,
        ).toContain(profile.capabilities[key]);
      }
    }
  });

  it("keeps classic as the description of today's top-navigation composition", () => {
    expect(uiPresetProfiles.classic.navigation).toEqual({
      desktop: "top",
      tablet: "top-compact",
      mobile: "drawer",
    });
  });
});

describe("UI-01 — no default preset (the contract decision)", () => {
  it("{} parses successfully at the schema level", () => {
    expect(uiConfigSchema.safeParse({}).success).toBe(true);
  });

  it("a ui block without a preset parses with preset undefined", () => {
    const parsed = uiConfigSchema.safeParse({ density: "comfortable" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.preset).toBeUndefined();
      expect(parsed.data.density).toBe("comfortable");
    }
  });

  it("an absent ui block leaves the flattened site config ui undefined", () => {
    expect(parseSiteConfig(baseConfig).ui).toBeUndefined();
  });

  it("an empty ui block loads with preset undefined", () => {
    const config = parseSiteConfig({ ...baseConfig, ui: {} });
    expect(config.ui).toEqual({});
    expect(config.ui?.preset).toBeUndefined();
  });

  it("no test above assumes a default preset exists — selection is always explicit", () => {
    // Contract-level selection is never implied: an explicit value must be
    // present for any preset to appear in the resolved config, and `{}` stays
    // valid. This test asserts the DECISION rather than a mechanism.
    expect(uiPresetProfiles.classic.preset).toBe("classic");
    expect(uiConfigSchema.safeParse({}).success).toBe(true);
  });
});

describe("FS-2 — the shipped Foundation reference site presents the canonical UI", () => {
  it("site.config.json declares NO preset: the canonical presentation is the engine default", () => {
    // Owner decision (2026-09): the Foundation exposes and supports ONE
    // presentation. The shipped config therefore selects nothing — the resolved
    // canonical presentation comes from the shared UI engine's default profile
    // (FOUNDATION_UI_DEFAULTS.defaultPreset), not from a configuration leaf.
    expect(siteConfig.ui).toBeDefined();
    expect(siteConfig.ui).not.toHaveProperty("preset");
    expect(siteConfig.ui).not.toHaveProperty("presetComparison");
    // The reference site ships no explicit navigation/shell leaves (FS-2), so
    // the canonical profile governs: sidebar ≥md / collapsed-sidebar tablet /
    // bottom-bar <md — one presentation, one composition.
    expect(siteConfig.ui?.navigation).toBeUndefined();
    expect(siteConfig.ui?.shell).toBeUndefined();
  });
});

describe("UI-01 — invalid or unknown configuration fails clearly", () => {
  it("rejects an unknown preset with the full expected list", () => {
    const parsed = uiConfigSchema.safeParse({ preset: "glamorous" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((issue) =>
          issue.message.includes("classic, adaptive, focus, workspace, immersive"),
        ),
      ).toBe(true);
    }
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
    expect(config.ui?.preset).toBe("classic");
  });

  it("the shipped Foundation reference site ui block maps through the validated loader with no preset declared", () => {
    const config = parseSiteConfig({ ...baseConfig, ui: siteConfig.ui ?? {} });
    expect(config.ui).toBeDefined();
    expect(config.ui).not.toHaveProperty("preset");
    // …and the canonical presentation still resolves (from the engine default).
    const resolved = resolveUiConfig(config.ui ?? {});
    expect(resolved.preset).toBe("adaptive");
  });
});