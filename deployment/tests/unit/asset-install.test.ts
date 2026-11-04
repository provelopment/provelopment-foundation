import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkMirrors } from "../../../scripts/sync-runtime-assets.mjs";
import { runtimeAssetFile } from "../../../tests/support/runtime-assets";
import { foundationSpoke } from "../support/spoke-contexts";

/**
 * THE INSTALLED DEPLOYMENT'S ASSET INSTALL (FOUNDATION-DEPLOYMENT-ISO-H2)
 * ======================================================================
 *
 * Everything here is a fact about the deployment THIS repository currently installs — which artwork and
 * documentation it ships, and whether its generated runtime mirror still matches its sources. Those
 * assertions belong to the deployment's own acceptance suite (ISO-B2A), not to the generic Foundation
 * contracts: the mirror is generated FROM the selected deployment, so it can only be checked where that
 * deployment is the subject.
 *
 * They were MOVED here by ISO-H2 from four generic suites (`tests/unit/sidebar-page-icon-contract`,
 * `brand-asset-swap-contract`, `p12-hg-header-graphic`, and the asset taxonomy/mirror suite) which used
 * to read `<repo>/content/assets/**` through `process.cwd()`. That worked only while the deployment
 * happened to sit at the repository root, and would have broken — or worse, silently checked nothing —
 * the moment the deployment moved into its capsule (ISO-B2B). The generic suites now assert the RULES
 * against whichever deployment the run selected; the INSTALL is asserted here.
 *
 * ISO-H2 also owns `deployment/tests/unit/asset-taxonomy-mirror.test.ts` (the shipped pack and its
 * mirror relationship) and `deployment/tests/unit/country-code-reference.test.ts` (the shipped
 * country-code document versus the platform's authority) for the same reason.
 */
// M18 — this deployment declares TWO Spokes and therefore has NO installation-wide authored root: the
// runtime authority refuses that answer loudly (M16/M17), because "the" root of a two-Spoke Installation
// would be the default-Spoke rule the runtime refuses. This suite describes the pack the FOUNDATION Spoke
// authors (the platform-owned trees and the neutral role artwork), which is the pack the Installation
// ships; the GERMANY Spoke's own pack — and the per-Spoke isolation of the two — is asserted in
// `./m18-germany-spoke.test.ts`.
const deployment = foundationSpoke;
/**
 * A deployed file's generated path: whichever runtime NAMESPACE holds it (S3E1C — the platform tree at
 * `public/assets`, or the Spoke's own at `public/spokes/<segment>/assets`). The platform path is the
 * fallback, so an assertion about a file NO namespace ships still reads as an ordinary missing-file check
 * rather than as a crash.
 */
const runtime = (file: string) =>
  runtimeAssetFile(file) ?? path.join(deployment.publicAssetsDirectory, file);
const source = (...segments: string[]) => path.join(deployment.assetSourceRoot, ...segments);
const contentRoot = deployment.contentRoot;

/** The canonical page → icon-library mapping (semantic intent) the reference site relies on. */
const CANONICAL_PAGE_ICONS = [
  "icon-home.svg",
  "icon-about.svg",
  "icon-resources.svg",
  "icon-testimonials.svg",
  "icon-portfolio.svg",
  "icon-blog.svg",
  "icon-contact.svg",
  "icon-services.svg",
] as const;

describe("this deployment's runtime asset mirror", () => {
  it("is byte-identical to its declared sources — nothing drifted, nothing is missing", () => {
    // The strongest form of the mirror contract: the plan is resolvable, every declared source exists,
    // every runtime file matches it, and no undeclared asset library appeared in the mirror.
    const report = checkMirrors();
    expect(report.missingSources.map((row) => row.from), "declared sources must exist").toEqual([]);
    expect(report.updated.map((row) => row.to), "drifted runtime files").toEqual([]);
    expect(report.created.map((row) => row.to), "absent runtime files").toEqual([]);
    expect(report.unexpected, "undeclared runtime files").toEqual([]);
    expect(report.current.length).toBeGreaterThan(0);
  });

  it("serves every canonical page icon at runtime, from the icon library", () => {
    for (const icon of CANONICAL_PAGE_ICONS) {
      expect(existsSync(runtime(icon)), `${icon} must ship`).toBe(true);
      expect(existsSync(source("icon-library", "icons", icon)), `${icon} source`).toBe(true);
    }
  });

  it("ships the reusable icon library and its licensing directory", () => {
    const library = readdirSync(source("icon-library"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    expect(library).toEqual(["icons", "licensing"]);
  });

  it("documents its own source of truth beside the artwork", () => {
    const readme = readFileSync(source("README.md"), "utf8");
    expect(readme).toContain("public/assets");
    expect(readme).toMatch(/never\s+edited\s+by\s+hand|never edit/i);
  });
});

describe("this deployment's neutral identity and page-graphic defaults", () => {
  it("ships a blank decorative header and footer default that draws nothing", () => {
    for (const role of ["header-graphic.svg", "footer-graphic.svg"]) {
      const shipped = readFileSync(runtime(role), "utf8");
      // The runtime file IS its placeholder source: the mirror is the deployment's own declared default.
      expect(shipped, `${role} must be its placeholder source`).toBe(
        readFileSync(source("placeholders", role), "utf8"),
      );
      expect(shipped, `${role} must draw nothing`).not.toMatch(
        /<(path|rect|circle|ellipse|polygon|line|image|text)\b/i,
      );
      expect(shipped, `${role} must carry no brand colour`).not.toMatch(/#4F7CAC/i);
      expect(shipped, `${role} must declare a viewBox`).toMatch(/viewBox="[^"]+"/);
    }
  });

  it("keeps the sidebar fallback icons available as placeholder sources", () => {
    for (const icon of ["sidebar-default-icon-open.svg", "sidebar-default-icon-closed.svg"]) {
      expect(existsSync(source("placeholders", icon)), `${icon} placeholder source`).toBe(true);
    }
  });

  it("installs NO deployment-specific brand artwork for the shipped roles", () => {
    // The generic template has no brand of its own: the identity roles resolve to the neutral
    // placeholders above, and a clone supplies its own artwork (see BRAND_ASSETS.md).
    expect(existsSync(source("branding"))).toBe(false);
  });
});

describe("this deployment's authored content surface", () => {
  it("holds the two page roots, the artwork, the content map and its reference documents", () => {
    const entries = readdirSync(contentRoot).sort();
    expect(entries).toContain("pages");
    expect(entries).toContain("assets");
    expect(entries).toContain("README.md");
    for (const root of ["pages/markdown", "pages/json"]) {
      expect(readdirSync(path.join(contentRoot, root)), root).toContain("README.md");
    }
    // The generated country-code catalogue is RETIRED: the platform no longer writes it and the deployment
    // no longer commits it, so the content surface holds only authored material and the maps that describe it.
    expect(entries).not.toContain("COUNTRY-CODES.md");
    for (const map of ["README.md", "pages/markdown/README.md", "pages/json/README.md"]) {
      expect(
        readFileSync(path.join(contentRoot, ...map.split("/")), "utf8"),
        `${map} must not link the retired country-code catalogue`,
      ).not.toContain("COUNTRY-CODES.md");
    }
  });

  it("never carries contact webhook secrets in its content or configuration", () => {
    // The generic architecture suite scans the SELECTED deployment for the same tokens; this asserts the
    // INSTALLED one, which is the deployment that actually ships.
    const tokens = [/CONTACT_WEBHOOK/, /webhookUrl/, /webhookToken/];
    const files: string[] = [deployment.siteConfigFile];
    const walk = (directory: string): void => {
      if (!existsSync(directory)) return;
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.[jt]sx?$|\.md$|\.json$/.test(entry.name)) files.push(full);
      }
    };
    walk(contentRoot);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const token of tokens) {
        expect(text, `${path.relative(deployment.root, file)} must not contain ${token}`).not.toMatch(
          token,
        );
      }
    }
  });
});
