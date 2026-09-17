import { describe, expect, it } from "vitest";

import {
  assertConfiguredIconAssetsExist,
  assetPathFromUrl,
  availableIconName,
  iconAssetAvailable,
  type IconConfigSource,
} from "@/config/assets";
import { siteConfig } from "@/config";

/**
 * P6-1 — the icon-asset availability contract (framework layer):
 *  - a configured icon leaf must be backed by a real `public/assets/` file —
 *    otherwise the configuration FAILS LOUDLY at build time (P5-5A invalid →
 *    loud) instead of rendering a broken-image placeholder;
 *  - `""` / absent leaves are DELIBERATE absence and never fail;
 *  - `availableIconName` (the render boundary projection) returns "" when the
 *    asset is unavailable, so components are never handed a name that could
 *    produce a broken `<img>`.
 */
describe("P6-1 — configured icon assets", () => {
  it("the shipped default sidebar icons are real files under public/assets", () => {
    expect(iconAssetAvailable("sidebar-open.svg")).toBe(true);
    expect(iconAssetAvailable("sidebar-close.svg")).toBe(true);
  });

  it("availableIconName preserves missing/empty verbatim and neutralizes unavailable names (never a broken image)", () => {
    expect(availableIconName("sidebar-open.svg")).toBe("sidebar-open.svg");
    expect(availableIconName("definitely-missing-icon.svg")).toBe("");
    expect(availableIconName("")).toBe("");
    expect(availableIconName(undefined)).toBeUndefined();
  });

  it("a config with ONLY existing/empty/absent icon leaves validates", () => {
    expect(() =>
      assertConfiguredIconAssetsExist(minimalConfigWithIcons({ open: "sidebar-open.svg", close: "sidebar-close.svg" })),
    ).not.toThrow();
    expect(() => assertConfiguredIconAssetsExist(minimalConfigWithIcons({}))).not.toThrow();
    expect(() =>
      assertConfiguredIconAssetsExist(minimalConfigWithIcons({ open: "", close: "sidebar-close.svg", cta: "" })),
    ).not.toThrow();
  });

  it("a configured icon without a backing file FAILS LOUDLY, naming the exact leaf", () => {
    const config = minimalConfigWithIcons({ open: "nope-icon.svg" });
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/nope-icon\.svg/);
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/ui\.navigation\.sidebar\.open\.icon/);
  });

  it("navigation[] item icons are also validated", () => {
    const config = minimalConfigWithIcons({}, { icon: "missing-item-icon.svg" });
    expect(() => assertConfiguredIconAssetsExist(config)).toThrow(/navigation\[0\]\.icon/);
  });
});

interface IconOverrides {
  readonly open?: string;
  readonly close?: string;
  readonly cta?: string;
}

function minimalConfigWithIcons(
  icons: IconOverrides,
  navItem?: { readonly icon?: string; readonly label?: string; readonly href?: string },
): IconConfigSource {
  return {
    ui: {
      navigation: {
        sidebar: {
          open: { icon: icons.open },
          close: { icon: icons.close },
        },
      },
      cta: { icon: icons.cta },
    },
    navigation: [
      navItem ?? { label: "Home", href: "/" },
    ],
  };
}

/**
 * P6-2D — `assetPathFromUrl` behavior (same-origin rendering of configured
 * absolute asset URLs).
 *
 * `site.assets.*` leaves are FS-4 ABSOLUTE URLs (validated against `site.url`).
 * They are correct for canonical/JSON-LD/OpenGraph, but a rendered `<img src>`
 * fetches the literal value — so when `site.url` is a placeholder or the
 * deployment is previewed under a different host, the absolute URL would 404.
 * This helper re-derives the pathname so the image always fetches from the
 * CURRENT origin. These tests assert BEHAVIOR, not source text.
 */
describe("P6-2D — assetPathFromUrl", () => {
  it("passes through the deliberate-absence values verbatim", () => {
    expect(assetPathFromUrl(undefined)).toBeUndefined();
    expect(assetPathFromUrl("")).toBe("");
  });

  it("reduces an absolute asset URL to its same-origin pathname", () => {
    expect(assetPathFromUrl("https://www.example.com/assets/logo-title.jpg")).toBe(
      "/assets/logo-title.jpg",
    );
    expect(assetPathFromUrl("https://foundation.provelopment.com/assets/logo-footer.svg")).toBe(
      "/assets/logo-footer.svg",
    );
  });

  it("is decoupled from the configured site.url host (placeholder/mismatch still resolves)", () => {
    // The same pathname is derived regardless of which host names the asset —
    // this is the whole point: an `<img src>` must not depend on `site.url`.
    const a = assetPathFromUrl("https://www.example.com/assets/favicon.svg");
    const b = assetPathFromUrl("https://localhost:3000/assets/favicon.svg");
    expect(a).toBe("/assets/favicon.svg");
    expect(b).toBe("/assets/favicon.svg");
    expect(a).toBe(b);
  });

  it("strips query and hash from an absolute URL (only the path is fetched)", () => {
    expect(assetPathFromUrl("https://cdn.example.com/assets/logo-header.svg?v=2#mark")).toBe(
      "/assets/logo-header.svg",
    );
  });

  it("preserves a nested path component (any origin/CDN, any sub-path)", () => {
    expect(assetPathFromUrl("https://cdn.example.com/brand/runtime/assets/logo.svg")).toBe(
      "/brand/runtime/assets/logo.svg",
    );
  });

  it("returns a non-absolute/relative input verbatim (URL parse failure is safe)", () => {
    // A bare path has no base, so `new URL` throws — the helper must not crash
    // and must hand back exactly what it was given.
    expect(assetPathFromUrl("/assets/logo.svg")).toBe("/assets/logo.svg");
    expect(assetPathFromUrl("not a url")).toBe("not a url");
  });

  it("the shipped template configures no asset URLs — every identity role defaults to its runtime file", () => {
    // FS1: the generic template ships `assets: {}`. Each role resolves to the
    // shipped placeholder under `public/assets/`, so there is nothing to rewrite
    // here and a fresh clone renders a complete, un-branded site. The URL→path
    // contract itself is exercised by the cases above.
    expect(siteConfig.assets?.logo).toBeUndefined();
    expect(siteConfig.assets?.logoFooter).toBeUndefined();
    expect(siteConfig.assets?.favicon).toBeUndefined();
    expect(siteConfig.assets?.ogImage).toBeUndefined();
    expect(siteConfig.assets?.banners).toBeUndefined();
  });
});