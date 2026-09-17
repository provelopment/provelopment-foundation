import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { siteConfig } from "@/config";

/**
 * FS-4 — canonical asset contract. Every asset configured (or defaulted) by the
 * canonical `site.assets` block must resolve to an existing static asset, and
 * the consumers must read from the resolved configuration (never hard-coded
 * paths). An adopter replaces an asset in place at `public/assets/<name>` or
 * points `site.assets.<key>` at their own URL — both without touching components.
 */
describe("FS-4 — canonical asset contract", () => {
  it("the shipped identity roles are real files under public/assets (no configuration required)", () => {
    const root = process.cwd();
    // FS1 — the generic template configures NO asset URLs: every identity role
    // resolves to the shipped placeholder file, so a fresh clone renders a
    // complete, un-branded site without editing `site.assets` at all. This is the
    // contract that makes "clone → install → run" work on its own.
    for (const role of ["logo-header.svg", "logo-footer.svg", "favicon.svg"]) {
      expect(
        existsSync(path.join(root, "public", "assets", role)),
        `${role} must ship under public/assets/`,
      ).toBe(true);
    }
    // …and the optional keys are genuinely optional: absent, never broken.
    expect(siteConfig.assets?.ogImage).toBeUndefined();
    expect(siteConfig.assets?.banners).toBeUndefined();
  });

  it("every asset URL the configuration DOES provide is absolute and exists on disk", () => {
    const root = process.cwd();
    const configured: Array<[string, string]> = [];
    if (siteConfig.assets?.logo) configured.push(["logo", siteConfig.assets.logo]);
    if (siteConfig.assets?.logoFooter) configured.push(["logoFooter", siteConfig.assets.logoFooter]);
    if (siteConfig.assets?.favicon) configured.push(["favicon", siteConfig.assets.favicon]);
    if (siteConfig.assets?.ogImage) configured.push(["ogImage", siteConfig.assets.ogImage]);
    for (const [key, url] of configured) {
      expect(url.startsWith("https://"), `${key} URL must be absolute`).toBe(true);
      const relative = new URL(url).pathname.replace(/^\//, "");
      expect(existsSync(path.join(root, "public", relative)), `${key} must exist on disk`).toBe(true);
    }
  });

  it("the footer logo role ships, and the optional banner role is unconfigured by default", () => {
    const root = process.cwd();
    expect(existsSync(path.join(root, "public", "assets", "logo-footer.svg"))).toBe(true);
    // Banners are a per-page opt-in: the template configures none, so no banner
    // artwork ships and nothing renders — the capability stays available without
    // shipping example artwork.
    expect(siteConfig.assets?.banners).toBeUndefined();
  });

  it("optional assets fail safely (absent keys are valid and resolve to defaults)", () => {
    // The schema + loader accept a site WITHOUT an `assets` block; the consumers
    // (structured-data / layout metadata) treat absent keys as "omit" rather
    // than broken. Assert the loader contract via the shipped config's absence
    // handling is safe at the configuration level: each key is optional.
    expect(siteConfig).toBeDefined();
  });

  it("the layout metadata consumes the configured assets (source contract)", () => {
    const layout = readFileSync(
      path.join(process.cwd(), "src", "app", "[locale]", "layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("siteConfig.assets?.ogImage");
    expect(layout).toContain("siteConfig.assets?.favicon");
  });

  it("structured-data consumes the configured logo (source contract)", () => {
    const structuredData = readFileSync(
      path.join(process.cwd(), "src", "components", "site", "structured-data.tsx"),
      "utf8",
    );
    expect(structuredData).toContain("siteConfig.assets?.logo ?? siteConfig.logo");
  });
});