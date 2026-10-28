#!/usr/bin/env node
/**
 * PINNED CONNECT SOURCE — ONE provenance record, ONE byte-level verification
 * =========================================================================
 * FOUNDATION-CONNECT-MODULE-INTEGRATION-A9
 *
 * Connect (`provelopment/provelopment-module-connect`) is a **Git-source** Module: it publishes no
 * package, no registry artifact and no archive. Its accepted model is that a consumer integrates a
 * *pinned source revision*, and the reusable source is never modified in place. Foundation therefore
 * carries the released source subtree verbatim under `modules/connect/src`, and records the exact
 * upstream identity beside it in `modules/connect/connect-release.json`.
 *
 * A VENDORED TREE IS ONLY HONEST IF IT CAN BE PROVEN UNCHANGED. This module is that proof. It
 * recomputes the **Git tree object id** of the carried tree exactly as Git itself would, and compares
 * it with the released subtree id recorded in the provenance file. The recomputation is pure Node
 * (`node:crypto` + `node:fs`): no network, no upstream checkout, no `git` binary. That is why CI can
 * enforce it, and why a future maintainer can reproduce it anywhere.
 *
 * WHY THIS IS NOT A FORMALITY — the checkout hazard
 * -------------------------------------------------
 * Connect ships no `.gitattributes`, so a `git clone` on a machine whose `core.autocrlf` is `true`
 * converts every one of these files to CRLF **on checkout**. A vendor step that copies the working
 * tree therefore copies bytes the release never published, and the resulting tree id is wrong even
 * though every file "looks right". `git archive` does not save you either: it honours the same
 * attribute derivation and converts too. The only platform-proof materialisation is from the Git
 * object itself (`git cat-file blob <sha>`), and the only platform-proof storage is committed
 * verbatim (`modules/connect/src/** -text` in `.gitattributes`). This module is what catches a
 * violation of either rule — which is precisely how the hazard was found while integrating Connect.
 *
 * WHAT THE TREE ID PROVES, AND WHAT IT DOES NOT
 * ---------------------------------------------
 * It proves the carried bytes are exactly the released bytes, and that no file was added, removed,
 * renamed or edited in transit. It does **not** prove the release itself was trustworthy — that is
 * the Module's own release authority (`commit=`/`tree=`/`ci=` in the annotated tag), which the
 * provenance record repeats verbatim so the two can be compared. It also says nothing about runtime
 * behaviour: a `mailto:` link transmits nothing and proves no delivery.
 *
 * HOW TO RE-VERIFY AGAINST UPSTREAM (operator, read-only):
 *
 *   git -C <connect-checkout> fetch --tags
 *   git -C <connect-checkout> rev-parse 'refs/tags/<release>^{}'           # the released commit
 *   git -C <connect-checkout> rev-parse 'refs/tags/<release>^{}^{tree}'    # the whole release tree
 *   git -C <connect-checkout> rev-parse '<commit>:src'                     # the subtree verified here
 *
 * A mismatch is a STOP condition: re-materialise from the recorded revision, never edit the carried
 * files to make this check pass.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The directory that carries the pinned source, relative to the repository root. */
export const PINNED_SOURCE_DIRECTORY = "modules/connect/src";

/** The provenance record that names the exact upstream identity. */
export const PROVENANCE_PATH = "modules/connect/connect-release.json";

/** The only file mode the released subtree uses; anything else is reported, never assumed. */
const FILE_MODE = "100644";

/** Hash one Git object's bytes with its Git header — the definition of an object id. */
function objectId(kind, payload) {
  const header = Buffer.from(`${kind} ${payload.length}\u0000`, "utf8");
  return createHash("sha1").update(header).update(payload).digest("hex");
}

/**
 * Git's own tree-entry ordering: names are compared as RAW BYTES, and a directory is compared as if
 * its name carried a trailing `/`. A locale-aware string sort produces a different tree id on some
 * machines, so the comparison is stated here rather than left to the platform.
 */
function compareEntryBytes(left, right) {
  return Buffer.compare(Buffer.from(left.sortKey, "utf8"), Buffer.from(right.sortKey, "utf8"));
}


/**
 * The Git tree object id of one directory, computed recursively.
 *
 * `problems` collects anything that cannot be represented as a clean Git tree — an unexpected file
 * mode, a symbolic link — so a caller reports the whole truth instead of silently normalising it.
 */
function treeObjectId(directory, problems) {
  /** @type {{ sortKey: string, mode: string, name: string, id: string }[]} */
  const entries = [];

  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, dirent.name);
    if (dirent.isSymbolicLink()) {
      problems.push(`${path}: a symbolic link is not part of the released subtree`);
      continue;
    }
    if (dirent.isDirectory()) {
      entries.push({
        sortKey: `${dirent.name}/`,
        mode: "40000",
        name: dirent.name,
        id: treeObjectId(path, problems),
      });
      continue;
    }
    if (!dirent.isFile()) {
      problems.push(`${path}: only regular files are part of the released subtree`);
      continue;
    }
    entries.push({
      sortKey: dirent.name,
      mode: FILE_MODE,
      name: dirent.name,
      id: objectId("blob", readFileSync(path)),
    });
  }

  entries.sort(compareEntryBytes);
  const payload = Buffer.concat(
    entries.flatMap((entry) => [
      Buffer.from(`${entry.mode} ${entry.name}\u0000`, "utf8"),
      Buffer.from(entry.id, "hex"),
    ]),
  );
  return objectId("tree", payload);
}

/** Count the regular files beneath a directory — the count the provenance record states. */
function countFiles(directory) {
  let total = 0;
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    if (dirent.isDirectory()) total += countFiles(join(directory, dirent.name));
    else if (dirent.isFile()) total += 1;
  }
  return total;
}

/**
 * Count the carried files that contain a carriage return.
 *
 * This is not a style opinion. The proof above compares bytes, and a CRLF tree can only equal a
 * released LF tree by coincidence; naming the count makes the failure state legible instead of
 * leaving a bare hash mismatch. `core.autocrlf=true` is the usual cause — on the machine that
 * materialised the tree, or on the machine that checked it out.
 */
function countCarriageReturnFiles(directory) {
  let total = 0;
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, dirent.name);
    if (dirent.isDirectory()) {
      total += countCarriageReturnFiles(path);
      continue;
    }
    if (dirent.isFile() && readFileSync(path).includes(0x0d)) total += 1;
  }
  return total;
}

/** The provenance record, read as data. It is never inferred from whatever happens to be on disk. */
export function readProvenance(root) {
  return JSON.parse(readFileSync(join(root, PROVENANCE_PATH), "utf8"));
}

/**
 * Verify the carried tree against the recorded provenance.
 *
 * Returns the compared ids plus every problem found, so a caller can report the whole truth rather
 * than only the first thing that failed.
 */
export function verifyPinnedSource(root = process.cwd()) {
  const provenance = readProvenance(root);
  const problems = [];
  const directory = join(root, PINNED_SOURCE_DIRECTORY);

  let actual;
  try {
    actual = treeObjectId(directory, problems);
  } catch (error) {
    problems.push(`${PINNED_SOURCE_DIRECTORY}: could not be read (${error.message})`);
    actual = null;
  }

  const expected = provenance?.source?.subtree ?? null;
  if (expected === null) problems.push(`${PROVENANCE_PATH}: source.subtree is missing`);
  if (actual !== null && expected !== null && actual !== expected) {
    problems.push(
      `the carried tree is ${actual} but ${PROVENANCE_PATH} records ${expected} — ` +
        "re-materialise from the recorded revision; never edit the carried source to match",
    );
  }

  const fileCount = actual === null ? 0 : countFiles(directory);
  const recordedCount = provenance?.source?.fileCount ?? null;
  if (recordedCount !== null && fileCount !== recordedCount) {
    problems.push(
      `the carried tree has ${fileCount} files but ${PROVENANCE_PATH} records ${recordedCount}`,
    );
  }

  const carriageReturnFiles = actual === null ? 0 : countCarriageReturnFiles(directory);
  if (carriageReturnFiles > 0) {
    problems.push(
      `${carriageReturnFiles} carried file(s) contain a carriage return — the released tree is LF; ` +
        "check `core.autocrlf` on the machine that materialised or checked out the tree",
    );
  }

  return {
    provenance,
    expected,
    actual,
    fileCount,
    carriageReturnFiles,
    problems,
    ok: problems.length === 0,
  };
}

/** One line per fact, so the CI log and an operator read exactly the same words. */
export function describeVerification(result) {
  const { provenance, expected, actual, fileCount, carriageReturnFiles, problems } = result;
  const lines = [
    `pinned Connect source: ${PINNED_SOURCE_DIRECTORY}`,
    `  release          ${provenance?.release ?? "<missing>"}`,
    `  upstream commit  ${provenance?.source?.commit ?? "<missing>"}`,
    `  release tree     ${provenance?.source?.tree ?? "<missing>"}`,
    `  source subtree   ${expected ?? "<missing>"} (recorded)`,
    `  carried subtree  ${actual ?? "<unreadable>"} (recomputed)`,
    `  files            ${fileCount} (${carriageReturnFiles} with CR)`,
  ];
  for (const problem of problems) lines.push(`  PROBLEM  ${problem}`);
  lines.push(problems.length === 0 ? "PINNED SOURCE OK" : "PINNED SOURCE FAILED");
  return lines.join("\n");
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  const result = verifyPinnedSource(process.cwd());
  console.log(describeVerification(result));
  process.exitCode = result.ok ? 0 : 1;
}

