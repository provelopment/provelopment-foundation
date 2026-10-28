/**
 * THE BROWSER HARNESS'S WRITE DOMAIN (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 * ===================================================================
 *
 * This harness has TWO owners and therefore two write rules:
 *
 *   generic scenarios        run against a DISPOSABLE COPY of the committed synthetic deployment, so
 *                            their configuration edits, page fixtures and dictionary fixtures are written
 *                            into OS temp state;
 *   deployment scenarios      describe whichever deployment the build SELECTED — shipped configuration,
 *                            read-only. `matrix.mjs` hands such a scenario the shipped config path (to
 *                            READ) and starts its dev server without the override.
 *
 * The rule above used to be a convention. This module makes it mechanical: every MUTATING filesystem call
 * `matrix.mjs` makes goes through one of the wrappers below, and each wrapper refuses a target that is
 * inside the selected deployment (or the capsule directory) — or outside the two domains the harness
 * owns — BEFORE the underlying call runs. A future regression that tries to rewrite
 * `<selected deployment>/site.config.json` therefore fails LOUDLY, with the target named, and writes
 * nothing.
 *
 * READ operations are deliberately untouched: the harness reads the shipped configuration, the committed
 * fixture and the repository's own files through `node:fs` directly.
 *
 * This is deliberately NOT a permission framework: it is one guard around one process's write targets,
 * with the two domains that process legitimately owns. The corresponding architecture test
 * (`tests/architecture/write-ownership-guard.test.ts`) proves both the guard's answers and that the
 * harness routes every mutation through it.
 */
import { cpSync as copySync, rmSync as removeSync } from "node:fs";
import { mkdir as fsMkdir, rm as fsRm, rmdir as fsRmdir, writeFile as fsWriteFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { capsuleDirectory, resolveDeploymentForBuild } from "../../src/config/deployment-build.mjs";

/** The repository this harness belongs to. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The harness's own ignored report directory — an artifact area it owns (`tests/browser/.gitignore`). */
const REPORT_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), ".report");

/**
 * The domains this harness may write into: the OS temporary directory (where the disposable synthetic
 * deployment, the browser profile and the machine-readable report live), this harness's ignored `.report/`,
 * and — M16 — the GENERATED Spoke runtime namespaces (`<repo>/public/spokes/**`).
 *
 * WHY THE GENERATED NAMESPACES ARE A HARNESS DOMAIN. `public/assets/**` and `public/spokes/**` are GENERATED
 * output, not deployment state (`scripts/sync-runtime-assets.mjs` produces them from authored sources, and
 * both are git-ignored). A multi-Spoke proof must materialise the SECOND Spoke's own namespace, because
 * "Alpha's artwork is served on Alpha's host and REFUSED on Beta's" is only observable if Beta's host has a
 * different directory to be refused from. Only `public/spokes/**` is added — never the shared platform
 * namespace — and the scenario removes exactly the segments it created.
 */
/**
 * WHERE A LOCAL RUN PUTS ITS DISPOSABLE STATE (R08 §8)
 * ===================================================
 *
 * The harness writes disposable installations, browser profiles and its report into a TEMPORARY root, and a
 * local run must be able to keep that inside a directory the operator has approved — without the repository
 * ever naming one machine's path.
 *
 * Two supported mechanisms, in order:
 *
 *   1. `FOUNDATION_TEST_SCRATCH_ROOT` — the explicit, generic knob. Nothing else in Foundation reads it, and
 *      unset (the CI case) behaviour is exactly what it was.
 *   2. the platform's own temporary directory (`os.tmpdir()`), which already honours `TMPDIR` / `TEMP` / `TMP`.
 *
 * A scenario that creates its own installation with `mkdtempSync(path.join(os.tmpdir(), …))` therefore
 * follows (2) automatically; this resolver exists so the WRITE GUARD and the report agree with wherever that
 * actually lands.
 */
export function scratchRoot() {
  const configured = process.env.FOUNDATION_TEST_SCRATCH_ROOT?.trim();
  return configured !== undefined && configured !== "" ? path.resolve(configured) : os.tmpdir();
}

export function harnessWriteRoots() {
  return {
    allowed: [scratchRoot(), REPORT_ROOT, path.join(ROOT, "public", "spokes")],
    protected: protectedRoots(),
  };
}

/** True when `target` is `root` itself or beneath it, compared the way each platform compares paths. */
function inside(target, root) {
  const normalise = (value) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  const child = normalise(target);
  const parent = normalise(root);
  return child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);
}

/**
 * The deployment state a browser run must never write: whatever the build SELECTED for this repository
 * (asked of the ONE authority, exactly as the harness asks it), plus the capsule directory itself.
 *
 * Resolution is tolerant: a repository with no deployment has less to protect, and the generic scenarios
 * must keep running there (ISO-H2). It is cached, because the selector reads the filesystem.
 */
let protectedCache;
function protectedRoots() {
  if (protectedCache !== undefined) return protectedCache;
  // The capsule spelling comes from the ONE authority, never from this harness.
  const roots = [capsuleDirectory(ROOT)];
  try {
    roots.push(resolveDeploymentForBuild(process.env, ROOT).root);
  } catch {
    /* no deployment is installed here: the capsule path above is all there is to protect */
  }
  protectedCache = roots;
  return protectedCache;
}

/**
 * Refuses a write target this harness does not own. Throws BEFORE anything is written.
 *
 * @param {string} target the path about to be written, created or removed
 * @param {string} operation the operation, for the diagnostic
 * @returns {string} the resolved target, for the caller to use
 */
export function assertHarnessWritable(target, operation = "write") {
  const resolved = path.resolve(String(target));
  const owner = protectedRoots().find((root) => inside(resolved, root));
  if (owner !== undefined) {
    throw new Error(
      `FOUNDATION-DEPLOYMENT-ISO-B3C2B: the browser harness tried to ${operation} "${resolved}", which ` +
        `is inside deployment state it does not own ("${owner}"). Generic scenarios mutate a disposable ` +
        "COPY of the synthetic deployment and this harness's own scratch; shipped configuration, " +
        "dictionaries, pages and artwork are read-only for every browser run. NOTHING was written.",
    );
  }
  const allowed = harnessWriteRoots().allowed.find((root) => inside(resolved, root));
  if (allowed === undefined) {
    throw new Error(
      `FOUNDATION-DEPLOYMENT-ISO-B3C2B: the browser harness tried to ${operation} "${resolved}", which ` +
        `is outside the two domains it owns (${harnessWriteRoots().allowed.join(", ")}). The one browser ` +
        "harness writes only disposable temp state and its own ignored report directory; nothing in the " +
        "repository is a harness write target. NOTHING was written.",
    );
  }
  return resolved;
}

/** `node:fs/promises`'s `writeFile`, refusing any target the harness does not own. */
export async function writeFile(target, ...rest) {
  return fsWriteFile(assertHarnessWritable(target, "write"), ...rest);
}

/** `node:fs/promises`'s `mkdir`, refusing any target the harness does not own. */
export async function mkdir(target, ...rest) {
  return fsMkdir(assertHarnessWritable(target, "create a directory at"), ...rest);
}

/** `node:fs/promises`'s `rm`, refusing any target the harness does not own. */
export async function rm(target, ...rest) {
  return fsRm(assertHarnessWritable(target, "remove"), ...rest);
}

/** `node:fs/promises`'s `rmdir`, refusing any target the harness does not own. */
export async function rmdir(target, ...rest) {
  return fsRmdir(assertHarnessWritable(target, "remove the directory"), ...rest);
}

/** `node:fs`'s `cpSync` — the SOURCE is read, so only the destination is guarded. */
export function cpSync(source, target, ...rest) {
  return copySync(source, assertHarnessWritable(target, "copy into"), ...rest);
}

/** `node:fs`'s `rmSync`, refusing any target the harness does not own. */
export function rmSync(target, ...rest) {
  return removeSync(assertHarnessWritable(target, "remove"), ...rest);
}
