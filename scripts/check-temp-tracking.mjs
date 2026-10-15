#!/usr/bin/env node
/**
 * THE `.temp` TRACKING GUARD (GIT-TEMP-G1)
 * =======================================
 *
 * THE POLICY, IN ONE SENTENCE. No content under a directory named `.temp`, at any depth, may be
 * tracked by its containing Git repository — anywhere in Provelopment, for ever.
 *
 * WHY A GUARD AND NOT ONLY `.gitignore`. The ignore rule is the FIRST half of the policy and this
 * repository's `.gitignore` now carries the rule in its double-star depth form. It is not sufficient:
 * `git add -f` bypasses every ignore rule by definition, and an ignored directory can still be committed
 * every ignore rule by definition, and an ignored directory can still be committed through an
 * explicit path. Only the INDEX can answer "is this tracked?", so that is the question this guard
 * asks — and it asks it about EVERY path the index records, however the path was added.
 *
 * WHAT IT READS, AND WHAT IT NEVER TOUCHES
 *
 *   · `git ls-files -z` — the Git index, NUL-delimited so every path spelling is read safely;
 *   · the repository `.gitignore`, as TEXT, to confirm a depth-covering rule exists (the second half);
 *   · nothing else. It NEVER enumerates, opens, stats, hashes, deletes or modifies anything inside a
 *     `.temp` directory, and it writes nothing anywhere. It is safe to run against the owner's
 *     material because it never looks at the material — only at the NAMES the index records.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never repairs, unstages, ignores, rewrites or deletes. A
 * violation is REPORTED with a deterministic diagnostic and a non-zero exit code; untracking is an
 * INDEX-ONLY operation and a separate decision for the owner.
 *
 * ONE IMPLEMENTATION OF THE RULE. What counts as a `.temp` directory — complete slash-delimited
 * components, compared case-insensitively, with a backslash treated as an ordinary character — lives
 * in `./temp-tracking-path.mjs`, which this guard and its contract suite both consume, so the CLI and
 * the tests cannot drift.
 *
 * EXIT CODES
 *   0  every tracked path is clean AND a depth-covering `.gitignore` rule exists
 *   1  at least one tracked path — or the missing exclusion rule — violates the policy
 *   2  the guard could not run at all (bad usage, or the Git index could not be read)
 *
 * WHY PLAIN, DEPENDENCY-FREE ESM. CI runs it from the REQUIRED `validate` path, where there is no
 * install and no toolchain: `node scripts/check-temp-tracking.mjs` is the whole mechanism on Linux
 * and on Windows. A git hook is deliberately NOT used — `core.hooksPath` and `.git/hooks` are local
 * configuration that a fresh clone does not inherit, so a hook could never be the enforcement.
 *
 * USAGE
 *   node scripts/check-temp-tracking.mjs                    # this repository's own Git index
 *   node scripts/check-temp-tracking.mjs --paths-file <f>   # a synthetic path list, one per line
 *   node scripts/check-temp-tracking.mjs --stdin            # a synthetic path list on stdin
 *
 * The two synthetic modes exist for the CONTRACT SUITE: the rule is proved against invented paths, so
 * no test has to create, read or touch real `.temp` material. They answer ONE question — do these
 * paths violate the policy? — and deliberately skip the `.gitignore` check, which is a property of a
 * repository rather than of a supplied list.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { gitignoreDepthCoveringRuleIssue, tempTrackingIssues } from "./temp-tracking-path.mjs";

/** A usage mistake: the caller may fix it, and exit code 2 says so. */
class UsageError extends Error {}

/** The command's one-line summary, its two modes and its exit codes. */
export function usage() {
  return [
    "usage: node scripts/check-temp-tracking.mjs [--paths-file <file> | --stdin]",
    "",
    "  (no source)          check every path the repository's Git index records (`git ls-files -z`)",
    "  --paths-file <file>  check a SYNTHETIC path list, one path per line (contract-suite mode)",
    "  --stdin              check a SYNTHETIC path list read from standard input",
    "",
    "exit 0  clean;  exit 1  a tracked `.temp` path or a missing `.gitignore` rule;",
    "exit 2  the guard could not run (bad usage, or the Git index is unreadable).",
  ].join("\n");
}

/**
 * The command line: at most ONE source, plus help. `--stdin` and `--paths-file` are mutually exclusive
 * on purpose — two sources would leave "which list was checked?" ambiguous.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {{ pathsFile: string | undefined, stdin: boolean, help: boolean }} the parsed options
 */
export function parseArguments(argv) {
  /** @type {{ pathsFile: string | undefined, stdin: boolean, help: boolean }} */
  const options = { pathsFile: undefined, stdin: false, help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--paths-file") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError('"--paths-file" needs a value');
      }
      if (options.stdin) throw new UsageError('"--paths-file" and "--stdin" cannot be combined');
      options.pathsFile = value;
      index += 1;
    } else if (argument === "--stdin") {
      if (options.pathsFile !== undefined) {
        throw new UsageError('"--stdin" and "--paths-file" cannot be combined');
      }
      options.stdin = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new UsageError(`unknown option "${argument}"`);
    }
  }

  return options;
}

/** A `git` subcommand's stdout, or a descriptive failure the caller can act on. */
function gitOutput(args, what) {
  try {
    return execFileSync("git", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${what} could not be read (\`git ${args.join(" ")}\` failed): ${reason}`);
  }
}

/**
 * EVERY path the Git index records — the only authority for "is this tracked?".
 *
 * NUL-delimited (`-z`), so a path containing spaces, quotes, Unicode or a newline can never be split
 * wrongly. Nothing is filtered here: the guard reports the paths it was given, exactly as given — a
 * path that a forced add put in the index is indistinguishable from any other index entry, and that is
 * precisely why reading the index is the only answer to the question the policy asks.
 *
 * @returns {string[]} the index paths
 */
function indexPaths() {
  return gitOutput(["ls-files", "-z"], "the Git index")
    .split("\0")
    .filter((entry) => entry !== "");
}

/** The absolute root of the work tree, or `null` when this directory is not inside one. */
function repositoryRoot() {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

/** The root `.gitignore` as TEXT — never a `.temp` path, never modified, empty when absent. */
function readGitignore(root) {
  try {
    return readFileSync(path.join(root, ".gitignore"), "utf8");
  } catch {
    return "";
  }
}

/** A synthetic path list, one path per line — LF or CRLF, blank lines ignored. */
function syntheticPaths(options) {
  const text =
    options.stdin === true
      ? readFileSync(0, "utf8")
      : readFileSync(String(options.pathsFile), "utf8");
  return text.split(/\r?\n/).filter((line) => line !== "");
}

/**
 * THE GUARD. Reads ONE source of paths, applies the ONE component rule, reports deterministically, and
 * answers an exit code.
 *
 * @param {string[]} argv the arguments after the script name
 * @returns {number} the exit code (see the module note)
 */
export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const synthetic = options.stdin || options.pathsFile !== undefined;
  const paths = synthetic ? syntheticPaths(options) : indexPaths();

  const issues = tempTrackingIssues(paths);

  // The exclusion rule is a property of a REPOSITORY, not of a supplied list, so it is checked only in
  // the index mode — a synthetic run answers exactly one question: are these paths `.temp` paths?
  /** @type {string|null} */
  let ruleIssue = null;
  if (!synthetic) {
    const root = repositoryRoot();
    if (root === null) {
      throw new Error(
        "this directory is not inside a Git work tree, so the tracked paths cannot be checked — run " +
          "the guard from a repository, or hand it a synthetic list with --stdin",
      );
    }
    ruleIssue = gitignoreDepthCoveringRuleIssue(readGitignore(root));
  }

  const violations = issues.length + (ruleIssue === null ? 0 : 1);

  console.log("GIT-TEMP-G1 — .temp tracking guard");
  console.log(
    `  source    : ${
      synthetic ? "synthetic path list (contract-suite mode)" : "Git index (git ls-files -z)"
    }`,
  );
  console.log(`  paths     : ${paths.length}`);
  console.log(`  violations: ${violations}`);

  if (violations === 0) {
    console.log("");
    console.log('OK — no tracked path contains a directory named ".temp" (any depth, any case), and the');
    console.log("repository .gitignore excludes the name at every depth.");
    return 0;
  }

  console.log("");
  for (const issue of issues) console.log(`::error::${issue}`);
  if (ruleIssue !== null) console.log(`::error::.gitignore: ${ruleIssue}`);
  console.log("");
  console.log(`FAILED — ${violations} violation${violations === 1 ? "" : "s"} of the .temp policy.`);

  if (issues.length > 0) {
    console.log("An offending path is in the Git INDEX: no ignore rule could have prevented that, which is");
    console.log("exactly why this guard reads the index. Untracking is an INDEX-ONLY operation and a");
    console.log("separate, explicitly authorised decision for the owner.");
  }
  if (ruleIssue !== null) {
    console.log("Add the depth-covering .temp rule to the repository .gitignore: the exclusion is the");
    console.log("policy's first half and this guard is the second; neither replaces the other.");
  }

  return 1;
}

const isMain =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    process.exitCode = main();
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`check-temp-tracking: ${error.message}\n\n${usage()}`);
    } else {
      console.error(`check-temp-tracking: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 2;
  }
}
