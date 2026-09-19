import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  availableBackgroundMap,
  availableBannerPath,
  availableFooterGraphicPath,
  availableHeaderGraphicPath,
} from "@/config/assets";
import { siteConfigFileSchema, siteAssetsSchema } from "@/config/schema";
import { siteConfig } from "@/config";
import { HEADER_GRAPHIC_ATTRIBUTE, headerGraphicBandProps } from "@/components/site/header-graphic";

/**
 * P12-HG — the optional DECORATIVE header band / graphic capability.
 *
 * Locks in the contract: ONE optional global `site.assets.headerGraphic` role
 * (`header-graphic`), resolved through the SAME generic asset-availability rule
 * as the banner/background/footer-graphic roles, painted as the HEADER'S OWN
 * background so it is always behind the logo, navigation, switchers and mobile
 * trigger — never replacing the independent `logo` identity role and never
 * consuming the PAGE-SPECIFIC `banners` region above the shell.
 *
 * The header band's DEFAULT artwork is now the BLANK TRANSPARENT placeholder
 * (`assets/placeholders/header-graphic.svg` → `public/assets/header-graphic.svg`,
 * owner ruling 2026-09): the role is present, valid and ACTIVATED, and it paints
 * nothing. The branded Foundation artwork for the role remains available in the
 * source package (`assets/branding/page-graphics/header-graphic.svg`) and is
 * activated by replacing the runtime file — a pure artwork swap. The
 * positive/negative availability cases below deliberately reuse the repository's
 * existing neutral `logo-header.svg` fixture: the availability rule stays proven
 * independently of which artwork a deployment has activated. It is used ONLY as
 * an availability fixture — it is NOT header-graphic artwork.
 */

const root = process.cwd();
const globals = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
const siteHeader = readFileSync(path.join(root, "src", "components", "site", "site-header.tsx"), "utf8");
const layout = readFileSync(path.join(root, "src", "app", "[locale]", "layout.tsx"), "utf8");
const siteFooter = readFileSync(path.join(root, "src", "components", "site", "site-footer.tsx"), "utf8");
const assets = readFileSync(path.join(root, "src", "config", "assets.ts"), "utf8");
const component = readFileSync(path.join(root, "src", "components", "site", "header-graphic.ts"), "utf8");

/**
 * The same modules with their COMMENTS stripped. The "never touches another
 * seam" assertions must inspect the CODE: the contract documentation
 * legitimately NAMES the sibling seams (`.ui-page-background`, `pointer-events`,
 * `navigation`, …) to explain WHY they stay independent, so scanning raw text
 * would fail on the explanation rather than on a real coupling.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const componentCode = stripComments(component);
const siteHeaderCode = stripComments(siteHeader);

/** The single `.ui-site-header[data-ui-header-graphic]` rule block (the band contract). */
const bandBlock = /\.ui-site-header\[data-ui-header-graphic\]\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

/** An FS-4 absolute URL whose basename is backed by a real public/assets file. */
const AVAILABLE = "https://www.example.com/assets/logo-header.svg";
/** An FS-4 absolute URL whose basename has NO backing file. */
const MISSING = "https://www.example.com/assets/header-graphic-does-not-exist.svg";

/**
 * The header as it is actually emitted: the band contributes attributes ONLY
 * (never an element), so rendering the shell `<header>` with the props proves
 * both the exact DOM output and the absence of any decorative child node.
 */
const renderHeader = (src: string | undefined) =>
  renderToStaticMarkup(
    createElement(
      "header",
      { className: "ui-site-header border-b border-border", ...headerGraphicBandProps(src) },
      "content",
    ),
  );

describe("P12-HG — schema / backward compatibility", () => {
  const rawSiteConfig = JSON.parse(readFileSync(path.join(root, "site.config.json"), "utf8")) as Record<
    string,
    unknown
  >;

  it("1. an existing adopter config WITHOUT the new role remains valid (no forced migration)", () => {
    // An adopter config that predates the role stays valid — and adding a
    // `logo`-only asset block (the pre-P12-HG shape) stays valid.
    expect(siteConfigFileSchema.safeParse(rawSiteConfig).success).toBe(true);
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { logo: AVAILABLE };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(true);
    // `site.assets` itself remains entirely optional.
    expect(siteAssetsSchema.safeParse({}).success).toBe(true);
  });

  it("accepts the single global header-graphic role as an absolute URL", () => {
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { headerGraphic: AVAILABLE };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(true);
    expect(siteAssetsSchema.safeParse({ headerGraphic: AVAILABLE }).success).toBe(true);
  });

  it("rejects a relative header-graphic URL (same FS-4 absolute-URL policy as every other asset role)", () => {
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { headerGraphic: "/assets/header-graphic.svg" };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(false);
    expect(siteAssetsSchema.safeParse({ headerGraphic: "/assets/header-graphic.svg" }).success).toBe(false);
  });

  it("the shipped template leaves this decorative role ABSENT (optional, nothing rendered)", () => {
    // FS1 — the generic template configures no decorative header band: the role
    // is OPTIONAL and its absence is a fully-supported state (nothing is painted).
    // The blank placeholder still ships, so activating it is one config line.
    //
    // The band contributes ATTRIBUTES ONLY — no element, no layout height, no
    // stacking context — so an absent or blank role cannot affect the UI.
    expect(siteConfig.assets?.headerGraphic).toBeUndefined();
    expect(availableHeaderGraphicPath(siteConfig.assets?.headerGraphic)).toBeUndefined();
    expect(existsSync(path.join(root, "public", "assets", "header-graphic.svg"))).toBe(true);
    // The shipped default draws NOTHING (no paths, no shapes, no raster) and is
    // byte-identical to its declared placeholder source.
    const shipped = readFileSync(path.join(root, "public", "assets", "header-graphic.svg"), "utf8");
    const source = readFileSync(
      path.join(root, "assets", "placeholders", "header-graphic.svg"),
      "utf8",
    );
    expect(shipped).toBe(source);
    expect(shipped).not.toMatch(/<(path|rect|circle|ellipse|polygon|image|text)\b/i);
    expect(shipped).toMatch(/viewBox="0 0 4096 512"/);
    expect(shipped).not.toMatch(/#4F7CAC/i);
    // …and no deployment-specific artwork ships for this role in the template.
    expect(existsSync(path.join(root, "assets", "branding"))).toBe(false);
  });
});

describe("P12-HG — availability + rendering contract", () => {
  it("2. no configured graphic → NO decorative band (absent is a valid, fully-supported state)", () => {
    expect(availableHeaderGraphicPath(undefined)).toBeUndefined();
    const html = renderHeader(availableHeaderGraphicPath(undefined));
    // No marker attribute, no custom property and no inline style at all, so
    // the header is byte-identical to the pre-P12-HG header.
    expect(html).not.toContain(HEADER_GRAPHIC_ATTRIBUTE);
    expect(html).not.toContain("--ui-header-graphic");
    expect(html).not.toContain("style=");
    expect(html).toBe('<header class="ui-site-header border-b border-border">content</header>');
  });

  it("3. a valid configured asset → the decorative band IS emitted with the resolved same-origin path", () => {
    const src = availableHeaderGraphicPath(AVAILABLE);
    expect(src).toBe("/assets/logo-header.svg");
    const html = renderHeader(src);
    expect(html).toContain('data-ui-header-graphic="true"');
    expect(html).toContain("--ui-header-graphic:url(&quot;/assets/logo-header.svg&quot;)");
  });

  it("4. a CONFIGURED-but-MISSING asset → the decorative band is ABSENT (never a placeholder, never a 404)", () => {
    const src = availableHeaderGraphicPath(MISSING);
    expect(src).toBeUndefined();
    const html = renderHeader(src);
    expect(html).not.toContain(HEADER_GRAPHIC_ATTRIBUTE);
    expect(html).not.toContain("style=");
  });

  it("reuses the SAME generic availability rule as every other runtime role (no second loader)", () => {
    expect(assets).toMatch(
      /export function availableHeaderGraphicPath[\s\S]{0,200}availableRoleAssetPath\(absoluteUrl\)/,
    );
    // No dedicated filesystem subsystem / client fetcher for this role.
    expect(componentCode).not.toMatch(/node:fs|existsSync|fetch\(/);
    expect(siteHeaderCode).not.toMatch(/node:fs|existsSync/);
  });

  it("8. the decorative band contributes NO semantics and NO DOM node at all", () => {
    const html = renderHeader(availableHeaderGraphicPath(AVAILABLE));
    // The band is a CSS background on the header: it adds no element, so it can
    // carry no accessible name, no role, no alt, no heading and no text.
    expect(html).not.toMatch(/<img/);
    expect(html).not.toMatch(/<div/);
    expect(html).not.toMatch(/<span/);
    expect(html).not.toMatch(/<h[1-6]/);
    expect(html).not.toMatch(/\brole=/);
    expect(html).not.toMatch(/aria-label/);
    expect(html).not.toMatch(/alt=/);
    // The only child is the header's real in-flow content.
    expect(html).toMatch(/>content<\/header>$/);
  });

  it("9. the decorative band can never capture pointer input — and never disables the header's own controls", () => {
    const html = renderHeader(availableHeaderGraphicPath(AVAILABLE));
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toMatch(/<button\b/);
    expect(html).not.toMatch(/tabindex/i);
    // A CSS background cannot receive pointer events, so no `pointer-events`
    // override is needed — and none may be applied, because on the header it
    // would disable the logo link and the navigation controls themselves.
    expect(componentCode).not.toMatch(/pointer-events/);
    expect(bandBlock).not.toMatch(/pointer-events/);
    expect(componentCode).not.toMatch(/tabIndex|onClick|onPointer/);
  });
});

describe("P12-HG — layout-independence contract", () => {
  it("10. the band can never add layout height, reserve space or introduce overflow", () => {
    // background-* longhands only: they are paint-only and cannot affect layout.
    expect(bandBlock).toMatch(/background-image:\s*var\(--ui-header-graphic\)/);
    expect(bandBlock).toMatch(/background-repeat:\s*no-repeat/);
    expect(bandBlock).toMatch(/background-position:\s*center center/);
    expect(bandBlock).toMatch(/background-size:\s*cover/);
    // No structural / positioning property may be declared on the band.
    expect(bandBlock).not.toMatch(/[\s;{]position\s*:/);
    expect(bandBlock).not.toMatch(/[\s;{]z-index\s*:/);
    expect(bandBlock).not.toMatch(/[\s;{]width\s*:/);
    expect(bandBlock).not.toMatch(/[\s;{]height\s*:/);
    expect(bandBlock).not.toMatch(/[\s;{]min-/);
    expect(bandBlock).not.toMatch(/[\s;{]margin/);
    expect(bandBlock).not.toMatch(/[\s;{]padding/);
  });

  it("11. the existing header geometry is unchanged (no `relative`/`isolate`/stacking context added)", () => {
    // The header keeps its exact pre-P12-HG classes; the band adds only
    // attributes via the spread, so no positioning utility is introduced.
    expect(siteHeader).toMatch(
      /<header className="ui-site-header border-b border-border" \{\.\.\.headerGraphicBandProps\(headerGraphic\)\}>/,
    );
    expect(siteHeader).not.toMatch(/ui-site-header[^"]*\brelative\b/);
    expect(siteHeader).not.toMatch(/ui-site-header[^"]*\bisolate\b/);
    // No new DOM child is introduced into the header by this capability.
    expect(siteHeader).not.toMatch(/<HeaderGraphic/);
  });

  it("12. the mobile header disclosure contract is untouched", () => {
    // The shell's ONE mobile nav disclosure (trigger + drawer/overlay panel) is
    // still composed exactly as before, at its original position.
    expect(siteHeader).toContain("<ShellMobileNav");
    expect(siteHeader).toContain('id="shell-mobile-nav"');
    expect(siteHeader).toContain('className="md:hidden"');
    expect(siteHeader).toContain('mobilePattern === "drawer" || mobilePattern === "overlay"');
    // The header still exposes its brand link + navigation landmark.
    // VIS1C — the brand link now carries the >= 44px hit-area contract; the lockup
    // inside it keeps its own visual scale (asserted on the next line).
    expect(siteHeader).toContain('className="ui-site-header-brand inline-flex min-h-11 min-w-11 items-center"');
    expect(siteHeader).toContain("ui-site-header-logo h-8 w-auto");
    // No z-index/positioning on the band that could confine the fixed panels.
    // (`background-position` is a paint-only longhand, so match the properties,
    // not the substring.)
    expect(bandBlock).not.toMatch(/[\s;{]position\s*:/);
    expect(bandBlock).not.toMatch(/[\s;{]z-index\s*:/);
    expect(bandBlock).not.toMatch(/inset\s*:/);
  });

  it("13. the band can never introduce horizontal overflow", () => {
    // `cover` + `no-repeat` + centred is a paint-only contract; nothing on the
    // band can widen the header or the document.
    expect(bandBlock).toMatch(/background-size:\s*cover/);
    expect(bandBlock).toMatch(/background-repeat:\s*no-repeat/);
    expect(bandBlock).not.toMatch(/overflow/);
    expect(componentCode).not.toMatch(/overflow/);
  });

  it("the engine never recolours or animates the approved artwork", () => {
    expect(bandBlock).not.toMatch(/opacity/);
    expect(bandBlock).not.toMatch(/filter/);
    expect(bandBlock).not.toMatch(/blend-mode/);
    expect(bandBlock).not.toMatch(/mask/);
    expect(bandBlock).not.toMatch(/hue-rotate/);
    expect(bandBlock).not.toMatch(/background-color/);
    expect(bandBlock).not.toMatch(/animation|transition|transform/);
    // No responsive variant / art direction of the role.
    expect(globals).not.toMatch(/data-ui-header-graphic[\s\S]{0,400}@media/);
    expect(componentCode).not.toMatch(/@media|<picture/);
  });
});

describe("P12-HG — separation + reusability contract", () => {
  it("5. the header IDENTITY / logo remains independent of the decorative band role", () => {
    // The brand mark still reads its OWN role; the band reads its own — neither
    // is substituted for the other.
    expect(siteHeader).toContain("siteConfig.assets?.logo");
    expect(siteHeader).toContain("siteConfig.assets?.headerGraphic");
    // The header logo keeps its meaningful accessible name (the site name).
    expect(siteHeader).toContain("alt={siteConfig.name}");
    // The band role never becomes a hard-coded ARTWORK filename.
    expect(siteHeader).not.toMatch(/header-graphic\.(svg|png|webp|jpg|jpeg|avif|gif)/);
    expect(component).not.toMatch(/header-graphic\.(svg|png|webp|jpg|jpeg|avif|gif)/);
  });

  it("6. the PAGE BANNER seam remains completely independent", () => {
    // Distinct config keys, distinct resolvers, distinct consumers.
    expect(layout).toContain("availableBannerPath(");
    expect(layout).toContain("availableBackgroundMap(siteConfig.assets?.backgrounds)");
    expect(layout).toContain("<PageBanner banners={bannerMap} regionIds={regionIds} />");
    expect(layout).not.toContain("availableHeaderGraphicPath(");
    expect(siteHeader).not.toContain("availableBannerPath");
    expect(siteHeader).not.toContain("availableBackgroundMap");
    // The band never touches the banner role or its CSS.
    expect(componentCode).not.toMatch(/banners|ui-page-banner/);
    expect(bandBlock).not.toMatch(/ui-page-banner/);
    expect(availableBannerPath(AVAILABLE)).toBe("/assets/logo-header.svg");
  });

  it("7. the header NAVIGATION remains independent and interactive", () => {
    // Navigation still flows through its own seam and its own resolver.
    expect(siteHeader).toContain("getSiteNavLinks(locale)");
    expect(siteHeader).toContain("<ContextNavLinks");
    expect(siteHeader).toContain("aria-label={dictionary.navigation.primaryLabel}");
    // The band contributes no element that could sit over the links, and the
    // interactive controls are all still emitted. The RETIRED preset selector is
    // deliberately absent (owner decision, 2026-09): the header exposes the
    // location and language selectors only.
    expect(siteHeader).not.toContain("PresetSwitcher");
    expect(siteHeader).not.toContain('data-selector="preset"');
    expect(siteHeader).toContain("<LocationSwitcher");
    expect(siteHeader).toContain("<LanguageSwitcher");
    expect(componentCode).not.toMatch(/ContextNavLinks|nav-links|navigation/);
  });

  it("14. the completed footer-graphic role (P12-FG) remains independent of this role", () => {
    // FS1 — neither decorative role is configured by the generic template, which
    // is itself proof of independence: the two roles have their own keys,
    // resolvers and renderers and never read each other (asserted below).
    expect(siteConfig.assets?.footerGraphic).toBeUndefined();
    expect(siteConfig.assets?.headerGraphic).toBeUndefined();
    expect(siteFooter).toContain("siteConfig.assets?.footerGraphic");
    // The two roles never read each other's key or resolver.
    expect(siteHeader).not.toContain("footerGraphic");
    expect(siteFooter).not.toContain("headerGraphic");
    expect(availableFooterGraphicPath(AVAILABLE)).toBe("/assets/logo-header.svg");
    expect(assets).toMatch(/export function availableFooterGraphicPath[\s\S]{0,200}availableRoleAssetPath/);
  });

  it("15. the page-background role (P12-BG) remains independent", () => {
    expect(siteHeader).not.toContain("backgrounds");
    expect(layout).toContain("availableBackgroundMap(");
    expect(componentCode).not.toMatch(/backgrounds|ui-page-background|resolveBackgroundPath/);
    expect(bandBlock).not.toMatch(/ui-page-background/);
    expect(availableBackgroundMap({ all: AVAILABLE })).toEqual({ all: "/assets/logo-header.svg" });
  });

  it("16. adopter replaceability is preserved — nothing Provelopment-specific is embedded", () => {
    // The generic engine must never hard-code artwork: no image-extension
    // literal, no brand colour, no Foundation-specific filename.
    expect(component).not.toMatch(/\.(svg|png|webp|jpg|avif)["'`]/);
    expect(component).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(bandBlock).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The band renders whatever `src` the config resolver produced.
    expect(component).toContain("export function headerGraphicBandProps(src: string | undefined)");
    // Same-origin `public/assets/` runtime role → a file swap is the adopter workflow.
    expect(availableHeaderGraphicPath(AVAILABLE)?.startsWith("/assets/")).toBe(true);
  });
});
