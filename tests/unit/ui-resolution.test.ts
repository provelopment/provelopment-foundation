import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import { FOUNDATION_UI_DEFAULTS } from "@/core/ui/defaults";
import {
  CONTENT_WIDTHS,
  CTA_ACTIONS,
  CTA_STYLES,
  DESKTOP_NAVIGATION_PATTERNS,
  MOBILE_NAVIGATION_PATTERNS,
  SHELL_VARIANTS,
  TABLET_NAVIGATION_PATTERNS,
  THEME_MODES,
  THEME_RADII,
  UI_DENSITIES,
  assertResolvedUiConfigComplete,
  resolveUiConfig,
  UiConfigResolutionError,
} from "@/core/ui";
import type { ResolvedUiConfig } from "@/core/ui";

/**
 * UI-02 - Configuration Infrastructure resolution-behavior tests
 * (amended at the single-presentation closure — .project-instructions/CHANGELOG.md).
 *
 * These tests encode the DOCUMENTED RESOLUTION CONTRACT
 * (.project-instructions/plan/archive/todo-milestone-ui-02.md):
 *   1. there is ONE canonical presentation; a config that omits a leaf resolves
 *      the Foundation default for it — there is no selection layer;
 *   2. an explicit override wins over the Foundation default, deterministically
 *      and purely (overriding one leaf never changes another);
 *   3. CTA stays business-neutral (enabled false, action/label/href undefined);
 *   4. completeness fails loudly; vocab-backed resolved leaves stay within the
 *      shipped vocabulary.
 */

describe("UI-02 - the canonical defaults fill every omitted leaf", () => {
  it("resolveUiConfig({}) resolves the canonical Foundation presentation", () => {
    const resolved = resolveUiConfig({});
    expect(resolved.navigation.desktop).toBe("sidebar");
    expect(resolved.navigation.tablet).toBe("collapsed-sidebar");
    expect(resolved.navigation.mobile).toBe("bottom-bar");
    expect(resolved.shell).toEqual(FOUNDATION_UI_DEFAULTS.shell);
    expect(resolved.navigation.sidebar.mode).toBe("open");
    expect(resolved.navigation.top.mode).toBe("open");
    expect(resolved.navigation.bottom.mode).toBe("open");
    expect(resolved.density).toBe(FOUNDATION_UI_DEFAULTS.density);
    expect(resolved.content.width).toBe(FOUNDATION_UI_DEFAULTS.content.width);
    expect(resolved.presentation).toEqual(FOUNDATION_UI_DEFAULTS.presentation);
    expect(resolved.cta.enabled).toBe(false);
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });

  it("explicit per-leaf overrides win over the canonical defaults without disturbing siblings", () => {
    const resolved = resolveUiConfig({ density: "spacious" });
    expect(resolved.density).toBe("spacious"); // overridden leaf
    expect(resolved.navigation.desktop).toBe("sidebar"); // canonical default preserved
    expect(resolved.shell).toEqual(FOUNDATION_UI_DEFAULTS.shell);
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });

  it("the resolved object carries no presentation-selection leaf", () => {
    expect(Object.keys(resolveUiConfig({}))).not.toContain("preset");
  });
});

describe("UI-02 - deterministic precedence (override > Foundation default)", () => {
  it("canonical defaults with overrides merge deterministically", () => {
    const resolved = resolveUiConfig({
      navigation: { mobile: "drawer" },
      density: "compact",
    });
    expect(resolved.navigation.desktop).toBe("sidebar"); // canonical default
    expect(resolved.navigation.mobile).toBe("drawer"); // override wins
    expect(resolved.density).toBe("compact"); // override wins
    expect(resolved.shell.header).toBe("standard");
  });

  it("is pure and deterministic: same input twice -> deep-equal outputs; input never mutated", () => {
    const raw: Parameters<typeof resolveUiConfig>[0] = {
      navigation: { mobile: "bottom-bar" },
      density: "compact",
    };
    const a = resolveUiConfig(raw);
    const b = resolveUiConfig(raw);
    expect(a).toEqual(b);
    expect(raw).toEqual({ navigation: { mobile: "bottom-bar" }, density: "compact" });
  });
});

describe("UI-02 - neutral CTA (D1)", () => {
  it("never invents a business action: enabled false, action/label/href undefined, style standard", () => {
    const plain = resolveUiConfig({});
    expect(plain.cta.enabled).toBe(false);
    expect(plain.cta.action).toBeUndefined();
    expect(plain.cta.label).toBeUndefined();
    expect(plain.cta.href).toBeUndefined(); // UI-07 D1: destination adopter-owned
    expect(plain.cta.style).toBe("standard");
    expect(plain.cta.icon).toBeUndefined();
    expect(plain.cta.iconPosition).toBe("start");
    expect(plain.cta.state).toBe("default");
  });

  it("an explicit adopter CTA override is preserved (incl. the UI-07 href destination)", () => {
    const resolved = resolveUiConfig({
      cta: { enabled: true, action: "book", label: "Book Now", href: "/booking", style: "standard" },
    });
    expect(resolved.cta.enabled).toBe(true);
    expect(resolved.cta.action).toBe("book");
    expect(resolved.cta.label).toBe("Book Now");
    expect(resolved.cta.href).toBe("/booking");
  });
});

describe("UI-02 - completeness matrix (every leaf defined, vocab-backed leaves in vocabulary)", () => {
  const cases = [
    {},
    { navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" } },
    { navigation: { desktop: "minimal", tablet: "top-compact", mobile: "drawer" } },
    { navigation: { desktop: "floating", tablet: "floating", mobile: "overlay" } },
    { density: "compact", navigation: { mobile: "bottom-bar" } },
    { cta: { enabled: true, action: "contact", style: "prominent" } },
    { presentation: { typography: "editorial", rhythm: "structured", surface: "paper", header: "rule", hero: "split" } },
  ];

  it("resolves every case without throwing and every leaf is defined", () => {
    for (const cfg of cases) {
      const resolved = resolveUiConfig(cfg as Parameters<typeof resolveUiConfig>[0]);
      expect(resolved.shell.header).toBeDefined();
      expect(resolved.shell.footer).toBeDefined();
      expect(resolved.shell.sidebar.collapsible).toBeDefined();
      expect(resolved.navigation.desktop).toBeDefined();
      expect(resolved.navigation.tablet).toBeDefined();
      expect(resolved.navigation.mobile).toBeDefined();
      expect(resolved.density).toBeDefined();
      expect(resolved.content.width).toBeDefined();
      expect(resolved.cta.enabled).toBeDefined();
      expect(resolved.cta.style).toBeDefined();
      expect(resolved.theme.mode).toBeDefined();
      expect(resolved.theme.radius).toBeDefined();
      expect(resolved.presentation.typography).toBeDefined();
    }
  });

  it("every vocab-backed resolved leaf is a member of its shipped vocabulary", () => {
    for (const cfg of cases) {
      const resolved = resolveUiConfig(cfg as Parameters<typeof resolveUiConfig>[0]);
      expect(SHELL_VARIANTS).toContain(resolved.shell.header);
      expect(SHELL_VARIANTS).toContain(resolved.shell.footer);
      expect(DESKTOP_NAVIGATION_PATTERNS).toContain(resolved.navigation.desktop);
      expect(TABLET_NAVIGATION_PATTERNS).toContain(resolved.navigation.tablet);
      expect(MOBILE_NAVIGATION_PATTERNS).toContain(resolved.navigation.mobile);
      expect(UI_DENSITIES).toContain(resolved.density);
      expect(CONTENT_WIDTHS).toContain(resolved.content.width);
      expect(CTA_STYLES).toContain(resolved.cta.style);
      if (resolved.cta.action !== undefined) {
        expect(CTA_ACTIONS).toContain(resolved.cta.action);
      }
      expect(THEME_MODES).toContain(resolved.theme.mode);
      expect(THEME_RADII).toContain(resolved.theme.radius);
    }
  });
});

describe("UI-02 - controlled error surface (completeness fails loudly)", () => {
  it("throws UiConfigResolutionError with the missing leaf path on a partial resolved object", () => {
    const partial: Partial<ResolvedUiConfig> = {
      shell: { header: "standard", footer: "standard", sidebar: { collapsible: false } },
    };
    expect(() => assertResolvedUiConfigComplete(partial)).toThrow(UiConfigResolutionError);
    try {
      assertResolvedUiConfigComplete(partial);
    } catch (err) {
      expect(err).toBeInstanceOf(UiConfigResolutionError);
      const error = err as UiConfigResolutionError;
      expect(error.issues.some((issue) => issue.path === "navigation.desktop")).toBe(true);
      expect(error.issues.some((issue) => issue.message.includes("missing resolved value"))).toBe(true);
    }
  });

  it("rejects a vocab-invalid resolved value (guards bad constants)", () => {
    expect(() =>
      assertResolvedUiConfigComplete({
        ...resolveUiConfig({}),
        navigation: { ...resolveUiConfig({}).navigation, desktop: "mega-menu" },
      } as unknown as Partial<ResolvedUiConfig>),
    ).toThrow(/mega-menu/);
  });

  it("a resolved object missing a default leaf fails completeness (never silently resolves to undefined)", () => {
    const sansDesktop = {
      shell: { header: "standard", footer: "standard" },
      navigation: { tablet: "top-compact", mobile: "drawer" },
      density: "comfortable",
      content: { width: "standard" },
      cta: { enabled: false, style: "standard" },
      theme: { mode: "system", radius: "medium" },
    } as unknown as Partial<ResolvedUiConfig>;
    expect(() => assertResolvedUiConfigComplete(sansDesktop)).toThrow(/navigation\.desktop/);
  });
});

describe("Single presentation - no selection layer in the core (source-scan)", () => {
  const dir = path.join(process.cwd(), "src", "core", "ui");

  it("no core-ui module declares or selects a preset (no profile table, no default, no lookup)", () => {
    for (const file of [
      "defaults.ts",
      "resolve.ts",
      "index.ts",
      "shell.ts",
      "vocabulary.ts",
      "presentation.ts",
      "controls.ts",
    ]) {
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toMatch(/defaultPreset|uiPresetProfiles|UI_PRESETS|UiPresetProfile/);
      expect(source, file).not.toMatch(/\bpreset\s*[:=]\s*"/); // no preset selection/assignment
    }
  });

  it("the retired profile module does not exist", () => {
    expect(() => readFileSync(path.join(dir, "presets.ts"), "utf8")).toThrow();
  });
});

describe("P0-1 — the sidebar capability leaf is declarative and shared (no identity coupling)", () => {
  it("the canonical composition resolves collapsible=true; a config may opt out explicitly", () => {
    expect(resolveUiConfig({}).shell.sidebar.collapsible).toBe(true);
    expect(resolveUiConfig({ shell: { sidebar: { collapsible: false } } }).shell.sidebar.collapsible).toBe(false);
  });

  it("a custom configuration expresses the same sidebar capability", () => {
    const custom = resolveUiConfig({
      navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" },
      shell: { sidebar: { collapsible: true } },
      cta: { enabled: true, action: "book", label: "Book Now", style: "standard" },
    });
    expect(custom.shell.sidebar.collapsible).toBe(true);
    expect(custom.navigation.desktop).toBe("sidebar");
    expect(custom.cta.enabled).toBe(true);
  });

  it("completeness requires the sidebar leaf (a missing value fails loudly)", () => {
    const sansSidebar = {
      ...resolveUiConfig({}),
      shell: { header: "standard", footer: "standard" },
    } as unknown as Partial<ResolvedUiConfig>;
    expect(() => assertResolvedUiConfigComplete(sansSidebar)).toThrow(/shell\.sidebar\.collapsible/);
  });
});

describe("FS-5 — theme background (adopter-owned presentation leaf)", () => {
  it("defaults the background to undefined (existing token renders)", () => {
    const resolved = resolveUiConfig({});
    expect(resolved.theme.background).toBeUndefined();
    expect(resolved.theme).toEqual(FOUNDATION_UI_DEFAULTS.theme);
  });

  it("passes a configured background hex through resolution", () => {
    const resolved = resolveUiConfig({ theme: { background: "#fafafa" } });
    expect(resolved.theme.background).toBe("#fafafa");
    expect(resolved.theme.mode).toBe("system");
  });

  it("keeps the background identity-free (no presentation-name branch)", () => {
    const resolved = resolveUiConfig({
      navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
      theme: { background: "#123456" },
    });
    expect(resolved.theme.background).toBe("#123456");
    expect(resolveUiConfig({ theme: { background: "#123456" } }).theme.background).toBe("#123456");
  });
});
