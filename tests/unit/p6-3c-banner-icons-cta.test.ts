import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/*
 * P6-3C — the three owner-approved corrections:
 *  A. banner scaling + centering (`min(available, 1.5 × natural)`, never
 *     overflowing, aspect ratio preserved, no artificial height);
 *  B. sidebar NAVIGATION-ITEM icon dimensions (32×32 desktop / 16×16 tablet)
 *     with the approved rail geometry untouched;
 *  C. Book Now placement (the rendered placement contract is asserted by the
 *     browser matrix; here the decision core + composition are proven).
 *
 * `PageBanner` is a client component (it reads the current pathname), so
 * `next/navigation` is stubbed — the banner MAP is a plain server-computed prop.
 */
vi.mock("next/navigation", () => ({ usePathname: () => "/en" }));

import { readImageDimensions } from "@/config/assets";
import { PageBanner, bannerMaxWidth } from "@/components/site/page-banner";
import { resolveShellPattern, resolveUiConfig } from "@/core/ui";

const globals = readFileSync(path.join(process.cwd(), "src", "app", "globals.css"), "utf8");

/** Every `.ui-page-banner*` rule block (structure + sizing contract). */
const bannerBlocks = [...globals.matchAll(/\.ui-page-banner[^{}]*\{[^}]*\}/g)].map((m) => m[0]);
const bannerDeclaration = (property: string): string[] =>
  bannerBlocks.flatMap((block) =>
    [...block.matchAll(new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`, "g"))].map((m) => m[1].trim()),
  );

describe("P6-3C/A — banner sizing may never exceed 1.5× the graphic's natural width", () => {
  it("computes the permitted maximum as exactly 1.5× natural (sub-pixel precision)", () => {
    expect(bannerMaxWidth(240)).toBe(360);
    expect(bannerMaxWidth(1920)).toBe(2880);
    expect(bannerMaxWidth(321)).toBe(481.5);
    expect(bannerMaxWidth(1)).toBe(1.5);
  });

  it("centers the graphic in the available width (never left-aligned)", () => {
    const banner = /\.ui-page-banner\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(banner).toMatch(/display:\s*flex/);
    expect(banner).toMatch(/justify-content:\s*center/);
  });

  it("fills the available width but stops at the cap (downscale below, bounded upscale above)", () => {
    const sized = /\.ui-page-banner-image\[data-banner-sized="true"\]\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    // `width: 100%` handles both "downscale to fit" and "fill up to the cap";
    // `max-width` is the framework-supplied `1.5 × natural`, so the graphic can
    // never be enlarged merely to fill the page — and can never overflow either.
    expect(sized).toMatch(/width:\s*100%/);
    expect(sized).toMatch(/max-width:\s*var\(--ui-banner-max-width,\s*100%\)/);
    // Without a readable intrinsic size the banner is DOWNSCALE-ONLY: natural
    // size at most (`width: auto` + `max-width: 100%`) — never enlarged.
    const base = /\.ui-page-banner-image\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(base).toMatch(/width:\s*auto/);
    expect(base).toMatch(/max-width:\s*100%/);
  });

  it("preserves the aspect ratio and adds NO artificial height", () => {
    // The ONLY height declaration in any banner rule is `auto` — the rendered
    // height always derives from the scaled graphic's own ratio.
    const heights = bannerDeclaration("height");
    expect(heights.length).toBeGreaterThan(0);
    expect(heights.every((value) => value === "auto")).toBe(true);
  });

  it("adds no structural padding/margin/border/radius/shadow around the graphic", () => {
    for (const property of ["padding", "margin", "border", "border-radius", "box-shadow"]) {
      const values = bannerDeclaration(property);
      expect(values.every((value) => /^0(px)?$/.test(value))).toBe(true);
    }
  });
});

describe("P6-3C/A — the intrinsic banner size is read from the asset (server-side)", () => {
  it("reads the shipped approved banner graphic (PNG, 3546×443 ≈ 8:1)", () => {
    // The approved Foundation banner family replaced the migrated 240×135
    // placeholder; the intrinsic-size contract is proven against the real
    // shipped artwork at its own delivered geometry.
    expect(readImageDimensions("/assets/banner-home.png")).toEqual({ width: 3546, height: 443 });
  });

  it("reads the installed approved SVG assets (explicit width/height on the root element)", () => {
    // The approved canonical assets declare explicit unitless px sizes, so the
    // intrinsic-size contract is proven directly against the real shipped
    // artwork (the previous expectation pinned the PLACEHOLDER's inch-unit +
    // viewBox geometry, which the installed masters replaced).
    expect(readImageDimensions("/assets/favicon.svg")).toEqual({ width: 24, height: 24 });
    expect(readImageDimensions("/assets/logo-header.svg")).toEqual({ width: 647, height: 158 });
  });

  it("returns undefined for a missing/unreadable/absent asset (never guesses a size)", () => {
    expect(readImageDimensions("/assets/not-a-real-asset.jpg")).toBeUndefined();
    expect(readImageDimensions(undefined)).toBeUndefined();
    expect(readImageDimensions("")).toBeUndefined();
  });
});

describe("P6-3C/A — PageBanner rendering", () => {
  it("renders the sized banner with intrinsic dimensions + the cap as a custom property", () => {
    const html = renderToStaticMarkup(
      PageBanner({
        banners: { home: { src: "/assets/banner-home.png", width: 240, height: 135 } },
        regionIds: [],
      }),
    );
    expect(html).toContain('class="ui-page-banner"');
    expect(html).toContain('class="ui-page-banner-image"');
    expect(html).toContain('src="/assets/banner-home.png"');
    // Intrinsic dimensions → the browser reserves the ratio (no layout shift).
    expect(html).toContain('width="240"');
    expect(html).toContain('height="135"');
    expect(html).toContain('data-banner-sized="true"');
    expect(html).toContain("--ui-banner-max-width:360px"); // 1.5 × 240
    // Decorative: the header owns the brand accessible name.
    expect(html).toContain('alt=""');
  });

  it("renders a banner whose intrinsic size is UNKNOWN without any cap (never enlarged)", () => {
    const html = renderToStaticMarkup(
      PageBanner({ banners: { home: { src: "/assets/unknown-format.webp" } }, regionIds: [] }),
    );
    expect(html).toContain('src="/assets/unknown-format.webp"');
    expect(html).not.toContain("data-banner-sized");
    expect(html).not.toContain("--ui-banner-max-width");
  });

  it("renders NOTHING for a page with no configured banner (no container, no reserved gap)", () => {
    expect(renderToStaticMarkup(PageBanner({ banners: {}, regionIds: [] }))).toBe("");
    expect(
      renderToStaticMarkup(PageBanner({ banners: { about: { src: "/assets/about.jpg" } }, regionIds: [] })),
    ).toBe("");
  });
});
describe("P6-3C/B — sidebar NAVIGATION-ITEM icons are exactly 16px on desktop AND tablet", () => {
  const navIconRule = /\.ui-shell-sidebar \.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

  it("uses its OWN token — declared once at 1rem (16px) with NO breakpoint override", () => {
    // OWNER RULING (2026-09): every sidebar page icon renders at EXACTLY 16x16
    // on desktop and tablet, expanded and collapsed. The former desktop-only
    // `2rem` override is deliberately GONE — there is ONE shared sizing
    // contract, not a tablet size and a desktop size.
    expect(globals).toMatch(/--ui-sidebar-nav-icon-size:\s*1rem/);
    expect(globals).not.toMatch(/--ui-sidebar-nav-icon-size:\s*2rem/);
    expect(globals).not.toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-nav-icon-size"),
    );
    expect(navIconRule).toMatch(/width:\s*var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).toMatch(/height:\s*var\(--ui-sidebar-nav-icon-size\)/);
  });

  it("cannot be stretched by the flex row it sits in (the declared box wins)", () => {
    const baseRule = /\.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(baseRule).toMatch(/flex:\s*none/);
    expect(baseRule).toMatch(/object-fit:\s*contain/);
  });

  it("does NOT reuse the control/toggle token (the tokens are genuinely split)", () => {
    expect(navIconRule).toMatch(/var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).not.toMatch(/var\(--ui-sidebar-control-icon-size\)/);
  });

  it("keeps the collapsed rail as its OWN symmetric geometry token (no hard-coded px)", () => {
    const collapsed = /\.ui-sidebar-rail\[data-collapsed="true"\]\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    // Owner ruling (2026-09): the collapsed rail is a SYMMETRIC icon column —
    // the control icon plus equal inline padding on both sides — so ONE width
    // serves desktop and tablet, and the control centres between the rail's
    // outer edges. It is not derived from the control's rendered box by
    // accident, and it is not the retired `icon x 1.2` geometry.
    expect(collapsed).toMatch(/width:\s*var\(--ui-sidebar-rail-collapsed\)/);
    expect(collapsed).toMatch(/padding-inline:\s*var\(--ui-sidebar-rail-collapsed-pad\)/);
    expect(globals).toMatch(
      /--ui-sidebar-rail-collapsed:\s*calc\(\s*var\(--ui-sidebar-control-icon-size\)\s*\+\s*var\(--ui-sidebar-rail-collapsed-pad\)\s*\*\s*2\s*\)/,
    );
    expect(globals).toMatch(/--ui-sidebar-rail-collapsed-pad:\s*0\.375rem/);
    // The retired rail-basis token is no longer DECLARED anywhere (comments may
    // still explain the rename; only declarations matter).
    expect(globals).not.toMatch(/--ui-sidebar-icon-size\s*:/);
  });
});

describe("P6-3C/C — the CTA resolves to ONE authoritative top slot (never inside navigation)", () => {
  it("every viewport (aside / bottom-bar / drawer / overlay) resolves the same top slot", () => {
    const cases: Array<Record<string, unknown>> = [
      {},
      { navigation: { desktop: "top", tablet: "top-compact", mobile: "drawer" } },
      { navigation: { desktop: "minimal", tablet: "top-compact", mobile: "drawer" }, shell: { header: "minimal" } },
      { navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "drawer" } },
      { navigation: { desktop: "sidebar", tablet: "collapsed-sidebar", mobile: "bottom-bar" } },
      { navigation: { desktop: "floating", tablet: "floating", mobile: "overlay" } },
    ];
    for (const ui of cases) {
      const decision = resolveShellPattern(
        resolveUiConfig({
          ...ui,
          cta: { enabled: true, action: "book", label: "Book Now", href: "/book" },
        }),
      );
      expect([decision.desktop.ctaSlot, decision.tablet.ctaSlot, decision.mobile.ctaSlot]).toEqual([
        "top",
        "top",
        "top",
      ]);
      expect(decision.cta.present).toBe(true);
    }
  });

  it("resolves `none` (absent CTA) when the configuration does not enable one", () => {
    const decision = resolveShellPattern(resolveUiConfig({}));
    expect(decision.cta.present).toBe(false);
    expect([decision.desktop.ctaSlot, decision.tablet.ctaSlot, decision.mobile.ctaSlot]).toEqual([
      "none",
      "none",
      "none",
    ]);
  });
});

