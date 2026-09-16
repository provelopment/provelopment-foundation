import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { MIRRORED, MIRRORED_DIRECTORIES, RUNTIME_ONLY, buildPlan, checkMirrors } from "../../scripts/sync-runtime-assets.mjs";

/**
 * ASSET LIBRARY TAXONOMY + RUNTIME MIRROR (owner-directed, 2026-09).
 *
 * The Foundation has FOUR source asset categories with distinct ownership, and
 * ONE deterministic relationship to the runtime delivery directory:
 *
 *   assets/branding/        deployment/business-specific artwork (Provelopment
 *                           Foundation marks, logos, page graphics)
 *   assets/icon-library/    reusable, NON-business-specific generic icons — ALL
 *                           retained, used or not (the template's icon store)
 *   assets/placeholders/    blank/generic defaults for a fresh installation
 *   assets/platform-marks/  royalty-free platform/social-service marks
 *   public/assets/**        BYTE-IDENTICAL derivative of the above; never a
 *                           second, independently maintained authority
 *
 * This suite is the enforcement point for that model: it fails if the two trees
 * drift, if an undeclared asset library appears under `public/assets/`, if the
 * generic icons are pruned, or if a category boundary is crossed.
 */

const ROOT = process.cwd();
const dir = (...segments: string[]) => path.join(ROOT, "assets", ...segments);
const names = (...segments: string[]) =>
  readdirSync(dir(...segments), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
const readSource = (...segments: string[]) => readFileSync(dir(...segments), "utf8");
const readRuntime = (file: string) => readFileSync(path.join(ROOT, "public", "assets", file), "utf8");
/** The platform-MARK graphic files (the category also carries its registers). */
const marks = () =>
  names("platform-marks").filter((name) => /\.(svg|png|jpe?g|webp|gif|avif)$/i.test(name));

describe("asset taxonomy — the four source categories exist and stay distinct", () => {
  it("carries one directory per ownership category", () => {
    const subdirectories = (category: string) =>
      readdirSync(dir(category), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    // Each category is populated either with role files or with its own
    // sub-structure (branding groups banners/identity/logos/page-graphics).
    expect(subdirectories("branding")).toEqual(["banners", "identity", "logos", "page-graphics"]);
    expect(subdirectories("icon-library")).toEqual(["icons", "licensing"]);
    expect(names("placeholders").length).toBeGreaterThan(0);
    expect(marks()).toHaveLength(7);
  });

  it("keeps the deployment's branding artwork in assets/branding/", () => {
    expect(names("branding", "identity")).toContain("mark.svg");
    expect(names("branding", "identity")).toContain("favicon.svg");
    expect(names("branding", "logos").length).toBeGreaterThanOrEqual(8);
    for (const graphic of ["background-all.svg", "status-graphic.svg", "header-graphic.svg", "footer-graphic.svg"]) {
      expect(names("branding", "page-graphics")).toContain(graphic);
    }
    // Owner-directed (2026-09 closure pass) — the persistent per-page banner
    // family is a SOURCE asset beneath assets/, never a runtime-only exception.
    expect(names("branding", "banners")).toHaveLength(10);
    for (const banner of names("branding", "banners")) {
      expect(banner, `${banner} must be a PNG banner role`).toMatch(/^banner-[a-z]+\.png$/);
    }
    // Business branding never holds generic library icons or blank placeholders.
    const branding = [...names("branding"), ...names("branding", "identity"), ...names("branding", "logos")];
    expect(branding.filter((name) => /^icon-/.test(name))).toEqual([]);
    expect(branding.filter((name) => /placeholder/i.test(name))).toEqual([]);
  });

  it("keeps graphic directories free of documentation (docs live with their category)", () => {
    // Owner-directed (2026-09 closure pass): a graphic directory holds graphics.
    // The brand-system spec belongs beside the branding category it documents,
    // and the platform-mark registers belong with the marks they document.
    expect(names("branding", "page-graphics").every((name) => !name.endsWith(".md"))).toBe(true);
    expect(names("branding", "banners").every((name) => !name.endsWith(".md"))).toBe(true);
    // …and the relocated documents are exactly where their readers expect them.
    expect(names("branding")).toContain("branding-schema.md");
    expect(names("platform-marks")).toContain("platform-marks-provenance.md");
    expect(names("platform-marks")).toContain("platform-marks-withheld.md");
  });

  it("keeps ALL generic reusable icons in assets/icon-library/ (used or unused)", () => {
    const icons = names("icon-library", "icons").filter((name) => name.endsWith(".svg"));
    expect(icons.length).toBeGreaterThanOrEqual(80);
    expect(icons.every((name) => /^icon-[a-z0-9-]+\.svg$/.test(name))).toBe(true);
    // Explicit retention of icons the current navigation does NOT use — they are
    // the template's reusable store and must never be pruned for being unused.
    const UNUSED_BY_NAVIGATION = ["icon-rooms.svg", "icon-courses.svg", "icon-donate.svg", "icon-volunteer.svg", "icon-wellness.svg"];
    for (const unused of UNUSED_BY_NAVIGATION) {
      expect(icons, `${unused} must be retained even though no configured page uses it`).toContain(unused);
    }
    // Licensing provenance lives with the library, not in the runtime directory.
    expect(names("icon-library", "licensing").length).toBeGreaterThan(0);
  });

  it("keeps platform/social marks OUT of the generic icon library and vice versa", () => {
    const markFiles = marks();
    for (const mark of markFiles) {
      expect(mark, `${mark} must not use the generic icon namespace`).not.toMatch(/^icon-/);
    }
    const icons = names("icon-library", "icons");
    for (const platform of ["whatsapp", "telegram", "messenger", "facebook", "instagram", "linkedin", "github"]) {
      expect(icons.some((name) => name.includes(platform)), platform).toBe(false);
    }
  });

  it("keeps placeholders blank and unbranded", () => {
    const placeholders = names("placeholders");
    for (const name of placeholders) {
      if (!name.endsWith(".svg")) continue;
      const svg = readSource("placeholders", name);
      expect(svg, `${name} must be valid SVG`).toContain("<svg");
      expect(svg).toContain("</svg>");
      // No deployment branding colours and no opaque full-canvas background.
      expect(svg, `${name} must carry no brand colour`).not.toMatch(/#4F7CAC/i);
      expect(svg, `${name} must stay transparent`).not.toMatch(/<rect[^>]*width="100%"[^>]*fill="#[0-9a-fA-F]{6}"/i);
    }
    // The decorative header/footer defaults are genuinely EMPTY graphics.
    for (const blank of ["header-graphic.svg", "footer-graphic.svg"]) {
      const svg = readSource("placeholders", blank);
      expect(svg, `${blank} must draw nothing`).not.toMatch(/<(path|rect|circle|g|image)\b/);
      expect(svg).toMatch(/viewBox="[^"]+"/);
      expect(statSync(dir("placeholders", blank)).size).toBeLessThan(1024);
    }
  });
});

describe("runtime mirror — one deterministic source → derivative relationship", () => {
  it("declares a source for every runtime role the template serves", () => {
    expect(MIRRORED.length).toBeGreaterThanOrEqual(10);
    expect(MIRRORED_DIRECTORIES.map((entry) => entry.from)).toEqual([
      "assets/icon-library/icons",
      "assets/platform-marks",
      "assets/branding/banners",
    ]);
    // Every explicitly mirrored role file carries a human explanation.
    for (const row of [...MIRRORED, ...MIRRORED_DIRECTORIES]) expect(row.note.length).toBeGreaterThan(0);
  });

  // The mirror check reads and hashes every runtime asset; a generous timeout
  // keeps the gate deterministic on a slow or cloud-synced working tree.
  it("ships every runtime file byte-identical to its declared source", { timeout: 30_000 }, () => {
    const report = checkMirrors();
    expect(report.missingSources, "declared sources must exist").toEqual([]);
    expect(report.created, "runtime copies must be present").toEqual([]);
    expect(report.updated, "runtime copies must not drift from their sources").toEqual([]);
    expect(report.current.length).toBe(buildPlan().length);
  });

  it("allows no undeclared asset library under public/assets/", { timeout: 30_000 }, () => {
    // Anything without a declared source must be justified in RUNTIME_ONLY —
    // this is what prevents a second, uncontrolled asset tree from appearing.
    const report = checkMirrors();
    expect(report.unexpected).toEqual([]);
    for (const entry of RUNTIME_ONLY) expect(entry.note.length).toBeGreaterThan(0);
  });

  it("carries NO permanent runtime-only exceptions (every persistent asset has a source)", () => {
    // Owner-directed (2026-09 closure pass): the ten `banner-*.png` files used to
    // be the only RUNTIME_ONLY entries. The invariant is that a persistent
    // runtime visual asset always has an authoritative source beneath `assets/`,
    // so the allowlist is empty and the banners are ordinary mirrored files.
    expect(RUNTIME_ONLY).toEqual([]);
    const planned = new Map(buildPlan().map((row) => [row.to, row.from]));
    for (const banner of names("branding", "banners")) {
      expect(planned.get(banner), `${banner} must be mirrored from a source`).toBe(
        `assets/branding/banners/${banner}`,
      );
    }
  });

  it("derives the header AND footer logo roles from ONE authoritative coloured source", () => {
    // Owner-directed (2026-09 closure pass): the footer uses the same coloured
    // lockup as the header; the monochrome lockup stays available as a source
    // asset but is no longer an active default.
    const role = (to: string) => MIRRORED.find((row) => row.to === to);
    const header = role("logo-header.svg");
    const footer = role("logo-footer.svg");
    expect(header?.from).toBe("assets/branding/logos/lockup-horizontal.svg");
    expect(footer?.from).toBe(header?.from);
    // Both runtime files really are that source, byte for byte.
    expect(readRuntime("logo-header.svg")).toBe(readRuntime("logo-footer.svg"));
    expect(readRuntime("logo-footer.svg")).toBe(readSource("branding", "logos", "lockup-horizontal.svg"));
    // The footer no longer resolves to the monochrome artwork…
    expect(MIRRORED.some((row) => row.from === "assets/branding/logos/lockup-mono.svg")).toBe(false);
    // …which remains a retained, optional branding source asset.
    expect(names("branding", "logos")).toContain("lockup-mono.svg");
  });

  it("mirrors the whole icon library, so every generic icon is runtime-available", () => {
    const library = names("icon-library", "icons").filter((name) => name.endsWith(".svg"));
    const planned = new Set(buildPlan().map((row) => row.to));
    for (const icon of library) expect(planned.has(icon), `${icon} must be mirrored`).toBe(true);
  });

  it("documents the source of truth in the shipped placeholder files themselves", () => {
    for (const role of ["header-graphic.svg", "footer-graphic.svg"]) {
      expect(readRuntime(role)).toContain(`assets/placeholders/${role}`);
      expect(readRuntime(role)).toContain("scripts/sync-runtime-assets.mjs");
    }
    // No runtime file claims to be brand authority.
    expect(readRuntime("header-graphic.svg")).toMatch(/NOT BRAND AUTHORITY/);
  });
});
