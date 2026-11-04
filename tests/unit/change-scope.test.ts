import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  AUTHORED_CONTENT_TREES,
  OWNERS,
  ROUTE_COMMANDS,
  SCOPES,
  classifyChange,
  classifyPath,
  normalisePath,
  rangeFromEvent,
} from "../../scripts/ci/change-scope.mjs";
import { DEPLOYMENT_RESOURCE_PATHS } from "@/config/deployment-root";

/**
 * CHANGE-SCOPED CI ROUTING (FOUNDATION-DEPLOYMENT-ISO-B3B)
 * =======================================================
 *
 * CI no longer answers every change with the same gate: it asks who OWNS the change and runs the
 * contract that ownership requires. `scripts/ci/change-scope.mjs` is the ONE authority that decides,
 * and this suite proves its decisions — the ownership of each repository surface, the routing rule
 * over a whole change, and the property that makes the design safe:
 *
 *     unknown or ambiguous ownership NEVER yields less validation
 *
 * The assertions are about RULES, not inventory: they name representative paths from each ownership
 * surface and invariants that must hold for any input, so adding a page, a test or a deployment file
 * does not require editing this file.
 */
const ROOT = process.cwd();
const CLASSIFIER = path.join(ROOT, "scripts", "ci", "change-scope.mjs");

/** The route one change selects. */
function routeOf(paths: readonly string[]): string {
  return classifyChange(paths).scope;
}

/** The owner of one path. */
function ownerOf(file: string): string {
  return classifyPath(file).owner;
}

/** Run the classifier's own command line, as CI does — the CLI is part of the contract. */
function runClassifier(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLASSIFIER, ...args], { encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return {
      status: failure.status ?? -1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

describe("the classification vocabulary is exactly the owners and the routes", () => {
  it("names five owners and five routes", () => {
    expect(OWNERS).toEqual(["documentation", "content", "deployment", "foundation", "shared"]);
    expect(SCOPES).toEqual(["documentation", "content", "deployment", "foundation", "full"]);
  });

  it("derives its authored trees from the path authority, so a layout change cannot be missed", () => {
    // `src/config/deployment-root.ts` is the ONE place that spells an Installation's authored resource
    // trees (a Spoke's own root, or a legacy implicit root). The classifier repeats no shape blindly:
    // every tree that authority declares must be COVERED by an authored content tree here, so adding or
    // renaming an authored tree in the platform cannot leave a page edit classified as something else.
    for (const tree of Object.values(DEPLOYMENT_RESOURCE_PATHS)) {
      expect(
        AUTHORED_CONTENT_TREES.some((authored) => `${tree}/`.startsWith(authored)),
        `${tree} is authored data the classifier must recognise`,
      ).toBe(true);
    }
  });

  it("declares a contract for every route, and only for those routes", () => {
    expect(Object.keys(ROUTE_COMMANDS).sort()).toEqual([...SCOPES].sort());
    const routes: Record<string, readonly string[]> = ROUTE_COMMANDS;
    for (const scope of SCOPES) {
      expect(routes[scope].length, scope).toBeGreaterThan(0);
    }
  });
});

describe("every repository surface has ONE owner", () => {
  const ownership: ReadonlyArray<readonly [string, string]> = [
    // Documentation: what a human reader consults, and nothing that is built, served or generated.
    ["README.md", "documentation"],
    ["AGENTS.md", "documentation"],
    ["ARCHITECTURE.md", "documentation"],
    ["BRAND_ASSETS.md", "documentation"],
    ["CLAUDE.md", "documentation"],
    ["CUSTOMIZING.md", "documentation"],
    ["DEPLOYMENT.md", "documentation"],
    ["LICENSE", "documentation"],
    ["instruction-manuals/validation.md", "documentation"],
    ["instruction-manuals/adoption.md", "documentation"],
    ["deployment/README.md", "documentation"],
    ["deployment/AGENTS.md", "documentation"],
    ["deployment/content/README.md", "documentation"],
    ["deployment/content/pages/markdown/README.md", "documentation"],
    ["deployment/content/pages/json/README.md", "documentation"],
    ["deployment/content/assets/icon-library/icons/README.md", "documentation"],
    // …and a human-facing README beside EXECUTABLE code, where the broad `scripts/**` and `src/**` rules
    // would otherwise let prose select an executable gate. The PATH is the contract — nothing about the
    // README's wording is inspected — and the rule is claimed BEFORE those directory rules see the path.
    ["scripts/installation/README.md", "documentation"],
    ["scripts/release/README.md", "documentation"],
    ["scripts/ci/README.md", "documentation"],
    ["src/README.md", "documentation"],
    ["src/core/foundation-release/README.md", "documentation"],
    ["src/core/foundation-installation/README.md", "documentation"],
    ["src/adapters/installation/README.md", "documentation"],
    ["src/core/spoke/README.md", "documentation"],
    // …while the executable files BESIDE those READMEs keep their existing, stronger owner:
    ["scripts/release/index.mjs", "shared"],
    ["scripts/installation/platform-typescript.mjs", "shared"],
    ["scripts/ci/change-scope.mjs", "shared"],
    ["src/core/foundation-release/README.mdx", "foundation"],
    ["src/core/page-document.ts", "foundation"],
    ["src/core/foundation-installation/establishment.ts", "foundation"],
    ["src/adapters/installation/README.schema.json", "foundation"],
    // …while nothing else in the deployment's content tree is documentation. ORDINARY AUTHORED DATA is
    // the `content` owner, in every supported layout: an explicit Spoke's own root, and a legacy
    // implicit Installation that names the same trees at its root.
    ["deployment/spokes/foundation/content/pages/markdown/ww/en/about.md", "content"],
    ["deployment/spokes/foundation/content/pages/json/ww/en/home.json", "content"],
    ["deployment/spokes/germany/config/i18n/de.json", "content"],
    ["deployment/spokes/germany/content/assets/placeholders/logo-header.svg", "content"],
    ["deployment/content/pages/markdown/ww/en/about.md", "content"],
    ["deployment/content/pages/markdown/de/de/about.md", "content"],
    ["deployment/content/assets/platform-marks/platform-marks-provenance.md", "content"],
    ["deployment/config/i18n/en.json", "content"],
    // …an author-facing README inside ANY authored tree stays documentation, in every layout:
    ["deployment/spokes/foundation/content/pages/markdown/README.md", "documentation"],
    ["deployment/spokes/germany/content/assets/README.md", "documentation"],
    // …and a deployment-owned document is NOT authored content merely because it is Markdown:
    ["deployment/efs/capsule/e_00000000000000000000000001/foundation/main/pages/about/de-de.md", "deployment"],
    ["deployment/efs/capsule/e_00000000000000000000000002/germany/main/pages/about/de-de.md", "deployment"],
    // The capsule's production state and its own acceptance contract:
    ["deployment/site.config.json", "deployment"],
    ["deployment/spokes.json", "deployment"],
    ["deployment/spokes/foundation/site.config.json", "deployment"],
    ["deployment/foundation-baseline.json", "deployment"],
    ["deployment/tests/unit/asset-install.test.ts", "deployment"],
    ["deployment/tests/integration/page-authoring.test.ts", "deployment"],
    ["deployment/tests/browser/reference-content.scenario.mjs", "deployment"],
    // The generic platform:
    ["src/app/page.tsx", "foundation"],
    ["src/core/site-code.ts", "foundation"],
    ["src/components/site/page-document-content.tsx", "foundation"],
    ["tests/unit/page-sources.test.ts", "foundation"],
    ["tests/architecture/boundaries.test.ts", "foundation"],
    ["tests/integration/some-page.test.ts", "foundation"],
    // Consumed by both owners, or by the orchestration itself:
    ["package.json", "shared"],
    ["pnpm-lock.yaml", "shared"],
    ["pnpm-workspace.yaml", "shared"],
    ["next.config.ts", "shared"],
    ["vitest.config.mts", "shared"],
    ["tsconfig.json", "shared"],
    ["eslint.config.mjs", "shared"],
    ["postcss.config.mjs", "shared"],
    [".gitattributes", "shared"],
    [".gitignore", "shared"],
    [".github/workflows/ci.yml", "shared"],
    ["scripts/ci/change-scope.mjs", "shared"],
    ["scripts/sync-runtime-assets.mjs", "shared"],
    ["public/assets/logo-header.svg", "shared"],
    ["tests/browser/matrix.mjs", "shared"],
    ["tests/browser/scope.mjs", "shared"],
    ["tests/browser/README.md", "shared"],
    ["tests/setup/real-deployment.ts", "shared"],
    ["tests/support/synthetic-deployment.ts", "shared"],
    ["tests/fixtures/synthetic-deployment/content/README.md", "shared"],
    // The one deployment authority the build, the tests, the scripts and the harness all read:
    ["src/config/deployment-build.mjs", "shared"],
    ["src/config/deployment-root.ts", "shared"],
  ];

  it.each(ownership)("classifies %s as %s", (file, owner) => {
    expect(ownerOf(file)).toBe(owner);
  });

  it("claims a code-adjacent README by PATH, and by nothing else", () => {
    // The rule is structural and shallow: exactly `README.md`, exactly beneath `src/` or `scripts/`. A
    // differently-named Markdown file beside it inherits nothing and keeps the owner its tree gives it…
    expect(ownerOf("src/core/spoke/README.mdx")).toBe("foundation");
    expect(ownerOf("scripts/release/README.txt")).toBe("shared");
    expect(ownerOf("scripts/release/readme.md")).toBe("shared");
    // …and a README in a tree NO rule owns is not documentation either: unknown Markdown stays fail-safe,
    // which is the same answer `docs/guide.md` already gets, and it is never a trusted documentation route.
    expect(ownerOf("docs/README.md")).toBe("shared");
    expect(ownerOf("architecture/notes/README.md")).toBe("shared");
    expect(routeOf(["docs/README.md"])).toBe("full");
    // The exemption is claimed by the documentation rule BEFORE `scripts/` (shared) and `src/`
    // (foundation) — which is what makes the README documentation rather than an executable change.
    expect(classifyPath("scripts/release/README.md").reason).toMatch(/executable tree/);
    expect(classifyPath("src/core/spoke/README.md").reason).toMatch(/executable tree/);
  });

  it("never classifies a path merely because it ends in .md", () => {
    // The rule that keeps authored content and generated documents out of the documentation route.
    expect(ownerOf("content/pages/markdown/ww/en/about.md")).not.toBe("documentation");
    expect(ownerOf("deployment/efs/capsule/e_00000000000000000000000001/foundation/main/pages/about/de-de.md")).toBe(
      "deployment",
    );
    expect(
      ownerOf("tests/fixtures/synthetic-deployment/content/pages/markdown/ww/en/about.md"),
    ).not.toBe("documentation");
  });

  it("normalises Windows separators and a leading ./ before it decides", () => {
    expect(normalisePath(".\\src\\core\\site-code.ts")).toBe("src/core/site-code.ts");
    expect(normalisePath("./README.md")).toBe("README.md");
    expect(ownerOf("deployment\\tests\\unit\\asset-install.test.ts")).toBe("deployment");
    expect(ownerOf("./src/core/site-code.ts")).toBe("foundation");
  });

  it("refuses an empty path rather than guessing an owner for it", () => {
    expect(() => classifyPath("")).toThrow(/cannot be empty/);
  });
});

describe("the route follows the ownership of the WHOLE change", () => {
  const routing: ReadonlyArray<readonly [string, readonly string[], string]> = [
    // The cases the change model is defined by.
    ["root documentation only", ["README.md"], "documentation"],
    ["every platform manual at once", ["AGENTS.md", "ARCHITECTURE.md", "DEPLOYMENT.md"], "documentation"],
    ["a distributed manual", ["instruction-manuals/content-management.md"], "documentation"],
    ["an authored page (explicit Spoke)", ["deployment/spokes/foundation/content/pages/markdown/ww/en/about.md"], "content"],
    ["an authored JSON page", ["deployment/spokes/germany/content/pages/json/de/de/home.json"], "content"],
    ["an authored dictionary", ["deployment/spokes/germany/config/i18n/de.json"], "content"],
    ["authored artwork", ["deployment/spokes/foundation/content/assets/placeholders/logo-header.svg"], "content"],
    ["a legacy authored page", ["deployment/content/pages/markdown/ww/en/about.md"], "content"],
    ["a legacy authored dictionary", ["deployment/config/i18n/de.json"], "content"],
    ["a deployment test", ["deployment/tests/unit/r1a-reference-deployment.test.ts"], "deployment"],
    ["the Installation manifest", ["deployment/spokes.json"], "deployment"],
    ["a Spoke configuration", ["deployment/spokes/germany/site.config.json"], "deployment"],
    ["the deployment's browser acceptance", ["deployment/tests/browser/reference-content.scenario.mjs"], "deployment"],
    ["the deployment's baseline", ["deployment/foundation-baseline.json"], "deployment"],
    ["the deployment README alone", ["deployment/README.md"], "documentation"],
    ["several deployment READMEs", ["deployment/README.md", "deployment/content/README.md"], "documentation"],
    ["code-adjacent READMEs alone", ["scripts/installation/README.md", "scripts/release/README.md"], "documentation"],
    ["a Foundation README alone", ["src/core/foundation-release/README.md"], "documentation"],
    ["a Foundation source file", ["src/core/page-route-path.ts"], "foundation"],
    ["a generic test file", ["tests/unit/page-sources.test.ts"], "foundation"],
    ["Foundation source and its test", ["src/core/site-code.ts", "tests/unit/site-code.test.ts"], "foundation"],
    ["the manifest", ["package.json"], "full"],
    ["a workflow file", [".github/workflows/ci.yml"], "full"],
    ["the lockfile", ["pnpm-lock.yaml"], "full"],
    ["the shared browser harness", ["tests/browser/matrix.mjs"], "full"],
    ["a platform script", ["scripts/sync-runtime-assets.mjs"], "full"],
    ["the runtime asset mirror", ["public/assets/icon-home.svg"], "full"],
    ["a synthetic-deployment fixture", ["tests/fixtures/synthetic-deployment/content/pages/markdown/ww/en/about.md"], "full"],
    ["Foundation AND deployment —— mixed", ["src/core/site-code.ts", "deployment/site.config.json"], "full"],
    ["Foundation AND a shared path", ["src/core/site-code.ts", "package.json"], "full"],
    ["deployment AND a shared path", ["deployment/site.config.json", ".github/workflows/ci.yml"], "full"],
    ["an unknown top-level path", ["docs/guide.md"], "full"],
    ["an unknown file beside known ones", ["README.md", ".prettierrc"], "full"],
    ["a retired root content path", ["content/pages/markdown/ww/en/x.md"], "full"],
    ["a retired root config path", ["config/i18n/en.json"], "full"],
    ["a retired root site configuration", ["site.config.json"], "full"],
    // Documentation never narrows anything, and never widens a single-owner change either.
    ["documentation + deployment", ["DEPLOYMENT.md", "deployment/content/README.md"], "documentation"],
    ["documentation + an authored page", ["README.md", "deployment/spokes/foundation/content/pages/markdown/ww/en/about.md"], "content"],
    ["documentation + a legacy authored page", ["README.md", "deployment/content/pages/markdown/ww/en/about.md"], "content"],
    ["documentation + Foundation", ["CUSTOMIZING.md", "src/core/site-code.ts"], "foundation"],
    // A code-adjacent README is documentation ALONE, and escalates with whatever it sits beside:
    // documentation never narrows an executable change, in either executable tree.
    ["a scripts README + the script beside it", ["scripts/release/README.md", "scripts/release/index.mjs"], "full"],
    ["a Foundation README + Foundation source", ["src/core/foundation-release/README.md", "src/core/page-document.ts"], "foundation"],
    ["a scripts README + Foundation source", ["scripts/installation/README.md", "src/core/page-document.ts"], "foundation"],
    ["a code-adjacent README + a workflow", ["src/adapters/installation/README.md", ".github/workflows/ci.yml"], "full"],
    ["a code-adjacent README + the manifest", ["scripts/installation/README.md", "package.json"], "full"],
    ["a Foundation README + an authored page", ["src/core/spoke/README.md", "deployment/spokes/germany/content/pages/json/de/de/home.json"], "content"],
    ["a code-adjacent README + an unknown Markdown path", ["scripts/release/README.md", "docs/plan.md"], "full"],
    // A change that MIXES authored data with anything executable escalates to the stronger scope: the
    // `content` route applies only when every non-documentation changed path is eligible authored data.
    ["authored page + its Spoke configuration", ["deployment/spokes/germany/content/pages/json/de/de/home.json", "deployment/spokes/germany/site.config.json"], "deployment"],
    ["authored page + the Installation manifest", ["deployment/spokes/foundation/content/pages/markdown/ww/en/about.md", "deployment/spokes.json"], "deployment"],
    ["authored page + a deployment test", ["deployment/spokes/foundation/content/pages/markdown/ww/en/about.md", "deployment/tests/unit/r1a-reference-deployment.test.ts"], "deployment"],
    ["authored page + Foundation source", ["deployment/spokes/foundation/content/pages/markdown/ww/en/about.md", "src/core/site-code.ts"], "full"],
    ["authored page + a shared path", ["deployment/spokes/germany/content/assets/placeholders/logo-header.svg", "package.json"], "full"],
    ["authored page + a workflow file", ["deployment/spokes/germany/config/i18n/de.json", ".github/workflows/ci.yml"], "full"],
  ];

  it.each(routing)("%s → %s", (_name, paths, expected) => {
    expect(routeOf(paths)).toBe(expected);
  });

  it("is ORDER INDEPENDENT — ownership is a property of the set of paths", () => {
    const change = ["src/core/site-code.ts", "deployment/site.config.json", "README.md"];
    expect(routeOf(change)).toBe("full");
    expect(routeOf([...change].reverse())).toBe("full");
    expect(routeOf(["README.md", "src/core/site-code.ts"])).toBe("foundation");
    expect(routeOf(["src/core/site-code.ts", "README.md"])).toBe("foundation");
  });

  it("is DUPLICATE TOLERANT — a path listed twice cannot change the route or the diagnosis", () => {
    const once = classifyChange(["README.md", "deployment/site.config.json"]);
    const twice = classifyChange([
      "deployment/site.config.json",
      "README.md",
      "deployment/site.config.json",
    ]);
    expect(twice.scope).toBe(once.scope);
    expect(twice.entries).toHaveLength(2);
    expect(twice.owners).toEqual(once.owners);
  });

  it("widens — never skips — when ownership cannot be established", () => {
    const unrecognised = classifyChange(["docs/guide.md"]);
    expect(unrecognised.scope).toBe("full");
    expect(unrecognised.conservative).toBe(true);
    expect(unrecognised.entries[0].owner).toBe("shared");
    // The report explains BOTH why the route is the complete gate and why this path has no owner.
    expect(unrecognised.reason).toMatch(/could not be classified at all/);
    expect(unrecognised.entries[0].reason).toMatch(/UNRECOGNISED/);

    const empty = classifyChange([]);
    expect(empty.scope).toBe("full");
    expect(empty.conservative).toBe(true);
    expect(empty.reason).toMatch(/no changed paths/);
  });

  it("reports a re-created historical deployment location as a warning on the complete gate", () => {
    const retired = classifyChange(["content/pages/markdown/ww/en/x.md", "config/i18n/en.json"]);
    expect(retired.scope).toBe("full");
    expect(retired.conservative).toBe(true);
    expect(retired.warnings).toHaveLength(2);
    for (const entry of retired.entries) {
      expect(entry.retired).toBe(true);
      expect(entry.owner).toBe("shared");
    }
    // The capsule's own paths are the current spelling, not a retired one — and an authored page inside
    // them is ordinary authored data, which is what the `content` route exists for.
    const current = classifyChange(["deployment/content/pages/markdown/ww/en/x.md"]);
    expect(current.scope).toBe("content");
    expect(current.warnings).toHaveLength(0);
    expect(current.entries[0].retired).toBe(false);
    // A re-created ROOT location is still the retired case, whichever owner the path would otherwise have.
    const retiredConfig = classifyChange(["config/i18n/en.json"]);
    expect(retiredConfig.scope).toBe("full");
    expect(retiredConfig.entries[0].retired).toBe(true);
  });
});

describe("the range a CI event describes", () => {
  it("compares a pull request against the base it will merge into, using the merge base", () => {
    const range = rangeFromEvent({ pull_request: { base: { sha: "base-sha" }, head: { sha: "head-sha" } } });
    expect(range).toMatchObject({ base: "base-sha", head: "head-sha", dot: "..." });
  });

  it("compares a push against the commit it replaced", () => {
    const range = rangeFromEvent({ before: "before-sha", after: "after-sha" });
    expect(range).toMatchObject({ base: "before-sha", head: "after-sha", dot: ".." });
  });

  it("returns nothing for any event whose change cannot be measured", () => {
    // A push that CREATES a branch has no `before` commit…
    expect(rangeFromEvent({ before: "0".repeat(40), after: "after-sha" })).toBeNull();
    // …a push that DELETES one has no `after`…
    expect(rangeFromEvent({ before: "before-sha", after: "0".repeat(40) })).toBeNull();
    // …a pull request without both revisions is incomplete…
    expect(rangeFromEvent({ pull_request: { base: { sha: "base-sha" } } })).toBeNull();
    // …and an event this workflow does not route (a manual dispatch, a schedule) has neither.
    expect(rangeFromEvent({ inputs: {} })).toBeNull();
    expect(rangeFromEvent(undefined)).toBeNull();
  });
});

describe("the classifier's command line explains its decision", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "change-scope-"));

  afterAll(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it("names the scope, the owner of every path and the reason", () => {
    const { status, stdout } = runClassifier([
      "--path",
      "README.md",
      "--path",
      "deployment/site.config.json",
    ]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/change scope: deployment/);
    expect(stdout).toMatch(/documentation\s+README\.md/);
    expect(stdout).toMatch(/deployment\s+deployment\/site\.config\.json/);
    expect(stdout).toMatch(/reason: deployment-owned path\(s\), with documentation alongside them/);
  });

  it("says out loud when it widened, and warns about a retired root location", () => {
    const unrecognised = runClassifier(["--path", "docs/guide.md"]).stdout;
    expect(unrecognised).toMatch(/change scope: full/);
    expect(unrecognised).toMatch(/UNRECOGNISED/);
    expect(unrecognised).toMatch(/conservative: the COMPLETE gate was selected/);

    const retired = runClassifier(["--path", "content/pages/markdown/ww/en/x.md"]).stdout;
    expect(retired).toMatch(/change scope: full/);
    expect(retired).toMatch(/warning: RETIRED ROOT LOCATION/);
  });

  it("prints machine-readable JSON when asked", () => {
    const { stdout } = runClassifier(["--json", "--path", "src/core/site-code.ts"]);
    const parsed = JSON.parse(stdout) as { scope: string; entries: Array<{ path: string; owner: string }> };
    expect(parsed.scope).toBe("foundation");
    expect(parsed.entries).toEqual([
      expect.objectContaining({ path: "src/core/site-code.ts", owner: "foundation" }),
    ]);
  });

  it("reads the range from a workflow event payload", () => {
    const payload = path.join(scratch, "push.json");
    writeFileSync(payload, JSON.stringify({ before: "HEAD", after: "HEAD" }), "utf8");
    const { status, stdout } = runClassifier(["--event-file", payload]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/range: push \(before\.\.after\)/);
    // Two identical revisions are a change of NOTHING, which is exactly when the complete gate is the
    // only safe answer — and the report says so rather than reporting an empty, "small" change.
    expect(stdout).toMatch(/change scope: full/);
    expect(stdout).toMatch(/no changed paths were reported/);
  });

  it("writes the scope and the range where a workflow can read them", () => {
    const output = path.join(scratch, "github-output.txt");
    const { status } = runClassifier(["--base", "HEAD", "--head", "HEAD", "--github-output", output]);
    expect(status).toBe(0);
    const written = readFileSync(output, "utf8");
    expect(written).toMatch(/^scope=full$/m);
    expect(written).toMatch(/^changed-count=0$/m);
    expect(written).toMatch(/^base=HEAD$/m);
    expect(written).toMatch(/^head=HEAD$/m);
  });

  it("reports NO range when it could not measure the change at all", () => {
    // A revision this checkout does not have (a fork pull request's head, say) must still be SAFE: the
    // complete gate is selected, and the workflow is never handed a pair it cannot resolve.
    const payload = path.join(scratch, "unresolvable.json");
    writeFileSync(
      payload,
      JSON.stringify({ before: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef", after: "HEAD" }),
      "utf8",
    );
    const output = path.join(scratch, "fallback-output.txt");
    const { status, stdout } = runClassifier(["--event-file", payload, "--github-output", output]);
    expect(status).toBe(0);
    expect(stdout).toMatch(/change scope: full/);
    expect(stdout).toMatch(/could not be measured/);
    const written = readFileSync(output, "utf8");
    expect(written).toMatch(/^scope=full$/m);
    expect(written).toMatch(/^base=$/m);
    expect(written).toMatch(/^head=$/m);
  });

  it("refuses an option it does not understand, and a value it was not given", () => {
    const unknown = runClassifier(["--scope", "deployment"]);
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toMatch(/unknown option "--scope"/);
    expect(unknown.stderr).toMatch(/change-scope\.mjs \[range \| paths\]/);

    const missing = runClassifier(["--path"]);
    expect(missing.status).toBe(2);
    expect(missing.stderr).toMatch(/needs a value/);
  });
});
