import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  declarations,
  readGlobalsCss,
  schemeScopes,
  schemeTokens,
} from "./support/theme-tokens";

/**
 * FOUNDATION SINGLE-SOURCE THEME COLOUR (owner-directed, 2026-09).
 *
 * The owner's requirement is literal: there must be ONE place where the
 * Foundation colour is set, so that one future colour change controls the
 * wordmark/heading, the selector highlights, the focus emphasis and the branded
 * CTA roles.
 *
 *   ONE hardcoded Foundation accent  (#3F6791 — the darker Foundation blue)
 *                    ↓
 *        --ui-brand-accent  (semantic, scheme-resolved)
 *         ↙        ↓         ↘
 *    wordmark   selectors   focus/CTA
 *                    ↓
 *        derived dark tint via color-mix()  (no second brand hex)
 *
 * These assertions inspect DECLARATIONS (not prose): a documentation comment that
 * names a colour is not an independently maintained value.
 */
const ROOT = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");
const css = readGlobalsCss();
const { light, dark } = schemeScopes(css);
const lightRaw = declarations(light);
const darkRaw = declarations(dark);

/** The approved darker Foundation blue (brand pack: "Foundation Blue Strong"). */
const APPROVED_ACCENT = "#3f6791";

/** Count `--token: <value>;` declarations whose value is exactly `hex`. */
const declarationsOf = (hex: string) =>
  (css.match(new RegExp(`--[\\w-]+\\s*:\\s*${hex}\\s*;`, "gi")) ?? []).length;


describe("Foundation accent — exactly ONE hardcoded source", () => {
  it("declares the approved darker Foundation blue as the single base value", () => {
    expect(lightRaw["--ui-foundation-accent"]?.toLowerCase()).toBe(APPROVED_ACCENT);
    // The value is written ONCE in the whole stylesheet…
    expect((css.match(/--ui-foundation-accent\s*:/g) ?? []).length).toBe(1);
    // …and no other declaration repeats that hex (a copy would silently freeze
    // one of the consumers when the accent changes).
    expect(declarationsOf(APPROVED_ACCENT), "copies of the accent hex").toBe(1);
  });

  it("keeps the retired separate dark brand hex out of the token set", () => {
    // The dark scheme used to hardcode its own brand hex (#8fb4d9). It must no
    // longer exist as a DECLARATION anywhere: dark derives from the one accent.
    expect((css.match(/--[\w-]+\s*:\s*#8fb4d9\s*;/gi) ?? []).length).toBe(0);
  });

  it("resolves the scheme-resolved token from the base value (light)", () => {
    expect(lightRaw["--ui-brand-accent"]?.trim()).toBe("var(--ui-foundation-accent)");
    const { light: resolved } = schemeTokens();
    expect(resolved["--ui-brand-accent"]).toBe(APPROVED_ACCENT);
  });

  it("DERIVES the dark tint from the same value instead of storing a second hex", () => {
    const darkAccent = darkRaw["--ui-brand-accent"]?.trim() ?? "";
    // A color-mix that references the ONE accent — never a literal brand hex.
    expect(darkAccent).toMatch(
      /^color-mix\(in srgb,\s*var\(--ui-foundation-accent\)\s+[\d.]+%,\s*#[0-9a-fA-F]{6}\)$/,
    );
    expect(darkAccent.toLowerCase()).not.toContain(APPROVED_ACCENT);

    const { light: l, dark: d } = schemeTokens();
    expect(d["--ui-brand-accent"], "dark must be a lifted variant").not.toBe(l["--ui-brand-accent"]);
    // …and the derived tint still meets WCAG AA as text on the dark canvas.
    const ratio = contrastRatio(d["--ui-brand-accent"], d["--background"]);
    expect(ratio, `derived dark accent contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });

  it("meets WCAG AA as text on the light canvas (the reason for the darker blue)", () => {
    const { light: resolved } = schemeTokens();
    const ratio = contrastRatio(resolved["--ui-brand-accent"], resolved["--background"]);
    expect(ratio, `accent contrast ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Foundation accent — every branded consumer DERIVES from it", () => {
  it("makes the brand-text token an indirection in BOTH schemes", () => {
    for (const [scheme, raw] of Object.entries({ light: lightRaw, dark: darkRaw })) {
      expect(raw["--primary"]?.trim(), `${scheme} --primary`).toBe("var(--ui-brand-accent)");
    }
  });

  it("makes the focus/highlight token the same indirection in BOTH schemes", () => {
    for (const [scheme, raw] of Object.entries({ light: lightRaw, dark: darkRaw })) {
      expect(raw["--ring"]?.trim(), `${scheme} --ring`).toBe("var(--ui-brand-accent)");
    }
  });

  it("paints application-controlled selector emphasis from the theme token", () => {
    expect(css).toMatch(/select\[data-selector\]\s*\{[^}]*accent-color:\s*var\(--ui-brand-accent\)/);
    expect(css).toMatch(
      /select\[data-selector\]:hover[\s\S]{0,160}?border-color:\s*var\(--ui-brand-accent\)/,
    );
    expect(css).toMatch(
      /select\[data-selector\]:focus-visible[\s\S]{0,160}?border-color:\s*var\(--ui-brand-accent\)/,
    );
    // The keyboard ring stays the single global :focus-visible rule.
    expect(css).toMatch(/:focus-visible\s*\{[^}]*var\(--ring\)/);
  });

  it("keeps the destructive/error role OUT of the brand token", () => {
    expect(lightRaw["--destructive"]?.toLowerCase()).toBe("#dc2626");
    expect(css).not.toMatch(/--destructive:\s*var\(--ui-brand-accent\)/);
    expect(lightRaw["--destructive"]?.toLowerCase()).not.toBe(APPROVED_ACCENT);
  });

  it("carries NO crimson brand token (provelopment.com's colour)", () => {
    expect((css.match(/--[\w-]+\s*:\s*#(c5161d|a11217)\s*;/gi) ?? []).length).toBe(0);
  });
});

describe("Foundation accent — the visible heading consumes it", () => {
  const home = read("src", "app", "[locale]", "page.tsx");

  it("renders the configured Foundation name through the brand text token", () => {
    expect(home).toMatch(/text-primary[^>]*>\s*\{siteConfig\.name\}/);
  });

  it("does not carry its own brand colour (no crimson, no token copy)", () => {
    expect(home).not.toMatch(/#c5161d|#a11217|#3f6791/i);
    expect(home).not.toMatch(/--ui-foundation-accent\s*:|--ui-brand-accent\s*:/);
  });
});

describe("Foundation selectors — location + language only (preset feature retired)", () => {
  const SWITCHERS: ReadonlyArray<readonly [string, string]> = [
    ["location-switcher.tsx", "location"],
    ["language-switcher.tsx", "language"],
  ];

  it("keeps the two remaining selectors on the shared theme hook", () => {
    for (const [file, value] of SWITCHERS) {
      const source = read("src", "components", "site", file);
      expect(source, `${file} must opt into the shared hook`).toContain(`data-selector="${value}"`);
      expect(source, `${file} must not hardcode a brand colour`).not.toMatch(
        /#c5161d|#a11217|#3f6791|#4f7cac/i,
      );
      expect(source, `${file} must not declare its own theme token`).not.toMatch(
        /--ui-foundation-accent\s*:|--ui-brand-accent\s*:/,
      );
    }
  });

  it("has NO preset selector anywhere in the application source", () => {
    // Owner decision (2026-09): the Foundation presents ONE canonical
    // presentation, so the preset switcher and its wiring are gone — not hidden.
    expect(existsSync(path.join(ROOT, "src", "components", "site", "preset-switcher.tsx"))).toBe(false);

    const siteRoot = path.join(ROOT, "src");
    const offenders: string[] = [];
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) visit(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const source = readFileSync(full, "utf8");
          if (/PresetSwitcher|data-selector="preset"|presetComparison/.test(source)) {
            offenders.push(path.relative(ROOT, full));
          }
        }
      }
    };
    visit(siteRoot);
    expect(offenders, `preset-selection code must not remain: ${offenders.join(", ")}`).toEqual([]);
  });

  it("has NO preset-comparison configuration surface left", () => {
    expect(read("site.config.json")).not.toContain("presetComparison");
    expect(read("src", "config", "schema.ts")).not.toContain("presetComparison");
    expect(read("src", "config", "site-config.ts")).not.toContain("presetComparison");
    // The shipped config declares no preset either: the canonical presentation
    // comes from the shared UI engine's default, not from a selection.
    const config = JSON.parse(read("site.config.json")) as { ui?: Record<string, unknown> };
    expect(config.ui).not.toHaveProperty("preset");
    expect(config.ui).not.toHaveProperty("presetComparison");
  });
});


