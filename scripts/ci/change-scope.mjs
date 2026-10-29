#!/usr/bin/env node
/**
 * CHANGE-SCOPE CLASSIFICATION — ONE authority decides what CI must prove
 * ======================================================================
 * FOUNDATION-DEPLOYMENT-ISO-B3B
 *
 * CI used to answer every change with the same broad repository gate. That was deliberate and it was
 * safe, but it is not the end state: a deployment's content edit should prove the DEPLOYMENT's
 * contract, and a Foundation edit should prove the FOUNDATION's contracts plus a bounded
 * compatibility CANARY against the ONE reference deployment — not against every deployment that will
 * ever exist. The rule CI now follows is:
 *
 *     validation scope follows change ownership
 *
 * This module is the ONE place that decides which of those happens. It is deliberately small, plain
 * ESM and dependency-free — the same shape as the two authorities it sits beside
 * (`src/config/deployment-build.mjs`, `tests/browser/scope.mjs`) — so `node` runs it directly, the
 * workflow consumes exactly one output, and a generic test can import the SAME functions to prove
 * the policy without re-stating it.
 *
 * THE RULE THAT MATTERS MOST
 * --------------------------
 * Unknown or ambiguous ownership NEVER produces less validation. An unrecognised path, a re-created
 * historical deployment location, a mixed change, an unreadable commit range or an empty change set
 * ALL select the complete gate. A classification can therefore be wrong in exactly one direction:
 * towards proving more. This is why the fallback is `full` rather than an error or a skip — a new
 * top-level directory must not be able to make CI prove nothing just because nobody updated a list.
 *
 * WHERE OWNERSHIP COMES FROM
 * --------------------------
 * The Git diff, and nothing else: not a commit-message prefix, not a PR label, not a human's choice
 * of scope. The range is chosen per event (`pull_request` → the changes the PR introduces against
 * its base; `push` → `before..after`) and the diff is taken with `--no-renames`, so a moved file is
 * seen as a deletion PLUS an addition and can never hide the owner it was taken from.
 *
 * THE FOUR OWNERS
 * ---------------
 *   documentation  a file whose only effect is on a human reader: the platform's own manuals, the
 *                  author-facing maps, and a human-facing README beside executable code (`src/**`,
 *                  `scripts/**`). Nothing is built, installed or executed for these.
 *   content        ordinary AUTHORED website data inside the deployment: a Spoke's pages, its authored
 *                  artwork sources and its dictionaries. Data a reader or a renderer consumes, and
 *                  nothing that changes how the deployment behaves.
 *   deployment     the capsule's executable production state and its acceptance contract:
 *                  configuration, the Installation manifest, operational lifecycle state, the
 *                  deployment's OWN tests, and anything else the capsule owns.
 *   foundation     the generic platform: application code and the generic test tree.
 *   shared         consumed by BOTH owners, or part of the build/test orchestration itself:
 *                  manifests, lockfiles, build/CI configuration, platform scripts, the generated
 *                  runtime mirror, the shared test harness and the deployment-root/build authority.
 *
 * THE FIVE ROUTES (and why each is the safe answer for its class)
 * ---------------------------------------------------------------
 *   documentation  documentation + repository hygiene only.
 *   content        authored data: hygiene, the generated checks, the deployment's own tests and a
 *                  production build — the smallest gate that proves authored material is consumable.
 *                  NO browser acceptance: prose and artwork do not change shell or runtime behaviour.
 *   deployment     the deployment's own contract: deterministic generated checks, typecheck, lint,
 *                  deployment tests, deployment build, deployment browser acceptance. It runs ZERO
 *                  Foundation Vitest files and ZERO Foundation browser scenarios.
 *   foundation     the generic contract (typecheck, lint, Foundation tests, Foundation browser
 *                  scenarios) plus the bounded reference-deployment canary. The canary IS the
 *                  deployment route: ONE representative deployment proves the platform still fits a
 *                  real installation. It is deliberately NOT "run every deployment" — a Foundation
 *                  change must not scale with the number of deployments that exist.
 *   full           the complete conservative gate (the pre-B3B gate). Every shared/mixed, retired,
 *                  unrecognised or ambiguous change lands here.
 *
 * `ROUTE_COMMANDS` below states each route's contract as data, and
 * `tests/architecture/ci-routing-contract.test.ts` proves the workflow runs exactly it — so this file
 * and the YAML cannot drift apart in silence.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The ownership classes a single changed path can have. */
export const OWNERS = ["documentation", "content", "deployment", "foundation", "shared"];

/**
 * The routes CI can select. `full` is the shared/mixed route: the complete gate.
 *
 * `content` is a NARROWER route than `deployment`: ordinary authored website data changed, while the
 * executable deployment behaviour and configuration did not. It exists because a normal page edit used
 * to buy the whole deployment route, including the deployment browser acceptance — verification effort
 * proportional to the plausible blast radius (see `AGENTS.md`, the verification SOP).
 */
export const SCOPES = ["documentation", "content", "deployment", "foundation", "full"];

/** What each route means, in the words the CI log should use. */
export const SCOPE_ROUTES = {
  documentation: "documentation and repository hygiene only — nothing is installed, built or run",
  content:
    "authored website data only — the deployment's own contract, without browser acceptance",
  deployment: "the selected deployment's own contract, and none of the Foundation's test surfaces",
  foundation: "the generic Foundation contract, plus a bounded reference-deployment canary",
  full: "the complete repository gate (the conservative route for shared, mixed or unknown changes)",
};

/**
 * The ONE setup command every executable route runs before its contract.
 *
 * It is part of the declared contract rather than workflow boilerplate, because the routes that must
 * NOT install anything (documentation) are exactly as important as the ones that must — and a test
 * can then compare each route's whole command sequence instead of guessing which steps "count".
 */
export const ROUTE_SETUP_COMMAND = "pnpm install --frozen-lockfile";

/**
 * THE PRODUCTION SHARED-HOST PROOF (IA-VERIFY-01).
 *
 * `pnpm test:browser` drives `next dev`; that is not the same artefact a consumer deploys. This command
 * runs `tests/browser/shared-host-production.mjs`, which builds a REAL production server for the
 * shared-host Installation and proves cross-Hub publication, canonical addresses, owner-scoped assets,
 * unmatched prefixes and an unauthored root against it. It is REQUIRED on the Foundation and complete
 * routes — a green development matrix may never stand in for it — and it is declared here, once, so a
 * removal is a contract failure rather than a quiet edit to the workflow.
 */
export const PRODUCTION_SHARED_HOST_COMMAND = "node tests/browser/shared-host-production.mjs";

/**
 * THE VALIDATION CONTRACT OF EACH ROUTE, as data.
 *
 * One entry per command the route must run, in the order the workflow runs it. The documentation
 * route's single command is a PREFIX: the workflow appends the range it has to check, and a declared
 * command matches when the workflow command is either identical or extends it with further arguments
 * — never when it is a different command (see `tests/architecture/ci-routing-contract.test.ts`).
 *
 * `deployment` is a strict subset of `foundation` on purpose: the canary IS the deployment route.
 * `full` states the complete gate explicitly so that "do not weaken it" is an assertion, not a hope.
 */
export const ROUTE_COMMANDS = {
  documentation: ["git diff --check"],
  content: [
    "git diff --check",
    ROUTE_SETUP_COMMAND,
    "pnpm assets:check",
    "pnpm country-codes:check",
    "pnpm test:deployment",
    "pnpm build",
  ],
  deployment: [
    ROUTE_SETUP_COMMAND,
    "pnpm assets:check",
    "pnpm country-codes:check",
    "pnpm exec tsc --noEmit",
    "pnpm lint",
    "pnpm test:deployment",
    "pnpm build",
    "pnpm test:browser:deployment",
  ],
  foundation: [
    ROUTE_SETUP_COMMAND,
    "pnpm assets:check",
    "pnpm country-codes:check",
    "pnpm exec tsc --noEmit",
    "pnpm lint",
    "pnpm test:foundation",
    "pnpm build",
    "pnpm test:browser:foundation",
    PRODUCTION_SHARED_HOST_COMMAND,
    "pnpm test:deployment",
    "pnpm test:browser:deployment",
  ],
  full: [
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
  ],
};

/**
 * HISTORICAL DEPLOYMENT LOCATIONS, retired by FOUNDATION-DEPLOYMENT-ISO-B2B.
 *
 * `site.config.json`, `config/i18n/**` and `content/**` used to live at the repository root; the
 * deployment now owns them inside its capsule. They are therefore NOT classification categories: a
 * change that re-creates one is reported as a warning and routed to the COMPLETE gate, where the
 * existing deployment-root guard (`tests/architecture/deployment-root-guard.test.ts`) fails it. A
 * retired path is never allowed to be treated as ordinary content or configuration.
 */
export const RETIRED_ROOT_LOCATIONS = ["site.config.json", "config/", "content/"];

/** Files owned by the whole repository: the manifests and the build/test orchestration itself. */
const SHARED_FILES = [
  ".gitattributes",
  ".gitignore",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "next.config.ts",
  "vitest.config.mts",
  "tsconfig.json",
  "eslint.config.mjs",
  "postcss.config.mjs",
  // The deployment-root/build authority is read by the build, by the test projects, by the platform
  // scripts and by the browser harness, so a change to it affects BOTH owners.
  "src/config/deployment-build.mjs",
  "src/config/deployment-root.ts",
];

/**
 * Directories owned by the whole repository.
 *
 *   tests/browser/**  the ONE browser harness (runner, CDP client, scope policy) drives both owners'
 *                     scenarios, and it is lint-ignored as Node CLI infrastructure.
 *   tests/setup/**    installs each test project's identity through the deployment authority.
 *   tests/support/**  the synthetic-deployment support the generic suite and the harness both use.
 *   tests/fixtures/** a second, test-owned deployment: cross-owner by definition.
 *   public/**         generated runtime state (the asset mirror).
 *   scripts/**        platform tooling that reads and writes deployment state.
 */
const SHARED_DIRECTORIES = [
  ".github/",
  "scripts/",
  "public/",
  "tests/browser/",
  "tests/setup/",
  "tests/support/",
  "tests/fixtures/",
];

/**
 * Documentation surfaces, according to this repository's actual files.
 *
 * Deliberately an explicit list rather than "every `.md` file": a deployment's authored page
 * (`deployment/content/pages/markdown/<site>/<locale>/<page>.md`) is production content that HAPPENS
 * to be Markdown, and the generated `deployment/content/COUNTRY-CODES.md` belongs to the deployment's
 * generation/validation lifecycle. Both stay deployment-owned.
 */
const DOCUMENTATION_FILES = [
  "README.md",
  "AGENTS.md",
  "ARCHITECTURE.md",
  "BRAND_ASSETS.md",
  "CLAUDE.md",
  "CUSTOMIZING.md",
  "DEPLOYMENT.md",
  "LICENSE",
  "deployment/README.md",
  "deployment/AGENTS.md",
];

/** Directory whose `.md` files are distributed manuals. A non-Markdown file there is NOT documentation. */
const DOCUMENTATION_DIRECTORIES = ["instruction-manuals/"];

/**
 * The author-facing maps inside the deployment's own content tree (`content/README.md`,
 * `content/assets/README.md`, `content/pages/markdown/README.md`, …): documentation, by the same
 * test that excludes `COUNTRY-CODES.md` — a reader consults them, and nothing derives from them.
 */
const DOCUMENTATION_README_DIRECTORY = "deployment/content/";

/**
 * THE CODE-ADJACENT README RULE.
 *
 * `src/**` and `scripts/**` are EXECUTABLE surfaces: the TypeScript there is compiled, type-checked, linted,
 * tested and built, and the tooling is executed by CI, by a release construction and by an establishment. A
 * `README.md` beside that code is read by a human and consumed by nothing — prose that cannot change
 * behaviour — so it takes the documentation route, which is what verification proportional to blast radius
 * means in practice (see `AGENTS.md` §15: a README wording correction needs the documentation checks for its
 * delta, not a thousand runtime and browser assertions).
 *
 * The rule is STRUCTURAL and SHALLOW, and deliberately not a Markdown semantic classifier: the file must be
 * named exactly `README.md`, and it must sit beneath one of these trees. Nothing about its CONTENT is
 * inspected, no other Markdown file inherits documentation ownership from it, and a Markdown path elsewhere
 * that no rule claims keeps the fail-safe answer — the complete gate.
 */
const CODE_ADJACENT_DOCUMENTATION_TREES = ["src/", "scripts/"];

/** The deployment capsule. Everything it owns that no documentation rule claimed first. */
const DEPLOYMENT_DIRECTORY = "deployment/";

/** The generic platform: application code and the generic test tree. */
const FOUNDATION_DIRECTORIES = ["src/", "tests/"];

/**
 * THE AUTHORED RESOURCE TREES — the deployment-owned data a reader or a renderer consumes
 * (FOUNDATION-MULTISITE-M21).
 *
 * DERIVED from the path authority's own vocabulary (`src/config/deployment-root.ts`,
 * `DEPLOYMENT_RESOURCE_PATHS`), and `tests/architecture/ci-routing-contract.test.ts` asserts that these
 * values still MATCH it — so this plain-ESM module never restates a shape that authority has changed.
 *
 * A Spoke names these trees beneath ITS OWN root; a legacy IMPLICIT installation names them at its root.
 * Both layouts are supported, and neither is spelled with a particular Spoke id: "which Spokes exist" is
 * answered by the Installation manifest, never by this classifier.
 */
export const AUTHORED_CONTENT_TREES = Object.freeze([
  "config/i18n/",
  "content/pages/",
  "content/assets/",
]);

/** The Installation root the capsule spells; every supported layout lives beneath it. */
const INSTALLATION_DIRECTORY = "deployment/";

/**
 * The authored tree a path belongs to, for the layouts this platform carries — or `null`.
 *
 *   deployment/spokes/<spoke>/<tree>   an explicit Spoke's own authored data
 *   deployment/<tree>                  a legacy IMPLICIT installation's authored data
 *
 * `spokes.json` (the manifest), `site.config.json`, operational lifecycle state and the deployment's own
 * tests are deliberately NOT matched: they can change BEHAVIOUR, so they keep the stronger scope.
 */
function authoredContentTree(path) {
  if (!path.startsWith(INSTALLATION_DIRECTORY)) return null;
  const segments = path.slice(INSTALLATION_DIRECTORY.length).split("/");
  const relative =
    segments[0] === "spokes" && segments.length > 2 ? segments.slice(2).join("/") : segments.join("/");
  return AUTHORED_CONTENT_TREES.find((tree) => relative.startsWith(tree)) ?? null;
}

/**
 * The executable tree a human-facing README belongs to, for the code-adjacent rule — or `null`.
 *
 * Shallow on purpose: exactly `README.md`, exactly beneath `src/` or `scripts/`. A README at a tree's own
 * root (`src/README.md`) and one nested several levels deep (`src/core/spoke/README.md`) are the same case.
 */
function codeAdjacentReadmeTree(path) {
  if (!path.endsWith("/README.md")) return null;
  return CODE_ADJACENT_DOCUMENTATION_TREES.find((directory) => path.startsWith(directory)) ?? null;
}

/**
 * A changed path as Git reports it, normalised to the repository's own spelling: forward slashes and
 * no leading `./`. A human may pass a Windows path on the command line, and both spellings must
 * classify identically.
 *
 * @param {string} file a repository-relative path
 * @returns {string} the normalised path
 */
export function normalisePath(file) {
  return String(file).replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

/**
 * The OWNER of ONE changed path, and why.
 *
 * The rule order IS the policy — first match wins — and it is what makes the exceptions above
 * meaningful: a README inside `deployment/content/` is claimed by the documentation rule BEFORE the
 * capsule rule sees it, while `deployment/content/COUNTRY-CODES.md` is not a README and therefore
 * stays deployment-owned. The same shape applies to the executable trees: a `README.md` beneath `src/`
 * or `scripts/` is claimed by the code-adjacent documentation rule BEFORE the `scripts/` (shared) and
 * `src/` (foundation) directory rules see it, while every other file in those trees keeps the stronger
 * owner — so documentation can never narrow an executable change.
 *
 * @param {string} file a repository-relative path
 * @returns {{ path: string, owner: string, reason: string, retired: boolean }}
 */
export function classifyPath(file) {
  const path = normalisePath(file);
  if (path === "") throw new Error("a changed path cannot be empty");

  const retired = RETIRED_ROOT_LOCATIONS.find((location) =>
    location.endsWith("/") ? path.startsWith(location) : path === location,
  );
  if (retired !== undefined) {
    return {
      path,
      owner: "shared",
      retired: true,
      reason: `the RETIRED root deployment location "${retired}" — the deployment owns this state inside its capsule now`,
    };
  }

  if (SHARED_FILES.includes(path)) {
    return {
      path,
      owner: "shared",
      retired: false,
      reason: "a manifest or a build/test authority both owners depend on",
    };
  }

  // A human-facing README beside EXECUTABLE code is documentation, and this rule is evaluated BEFORE the
  // broad `scripts/` and `src/` directory rules below can consume it — rule order IS the policy. It sits
  // AFTER the explicit shared files so a file the repository declared shared by name (the harness's own
  // `tests/browser/README.md`) keeps the owner it was given, and it claims nothing but `README.md`.
  const readmeTree = codeAdjacentReadmeTree(path);
  if (readmeTree !== null) {
    return {
      path,
      owner: "documentation",
      retired: false,
      reason: `a human-facing README inside an executable tree (${readmeTree}) — read by a person, consumed by no build, test or runtime`,
    };
  }
  if (SHARED_DIRECTORIES.some((directory) => path.startsWith(directory))) {
    return {
      path,
      owner: "shared",
      retired: false,
      reason: "shared orchestration, tooling or test-harness surface",
    };
  }

  if (DOCUMENTATION_FILES.includes(path)) {
    return { path, owner: "documentation", retired: false, reason: "a platform manual or the licence" };
  }
  if (DOCUMENTATION_DIRECTORIES.some((directory) => path.startsWith(directory)) && path.endsWith(".md")) {
    return { path, owner: "documentation", retired: false, reason: "a distributed manual" };
  }
  if (
    path.startsWith(DOCUMENTATION_README_DIRECTORY) &&
    (path.slice(DOCUMENTATION_README_DIRECTORY.length) === "README.md" || path.endsWith("/README.md"))
  ) {
    return {
      path,
      owner: "documentation",
      retired: false,
      reason: "an author-facing README inside the deployment's content tree",
    };
  }

  // An author-facing README inside ANY authored content tree is documentation, in every supported
  // layout: a reader consults it, and nothing derives from it (§8 of the M21 mandate, and the same test
  // that keeps a generated lifecycle file like COUNTRY-CODES.md out of this rule).
  const authoredTree = authoredContentTree(path);
  if (authoredTree !== null && path.endsWith("/README.md")) {
    return {
      path,
      owner: "documentation",
      retired: false,
      reason: "an author-facing README inside an authored content tree",
    };
  }
  if (authoredTree !== null) {
    return {
      path,
      owner: "content",
      retired: false,
      reason: `authored website data (${authoredTree}) — a page, a dictionary or an artwork source`,
    };
  }

  if (path.startsWith(DEPLOYMENT_DIRECTORY)) {
    return {
      path,
      owner: "deployment",
      retired: false,
      reason: "the deployment capsule: its production state or its own tests",
    };
  }
  if (FOUNDATION_DIRECTORIES.some((directory) => path.startsWith(directory))) {
    return {
      path,
      owner: "foundation",
      retired: false,
      reason: "the generic platform: application code or the generic test tree",
    };
  }

  return {
    path,
    owner: "shared",
    retired: false,
    reason: "UNRECOGNISED — no ownership rule claims this path, so it must be treated as the whole repository's",
  };
}

/**
 * The route one set of owners selects.
 *
 * The order encodes the fail-safe direction: a shared path, or a change spanning BOTH owners, is
 * shared/mixed and takes the complete gate; documentation never narrows anything except a change that
 * is documentation and nothing else.
 *
 * @param {ReadonlySet<string>} owners the owners present in the change
 * @param {number} changedCount how many distinct paths changed
 * @returns {{ scope: string, reason: string }}
 */
function routeFor(owners, changedCount) {
  if (changedCount === 0) {
    return {
      scope: "full",
      reason:
        "no changed paths were reported, so no ownership could be established — the complete gate is the only safe answer",
    };
  }
  if (owners.has("shared")) {
    return {
      scope: "full",
      reason: "the change includes a path owned by the whole repository, so every contract must be proved",
    };
  }
  if (owners.has("foundation") && (owners.has("deployment") || owners.has("content"))) {
    return {
      scope: "full",
      reason:
        "the change spans BOTH owners (foundation, and deployment-authored state) — a shared/mixed change",
    };
  }
  if (owners.has("foundation")) {
    return {
      scope: "foundation",
      reason: owners.has("documentation")
        ? "foundation-owned path(s), with documentation alongside them"
        : "foundation-owned path(s) only",
    };
  }
  if (owners.has("deployment")) {
    return {
      scope: "deployment",
      reason: owners.has("documentation")
        ? "deployment-owned path(s), with documentation alongside them"
        : "deployment-owned path(s) only",
    };
  }
  if (owners.has("content")) {
    return {
      scope: "content",
      reason: owners.has("documentation")
        ? "authored website data, with documentation alongside it"
        : "authored website data only — no executable deployment surface changed",
    };
  }
  return { scope: "documentation", reason: "documentation-owned path(s) only" };
}

/**
 * The ROUTE for one change, with every path's owner and the reasoning a CI log should show.
 *
 * Duplicate paths cannot change the answer, and neither can their order: ownership is a property of
 * the SET of paths, which is what makes the route stable across diff renderings.
 *
 * @param {readonly string[]} files the changed paths
 * @returns {{
 *   scope: string,
 *   reason: string,
 *   entries: Array<{ path: string, owner: string, reason: string, retired: boolean }>,
 *   owners: string[],
 *   warnings: string[],
 *   conservative: boolean,
 * }}
 */
export function classifyChange(files) {
  const entries = [];
  const seen = new Set();
  for (const file of files) {
    const path = normalisePath(file);
    if (seen.has(path)) continue;
    seen.add(path);
    entries.push(classifyPath(path));
  }

  const owners = new Set(entries.map((entry) => entry.owner));
  const routed = routeFor(owners, entries.length);
  // A path no rule claims is the case a reader most needs explained, so the route says how many there
  // were: "FULL" must never look like a coincidence, and an unclassified path is never a small change.
  const unclassified = entries.filter((entry) => entry.reason.startsWith("UNRECOGNISED"));
  const reason =
    unclassified.length === 0
      ? routed.reason
      : `${routed.reason} — ${unclassified.length} of ${entries.length} path(s) could not be classified at all`;

  const warnings = entries
    .filter((entry) => entry.retired)
    .map(
      (entry) =>
        `RETIRED ROOT LOCATION: ${entry.path} — historical deployment state belongs in the capsule; ` +
        "the deployment-root guard fails such a change.",
    );

  // An empty change set, a retired location, an unrecognised path or a change spanning both owners
  // all land on the complete gate. Saying so explicitly is the point: FULL must never look accidental.
  const conservative =
    routed.scope === "full" &&
    (entries.length === 0 ||
      (owners.has("foundation") && (owners.has("deployment") || owners.has("content"))) ||
      entries.some((entry) => entry.retired || entry.reason.startsWith("UNRECOGNISED")));

  return {
    scope: routed.scope,
    reason,
    entries,
    owners: OWNERS.filter((owner) => owners.has(owner)),
    warnings,
    conservative,
  };
}

/**
 * The changed paths of a range, as Git sees them.
 *
 * `--no-renames` is deliberate: a moved file is reported as a DELETION of its old path plus an
 * ADDITION of its new one, so both owners are considered and a rename can never smuggle a change out
 * of the ownership it came from. `-z` makes the listing machine-readable whatever a filename contains.
 *
 * @param {string} base the base revision
 * @param {string} head the head revision
 * @param {".." | "..."} dot the range operator
 * @returns {string[]} repository-relative changed paths
 */
function changedPathsFromGit(base, head, dot) {
  for (const revision of [base, head]) {
    try {
      git(["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]);
    } catch {
      throw new Error(`the revision "${revision}" is not present in this checkout`);
    }
  }
  return git(["diff", "--name-only", "--no-renames", "-z", `${base}${dot}${head}`])
    .split("\0")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

/** Run one Git command, or fail with the command's own diagnostic. */
function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = `${error.stderr ?? ""}${error.message ?? ""}`.trim();
    throw new Error(`git ${args.join(" ")} failed${detail === "" ? "" : `: ${detail}`}`);
  }
}

/**
 * The range a workflow event describes.
 *
 * `pull_request` compares the base the PR will merge into with the PR's own head using THREE dots,
 * so the answer is "what this PR introduces" rather than "the difference between two tips" (which
 * would also report changes that only the base branch has). `push` compares `before..after`.
 *
 * Anything else — an unsupported event, a missing revision, the all-zero `before` of a new branch —
 * returns `null`, and the caller selects the complete gate. A change whose extent cannot be
 * established is never treated as small.
 *
 * @param {unknown} payload a GitHub event payload
 * @returns {{ base: string, head: string, dot: ".." | "...", source: string } | null}
 */
export function rangeFromEvent(payload) {
  const event = payload && typeof payload === "object" ? payload : {};
  const zero = /^0+$/;
  if (event.pull_request) {
    const base = event.pull_request.base?.sha;
    const head = event.pull_request.head?.sha;
    if (typeof base === "string" && typeof head === "string" && base !== "" && head !== "") {
      return { base, head, dot: "...", source: "pull_request (merge-base…head)" };
    }
    return null;
  }
  if (typeof event.before === "string" && typeof event.after === "string") {
    if (zero.test(event.before) || zero.test(event.after)) return null;
    return { base: event.before, head: event.after, dot: "..", source: "push (before..after)" };
  }
  return null;
}

/** The one usage line, quoted in every CLI failure so the tool is self-explanatory. */
export function usage() {
  return [
    "node scripts/ci/change-scope.mjs [range | paths] [output]",
    "",
    "range:",
    "  --event-file <path>   a GitHub event payload (default: $GITHUB_EVENT_PATH)",
    "  --base <rev> --head <rev>   an explicit range, as a human would ask for one",
    "paths:",
    "  --path <changed-path>       classify an explicit path (repeatable; no Git access)",
    "output:",
    "  --github-output <path>      append scope/changed-count/reason/base/head for GitHub Actions",
    "  --json                      print the classification as JSON",
  ].join("\n");
}

/** An argument the tool cannot act on. Distinct from a failure, which prints a diagnostic instead. */
class UsageError extends Error {}

/**
 * The range to inspect, or the reason there is none.
 *
 * An EVENT PAYLOAD is preferred over a caller-supplied range in CI, because the event is what actually
 * happened. A range that cannot be read never becomes a narrow route: the caller turns every fallback
 * into the complete gate.
 *
 * @param {{ eventFile?: string, base?: string, head?: string }} options the parsed arguments
 * @param {NodeJS.ProcessEnv} environment the process environment
 * @param {boolean} required whether a range must exist at all (it need not when explicit paths were given)
 * @returns {{ base?: string, head?: string, dot?: string, source?: string, fallback?: string }}
 */
function describeRange(options, environment, required = true) {
  if (options.base !== undefined || options.head !== undefined) {
    if (options.base === undefined || options.head === undefined) {
      throw new UsageError('"--base" and "--head" must be given together');
    }
    return { base: options.base, head: options.head, dot: "..", source: "explicit range" };
  }
  const eventFile = options.eventFile ?? environment.GITHUB_EVENT_PATH;
  if (eventFile === undefined || eventFile === "") {
    if (!required) return {};
    throw new UsageError(
      "no change to inspect: pass --path, or a range, or a GitHub event payload (--event-file)",
    );
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(eventFile, "utf8"));
  } catch (error) {
    return {
      fallback: `the event payload at ${eventFile} could not be read (${error.message}) — the complete gate is the only safe answer`,
    };
  }
  const range = rangeFromEvent(payload);
  if (range === null) {
    return {
      fallback:
        "this event does not describe a comparable change (an unsupported event, or a push with no " +
        "before commit) — the complete gate is the only safe answer",
    };
  }
  return range;
}

/** The report a CI log shows: the route, every path's owner, and why. */
export function describeChange(result, range = {}) {
  const lines = [
    `change scope: ${result.scope}`,
    `route: ${SCOPE_ROUTES[result.scope]}`,
    `changed paths: ${result.entries.length}`,
  ];
  for (const entry of result.entries) {
    lines.push(`  ${entry.owner.padEnd(13)} ${entry.path}    — ${entry.reason}`);
  }
  lines.push(`ownership: ${result.owners.length > 0 ? result.owners.join(" + ") : "(none)"}`);
  lines.push(`reason: ${result.reason}`);
  if (range.source !== undefined) {
    lines.push(`range: ${range.source} — ${range.base}${range.dot}${range.head}`);
  }
  for (const warning of result.warnings) lines.push(`warning: ${warning}`);
  if (result.conservative) {
    lines.push(
      "conservative: the COMPLETE gate was selected, because unknown or ambiguous ownership always " +
        "broadens validation instead of skipping it.",
    );
  }
  return lines.join("\n");
}

/** The values the workflow consumes, in `GITHUB_OUTPUT`'s own format. */
export function githubOutputLines(result, range = {}) {
  return [
    `scope=${result.scope}`,
    `changed-count=${result.entries.length}`,
    `reason=${result.reason.replace(/\s+/g, " ")}`,
    `base=${range.base ?? ""}`,
    `head=${range.head ?? ""}`,
  ];
}

/** Classify one run and report it. Returns the process exit code. */
function main(argv, environment = process.env) {
  const options = parseArguments(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const range =
    options.paths.length > 0 &&
    options.base === undefined &&
    options.head === undefined &&
    options.eventFile === undefined
      ? // Explicit paths and no range asked for: classify exactly what was named, with no Git access
        // at all. This is the mode the classifier tests and a human debugging a decision both use.
        {}
      : describeRange(options, environment, options.paths.length === 0);
  let paths = options.paths;
  let fallback = range.fallback;
  if (paths.length === 0 && fallback === undefined) {
    try {
      paths = changedPathsFromGit(range.base, range.head, range.dot);
    } catch (error) {
      paths = [];
      fallback = `the change could not be measured (${error.message}) — the complete gate is the only safe answer`;
    }
  }

  let result = classifyChange(paths);
  if (fallback !== undefined) {
    // Every unmeasurable or unsupported case lands on the complete gate. It is written as an explicit
    // override so no later edit can quietly make "we could not tell" mean "run almost nothing".
    result = { ...result, scope: "full", conservative: true, reason: fallback };
    // …and a change we could not MEASURE has no range to report either. The workflow must never be
    // handed a revision pair it cannot resolve (a fork pull request's head, the all-zero `before` of a
    // new branch): a range-dependent step would fail the complete gate for a reason that has nothing to
    // do with the change, turning a safe fallback into a red build.
    range.base = undefined;
    range.head = undefined;
  }

  if (options.githubOutput !== undefined) {
    appendFileSync(options.githubOutput, `${githubOutputLines(result, range).join("\n")}\n`, "utf8");
  }
  if (options.json) {
    console.log(
      JSON.stringify(
        { ...result, base: range.base ?? null, head: range.head ?? null, source: range.source ?? null },
        null,
        2,
      ),
    );
  } else {
    console.log(describeChange(result, range));
  }
  return 0;
}

/** The command line: `--path` (repeatable), one range spelling, one output spelling. */
export function parseArguments(argv) {
  const options = {
    paths: [],
    json: false,
    help: false,
    eventFile: undefined,
    base: undefined,
    head: undefined,
    githubOutput: undefined,
  };
  const value = (argument, index) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      throw new UsageError(`"${argument}" needs a value`);
    }
    return next;
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--path") {
      options.paths.push(value(argument, index));
      index += 1;
    } else if (argument === "--event-file") {
      options.eventFile = value(argument, index);
      index += 1;
    } else if (argument === "--base") {
      options.base = value(argument, index);
      index += 1;
    } else if (argument === "--head") {
      options.head = value(argument, index);
      index += 1;
    } else if (argument === "--github-output") {
      options.githubOutput = value(argument, index);
      index += 1;
    } else if (argument === "--json") {
      options.json = true;
    } else if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else {
      throw new UsageError(`unknown option "${argument}"`);
    }
  }
  return options;
}

const isMain =
  process.argv[1] !== undefined && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    if (error instanceof UsageError) console.error(`change-scope: ${error.message}\n\n${usage()}`);
    else console.error(`change-scope: ${error.message}`);
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}
