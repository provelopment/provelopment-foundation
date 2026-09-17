import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { availableFooterGraphicPath } from "@/config/assets";
import { siteConfigFileSchema, siteAssetsSchema } from "@/config/schema";
import { siteConfig } from "@/config";
import { FooterGraphic } from "@/components/site/footer-graphic";

/**
 * P12-FG — the optional DECORATIVE footer graphic / watermark capability.
 *
 * Locks in the contract: ONE optional global `site.assets.footerGraphic` role
 * (`footer-graphic`), resolved through the SAME generic asset-availability rule
 * as the banner/background roles, rendered as a semantically invisible
 * decorative layer INSIDE the footer — never replacing the independent
 * `logoFooter` identity role.
 *
 * The approved Foundation footer artwork is now INTEGRATED at
 * `public/assets/footer-graphic.svg`; the positive/negative availability cases
 * still reuse the repository's existing neutral `logo-footer.svg` fixture, so the
 * availability rule stays proven independently of which artwork a deployment has
 * activated.
 */

const root = process.cwd();
const globals = readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");
const siteFooter = readFileSync(
  path.join(root, "src", "components", "site", "site-footer.tsx"),
  "utf8",
);
const component = readFileSync(
  path.join(root, "src", "components", "site", "footer-graphic.tsx"),
  "utf8",
);

/** The single `.ui-footer-graphic` rule block (the decorative-layer contract). */
const footerGraphicBlock = /\.ui-footer-graphic\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

/** An FS-4 absolute URL whose basename is backed by a real public/assets file. */
const AVAILABLE = "https://www.example.com/assets/logo-footer.svg";
/** An FS-4 absolute URL whose basename has NO backing file. */
const MISSING = "https://www.example.com/assets/footer-graphic-does-not-exist.png";

const render = (src: string | undefined) => renderToStaticMarkup(FooterGraphic({ src }) ?? null);

describe("P12-FG — schema / backward compatibility", () => {
  const rawSiteConfig = JSON.parse(
    readFileSync(path.join(root, "site.config.json"), "utf8"),
  ) as Record<string, unknown>;

  it("1. an existing adopter config WITHOUT the new role remains valid (no forced migration)", () => {
    // The shipped canonical config knows nothing about footer graphics — and
    // adding a `logoFooter`-only asset block (the pre-P12-FG shape) stays valid.
    expect(siteConfigFileSchema.safeParse(rawSiteConfig).success).toBe(true);
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { logoFooter: AVAILABLE };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(true);
  });

  it("accepts the single global footer-graphic role as an absolute URL", () => {
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { footerGraphic: AVAILABLE };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(true);
    // And the schema exposes it through the SAME optional `site.assets` block.
    expect(siteAssetsSchema.safeParse({ footerGraphic: AVAILABLE }).success).toBe(true);
  });

  it("rejects a relative footer-graphic URL (same FS-4 absolute-URL policy as every other asset role)", () => {
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { footerGraphic: "/assets/footer-graphic.png" };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(false);
    expect(siteAssetsSchema.safeParse({ footerGraphic: "/assets/footer-graphic.png" }).success).toBe(
      false,
    );
  });

  it("the shipped template leaves the footer-graphic role ABSENT (nothing renders, nothing required)", () => {
    // FS1 — the generic template configures no footer graphic: the role is
    // OPTIONAL and its absence is a fully-supported default state (proven by the
    // rendering contract below). An adopter activates it by configuring
    // `site.assets.footerGraphic` — in place, or with their own absolute URL.
    expect(siteConfig.assets?.footerGraphic).toBeUndefined();
    expect(availableFooterGraphicPath(siteConfig.assets?.footerGraphic)).toBeUndefined();
    // The blank placeholder still ships, so activating the role is one config
    // line and needs no artwork at all.
    const shipped = readFileSync(path.join(root, "public", "assets", "footer-graphic.svg"), "utf8");
    expect(shipped).toBe(readFileSync(path.join(root, "assets", "placeholders", "footer-graphic.svg"), "utf8"));
    expect(shipped).not.toMatch(/<(path|rect|circle|ellipse|polygon|line|image|text)\b/i);
  });
});

describe("P12-FG — availability + rendering contract", () => {
  it("2. no configured graphic → NO decorative footer layer (absent is a valid, fully-supported state)", () => {
    expect(availableFooterGraphicPath(undefined)).toBeUndefined();
    expect(render(availableFooterGraphicPath(undefined))).toBe("");
  });

  it("3. a valid configured asset → the decorative layer IS rendered with the resolved same-origin path", () => {
    const src = availableFooterGraphicPath(AVAILABLE);
    expect(src).toBe("/assets/logo-footer.svg");
    const html = render(src);
    expect(html).toContain('class="ui-footer-graphic"');
    expect(html).toContain("background-image:url(/assets/logo-footer.svg)");
  });

  it("4. a CONFIGURED-but-MISSING asset → the decorative layer is ABSENT (never a placeholder, never a 404)", () => {
    const src = availableFooterGraphicPath(MISSING);
    expect(src).toBeUndefined();
    expect(render(src)).toBe("");
  });

  it("6. the decorative graphic contributes NO semantics (no accessible name, no role, no alt, no text)", () => {
    const html = render(availableFooterGraphicPath(AVAILABLE));
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/\brole=/);
    expect(html).not.toMatch(/\baria-label/);
    expect(html).not.toMatch(/\balt=/);
    expect(html).not.toMatch(/<img/);
    expect(html).not.toMatch(/<h[1-6]/);
  });

  it("7. the decorative graphic is NON-INTERACTIVE and can never capture pointer input", () => {
    const html = render(availableFooterGraphicPath(AVAILABLE));
    expect(html).not.toMatch(/<a\b/);
    expect(html).not.toMatch(/<button\b/);
    expect(html).not.toMatch(/tabindex/i);
    expect(footerGraphicBlock).toMatch(/pointer-events:\s*none/);
  });
});

describe("P12-FG — layout-independence contract", () => {
  it("8. footer content stays structurally ABOVE the graphic (positioned, negative z-index, out of flow)", () => {
    expect(footerGraphicBlock).toMatch(/position:\s*absolute/);
    expect(footerGraphicBlock).toMatch(/inset:\s*0/);
    expect(footerGraphicBlock).toMatch(/z-index:\s*-1/);
    // The footer is the positioning anchor AND its own stacking context, so the
    // layer is scoped to the footer box and can never paint over the content.
    expect(siteFooter).toMatch(/<footer className="relative isolate mt-16 border-t border-border">/);
    // Footer content is in normal flow (a sibling of the layer), so it always
    // paints above a negative-z-index layer inside the isolated context.
    expect(siteFooter).toMatch(
      /className="mx-auto grid max-w-page break-words gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4"/,
    );
  });

  it("9. the layer can never introduce horizontal overflow or reserve layout space", () => {
    expect(footerGraphicBlock).toMatch(/margin:\s*0/);
    expect(footerGraphicBlock).toMatch(/padding:\s*0/);
    expect(footerGraphicBlock).toMatch(/border:\s*0/);
    // No structural sizing property may be declared on the layer.
    expect(footerGraphicBlock).not.toMatch(/[\s;{]width\s*:/);
    expect(footerGraphicBlock).not.toMatch(/[\s;{]height\s*:/);
    expect(footerGraphicBlock).not.toMatch(/[\s;{]min-/);
  });

  it("10. the existing footer responsive layout is unchanged (the only additions are flow-neutral `relative isolate`)", () => {
    // `position: relative` is the positioning anchor; `isolation: isolate` makes
    // the footer its own stacking context. Both are flow-neutral — no padding,
    // margin, reserved height, or overflow — so the existing layout (and its
    // multi-column → stacked responsive transition) is preserved verbatim.
    expect(siteFooter).toMatch(/<footer className="relative isolate mt-16 border-t border-border">/);
    // No engineering of the artwork: no opacity, no colour, no blend mode, no
    // animation, and no responsive variant of the role.
    expect(footerGraphicBlock).not.toMatch(/opacity/);
    expect(footerGraphicBlock).not.toMatch(/blend-mode/);
    expect(footerGraphicBlock).not.toMatch(/background-color/);
    expect(footerGraphicBlock).not.toMatch(/animation|transition|transform/);
    expect(globals).not.toMatch(/\.ui-footer-graphic[\s\S]{0,400}@media/);
  });

  it("the layer is a single empty DIV — it adds no children and no text content", () => {
    const html = render(availableFooterGraphicPath(AVAILABLE));
    expect(html).toMatch(/^<div [^>]*><\/div>$/);
  });
});

describe("P12-FG — separation + reusability contract", () => {
  it("5. the footer LOGO remains independent of the decorative graphic role", () => {
    // The footer identity mark still reads its OWN role, and the decorative
    // layer still reads its own — neither is substituted for the other.
    expect(siteFooter).toContain("siteConfig.assets?.logoFooter");
    expect(siteFooter).toContain("siteConfig.assets?.footerGraphic");
    expect(siteFooter).not.toMatch(/logoFooter[^\n]*footerGraphic/);
    expect(siteFooter).not.toMatch(/footerGraphic[^\n]*logoFooter/);
    // The decorative role never becomes a hard-coded ARTWORK filename.
    // (`.tsx` is the component module path and is legitimately referenced.)
    expect(siteFooter).not.toMatch(/footer-graphic\.(svg|png|webp|jpg|jpeg|avif|gif)/);
    expect(component).not.toMatch(/footer-graphic\.(svg|png|webp|jpg|jpeg|avif|gif)/);
  });

  it("12. adopter replaceability is preserved — nothing Provelopment-specific is embedded", () => {
    // The generic engine must never hard-code artwork: no image-extension
    // literal, no brand colour, no Foundation-specific filename.
    expect(component).not.toMatch(/\.(svg|png|webp|jpg|avif)["'`]/);
    expect(component).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The role is generic: it renders whatever `src` the config resolver produced.
    expect(component).toContain("export function FooterGraphic({ src }");
    // The runtime role is same-origin `public/assets/`, so a file swap is the
    // simple adopter workflow (same model as the banner/background roles).
    expect(availableFooterGraphicPath(AVAILABLE)?.startsWith("/assets/")).toBe(true);
  });

  it("11. the background and banner systems remain independent of the footer graphic", () => {
    // Distinct config keys, distinct resolvers — no conflation.
    const layout = readFileSync(path.join(root, "src", "app", "[locale]", "layout.tsx"), "utf8");
    expect(layout).toContain("availableBackgroundMap(siteConfig.assets?.backgrounds)");
    expect(layout).toContain("availableBannerPath(");
    expect(layout).not.toContain("availableFooterGraphicPath(");
    expect(siteFooter).not.toContain("availableBackgroundMap");
    expect(siteFooter).not.toContain("availableBannerPath");
    // The decorative layer reuses the SHARED generic availability rule.
    const assets = readFileSync(path.join(root, "src", "config", "assets.ts"), "utf8");
    expect(assets).toMatch(
      /export function availableFooterGraphicPath[\s\S]{0,200}availableRoleAssetPath\(absoluteUrl\)/,
    );
  });
});
