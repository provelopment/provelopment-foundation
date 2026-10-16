import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { capsuleDirectory, resolveDeploymentForBuild } from "@/config/deployment-build.mjs";
import { deploymentPaths } from "@/config/deployment-root";

import { assertHarnessWritable, harnessWriteRoots } from "../browser/scratch.mjs";
import { selectDisposableDeploymentCopy } from "../support/disposable-deployment";
import {
  captureProductionStateManifest,
  productionStateDrift,
} from "../support/production-state-manifest";

/**
 * WHO MAY WRITE WHICH FILESYSTEM DOMAIN (FOUNDATION-DEPLOYMENT-ISO-B3C2B)
 * ======================================================================
 *
 * ISO-B3C2A answered "where may deployment state live, and who selects it". This suite answers the
 * question that follows: **who may WRITE which domain** — with two small mechanical layers rather than a
 * permission framework:
 *
 *   1. AN EXACT WRITER INVENTORY. Every executable file in `src/**`, `scripts/**`, `tests/**` and
 *      `deployment/tests/**` that performs a filesystem MUTATION is listed here by exact path, with the
 *      domain it owns and the reason. A new writer — a new script, a new test that writes, a new helper —
 *      therefore fails this suite until somebody classifies it. That is the point: not "regex proves every
 *      filesystem effect in JavaScript", but "a new writer cannot arrive silently".
 *   2. THE RUNTIME OUTCOME. `tests/setup/production-state-integrity.ts` brackets both Vitest projects with
 *      a before/after manifest of the real deployment's authored state, so a run that leaves a mutation
 *      behind fails whether or not the static inventory noticed it. The inventory classifies WHO exists;
 *      the manifest proves WHAT happened.
 *
 * The domains, in one place:
 *
 *   Foundation application code (`src/**`)                       NOTHING — no writer exists there at all
 *   deployment generator `scripts/generate-country-code-…mjs`    `<selected>/content/COUNTRY-CODES.md` only
 *   runtime asset installer `scripts/sync-runtime-assets.mjs`     `<repo>/public/assets/**`,
 *                                                                 `<repo>/public/spokes/**` and the ONE
 *                                                                 generated catalog it publishes for the
 *                                                                 runtime (`<repo>/src/config/generated/
 *                                                                 runtime-asset-catalog.json`) only
 *   CI classifier `scripts/ci/change-scope.mjs`                  `$GITHUB_OUTPUT` (the runner's file)
 *   generic tests + the browser harness                          OS temp, the synthetic deployment, `.report/`
 *   a deployment's writable authoring test                       a disposable COPY of the selected deployment
 *
 * WHAT THIS IS NOT. Not a general ban on writing `deployment/**`: a spoke's owner — or a managed workflow
 * acting for them — MUST be able to author its own configuration, dictionaries, pages, artwork, generated
 * documents and operational state. What is forbidden is uncontrolled REPOSITORY TOOLING and TEST execution
 * using shipped production state as scratch space. It is also not a filesystem permission subsystem: one
 * guard around the browser harness's targets, one runtime manifest proof, one allowlist.
 */
const ROOT = process.cwd();

/** The surfaces that hold executable code and can therefore contain a writer. */
const WRITER_SURFACES = ["src", "scripts", "tests", "deployment/tests"] as const;

/** Extensions that are executed by Node, Next or Vitest (documentation is deliberately not scanned). */
const CODE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs", ".js", ".jsx", ".cjs"] as const;

/** The Node filesystem operations that MUTATE. Reads are never matched. */
const MUTATION_API =
  /\b(writeFile|appendFile|mkdir|rm|rmdir|unlink|rename|copyFile|cp|createWriteStream|truncate|chmod|symlink)(Sync)?\s*\(/;

/** The file's code, with comments removed: prose inside a source file is not a filesystem effect. */
function codeLines(file: string): string[] {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ""))
    .filter((line) => line.trim().length > 0);
}

/** A file is a WRITER when its code (not its comments) performs at least one mutating call. */
function isWriter(file: string): boolean {
  return codeLines(file).some((line) => MUTATION_API.test(line));
}

/** Every tracked executable file in the writer surfaces that mutates the filesystem, sorted. */
function writerFiles(): string[] {
  // TRACKED paths, deliberately — the same rule ISO-B3C2A holds the retired roots to: what the
  // REPOSITORY contains is what the guard classifies, so CI (a checkout) sees exactly the committed
  // writer set. A new writer therefore fails this suite as soon as it is committed for review.
  const tracked = execFileSync("git", ["ls-files", "-z", "--", ...WRITER_SURFACES], {
    cwd: ROOT,
    encoding: "utf8",
  })
    .split("\0")
    .filter((entry) => entry.length > 0)
    .filter((entry) => CODE_EXTENSIONS.some((extension) => entry.endsWith(extension)));
  return tracked.filter(isWriter).sort();
}

/** The mutating lines of one file, TRIMMED, for the per-writer domain assertions below. */
function mutationLines(file: string): string[] {
  return codeLines(file)
    .filter((line) => MUTATION_API.test(line))
    .map((line) => line.trim());
}

/**
 * THE SANCTIONED DURABLE WRITERS — the only executable code that may write a durable domain, each with
 * the ONE target it owns. Exact files only: no directories, no wildcards, no `scripts/**` exception.
 */
const SANCTIONED_DOMAIN_WRITERS: Record<string, string> = {
  "scripts/sync-runtime-assets.mjs":
    "<repo>/public/assets/** and <repo>/public/spokes/** — the generated runtime NAMESPACES: the shared platform tree, plus one collision-safe namespace per declared Spoke (ISO-B3C1 / S3E1C)",
  "scripts/generate-country-code-reference.mjs":
    "<selected deployment>/content/COUNTRY-CODES.md — the ONE generated deployment document (ISO-B3A)",
  "scripts/ci/change-scope.mjs": "$GITHUB_OUTPUT — the CI runner's own file, never repository state (ISO-B3B)",
  "scripts/release/release-construction.mjs":
    "the EMPTY destination directory the caller names — a release construction area outside the source repository. It reads committed bytes only, and writes no repository, deployment or generated state (R1B)",
  // ── FOUNDATION-B4B: the FIRST writers inside `src/**`, each owning exactly ONE installation ──────────
  // Establishment must run the platform's own TypeScript contract, so the mechanism cannot live in a
  // `.mjs` tool: it is an adapter, and these two are the only executable writers in application source.
  "src/adapters/installation/node-installation-target.ts":
    "the ONE target root establishment was constructed for, and nothing else: every path is resolved INSIDE that root by `absolutePathFor`, which refuses absolute paths, `..`, drive letters and anything resolving outside it (B4B)",
  "src/adapters/installation/node-operational-state-store.ts":
    "<installation root>/<capsule>/operational-state.json — THIS installation's own operational record, refused a location outside the root it was constructed for. The first legitimate writer of B4A's record (B4B)",
  "scripts/installation/platform-typescript.mjs":
    "OS temp only — a per-process TypeScript resolver it writes and removes before returning, so a plain Node process can run the platform's own TypeScript tooling (B4B)",
};

/**
 * THE TEST-SCRATCH WRITERS — tests and their support modules, each writing ONLY inside state the run
 * created: OS temp, the synthetic deployment copy, a copy of the selected deployment, or the ignored
 * report directory. The runtime manifest is what proves none of them reaches shipped state.
 */
const TEST_SCRATCH_WRITERS: Record<string, string> = {
  "tests/browser/scratch.mjs": "the guard: OS temp + `tests/browser/.report/` + the generated Spoke namespaces, refusing every other target",
  "tests/browser/matrix.mjs": "the synthetic deployment copy, `.report/`, OS temp and the generated Spoke namespaces a multi-Spoke scenario materialises — all via scratch.mjs",
  "tests/browser/cdp.mjs": "the headless-Chrome profile directory it created, under OS temp",
  "tests/browser/multihost.scenario.mjs":
    "OS temp (its disposable two-Spoke Installation) and `public/spokes/<segment>/**` — the GENERATED " +
    "namespaces it materialises FROM THE CANONICAL ASSET PLAN (never by inventing files) and removes for the " +
    "cross-host asset proof",
  "tests/browser/multi-hub.scenario.mjs":
    "OS temp (its disposable IDENTIFIED Installation, and the one-Hub/one-Spoke variant it proves separately) " +
    "plus `public/spokes/<composite segment>/**` — the GENERATED per-member namespaces it materialises FROM " +
    "THE CANONICAL ASSET PLAN (never by inventing files) and removes again, each through the harness's own " +
    "guarded writers. Both dev servers it starts are stopped and the platform identity it exported is " +
    "removed, on success and on failure (M3-P3C)",
  "tests/browser/required-location.scenario.mjs":
    "OS temp only: TWO disposable copies of the committed synthetic deployment it materialises, patches (one " +
    "required-Location policy and one regional page) and removes, each behind its own dev server — every write " +
    "through the harness's own guarded writers. The committed fixture, the selected deployment and the " +
    "repository are only ever READ (LOC1)",
  "tests/browser/parity-chrome.scenario.mjs":
    "OS temp only: TWO disposable copies of the committed synthetic deployment it materialises, patches (one " +
    "presenting the site-wide notice with a long contact address, one without it) and removes, each behind its " +
    "own dev server — every write through the harness's own guarded writers. The committed fixture, the " +
    "selected deployment and the repository are only ever READ (R1)",
  "tests/unit/spoke-host-aliases.test.ts":
    "OS temp only: disposable Installation roots (manifest + one site.config.json per Spoke) it creates for the " +
    "additional-hostname-claim proofs and removes afterwards — no deployment or committed fixture is touched (R1)",
  "tests/unit/spoke-switcher.test.ts":
    "OS temp only: disposable Installation roots it creates for the cross-Spoke switcher's build-time proofs " +
    "(including one manifest it rewrites to prove a structural refusal) and removes afterwards (R1)",
  "tests/support/four-spoke-installation.mjs":
    "OS temp only: the disposable FOUR-SPOKE Installation (one Hub: manifest, per-Spoke configuration, " +
    "dictionaries and content) it authors for the Hub-scoped switcher's browser proof, and the caller removes. " +
    "The committed synthetic fixture is only ever READ (R1)",
  "tests/browser/hub-switcher.scenario.mjs":
    "OS temp only: the disposable four-Spoke Installation (materialised through that fixture builder) and its " +
    "dev server; the browser reads the rendered pages. Every write goes through the harness's own guarded " +
    "writers, and the copy is removed when the run ends (R1)",
  "tests/browser/header-identity.scenario.mjs":
    "OS temp (the disposable copy of the committed synthetic deployment it re-configures for each identity " +
    "variant, and the disposable four-Spoke Installation that fixture builder authors) plus the GENERATED " +
    "`public/spokes/<spokeId>/**` namespaces it CLAIMS, materialises its OWN authored test artwork into " +
    "(each member's PRIMARY identity and — since FOUNDATION-UI-R1F — its COMPACT alternative, both authored by " +
    "this scenario) and removes again — namespace ROOT included, so no empty namespace is left for the " +
    "deployment's asset mirror to report. Every write goes through the harness's own guarded writers; the " +
    "committed fixtures, the " +
    "selected deployment and the generated PLATFORM namespace are only ever READ, and every dev server it " +
    "starts is stopped on success and on failure (UI-R1)",
  "tests/support/multihost-installation.mjs":
    "OS temp only: the disposable two-Spoke Installation it authors and the caller removes",
  "tests/support/multi-hub-installation.mjs":
    "OS temp only: the disposable IDENTIFIED (nested `spokeHubs`) Installation it authors — two Spoke Hubs " +
    "whose members repeat a local id — which the caller removes. It is the ONE fixture authority for the " +
    "multi-Hub runtime suite and the multi-Hub browser scenario, so the two prove the SAME Installation; " +
    "the repository's deployment state, generated catalogs and committed fixtures are only ever READ (M3-P3C)",
  "tests/unit/multihost-fixture-assets.test.ts":
    "OS temp only: the disposable two-Spoke Installation (through the fixture builder) and this suite's own " +
    "throwaway PUBLISHED catalogs, both removed when the suite ends. The repository's generated catalog, the " +
    "canonical deployment and the committed fixtures are only ever READ (M16/M17)",
  "tests/unit/spoke-request-context.test.ts":
    "OS temp (its disposable two-Spoke Installation) and the GENERATED `public/spokes/<segment>/**` namespaces it materialises and removes",
  "tests/architecture/deployment-root-guard.test.ts": "OS temp trees for its layout proofs",
  "tests/architecture/write-ownership-guard.test.ts": "OS temp trees for this suite's own proofs",
  "tests/unit/spoke-roots.test.ts":
    "synthetic Installation roots it creates under OS temp (legacy, explicit and deliberately invalid " +
    "collections) and removes afterwards — the canonical deployment and the committed authoring are " +
    "never touched (S3C1)",
  "tests/unit/spoke-composition.test.ts":
    "synthetic Installation roots and their per-Spoke site.config.json files it creates under OS temp " +
    "(legacy, explicit one-Spoke and multi-Spoke Installations) and removes afterwards — the canonical " +
    "deployment is never touched (S3D1A)",
  "tests/unit/spoke-resource-discovery.test.ts":
    "two synthetic Spoke resource trees under OS temp — authored pages and dictionaries it creates and " +
    "removes afterwards. The selected deployment, the canonical deployment and the committed fixtures " +
    "are only ever READ (S3E1B)",
  "tests/unit/spoke-asset-namespaces.test.ts":
    "synthetic Installation trees and their generated runtime namespaces under OS temp — the Spoke " +
    "namespace/collision proofs' own throwaway trees (legacy and explicit, one and two Spokes), removed by " +
    "exact ownership. The repository's real generated tree is never written (S3E1C)",
  "tests/unit/spoke-installation-selection.test.ts":
    "synthetic Installation roots under OS temp — the explicit one-Spoke selection proofs' own throwaway " +
    "trees (legacy, explicit one-Spoke and every refused form), removed by exact ownership. The canonical " +
    "deployment is only ever READ (S3F1)",
  "tests/unit/spoke-declaration-parity.test.ts":
    "synthetic Installation roots under OS temp — the build/S3C1 declaration-parity proofs' own throwaway " +
    "trees (every accepted and refused declaration shape, including links), removed by exact ownership. " +
    "The canonical deployment is only ever READ (S3F1)",
  "tests/unit/spoke-runtime-composite.test.ts":
    "OS temp for the composite GATE proof — one synthetic Installation root (a nested `spokeHubs` manifest " +
    "and the Spoke root it declares) it creates and removes by exact ownership. Every other case in that " +
    "suite is computed in memory from routing/runtime values built as data, so the canonical deployment " +
    "and the committed authoring are only ever READ (M3-P2)",
  "tests/unit/spoke-multi-hub-runtime.test.ts":
    "ONE disposable TWO-HUB nested Installation under OS temp — the multi-Hub end-to-end proofs' own " +
    "throwaway tree (its members' configurations, dictionaries, pages and artwork, plus the variants that " +
    "must be refused) it creates and removes by exact ownership. The canonical deployment and the committed " +
    "authoring are only ever READ (M3-P3 §10)",
  "tests/unit/installation-runtime-context.test.ts":
    "synthetic Installation trees under OS temp — the two-Spoke runtime-context proofs' own throwaway " +
    "Installations (alpha/beta plus legacy and one-Spoke variants: manifests, configurations, dictionaries, " +
    "pages and role artwork), removed by exact ownership. The canonical deployment is only ever READ (S3F2A)",
  "tests/unit/server-composition-context.test.ts":
    "synthetic one-Spoke Installation trees under OS temp — the M13 server-composition isolation proofs' own " +
    "throwaway Installations (alpha/beta: a manifest, configuration, dictionaries and one authored page), " +
    "removed by exact ownership. The running deployment is only ever READ (M13)",
  "tests/unit/notice-replacement.test.ts":
    "disposable copies of the synthetic deployment under OS temp — the notice-replacement proofs' own " +
    "throwaway Installations (manifest, configuration, dictionaries and the two authored pages each copy " +
    "adds), removed by exact ownership. The committed fixture and the selected deployment are only ever " +
    "READ (R2)",
  "tests/unit/context-metadata-isolation.test.ts":
    "synthetic one-Spoke Installation trees under OS temp — the M14 client-projection / OpenGraph / sitemap / " +
    "robots isolation proofs' own throwaway Installations (alpha/beta: a manifest, configuration, " +
    "dictionaries and authored pages), removed by exact ownership. The running deployment is only ever READ (M14)",
  "tests/unit/runtime-asset-ownership-resolver.test.ts":
    "disposable namespace directories under OS temp — the ownership resolver's own throwaway trees " +
    "(a platform namespace plus two contexts' own, with the same basename deliberately in two of them), " +
    "removed by exact ownership. No served output root is written and the canonical deployment is only " +
    "ever READ (S3F2A2-R1)",
  "tests/integration/json-page-rendering.test.ts": "the synthetic deployment's JSON page tree (ISO-H2)",
  "tests/support/synthetic-deployment-root.ts": "the synthetic deployment's disposable copy in OS temp (ISO-H2)",
  "tests/support/disposable-deployment.ts": "a byte-identical COPY of the selected deployment in OS temp (ISO-B3C2B)",
  "tests/unit/asset-source-resolution.test.ts": "OS temp asset trees it creates",
  "tests/unit/authoring-source-discovery.test.ts": "OS temp authoring trees it creates",
  "tests/unit/change-scope.test.ts": "OS temp trees and `$GITHUB_OUTPUT` files",
  "tests/unit/country-code-generator-deployment-root.test.ts": "OS temp deployment trees the generator writes into",
  "tests/unit/dictionary-precedence.test.ts": "the synthetic deployment's dictionary tree",
  "tests/unit/i18n-dictionary-discovery.test.ts": "OS temp dictionary trees it creates",
  "tests/unit/i18n-site-overlay.test.ts": "OS temp dictionary trees it creates",
  "tests/unit/page-sources.test.ts": "the synthetic deployment's page tree",
  "tests/unit/release-construction.test.ts":
    "synthetic source repositories and construction destinations under OS temp — the release mechanism proved on disposable repositories, never on this one (R1B)",
  "tests/unit/runtime-asset-lifecycle.test.ts": "OS temp deployment and runtime trees it creates",
  "tests/support/installation-establishment-fixture.ts":
    "disposable platforms, releases, seeds and target roots under OS temp — the establishment proof's own " +
    "throwaway tree, removed by exact ownership (B4B)",
  "tests/integration/foundation-installation-bootstrap.test.ts":
    "OS temp target roots and one deliberately half-written materialisation, plus the installation's own " +
    "generated asset mirror when the established tree is proved self-contained (B4B)",
  "tests/integration/foundation-installation-operational-state.test.ts":
    "disposable target roots it establishes into, and the seeded capsule whose ignore rule it proves (B4B)",
  "tests/integration/foundation-installation-cli.test.ts":
    "disposable target roots it establishes into through the command line (B4B)",
  // FOUNDATION-MULTISITE-M20 — the multi-Spoke establishment proof and the authoring-directory contract
  // write only disposable trees of their own. The REAL capsule is COPIED into OS temp and only ever READ
  // (the copy is what establishment is given), and the authoring contract builds its own throwaway tree.
  "tests/integration/foundation-installation-multispoke.test.ts":
    "OS temp seeds — byte-faithful copies of the real capsule, which is only ever read — and the disposable " +
    "target roots it establishes into (M20)",
  "tests/unit/page-authoring-directory-contract.test.ts": "OS temp authoring trees it creates (M20)",
  // FOUNDATION-MULTISITE-M20 Part B — the inspection-policy proofs build DISPOSABLE capsules in OS temp
  // (a manifest plus two Spoke roots that state an origin), and copy nothing out of this repository.
  "tests/unit/spoke-inspection-hosts.test.ts":
    "OS temp capsules it creates — a manifest and two Spoke roots with their own origins (M20)",
  "tests/unit/site-page-isolation.test.ts": "the synthetic deployment's page tree",
  "tests/unit/synthetic-deployment-lifecycle.test.ts":
    "the synthetic deployment copies it materialises and removes, plus the look-alike decoys proving the " +
    "removal is exact rather than a pattern (ISO-B3C2B-A1)",
  "deployment/tests/integration/page-authoring.test.ts":
    "a disposable COPY of the selected deployment (ISO-B3C2B); the shipped tree is proved unchanged",
};

/** Temporary trees this suite creates, removed afterwards. */
const trees: string[] = [];

function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

describe("the executable writer inventory is explicit", () => {
  /** Every classified writer, in one sorted list: exact files, never a directory or a wildcard. */
  const classified = [
    ...Object.keys(SANCTIONED_DOMAIN_WRITERS),
    ...Object.keys(TEST_SCRATCH_WRITERS),
  ].sort();

  it("lists exactly the writers that exist — a new one must be classified before it can merge", () => {
    for (const file of classified) {
      expect(file, `${file} must be an exact file, never a pattern`).not.toContain("*");
    }
    expect(
      writerFiles(),
      "The set of executable filesystem writers changed. Classify the difference above: a DURABLE writer " +
        "belongs in SANCTIONED_DOMAIN_WRITERS with the ONE domain it owns, and test scratch belongs in " +
        "TEST_SCRATCH_WRITERS (FOUNDATION-DEPLOYMENT-ISO-B3C2B).",
    ).toEqual(classified);
  });

  it("names the sanctioned durable domains, each as ONE document/domain and no more", () => {
    expect(Object.keys(SANCTIONED_DOMAIN_WRITERS)).toHaveLength(7);
    expect(SANCTIONED_DOMAIN_WRITERS["scripts/sync-runtime-assets.mjs"]).toContain("public/assets");
    expect(SANCTIONED_DOMAIN_WRITERS["scripts/generate-country-code-reference.mjs"]).toContain(
      "COUNTRY-CODES.md",
    );
    expect(SANCTIONED_DOMAIN_WRITERS["scripts/ci/change-scope.mjs"]).toContain("GITHUB_OUTPUT");
    // R1B — the release tool names its destination as the ONE thing it writes, and writes nothing else.
    expect(SANCTIONED_DOMAIN_WRITERS["scripts/release/release-construction.mjs"]).toContain("destination");
    // B4B — establishment's two writers, each naming the ONE installation it may touch.
    expect(SANCTIONED_DOMAIN_WRITERS["src/adapters/installation/node-installation-target.ts"]).toContain(
      "target root",
    );
    expect(SANCTIONED_DOMAIN_WRITERS["src/adapters/installation/node-operational-state-store.ts"]).toContain(
      "operational-state.json",
    );
    expect(SANCTIONED_DOMAIN_WRITERS["scripts/installation/platform-typescript.mjs"]).toContain("OS temp");
  });

  it("keeps Foundation application code free of writers — except establishment's two, each in one root", () => {
    // B4B is the phase that first writes an installation, and the mechanism must run the platform's own
    // TypeScript contract, so it cannot be a `.mjs` script. `src/**` therefore has EXACTLY two writers, both
    // in the installation adapter, and the guard above states the ONE domain each owns. Nothing else in
    // application source may mutate anything, ever.
    expect(writerFiles().filter((file) => file.startsWith("src/"))).toEqual([
      "src/adapters/installation/node-installation-target.ts",
      "src/adapters/installation/node-operational-state-store.ts",
    ]);

    // The boundary is code, not documentation: the target's writes are resolved by its own guard …
    const target = readFileSync(
      path.join(ROOT, "src", "adapters", "installation", "node-installation-target.ts"),
      "utf8",
    );
    expect(target).toContain("absolutePathFor");
    expect(target).toContain("is outside the target root");
    // … and the record's location is refused unless it is inside the installation it describes.
    const store = readFileSync(
      path.join(ROOT, "src", "adapters", "installation", "node-operational-state-store.ts"),
      "utf8",
    );
    expect(store).toContain("INSTALLATION-LOCAL");
    expect(store).toContain("path.relative");
  });
});

describe("the generic test project cannot reach real deployment state", () => {
  /** The deployment the BUILD selects for this repository — asked with a clean environment. */
  const shipped = resolveDeploymentForBuild({}, ROOT);

  it("runs for a deployment root in OS temp, and never for the installed one (ISO-H2)", () => {
    expect(shipped.layout).toBe("capsule");
    // Where the capsule WOULD be is the authority's answer too — never a path this test composes.
    expect(path.resolve(shipped.root)).toBe(path.resolve(capsuleDirectory(ROOT)));
    const selected = deploymentPaths();
    expect(selected.layout).toBe("override");
    expect(selected.root.startsWith(tmpdir()), selected.root).toBe(true);
    expect(path.resolve(selected.root)).not.toBe(path.resolve(shipped.root));
  });

  it("asks the ONE authority for that identity, so a generic write cannot reach the capsule", () => {
    // Every path a generic test may write is derived from the selection above: the synthetic deployment's
    // own tree (`markdownPagesRoot`, `jsonPagesRoot`, `dictionaryDirectory`, `assetSourceRoot`) is inside
    // it, which is why `tests/unit/site-page-isolation.test.ts` and `json-page-rendering.test.ts` may plant
    // fixtures at all. `publicAssetsDirectory` is deliberately the PLATFORM path: it is generated output,
    // owned by the runtime installer (see the sanctioned writers above).
    const selected = deploymentPaths();
    for (const surface of [
      selected.siteConfigFile,
      selected.dictionaryDirectory,
      selected.markdownPagesRoot,
      selected.jsonPagesRoot,
      selected.assetSourceRoot,
    ]) {
      expect(surface.startsWith(selected.root), surface).toBe(true);
      expect(surface.startsWith(tmpdir()), surface).toBe(true);
    }
  });
});

describe("the browser harness writes only into its own scratch", () => {
  const shipped = resolveDeploymentForBuild({}, ROOT);

  it("refuses shipped deployment state — loudly, and before anything is written", () => {
    const shippedConfig = path.join(shipped.root, "site.config.json");
    expect(() => assertHarnessWritable(shippedConfig)).toThrow(/FOUNDATION-DEPLOYMENT-ISO-B3C2B/);
    expect(() => assertHarnessWritable(shippedConfig)).toThrow(/deployment state it does not own/);
    expect(() => assertHarnessWritable(shippedConfig)).toThrow(/NOTHING was written/);
    // The installed deployment's own content is protected — wherever the authority says it lives…
    expect(() => assertHarnessWritable(path.join(shipped.root, "content", "pages", "x.md"))).toThrow(
      /does not own/,
    );
    // …and so is the deployment THIS process selected (the synthetic one in the generic project).
    expect(() => assertHarnessWritable(path.join(deploymentPaths().root, "site.config.json"))).toThrow(
      /does not own/,
    );
  });

  it("refuses the repository itself: a harness write target is temp state or its own report directory", () => {
    for (const target of [
      path.join(ROOT, "site.config.json"),
      path.join(ROOT, "public", "assets", "icon.svg"),
      path.join(ROOT, "src", "config", "deployment-root.ts"),
      path.join(ROOT, "tests", "browser", "matrix.mjs"),
    ]) {
      expect(() => assertHarnessWritable(target), target).toThrow(/outside the two domains it owns/);
    }
  });

  it("accepts OS temp, `tests/browser/.report/` and the GENERATED Spoke namespaces — and nothing else", () => {
    // M16 — the third domain is `public/spokes/**`: GENERATED, git-ignored output (never deployment state)
    // that a multi-Spoke proof must materialise for the SECOND Spoke, because "Alpha's artwork is served on
    // Alpha's host and REFUSED on Beta's" is only observable when Beta's host has its own directory.
    expect(harnessWriteRoots().allowed).toEqual([
      tmpdir(),
      path.join(ROOT, "tests", "browser", ".report"),
      path.join(ROOT, "public", "spokes"),
    ]);
    const probe = path.join(tmpdir(), "foundation-harness-probe.json");
    expect(assertHarnessWritable(probe)).toBe(probe);
    expect(() => assertHarnessWritable(path.join(ROOT, "tests", "browser", ".report", "x.json"))).not.toThrow();
  });

  it("routes every mutating call in the harness through the guard module", () => {
    const harness = readFileSync(path.join(ROOT, "tests", "browser", "matrix.mjs"), "utf8");
    const imported = (
      harness.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/scratch\.mjs"/)?.[1] ?? ""
    )
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0)
      .sort();
    expect(imported).toEqual(["cpSync", "mkdir", "rm", "rmdir", "rmSync", "writeFile"].sort());

    const mutating = [
      "writeFile",
      "writeFileSync",
      "appendFile",
      "appendFileSync",
      "mkdir",
      "mkdirSync",
      "rm",
      "rmSync",
      "rmdir",
      "rmdirSync",
      "unlink",
      "unlinkSync",
      "rename",
      "renameSync",
      "copyFile",
      "copyFileSync",
      "cp",
      "cpSync",
      "createWriteStream",
      "truncate",
      "chmod",
      "symlink",
    ];
    // No mutating operation may be imported from Node's filesystem modules in this harness…
    for (const statement of harness.matchAll(/import\s*\{([^}]*)\}\s*from\s*"node:fs(?:\/promises)?"/g)) {
      for (const name of statement[1].split(",").map((entry) => entry.trim())) {
        expect(mutating, `${name} must be imported from ./scratch.mjs, not node:fs`).not.toContain(name);
      }
    }
    // …and the SHIPPED configuration is bound for reading only (the definition and the one read).
    expect(harness.match(/shippedConfigPath\(/g) ?? []).toHaveLength(2);
  });
});

describe("each sanctioned writer stays inside the ONE domain it owns", () => {
  it("the runtime asset installer writes only through its runtime root, never the deployment's sources", () => {
    const script = "scripts/sync-runtime-assets.mjs";
    const sanctionedShapes = [
      /^mkdirSync\(runtimeRoot,/,
      // S3E1C — a namespace directory is created before its files are written (the platform namespace is
      // bootstrapped above; a Spoke's own namespace is created on demand).
      /^mkdirSync\(path\.dirname\(target\), { recursive: true }\);$/,
      /^copyFileSync\(source, target\);$/,
      /^rmSync\(inside\(relative\),/,
      /^rmdirSync\(full\);$/,
      // …and a generated REGION that no longer holds a namespace is unlinked the same way (its container).
      /^rmdirSync\(directory\);$/,
      // M16/M17 (Defect B) — the generated runtime-asset catalog: this BUILD's own derived record of what it
      // installed and how large each file is, so a serverless page render never has to probe `public/**`
      // (which the function does not carry). It is written to the ONE generated source module the runtime
      // imports, never into any deployment's sources.
      /^mkdirSync\(path\.dirname\(catalogFile\), { recursive: true \}\);$/,
      /^writeFileSync\(catalogFile, report\.expected, "utf8"\);$/,
    ];
    const lines = mutationLines(script);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(
        sanctionedShapes.some((shape) => shape.test(line)),
        `an unreviewed write appeared in ${script}: ${line}`,
      ).toBe(true);
      expect(line, `must never write a deployment source: ${line}`).not.toMatch(
        /deploymentRoot|sourceRoot|assetSourceRoot/,
      );
    }
    // …and the platform path it installs into is the root-anchored generated mirror (ISO-B3C1).
    expect(readFileSync(path.join(ROOT, script), "utf8")).toContain(
      'const RUNTIME_DIR = "public/assets";',
    );
    // …and the catalog it publishes is the ONE generated source module the runtime imports, so the tree it
    // installs and the belief the runtime holds are produced by the same run (M16/M17 Defect B).
    expect(readFileSync(path.join(ROOT, script), "utf8")).toContain(
      'const CATALOG_FILE = path.join(ROOT, "src", "config", "generated", "runtime-asset-catalog.json");',
    );
    // S3E1C — the write boundary is the generated runtime BASE (`public/`), so a Spoke's namespace is
    // inside it while no deployment source ever is, and the namespace model comes from the ONE module that
    // owns the runtime segment (a second spelling would let the installer and the runtime disagree).
    const sourceText = readFileSync(path.join(ROOT, script), "utf8");
    expect(sourceText).toContain("const base = path.resolve(path.dirname(runtimeRoot));");
    expect(sourceText).toContain("spoke-runtime-segment.mjs");
  });

  it("the country-code generator writes ONE deployment document, and resolves it through the authority", () => {
    const script = "scripts/generate-country-code-reference.mjs";
    const source = readFileSync(path.join(ROOT, script), "utf8");
    const lines = mutationLines(script);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^writeFileSync\(target\.document,/);
    // The location is deployment-RELATIVE and comes from the shared selector — never from a literal.
    // That it is never anchored to the repository is asserted where the generator's own deployment
    // contract is proved (`tests/unit/country-code-generator-deployment-root.test.ts`), and by the
    // generic-tree rule in `tests/architecture/deployment-root-guard.test.ts` — not repeated here.
    expect(source).toContain('export const COUNTRY_CODES_DOCUMENT = path.join("content", "COUNTRY-CODES.md");');
    expect(source).toContain('from "../src/config/deployment-build.mjs"');
  });

  it("the CI classifier writes only the runner's own output file", () => {
    const script = "scripts/ci/change-scope.mjs";
    const lines = mutationLines(script);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^appendFileSync\(options\.githubOutput,/);
  });
});

describe("a deployment's writable authoring test takes a disposable copy", () => {
  const ENV_NAMES = [
    "FOUNDATION_DEPLOYMENT_ROOT",
    "FOUNDATION_DEPLOYMENT_LAYOUT",
    "FOUNDATION_DEPLOYMENT_CONFIG",
  ] as const;

  it("copies the selected deployment byte-for-byte into OS temp, and selects the COPY", () => {
    const saved = ENV_NAMES.map((name) => [name, process.env[name]] as const);
    const selected = resolveDeploymentForBuild(process.env, ROOT);
    const copy = selectDisposableDeploymentCopy();
    try {
      expect(copy.sourceRoot).toBe(selected.root);
      expect(path.resolve(copy.root)).not.toBe(path.resolve(selected.root));
      expect(copy.root.startsWith(tmpdir()), copy.root).toBe(true);

      // FIDELITY: the copy is the deployment, so an acceptance assertion made against it means what it
      // says about the real one — which is the only reason a copy may stand in for it.
      expect(
        productionStateDrift(
          captureProductionStateManifest(selected.root),
          captureProductionStateManifest(copy.root),
        ),
      ).toEqual([]);

      // …and the authority now answers with the copy, which is what the app modules will read.
      const now = resolveDeploymentForBuild(process.env, ROOT);
      expect(now.layout).toBe("override");
      expect(path.resolve(now.root)).toBe(path.resolve(copy.root));
    } finally {
      copy.cleanup();
      for (const [name, value] of saved) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
    // The copy is disposable: the run deletes it, and a leaked copy can only ever be temp garbage.
    expect(existsSync(copy.root)).toBe(false);
  });

  it("is the ONE writable deployment test, and it proves the shipped tree unchanged itself", () => {
    // The deployment suite lives with the deployment, so its file is located THROUGH the authority's
    // answer for the installed deployment — never by composing a repository path here.
    const suite = path.join(
      resolveDeploymentForBuild({}, ROOT).root,
      "tests",
      "integration",
      "page-authoring.test.ts",
    );
    const source = readFileSync(suite, "utf8");
    expect(source).toContain(
      'import { selectDisposableDeploymentCopy } from "../../../tests/support/disposable-deployment";',
    );
    // It refuses to run unless the runtime authority answers with the copy…
    expect(source).toMatch(/copyPaths\.root/);
    expect(source).toMatch(/disposable\.root/);
    // …and it asserts the REAL deployment's bytes afterwards.
    expect(source).toContain("captureProductionStateManifest(disposable.sourceRoot)");
    // That the file composes no repository path of its own is asserted by the generic-tree rule in
    // `tests/architecture/deployment-root-guard.test.ts`, which applies to the whole generic tree.
  });
});

describe("the runtime production-state proof is wired into both projects", () => {
  it("brackets each Vitest project with the manifest global setup", () => {
    const config = readFileSync(path.join(ROOT, "vitest.config.mts"), "utf8");
    expect(
      config.match(/globalSetup: \["tests\/setup\/production-state-integrity\.ts"\]/g) ?? [],
    ).toHaveLength(2);
  });

  it("manifests exactly the authored surfaces an owner's write would damage", () => {
    const manifest = readFileSync(
      path.join(ROOT, "tests", "support", "production-state-manifest.ts"),
      "utf8",
    );
    for (const surface of [
      '"site.config.json"',
      '"config"',
      '"content/pages"',
      '"content/assets"',
      '"content/COUNTRY-CODES.md"',
    ]) {
      expect(manifest, `the manifest must cover ${surface}`).toContain(surface);
    }
    const setup = readFileSync(
      path.join(ROOT, "tests", "setup", "production-state-integrity.ts"),
      "utf8",
    );
    expect(setup).toContain("captureProductionStateManifest");
    expect(setup).toContain("productionStateDrift");
    // The proof fails the RUN, not just a log line.
    expect(setup).toMatch(/throw new Error\(message\)/);
  });
});

describe("the manifest notices every kind of drift (the proof above rests on this)", () => {
  it("reports an added, a modified and a removed authored file", () => {
    const root = tempTree("foundation-manifest-probe-");
    mkdirSync(path.join(root, "content", "assets"), { recursive: true });
    mkdirSync(path.join(root, "content", "pages"), { recursive: true });
    writeFileSync(path.join(root, "site.config.json"), "{}\n", "utf8");
    writeFileSync(path.join(root, "content", "assets", "logo.svg"), "<svg/>\n", "utf8");

    const before = captureProductionStateManifest(root);
    writeFileSync(path.join(root, "site.config.json"), '{ "changed": true }\n', "utf8");
    writeFileSync(path.join(root, "content", "pages", "zz-probe.md"), "# Probe\n", "utf8");
    rmSync(path.join(root, "content", "assets", "logo.svg"), { force: true });

    expect(productionStateDrift(before, captureProductionStateManifest(root))).toEqual([
      "content/assets/logo.svg (removed)",
      "content/pages/zz-probe.md (added)",
      "site.config.json (modified)",
    ]);
  });
});
