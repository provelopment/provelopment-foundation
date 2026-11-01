/**
 * THE REQUEST-CONTEXT SEAM, IN ALL THREE INSTALLATION SHAPES (FOUNDATION-MULTISITE-M16)
 * =====================================================================================
 *
 * `runtimeContextForRequestHost` is where "which Spoke is this request?" becomes an explicit context, and the
 * three installation shapes must stay distinct:
 *
 *   legacy / explicit ONE Spoke   the Installation's sole Spoke answers EVERY host — the accepted behaviour,
 *                                 unchanged for development, preview and test hosts;
 *   explicit MULTI                an EXACT claim selects one Spoke; an unclaimed host answers NOTHING;
 *   currentBuildRuntimeContext()  still REFUSES a multi-Spoke Installation (no weakening, no default).
 *
 * The two-Spoke Installation is the DISPOSABLE fixture (`tests/support/multihost-installation.mjs`), so the
 * assertion is about a real Installation the accepted authorities resolve, not about a stub.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { materializeMultihostInstallation } from "../support/multihost-installation.mjs";
import {
  captureProductionStateManifest,
  productionStateDrift,
} from "../support/production-state-manifest";

const repositoryRoot = process.cwd();
const fixture = materializeMultihostInstallation({ repositoryRoot });
const savedRoot = process.env.FOUNDATION_DEPLOYMENT_ROOT;

/** The two-Spoke Installation's OWN routing description, exactly as the build inlines it. */
const MULTI_ROUTING = {
  mode: "multi",
  spokes: fixture.spokes.map((spoke) => ({
    id: spoke.id,
    segment: spoke.segment,
    canonicalOrigin: spoke.canonicalOrigin,
  })),
};

beforeEach(() => {
  vi.resetModules();
  // `vi.stubEnv` + `vi.unstubAllEnvs` (not raw assignment): the process environment is SHARED by every test
  // file in a worker, so a selection this suite makes must be undone by the framework rather than by hand —
  // a leaked root would describe a DELETED temporary Installation to the next file.
  vi.stubEnv("FOUNDATION_DEPLOYMENT_ROOT", fixture.root);
  vi.stubEnv("FOUNDATION_DEPLOYMENT_MODE", "multi");
  vi.stubEnv("FOUNDATION_DEPLOYMENT_HOST_ROUTING", JSON.stringify(MULTI_ROUTING));
});

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterAll(() => {
  fixture.cleanup();
  // R04-C16 §4.6/§4.7 — cleanup is PROVED, not assumed, and the proof is ATTRIBUTABLE: the disposable runtime
  // tree is gone with the Installation, and none of this suite's repository namespace directories exists.
  expect(existsSync(runtimeBase), "the disposable runtime tree outlived the fixture").toBe(false);
  const drift = productionStateDrift(
    sharedRuntimeBefore,
    captureProductionStateManifest(repositoryRoot, SHARED_RUNTIME_SURFACES),
  );
  expect(
    drift,
    `this suite disturbed the repository's generated runtime tree: ${drift.join(", ")}`,
  ).toEqual([]);
  for (const surface of SHARED_RUNTIME_SURFACES) {
    expect(existsSync(path.join(repositoryRoot, surface)), surface).toBe(false);
  }
});

/**
 * R04-C16 — THE REPOSITORY'S GENERATED RUNTIME TREE IS NOT THIS SUITE'S FIXTURE SPACE.
 *
 * This suite used to materialise `public/spokes/<segment>/assets/**` in the REPOSITORY for the duration of the
 * run. That copy is generated output, but the repository's copy is *shared*: `deployment/tests/unit/
 * asset-install` and `asset-taxonomy-mirror` assert the byte-identity of exactly that tree, so while this
 * suite wrote and then recursively removed the directories, those suites failed — a verification defect in
 * the harness, not a defect in the asset mirror (C15 grouped evidence).
 *
 * The same experiment now runs inside the DISPOSABLE Installation instead: the canonical plan is installed into
 * `<fixture>/public/**`, and the composition is handed a context whose OWN namespaces point there. That is the
 * seam M13 already establishes — "a resolver built from that context's own `runtimeAssetNamespaces`" — so the
 * real composition, the real validator and the real diagnostics are exercised, and nothing about the shared
 * repository tree is touched. `fixture.cleanup()` removes the whole tree, on success and on failure alike, and
 * the repository's generated tree is measured before and after to PROVE this suite neither adds nor removes a
 * file there (§4.7).
 */
/**
 * R04-C16 §4.7 — THE REPOSITORY'S SHARED RUNTIME STATE, MEASURED SOUNDLY.
 *
 * The surfaces are this suite's OWN namespace directories, because those are the only repository paths this
 * fixture could ever create (the fixture's Spoke segments are unique to it). A whole-tree diff of
 * `public/**` would be UNSOUND here: other suites legitimately write into that shared tree while this file
 * runs in parallel, so a change would be attributed to this suite without evidence. Scoping the comparison to
 * the namespaces this suite owns keeps the proof attributable — and the platform mirror is already guarded by
 * the deployment asset suites and the runtime integrity gate.
 */
const SHARED_RUNTIME_SURFACES = fixture.spokes.map((spoke) =>
  path.join("public", "spokes", spoke.segment),
);
const sharedRuntimeBefore = captureProductionStateManifest(repositoryRoot, SHARED_RUNTIME_SURFACES);
/** The disposable runtime base: inside the Installation this suite owns, never the repository. */
const runtimeBase = path.join(fixture.root, "public");

/**
 * Install the CANONICAL asset plan into the disposable runtime base.
 *
 * The rows are the same plan `assets:sync` installs and the build-time catalog is derived from, and each row's
 * `to` is relative to its namespace directory — so what lands here is exactly what the platform would have
 * generated, only somewhere the repository cannot see.
 */
beforeAll(async () => {
  const { buildPlan, runtimeNamespaces } = await import("../../scripts/sync-runtime-assets.mjs");
  const rows = buildPlan(fixture.root);
  for (const namespace of runtimeNamespaces(fixture.root)) {
    const directory = path.join(runtimeBase, namespace.directory);
    mkdirSync(directory, { recursive: true });
    for (const row of rows.filter((candidate) => candidate.namespace === namespace.key)) {
      const target = path.join(directory, row.to);
      // A plan row's `from` is relative to the INSTALLATION root (a Spoke authors its own tree there).
      const source = path.isAbsolute(row.from) ? row.from : path.join(fixture.root, row.from);
      mkdirSync(path.dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
});

/**
 * The REAL context, with its artwork namespaces re-based onto the disposable tree.
 *
 * Nothing else about the context is synthesised: identity, segment, hostname claims, config and resources all
 * still come from the accepted runtime authority, so the composition judges the same context it always did.
 */
function withDisposableRuntimeNamespaces<T extends { runtimeAssetNamespaces: readonly { directory: string }[] }>(
  context: T,
): T {
  return {
    ...context,
    runtimeAssetNamespaces: context.runtimeAssetNamespaces.map((namespace) => ({
      ...namespace,
      directory: path.join(
        runtimeBase,
        path.relative(path.join(repositoryRoot, "public"), namespace.directory),
      ),
    })),
  };
}

describe("a MULTI-Spoke Installation", () => {
  it("resolves each claimed hostname to ITS OWN context", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    const alpha = runtimeContextForRequestHost("alpha.localhost");
    const beta = runtimeContextForRequestHost("beta.localhost");

    expect(alpha?.id).toBe("alpha");
    expect(beta?.id).toBe("beta");
    expect(alpha?.runtimeSegment).toBe("alpha");
    expect(alpha?.siteConfig.url).toBe("https://alpha.localhost");
    expect(beta?.siteConfig.url).toBe("https://beta.localhost");
    expect(alpha?.siteConfig.name).not.toBe(beta?.siteConfig.name);
    // …and each context owns its OWN authored trees, so their dictionaries and pages cannot be shared.
    expect(alpha?.resources.spokeRoot).not.toBe(beta?.resources.spokeRoot);
    expect(alpha?.resources.markdownPagesRoot).toContain("alpha");
    expect(beta?.resources.markdownPagesRoot).toContain("beta");
  });

  it("answers an UNCLAIMED host with NOTHING", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    expect(runtimeContextForRequestHost("unknown.localhost")).toBeNull();
    expect(runtimeContextForRequestHost("localhost:3000")).toBeNull();
    expect(runtimeContextForRequestHost("alpha.localhost.attacker.test")).toBeNull();
    expect(runtimeContextForRequestHost(null)).toBeNull();
    expect(runtimeContextForRequestHost(undefined)).toBeNull();
  });

  it("selects a context BY RUNTIME SEGMENT for the internal route, and by nothing else", async () => {
    const { runtimeContextForSegment } = await import("@/config/spoke-request");

    expect(runtimeContextForSegment("alpha")?.id).toBe("alpha");
    expect(runtimeContextForSegment("beta")?.id).toBe("beta");
    // An undeclared segment answers nothing: no default, no first, no fallback.
    expect(runtimeContextForSegment("gamma")).toBeNull();
    expect(runtimeContextForSegment("")).toBeNull();
  });

  it("still REFUSES the one-Spoke compatibility seam — never weakened into a default", async () => {
    const { currentBuildRuntimeContext } = await import("@/config/installation-runtime");

    expect(() => currentBuildRuntimeContext()).toThrow(/EXACTLY ONE Spoke/);
    expect(() => currentBuildRuntimeContext()).toThrow(/no default Spoke and no manifest-order rule/);
  });

  it("gives each Spoke artwork namespaces of its own, platform first and never a neighbour's", async () => {
    const { runtimeContextForSegment } = await import("@/config/spoke-request");

    const alpha = runtimeContextForSegment('alpha'); if (alpha === null) throw new Error('alpha');
    const beta = runtimeContextForSegment('beta'); if (beta === null) throw new Error('beta');
    const urls = (context: { runtimeAssetNamespaces: readonly { urlBase: string }[] }) => context.runtimeAssetNamespaces.map((namespace) => namespace.urlBase);

    expect(urls(alpha)[0]).toBe("/assets");
    expect(urls(alpha)).toContain("/spokes/alpha/assets");
    expect(urls(alpha)).not.toContain("/spokes/beta/assets");
    expect(urls(beta)).toContain("/spokes/beta/assets");
    expect(urls(beta)).not.toContain("/spokes/alpha/assets");
  });

  it("isolates the static inventory by runtime segment while the public pathname is identical", async () => {
    const { runtimeContextForSegment } = await import("@/config/spoke-request");
    const { spokeServerComposition, staticParamsForContext } = await import(
      "@/app/[[...segments]]/server-composition"
    );

    const inventories = [];
    for (const segment of ["alpha", "beta"]) {
      const real = runtimeContextForSegment(segment); if (real === null) throw new Error("no context for " + segment);
      // R04-C16 — the composition judges THIS context's own namespaces (M13), so re-basing them onto the
      // disposable Installation is enough: no file is written under the repository's `public/` tree.
      const context = withDisposableRuntimeNamespaces(real);
      // Both halves are asserted, so a relocation that silently did nothing cannot pass: every namespace the
      // composition will read is INSIDE the disposable tree, and it is actually populated.
      expect(
        context.runtimeAssetNamespaces.every((namespace) => namespace.directory.startsWith(runtimeBase)),
        `a namespace still points at the repository: ${context.runtimeAssetNamespaces.map((n) => n.directory).join(", ")}`,
      ).toBe(true);
      for (const namespace of context.runtimeAssetNamespaces) {
        expect(existsSync(namespace.directory), namespace.directory).toBe(true);
      }
      const params = await staticParamsForContext(spokeServerComposition(context));
      inventories.push({
        segment,
        paths: params.map((param) => param.segments.join("/")),
        internal: params.map((param) => `/~spoke/${segment}/${param.segments.join("/")}`),
      });
    }

    // The SAME logical coordinates exist in BOTH contexts…
    expect(inventories[0].paths).toContain("ww/en/about");
    expect(inventories[1].paths).toContain("ww/en/about");
    // …where they are DISTINCT internal addresses, distinguished by the runtime segment alone.
    expect(inventories[0].internal).not.toEqual(inventories[1].internal);
    expect(new Set(inventories[0].internal).size).toBe(inventories[0].internal.length);
    expect(new Set(inventories[1].internal).size).toBe(inventories[1].internal.length);
    // …and a route only ONE Spoke authors never appears in the other's inventory.
    expect(inventories[0].paths.some((path) => path.includes("alpha-only"))).toBe(true);
    expect(inventories[0].paths.some((path) => path.includes("beta-only"))).toBe(false);
    expect(inventories[1].paths.some((path) => path.includes("beta-only"))).toBe(true);
  });
});

describe("a ONE-Spoke Installation keeps the accepted behaviour", () => {
  it("answers EVERY host with the Installation's sole Spoke (development, preview and test hosts included)", async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env.FOUNDATION_DEPLOYMENT_ROOT = savedRoot;
    delete process.env.FOUNDATION_DEPLOYMENT_MODE;
    delete process.env.FOUNDATION_DEPLOYMENT_HOST_ROUTING;

    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");
    const { currentBuildRuntimeContext } = await import("@/config/installation-runtime");

    const context = runtimeContextForRequestHost("literally-any-host.example");
    if (context === null) throw new Error("expected a Spoke context");
    expect(runtimeContextForRequestHost("localhost:3000")?.id).toBe(context.id);
    // …and the compatibility seam agrees, because it IS that same sole Spoke.
    expect(currentBuildRuntimeContext().id).toBe(context.id);
    expect(currentBuildRuntimeContext().siteConfig.url).toBe(context.siteConfig.url);
  });
});

describe("M17 — asset generation covers EVERY declared Spoke", () => {
  it("mirrors each Spoke's own authored artwork into its OWN namespace, with the platform shared", async () => {
    const { buildPlan, runtimeNamespaces } = await import("../../scripts/sync-runtime-assets.mjs");

    const keys = runtimeNamespaces(fixture.root).map((namespace) => namespace.key);
    expect(keys).toContain("platform");
    expect(keys).toContain("spoke:alpha");
    expect(keys).toContain("spoke:beta");

    const rows = buildPlan(fixture.root);
    const alphaRows = rows.filter((row) => row.namespace === "spoke:alpha");
    const betaRows = rows.filter((row) => row.namespace === "spoke:beta");
    expect(alphaRows.length).toBeGreaterThan(0);
    expect(betaRows.length).toBeGreaterThan(0);

    // ONE runtime target per namespace: a cross-Spoke overwrite is impossible by construction.
    const targets = new Set(rows.map((row) => `${row.namespace}::${row.to}`));
    expect(targets.size).toBe(rows.length);

    // Each Spoke's OWN role artwork comes from its OWN authored tree, into its OWN namespace…
    expect(alphaRows.some((row) => row.to === "favicon.svg" && row.from.includes("spokes/alpha"))).toBe(true);
    expect(betaRows.some((row) => row.to === "favicon.svg" && row.from.includes("spokes/beta"))).toBe(true);
    expect(alphaRows.some((row) => row.from.includes("spokes/beta"))).toBe(false);
    expect(betaRows.some((row) => row.from.includes("spokes/alpha"))).toBe(false);
    // …while the platform-owned artwork is installed ONCE, shared, and deduplicated across Spokes that ship
    // the same bytes (a multi-Spoke Installation authors the platform tree in every Spoke root).
    const platformTargets = rows.filter((row) => row.namespace === "platform").map((row) => row.to);
    expect(new Set(platformTargets).size).toBe(platformTargets.length);
    expect(platformTargets).toContain("icon-home.svg");
    expect(platformTargets.filter((name) => name === "icon-home.svg")).toHaveLength(1);
  });
});
