import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

let mockPath = "/en";
vi.mock("next/navigation", () => ({ usePathname: () => mockPath }));

import { availableBackgroundMap, availableBannerPath } from "@/config/assets";
import { siteAssetsSchema } from "@/config/schema";
import { siteConfig } from "@/config";
import { resolveUiConfig } from "@/core/ui";
import { PageBanner, pageSlugFromPathname } from "@/components/site/page-banner";
import {
  GLOBAL_BACKGROUND_KEY,
  PageBackground,
  resolveBackgroundPath,
} from "@/components/site/page-background";

const root = process.cwd();
const layout = readFileSync(path.join(root, "src", "app", "[locale]", "layout.tsx"), "utf8");
const globals = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");

/** The single `.ui-page-background` rule block (the decorative-layer contract). */
const backgroundBlock = /\.ui-page-background\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
/** The `body` rule block (the flat canvas-colour rule). */
const bodyBlock = /\nbody\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

/**
 * Already-shipped real files under `public/assets/`, reused by the positive
 * cases. These are deliberately NEUTRAL non-artwork fixtures (logo files) rather
 * than the approved Foundation background artwork, so the capability is proven
 * independently of which artwork is currently integrated — and the canonical
 * artwork swap (an adopter replacing `background-all.svg`) cannot make these
 * assertions vacuous.
 */
const REAL_PAGE = "logo-header.svg";
const REAL_GLOBAL = "logo-footer.svg";
/**
 * FS1 — the generic template ships NO banner artwork, so the banner fixture is a
 * shipped neutral file too: the resolver is artwork-agnostic, which keeps the
 * banner ROLE proven independently of which artwork an adopter integrates.
 */
const REAL_BANNER = "favicon.svg";

/** An FS-4-style absolute URL (the `site.assets.*` value shape). */
const realUrl = (name: string) => `https://www.example.com/assets/${name}`;
/** The same-origin path the resolver produces for a real asset. */
const livePath = (name: string) => `/assets/${name}`;

const renderBackground = (backgrounds: Record<string, string>, regionIds: readonly string[] = []) =>
  renderToStaticMarkup(PageBackground({ backgrounds, regionIds }));

const mapOf = (configured: Record<string, string>) => availableBackgroundMap(configured);

/**
 * P12-BG — the reusable decorative background-graphic capability.
 *
 * The Background / Watermark Contract
 * (`the maintainer's brand-system visual rulebook`) is:
 *
 *     background-<page>  →  background-all  →  none
 *
 * These tests prove the CONFIGURATION, AVAILABILITY, RESOLUTION, RENDERING,
 * COEXISTENCE and DECORATIVE-ONLY contracts. The approved Foundation background
 * artwork now ships at `public/assets/background-all.svg` (integrated, owner-
 * approved); the positive cases here still use ALREADY-SHIPPED neutral fixtures
 * rather than the artwork, so the capability stays proven independently of which
 * graphic a deployment has activated.
 */
describe("P12-BG — configuration contract", () => {
  it("11. an existing adopter config WITHOUT the new keys remains valid (no forced migration)", () => {
    // A config that knows nothing about background graphics must still parse.
    expect(siteAssetsSchema.safeParse({ logo: realUrl("logo-header.svg") }).success).toBe(true);
    expect(siteAssetsSchema.safeParse({}).success).toBe(true);
    // FS1 — the generic template activates no background graphic: the role is a
    // fully-supported OPTIONAL capability, and "nothing configured" resolves to an
    // EMPTY map (no graphic anywhere). An adopter activates it with one key, or by
    // replacing the shipped runtime file.
    expect(siteConfig.assets?.backgrounds).toBeUndefined();
    expect(availableBackgroundMap(undefined)).toEqual({});
  });

  it("accepts a background-role record of absolute URLs (`all` = global, page keys = page-specific)", () => {
    const parsed = siteAssetsSchema.safeParse({
      backgrounds: {
        all: realUrl("background-all.jpg"),
        home: realUrl("background-home.jpg"),
        about: realUrl("background-about.jpg"),
      },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a relative background URL (same FS-4 absolute-URL policy as every other asset role)", () => {
    const parsed = siteAssetsSchema.safeParse({ backgrounds: { all: "/assets/background-all.jpg" } });
    expect(parsed.success).toBe(false);
  });

  it("1. no background config → NO graphic background (absent is a valid, fully-supported state)", () => {
    // Absence is not an error: resolution simply yields nothing to render.
    expect(resolveBackgroundPath({}, "home")).toBeUndefined();
    expect(renderBackground({})).toBe("");
    expect(renderBackground(mapOf({}))).toBe("");
  });

  it("availability — a CONFIGURED-but-MISSING entry is dropped (indistinguishable from absent)", () => {
    const map = mapOf({ all: realUrl("background-all-NOT-SHIPPED.jpg") });
    expect(map).toEqual({});
    expect(renderBackground(map)).toBe("");
  });
});

describe("P12-BG — resolution contract: background-<page> → background-all → none", () => {
  it("2. a valid `background-all` is the GLOBAL graphic used where no page-specific one exists", () => {
    mockPath = "/en/about";
    const map = mapOf({ all: realUrl(REAL_GLOBAL) });
    expect(map).toEqual({ all: livePath(REAL_GLOBAL) });
    expect(resolveBackgroundPath(map, "about")).toBe(livePath(REAL_GLOBAL));
    expect(resolveBackgroundPath(map, GLOBAL_BACKGROUND_KEY)).toBe(livePath(REAL_GLOBAL));
    const markup = renderBackground(map);
    expect(markup).toContain(livePath(REAL_GLOBAL));
    expect(markup).toContain('aria-hidden="true"');
  });

  it("3. a valid PAGE-SPECIFIC graphic wins over the global graphic", () => {
    mockPath = "/en/about";
    const map = mapOf({ all: realUrl(REAL_GLOBAL), about: realUrl(REAL_PAGE) });
    expect(resolveBackgroundPath(map, "about")).toBe(livePath(REAL_PAGE));
    const markup = renderBackground(map);
    expect(markup).toContain(livePath(REAL_PAGE));
    expect(markup).not.toContain(livePath(REAL_GLOBAL));
  });

  it("4. a page-specific graphic configured but MISSING falls back to the global graphic", () => {
    mockPath = "/en/about";
    const map = mapOf({
      all: realUrl(REAL_GLOBAL),
      about: realUrl("background-about-NOT-SHIPPED.jpg"),
    });
    expect(map.about).toBeUndefined();
    expect(resolveBackgroundPath(map, "about")).toBe(livePath(REAL_GLOBAL));
    expect(renderBackground(map)).toContain(livePath(REAL_GLOBAL));
  });

  it("5. both levels missing → no graphic background at all", () => {
    mockPath = "/en/about";
    const map = mapOf({
      all: realUrl("background-all-NOT-SHIPPED.jpg"),
      about: realUrl("background-about-NOT-SHIPPED.jpg"),
    });
    expect(map).toEqual({});
    expect(resolveBackgroundPath(map, "about")).toBeUndefined();
    expect(renderBackground(map)).toBe("");
  });

  it("6. an UNRELATED page-specific graphic is never borrowed (and never beats the global)", () => {
    mockPath = "/en";
    const onlyOtherPage = mapOf({ about: realUrl(REAL_PAGE) });
    expect(resolveBackgroundPath(onlyOtherPage, "home")).toBeUndefined();
    expect(renderBackground(onlyOtherPage)).toBe("");

    const withGlobal = mapOf({ all: realUrl(REAL_GLOBAL), about: realUrl(REAL_PAGE) });
    expect(resolveBackgroundPath(withGlobal, "home")).toBe(livePath(REAL_GLOBAL));
    expect(renderBackground(withGlobal)).not.toContain(livePath(REAL_PAGE));
  });

  it("7. the LOCALE never changes the semantic page role", () => {
    const map = mapOf({ all: realUrl(REAL_GLOBAL), about: realUrl(REAL_PAGE) });
    mockPath = "/en/about";
    const english = { role: pageSlugFromPathname(mockPath, []), markup: renderBackground(map) };
    mockPath = "/fr/about";
    const french = { role: pageSlugFromPathname(mockPath, []), markup: renderBackground(map) };
    mockPath = "/ja/about";
    const japanese = { role: pageSlugFromPathname(mockPath, []), markup: renderBackground(map) };

    expect(english.role).toBe("about");
    expect(french.role).toBe("about");
    expect(japanese.role).toBe("about");
    expect(french.markup).toBe(english.markup);
    expect(japanese.markup).toBe(english.markup);

    mockPath = "/fr";
    expect(pageSlugFromPathname(mockPath, [])).toBe("home");
  });

  it("8. listing/detail pages keep their FAMILY role (one graphic per page family)", () => {
    mockPath = "/en/blog";
    expect(pageSlugFromPathname(mockPath, [])).toBe("blog");
    mockPath = "/en/blog/why-architecture-matters";
    expect(pageSlugFromPathname(mockPath, [])).toBe("blog");
    mockPath = "/en/portfolio/case-study-one";
    expect(pageSlugFromPathname(mockPath, [])).toBe("portfolio");

    // A listing and its detail page resolve the SAME family graphic.
    mockPath = "/en/blog/why-architecture-matters";
    const map = mapOf({ all: realUrl(REAL_GLOBAL), blog: realUrl(REAL_PAGE) });
    expect(resolveBackgroundPath(map, pageSlugFromPathname(mockPath, []))).toBe(livePath(REAL_PAGE));

    // A configured region segment is skipped, so the page role survives it.
    mockPath = "/en/us/offerings";
    expect(pageSlugFromPathname(mockPath, ["us"])).toBe("offerings");
    expect(pageSlugFromPathname(mockPath, [])).toBe("us");
  });
});

describe("P12-BG — coexistence: the flat colour token and the banner seam are unchanged", () => {
  it("9. the flat `ui.theme.background` colour still works (the graphic layers OVER it)", () => {
    // The flat colour is still configuration-first and identity-free …
    const explicit = resolveUiConfig({
      navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" },
      theme: { background: "#123456" },
    });
    expect(explicit.theme.background).toBe("#123456");
    expect(resolveUiConfig({ theme: { background: "#123456" } }).theme.background).toBe("#123456");
    expect(resolveUiConfig({}).theme.background).toBeUndefined();

    // … still emitted as the `--background` token on the root element …
    expect(layout).toContain('"--background": resolvedUi.theme.background');
    // … and still painted by the body rule (the flat canvas colour).
    expect(bodyBlock).toContain("background: var(--background)");

    // The graphic is a SEPARATE layer: fixed, behind content, above the colour.
    expect(backgroundBlock).toContain("position: fixed");
    expect(backgroundBlock).toContain("z-index: -1");
    // It never declares a colour — the flat token remains the source of colour.
    expect(backgroundBlock).not.toMatch(/background-color|background:\s*#/);
  });

  it("10. a background graphic does NOT change banner resolution", () => {
    // The banner role resolves exactly as before, independent of backgrounds.
    expect(availableBannerPath(realUrl(REAL_BANNER))).toBe(livePath(REAL_BANNER));
    expect(availableBannerPath(realUrl("banner-home-NOT-SHIPPED.png"))).toBeUndefined();

    // Rendering the decorative layer cannot influence the banner seam.
    const backgrounds = mapOf({ all: realUrl(REAL_GLOBAL) });
    expect(renderBackground(backgrounds)).toContain(livePath(REAL_GLOBAL));
    mockPath = "/en";
    const bannerMarkup = renderToStaticMarkup(
      PageBanner({ banners: { home: { src: livePath(REAL_BANNER) } }, regionIds: [] }),
    );
    expect(bannerMarkup).toContain(livePath(REAL_BANNER));
    expect(bannerMarkup).not.toContain(livePath(REAL_GLOBAL));

    // The layout keeps the two seams SEPARATE: banners come from
    // `site.assets.banners`, backgrounds from `site.assets.backgrounds` — no
    // shared, borrowed or cross-derived source.
    expect(layout).toContain("availableBannerPath(url)");
    expect(layout).toContain("availableBackgroundMap(siteConfig.assets?.backgrounds)");
  });
});

describe("P12-BG — decorative-only contract", () => {
  it("12. the decorative layer is neither interactive nor semantic", () => {
    mockPath = "/en";
    const markup = renderBackground(mapOf({ all: realUrl(REAL_GLOBAL) }));

    // Not exposed to assistive tech; no accessible name and no semantics.
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toMatch(/role=|aria-label|<img|<a\s|<button|tabindex|alt=/);
    // A single childless element: it carries no text/content of any kind.
    expect(markup).toMatch(/^<div [^>]*><\/div>$/);

    // Never captures a pointer event, a selection or focus (CSS contract).
    expect(backgroundBlock).toContain("pointer-events: none");
    // NON-STRUCTURAL: out of flow and zero-box, so it can add no padding, no
    // margin, no reserved height and no horizontal overflow.
    expect(backgroundBlock).toContain("position: fixed");
    expect(backgroundBlock).toContain("inset: 0");
    expect(backgroundBlock).toContain("margin: 0");
    expect(backgroundBlock).toContain("padding: 0");
    expect(backgroundBlock).toContain("border: 0");
  });
});