import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { availableStatusGraphicPath } from "@/config/assets";
import { siteConfigFileSchema, siteAssetsSchema } from "@/config/schema";
import { siteConfig } from "@/config";
import { StatusGraphic } from "@/components/site/status-graphic";
import {
  StatusGraphicProvider,
  type StatusGraphicAsset,
} from "@/components/site/status-graphic-context";

/**
 * P12-SG — the optional DECORATIVE error / not-found status graphic capability.
 *
 * Locks in the contract: ONE optional global `site.assets.statusGraphic` role
 * (the `status-graphic` role) shared by BOTH status surfaces —
 * `[locale]/error.tsx` and `[locale]/not-found.tsx` — because the audit proved
 * they render the SAME status frame (`<Section className="py-24 text-center">`
 * with an `h1` / `p` / action rhythm). It renders in ONE deterministic in-flow
 * box ABOVE the status heading, is purely decorative, and never replaces the
 * heading, the message or the controls.
 *
 * The approved Foundation status artwork is now INTEGRATED at
 * `public/assets/status-graphic.svg`; the positive/negative availability cases
 * still reuse the repository's existing neutral `logo-header.svg` fixture, so the
 * availability rule stays proven independently of which artwork a deployment has
 * activated. It is used ONLY as an availability fixture — it is NOT
 * status-graphic artwork.
 */

const root = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(root, ...segments), "utf8");

const globals = read("src", "app", "globals.css");
const component = read("src", "components", "site", "status-graphic.tsx");
const context = read("src", "components", "site", "status-graphic-context.tsx");
const layout = read("src", "app", "[locale]", "layout.tsx");
const errorPage = read("src", "app", "[locale]", "error.tsx");
const notFoundPage = read("src", "app", "[locale]", "not-found.tsx");
const assets = read("src", "config", "assets.ts");
const schema = read("src", "config", "schema.ts");
const siteConfigSource = read("src", "config", "site-config.ts");
const siteFooter = read("src", "components", "site", "site-footer.tsx");
const siteHeader = read("src", "components", "site", "site-header.tsx");

/**
 * The same modules with their COMMENTS stripped. The "never touches another
 * seam" assertions must inspect the CODE: the contract documentation
 * legitimately NAMES the sibling seams to explain WHY they stay independent, so
 * scanning raw text would fail on the explanation rather than on a real
 * coupling.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const componentCode = stripComments(component);
const contextCode = stripComments(context);

/** The single `.ui-status-graphic` box rule block. */
const boxBlock = /\.ui-status-graphic\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
/** The single `.ui-status-graphic-image` rule block. */
const imageBlock = /\.ui-status-graphic-image\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

/** An FS-4 absolute URL whose basename is backed by a real public/assets file. */
const AVAILABLE = "https://www.example.com/assets/logo-header.svg";
/** An FS-4 absolute URL whose basename has NO backing file. */
const MISSING = "https://www.example.com/assets/status-graphic-does-not-exist.svg";

/**
 * Renders the status surface exactly as the status pages do: the resolved asset
 * arrives through the provider (the same transport the `[locale]` layout uses),
 * so `undefined` proves the unconfigured/absent path end to end.
 *
 * `createElement`'s props overload requires EVERY prop the component declares —
 * including `children`, which `StatusGraphicProvider` declares explicitly (the
 * same shape `ErrorMessagesProvider` uses). ESLint's `react/no-children-prop`
 * correctly forbids faking that by passing `children` in the props object, so the
 * props type is narrowed here and the child is passed as createElement's third
 * argument, which is the real call shape.
 */
const ProviderUnderTest = StatusGraphicProvider as unknown as ComponentType<{
  asset: StatusGraphicAsset | undefined;
}>;

const render = (asset: StatusGraphicAsset | undefined) =>
  renderToStaticMarkup(
    createElement(ProviderUnderTest, { asset }, createElement(StatusGraphic)),
  );

describe("P12-SG — schema / configuration contract", () => {
  const rawSiteConfig = JSON.parse(
    readFileSync(path.join(root, "site.config.json"), "utf8"),
  ) as Record<string, unknown>;

  it("1. an existing adopter config WITHOUT the new role remains valid (no forced migration)", () => {
    // The shipped canonical config knows nothing about a status graphic — and
    // the pre-P12-SG `site.assets` shapes stay valid.
    expect(siteConfigFileSchema.safeParse(rawSiteConfig).success).toBe(true);
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { logo: AVAILABLE, logoFooter: AVAILABLE };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(true);
    // `site.assets` itself remains entirely optional.
    expect(siteAssetsSchema.safeParse({}).success).toBe(true);
  });

  it("accepts the single shared status-graphic role as an absolute URL", () => {
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = { statusGraphic: AVAILABLE };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(true);
    // The schema exposes it through the SAME optional `site.assets` block.
    expect(siteAssetsSchema.safeParse({ statusGraphic: AVAILABLE }).success).toBe(true);
  });

  it("rejects a relative status-graphic URL (same FS-4 absolute-URL policy as every other asset role)", () => {
    const config = structuredClone(rawSiteConfig);
    (config.site as Record<string, unknown>).assets = {
      statusGraphic: "/assets/status-graphic.svg",
    };
    expect(siteConfigFileSchema.safeParse(config).success).toBe(false);
    expect(siteAssetsSchema.safeParse({ statusGraphic: "/assets/status-graphic.svg" }).success).toBe(
      false,
    );
  });

  it("2. the shipped template leaves the status-graphic role ABSENT (the capability is additive)", () => {
    // FS1 — no status artwork ships: the role is optional, and its absence means
    // the status surfaces render their heading/actions alone (proven below). An
    // adopter activates it by configuring `site.assets.statusGraphic`.
    expect(siteConfig.assets?.statusGraphic).toBeUndefined();
    // The role is declared in the schema + the config interface (additive only).
    expect(schema).toContain("statusGraphic: z");
    expect(siteConfigSource).toContain("readonly statusGraphic?: string;");
  });
});

describe("P12-SG — availability + rendering contract", () => {
  it("3. no configured status graphic → NO graphic at all (no DOM, no placeholder)", () => {
    expect(availableStatusGraphicPath(undefined)).toBeUndefined();
    expect(render(undefined)).toBe("");
  });

  it("5. configured-but-missing is indistinguishable from absent", () => {
    const missing = availableStatusGraphicPath(MISSING);
    expect(missing).toBeUndefined();
    // The resolver returns `undefined`, which is exactly what the renderer
    // receives — so the honest end-to-end result is no graphic.
    expect(render(missing ? { src: missing } : undefined)).toBe("");
    expect(
      existsSync(path.join(root, "public", "assets", "status-graphic-does-not-exist.svg")),
    ).toBe(false);
  });

  it("4. a valid available role renders the ONE decorative box", () => {
    const src = availableStatusGraphicPath(AVAILABLE);
    expect(src).toBe("/assets/logo-header.svg");
    const html = render({ src: src as string });
    // React 19 emits a generic `<link rel="preload" as="image">` hint for any
    // server-rendered <img> (the established behaviour `ui-cta.test.ts` already
    // documents for the page banner's image). It is FRAMEWORK behaviour, not a
    // preload subsystem added by this seam — so only the decorative box and its
    // image are asserted here.
    expect(html).toMatch(/<div class="ui-status-graphic" aria-hidden="true">/);
    expect(html).toContain('src="/assets/logo-header.svg"');
    expect(html).toContain('alt=""');
    expect(html).toContain('class="ui-status-graphic-image"');
    // Exactly one decorative element and one image — no placeholder, no caption.
    expect(html.match(/<div/g)?.length).toBe(1);
    expect(html.match(/<img/g)?.length).toBe(1);
    expect(html).not.toMatch(/<span|<p\b|<figure|<picture/);
  });

  it("the intrinsic size is passed as real width/height attributes (no layout shift)", () => {
    const html = render({ src: "/assets/logo-header.svg", width: 320, height: 120 });
    expect(html).toContain('width="320"');
    expect(html).toContain('height="120"');
    // The server reads the asset header once, so the box is reserved before load.
    expect(layout).toContain("readImageDimensions(statusGraphicPath)");
    expect(component).toContain("width={asset.width}");
    expect(component).toContain("height={asset.height}");
  });

  it("8/9. the graphic is decorative and non-semantic", () => {
    const html = render({ src: "/assets/logo-header.svg", width: 320, height: 120 });
    // Hidden from the accessibility tree, no name, no role, no reading order.
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('alt=""');
    expect(html).not.toMatch(/\brole=/);
    expect(html).not.toMatch(/aria-label|aria-labelledby|aria-describedby/);
    expect(html).not.toMatch(/aria-live|aria-atomic/);
    // The layer carries NO text content: it cannot replace the status copy.
    expect(html.replace(/<[^>]*>/g, "")).toBe("");
  });

  it("9. the graphic is non-interactive and cannot capture pointer events", () => {
    const html = render({ src: "/assets/logo-header.svg" });
    expect(html).not.toMatch(/<a\b|<button\b|<input\b|<select\b|<textarea\b/);
    expect(html).not.toMatch(/tabindex|tabIndex|onclick|onClick/);
    expect(boxBlock).toContain("pointer-events: none");
  });

  it("the provider is FAIL-SAFE — a missing provider yields no graphic, never an error", () => {
    // Rendered bare (i.e. outside `StatusGraphicProvider`): no graphic, no throw.
    // Decoration must never be able to break a status page.
    expect(renderToStaticMarkup(createElement(StatusGraphic))).toBe("");
    expect(contextCode).not.toMatch(/throw new Error/);
    expect(context).toContain("createContext<StatusGraphicAsset | undefined>(undefined)");
  });
});

describe("P12-SG — status-surface contract (error AND not-found share ONE role)", () => {
  /** The exact frame both status surfaces render (the reason ONE role suffices). */
  const STATUS_FRAME = '<Section className="py-24 text-center">';

  it("the two status surfaces render the SAME frame and BOTH render <StatusGraphic />", () => {
    for (const [name, source] of [
      ["error.tsx", errorPage],
      ["not-found.tsx", notFoundPage],
    ] as const) {
      expect(source, `${name} must keep the shared status frame`).toContain(STATUS_FRAME);
      // Same heading / supporting-text treatment on both surfaces.
      expect(source).toContain('className="text-4xl font-bold tracking-tight"');
      expect(source).toContain('className="mt-4 text-muted-foreground"');
      // The graphic is the FIRST child of that frame — above the heading.
      const frameIndex = source.indexOf(STATUS_FRAME);
      const graphicIndex = source.indexOf("<StatusGraphic />");
      const headingIndex = source.indexOf("<h1");
      expect(graphicIndex, `${name} must render the status graphic`).toBeGreaterThan(frameIndex);
      expect(graphicIndex).toBeLessThan(headingIndex);
      expect(source).toContain('from "@/components/site/status-graphic"');
    }
  });

  it("it is ONE role — no per-surface error/not-found graphic role exists anywhere", () => {
    // Three files, one role: no route-derived role duplication.
    for (const source of [schema, siteConfigSource, assets, layout]) {
      expect(source).not.toMatch(/errorGraphic|notFoundGraphic/);
    }
    expect(schema.match(/statusGraphic: z/g)?.length).toBe(1);
    expect(assets.match(/export function availableStatusGraphicPath/g)?.length).toBe(1);
    // Both surfaces resolve through the ONE provider value.
    expect(layout.match(/<StatusGraphicProvider/g)?.length).toBe(1);
  });

  it("6. error semantics remain intact — deliberately no text lives in the graphic", () => {
    expect(errorPage).toContain("const messages = useErrorMessages();");
    expect(errorPage).toContain("{messages.title}");
    expect(errorPage).toContain("{messages.message}");
    expect(errorPage).toContain("{messages.tryAgain}");
    expect(errorPage).toContain("{messages.returnHome}");
  });

  it("7. not-found semantics remain intact", () => {
    expect(notFoundPage).toContain("{dictionary.notFound.title}");
    expect(notFoundPage).toContain("{dictionary.notFound.message}");
    expect(notFoundPage).toContain("{dictionary.notFound.returnHome}");
    // Locale is still preserved through the established root-params contract.
    expect(notFoundPage).toContain('from "next/root-params"');
    expect(notFoundPage).toContain("locale()");
  });

  it("10. actions / links remain fully interactive (nothing is swallowed by the graphic)", () => {
    // The retry control is still the shared Button wired to `reset()`.
    expect(errorPage).toContain("<Button type=\"button\" onClick={() => reset()}>");
    expect(errorPage).toMatch(/<Link\s[\s\S]*href=\{`\/\$\{locale \?\? ""\}`\}/);
    expect(notFoundPage).toMatch(/<Link\s[\s\S]*href=\{`\/\$\{currentLocale\}`\}/);
    // The decorative box can never intercept a pointer event (see box CSS).
    expect(boxBlock).toContain("pointer-events: none");
    // …and nothing wraps the actions in the decorative layer.
    expect(componentCode).not.toMatch(/<Link|<Button|<a\b/);
  });
});

describe("P12-SG — geometry / responsive contract", () => {
  it("11. the box is IN FLOW and centred — no positioning, no stacking, no fixed layer", () => {
    expect(boxBlock).toContain("display: flex");
    expect(boxBlock).toContain("justify-content: center");
    // Deliberately NOT an absolutely positioned overlay: a status page has no
    // reserved surface to layer onto.
    expect(boxBlock).not.toMatch(/position\s*:|z-index|inset|top\s*:|left\s*:/);
  });

  it("the box sits above the heading on the frame's own 2rem rhythm", () => {
    expect(boxBlock).toContain("margin: 0 0 2rem");
    // The rest of the frame's rhythm is untouched.
    expect(errorPage).toContain('className="mt-8 flex items-center justify-center gap-4"');
    expect(notFoundPage).toContain('className="mt-6"');
  });

  it("12/14. the image never upscales, never crops and never distorts", () => {
    expect(imageBlock).toContain("width: auto");
    expect(imageBlock).toContain("max-width: 100%");
    expect(imageBlock).toContain("height: auto");
    expect(imageBlock).not.toMatch(/object-fit|object-position|clip-path|overflow/);
  });

  it("13. horizontal overflow is impossible", () => {
    const statusCss = `${boxBlock}\n${imageBlock}`;
    expect(statusCss).not.toMatch(/100vw|overflow-x|min-width\s*:\s*\d/);
    expect(statusCss).not.toMatch(/position\s*:/);
    // The graphic is bounded by the page frame's own content column.
    expect(layout).toContain("mainClassName=\"flex-1\"");
  });

  it("§11. ONE asset, ONE role — no breakpoint or art-direction variants", () => {
    // No viewport-specific CSS for this seam.
    expect(globals).not.toMatch(/\.ui-status-graphic[\s\S]{0,600}@media/);
    // No JS viewport listeners and no <picture> art direction.
    expect(componentCode).not.toMatch(/matchMedia|ResizeObserver|innerWidth|innerHeight|<picture/);
    expect(layout).not.toMatch(/matchMedia|ResizeObserver|innerWidth/);
    // A single canonical role name — never a per-viewport key.
    expect(schema.match(/statusGraphic/g)?.length).toBe(1);
  });

  it("§14/§15. the engine applies NO visual transformation and adds no motion", () => {
    const statusCss = `${boxBlock}\n${imageBlock}`;
    expect(statusCss).not.toMatch(/opacity|blend-mode|filter|background-color/);
    expect(statusCss).not.toMatch(/animation|transition|transform/);
    expect(statusCss).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(componentCode).not.toMatch(/canvas|WebGL|requestAnimationFrame|IntersectionObserver/);
    expect(componentCode).not.toMatch(/preload/);
  });
});

describe("P12-SG — separation, reusability and role independence", () => {
  it("15/16. the PAGE BANNER and PAGE BACKGROUND seams remain completely independent", () => {
    expect(layout).toContain("availableBannerPath(");
    expect(layout).toContain("availableBackgroundMap(siteConfig.assets?.backgrounds)");
    expect(layout).toContain("<PageBanner banners={bannerMap} regionIds={regionIds} />");
    expect(layout).toContain("<PageBackground backgrounds={backgroundMap} regionIds={regionIds} />");
    expect(componentCode).not.toMatch(
      /banners|backgrounds|ui-page-banner|ui-page-background|PageBanner|PageBackground/,
    );
    expect(boxBlock).not.toMatch(/ui-page-banner|ui-page-background/);
  });

  it("17. the header/footer graphic roles remain independent and untouched", () => {
    expect(siteHeader).toContain("availableHeaderGraphicPath");
    expect(siteFooter).toContain("availableFooterGraphicPath");
    expect(componentCode).not.toMatch(
      /ui-site-header|ui-footer-graphic|ui-header-graphic|headerGraphic|footerGraphic/,
    );
    expect(boxBlock).not.toMatch(/ui-site-header|ui-footer-graphic|ui-header-graphic/);
    // The status graphic is not the header band and not the footer watermark.
    expect(layout).toContain("availableStatusGraphicPath(siteConfig.assets?.statusGraphic)");
    expect(siteHeader).not.toContain("statusGraphic");
    expect(siteFooter).not.toContain("statusGraphic");
  });

  it("18. identity / logo / icon / navigation seams remain independent", () => {
    expect(componentCode).not.toMatch(/logo-header|logo-footer|favicon|availableIconName|<nav/);
    expect(errorPage).not.toMatch(/headerGraphic|footerGraphic|statusGraphic/);
    expect(notFoundPage).not.toMatch(/headerGraphic|footerGraphic|statusGraphic/);
    // Navigation still flows through its own seam.
    expect(layout).toContain("getSiteNavLinks(locale)");
  });

  it("23. the sibling header/footer graphics remain OPTIONAL and never touch this seam", () => {
    // FS1 — neither sibling decorative role is configured by the generic
    // template, so nothing renders for them; both still ship their blank
    // placeholder runtime files, and the status seam stays strictly independent:
    // the status component and layout never name or read them.
    expect(siteConfig.assets?.footerGraphic).toBeUndefined();
    expect(siteConfig.assets?.headerGraphic).toBeUndefined();
    const runtimeAssets = readdirSync(path.join(root, "public", "assets"));
    expect(runtimeAssets.some((name) => /^(footer|header)-graphic\./i.test(name))).toBe(true);
    // Neither sibling role is reused as a status-graphic fixture.
    expect(componentCode).not.toMatch(/footer-graphic|header-graphic/);
    expect(layout).not.toMatch(/footerGraphic|headerGraphic/);
  });

  it("§8. the SHARED generic availability machinery is reused — no new loader", () => {
    expect(assets).toMatch(
      /export function availableStatusGraphicPath[\s\S]{0,200}availableRoleAssetPath\(absoluteUrl\)/,
    );
    // No separate file loader, no client-side fetch, no remote artwork system.
    expect(componentCode).not.toMatch(/fetch\(|XMLHttpRequest|readFileSync|node:fs/);
    expect(contextCode).not.toMatch(/fetch\(|XMLHttpRequest|readFileSync|node:fs/);
  });

  it("the node:fs resolver never reaches the browser chunk graph", () => {
    expect(component).toContain('"use client"');
    expect(context).toContain('"use client"');
    expect(componentCode).not.toMatch(/@\/config/);
    expect(contextCode).not.toMatch(/@\/config/);
    // The layout stays a Server Component — the only place the role is resolved.
    expect(layout).not.toContain('"use client"');
    expect(layout).toContain('from "@/config/assets"');
  });

  it("18. adopter replaceability is preserved — nothing Provelopment-specific is embedded", () => {
    expect(componentCode).not.toMatch(/\.(svg|png|webp|jpg|jpeg|avif|gif)["'`]/);
    expect(componentCode).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(`${boxBlock}${imageBlock}`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    // The role is generic: it renders whatever `src` the config resolver produced.
    expect(component).toContain("export function StatusGraphic()");
    expect(availableStatusGraphicPath(AVAILABLE)?.startsWith("/assets/")).toBe(true);
  });
});


