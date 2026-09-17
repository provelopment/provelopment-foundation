import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { MIRRORED, MIRRORED_DIRECTORIES, RUNTIME_ONLY, buildPlan, checkMirrors } from "../../scripts/sync-runtime-assets.mjs";

/**
 * ASSET LIBRARY TAXONOMY + RUNTIME MIRROR (owner-directed, 2026-09).
 *
 * The Foundation has THREE source asset categories with distinct ownership, and
 * ONE deterministic relationship to the runtime delivery directory:
 *
 *   assets/icon-library/    reusable, NON-business-specific generic icons — ALL
 *                           retained, used or not (the template's icon store)
 *   assets/placeholders/    blank/generic defaults for a fresh installation —
 *                           these ALSO serve as the template's neutral identity
 *                           (favicon / logo roles), because a generic template
 *                           ships no deployment-specific brand artwork (FS1)
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

describe("asset taxonomy — the three source categories exist and stay distinct", () => {
  it("carries one directory per ownership category", () => {
    const subdirectories = (category: string) =>
      readdirSync(dir(category), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();
    // Each category is populated either with role files or with its own
    // sub-structure (the icon library groups icons/licensing).
    expect(subdirectories("icon-library")).toEqual(["icons", "licensing"]);
    expect(names("placeholders").length).toBeGreaterThan(0);
    expect(marks()).toHaveLength(7);
    // FS1 — the template ships NO deployment-specific brand artwork at all: the
    // identity roles resolve to the neutral placeholders above.
    expect(existsSync(dir("branding")), "assets/branding must not ship").toBe(false);
  });

  it("ships NO deployment-specific brand artwork — the identity roles use the neutral placeholders", () => {
    // FS1 — de-bloating removed the reference site's brand pack (marks, logos,
    // page graphics, banners) from the public template. What remains is the
    // generic asset SYSTEM: role files a clone replaces.
    const placeholder = readSource("placeholders", "logo-header.svg");
    expect(placeholder).toContain("<svg");
    // The identity files a fresh clone renders ARE the placeholder sources…
    expect(readRuntime("logo-header.svg")).toBe(placeholder);
    expect(readRuntime("logo-footer.svg")).toBe(placeholder);
    expect(readRuntime("favicon.svg")).toBe(readSource("placeholders", "favicon.svg"));
    // …and no Foundation brand hex or wordmark survives in the runtime identity.
    for (const role of ["logo-header.svg", "logo-footer.svg", "favicon.svg"]) {
      expect(readRuntime(role), `${role} must not carry Foundation branding`).not.toMatch(
        /4F7CAC|3F6791|Provelopment/i,
      );
    }
  });

  it("keeps graphic directories free of documentation (docs live with their category)", () => {
    // Owner-directed (2026-09 closure pass): a graphic directory holds graphics.
    // The platform-mark registers belong with the marks they document.
    expect(names("platform-marks").every((name) => !name.endsWith(".md") || name.startsWith("platform-marks"))).toBe(true);
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
    expect(MIRRORED.length).toBeGreaterThanOrEqual(9);
    expect(MIRRORED_DIRECTORIES.map((entry) => entry.from)).toEqual([
      "assets/icon-library/icons",
      "assets/platform-marks",
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
    // so the allowlist stays empty.
    expect(RUNTIME_ONLY).toEqual([]);
    const planned = new Map(buildPlan().map((row) => [row.to, row.from]));
    // FS1 — every runtime file the template still serves is mirrored from one.
    for (const role of ["favicon.svg", "logo-header.svg", "logo-footer.svg"]) {
      expect(planned.get(role), `${role} must be mirrored from a source`).toBe(
        `assets/placeholders/${role === "logo-footer.svg" ? "logo-header.svg" : role}`,
      );
    }
  });

  it("derives the header AND footer logo roles from ONE neutral source", () => {
    const role = (to: string) => MIRRORED.find((row) => row.to === to);
    const header = role("logo-header.svg");
    const footer = role("logo-footer.svg");
    expect(header?.from).toBe("assets/placeholders/logo-header.svg");
    expect(footer?.from).toBe(header?.from);
    // Both runtime files really are that source, byte for byte.
    expect(readRuntime("logo-header.svg")).toBe(readRuntime("logo-footer.svg"));
    expect(readRuntime("logo-footer.svg")).toBe(readSource("placeholders", "logo-header.svg"));
    // No deployed brand lockup is mirrored: the template has no brand of its own,
    // and a clone replaces the placeholder (in place, or via `site.assets.*`).
    expect(MIRRORED.some((row) => row.from.startsWith("assets/branding/"))).toBe(false);
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
