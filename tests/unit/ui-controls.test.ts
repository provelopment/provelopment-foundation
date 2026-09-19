import { describe, expect, it } from "vitest";

import {
  CTA_STATES,
  ICON_ASSET_PATTERN,
  ICON_POSITIONS,
  MENU_MODES,
  NAV_REGIONS,
  iconAssetUrl,
  isIconAssetName,
  menuModeClass,
  regionOrder,
  resolveControlPresentation,
  resolveUiConfig,
} from "@/core/ui";

/**
 * P5-5 — configurable controls & navigation-presentation contract.
 *
 * Covers the closed vocabulary, the resolved control presentation semantics
 * (including explicit `""` empty-string rules), the icon-asset filename
 * contract, compact-mode markers, and region ordering — the pure core of the
 * config-first adopter experience. Component rendering is covered by the
 * ui-cta/shell/browser suites.
 */
describe("P5-5 — closed vocabulary", () => {
  it("exposes the three-state menu modes (open | compact | closed)", () => {
    expect(MENU_MODES).toEqual(["open", "compact", "closed"]);
  });

  it("exposes the three sidebar regions in deterministic order", () => {
    expect(NAV_REGIONS).toEqual(["top", "middle", "bottom"]);
  });

  it("exposes icon placements and CTA states as finite sets", () => {
    expect(ICON_POSITIONS).toEqual(["start", "end"]);
    expect(CTA_STATES).toEqual(["default", "disabled"]);
  });

  it("validates plain asset filenames and rejects paths/urls (no traversal)", () => {
    for (const good of ["sidebar-open.svg", "a1_b-c.png", "icon.webp", "favicon.ico", "x.jpeg", "hero.gif"]) {
      expect(isIconAssetName(good), good).toBe(true);
    }
    for (const bad of ["", "../assets/x.svg", "a/b.svg", "https://x/y.png", "x.svg?q=1", "x", "x.exe", "a b.svg", "/abs.svg"]) {
      expect(ICON_ASSET_PATTERN.test(bad), `should reject: ${bad}`).toBe(false);
    }
  });

  it("maps a plain icon filename to the public asset URL", () => {
    expect(iconAssetUrl("sidebar-open.svg")).toBe("/assets/sidebar-open.svg");
    expect(iconAssetUrl("")).toBeUndefined();
    expect(iconAssetUrl(undefined)).toBeUndefined();
  });
});

describe("P5-5 — resolveControlPresentation (empty-string semantics)", () => {
  const fallback = { defaultIcon: "sidebar-open.svg", fallbackText: "Show navigation" };

  it("missing icon → shipped default asset; missing text → localized fallback label", () => {
    expect(resolveControlPresentation({}, fallback)).toEqual({ icon: "sidebar-open.svg", text: "Show navigation", visible: true });
  });

  it("custom icon filename is honored (Option B asset replacement)", () => {
    expect(resolveControlPresentation({ icon: "my-icon.svg" }, fallback)).toEqual({
      icon: "my-icon.svg",
      text: "Show navigation",
      visible: true,
    });
  });

  it("explicit `text: \"\"` → icon-only control (icon + no visible text)", () => {
    expect(resolveControlPresentation({ text: "" }, fallback)).toEqual({
      icon: "sidebar-open.svg",
      text: "",
      visible: true,
    });
  });

  it("explicit `icon: \"\"` → text-only control", () => {
    expect(resolveControlPresentation({ icon: "" }, fallback)).toEqual({
      icon: "",
      text: "Show navigation",
      visible: true,
    });
  });

  it("`icon: \"\"` AND `text: \"\"` → the control is NOT rendered (derived disabled state, no invented boolean)", () => {
    expect(resolveControlPresentation({ icon: "", text: "" }, fallback)).toEqual({ icon: "", text: "", visible: false });
  });
});

describe("P5-5 — menu mode ⇒ shared semantic marker", () => {
  it("compact mode maps to the single shared compact class; open/closed emit none", () => {
    expect(menuModeClass("compact")).toBe("ui-nav-mode-compact");
    expect(menuModeClass("open")).toBeUndefined();
    expect(menuModeClass("closed")).toBeUndefined();
  });
});
describe("P5-5 — region ordering (top → middle → bottom, middle default)", () => {
  it("orders a fully-specified navigation list deterministically by region", () => {
    const items = [
      { href: "/a", label: "A", position: "bottom" as const },
      { href: "/b", label: "B", position: "top" as const },
      { href: "/c", label: "C", position: undefined },
      { href: "/d", label: "D", position: "middle" as const },
      { href: "/e", label: "E", position: "top" as const },
    ];
    const sorted = [...items].sort((x, y) => regionOrder(x.position) - regionOrder(y.position));
    expect(sorted.map((i) => i.label)).toEqual(["B", "E", "C", "D", "A"]);
  });
});

describe("P5-5 — resolution of the new ui.navigation/* + ui.cta leaves", () => {
  it("resolves the neutral control defaults (byte-identical baseline)", () => {
    const r = resolveUiConfig({});
    expect(r.navigation.sidebar.mode).toBe("open");
    expect(r.navigation.sidebar.open).toEqual({ icon: undefined, text: undefined }); // falls back to shipped asset + dictionary label at composition
    expect(r.navigation.sidebar.close).toEqual({ icon: undefined, text: undefined });
    expect(r.navigation.top.mode).toBe("open");
    expect(r.navigation.bottom.mode).toBe("open");
    expect(r.cta.iconPosition).toBe("start");
    expect(r.cta.state).toBe("default");
  });

  it("resolves explicit override leaves (compact sidebar, icon-only open control)", () => {
    const r = resolveUiConfig({
      navigation: {
        sidebar: { mode: "compact", open: { text: "" }, close: { icon: "" } },
        top: { mode: "closed" },
        bottom: { mode: "compact" },
      },
      cta: { icon: "book.svg", iconPosition: "end", state: "disabled" },
    });
    expect(r.navigation.sidebar.mode).toBe("compact");
    expect(r.navigation.sidebar.open.text).toBe("");
    expect(r.navigation.sidebar.close.icon).toBe("");
    expect(r.navigation.top.mode).toBe("closed");
    expect(r.navigation.bottom.mode).toBe("compact");
    expect(r.cta.icon).toBe("book.svg");
    expect(r.cta.iconPosition).toBe("end");
    expect(r.cta.state).toBe("disabled");
  });

  it("rejects invalid enum values through the completeness guard", () => {
    expect(() =>
      resolveUiConfig({ navigation: { sidebar: { mode: "half-open" } } } as unknown as Parameters<typeof resolveUiConfig>[0]),
    ).toThrow(/navigation\.sidebar\.mode/);
    expect(() =>
      resolveUiConfig({ cta: { state: "selected" } } as unknown as Parameters<typeof resolveUiConfig>[0]),
    ).toThrow(/cta\.state/);
  });

  it("P5-5A — a downstream override wins over the Foundation defaults (precedence)", () => {
    const r = resolveUiConfig({
      navigation: {
        sidebar: { mode: "closed", open: { icon: "my-open.svg", text: "" }, close: { icon: "", text: "Shut" } },
        top: { mode: "compact" },
        bottom: { mode: "closed" },
      },
      cta: { icon: "cta.svg", iconPosition: "end", state: "disabled" },
    });
    expect(r.navigation.sidebar.mode).toBe("closed");
    expect(r.navigation.sidebar.open.icon).toBe("my-open.svg");
    expect(r.navigation.sidebar.open.text).toBe("");
    expect(r.navigation.sidebar.close.icon).toBe("");
    expect(r.navigation.top.mode).toBe("compact");
    expect(r.navigation.bottom.mode).toBe("closed");
    expect(r.cta.icon).toBe("cta.svg");
    expect(r.cta.iconPosition).toBe("end");
    expect(r.cta.state).toBe("disabled");
  });

  it("P5-5A — an override is scoped: sibling leaves keep their resolved values (no flattening)", () => {
    const controlled = resolveUiConfig({ navigation: { sidebar: { mode: "closed" } } });
    expect(controlled.navigation.sidebar.mode).toBe("closed"); // overridden leaf
    expect(controlled.navigation.desktop).toBe("sidebar"); // canonical default untouched
    expect(controlled.navigation.tablet).toBe("collapsed-sidebar");
    const withCtaState = resolveUiConfig({ cta: { state: "disabled" } });
    expect(withCtaState.cta.state).toBe("disabled");
    expect(withCtaState.navigation.mobile).toBe("bottom-bar"); // canonical default untouched
  });
});
