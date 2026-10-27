import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { resolveDeploymentForBuild } from "@/config/deployment-build.mjs";
import { deploymentPaths } from "@/config/deployment-root";

import {
  RETIRED_ROOT_DEPLOYMENT_LOCATIONS,
  retiredRootDeploymentViolations,
} from "../support/retired-root-deployment";
import { syntheticDeploymentPaths } from "../support/synthetic-deployment";

vi.mock("next/navigation", () => ({
  usePathname: () => "/ww/en",
  useRouter: () => ({ push: () => {} }),
}));

/**
 * THE DEPLOYMENT-ROOT GUARD (FOUNDATION-DEPLOYMENT-ISO-B1)
 * ========================================================
 *
 * ISO-A1 found the SAME root-relative assumption written in four places, which is what made a
 * deployment change (adding a Site) require Foundation edits. `@/config/deployment-root` is now the
 * ONE authority, and this guard is what keeps it that way: a future change may not re-introduce a
 * deployment-owned path — or a bare `process.cwd()` — anywhere else in `src/**`.
 *
 * It is deliberately NARROW: it checks a short list of deployment-OWNED location literals (the
 * config file, the dictionary directory, the two authoring roots, the asset directories) and the
 * `process.cwd()` anchor itself. Platform concerns, comments and the authority's own file are not
 * policed.
 */
const ROOT = process.cwd();
const AUTHORITY = path.join(ROOT, "src", "config", "deployment-root.ts");
/**
 * The BUILD/CONFIG-harness module. It is the one other file that may anchor on `process.cwd()` and
 * read a deployment's configuration, because it runs at build/configuration time in Node — and it is
 * PLAIN ESM (FOUNDATION-DEPLOYMENT-ISO-H1C) so that all three of its runtimes — the build
 * (`next.config.ts`), the test run (`vitest.config.mts`) and the Foundation's Node tooling
 * (`scripts/sync-runtime-assets.mjs`) — consume the SAME authority with no TypeScript execution flag
 * and no loader or warning suppression. The assertion below covers the APPLICATION surface — `src/**`
 * — plus the two configuration files and expects exactly `next.config.ts` and `vitest.config.mts`
 * there, so no client chunk and no application module can reach it.
 */
const BUILD_HARNESS = path.join(ROOT, "src", "config", "deployment-build.mjs");

/**
 * THE PER-SPOKE CONFIGURATION READER (FOUNDATION-MULTISITE-S3D1A) — the SECOND sanctioned reader of a
 * deployment configuration file, and deliberately NOT a second root authority: it is HANDED the Spoke root
 * that S3C1 (`src/config/spoke-roots.ts`) already resolved and validated, and it never discovers anything
 * itself (no `process.cwd()`, no layout, no environment, no `spokes.json`). Named here so the set of modules
 * allowed to read a deployment configuration file is explicit and reviewable.
 */
const SPOKE_CONFIG_READER = path.join(ROOT, "src", "config", "spoke-config.ts");

/**
 * Every module under `src/` this guard polices: TypeScript/TSX sources AND plain-ESM `.mjs` modules
 * — the build harness is one of the latter, so the scan surface must never depend on a file
 * extension (a `.mjs` deployment path would otherwise escape this guard).
 */
function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...sourceFiles(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx") || full.endsWith(".mjs")) found.push(full);
  }
  return found;
}

/** The CODE lines of a file: comment lines are ignored (they may legitimately name these paths). */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith("*") && !trimmed.startsWith("//") && !trimmed.startsWith("/*");
    });
}

describe("deployment-owned paths are spelled in ONE place", () => {
  const files = sourceFiles(path.join(ROOT, "src")).filter(
    (file) => file !== AUTHORITY && file !== BUILD_HARNESS,
  );

  /** The deployment-owned location fragments, in the shape code would spell them. */
  const FORBIDDEN = [
    { label: "the root site config import", matcher: /from\s+["'][^"']*site\.config\.json["']/ },
    { label: "the dictionary directory", matcher: /["']config["']\s*,\s*["']i18n["']/ },
    { label: "the markdown authoring root", matcher: /["']content["']\s*,\s*["']pages["']\s*,\s*["']markdown["']/ },
    { label: "the JSON authoring root", matcher: /["']content["']\s*,\s*["']pages["']\s*,\s*["']json["']/ },
    { label: "the asset directories", matcher: /["']content["']\s*,\s*["']assets["']|["']public["']\s*,\s*["']assets["']/ },
  ];

  for (const { label, matcher } of FORBIDDEN) {
    it(`no module outside the authority builds ${label} itself`, () => {
      const offenders = files.filter((file) => codeLines(file).some((line) => matcher.test(line)));
      expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
    });
  }

  it("no module outside the authority anchors on process.cwd()", () => {
    const offenders = files.filter((file) =>
      codeLines(file).some((line) => line.includes("process.cwd()")),
    );
    expect(offenders.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("every DIRECT consumer resolves its deployment-owned location through the authority", () => {
    for (const consumer of [
      ["src", "config", "loader.ts"],
      ["src", "adapters", "content", "authoring-source-discovery.ts"],
      ["src", "config", "assets.ts"],
    ] as const) {
      const source = readFileSync(path.join(ROOT, ...consumer), "utf8");
      expect(source, consumer.join("/")).toMatch(/deployment-root/);
      expect(source, consumer.join("/")).toMatch(/deploymentPaths\(\)|readDeploymentConfig\(\)/);
    }
  });

  it("keeps the dictionary binding INDIRECT: i18n/index.ts resolves through the runtime context (S3F2A2-D2)", () => {
    // S3F2A2-D2 cut the production dictionary binding over to the context-capable runtime access, so
    // `@/config/i18n` no longer names the authority at all: it is handed ONE explicit context
    // (`./installation-runtime`, itself a direct consumer of the authority) and binds that context's
    // dictionaries. The deployment-owned location is still resolved in ONE place — reached one step
    // earlier — and this pin makes the new step explicit rather than implicit.
    const configDirectory = path.join(ROOT, "src", "config");
    const dictionaryBindingFile = path.join(configDirectory, "i18n", "index.ts");
    const source = readFileSync(dictionaryBindingFile, "utf8");
    expect(source).toMatch(/from "\.\.\/installation-runtime"/);
    expect(source).toMatch(/currentBuildRuntimeContext\(\)/);
    expect(source).toMatch(/dictionaryAccessForRuntimeContext\(/);
    for (const stripped of codeLines(dictionaryBindingFile)) {
      expect(stripped, "must not spell a deployment-owned location itself").not.toMatch(
        /deployment-root|deploymentPaths\(\)|readDeploymentConfig\(\)/,
      );
    }
  });

  it("keeps the authority CLIENT-SAFE: no node:fs and no process.cwd() at module load", () => {
    const source = readFileSync(AUTHORITY, "utf8");
    // `siteConfig` is imported by client components, so the authority's module-load code must not
    // pull a filesystem import (Turbopack refuses a client chunk with `node:fs`) and must not call
    // `process.cwd()` (absent in a browser). Both are only legal inside the SERVER-ONLY
    // `deploymentPaths()` body.
    const moduleScope = source
      .split(/\r?\n/)
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"));
    expect(moduleScope.join("\n").includes('from "node:fs"')).toBe(false);
    const pathsBody = source.slice(source.indexOf("export function deploymentPaths()"));
    const outsidePaths = moduleScope.join("\n").split("export function deploymentPaths()")[0];
    expect(outsidePaths.includes("process.cwd()")).toBe(false);
    expect(pathsBody.includes("process.cwd()")).toBe(true);
  });

  it("has NO compile-time dependency on a root site.config.json (ISO-B1C)", () => {
    // The regression this guards: ISO-B1 resolved the repository layout through
    // `import bundledRepositorySiteConfig from "../../site.config.json"`, so deleting or moving that
    // file broke module resolution everywhere (tsc TS2307, Turbopack "Module not found"). The
    // deployment is now selected by the BUILD and inlined, so no application module imports a
    // deployment configuration file at all.
    const importers = sourceFiles(path.join(ROOT, "src")).filter((file) =>
      codeLines(file).some((line) => /from\s+["'][^"']*site\.config\.json["']/.test(line)),
    );
    expect(importers.map((file) => path.relative(ROOT, file))).toEqual([]);
    // …and the authority's CODE lines never IMPORT one (it does name the SELECTED deployment's file
    // when it publishes `siteConfigFile`, which is data, not a compile-time dependency).
    expect(codeLines(AUTHORITY).join("\n")).not.toMatch(/^\s*import[^\n]*site\.config\.json/m);
  });

  it("lets nothing outside the SANCTIONED readers READ a deployment configuration file", () => {
    // FOUNDATION-MULTISITE-S3D1A names the SECOND sanctioned reader explicitly. `deployment-build.mjs`
    // answers "which Installation?"; `spoke-config.ts` only reads ONE Spoke root it was HANDED by
    // `spoke-roots.ts` (S3C1) — so the set of modules that may read a deployment configuration file stays
    // an EXPLICIT list, and the rule is never weakened into "anyone may read one": a module that reads such
    // a file must be named here. The detection now also covers a read that spells the file name through the
    // ONE shared constant (`DEPLOYMENT_CONFIG_FILE_NAME`) instead of the literal.
    const SANCTIONED_READERS = [BUILD_HARNESS, SPOKE_CONFIG_READER];
    const readers = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => !SANCTIONED_READERS.includes(file))
      .filter((file) =>
        codeLines(file).some((line) =>
          /readFileSync\([^)]*(site\.config\.json|DEPLOYMENT_CONFIG_FILE_NAME)/.test(line),
        ),
      );
    expect(readers.map((file) => path.relative(ROOT, file))).toEqual([]);
  });

  it("keeps the build harness out of the application, and on its approved boundaries", () => {
    // CLIENT SAFETY is the property that matters: the harness touches `node:fs`, so an application
    // module that imported it would drag a filesystem import into a client chunk.
    const importsHarness = (file: string) =>
      codeLines(file).some((line) => /from\s+["'][^"']*deployment-build[^"']*["']/.test(line));

    const applicationImporters = sourceFiles(path.join(ROOT, "src")).filter(importsHarness);
    expect(applicationImporters.map((file) => path.relative(ROOT, file))).toEqual([]);

    // Every other consumer is a NON-bundled boundary: the build (`next.config.ts`), the Foundation's
    // own Node tooling — the asset mirror AND the country-code reference generator (`scripts/**`,
    // ISO-H1C / ISO-B3A) — the browser harness, which must discover the SELECTED deployment's own
    // scenarios in whatever root that deployment owns (`tests/browser/matrix.mjs`, ISO-B3A), and the
    // test-context setup/support modules that select a deployment for the two Vitest projects
    // (ISO-H2). ISO-B3C2B adds the WRITE-BOUNDARY consumers, which must ask where the installed
    // deployment is in order to protect it: the harness's write guard (`tests/browser/scratch.mjs`),
    // the disposable-copy helper (`tests/support/disposable-deployment.ts`), the runtime
    // production-state proof (`tests/setup/production-state-integrity.ts`) and the write-ownership
    // guard itself. Nothing else may join the list — in particular not `vitest.config.mts`, which
    // deliberately resolves NO deployment: the generic suite must run in a repository where no real
    // deployment exists.
    const approved = [
      "next.config.ts",
      "scripts/efs/publication-projection.mjs",
      "scripts/efs/validate-publications.mjs",
      "scripts/generate-country-code-reference.mjs",
      "scripts/installation/index.mjs",
      "scripts/sync-runtime-assets.mjs",
      "tests/integration/efs-publication-projection.test.ts",
      "tests/browser/shared-host.scenario.mjs",
      "tests/architecture/deployment-root-guard.test.ts",
      "tests/architecture/write-ownership-guard.test.ts",
      "tests/browser/matrix.mjs",
      "tests/browser/scratch.mjs",
      "tests/setup/production-state-integrity.ts",
      "tests/setup/real-deployment.ts",
      "tests/support/disposable-deployment.ts",
      "tests/support/efs-installation.ts",
      "tests/support/installation-establishment-fixture.ts",
      "tests/support/synthetic-deployment-root.ts",
      "tests/unit/foundation-installation-establishment.test.ts",
      // FOUNDATION-MULTISITE-S3F1 — the explicit one-Spoke SELECTION rules are proved against the seam
      // itself (legacy vs explicit, the exactly-one rule, the refusals) and against the runtime authority
      // it inlines, so this suite is another sanctioned consumer of the build harness.
      "tests/unit/spoke-installation-selection.test.ts",
      // FOUNDATION-MULTISITE-S3F1R — the build/S3C1 DECLARATION-PARITY proof: it asks the seam and the
      // S3C1 authority the same question about the same disposable roots, so it too is a sanctioned
      // consumer of the build harness (it selects no deployment itself).
      "tests/unit/spoke-declaration-parity.test.ts",
      // FOUNDATION-MULTISITE-M20 — the multi-Spoke ESTABLISHMENT proof is seeded with a byte-faithful copy
      // of the REAL authored capsule, so it must know where that capsule is; asking the build authority
      // (`capsuleDirectory`) is the sanctioned way to know it, and it selects no deployment itself.
      "tests/integration/foundation-installation-multispoke.test.ts",
      // FOUNDATION-ID-M3-P3 — the COMPOSITE-IDENTITY suite proves what the build seam produces for an
      // IDENTIFIED installation (the routing description of a synthetic nested root, and the deployment that
      // root resolves to), so it asks the seam itself about a DISPOSABLE root — exactly as the parity suite
      // above does. It selects no deployment and writes none: its root is its own OS-temp tree.
      "tests/unit/spoke-runtime-composite.test.ts",
      // FOUNDATION-EFS-SHARED-HOST-REMEDIATION-A1-R03 — the ASSET-AUTHORIZATION suite proves the chain
      // `manifest → build projection → proxy decision` by asking the REAL build seam to project a
      // DISPOSABLE synthetic Installation's own `efs/manifest.json`. Asking the seam is what makes the proof
      // meaningful (a hand-written projection table would prove nothing about the product), and it selects
      // no deployment and writes none: its root is its own OS-temp tree.
      "tests/integration/efs-asset-authorization.test.ts",
    ];
    // FOUNDATION-B4B adds three of these, and for the same reason the list already had entries: they must
    // know WHERE an installation's authored material lives, and asking the authority is the only sanctioned
    // way to know it. `scripts/installation/index.mjs` is Foundation Node tooling (like the asset mirror),
    // and it passes the answer to establishment because `src/**` may not import this module;
    const unapproved = sourceFiles(path.join(ROOT, "tests"))
      .concat(sourceFiles(path.join(ROOT, "scripts")), [path.join(ROOT, "next.config.ts")])
      .filter(importsHarness)
      .map((file) => path.relative(ROOT, file).split(path.sep).join("/"))
      .filter((file) => !approved.includes(file));
    expect(unapproved).toEqual([]);
  });
});

describe("the build selects exactly one deployment", () => {
  it("resolves the REPOSITORY layout for a repository that has no capsule (never 'this checkout')", () => {
    // ISO-H2 — this assertion used to pin the CURRENT checkout to the repository layout, which states
    // today's install rather than the architecture: a valid consumer repository may contain a capsule.
    // The rule is therefore exercised on a controlled temporary repository, where the expected answer
    // is unambiguous.
    const root = mkdtempSync(path.join(tmpdir(), "foundation-repository-layout-"));
    try {
      writeFileSync(
        path.join(root, "site.config.json"),
        JSON.stringify({ repository: true }),
        "utf8",
      );
      const resolved = resolveDeploymentForBuild({}, root);
      expect(resolved.layout).toBe("repository");
      expect(resolved.root).toBe(root);
      expect(resolved.siteConfigFile).toBe(path.join(root, "site.config.json"));
      expect(JSON.parse(resolved.config)).toEqual({ repository: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("publishes deployment-owned locations RELATIVE to the selected root, in every layout", () => {
    // The runtime authority derives its answer from the selection, never from a literal beside it, so
    // the same rule holds in the repository layout, in a capsule and under a test override.
    const paths = deploymentPaths();
    const normalise = (value: string) => value.replace(/\\/g, "/");
    expect(["repository", "capsule", "override"]).toContain(paths.layout);
    for (const location of [
      paths.siteConfigFile,
      paths.dictionaryDirectory,
      paths.dictionaryOverrideDirectory,
      paths.markdownPagesRoot,
      paths.jsonPagesRoot,
      paths.assetSourceRoot,
    ]) {
      expect(normalise(location).startsWith(normalise(paths.root)), location).toBe(true);
    }
    // …while the runtime mirror is the ONE platform-owned location and never follows a deployment.
    expect(normalise(paths.publicAssetsDirectory)).toBe(
      normalise(path.join(ROOT, "public", "assets")),
    );
  });

  it("gives the GENERIC test project a synthetic identity, never the installed deployment", () => {
    // ISO-H2 — the decisive isolation property, asserted where it is enforced: the generic project
    // selects the synthetic deployment before any test module loads
    // (`tests/setup/synthetic-deployment.ts`), so BOTH identity surfaces — the selected configuration
    // (`@/config`) and the filesystem identity (`deploymentPaths()`) — describe that deployment.
    const paths = deploymentPaths();
    const synthetic = syntheticDeploymentPaths();
    // Paths are published with forward slashes by the authority (valid on every platform Node/Next
    // support) while the support helper builds them with `path.join`, so compare normalised.
    const normalise = (value: string) => value.replace(/\\/g, "/");
    expect(paths.layout).toBe("override");
    expect(normalise(paths.root)).toBe(normalise(synthetic.root));
    expect(normalise(paths.siteConfigFile)).toBe(normalise(synthetic.siteConfigFile));
    expect(normalise(paths.dictionaryDirectory)).toBe(normalise(synthetic.dictionaryDirectory));
    expect(normalise(paths.markdownPagesRoot)).toBe(normalise(synthetic.markdownPagesRoot));
    expect(normalise(paths.jsonPagesRoot)).toBe(normalise(synthetic.jsonPagesRoot));
    expect(normalise(paths.assetSourceRoot)).toBe(normalise(synthetic.assetSourceRoot));
    // The synthetic root is DISPOSABLE, and disposability is the whole protection: a generic test may plant
    // and remove fixtures freely without touching any committed deployment. TWO placements satisfy that —
    // the platform temporary directory, or the repository's IGNORED task scratch domain `.temp/`, which can
    // never be tracked (`**/.temp/` in .gitignore, enforced by `scripts/check-temp-tracking.mjs`) and is
    // therefore absent from every release payload (R09 §4).
    const insideCheckout = paths.root.startsWith(ROOT + path.sep);
    const insideTaskScratch =
      insideCheckout && paths.root.startsWith(path.join(ROOT, ".temp") + path.sep);
    expect(insideCheckout ? insideTaskScratch : true).toBe(true);
    expect(existsSync(path.join(paths.root, "site.config.json"))).toBe(true);
  });

  it("never lets disposable synthetic state reach AUTHORED deployment material", () => {
    // The predicate the assertion above relies on, applied to the places that must stay forbidden.
    const disposable = (value: string) => {
      const inside = value.startsWith(ROOT + path.sep);
      return !inside || value.startsWith(path.join(ROOT, ".temp") + path.sep);
    };
    expect(disposable(path.join(ROOT, ".temp", "foundation-a1-tests", "installation"))).toBe(true);
    expect(disposable(path.join(tmpdir(), "foundation-synthetic"))).toBe(true);
    // Anything INSIDE the checkout that is not the task scratch domain is never disposable - which is
    // what keeps authored deployment state unreachable BY CONSTRUCTION (write-ownership-guard.test.ts
    // proves the authored deployment itself is refused, with its own sanctioned-writer inventory).
    expect(disposable(path.join(ROOT, "src", "core"))).toBe(false);
  });

  it("resolves a CAPSULE at <repo>/deployment when one exists — with no root config involved", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-capsule-"));
    try {
      mkdirSync(path.join(root, "deployment"), { recursive: true });
      writeFileSync(
        path.join(root, "deployment", "site.config.json"),
        JSON.stringify({ capsule: true }),
        "utf8",
      );
      const resolved = resolveDeploymentForBuild({}, root);
      expect(resolved.layout).toBe("capsule");
      expect(resolved.root).toBe(path.join(root, "deployment"));
      expect(JSON.parse(resolved.config)).toEqual({ capsule: true });
      // …and the repository's own config is NOT required to exist for that build.
      expect(existsSync(path.join(root, "site.config.json"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("resolves an OVERRIDE root, and fails LOUDLY when a selected deployment has no configuration", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-override-"));
    try {
      writeFileSync(path.join(root, "site.config.json"), JSON.stringify({ override: true }), "utf8");
      const resolved = resolveDeploymentForBuild({ FOUNDATION_DEPLOYMENT_ROOT: root }, ROOT);
      expect(resolved.layout).toBe("override");
      expect(JSON.parse(resolved.config)).toEqual({ override: true });

      expect(() =>
        resolveDeploymentForBuild({ FOUNDATION_DEPLOYMENT_ROOT: path.join(root, "absent") }, ROOT),
      ).toThrow(/is not an existing directory/);
      // S3F1 — the wording and the order of refusal are the ONE declaration authority's (S3C1's), which the
      // build seam now shares by construction: a root that is absent is named as absent, and a root that
      // exists but declares nothing names the files it lacks. Nothing can drift between selection and
      // configuration because there is only one implementation.
      expect(() =>
        resolveDeploymentForBuild({ FOUNDATION_DEPLOYMENT_ROOT: root }, ROOT),
      ).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

/**
 * THE REPOSITORY-OWNERSHIP GUARD (FOUNDATION-DEPLOYMENT-ISO-B3C2A)
 * ================================================================
 *
 * The guard above keeps the deployment root a SINGLE AUTHORITY. This one keeps the deployment itself
 * in a single PLACE: the combined Foundation repository is a platform repository that CARRIES a
 * reference deployment in its capsule, so the deployment-owned locations a build derives from a
 * selected root must not also exist at this repository's root. Whichever copy a reader found first
 * would decide what the site says — that is the defect this contract exists to make impossible.
 *
 * Four properties, each reasoned from structure rather than from an inventory:
 *
 *   1. NOTHING is tracked beneath the retired root locations, and nothing is sitting there on disk;
 *   2. ARBITRARY future descendants are rejected — the rule names locations, never filenames;
 *   3. the CAPABILITY is preserved: a standalone spoke repository keeps selecting the `repository`
 *      layout (B4 depends on this), proven on a disposable synthetic repository;
 *   4. the capsule directory is spelled in the build authority and the path authority ALONE, and the
 *      generic test tree reaches deployment state only through the authority.
 */
describe("the combined Foundation repository keeps deployment state in its capsule", () => {
  const relativeToRoot = (file: string) => path.relative(ROOT, file).split(path.sep).join("/");

  /** The paths this repository has actually TRACKED beneath the retired root locations. */
  function trackedRetiredRootPaths(): string[] {
    return execFileSync("git", ["ls-files", "-z", "--", ...RETIRED_ROOT_DEPLOYMENT_LOCATIONS], {
      cwd: ROOT,
      encoding: "utf8",
    })
      .split("\0")
      .filter((tracked) => tracked.length > 0);
  }

  it("tracks NOTHING at the retired Foundation-root deployment locations", () => {
    const tracked = trackedRetiredRootPaths();

    // The inventory is taken FROM the locations themselves, which is what makes this durable: a file
    // nobody has written yet (`content/anything/new.txt`) fails here the day it is tracked, without
    // this guard ever naming it.
    expect(retiredRootDeploymentViolations(tracked)).toEqual([]);
  });

  it("leaves those locations ABSENT on disk as well — drift has no second home to grow in", () => {
    // Filesystem evidence is COMPLEMENTARY, never the contract (Git does not track empty directories,
    // and ISO-C1 showed how misleading directory presence can be): the tracked inventory above is the
    // rule. This catches the other half — a stray copy that has not been committed yet.
    for (const location of RETIRED_ROOT_DEPLOYMENT_LOCATIONS) {
      expect(existsSync(path.join(ROOT, ...location.split("/"))), location).toBe(false);
    }
  });

  it("rejects ARBITRARY future descendants under a retired root location", () => {
    // The negative inventory is SYNTHETIC (B3C2A §19): the rule is proved on path inventories, so no
    // forbidden file ever has to be planted in the repository — or left behind — to test it.
    const rejected = [
      "site.config.json",
      "./site.config.json",
      "config/i18n/en.json",
      "config/i18n/sites/ww/en.json",
      "content/pages/markdown/ww/en/about.md",
      "content/pages/json/ww/en/offerings/website-design.json",
      "content/assets/logo.svg",
      "content/README.md",
      "content/anything/new.txt",
      "content\\assets\\logo.svg",
      "CONTENT/README.md",
    ];

    for (const tracked of rejected) {
      expect(retiredRootDeploymentViolations([tracked]), tracked).toEqual([tracked]);
    }
  });

  it("accepts the capsule's own tree, fixture trees and root-anchored lookalikes", () => {
    // The rule is about WHERE this repository's deployment state lives, not about the vocabulary: the
    // capsule's own locations, a synthetic fixture's tree and platform modules that merely share a
    // directory name all stay legal.
    const accepted = [
      "deployment/site.config.json",
      "deployment/config/i18n/en.json",
      "deployment/content/pages/markdown/ww/en/about.md",
      "deployment/content/assets/logo.svg",
      "src/config/i18n/registry.ts",
      "tests/fixtures/synthetic-deployment/content/pages/markdown/ww/en/about.md",
      "public/assets/logo-header.svg",
      "content-notes.md",
      "config/i18n-notes.md",
    ];

    expect(retiredRootDeploymentViolations(accepted)).toEqual([]);
  });

  it("selects the REPOSITORY layout for a standalone spoke — root deployment state stays SUPPORTED", () => {
    // B3C2A forbids root deployment state in THIS repository; it must never forbid the CAPABILITY. A
    // future independent spoke repository is exactly this shape — ONE deployment, no platform
    // capsule, its deployment-owned locations at its own root — and this is the proof (B4's premise)
    // that the selector still selects it. Nothing here is repository identity: the same call decides
    // every repository the same way.
    const root = mkdtempSync(path.join(tmpdir(), "foundation-spoke-"));
    try {
      const spokeLocations = [
        "config/i18n/en.json",
        "content/pages/markdown/ww/en/about.md",
        "content/pages/json/ww/en/home.json",
        "content/assets/logo.svg",
      ];
      for (const location of spokeLocations) {
        const file = path.join(root, ...location.split("/"));
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, "{}\n", "utf8");
      }
      writeFileSync(path.join(root, "site.config.json"), JSON.stringify({ spoke: true }), "utf8");

      const resolved = resolveDeploymentForBuild({}, root);
      expect(resolved.layout).toBe("repository");
      expect(resolved.root).toBe(root);
      expect(resolved.siteConfigFile).toBe(path.join(root, "site.config.json"));
      expect(JSON.parse(resolved.config)).toEqual({ spoke: true });

      // The derived deployment-owned locations are the spoke's OWN root locations — the same five
      // locations the authority derives for any selected root, capsule or override alike.
      for (const location of [
        "config/i18n",
        "content/pages/markdown",
        "content/pages/json",
        "content/assets",
      ]) {
        expect(existsSync(path.join(root, ...location.split("/"))), location).toBe(true);
      }

      // …and a capsule, when a repository has one, still wins — the selector's documented order,
      // applied to every repository rather than to this one.
      const capsuleRoot = path.join(root, "deployment");
      mkdirSync(capsuleRoot, { recursive: true });
      writeFileSync(path.join(capsuleRoot, "site.config.json"), JSON.stringify({ capsule: true }), "utf8");
      expect(resolveDeploymentForBuild({}, root).layout).toBe("capsule");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("spells the capsule directory in the ONE build authority and the ONE path authority, nowhere else", () => {
    // Selecting a deployment and deriving its root are the only two places in application source that
    // may name the capsule directory. A third spelling would be a second derivation of the same
    // answer — exactly what a reviewer should see statically rather than discover as a run-time
    // disagreement between the build authority and the paths a server renders with.
    const capsuleDirectory = /(?:^|["'`/\\])deployment(?:$|["'`/\\])/;

    const spellers = sourceFiles(path.join(ROOT, "src"))
      .filter((file) => codeLines(file).some((line) => capsuleDirectory.test(line)))
      .map(relativeToRoot)
      .sort();

    expect(spellers).toEqual(["src/config/deployment-build.mjs", "src/config/deployment-root.ts"]);
  });

  it("keeps the generic test tree off the repository's own deployment state", () => {
    // ISO-H2 gives the generic project a SYNTHETIC deployment, so a generic test reaches deployment
    // state through the authority — `deploymentPaths()` or `syntheticDeploymentPaths()` — and never by
    // composing a path itself. The rule keys on a REPOSITORY anchor (`ROOT`, `process.cwd()`, …) and
    // not on the vocabulary, because a fixture tree a test creates in a TEMPORARY directory is the
    // sanctioned way to have real deployment files (tests/support/synthetic-deployment-root.ts) and
    // such a tree anchors on its own disposable root instead.
    const repositoryAnchor =
      /(process\.cwd\(\)|\bROOT\b|\bREPO_ROOT\b|__dirname|import\.meta\.dirname|\bHERE\b)/;
    const deploymentState =
      /(["'`/\\])deployment(["'`/\\])|(["'`/\\])content(["'`/\\])|(["'`/\\])i18n(["'`/\\])/;

    const offenders = sourceFiles(path.join(ROOT, "tests"))
      .filter((file) =>
        codeLines(file).some((line) => repositoryAnchor.test(line) && deploymentState.test(line)),
      )
      .map(relativeToRoot)
      .sort();

    expect(offenders).toEqual([]);
  });
});
