#!/usr/bin/env node
/**
 * RUNTIME ASSET MIRROR — the ONE deterministic relationship between the
 * authoritative SOURCE asset tree (`assets/**`) and the runtime delivery
 * directory (`public/assets/**`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Next.js serves static files from `public/` only, so every graphic the running
 * site fetches must exist as a real file under `public/assets/`. The Foundation
 * therefore ships the artwork TWICE by necessity — but never as two independent
 * authorities:
 *
 *   assets/**            →  the SOURCE OF TRUTH (the file a human edits/reviews)
 *   public/assets/**     →  a byte-identical DERIVATIVE (what the browser fetches)
 *
 * This script is the only sanctioned writer of those derivatives. It is
 * idempotent, it reports every create/update, and `--check` fails (exit 1) when
 * the two trees drift — which is what `tests/unit/asset-mirror-parity.test.ts`
 * and the `assets:check` script both assert.
 *
 * OWNERSHIP MODEL (see BRAND_ASSETS.md "Source assets vs runtime assets"):
 *   assets/branding/        deployment/business-specific artwork
 *   assets/icon-library/    reusable, non-business-specific generic icons
 *   assets/placeholders/    blank/generic defaults for a fresh installation
 *   assets/platform-marks/  royalty-free platform/social-service marks
 *
 * USAGE
 *   node scripts/sync-runtime-assets.mjs           # write the runtime mirror
 *   node scripts/sync-runtime-assets.mjs --check   # verify only, exit 1 on drift
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_DIR = "public/assets";

/**
 * Every mirrored source → runtime filename pair. `from` is relative to the
 * repository root; `to` is a filename inside `public/assets/`.
 */
export const MIRRORED = [
  // ── Identity roles: NEUTRAL placeholders are the template's shipped default ─
  // The generic template ships no brand of its own: the identity roles resolve to
  // `assets/placeholders/**`, so a fresh clone renders a neutral, un-branded site
  // that an adopter replaces. Replace these files in place, or point the role at
  // your own absolute URL in `site.assets` (see BRAND_ASSETS.md).
  //
  // The header and footer logo ROLES share ONE source: both runtime basenames must
  // exist because the roles are addressed by basename (`site.assets.logo` /
  // `site.assets.logoFooter`).
  { from: "assets/placeholders/favicon.svg", to: "favicon.svg", note: "favicon role — neutral default" },
  { from: "assets/placeholders/logo-header.svg", to: "logo-header.svg", note: "header logo role — neutral default" },
  { from: "assets/placeholders/logo-header.svg", to: "logo-footer.svg", note: "footer logo role — same source as the header" },

  // ── Placeholders: the BLANK/GENERIC defaults a fresh install renders ─────
  { from: "assets/placeholders/header-graphic.svg", to: "header-graphic.svg", note: "decorative header band — blank default" },
  { from: "assets/placeholders/footer-graphic.svg", to: "footer-graphic.svg", note: "decorative footer layer — blank default" },
  { from: "assets/placeholders/sidebar-open.svg", to: "sidebar-open.svg", note: "sidebar show control icon" },
  { from: "assets/placeholders/sidebar-close.svg", to: "sidebar-close.svg", note: "sidebar hide control icon" },
  { from: "assets/placeholders/sidebar-default-icon-open.svg", to: "sidebar-default-icon-open.svg", note: "nav-item icon fallback (expanded)" },
  { from: "assets/placeholders/sidebar-default-icon-closed.svg", to: "sidebar-default-icon-closed.svg", note: "nav-item icon fallback (collapsed)" },
];

/** Whole directory → directory mirrors (source basename preserved). */
export const MIRRORED_DIRECTORIES = [
  { from: "assets/icon-library/icons", to: RUNTIME_DIR, note: "generic icon library" },
  { from: "assets/platform-marks", to: RUNTIME_DIR, note: "platform/social marks" },
];

/**
 * Runtime files with NO in-repository source. Each entry must be an explicit,
 * justified exception: an undeclared runtime-only file is a manifest error,
 * which is what keeps a second, uncontrolled asset library from appearing under
 * `public/assets/`.
 *
 * EMPTY BY DESIGN (2026-09 closure pass): the ten `banner-*.png` files used to be
 * the only entries here. Persistent branded artwork must have an authoritative
 * source beneath `assets/`, so the banner family now lives in
 * `assets/branding/banners/` and is mirrored deterministically like every other
 * runtime graphic. A genuinely runtime-ONLY (generated, source-less) asset may
 * still be declared here with its reason — but nothing is kept here merely
 * because it already was.
 */
export const RUNTIME_ONLY = [];

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

/** Deliverable artwork extensions — documentation (e.g. `README.md`) is not mirrored. */
const MIRRORED_EXTENSIONS = new Set([".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

/** The full, deterministic plan of mirrored files (sorted, extension-filtered). */
export function buildPlan() {
  const rows = [];
  for (const { from, to, note } of MIRRORED) rows.push({ from, to, note });
  for (const { from, note } of MIRRORED_DIRECTORIES) {
    const names = readdirSync(path.join(ROOT, from), { withFileTypes: true })
      .filter((entry) => entry.isFile() && MIRRORED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort();
    for (const name of names) rows.push({ from: `${from}/${name}`, to: name, note });
  }
  return rows;
}

/** Classify every planned pair: created / updated / current (+ missing sources). */
export function checkMirrors() {
  const created = [];
  const updated = [];
  const current = [];
  const missingSources = [];
  for (const row of buildPlan()) {
    const source = path.join(ROOT, row.from);
    const target = path.join(ROOT, RUNTIME_DIR, row.to);
    if (!existsSync(source)) {
      missingSources.push(row);
      continue;
    }
    const sourceHash = sha256(readFileSync(source));
    if (!existsSync(target)) created.push(row);
    else if (sha256(readFileSync(target)) !== sourceHash) updated.push(row);
    else current.push(row);
  }
  const planned = new Set(buildPlan().map((row) => row.to));
  const allowlisted = (name) => RUNTIME_ONLY.some((entry) => entry.pattern.test(name));
  const unexpected = readdirSync(path.join(ROOT, RUNTIME_DIR), { withFileTypes: true })
    .filter((entry) => entry.isFile() && !planned.has(entry.name) && !allowlisted(entry.name))
    .map((entry) => entry.name)
    .sort();
  return { created, updated, current, missingSources, unexpected };
}

/** Copy every out-of-date source over its runtime derivative (idempotent). */
export function syncMirrors() {
  const report = checkMirrors();
  mkdirSync(path.join(ROOT, RUNTIME_DIR), { recursive: true });
  for (const row of [...report.created, ...report.updated]) {
    const source = path.join(ROOT, row.from);
    const target = path.join(ROOT, RUNTIME_DIR, row.to);
    const expected = sha256(readFileSync(source));
    copyFileSync(source, target);
    if (sha256(readFileSync(target)) !== expected) throw new Error(`mirror write failed: ${row.to}`);
  }
  return report;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const checkOnly = process.argv.includes("--check");
  const report = checkOnly ? checkMirrors() : syncMirrors();
  const noun = (n) => `${n} file${n === 1 ? "" : "s"}`;
  console.log(`runtime asset mirror — ${RUNTIME_DIR} (${noun(buildPlan().length)} declared)`);
  console.log(`  ${checkOnly ? "drifted" : "updated"}: ${noun(report.updated.length)}`);
  console.log(`  absent:   ${noun(report.created.length)}`);
  console.log(`  current:  ${noun(report.current.length)}`);
  for (const row of [...report.updated, ...report.created]) {
    console.log(`    ${checkOnly ? "drift" : "write"}  ${row.from} → ${row.to}`);
  }

  const failures = [];
  if (report.missingSources.length > 0) {
    failures.push(
      `declared source asset(s) are missing:\n${report.missingSources.map((row) => `    ${row.from}`).join("\n")}`,
    );
  }
  if (report.unexpected.length > 0) {
    failures.push(
      `undeclared runtime-only file(s) in ${RUNTIME_DIR}/ — mirror them from a source, or declare them in RUNTIME_ONLY with a reason:\n` +
        report.unexpected.map((name) => `    ${name}`).join("\n"),
    );
  }
  if (checkOnly && (report.created.length > 0 || report.updated.length > 0)) {
    failures.push("runtime assets are not byte-identical to their sources — run `pnpm assets:sync`.");
  }
  if (failures.length > 0) {
    console.error(`\nRUNTIME ASSET MIRROR CHECK FAILED\n${failures.join("\n")}`);
    process.exit(1);
  }
  console.log("\nruntime asset mirror OK — every runtime file is byte-identical to its source.");
}
