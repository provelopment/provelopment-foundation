import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));

import { availableHeaderGraphicPath, availableIconName, assetPathFromUrl } from "@/config/assets";
import { siteConfig } from "@/config";
import { siteAssetsSchema } from "@/config/schema";
import { FooterGraphic } from "@/components/site/footer-graphic";
import { PageBackground } from "@/components/site/page-background";
import { PageBanner } from "@/components/site/page-banner";
import { StatusGraphic } from "@/components/site/status-graphic";
import { headerGraphicBandProps } from "@/components/site/header-graphic";

/**
 * BRAND-ASSET SWAP CONTRACT — the file/role contract, locked independently of
 * ANY artwork's visual content.
 *
 * This suite exists so that artwork can change freely. It never asserts a pixel,
 * a colour, a path `d`, a node count or a composition: every graphic-facing
 * assertion is about **file existence, declared/container geometry, filename,
 * configuration key or runtime geometry** — the facts the swap contract in
 * `BRAND_ASSETS.md` actually promises.
 *
 * What it proves:
 *  1. every documented runtime role has a backing file at its canonical filename;
 *  2. every configured value resolves by FILENAME only (no code change to swap);
 *  3. an artwork change inside the contract needs NO engine change — the engine
 *     hard-codes no artwork filename, colour or brand name;
 *  4. every optional role is removable by configuration and renders NOTHING;
 *  5. the neutral test placeholder is a source fixture, never a runtime asset;
 *  6. the authoritative document and the code agree role by role — including the
 *     MEASURED icon-colour seam (an `<img>`-loaded SVG cannot inherit the host
 *     document's text colour, so an icon's colour must live in the file).
 */

const ROOT = process.cwd();
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");
const runtimeAsset = (file: string) => path.join(ROOT, "public", "assets", file);
const pathnameOf = (url: string | undefined) => (url ? new URL(url).pathname : "");

/** `BRAND_ASSETS.md` is the ONE authoritative swap contract. */
const CONTRACT = read("BRAND_ASSETS.md");

/** The ten canonical banner page roles. */
const BANNER_PAGES = [
  "home",
  "about",
  "contact",
  "connect",
  "offerings",
  "portfolio",
  "blog",
  "resources",
  "testimonials",
  "legal",
] as const;

/**
 * Every `site.assets.*` role the canonical deployment configures, with the
 * canonical runtime filename each one must name.
 */
const CONFIGURED_ROLES = [
  { key: "site.assets.logo", file: "logo-header.svg", url: siteConfig.assets?.logo },
  { key: "site.assets.ogImage", file: "og-image.png", url: siteConfig.assets?.ogImage },
  { key: "site.assets.favicon", file: "favicon.svg", url: siteConfig.assets?.favicon },
  { key: "site.assets.logoFooter", file: "logo-footer.svg", url: siteConfig.assets?.logoFooter },
  {
    key: 'site.assets.backgrounds["all"]',
    file: "background-all.svg",
    url: siteConfig.assets?.backgrounds?.all,
  },
  {
    key: "site.assets.headerGraphic",
    file: "header-graphic.svg",
    url: siteConfig.assets?.headerGraphic,
  },
  {
    key: "site.assets.footerGraphic",
    file: "footer-graphic.svg",
    url: siteConfig.assets?.footerGraphic,
  },
  {
    key: "site.assets.statusGraphic",
    file: "status-graphic.svg",
    url: siteConfig.assets?.statusGraphic,
  },
  ...BANNER_PAGES.map((page) => ({
    key: `site.assets.banners["${page}"]`,
    file: `banner-${page}.png`,
    url: siteConfig.assets?.banners?.[page],
  })),
] as const;

/** The four shipped plain-filename control icons (no `site.assets` key). */
const CONTROL_ICON_FILES = [
  "sidebar-open.svg",
  "sidebar-close.svg",
  "sidebar-default-icon-open.svg",
  "sidebar-default-icon-closed.svg",
] as const;

/** The seven shipped generic (non-trademark) connectivity icons. */
const GENERIC_ICON_FILES = [
  "icon-phone.svg",
  "icon-email.svg",
  "icon-message.svg",
  "icon-link.svg",
  "icon-external-link.svg",
  "icon-share.svg",
  "icon-globe.svg",
] as const;

/** The neutral source placeholder — never shipped, never resolved. */
const PLACEHOLDER = "tests/fixtures/placeholder-assets/header-graphic.svg";

describe("swap contract — the configured role inventory", () => {
  it("names the canonical runtime filename for every role the platform supports", () => {
    // FS1 — the role INVENTORY is the platform capability and is always present;
    // the shipped generic template simply configures none of the optional roles.
    for (const role of CONFIGURED_ROLES) {
      expect(role.file, `${role.key} must name a canonical role file`).toMatch(/^[a-z0-9-]+\.(svg|png)$/);
      if (role.url === undefined) continue;
      // A role that IS configured must be an absolute URL naming that role file.
      expect(role.url.startsWith("https://"), `${role.key} must be an absolute URL`).toBe(true);
      expect(pathnameOf(role.url), `${role.key} must name its role file`).toBe(
        `/assets/${role.file}`,
      );
    }
  });

  it("ships the identity + blank decorative role files, and no artwork-only role", () => {
    // Roles a fresh clone actually RENDERS: the identity roles and the blank
    // decorative defaults (which draw nothing).
    for (const file of [
      "logo-header.svg",
      "logo-footer.svg",
      "favicon.svg",
      "header-graphic.svg",
      "footer-graphic.svg",
    ]) {
      expect(existsSync(runtimeAsset(file)), `${file} must ship`).toBe(true);
    }
    // Artwork-only roles ship NOTHING until an adopter provides artwork: the
    // template never invents example imagery.
    for (const file of ["og-image.png", "background-all.svg", "status-graphic.svg"]) {
      expect(existsSync(runtimeAsset(file)), `${file} must not ship with the template`).toBe(false);
    }
    for (const page of BANNER_PAGES) {
      expect(existsSync(runtimeAsset(`banner-${page}.png`)), `banner-${page}.png must not ship`).toBe(false);
    }
  });

  it("every shipped plain-filename control icon and generic connectivity icon exists", () => {
    for (const file of [...CONTROL_ICON_FILES, ...GENERIC_ICON_FILES]) {
      expect(existsSync(runtimeAsset(file)), `${file} must be on disk`).toBe(true);
    }
  });

  it("the schema accepts every role the canonical deployment configures", () => {
    expect(siteAssetsSchema.safeParse(siteConfig.assets).success).toBe(true);
  });
});

describe("swap contract — filename-only resolution", () => {
  it("resolution depends on the BASENAME only, not on the URL's origin", () => {
    // The availability check looks the basename up under public/assets/, so a URL
    // on ANY origin can be screened…
    expect(
      availableHeaderGraphicPath("https://cdn.elsewhere.example/header-graphic.svg"),
    ).toBe("/header-graphic.svg");
    // …and the rendered src is the configured URL's PATHNAME (the browser then
    // fetches it from the CURRENT origin), which is why the canonical practice is
    // to keep the path `/assets/<filename>`.
    expect(availableHeaderGraphicPath("https://www.example.com/assets/header-graphic.svg")).toBe(
      "/assets/header-graphic.svg",
    );
    expect(assetPathFromUrl("https://www.example.com/assets/header-graphic.svg")).toBe(
      "/assets/header-graphic.svg",
    );
  });

  it("a NEW connectivity icon filename needs no code change", () => {
    // An existing file resolves by name…
    expect(availableIconName("icon-phone.svg")).toBe("icon-phone.svg");
    // …and an unknown name degrades to the deliberate no-icon value rather than
    // a broken image — never a build failure for connectivity artwork.
    expect(availableIconName("icon-not-produced-yet.svg")).toBe("");
    // No filename allow-list exists in the engine: supplying the file is enough.
    const engine =
      read("src", "config", "assets.ts") +
      read("src", "components", "site", "connectivity-links.ts");
    expect(engine).not.toMatch(/icon-phone|icon-email|icon-globe|icon-share/);
  });
});

describe("swap contract — no engine dependency on any artwork", () => {
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  /**
   * The files that RESOLVE or RENDER the branding roles. `schema.ts` is excluded
   * because its only occurrences of asset names are pre-existing `.url()`
   * validation-message EXAMPLES (error text, not asset references).
   */
  const ENGINE_FILES = [
    "src/config/assets.ts",
    "src/config/site-config.ts",
    "src/app/[locale]/layout.tsx",
    "src/components/site/page-banner.tsx",
    "src/components/site/page-background.tsx",
    "src/components/site/header-graphic.ts",
    "src/components/site/footer-graphic.tsx",
    "src/components/site/status-graphic.tsx",
    "src/components/site/site-header.tsx",
    "src/components/site/site-footer.tsx",
    "src/components/site/connectivity-links.ts",
  ] as const;

  it("no engine file hard-codes a shipped artwork filename (including the placeholder)", () => {
    for (const file of ENGINE_FILES) {
      const code = stripComments(read(...file.split("/")));
      for (const role of CONFIGURED_ROLES) {
        expect(code, `${file} must not hard-code ${role.file}`).not.toContain(role.file);
      }
      expect(code, `${file} must not reference the placeholder`).not.toMatch(/placeholder/i);
    }
  });

  /**
   * The files that RENDER a graphic role. The `[locale]` layout is deliberately
   * EXCLUDED from the colour check below: its only hex values are the pre-existing
   * `viewport` browser `theme-color` declarations (`#ffffff` / `#0a0a0a`), which
   * are mobile-browser chrome, not artwork rendering.
   */
  const GRAPHIC_RENDER_FILES = [
    "src/config/assets.ts",
    "src/config/site-config.ts",
    "src/components/site/page-banner.tsx",
    "src/components/site/page-background.tsx",
    "src/components/site/header-graphic.ts",
    "src/components/site/footer-graphic.tsx",
    "src/components/site/status-graphic.tsx",
    "src/components/site/site-header.tsx",
    "src/components/site/site-footer.tsx",
    "src/components/site/connectivity-links.ts",
  ] as const;

  it("no engine file embeds a brand colour or the brand name", () => {
    for (const file of GRAPHIC_RENDER_FILES) {
      const code = stripComments(read(...file.split("/")));
      expect(code, `${file} must not embed a hex colour`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    }
    for (const file of ENGINE_FILES) {
      const code = stripComments(read(...file.split("/")));
      expect(code, `${file} must not embed the brand name`).not.toMatch(/Provelopment/i);
    }
  });

  it("the configuration is the ONLY source of role values", () => {
    const layout = read("src", "app", "[locale]", "layout.tsx");
    const header = read("src", "components", "site", "site-header.tsx");
    const footer = read("src", "components", "site", "site-footer.tsx");
    expect(layout).toContain("siteConfig.assets?.banners");
    expect(layout).toContain("availableBackgroundMap(siteConfig.assets?.backgrounds)");
    expect(layout).toContain("siteConfig.assets?.statusGraphic");
    expect(layout).toContain("siteConfig.assets?.ogImage");
    expect(layout).toContain("siteConfig.assets?.favicon");
    expect(header).toContain("siteConfig.assets?.logo");
    expect(header).toContain("siteConfig.assets?.headerGraphic");
    expect(footer).toContain("siteConfig.assets?.logoFooter");
    expect(footer).toContain("siteConfig.assets?.footerGraphic");
  });
});


describe("swap contract — every optional role is removable by configuration", () => {
  it("no configured asset → the header band is exactly absent (no attribute, no style)", () => {
    const props = headerGraphicBandProps(undefined);
    // Byte-exact "no header graphic" state: an EMPTY props object, so the shell
    // `<header>` renders precisely as it did before the capability existed.
    expect(props).toEqual({});
    expect(JSON.stringify(props)).not.toContain("style");
    expect(JSON.stringify(props)).not.toContain("data-ui-header-graphic");
  });

  it("no configured asset → the footer / status / banner / background layers render NOTHING", () => {
    expect(renderToStaticMarkup(createElement(FooterGraphic, { src: undefined }))).toBe("");
    // The status graphic reads a context whose default is `undefined`, so it is
    // fail-safe outside the provider (and when the role is unconfigured).
    expect(renderToStaticMarkup(createElement(StatusGraphic))).toBe("");
    expect(
      renderToStaticMarkup(createElement(PageBanner, { banners: {}, regionIds: [] })),
    ).toBe("");
    expect(
      renderToStaticMarkup(createElement(PageBackground, { backgrounds: {}, regionIds: [] })),
    ).toBe("");
  });

  it("a configured-but-missing role is indistinguishable from an absent one", () => {
    // No placeholder, no broken image, no 404 — the documented degradation.
    expect(
      availableHeaderGraphicPath("https://www.example.com/assets/header-graphic-NOT-SHIPPED.svg"),
    ).toBeUndefined();
    expect(availableIconName("not-shipped.svg")).toBe("");
  });
});

describe("swap contract — the neutral placeholder is a source fixture, and the SHIPPED default is blank", () => {
  const placeholder = read(...PLACEHOLDER.split("/"));

  it("uses the canonical runtime filename but is NOT a runtime asset", () => {
    expect(PLACEHOLDER.endsWith("/header-graphic.svg")).toBe(true);
    // The shipped role file exists and is the BLANK placeholder artwork — the
    // neutral TEST fixture is still separate from it and never resolved by code.
    expect(existsSync(path.join(ROOT, "public", "assets", "header-graphic.svg"))).toBe(true);
    expect(existsSync(path.join(ROOT, "public", "assets", "header-graphic-placeholder.svg"))).toBe(
      false,
    );
    expect(JSON.stringify(siteConfig.assets)).not.toMatch(/placeholder/i);
  });

  it("ships a blank, transparent decorative header/footer default that draws nothing", () => {
    // OWNER RULING (2026-09) — the default must be blank/not used, and the
    // shipped artwork must therefore be free of invisible branded content. Each
    // runtime file is the byte-identical mirror of its placeholder source.
    for (const role of ["header-graphic.svg", "footer-graphic.svg"]) {
      const shipped = read("public", "assets", role);
      expect(shipped, `${role} must be its placeholder source`).toBe(
        read("assets", "placeholders", role),
      );
      expect(shipped, `${role} must draw nothing`).not.toMatch(
        /<(path|rect|circle|ellipse|polygon|line|image|text)\b/i,
      );
      expect(shipped, `${role} must carry no brand colour`).not.toMatch(/#4F7CAC/i);
      expect(shipped, `${role} must declare a viewBox`).toMatch(/viewBox="[^"]+"/);
      // …and no deployment-specific artwork ships for the role in the template:
      // the generic template has no brand of its own.
      expect(existsSync(path.join(ROOT, "assets", "branding"))).toBe(false);
    }
  });

  it("is a valid, self-contained, inert SVG on the documented recommended master", () => {
    expect(placeholder).toContain("<svg");
    expect(placeholder).toContain('viewBox="0 0 4096 512"'); // the documented RECOMMENDED master
    // No script, no animation, no embedded raster, no font dependency, no external ref.
    expect(placeholder).not.toMatch(/<script|<animate|<set|<image|@font-face|<style/i);
    expect(placeholder).not.toMatch(/xlink:href|href="http|\bfont-family\b/i);
    // Transparent canvas: no opaque full-canvas background rectangle.
    expect(placeholder).not.toMatch(/<rect[^>]*(width="4096"|height="512")[^>]*fill="#[0-9a-fA-F]{6}"/i);
  });

  it("can never be mistaken for brand authority", () => {
    expect(placeholder).toMatch(/PLACEHOLDER/);
    expect(placeholder).toMatch(/NOT BRAND AUTHORITY/);
  });
});

describe("swap contract — the authoritative document and the code agree", () => {
  it("BRAND_ASSETS.md names every shipped role file and every config key", () => {
    for (const role of CONFIGURED_ROLES) {
      expect(CONTRACT, `BRAND_ASSETS.md must name ${role.file}`).toContain(role.file);
      expect(CONTRACT, `BRAND_ASSETS.md must name ${role.key}`).toContain(role.key);
    }
    for (const file of [...CONTROL_ICON_FILES, ...GENERIC_ICON_FILES]) {
      expect(CONTRACT, `BRAND_ASSETS.md must name ${file}`).toContain(file);
    }
  });

  it("BRAND_ASSETS.md is the single authority and is linked from the entry docs", () => {
    for (const doc of ["README.md", "CUSTOMIZING.md"]) {
      expect(read(doc), `${doc} must link BRAND_ASSETS.md`).toContain("BRAND_ASSETS.md");
    }
    // The contract states the two rules that keep artwork swappable and optional.
    expect(CONTRACT).toMatch(/require NO component, schema, resolver, CSS or routing changes/);
    expect(CONTRACT).toMatch(/HARD RUNTIME REQUIREMENT/);
    expect(CONTRACT).toMatch(/RECOMMENDED/);
  });
});

describe("swap contract — the icon colour seam is documented as MEASURED", () => {
  /** The two nodes that render every configurable icon (AssetIcon / NavItem). */
  const iconRenderPath =
    read("src", "components", "ui", "asset-icon.tsx") +
    read("src", "components", "ui", "nav-item.tsx");

  it("renders every configurable icon through a plain <img>, never injected or masked markup", () => {
    expect(iconRenderPath).toMatch(/<img\s/);
    // Nothing that WOULD let the host document's CSS reach the file's own colour
    // model, and nothing that mutates the artwork on the way out.
    expect(iconRenderPath).not.toMatch(/dangerouslySetInnerHTML|webkit-mask|mask-image|filter\s*:/);
  });

  it("BRAND_ASSETS.md states the image-document colour behaviour and drops the inheritance claim", () => {
    // The disproven claim must be gone…
    expect(CONTRACT).not.toMatch(/inherits the surrounding colour automatically/i);
    expect(CONTRACT).not.toMatch(/inherit(?:s)? colour from context/i);
    // …and the measured contract must be stated.
    expect(CONTRACT).toMatch(/cannot reach the icon's contents/i);
    expect(CONTRACT).toMatch(/own initial colour[\s\S]{0,60}\*\*black\*\*/i);
    expect(CONTRACT).toMatch(/must be encoded in the\s+asset itself/i);
    // The two statements that must never contradict each other.
    expect(CONTRACT).toMatch(/engine recolour[\s\S]{0,80}NONE/i);
    expect(CONTRACT).toMatch(/engine recolouring = none/i);
    // Colour windows of both icon families point at the one mechanism box.
    expect((CONTRACT.match(/see the box in §11/gi) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("CUSTOMIZING.md no longer promises colour inheritance to adopters", () => {
    const customizing = read("CUSTOMIZING.md");
    expect(customizing).not.toMatch(/They inherit colour from context/i);
    expect(customizing).toMatch(/the colour that\s+renders is the colour the file carries/i);
  });

  it("every shipped generic icon's declared colour model matches the contract", () => {
    for (const icon of GENERIC_ICON_FILES) {
      const file = read("public", "assets", icon);
      // Asserted on the FILE's declaration, never on a rendered pixel.
      expect(file, `${icon} declares currentColor`).toContain('stroke="currentColor"');
      expect(file, `${icon} carries no internal style block`).not.toMatch(/<style/i);
      expect(file, `${icon} carries no literal colour`).not.toMatch(/(?:fill|stroke)="#/i);
    }
    // The counter-example the contract cites for an ENCODED colour.
    expect(read("public", "assets", "sidebar-default-icon-open.svg")).toContain('fill="#6b7280"');
  });
});

