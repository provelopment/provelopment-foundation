import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { siteConfig } from "@/config";
import {
  DEFAULT_SIDEBAR_ITEM_ICON_CLOSED,
  DEFAULT_SIDEBAR_ITEM_ICON_OPEN,
  getSiteNavLinks,
  withSidebarNavIcons,
} from "@/components/site/nav-links";
import { NavItem } from "@/components/ui/nav-item";

/**
 * SIDEBAR PAGE-ICON CONTRACT (owner ruling, 2026-09).
 *
 *  1. every sidebar PAGE icon renders at EXACTLY 16x16 — desktop AND tablet,
 *     expanded AND collapsed (one shared sizing contract, no breakpoint split);
 *  2. the icons come from the reusable ICON LIBRARY that was acquired for the
 *     template — the shipped default is a semantically appropriate generic icon,
 *     not a dot/plus placeholder, whenever a matching icon exists;
 *  3. the precedence is explicit: deployment-configured icon → icon library →
 *     blank/generic placeholder fallback;
 *  4. expanded = 16x16 icon + page name; collapsed = 16x16 icon ONLY, with the
 *     page name still discoverable (sr-only accessible name + native tooltip);
 *  5. the MOBILE navigation is untouched — it never uses these icons.
 */

const ROOT = process.cwd();
const runtime = (file: string) => path.join(ROOT, "public", "assets", file);
const source = (...segments: string[]) => path.join(ROOT, "assets", ...segments);
const read = (...segments: string[]) => readFileSync(path.join(ROOT, ...segments), "utf8");
const globals = read("src", "app", "globals.css");

/** The canonical deployment's expected page → icon-library mapping (semantic intent). */
const EXPECTED_MAPPING: ReadonlyArray<{ href: string; label: string; icon: string }> = [
  { href: "/", label: "Home", icon: "icon-home.svg" },
  { href: "/about", label: "About", icon: "icon-about.svg" },
  { href: "/resources", label: "Resources", icon: "icon-resources.svg" },
  { href: "/testimonials", label: "Testimonials", icon: "icon-testimonials.svg" },
  { href: "/portfolio", label: "Portfolio", icon: "icon-portfolio.svg" },
  { href: "/blog", label: "Blog", icon: "icon-blog.svg" },
  { href: "/connect", label: "Connect", icon: "icon-contact.svg" },
  { href: "/offerings", label: "Offerings", icon: "icon-services.svg" },
];

describe("sidebar page icons — the configured source is the icon LIBRARY", () => {
  it("maps every CONFIGURED sidebar page to a generic icon-library asset", () => {
    // FS1 — the generic template configures one nav item; the invariant is that
    // EVERY configured item's icons are real icon-library files (never a
    // brand-specific or inline graphic), so an adopter adding pages inherits the
    // same guarantee.
    for (const item of siteConfig.navigation) {
      for (const icon of [item.iconOpen, item.iconClosed]) {
        if (icon === undefined || icon === "") continue;
        expect(icon, `${item.href} icon must come from the icon library`).toMatch(
          /^icon-[a-z0-9-]+\.svg$/,
        );
        expect(existsSync(runtime(icon)), `${icon} must ship`).toBe(true);
        expect(existsSync(source("icon-library", "icons", icon)), `${icon} source`).toBe(true);
      }
    }
  });

  it("resolves each mapped icon to BOTH the runtime copy and its icon-library source", () => {
    for (const expected of EXPECTED_MAPPING) {
      expect(existsSync(runtime(expected.icon)), `${expected.icon} must ship`).toBe(true);
      expect(existsSync(source("icon-library", "icons", expected.icon)), `${expected.icon} source`).toBe(true);
    }
  });

  it("never falls back to the dot/plus placeholder while a semantic icon exists", () => {
    const used = siteConfig.navigation.flatMap((item) => [item.iconOpen, item.iconClosed]);
    expect(used).not.toContain(DEFAULT_SIDEBAR_ITEM_ICON_OPEN);
    expect(used).not.toContain(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
    for (const icon of used) expect(icon).toMatch(/^icon-[a-z0-9-]+\.svg$/);
  });

  it("keeps the shipped placeholder fallback available for unmapped page types", () => {
    // Precedence step 3: no configured icon and no recognized semantic icon →
    // the blank/generic placeholder pair, still served from the runtime mirror.
    const links = withSidebarNavIcons([{ href: "/custom-page", label: "Custom", key: "nav:0" }]);
    expect(links[0].openIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_OPEN);
    expect(links[0].closedIcon).toBe(DEFAULT_SIDEBAR_ITEM_ICON_CLOSED);
    for (const file of [DEFAULT_SIDEBAR_ITEM_ICON_OPEN, DEFAULT_SIDEBAR_ITEM_ICON_CLOSED]) {
      expect(existsSync(runtime(file)), `${file} runtime`).toBe(true);
      expect(existsSync(source("placeholders", file)), `${file} placeholder source`).toBe(true);
    }
  });

describe("sidebar page icons — 16x16 on desktop AND tablet, in both states", () => {
  const navIconRule = /\.ui-shell-sidebar \.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
  const baseRule = /\.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

  it("declares ONE page-icon size token (1rem = 16px) with no breakpoint override", () => {
    expect(globals).toMatch(/--ui-sidebar-nav-icon-size:\s*1rem/);
    expect(globals).not.toMatch(/--ui-sidebar-nav-icon-size:\s*2rem/);
    expect(globals).not.toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-nav-icon-size"),
    );
  });

  it("binds width and height to that token, with the aspect ratio and box protected", () => {
    expect(navIconRule).toMatch(/width:\s*var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).toMatch(/height:\s*var\(--ui-sidebar-nav-icon-size\)/);
    expect(navIconRule).toMatch(/max-width:\s*none/);
    expect(baseRule).toMatch(/object-fit:\s*contain/);
    // Flexbox can neither stretch nor shrink the icon box.
    expect(baseRule).toMatch(/flex:\s*none/);
    expect(baseRule).toMatch(/flex-shrink:\s*0/);
  });

  it("collapse changes the rail, never the icon size", () => {
    // The collapsed-state rules address WIDTH/padding of the rail and the
    // open/closed swap — none of them resizes `.ui-nav-item-icon`.
    const collapsedBlocks = [...globals.matchAll(/\.ui-sidebar-rail\[data-collapsed="true"\][^{]*\{([^}]*)\}/g)]
      .map((match) => match[1])
      .join(" ");
    expect(collapsedBlocks).not.toMatch(/ui-nav-item-icon[^{]*\{[^}]*width/);
    // The collapsed rail's own symmetric geometry token (owner ruling, 2026-09).
    expect(globals).toMatch(
      /--ui-sidebar-rail-collapsed:\s*calc\(\s*var\(--ui-sidebar-control-icon-size\)\s*\+\s*var\(--ui-sidebar-rail-collapsed-pad\)\s*\*\s*2\s*\)/,
    );
    expect(globals).toMatch(/--ui-sidebar-rail-collapsed-pad:\s*0\.375rem/);
  });
});

describe("sidebar open/close CONTROL — 24x24 on desktop AND tablet, distinct from page icons", () => {
  const toggleIconRule = /\.ui-sidebar-toggle-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
  const toggleRule = /\.ui-shell-sidebar \.ui-sidebar-toggle\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
  const collapsedToggleRule =
    /\.ui-sidebar-rail\[data-collapsed="true"\] \.ui-sidebar-toggle\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";

  it("declares the control size ONCE at 1.5rem (24px) with NO breakpoint override", () => {
    // OWNER RULING (2026-09 closure pass): the show/hide control is 24x24 on
    // desktop and tablet. It is NOT a page icon (16px) and it is NOT the rail's
    // width basis — three separate contracts.
    expect(globals).toMatch(/--ui-sidebar-control-icon-size:\s*1\.5rem/);
    expect(globals).not.toMatch(/--ui-sidebar-control-icon-size:\s*(2rem|4rem)/);
    expect(globals).not.toMatch(
      new RegExp("@media \\(min-width: 1024px\\)[^}]*--ui-sidebar-control-icon-size"),
    );
    expect(toggleIconRule).toMatch(/width:\s*var\(--ui-sidebar-control-icon-size\)/);
    expect(toggleIconRule).toMatch(/height:\s*var\(--ui-sidebar-control-icon-size\)/);
    expect(toggleIconRule).toMatch(/max-width:\s*none/);
  });

  it("exposes the two sizes as INDEPENDENT tokens (16px page icon vs 24px control)", () => {
    expect(globals).toMatch(/--ui-sidebar-nav-icon-size:\s*1rem/);
    expect(globals).toMatch(/--ui-sidebar-control-icon-size:\s*1\.5rem/);
    // Neither rule borrows the other's token.
    expect(toggleIconRule).not.toMatch(/var\(--ui-sidebar-nav-icon-size\)/);
    const navIconRule = /\.ui-shell-sidebar \.ui-nav-item-icon\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(navIconRule).not.toMatch(/var\(--ui-sidebar-control-icon-size\)/);
  });

  it("keeps the EXPANDED control's ~5px inset; the COLLAPSED control is centred", () => {
    // One shared inset value, derived from the Tailwind spacing scale
    // (0.25rem x 1.25 = 5px) — never a per-preset magic number.
    expect(globals).toMatch(/--ui-shell-control-inset:\s*calc\(var\(--spacing\) \* 1\.25\)/);

    // EXPANDED (owner ruling, 2026-09): unchanged — left-aligned with the shared
    // inset, re-anchored against the rail's own inline padding.
    expect(toggleRule).toMatch(/justify-content:\s*flex-start/);
    expect(toggleRule).toMatch(/var\(--ui-shell-control-inset\)/);
    expect(toggleRule).toMatch(/margin-inline-start:\s*calc\(/);
    expect(toggleRule).toMatch(/var\(--ui-sidebar-rail-inline\)/);

    // COLLAPSED (owner ruling, 2026-09): the open control is CENTRED on the rail's
    // axis with no inset, no re-anchoring and no compensating negative margin.
    expect(collapsedToggleRule).toMatch(/justify-content:\s*center/);
    expect(collapsedToggleRule).toMatch(/margin-inline:\s*0/);
    expect(collapsedToggleRule).toMatch(/padding-inline:\s*0/);
    expect(collapsedToggleRule).not.toMatch(/var\(--ui-shell-control-inset\)/);
    expect(collapsedToggleRule).not.toMatch(/margin-inline-start:\s*calc\(/);
    // …and the collapsed page-icon column shares that same axis.
    expect(globals).toMatch(
      /\.ui-sidebar-rail\[data-collapsed="true"\] li > a[\s\S]{0,120}?justify-content:\s*center/,
    );
  });

  it("gives the shell-top CTA the SAME shared inset (one value, all presets)", () => {
    const ctaRule = /\.ui-shell-cta\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(ctaRule).toMatch(/padding-inline-start:\s*var\(--ui-shell-control-inset\)/);
  });
});

describe("sidebar page icons — expanded vs collapsed behaviour", () => {
  const links = withSidebarNavIcons(getSiteNavLinks("en"));
  const rendered = links.map((link) => renderToStaticMarkup(createElement(NavItem, { item: link })));

  it("every sidebar item renders its 16x16 page icon pair plus the page name", () => {
    for (const [index, html] of rendered.entries()) {
      const link = links[index];
      expect(html).toContain(`/assets/${link.openIcon}`);
      expect(html).toContain(`/assets/${link.closedIcon}`);
      expect(html).toContain("ui-nav-item-icon-open");
      expect(html).toContain("ui-nav-item-icon-closed");
      expect(html).toContain("ui-nav-item-label");
      // Decorative icon, authoritative text label.
      expect(html).toContain('alt=""');
      expect(html).toContain('aria-hidden="true"');
    }
  });

  it("keeps the page name discoverable as a native tooltip on each icon-bearing item", () => {
    for (const [index, html] of rendered.entries()) {
      expect(html).toContain(`title="${links[index].label}"`);
      // The name is in the DOM exactly ONCE — no second visible text label.
      expect((html.match(/ui-nav-item-label/g) ?? []).length).toBe(1);
    }
  });

  it("collapsed labels stay sr-only (accessible name retained), never display:none", () => {
    expect(globals).toMatch(/\.ui-sidebar-rail\[data-collapsed="true"\]\s*li\.ui-nav-item--has-icon\s*\.ui-nav-item-label/);
    expect(globals).not.toMatch(/\.ui-nav-item-label[^{]*\{[^}]*display:\s*none/);
    // The sr-only technique, applied to the collapsed label block.
    const collapsedLabelBlock =
      /\.ui-sidebar-rail\[data-collapsed="true"\]\s*li\.ui-nav-item--has-icon\s*\.ui-nav-item-label[^{]*\{([^}]*)\}/.exec(
        globals,
      )?.[1] ?? "";
    expect(collapsedLabelBlock).toMatch(/clip-path:\s*inset\(50%\)/);
    expect(collapsedLabelBlock).toMatch(/position:\s*absolute/);
  });

  it("mobile navigation behaviour is unchanged (no page icons, control sizing untouched)", () => {
    const mobileNav = read("src", "components", "shell", "shell-mobile-nav.tsx");
    expect(mobileNav).toContain('className="ui-mobile-nav-icon h-8 w-8 shrink-0"');
    expect(mobileNav).toContain("DEFAULT_SIDEBAR_OPEN_ICON");
    expect(mobileNav).toContain("DEFAULT_SIDEBAR_CLOSE_ICON");
    // The 16px page-icon token is scoped to the sidebar surface only.
    expect(globals).not.toMatch(/\.ui-mobile-nav-icon[^{]*\{[^}]*--ui-sidebar-nav-icon-size/);
  });
});


  it("does not leak sidebar icons into the header, bottom bar or mobile navigation", () => {
    // The configured items carry NO legacy single `icon` leaf, so the surfaces
    // that use `getSiteNavLinks` directly (header top-nav, bottom bar, mobile)
    // stay icon-free: `withSidebarNavIcons` is applied ONLY to the aside slot.
    for (const item of siteConfig.navigation) expect(item.icon).toBeUndefined();
    const layout = read("src", "app", "[locale]", "layout.tsx");
    expect(layout).toContain("links={withSidebarNavIcons(navLinks)}");
    expect((layout.match(/withSidebarNavIcons\(/g) ?? []).length).toBe(1);
    // Mobile navigation renders its own control icons and never the page pair.
    const mobileNav = read("src", "components", "shell", "shell-mobile-nav.tsx");
    expect(mobileNav).not.toMatch(/openIcon|closedIcon/);
    const bottomNav = read("src", "components", "ui", "bottom-navigation.tsx");
    expect(bottomNav).not.toMatch(/openIcon|closedIcon|ui-nav-item-icon/);
  });
});
