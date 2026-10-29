import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ROUTE_COMMANDS, PRODUCTION_SHARED_HOST_COMMAND, ROUTE_SETUP_COMMAND, SCOPES } from "../../scripts/ci/change-scope.mjs";

/**
 * THE CI ROUTING CONTRACT (FOUNDATION-DEPLOYMENT-ISO-B3B)
 * ======================================================
 *
 * `scripts/ci/change-scope.mjs` owns the ownership policy; `.github/workflows/ci.yml` executes it.
 * This suite is what stops the two from drifting: every route job must run EXACTLY the contract the
 * authority declares for its scope, and the properties that make routing safe must hold in the
 * workflow itself —
 *
 *   · a deployment change runs ZERO Foundation Vitest files and ZERO Foundation browser scenarios;
 *   · a Foundation change runs its scoped suites once, never `pnpm test` AND the scoped commands;
 *   · the complete gate is still the complete gate, reached deliberately rather than by accident;
 *   · there is exactly ONE classifier invocation, in ONE job, whose whole answer is one output;
 *   · `validate` — the single required status context — always runs and fails whenever the selected
 *     route failed, so a skipped route can never be mistaken for a pass.
 */
const ROOT = process.cwd();
const WORKFLOW = path.join(ROOT, ".github", "workflows", "ci.yml");
/** The workflow is read with `\n` endings so an assertion about a MULTI-LINE shape is checkout-safe. */
const source = readFileSync(WORKFLOW, "utf8").replace(/\r\n/g, "\n");
const lines = source.split("\n");

/** The top-level job ids, in file order. */
function jobIds(): string[] {
  const jobsAt = lines.indexOf("jobs:");
  return lines
    .slice(jobsAt + 1)
    .filter((line) => /^ {2}[A-Za-z0-9_-]+:$/.test(line))
    .map((line) => line.trim().replace(":", ""));
}

/** The lines of one top-level job: from its id to the next job, comment section or EOF. */
function jobLines(jobId: string): string[] {
  const at = lines.indexOf(`  ${jobId}:`);
  expect(at, `the workflow has no "${jobId}" job`).toBeGreaterThan(-1);
  const body = lines.slice(at + 1);
  const end = body.findIndex((line) => /^ {2}\S/.test(line));
  return end === -1 ? body : body.slice(0, end);
}

/** The commands one job runs, in order — inline `- run:` steps and named steps alike. */
function commandsOf(jobId: string): string[] {
  const body = jobLines(jobId);
  const commands: string[] = [];
  for (let index = 0; index < body.length; index += 1) {
    const inline = /^\s+- run: (.+)$/.exec(body[index]);
    if (inline !== null) {
      commands.push(inline[1].trim());
      continue;
    }
    if (!/^\s+- name: /.test(body[index])) continue;
    // A named step may carry `env:` (or anything else) between its name and its command, so read to
    // the end of THIS step rather than the next line.
    const stepIndent = body[index].search(/\S/);
    for (let look = index + 1; look < body.length; look += 1) {
      const line = body[look];
      if (/^\s*- /.test(line) && line.search(/\S/) <= stepIndent) break;
      const run = /^\s+run: (.+)$/.exec(line);
      if (run !== null) {
        commands.push(run[1].trim());
        break;
      }
    }
  }
  return commands;
}

/** The declared contract, keyed by the scope name the data-driven assertions carry. */
const ROUTES: Record<string, readonly string[]> = ROUTE_COMMANDS;

/**
 * Does a workflow command satisfy a declared one?
 *
 * Identical, or the declared command extended with further ARGUMENTS (the hygiene check appends the
 * range it has to inspect). Never a different command: `pnpm test:browser` does not satisfy a
 * declared `pnpm test`, because the declared command must be followed by a space to be extended.
 */
function satisfies(declared: string, actual: string): boolean {
  return actual === declared || actual.startsWith(`${declared} `);
}

describe("the workflow is orchestration of ONE classification authority", () => {
  it("has exactly the classifier, the five routes and the one required result", () => {
    expect(jobIds()).toEqual(["classify", "documentation", "content", "deployment", "foundation", "full", "validate"]);
  });

  it("invokes the classifier exactly once, and lets it be the only ownership policy", () => {
    // The header prose names the module; exactly ONE JOB may run it, and exactly one command may.
    const invokingJobs = jobIds().filter((jobId) =>
      jobLines(jobId).join("\n").includes("change-scope.mjs"),
    );
    expect(invokingJobs).toEqual(["classify"]);
    expect(commandsOf("classify")).toEqual([
      'node scripts/ci/change-scope.mjs --event-file "$GITHUB_EVENT_PATH" --github-output "$GITHUB_OUTPUT"',
    ]);
    // The whole answer is ONE output; no job re-derives an owner from a path pattern of its own.
    expect(jobLines("classify").join("\n")).toMatch(/^ {6}scope: \$\{\{ steps\.scope\.outputs\.scope \}\}$/m);
  });

  it("gives every route job a name equal to its scope, and every job a stable name", () => {
    for (const jobId of jobIds()) {
      expect(jobLines(jobId).join("\n"), jobId).toMatch(new RegExp(`^ {4}name: ${jobId}$`, "m"));
    }
  });

  it("never lets a route fail softly", () => {
    // `continue-on-error` would make a failing route report success — the one thing routing must not do.
    expect(source).not.toContain("continue-on-error");
  });

  it("keeps the events it needs to classify a change", () => {
    expect(source).toMatch(/^ {2}push:\n(?:.*\n)*? {4}branches: \[main, staging\]/m);
    expect(source).toMatch(/^ {2}pull_request:$/m);
  });

  it("checks out enough history wherever a job inspects a range", () => {
    for (const jobId of jobIds()) {
      const body = jobLines(jobId).join("\n");
      const inspectsHistory =
        commandsOf(jobId).some((command) => command.startsWith("git ")) ||
        body.includes("change-scope.mjs");
      if (inspectsHistory) {
        expect(body, `${jobId} diffs a range, so it needs fetch-depth: 0`).toContain("fetch-depth: 0");
      }
    }
  });

  it("never hands a range it could not measure to a command", () => {
    // A fallback selects the complete gate AND reports no range, so the two steps that inspect a range
    // are guarded: skipping is visible, while a failure would be blamed on the wrong thing entirely.
    for (const jobId of ["documentation", "content", "full"]) {
      expect(jobLines(jobId).join("\n"), jobId).toContain("if: needs.classify.outputs.base != ''");
    }
  });
});

describe("each route runs exactly its declared contract", () => {
  it.each(SCOPES)("the %s route runs what the authority declares, in order", (scope) => {
    expect(jobLines(scope).join("\n")).toContain(`if: needs.classify.outputs.scope == '${scope}'`);
    expect(jobLines(scope).join("\n")).toMatch(/^ {4}needs: classify$/m);

    const declared = ROUTES[scope];
    const actual = commandsOf(scope);
    expect(actual, `${scope} route commands`).toHaveLength(declared.length);
    declared.forEach((command, index) => {
      expect(satisfies(command, actual[index]), `${scope}[${index}]: ${actual[index]}`).toBe(true);
    });
  });

  it("runs NO application work at all for a documentation-only change", () => {
    const commands = commandsOf("documentation");
    expect(commands.some((command) => /pnpm|npm|next|vitest|node /.test(command))).toBe(false);
    // …and the authority agrees: nothing to install, for a change that installs nothing.
    expect(ROUTE_COMMANDS.documentation.join(" ")).not.toContain("pnpm");
  });

  it("runs ZERO Foundation test surfaces for a deployment-only change", () => {
    const commands = commandsOf("deployment");
    for (const forbidden of [
      "pnpm test",
      "pnpm test:browser",
      "pnpm test:foundation",
      "pnpm test:browser:foundation",
    ]) {
      expect(commands, `the deployment route must not run "${forbidden}"`).not.toContain(forbidden);
    }
    // A Foundation surface cannot sneak in as an argument either.
    expect(commands.filter((command) => command.includes("foundation"))).toEqual([]);
    expect(commands).toContain("pnpm test:deployment");
    expect(commands).toContain("pnpm test:browser:deployment");
  });

  it("proves the Foundation through its OWN suites once, then the bounded deployment canary", () => {
    const commands = commandsOf("foundation");
    // Scoped contracts only: `pnpm test` plus the scoped suites would execute the same files twice.
    expect(commands).not.toContain("pnpm test");
    expect(commands).not.toContain("pnpm test:browser");
    expect(commands).toContain("pnpm test:foundation");
    expect(commands).toContain("pnpm test:browser:foundation");
    expect(commands).toContain("pnpm exec tsc --noEmit");
    expect(commands).toContain("pnpm lint");
  });

  it("makes the deployment contract the Foundation route's CANARY — a subset, not a second policy", () => {
    const deployment = commandsOf("deployment");
    const foundation = commandsOf("foundation");
    expect(deployment.length).toBeGreaterThan(0);
    for (const command of deployment) {
      expect(foundation, `the canary must include "${command}"`).toContain(command);
    }
    // Bounded means ONE representative deployment proves compatibility: the canary is the deployment
    // contract and nothing beyond it, so a Foundation change never scales with the number of deployments.
    expect(foundation.filter((command) => command.includes("test:browser"))).toEqual([
      "pnpm test:browser:foundation",
      "pnpm test:browser:deployment",
    ]);
  });

  it("preserves the complete gate, unchanged, as the shared/mixed route", () => {
    expect(commandsOf("full")).toEqual([
      'git diff --check "$BASE".."$HEAD"',
      ...ROUTE_COMMANDS.full.slice(1),
    ]);
    expect(ROUTE_COMMANDS.full).toEqual([
      "git diff --check",
      ROUTE_SETUP_COMMAND,
      "pnpm assets:check",
      "pnpm country-codes:check",
      "pnpm exec tsc --noEmit",
      "pnpm lint",
      "pnpm test",
      "pnpm build",
      "pnpm test:browser",
      PRODUCTION_SHARED_HOST_COMMAND,
    ]);
  });

  /**
   * IA-VERIFY-01 — THE PRODUCTION PROOF IS REQUIRED, AND CANNOT BE QUIETLY REMOVED.
   *
   * A development matrix (`next dev`) is not the artefact a consumer deploys, so the shared-host
   * production smoke must run on every route that can change shared-host behaviour. These assertions are
   * the regression: deleting the step, deleting the command from the declarative contract, or downgrading
   * it to a development substitute fails HERE, in the repository, instead of being noticed only when a
   * production-only defect reaches a release.
   */
  it("requires the production shared-host proof on the Foundation and complete routes", () => {
    for (const scope of ["foundation", "full"] as const) {
      expect(ROUTE_COMMANDS[scope], `${scope} must declare the production proof`).toContain(
        PRODUCTION_SHARED_HOST_COMMAND,
      );
      expect(commandsOf(scope), `${scope} must RUN the production proof`).toContain(
        PRODUCTION_SHARED_HOST_COMMAND,
      );
    }
    // It proves a REAL build and server: the command names the production smoke, not a dev substitute.
    expect(PRODUCTION_SHARED_HOST_COMMAND).toBe("node tests/browser/shared-host-production.mjs");
    expect(PRODUCTION_SHARED_HOST_COMMAND).not.toMatch(/test:browser\b/);
    // A documentation-only change still runs nothing, and a deployment-only change stays Foundation-free.
    expect(commandsOf("documentation").join(" ")).not.toContain("shared-host-production");
    expect(commandsOf("deployment").join(" ")).not.toContain("shared-host-production");
  });

  it("keeps the production proof reachable from the ONE required status context", () => {
    // `validate` decides the run from the SELECTED route's job result, and the production proof is a step
    // of that job — so its failure is a route failure, which `validate` already turns into a red status.
    // This asserts the wiring rather than restating it: no route job may carry `continue-on-error`, which
    // would let a failed production proof leave its job green.
    for (const scope of ["foundation", "full"] as const) {
      expect(jobLines(scope).join("\n"), scope).not.toContain("continue-on-error");
    }
    const validate = jobLines("validate").join("\n");
    expect(validate).toMatch(/selected/);
    expect(validate).toContain('"$selected" != "success"');
  });

  it("gives an ambiguous change MORE validation than any single-owner route", () => {
    /**
     * Two unscoped commands each cover a PAIR of scoped ones — `pnpm test` runs both Vitest projects
     * and `pnpm test:browser` runs both browser scopes — which is why the complete gate can cover the
     * narrower routes without naming their commands. Stated once, here, so the claim stays checkable.
     */
    const unscopedCovers: Record<string, string> = {
      "pnpm test:foundation": "pnpm test",
      "pnpm test:deployment": "pnpm test",
      "pnpm test:browser:foundation": "pnpm test:browser",
      "pnpm test:browser:deployment": "pnpm test:browser",
    };
    const full = commandsOf("full");
    for (const scope of ["documentation", "deployment", "foundation"]) {
      for (const command of ROUTES[scope]) {
        const covered =
          full.some((actual) => satisfies(command, actual)) ||
          command === ROUTE_SETUP_COMMAND ||
          full.includes(unscopedCovers[command] ?? "");
        expect(covered, `the complete gate must cover "${command}" (${scope} route)`).toBe(true);
      }
    }
  });
});

describe("the required status context survives routing", () => {
  /**
   * Branch protection on `main` requires exactly ONE status context: `validate`. Conditional route
   * jobs would make "everything passed" ambiguous — a skipped job produces no check run at all — so
   * `validate` must always run and must decide the result from the SELECTED route, while remaining the
   * same name the protection rule already knows. These assertions are that governance contract.
   */
  it("keeps ONE aggregator named validate that always runs", () => {
    const validate = jobLines("validate").join("\n");
    expect(validate).toMatch(/^ {4}name: validate$/m);
    expect(validate).toMatch(/^ {4}if: always\(\)$/m);
    expect(validate).toMatch(/needs: \[classify, documentation, content, deployment, foundation, full\]/);
  });

  it("fails on a failed classifier, an unknown scope, or a failed selected route", () => {
    const validate = jobLines("validate").join("\n");
    expect(validate).toMatch(/if \[ "\$CLASSIFY" != "success" \]/);
    expect(validate).toMatch(/if \[ "\$selected" != "success" \]/);
    expect(validate).toMatch(/unknown scope/);
    // Every scope the classifier can produce is mapped to its own job result, so no route can reach
    // the fall-through — which fails loudly rather than reporting a success nobody verified.
    for (const scope of SCOPES) {
      expect(validate, scope).toMatch(
        new RegExp(`^\\s+${scope}\\)\\s+selected="\\$${scope.toUpperCase()}"`, "m"),
      );
    }
    expect(validate).toMatch(/^ {12}\*\)/m);
  });

  it("takes the scope from the classifier's output, never from a second judgement", () => {
    const validate = jobLines("validate").join("\n");
    expect(validate).toContain("SCOPE: ${{ needs.classify.outputs.scope }}");
    for (const name of ["DOCUMENTATION", "DEPLOYMENT", "FOUNDATION", "FULL"]) {
      expect(validate).toContain(`${name}: \${{ needs.${name.toLowerCase()}.result }}`);
    }
  });
});
