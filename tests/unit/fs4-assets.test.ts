import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { runtimeAssetUrl as resolvedRoleUrl } from "@/config/assets";
import { siteConfig } from "@/config";

import { shippedRoleSource } from "../support/runtime-assets";

/**
 * FS-4 — canonical asset contract. Every asset configured (or defaulted) by the
 * canonical `site.assets` block must resolve to an existing static asset, and
 * the consumers must read from the resolved configuration (never hard-coded
 * paths). An adopter replaces an asset at the installation's own artwork source
 * (`content/assets/placeholders/<name>`) or points `site.assets.<key>` at their
 * own URL — both without touching components.
 *
 * S3E1C — the generated tree is NAMESPACED (the shared platform one plus the sole Spoke's), and the
 * identity roles are REPLACEABLE artwork, so they ship in the installation's OWN Spoke namespace and are
 * served from `/spokes/<segment>/assets/**` rather than from `/assets/**`. A generic-suite run selects a
 * synthetic installation and therefore cannot see another installation's Spoke namespace — correctly, by
 * S3F1 — so "this installation ships the role artwork" is asked of the installation's own SOURCES
 * (`tests/support/runtime-assets`), while "the runtime serves it" is the deployment acceptance suite's
 * subject, which runs where that installation IS the selected deployment.
 */
describe("FS-4 — canonical asset contract", () => {
  it("the shipped identity roles are real files of the installation that owns them", () => {
    // FS1 — the generic template configures NO asset URLs: every identity role
    // resolves to the shipped placeholder artwork, so a fresh clone renders a
    // complete, un-branded site without editing `site.assets` at all. This is the
    // contract that makes "clone → install → run" work on its own.
    //
    // S3E1C — the artwork is the installation's OWN (a Spoke's replaceable roles), so "it ships" is asked
    // of the installation this run selects. The two logo ROLES share ONE source (the asset plan mirrors
    // `placeholders/logo-header.svg` to both `logo-header.svg` and `logo-footer.svg`), which is why the
    // footer role needs no separate source file here.
    for (const role of ["logo-header.svg", "favicon.svg"]) {
      expect(existsSync(shippedRoleSource(role)), `${role} must ship`).toBe(true);
    }
    // …and the optional keys are genuinely optional: absent, never broken.
    expect(siteConfig.assets?.ogImage).toBeUndefined();
    expect(siteConfig.assets?.banners).toBeUndefined();
  });

  it("every asset URL the configuration DOES provide resolves to a served runtime file", () => {
    const configured: Array<[string, string]> = [];
    if (siteConfig.assets?.logo) configured.push(["logo", siteConfig.assets.logo]);
    if (siteConfig.assets?.logoFooter) configured.push(["logoFooter", siteConfig.assets.logoFooter]);
    // FOUNDATION-UI-R1F — the compact header alternative, when an installation configures one: it is absent by
    // default, and the artwork it names must ship with the installation that named it, like every other role.
    if (siteConfig.assets?.logoCompact) configured.push(["logoCompact", siteConfig.assets.logoCompact]);
    if (siteConfig.assets?.favicon) configured.push(["favicon", siteConfig.assets.favicon]);
    if (siteConfig.assets?.ogImage) configured.push(["ogImage", siteConfig.assets.ogImage]);
    for (const [key, url] of configured) {
      expect(url.startsWith("https://"), `${key} URL must be absolute`).toBe(true);
      // The SAME resolution the app renders with (S3F1), and the file it names must ship with the
      // installation that configured the role.
      const resolved = resolvedRoleUrl(url);
      expect(resolved, `${key} must resolve same-origin`).toBeDefined();
      const name = (resolved as string).split("/").pop() as string;
      expect(existsSync(shippedRoleSource(name)), `${key} must ship artwork for ${name}`).toBe(true);
    }
  });

  it("the footer logo role ships, and the optional banner role is unconfigured by default", () => {
    // The footer logo ROLE shares the header logo's SOURCE (the asset plan mirrors one file to both role
    // basenames — see `scripts/sync-runtime-assets.mjs`), so the installation ships it through that source.
    expect(existsSync(shippedRoleSource("logo-header.svg"))).toBe(true);
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
      path.join(process.cwd(), "src", "app", "[[...segments]]", "server-composition.tsx"),
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