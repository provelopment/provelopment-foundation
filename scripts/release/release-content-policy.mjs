/**
 * THE RELEASE CONTENT POLICY (FOUNDATION-R1B)
 * ===========================================
 *
 * ONE machine-owned answer to "does this tracked path belong in a Foundation release?".
 *
 * WHY A POLICY AND NOT AN EXCLUSION LIST
 * --------------------------------------
 * A release is defined by what it CONTAINS. A hand-maintained list of exclusions would silently
 * include the next `deployment/`-shaped directory, a new CI directory or a future generated tree:
 * nobody would notice, because the release would simply grow. So the boundary is a CLASSIFIER whose
 * default is `unclassified`, and every caller that builds or verifies a release REFUSES a source
 * revision containing an unclassified path. A future tracked file that nobody has classified stops
 * release construction with the path named — it is never silently included and never silently
 * dropped.
 *
 * WHAT EACH CLASS MEANS
 * ---------------------
 *   platform      the generic Foundation: application source, platform tooling, the generic test
 *                 tree, build/quality configuration, the platform's own documentation and the
 *                 distributed instruction manuals. A release is exactly this set.
 *   excluded      state and infrastructure that belongs to a repository, a deployment or a build
 *                 rather than to the platform: `deployment/**` (one site's authored state and
 *                 acceptance suite), `.github/**` (this repository's automation), `scripts/ci/**`
 *                 (this repository's change-scope router), `public/**` and other generated output.
 *   unclassified  nothing claimed it. FAIL.
 *
 * ORDER IS PRECEDENCE: the first matching rule decides, which is what keeps `scripts/ci/**`
 * (excluded) ahead of `scripts/**` (platform) without a second mechanism. The rules are about
 * OWNERSHIP of path surfaces, never about today's inventory: adding a page, a test or a deployment
 * asset changes no rule. `tests/architecture/release-content-boundary.test.ts` proves them against
 * the repository's actual tracked inventory.
 */

/**
 * The policy's own identity. Recorded in every manifest, so a digest is never scope-ambiguous.
 *
 * The IDENTITY belongs to the immutable release contract (`src/core/foundation-release/manifest.mjs`,
 * FOUNDATION-B4A-A2) and is re-exported here so every existing caller and document keeps importing it from
 * this path. The RULES below are this repository's application of that policy and are owned here.
 */
export { RELEASE_CONTENT_POLICY_ID } from "../../src/core/foundation-release/manifest.mjs";

/** The two decisions a rule may reach. A path matching no rule is UNCLASSIFIED (see `classifyReleasePath`). */
export const RELEASE_INCLUSION = Object.freeze({
  PLATFORM: "platform",
  EXCLUDED: "excluded",
});

/**
 * Paths that MUST be present in a release, each with the reason it is load-bearing.
 *
 * Structural anchors, not an inventory: the configuration a consumer needs to install and build, the
 * three modules the manifest derives its compatibility values from, the synthetic deployment and its
 * support modules the clean-room proof needs, the platform's own tooling, and the documentation the
 * instruction manuals point at instead of duplicating.
 */
export const REQUIRED_PLATFORM_PATHS = Object.freeze([
  { path: "LICENSE", reason: "the Apache-2.0 licence the release is offered under" },
  { path: ".gitattributes", reason: "the byte-fidelity policy the artwork, manuals and LICENSE depend on" },
  { path: ".gitignore", reason: "the generated-state policy a fresh checkout relies on" },
  { path: "package.json", reason: "the manifest of what a consumer installs, and the toolchain authority" },
  { path: "pnpm-lock.yaml", reason: "deterministic installation (`--frozen-lockfile`)" },
  { path: "pnpm-workspace.yaml", reason: "the workspace/build settings installation reads" },
  { path: "next.config.ts", reason: "the application build configuration, and the deployment-selection caller" },
  { path: "tsconfig.json", reason: "the typecheck configuration" },
  { path: "vitest.config.mts", reason: "the two test identities (generic + deployment)" },
  { path: "eslint.config.mjs", reason: "the lint configuration" },
  { path: "postcss.config.mjs", reason: "the CSS pipeline configuration" },
  { path: "src/config/deployment-build.mjs", reason: "the deployment-selection authority the build reads" },
  { path: "src/config/deployment-root.ts", reason: "the deployment-path authority; also the layout vocabulary" },
  { path: "src/core/page-document.ts", reason: "the declarative page vocabulary; also its schema version" },
  { path: "tests/setup/synthetic-deployment.ts", reason: "the generic test identity (a synthetic deployment)" },
  { path: "tests/setup/production-state-integrity.ts", reason: "the write-boundary postcondition both projects run" },
  { path: "tests/support/synthetic-deployment-root.ts", reason: "the synthetic deployment the generic suite and harness need" },
  { path: "tests/fixtures/synthetic-deployment/site.config.json", reason: "the committed synthetic deployment's configuration" },
  { path: "scripts/sync-runtime-assets.mjs", reason: "the runtime asset mirror installer" },
  { path: "scripts/generate-country-code-reference.mjs", reason: "the country-code reference generator" },
  { path: "instruction-manuals/README.md", reason: "the distributed manual package a deployment operates itself from" },
  { path: "ARCHITECTURE.md", reason: "the architecture authority the manuals point at" },
  { path: "CUSTOMIZING.md", reason: "the configuration-schema authority the manuals point at" },
]);

/**
 * The rules, in precedence order.
 *
 * `kind` is how `match` is compared: `prefix` (a directory surface), `exact` (one file) or `suffix`
 * (a generated file-name pattern). Every rule states WHY: a rule whose reason cannot be written is a
 * rule that should not exist.
 */
export const RELEASE_CONTENT_RULES = Object.freeze([
  // ── EXCLUDED: repository, deployment and build state ───────────────────────────────────────────
  {
    id: "exclude-repository-automation",
    kind: "prefix",
    match: ".github/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "this repository's own CI orchestration; a consumer repository has its own",
  },
  {
    id: "exclude-reference-deployment",
    kind: "prefix",
    match: "deployment/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "one deployment's authored state, dictionaries, artwork and acceptance suite — a release must never carry another site",
  },
  {
    id: "exclude-ci-router",
    kind: "prefix",
    match: "scripts/ci/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "the change-scope router encodes THIS repository's ownership model and its capsule canary",
  },
  {
    id: "exclude-ci-router-tests",
    kind: "exact",
    match: "tests/unit/change-scope.test.ts",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "a test of the EXCLUDED CI router: shipping it without its subject would ship a test whose module is absent (a clean room proved it — `tsc` could not resolve the import)",
  },
  {
    id: "exclude-ci-routing-contract",
    kind: "exact",
    match: "tests/architecture/ci-routing-contract.test.ts",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "the router's architecture contract, for the same reason: its subject is this repository's CI routing, which a consumer replaces with its own",
  },
  {
    id: "exclude-writer-inventory-guard",
    kind: "exact",
    match: "tests/architecture/write-ownership-guard.test.ts",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "it inventories THIS repository's executable writers — including the excluded CI router and the reference capsule's own test tree — so its subject is repository infrastructure rather than the platform a consumer installs (a clean room found it: the inventory cannot match where the router is absent)",
  },
  {
    id: "exclude-generated-public",
    kind: "prefix",
    match: "public/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "generated runtime output (the asset mirror), derived from deployment sources after installation",
  },
  {
    id: "exclude-next-build-output",
    kind: "prefix",
    match: ".next/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "Next.js build output, never tracked",
  },
  {
    id: "exclude-next-export-output",
    kind: "prefix",
    match: "out/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "Next.js export output, never tracked",
  },
  {
    id: "exclude-build-output",
    kind: "prefix",
    match: "build/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "build output, never tracked",
  },
  {
    id: "exclude-coverage-output",
    kind: "prefix",
    match: "coverage/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "test coverage output, never tracked",
  },
  {
    id: "exclude-installed-dependencies",
    kind: "prefix",
    match: "node_modules/",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "installed dependencies; installation recreates them from the lockfile",
  },
  {
    id: "exclude-next-env-types",
    kind: "exact",
    match: "next-env.d.ts",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "generated by Next.js on every build",
  },
  {
    id: "exclude-typescript-build-info",
    kind: "suffix",
    match: ".tsbuildinfo",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "TypeScript incremental state, never tracked",
  },
  {
    id: "exclude-release-manifest",
    kind: "exact",
    match: "foundation-release.json",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "GENERATED by release construction: it describes the payload and is excluded from its digest by name, so it is never authored source. A materialised release tracks one (proved in a clean room), and a stray copy in a source tree must never become payload",
  },
  {
    id: "exclude-release-checksum-sidecar",
    kind: "suffix",
    match: ".sha256",
    inclusion: RELEASE_INCLUSION.EXCLUDED,
    reason: "a published checksum of a DERIVED archive; the payload digest already covers the content it would describe",
  },

  // ── PLATFORM: root files ───────────────────────────────────────────────────────────────────────
  {
    id: "platform-licence",
    kind: "exact",
    match: "LICENSE",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the canonical Apache-2.0 text the release is offered under",
  },
  {
    id: "platform-byte-fidelity-policy",
    kind: "exact",
    match: ".gitattributes",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the `-text` rules that keep artwork, manuals and LICENSE byte-exact",
  },
  {
    id: "platform-generated-state-policy",
    kind: "exact",
    match: ".gitignore",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the generated-state policy a fresh checkout relies on",
  },
  {
    id: "platform-package-manifest",
    kind: "exact",
    match: "package.json",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "what a consumer installs, and the toolchain/compatibility authority",
  },
  {
    id: "platform-lockfile",
    kind: "exact",
    match: "pnpm-lock.yaml",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "deterministic installation (`pnpm install --frozen-lockfile`)",
  },
  {
    id: "platform-workspace",
    kind: "exact",
    match: "pnpm-workspace.yaml",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "workspace/build settings installation reads",
  },
  {
    id: "platform-next-config",
    kind: "exact",
    match: "next.config.ts",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the application build configuration and deployment-selection caller",
  },
  {
    id: "platform-typescript-config",
    kind: "exact",
    match: "tsconfig.json",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the typecheck configuration",
  },
  {
    id: "platform-vitest-config",
    kind: "exact",
    match: "vitest.config.mts",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the two test identities (generic + deployment)",
  },
  {
    id: "platform-eslint-config",
    kind: "exact",
    match: "eslint.config.mjs",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the lint configuration",
  },
  {
    id: "platform-postcss-config",
    kind: "exact",
    match: "postcss.config.mjs",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the CSS pipeline configuration",
  },
  {
    id: "platform-root-documentation",
    kind: "root-suffix",
    match: ".md",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "platform documentation at the repository root only — every documented surface under a directory is claimed by that directory's rule",
  },
  {
    id: "platform-agent-pointer",
    kind: "exact",
    match: "CLAUDE.md",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the one-line pointer to the platform's agent contract",
  },

  // ── PLATFORM: directory surfaces ───────────────────────────────────────────────────────────────
  {
    id: "platform-connect-module",
    kind: "prefix",
    match: "modules/connect/",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason:
      "the pinned Connect Module source, its provenance and its licence record — platform code a consumer builds and imports, not deployment state; `scripts/connect/verify-pinned-source.mjs` proves the carried bytes are the released bytes",
  },

  {
    id: "platform-application",
    kind: "prefix",
    match: "src/",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the application source a consumer builds and runs",
  },
  {
    id: "platform-tests",
    kind: "prefix",
    match: "tests/",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the generic contract suite, its synthetic deployment and the browser harness — the release's own proof",
  },
  {
    id: "platform-tooling",
    kind: "prefix",
    match: "scripts/",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "platform tooling that installs generated state and constructs/verifies a release (`scripts/ci/**` is matched earlier and excluded)",
  },
  {
    id: "platform-manuals",
    kind: "prefix",
    match: "instruction-manuals/",
    inclusion: RELEASE_INCLUSION.PLATFORM,
    reason: "the distributed instruction manuals a deployment operates itself from",
  },
]);

/**
 * A tracked path as Git spells it: forward slashes, no leading `./`.
 *
 * @param {string} file a path as Git reports it
 * @returns {string} the normalised path
 */
export function normaliseReleasePath(file) {
  return String(file).replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

/**
 * Reject a path the digest encoding could not represent unambiguously.
 *
 * The normalised digest lists `path` + NUL + file hash + newline per entry, so a path containing a
 * newline could be read as two records. Such a path is REFUSED rather than encoded: a release must
 * fail visibly instead of producing a digest whose meaning is arguable.
 *
 * @param {string} file the normalised path
 * @returns {string} the path, when it is encodable
 */
export function assertReleasePathIsEncodable(file) {
  if (file.length === 0) {
    throw new Error("FOUNDATION-R1B: an empty path cannot be part of a release.");
  }
  if (file.includes("\n") || file.includes("\r") || file.includes("\0")) {
    throw new Error(
      `FOUNDATION-R1B: the tracked path ${JSON.stringify(file)} contains a line break or NUL, which ` +
        "the release digest encoding cannot represent unambiguously. Rename it before releasing.",
    );
  }
  return file;
}

/**
 * Classify ONE tracked path.
 *
 * @param {string} file a repository-relative path
 * @returns {{ path: string, inclusion: string|null, ruleId: string|null, reason: string }}
 *   `inclusion === null` means UNCLASSIFIED: no rule claimed the path, so release construction must fail.
 */
export function classifyReleasePath(file) {
  const candidate = assertReleasePathIsEncodable(normaliseReleasePath(file));

  for (const rule of RELEASE_CONTENT_RULES) {
    const matched =
      rule.kind === "prefix"
        ? candidate.startsWith(rule.match)
        : rule.kind === "exact"
          ? candidate === rule.match
          : rule.kind === "root-suffix"
            ? !candidate.includes("/") && candidate.endsWith(rule.match)
            : candidate.endsWith(rule.match);
    if (matched) {
      return { path: candidate, inclusion: rule.inclusion, ruleId: rule.id, reason: rule.reason };
    }
  }

  return {
    path: candidate,
    inclusion: null,
    ruleId: null,
    reason: "no release content rule claims this path",
  };
}

/**
 * Partition a tracked-path inventory.
 *
 * @param {Iterable<string>} paths the tracked paths of ONE source revision
 * @returns {{ platform: string[], excluded: string[], unclassified: string[], byRule: Record<string, string[]> }}
 */
export function classifyReleaseInventory(paths) {
  /** @type {string[]} */ const platform = [];
  /** @type {string[]} */ const excluded = [];
  /** @type {string[]} */ const unclassified = [];
  /** @type {Record<string, string[]>} */ const byRule = {};

  for (const entry of paths) {
    const decision = classifyReleasePath(entry);
    if (decision.inclusion === RELEASE_INCLUSION.PLATFORM) platform.push(decision.path);
    else if (decision.inclusion === RELEASE_INCLUSION.EXCLUDED) excluded.push(decision.path);
    else unclassified.push(decision.path);
    if (decision.ruleId !== null) {
      (byRule[decision.ruleId] ??= []).push(decision.path);
    }
  }

  return { platform, excluded, unclassified, byRule };
}

/**
 * Fail unless every tracked path of the source revision has been classified.
 *
 * This is the property that makes the boundary trustworthy: a new tracked file (a new top-level
 * directory, a second deployment, a tool nobody classified) stops construction instead of leaking
 * into a release or silently vanishing from one.
 *
 * @param {Iterable<string>} paths the tracked paths of ONE source revision
 * @returns {{ platform: string[], excluded: string[], byRule: Record<string, string[]> }} the partition
 */
export function assertReleaseInventoryClassified(paths) {
  const inventory = classifyReleaseInventory(paths);
  if (inventory.unclassified.length > 0) {
    throw new Error(
      "FOUNDATION-R1B: the source revision contains tracked paths the release content policy does not " +
        "classify, so this release cannot be constructed. Classify each one as platform or excluded in " +
        `scripts/release/release-content-policy.mjs:\n${inventory.unclassified
          .map((entry) => `    ${entry}`)
          .join("\n")}`,
    );
  }
  return inventory;
}

/**
 * Fail unless the release contains the structural anchors a consumer needs.
 *
 * Anchors answer "is this a Foundation release at all?": a payload missing its lockfile, its build
 * configuration, the synthetic deployment or the modules the manifest derives its compatibility
 * values from is not something a deployment can install and prove.
 *
 * @param {Iterable<string>} platformPaths the paths the policy classified as platform
 * @returns {string[]} the anchors that were required
 */
export function assertRequiredPlatformPaths(platformPaths) {
  const present = new Set(platformPaths);
  const missing = REQUIRED_PLATFORM_PATHS.filter((anchor) => !present.has(anchor.path));
  if (missing.length > 0) {
    throw new Error(
      "FOUNDATION-R1B: the source revision does not contain every file a Foundation release must carry:\n" +
        missing.map((anchor) => `    ${anchor.path} — ${anchor.reason}`).join("\n"),
    );
  }
  return REQUIRED_PLATFORM_PATHS.map((anchor) => anchor.path);
}
