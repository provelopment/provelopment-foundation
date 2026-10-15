import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEPTH_COVERING_TEMP_RULES,
  gitignoreDepthCoveringRuleIssue,
  gitignoreRules,
  isTempDirectoryComponent,
  pathComponents,
  TEMP_DIRECTORY_NAME,
  tempDirectoryComponents,
  tempTrackedPathIssue,
  tempTrackingIssues,
} from "../../scripts/temp-tracking-path.mjs";

/**
 * THE `.temp` TRACKING CONTRACT (GIT-TEMP-G1)
 * ===========================================
 *
 * THE POLICY. A directory named `.temp`, anywhere in a project hierarchy, is NEVER tracked by its
 * containing Git repository. Two artefacts enforce it, and this suite proves BOTH of them plus the
 * wiring that makes the policy binding in CI:
 *
 *   `scripts/temp-tracking-path.mjs`  the ONE pure rule (complete path components, case-insensitive);
 *   `scripts/check-temp-tracking.mjs` the guard that applies it to the Git INDEX, so a forced
 *                                     `git add -f` — which no `.gitignore` can prevent — is caught;
 *   `.github/workflows/ci.yml`        the required `validate` path runs the guard, so validation
 *                                     cannot succeed while `.temp` material is tracked.
 *
 * EVERY INPUT HERE IS SYNTHETIC. No test creates, reads, stats or removes a real `.temp` directory:
 * the rule is asked about invented path LISTS (through the pure functions and the guard's `--stdin`
 * mode), and the one LIVE assertion asks the guard about this repository's own Git index, which
 * reports NAMES only. The owner's `.temp` material is never opened — which is itself asserted below,
 * because a guard that read the material it protects would be a second risk rather than a control.
 */
const ROOT = process.cwd();
const GUARD = path.join(ROOT, "scripts", "check-temp-tracking.mjs");
const GUARD_SOURCE = readFileSync(GUARD, "utf8");
const WORKFLOW = path.join(ROOT, ".github", "workflows", "ci.yml");

/** The assignment's own example: a `.temp` directory nested four levels down. */
const NESTED_TEMP_PATH = "deployment/spokes/foundation/.temp/recovery.patch";

/** Run the guard against a SYNTHETIC path list and report its exit status and combined output. */
function runGuard(paths: readonly string[]): { status: number; output: string } {
  const input = paths.length === 0 ? "" : `${paths.join("\n")}\n`;

  try {
    const output = execFileSync(process.execPath, [GUARD, "--stdin"], { input, encoding: "utf8" });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? -1,
      output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
    };
  }
}

/** Run the guard with explicit arguments and answer its exit status — usage cases only. */
function runGuardStatus(args: readonly string[]): number {
  try {
    execFileSync(process.execPath, [GUARD, ...args], { encoding: "utf8" });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? -1;
  }
}

/** One job's own lines, from its id to the next top-level job — so a claim about it is checkable. */
function jobBody(jobId: string): string {
  const lines = readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n").split("\n");
  const at = lines.indexOf(`  ${jobId}:`);
  expect(at, `the workflow has no "${jobId}" job`).toBeGreaterThan(-1);
  const body = lines.slice(at + 1);
  const end = body.findIndex((line) => /^ {2}\S/.test(line));
  return (end === -1 ? body : body.slice(0, end)).join("\n");
}

describe("the .temp rule is a COMPONENT rule", () => {
  it("refuses the name at the root and at ANY depth", () => {
    expect(tempTrackedPathIssue(".temp")).not.toBeNull();
    expect(tempTrackedPathIssue(".temp/x")).not.toBeNull();
    expect(tempTrackedPathIssue(NESTED_TEMP_PATH)).not.toBeNull();
    expect(tempTrackedPathIssue("a/b/c/d/e/.temp/deeper/file.txt")).not.toBeNull();
    expect(tempTrackedPathIssue("a/.temp/")).not.toBeNull();
    expect(tempTrackedPathIssue("./a/.temp/x")).not.toBeNull();
  });

  it("compares components case-insensitively — a case-insensitive filesystem cannot tell them apart", () => {
    expect(isTempDirectoryComponent(".TEMP")).toBe(true);
    expect(isTempDirectoryComponent(".TeMp")).toBe(true);
    expect(isTempDirectoryComponent(TEMP_DIRECTORY_NAME)).toBe(true);
    expect(tempTrackedPathIssue("a/.TEMP/x")).not.toBeNull();
  });

  it("does NOT refuse a name that merely CONTAINS `.temp`", () => {
    for (const allowed of [
      ".temp.md",
      "a/b/.temp.md",
      "a/.temp.md/x.ts",
      "x.temp",
      "a/x.temp/y",
      "a/.tempcache/y",
      "a/.temp-notes/y",
      "src/template/index.ts",
      "docs/temperature.md",
    ]) {
      expect(tempTrackedPathIssue(allowed), allowed).toBeNull();
    }
  });

  it("treats a BACKSLASH as an ordinary character, never a separator", () => {
    // A Git index path is always slash-delimited; on a POSIX filesystem `a\.temp\b` is ONE filename.
    expect(tempTrackedPathIssue("a\\.temp\\b")).toBeNull();
    expect(pathComponents("a\\.temp\\b")).toEqual(["a\\.temp\\b"]);
  });

  it("reads COMPLETE components, reporting positions and the spelling found", () => {
    expect(pathComponents("spokes/foundation/content/README.md")).toEqual([
      "spokes",
      "foundation",
      "content",
      "README.md",
    ]);
    expect(tempDirectoryComponents("x/.TEMP/y")).toEqual([{ index: 2, spell: ".TEMP" }]);
    expect(tempDirectoryComponents("a//.temp/b/")).toEqual([{ index: 2, spell: ".temp" }]);
    expect(tempDirectoryComponents("a/b")).toEqual([]);
  });

  it("answers nothing at all for an empty or non-string path", () => {
    expect(tempTrackedPathIssue("")).toBeNull();
    expect(tempTrackingIssues([])).toEqual([]);
    expect(tempTrackingIssues([""])).toEqual([]);
  });

  it("reports every offending path, in the order supplied, deterministically", () => {
    const listed = [NESTED_TEMP_PATH, "src/index.ts", NESTED_TEMP_PATH, ".temp/scratch.txt"];
    const first = tempTrackingIssues(listed);
    const second = tempTrackingIssues(listed);

    expect(first).toHaveLength(3);
    expect(second).toEqual(first);
    expect(first[0]).toContain(NESTED_TEMP_PATH);
    expect(first[2]).toContain(".temp/scratch.txt");
  });
});

describe("the diagnostic names exactly what is wrong", () => {
  it("names the path, the component's position, the spelling found and the rule", () => {
    expect(tempTrackedPathIssue(NESTED_TEMP_PATH)).toBe(
      '"deployment/spokes/foundation/.temp/recovery.patch": component 4 of 5 is ".temp" — a directory ' +
        'named ".temp" is never tracked, at any depth and in any case (owner policy, GIT-TEMP-G1)',
    );
  });
});

describe("the .gitignore half of the policy", () => {
  it("accepts both depth-covering spellings and refuses anything narrower", () => {
    expect(DEPTH_COVERING_TEMP_RULES).toEqual(["**/.temp/", ".temp/"]);
    for (const rule of DEPTH_COVERING_TEMP_RULES) {
      expect(gitignoreDepthCoveringRuleIssue(`${rule}\n`), rule).toBeNull();
    }
    expect(gitignoreDepthCoveringRuleIssue("# see notes\n**/.temp/\n")).toBeNull();
    // A ROOT-ANCHORED rule covers one directory level only — the exact gap this policy closes.
    expect(gitignoreDepthCoveringRuleIssue("/.temp/\n")).toContain("ANCHORED");
    expect(gitignoreDepthCoveringRuleIssue("foo/.temp/\n")).toContain("no rule excluding");
    expect(gitignoreDepthCoveringRuleIssue("")).toContain("no rule excluding");
  });

  it("is not satisfied by a COMMENT or a NEGATION", () => {
    expect(gitignoreDepthCoveringRuleIssue("# **/.temp/\n")).toContain("no rule excluding");
    expect(gitignoreDepthCoveringRuleIssue("!**/.temp/\n")).toContain("no rule excluding");
  });

  it("reads rules regardless of line endings, and strips blanks, comments and negations", () => {
    expect(gitignoreDepthCoveringRuleIssue("node_modules/\r\n**/.temp/\r\n")).toBeNull();
    expect(gitignoreRules("# comment\n\nnode_modules/\n!keep/\n.temp/\n")).toEqual([
      "node_modules/",
      ".temp/",
    ]);
  });
});

describe("the guard CLI, against synthetic path lists", () => {
  it("passes a clean list and reports what it checked", () => {
    const { status, output } = runGuard([
      "src/index.ts",
      "deployment/spokes/foundation/site.config.json",
      "a/.temp.md",
    ]);

    expect(status).toBe(0);
    expect(output).toContain("paths     : 3");
    expect(output).toContain("violations: 0");
    expect(output).toContain("OK — no tracked path");
  });

  it("REJECTS a synthetic forced-add entry, naming the offending path", () => {
    // An entry a forced add put in the index is indistinguishable from any other — which is exactly why
    // the guard reads the INDEX rather than trusting the ignore rules that `-f` bypasses.
    const { status, output } = runGuard(["src/index.ts", NESTED_TEMP_PATH]);

    expect(status).toBe(1);
    expect(output).toContain("::error::");
    expect(output).toContain(NESTED_TEMP_PATH);
    expect(output).toContain("FAILED — 1 violation of the .temp policy.");
  });

  it("rejects case-variant directories, and counts every violation", () => {
    const { status, output } = runGuard([".TEMP/a.txt", "x/.Temp/b.txt"]);

    expect(status).toBe(1);
    expect(output).toContain("FAILED — 2 violations of the .temp policy.");
  });

  it("passes an EMPTY list — an empty index is clean, not an error", () => {
    const { status, output } = runGuard([]);

    expect(status).toBe(0);
    expect(output).toContain("paths     : 0");
  });

  it("refuses bad usage instead of guessing", () => {
    expect(runGuardStatus(["--nope"])).toBe(2);
    expect(runGuardStatus(["--paths-file"])).toBe(2);
    expect(runGuardStatus(["--help"])).toBe(0);
  });
});

describe("the guard is read-only, and never touches .temp material", () => {
  it("invokes only read-only git subcommands", () => {
    // Both spellings the guard uses: the literal handled by `gitOutput`, and the work-tree lookup that
    // needs no wrapper. Nothing else may ever be invoked.
    const invoked = [
      ...GUARD_SOURCE.matchAll(/gitOutput\(\s*\[([^\]]*)\]/g),
      ...GUARD_SOURCE.matchAll(/execFileSync\(\s*"git",\s*\[([^\]]*)\]/g),
    ].map((match) => match[1].replace(/["\s]/g, ""));
    expect(invoked).toEqual(["ls-files,-z", "rev-parse,--show-toplevel"]);

    // No subcommand that could change the index, the work tree or the configuration — ever.
    for (const forbidden of [
      "add",
      "rm",
      "mv",
      "reset",
      "clean",
      "stash",
      "checkout",
      "restore",
      "commit",
      "update-index",
      "config",
    ]) {
      expect(GUARD_SOURCE, forbidden).not.toContain(`["${forbidden}"`);
    }
  });

  it("never enumerates, stats, opens, creates or removes anything", () => {
    for (const forbidden of [
      "readdirSync",
      "readdir",
      "statSync",
      "lstatSync",
      "existsSync",
      "rmSync",
      "rmdirSync",
      "unlinkSync",
      "mkdirSync",
      "openSync",
      "writeFileSync",
      "appendFileSync",
      "createWriteStream",
    ]) {
      expect(GUARD_SOURCE, forbidden).not.toContain(forbidden);
    }
  });

  it("reads exactly three things: the .gitignore text, stdin, and a caller's path list", () => {
    // The guard is safe against the owner's material because it never looks at the material: it looks
    // at the NAMES the index records, at the `.gitignore` as TEXT, and at a list a caller supplied.
    expect((GUARD_SOURCE.match(/readFileSync\(/g) ?? [])).toHaveLength(3);
    expect(GUARD_SOURCE).toContain('".gitignore"');
    expect(GUARD_SOURCE).toContain('readFileSync(0, "utf8")');
    expect(GUARD_SOURCE).toContain("String(options.pathsFile)");
  });
});

describe("this repository's own index", () => {
  it("has NO tracked path carrying a .temp component", () => {
    const listed = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
      .split("\0")
      .filter((entry) => entry !== "");

    expect(listed.length).toBeGreaterThan(0);
    expect(tempTrackingIssues(listed)).toEqual([]);
  });

  it("excludes the name at EVERY depth in its .gitignore", () => {
    expect(
      gitignoreDepthCoveringRuleIssue(readFileSync(path.join(ROOT, ".gitignore"), "utf8")),
    ).toBeNull();
  });

  it("passes its own guard in index mode", () => {
    const output = execFileSync(process.execPath, [GUARD], { cwd: ROOT, encoding: "utf8" });

    expect(output).toContain("Git index (git ls-files -z)");
    expect(output).toContain("violations: 0");
    expect(output).toContain("OK — no tracked path");
  });
});

describe("CI enforcement", () => {
  it("runs the guard from the REQUIRED validate path, so validation cannot pass while .temp is tracked", () => {
    expect(jobBody("validate")).toContain("node scripts/check-temp-tracking.mjs");
  });

  it("checks out the repository for the guard, without persisting credentials", () => {
    const validate = jobBody("validate");
    expect(validate).toContain("actions/checkout@");
    expect(validate).toContain("persist-credentials: false");
  });

  it("softens nothing: no `continue-on-error` may make the guard's failure a success", () => {
    expect(readFileSync(WORKFLOW, "utf8")).not.toContain("continue-on-error");
  });
});


