import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { assertReleasePayloadImportsResolve } from "../../scripts/release/release-construction.mjs";
import {
  CI_SUBJECT_TEST_EXCLUSIONS,
  RELEASE_CONTENT_POLICY_ID,
  RELEASE_CONTENT_RULES,
  REQUIRED_PLATFORM_PATHS,
  classifyReleaseInventory,
  classifyReleasePath,
} from "../../scripts/release/release-content-policy.mjs";

/**
 * THE FOUNDATION RELEASE BOUNDARY (FOUNDATION-R1B)
 * ================================================
 *
 * A release is a PLATFORM-ONLY source set. This suite proves the boundary against the repository's
 * ACTUAL tracked inventory rather than against a snapshot of it: every tracked path must be classified
 * by `scripts/release/release-content-policy.mjs` (a future file nobody classified stops release
 * construction), the reference deployment and this repository's own infrastructure must be excluded,
 * and the structural anchors a consumer needs must be present.
 *
 * The assertions are about SURFACES and RULES, so adding a page, a test or a deployment asset changes
 * nothing here — while adding a new top-level directory fails, which is the point.
 */
const ROOT = process.cwd();
const CLI = path.join(ROOT, "scripts", "release", "index.mjs");

/** Every tracked path — asked of the index, so this suite also runs in a MATERIALISED release, which has `git init && git add -A` but no commit to name. */
function trackedPaths(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter((entry) => entry.length > 0);
}

/** Run the release CLI exactly as an operator or CI would. */
function runCli(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("the release content policy classifies the repository's real inventory", () => {
  it("leaves NO tracked path unclassified — a new surface cannot slip into or out of a release", () => {
    expect(classifyReleaseInventory(trackedPaths()).unclassified).toEqual([]);
  });

  it("keeps the reference deployment and this repository's CI OUT of a release, wherever they exist", () => {
    const tracked = trackedPaths();
    const excluded = tracked.filter((file) => classifyReleasePath(file).inclusion === "excluded");

    // The invariant, always: nothing excluded may also be platform content by a second rule.
    for (const file of excluded) {
      expect(classifyReleasePath(file).inclusion, file).toBe("excluded");
    }

    // The concrete surfaces, WHERE THEY EXIST: a materialised release has no capsule and no CI, and
    // that absence is the release working, not a reason to stop checking.
    for (const surface of [
      ".github/workflows/ci.yml",
      "scripts/ci/change-scope.mjs",
      "deployment/foundation-baseline.json",
    ]) {
      if (tracked.includes(surface)) expect(excluded, surface).toContain(surface);
    }
    const capsule = tracked.filter((file) => file.startsWith("deployment/"));
    // The CAPSULE's own paths must all be excluded — the property, not a count. An earlier form of this
    // assertion required more than a hundred capsule paths, which described THIS repository's reference
    // capsule rather than the boundary: a Foundation installation established from a smaller authored
    // capsule classifies correctly and failed it (FOUNDATION-B4B's establishment proof found it), and a
    // release constructed elsewhere has no capsule at all.
    for (const file of capsule) expect(classifyReleasePath(file).inclusion, file).toBe("excluded");
  });

  it("keeps the platform surfaces a consumer needs IN a release", () => {
    const platform = new Set(
      trackedPaths()
        .filter((file) => classifyReleasePath(file).inclusion === "platform")
        .map((file) => file),
    );

    for (const anchor of REQUIRED_PLATFORM_PATHS) {
      expect(platform.has(anchor.path), `${anchor.path} — ${anchor.reason}`).toBe(true);
    }

    // The tooling that constructs and verifies a release travels WITH the release, so a consumer can
    // verify what it received by the same mechanism.
    expect(platform.has("scripts/release/index.mjs")).toBe(true);
    expect(platform.has("tests/fixtures/synthetic-deployment/site.config.json")).toBe(true);
    expect(platform.has("instruction-manuals/README.md")).toBe(true);
    expect(platform.has("LICENSE")).toBe(true);
  });

  it("classifies each rule by ownership, never by filename inventory", () => {
    expect(classifyReleasePath("src/components/site/whatever.tsx").ruleId).toBe("platform-application");
    expect(classifyReleasePath("tests/unit/whatever.test.ts").ruleId).toBe("platform-tests");
    expect(classifyReleasePath("deployment/content/pages/markdown/ww/en/new-page.md").ruleId).toBe(
      "exclude-reference-deployment",
    );
    // Precedence: the CI router is excluded even though `scripts/` is platform.
    expect(classifyReleasePath("scripts/ci/new-tool.mjs").inclusion).toBe("excluded");
    expect(classifyReleasePath("scripts/release/new-module.mjs").inclusion).toBe("platform");
    // A SECOND deployment-shaped directory nobody classified is not silently excluded.
    expect(classifyReleasePath("deployments/other/site.config.json").inclusion).toBeNull();
  });

  it("declares a reason and a unique id for every rule", () => {
    const ids = RELEASE_CONTENT_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of RELEASE_CONTENT_RULES) {
      expect(rule.reason.length, rule.id).toBeGreaterThan(10);
      expect(["platform", "excluded"]).toContain(rule.inclusion);
    }
    expect(RELEASE_CONTENT_POLICY_ID).toBe("foundation-source-v1");
  });
});

describe("the released generic suite never imports an excluded module", () => {
  /** The policy's platform/excluded split for the repository's real tracked inventory. */
  const split = classifyReleaseInventory(trackedPaths());

  it("keeps every released file's imports inside the release — the tool's own construction-time rule", () => {
    // ONE authority: the check below is exactly what release construction runs, so a defect of this
    // class cannot reach a release. It is not hypothetical — `tests/unit/change-scope.test.ts` and
    // `tests/architecture/ci-routing-contract.test.ts` both protect the excluded CI router, and the
    // payload's own `tsc` failed in a clean room before they were classified with their subject.
    expect(
      assertReleasePayloadImportsResolve({
        platformPaths: split.platform,
        excludedPaths: split.excluded,
        readText: (file) => readFileSync(path.join(ROOT, ...file.split("/")), "utf8"),
      }),
    ).toBeGreaterThan(100);
  });

  it("keeps the repository-infrastructure tests with their subject", () => {
    expect(classifyReleasePath("scripts/ci/change-scope.mjs").inclusion).toBe("excluded");
    expect(classifyReleasePath("tests/unit/change-scope.test.ts").inclusion).toBe("excluded");
    expect(classifyReleasePath("tests/architecture/ci-routing-contract.test.ts").inclusion).toBe("excluded");
    // The writer inventory names the excluded router and the capsule's own test tree, so a release
    // cannot make it match (a clean room proved it) — it stays with the repository it describes.
    expect(classifyReleasePath("tests/architecture/write-ownership-guard.test.ts").inclusion).toBe("excluded");
    // FOUNDATION-R8-REL-01: a test of THIS repository's workflow has an excluded subject, so it may not
    // travel either — shipping it produced four avoidable clean-room failures in the published release.
    expect(classifyReleasePath("tests/unit/temp-tracking-guard.test.ts").inclusion).toBe("excluded");
  });

  describe("the CI-subject criterion holds in both directions (FOUNDATION-R8-REL-01)", () => {
    /**
     * A path list can be right today and wrong tomorrow; a CRITERION cannot. The declaration in the
     * policy names every generic test whose subject is this repository's automation, and these
     * assertions prove the relationship rather than the inventory:
     *
     *   1. the premise still holds      — each declared subject is excluded from a release;
     *   2. the policy implements it     — each declared test is excluded;
     *   3. the declaration is truthful  — in a SOURCE repository, each described file exists and names
     *                                     its subject;
     *   4. nothing new escapes          — every test that RESOLVES a `.github/` path is declared.
     *
     * Assertion 3 is scoped to a source repository on purpose: a materialised release has no `.github`
     * at all and legitimately does not contain the tests that assert it, so requiring their presence
     * there would make the release's own suite red — the very defect this criterion exists to fix. Inside
     * a release the same property is proved from the other side: NONE of them may be present.
     */
    const read = (file: string): string => readFileSync(path.join(ROOT, ...file.split("/")), "utf8");
    const has = (file: string): boolean => existsSync(path.join(ROOT, ...file.split("/")));
    /** A checkout of the repository that owns the automation — not a materialised release. */
    const CI_SURFACE_DIRECTORY = ".github";
    const inSourceRepository = existsSync(path.join(ROOT, CI_SURFACE_DIRECTORY));
    /** Generic test sources, asked of the index, so this also runs inside a release. */
    const testFiles = trackedPaths().filter(
      (file) => file.startsWith("tests/") && /\.(ts|mts|tsx)$/.test(file),
    );
    /** THE CRITERION: a test that RESOLVES a filesystem path beneath this repository's CI surface. */
    const resolvesCi = /path\.join\(\s*ROOT\s*,\s*"\.github"/;
    const ciResolvingTests = testFiles.filter((file) => resolvesCi.test(read(file)));
    const declaredCiTests = CI_SUBJECT_TEST_EXCLUSIONS.filter((entry) =>
      entry.subject.startsWith(".github/"),
    ).map((entry) => entry.test);

    it("classifies every declared subject as excluded, and every declared test with its subject", () => {
      expect(CI_SUBJECT_TEST_EXCLUSIONS.length).toBeGreaterThan(0);
      for (const entry of CI_SUBJECT_TEST_EXCLUSIONS) {
        expect(classifyReleasePath(entry.test).inclusion, entry.test).toBe("excluded");
        expect(classifyReleasePath(entry.test).ruleId, entry.test).toBe(entry.ruleId);
        // `.github/**` and `scripts/ci/**` are both outside a release; the declaration may name either.
        expect(classifyReleasePath(entry.subject).inclusion, entry.subject).toBe("excluded");
      }
    });

    it("declares only tests that exist and actually name their subject — in the repository that owns them", () => {
      if (!inSourceRepository) {
        // A release: the declarations must NOT be present, which is the property being protected.
        for (const entry of CI_SUBJECT_TEST_EXCLUSIONS) {
          expect(has(entry.test), `${entry.test} must not travel in a release`).toBe(false);
        }
        return;
      }
      for (const entry of CI_SUBJECT_TEST_EXCLUSIONS) {
        expect(trackedPaths(), entry.test).toContain(entry.test);
        // The declaration must be TRUE: a test that no longer asserts its subject is a stale claim.
        expect(read(entry.test), entry.test).toContain(entry.subject);
      }
    });

    it("leaves no generic test that RESOLVES this repository's CI surface undeclared", () => {
      const offenders = ciResolvingTests.filter((file) => !declaredCiTests.includes(file));
      expect(
        offenders,
        "a generic test resolves a `.github/` path and is still released; declare it in CI_SUBJECT_TEST_EXCLUSIONS " +
          "and exclude it, or the next clean room finds it:",
      ).toEqual([]);
      // …and the scan is not vacuous: in a source repository it finds exactly the declared ones, and in a
      // release it finds none at all.
      expect(ciResolvingTests.slice().sort()).toEqual(inSourceRepository ? declaredCiTests.slice().sort() : []);
    });
  });
});

describe("the release CLI answers as an operator or CI would", () => {
  /** `classify`/`build` are SOURCE-repository commands: they name a commit. A materialised release has no commit to name, so those two assertions are for a source checkout. */
  const hasCommit = (() => {
    try {
      execFileSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasCommit)("reports every tracked path as classified for the accepted revision", () => {
    const result = runCli(["classify"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("release content policy OK");
    expect(result.stdout).toContain("unclassified: 0");
  });

  it("refuses to build without a named source commit", () => {
    const result = runCli(["build", "--release", "provelopment-foundation-v20990101.0000", "--dest", "unused"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("requires --source");
  });

  it("refuses a source that is not a full commit SHA", () => {
    const result = runCli([
      "build",
      "--release",
      "provelopment-foundation-v20990101.0000",
      "--source",
      "main",
      "--dest",
      "unused",
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("full 40-character commit SHA");
  });

  it("refuses an identity that is not a contract release identity", () => {
    const result = runCli([
      "build",
      "--release",
      "v2026.09.27-foundation-markdown-single-h1",
      "--source",
      "0000000000000000000000000000000000000000",
      "--dest",
      "unused",
    ]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("is not a contract release identity");
  });
});
