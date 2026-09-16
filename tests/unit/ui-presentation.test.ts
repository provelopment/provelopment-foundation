import { describe, expect, it } from "vitest";

import { uiConfigSchema } from "@/config/schema";
import {
  PRESENTATION_DEFAULTS,
  PRESENTATION_HEADERS,
  PRESENTATION_HEROES,
  PRESENTATION_RHYTHMS,
  PRESENTATION_SURFACES,
  PRESENTATION_TYPOGRAPHIES,
  presentationDataAttributes,
  radiusDataAttribute,
  resolveUiConfig,
} from "@/core/ui";

/**
 * P5-3 — Presentation intent (generalized, configuration-first).
 *
 * Contract:
 *  1. One canonical presentation: the resolved intent IS the Foundation default
 *     (`PRESENTATION_DEFAULTS`), with the canonical density/content-width/radius.
 *  2. Presentation is expressed through generalized vocabulary (typography,
 *     rhythm, surface, header, hero) — never a presentation-name switch; the
 *     retired selectable-profile layer is gone.
 *  3. The `ui.presentation` namespace is a generalized, validated config
 *     surface: any vocabulary value is valid, custom configuration expresses any
 *     combination, and invalid values are rejected safely.
 *  4. The resolved presentation maps to inert `data-ui-*` renderer attributes
 *     (framework-neutral; the renderer implements them, not the components).
 */
describe("P5-3 — the canonical presentation intent", () => {
  it("the canonical composition resolves the balanced presentation + canonical density/content/radius", () => {
    const resolved = resolveUiConfig({});
    expect(resolved.presentation).toEqual(PRESENTATION_DEFAULTS);
    expect(resolved.density).toBe("comfortable");
    expect(resolved.content.width).toBe("standard");
    expect(resolved.theme.radius).toBe("medium");
  });

  it("an explicit presentation configuration replaces the default intent leaf by leaf", () => {
    const resolved = resolveUiConfig({
      presentation: { typography: "editorial", rhythm: "structured", surface: "paper", header: "rule", hero: "split" },
      density: "compact",
      content: { width: "wide" },
      theme: { radius: "large" },
    });
    expect(resolved.presentation).toEqual({
      typography: "editorial",
      rhythm: "structured",
      surface: "paper",
      header: "rule",
      hero: "split",
    });
    expect(resolved.density).toBe("compact");
    expect(resolved.content.width).toBe("wide");
    expect(resolved.theme.radius).toBe("large");
  });

  it("a PARTIAL presentation override leaves the other dimensions at their canonical defaults", () => {
    const resolved = resolveUiConfig({ presentation: { typography: "utility" } });
    expect(resolved.presentation.typography).toBe("utility"); // override wins
    expect(resolved.presentation.rhythm).toBe(PRESENTATION_DEFAULTS.rhythm); // default
    expect(resolved.presentation.surface).toBe(PRESENTATION_DEFAULTS.surface);
    expect(resolved.presentation.header).toBe(PRESENTATION_DEFAULTS.header);
    expect(resolved.presentation.hero).toBe(PRESENTATION_DEFAULTS.hero);
    expect(resolved.density).toBe("comfortable"); // untouched sibling leaf
  });
});
describe("P5-3 — generalized `ui.presentation` configuration surface", () => {
  it("the schema admits every presentation vocabulary value", () => {
    for (const typography of PRESENTATION_TYPOGRAPHIES) {
      expect(uiConfigSchema.safeParse({ presentation: { typography } }).success).toBe(true);
    }
    for (const rhythm of PRESENTATION_RHYTHMS) {
      expect(uiConfigSchema.safeParse({ presentation: { rhythm } }).success).toBe(true);
    }
    for (const surface of PRESENTATION_SURFACES) {
      expect(uiConfigSchema.safeParse({ presentation: { surface } }).success).toBe(true);
    }
    for (const header of PRESENTATION_HEADERS) {
      expect(uiConfigSchema.safeParse({ presentation: { header } }).success).toBe(true);
    }
    for (const hero of PRESENTATION_HEROES) {
      expect(uiConfigSchema.safeParse({ presentation: { hero } }).success).toBe(true);
    }
  });

  it("invalid presentation values are rejected safely (closed vocabulary)", () => {
    expect(uiConfigSchema.safeParse({ presentation: { typography: "fancy" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { rhythm: "loud" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { surface: "glossy" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { header: "neon" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { hero: "explode" } }).success).toBe(false);
    expect(uiConfigSchema.safeParse({ presentation: { trad: "editorial" } }).success).toBe(false);
  });

  it("custom configuration expresses the same generalized presentation", () => {
    const resolved = resolveUiConfig({
      presentation: { typography: "editorial", rhythm: "airy", surface: "paper", header: "rule", hero: "center" },
    });
    expect(resolved.presentation).toEqual({
      typography: "editorial",
      rhythm: "airy",
      surface: "paper",
      header: "rule",
      hero: "center",
    });
  });

  it("an explicit presentation override wins per leaf without disturbing the sibling leaves", () => {
    const resolved = resolveUiConfig({
      presentation: { typography: "editorial" },
      density: "compact",
    });
    expect(resolved.presentation.typography).toBe("editorial"); // override wins
    expect(resolved.presentation.rhythm).toBe(PRESENTATION_DEFAULTS.rhythm); // default
    expect(resolved.presentation.surface).toBe(PRESENTATION_DEFAULTS.surface);
    expect(resolved.density).toBe("compact"); // override wins
    expect(resolved.content.width).toBe("standard"); // sibling leaf untouched
  });
});

describe("P5-3 — renderer data-attribute mapping (framework-neutral)", () => {
  it("maps a resolved presentation to the generalized data-ui-* attributes", () => {
    const attrs = presentationDataAttributes({
      typography: "editorial",
      rhythm: "structured",
      surface: "paper",
      header: "rule",
      hero: "split",
    });
    expect(attrs).toEqual({
      "data-ui-typography": "editorial",
      "data-ui-rhythm": "structured",
      "data-ui-surface": "paper",
      "data-ui-header": "rule",
      "data-ui-hero": "split",
    });
  });

  it("maps the resolved radius to the data-ui-radius corner language", () => {
    expect(radiusDataAttribute("none")).toEqual({ "data-ui-radius": "none" });
    expect(radiusDataAttribute("large")).toEqual({ "data-ui-radius": "large" });
  });

  it("the canonical presentation resolves the deterministic renderer attribute mask", () => {
    const r = resolveUiConfig({});
    const mask = { ...presentationDataAttributes(r.presentation), ...radiusDataAttribute(r.theme.radius) };
    expect(mask).toEqual({
      "data-ui-typography": "balanced",
      "data-ui-rhythm": "balanced",
      "data-ui-surface": "default",
      "data-ui-header": "default",
      "data-ui-hero": "default",
      "data-ui-radius": "medium",
    });
    // A custom presentation yields a different mask from the same code path.
    const custom = resolveUiConfig({ presentation: { typography: "expressive", rhythm: "spacious" } });
    const customMask = { ...presentationDataAttributes(custom.presentation), ...radiusDataAttribute(custom.theme.radius) };
    expect(customMask).not.toEqual(mask);
    expect(customMask["data-ui-typography"]).toBe("expressive");
  });
});
