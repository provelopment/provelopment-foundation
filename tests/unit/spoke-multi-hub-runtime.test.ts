import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hostRoutingForInstallation } from "@/config/spoke-host-routing.mjs";
import { installationRuntimeIndex } from "@/config/installation-runtime";
import { loadSpokeDictionaryRegistry } from "@/config/spoke-dictionaries";
import { resolveInstallationSpokeRoots } from "@/config/spoke-roots";
import { buildPlan } from "../../scripts/sync-runtime-assets.mjs";
import {
  materializeMultiHubInstallation,
  materializeSingleIdentifiedInstallation,
  multiHubManifest,
  multiHubNamespaceIdentity,
  multiHubNamespacePlan,
  multiHubSegment,
  multiHubSpokeFile,
  writeMultiHubSpoke,
  MULTI_HUB_HUBS,
  MULTI_HUB_INSPECTION,
  MULTI_HUB_SPOKES,
} from "../support/multi-hub-installation.mjs";

/**
 * TWO IDENTIFIED SPOKE HUBS, ONE INSTALLATION (FOUNDATION-ID-M3-P3 §10)
 * ====================================================================
 *
 * The Installation under test is the SHARED fixture (`tests/support/multi-hub-installation.mjs`), which the
 * browser scenario (`tests/browser/multi-hub.scenario.mjs`) drives through a real server and a real browser:
 * ONE two-Hub nested Installation, with `docs` declared in BOTH Hubs, per-member configuration, dictionary,
 * pages and artwork, and Hub two's `docs` nominated for inspection.
 *
 * The members deliberately SHARE logical coordinates (`ww` / `en` / `about`) so an isolation defect cannot
 * hide behind differing paths, and the proofs below travel the REAL path — the declaration seam, the build's
 * producer, the request boundary's decision, the runtime index, the asset plan — because that is where
 * isolation either holds or does not.
 */

const trees: string[] = [];

afterAll(() => {
  for (const tree of trees) rmSync(tree, { recursive: true, force: true });
});

/** A disposable Installation root this suite owns, removed in `afterAll`. */
function tempTree(prefix: string): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  trees.push(root);
  return root;
}

function write(file: string, contents: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents, "utf8");
}

/** The SHARED two-Hub Installation, and the routing description the BUILD would inline for it. */
function twoHubInstallation(): ReturnType<typeof materializeMultiHubInstallation> & {
  readonly routing: ReturnType<typeof hostRoutingForInstallation>;
} {
  const installation = materializeMultiHubInstallation({ repositoryRoot: process.cwd() });
  trees.push(installation.root);
  return { ...installation, routing: hostRoutingForInstallation(installation.root) };
}

// ── THE BUILD PRODUCES A COMPOSITE DESCRIPTION, CONSISTENT WITH EVERYTHING ELSE ──────────────────────────

describe("an Installation authored with TWO identified Spoke Hubs", () => {
  const routing = hostRoutingForInstallation(twoHubInstallation().root);

  it("produces a description whose every entry is COMPOSITE, in identified mode", () => {
    expect(routing.mode).toBe("identified");
    expect(routing.spokes.map((spoke) => [spoke.spokeHubId, spoke.id])).toEqual([
      ["one", "docs"],
      ["one", "news"],
      ["two", "docs"],
    ]);
    // ONE IDENTITY PER ENTRY, derived from BOTH halves — so Hub two's `docs` and Hub one's `docs` are two.
    expect(routing.spokes.map((spoke) => spoke.segment)).toEqual([
      "hub+one+docs",
      "hub+one+news",
      "hub+two+docs",
    ]);
    expect(new Set(routing.spokes.map((spoke) => spoke.segment)).size).toBe(3);
  });

  it("carries the COMPOSITE inspection nomination, and only its own Hub's switcher per Hub", () => {
    expect(routing.inspection?.spokeHubId).toBe(MULTI_HUB_INSPECTION.spokeHubId);
    expect(routing.inspection?.spokeId).toBe(MULTI_HUB_INSPECTION.spokeId);
    expect(routing.inspection?.hostnames).toEqual([...MULTI_HUB_INSPECTION.hostnames]);
    // Hub two declares NO switcher, so it appears in no list; Hub one's own list is offered from Hub one.
    expect(routing.spokeSwitcher).toBeNull();
    expect(routing.spokeHubSwitchers?.map((hub) => hub.spokeHubId)).toEqual(["one"]);
    expect(routing.spokeHubSwitchers?.[0].options.map((option) => option.spokeId)).toEqual(["docs", "news"]);
  });
});

// ── THE REQUEST BOUNDARY AND THE RUNTIME INDEX, ON THE SAME INSTALLATION ─────────────────────────────────

describe("the same Installation, through the request boundary and the runtime index", () => {
  const built = twoHubInstallation();

  beforeEach(() => {
    vi.resetModules();
    // The build's OWN selection, published exactly as `deploymentEnvironment` publishes it: an identified
    // Installation inlines NO configuration and NO single resource root, and the routing description is the
    // producer's own output.
    vi.stubEnv("FOUNDATION_DEPLOYMENT_ROOT", built.root);
    vi.stubEnv("FOUNDATION_DEPLOYMENT_MODE", "hubs");
    vi.stubEnv("FOUNDATION_DEPLOYMENT_HOST_ROUTING", JSON.stringify(built.routing));
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("resolves each hostname to the member that CLAIMS it, Hub included", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    for (const member of MULTI_HUB_SPOKES) {
      const context = runtimeContextForRequestHost(member.hostname);
      expect(context?.id, member.hostname).toBe(member.id);
      expect(context?.spokeHubId, member.hostname).toBe(member.hubId);
      expect(context?.runtimeSegment).toBe(multiHubSegment(member.hubId, member.id));
      expect(context?.canonicalHostname).toBe(member.hostname);
      // …and the identity is COMPOSITE, so nothing holding the context can lose which Hub it came from.
      expect(context?.spokeRef).toEqual({ spokeHubId: member.hubId, spokeId: member.id });
    }
  });

  it("keeps the REPEATED local id `docs` two INDEPENDENT Spokes, in every observable fact", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    const oneDocs = runtimeContextForRequestHost("hub-one-docs.localhost");
    const twoDocs = runtimeContextForRequestHost("hub-two-docs.localhost");

    expect(oneDocs?.id).toBe("docs");
    expect(twoDocs?.id).toBe("docs");
    // SAME LOCAL ID, DIFFERENT SPOKE — the facts that must differ:
    expect(oneDocs?.spokeHubId).toBe("one");
    expect(twoDocs?.spokeHubId).toBe("two");
    expect(oneDocs?.runtimeSegment).toBe("hub+one+docs");
    expect(twoDocs?.runtimeSegment).toBe("hub+two+docs");
    expect(oneDocs?.siteConfig.name).toBe("Hub One Docs Site");
    expect(twoDocs?.siteConfig.name).toBe("Hub Two Docs Site");

    // Their CONFIGURATIONS, page sources, dictionaries and artwork namespaces are separate:
    expect(oneDocs?.siteConfig.url).not.toBe(twoDocs?.siteConfig.url);
    expect(oneDocs?.resources.spokeRoot).not.toBe(twoDocs?.resources.spokeRoot);
    expect(oneDocs?.resources.dictionaryRoot).not.toBe(twoDocs?.resources.dictionaryRoot);
    expect(oneDocs?.resources.markdownPagesRoot).not.toBe(twoDocs?.resources.markdownPagesRoot);
    expect(oneDocs?.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      "/spokes/hub+one+docs/assets",
    ]);
    expect(twoDocs?.runtimeAssetNamespaces.map((namespace) => namespace.urlBase)).toEqual([
      "/assets",
      "/spokes/hub+two+docs/assets",
    ]);

    // The DICTIONARIES and the PAGE SOURCES are their own too — read through the accepted authority for each
    // (`loadSpokeDictionaryRegistry`), so "each renders only its own wording and content" is measured rather
    // than assumed.
    const oneDictionary = loadSpokeDictionaryRegistry(oneDocs!.resources, oneDocs!.siteConfig).get("en");
    const twoDictionary = loadSpokeDictionaryRegistry(twoDocs!.resources, twoDocs!.siteConfig).get("en");
    expect(oneDictionary.navigation.items["/about"]).toBe("One Docs About");
    expect(twoDictionary.navigation.items["/about"]).toBe("Two Docs About");
    expect(
      readFileSync(path.join(oneDocs!.resources.markdownPagesRoot, "ww", "en", "about.md"), "utf8"),
    ).toContain("Hub One's docs Spoke wrote this paragraph.");
    expect(
      readFileSync(path.join(twoDocs!.resources.markdownPagesRoot, "ww", "en", "about.md"), "utf8"),
    ).toContain("Hub Two's docs Spoke wrote the third paragraph.");
    // The route only ONE of them authors is absent from the other's tree, so their inventories differ too.
    expect(existsSync(path.join(twoDocs!.resources.markdownPagesRoot, "ww", "en", "one-docs-only.md"))).toBe(
      false,
    );
  });

  it("answers a bare local id with NOTHING, and never with whichever Hub came first", async () => {
    const { runtimeContextForSegment, installationRuntimeIndexForBuild } = await import(
      "@/config/spoke-request"
    );
    const { runtimeContextForIdentifiedSpoke } = await import("@/config/installation-runtime");

    // A local id is NOT an address in this form: `docs` names a Spoke in either Hub.
    expect(runtimeContextForSegment("docs")).toBeNull();
    expect(runtimeContextForSegment("one")).toBeNull();

    // …and the composite reference is the ONE way to name either of them.
    const index = installationRuntimeIndexForBuild();
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "two", spokeId: "docs" })?.id).toBe("docs");
    expect(
      runtimeContextForIdentifiedSpoke(index, { spokeHubId: "two", spokeId: "docs" })?.spokeHubId,
    ).toBe("two");
    // An undeclared Hub, or an undeclared id inside a declared Hub, answers NOTHING.
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "three", spokeId: "docs" })).toBeNull();
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "one", spokeId: "absent" })).toBeNull();
  });

  it("resolves an inspection hostname to the COMPOSITE nomination — the second Hub's Spoke", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    // The authored alias, AND the platform URL shape it deliberately is not: recognition is exact equality
    // against what the Installation authored (or the platform reported), never a suffix rule.
    const inspected = runtimeContextForRequestHost(MULTI_HUB_INSPECTION.hostnames[0]);
    expect(inspected?.id).toBe("docs");
    expect(inspected?.spokeHubId).toBe("two");
    expect(inspected?.runtimeSegment).toBe("hub+two+docs");

    // No platform identity was reported to this process, so the Vercel-shaped URLs are NOT claims here.
    expect(runtimeContextForRequestHost(MULTI_HUB_INSPECTION.hostname)).toBeNull();
    expect(runtimeContextForRequestHost(MULTI_HUB_INSPECTION.branchHostname)).toBeNull();
  });

  it("answers an UNCLAIMED host with NOTHING — never another Hub's Spoke", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");

    expect(runtimeContextForRequestHost("unknown.localhost")).toBeNull();
    expect(runtimeContextForRequestHost("localhost:3000")).toBeNull();
    expect(runtimeContextForRequestHost(null)).toBeNull();
    // A hostname that merely LOOKS adjacent to a claim is not a claim: recognition is exact.
    expect(runtimeContextForRequestHost("sub.hub-one-docs.localhost")).toBeNull();
    expect(runtimeContextForRequestHost("hub-one-docs.localhost.evil.test")).toBeNull();
  });
});

// ── ARTWORK: EVERY MEMBER MIRRORS INTO ITS OWN NAMESPACE, AND NOTHING CROSSES ────────────────────────────

describe("the asset plan of the same Installation", () => {
  const built = twoHubInstallation();

  it("gives every member its OWN namespace, keyed by the COMPOSITE segment", () => {
    const segments = MULTI_HUB_SPOKES.map((member) => member.hubId + "/" + member.id);

    for (const [index, member] of MULTI_HUB_SPOKES.entries()) {
      const segment = multiHubSegment(member.hubId, member.id);
      const identity = multiHubNamespaceIdentity(built.root, segment);

      expect(identity, segments[index]).toEqual({
        key: `spoke:${segment}`,
        urlBase: `/spokes/${segment}/assets`,
        directory: expect.stringContaining(segment),
      });
    }

    // The two Spokes called `docs` occupy two NAMESPACES and two DIRECTORIES — isolation is structural.
    const oneDocs = multiHubNamespaceIdentity(built.root, multiHubSegment("one", "docs"));
    const twoDocs = multiHubNamespaceIdentity(built.root, multiHubSegment("two", "docs"));
    expect(oneDocs.key).not.toBe(twoDocs.key);
    expect(oneDocs.urlBase).not.toBe(twoDocs.urlBase);
    expect(oneDocs.directory).not.toBe(twoDocs.directory);
  });

  it("installs each member's own artwork into ITS namespace, and never into another's", () => {
    for (const member of MULTI_HUB_SPOKES) {
      const segment = multiHubSegment(member.hubId, member.id);
      const own = multiHubNamespacePlan(built.root, segment);

      // Its replaceable ROLE artwork, and its own brand mark — both in its own namespace.
      expect(own.some((row) => row.to === "favicon.svg")).toBe(true);
      expect(own.some((row) => row.to === multiHubSpokeFile(member))).toBe(true);
      // …and every row of that namespace reads from THIS member's own authored tree.
      expect(own.every((row) => row.from.startsWith(path.join(built.root, ...member.directory.split("/"))))).toBe(
        true,
      );
    }

    // The shared PLATFORM namespace is separate from every member's, so no member can shadow platform artwork
    // and no member's own mark ever lands there.
    const platform = buildPlan(built.root).filter((row) => row.namespace === "platform");
    expect(platform.length).toBeGreaterThan(0);
    expect(platform.every((row) => !MULTI_HUB_SPOKES.some((member) => row.to === multiHubSpokeFile(member)))).toBe(
      true,
    );
  });
});

// ── COLLISIONS: WHAT IS STILL REFUSED, AND WHAT IS NOT ───────────────────────────────────────────────────

describe("collisions across Hubs", () => {
  it("refuses ONE exact hostname claimed in TWO Hubs", () => {
    const root = tempTree("foundation-m3p3-collide-host-");
    // The SAME hostname in both Hubs: a request carries one host, so it must select exactly one Spoke in
    // exactly one Hub across the whole Installation.
    for (const member of MULTI_HUB_SPOKES) {
      writeMultiHubSpoke(root, process.cwd(), { ...member, hostname: "shared.localhost" });
    }
    write(path.join(root, "spokes.json"), multiHubManifest({ inspection: null }));

    expect(() => installationRuntimeIndex(root)).toThrow(/claimed in more than one Spoke Hub/);
  });

  it("refuses TWO Hubs that share ONE physical Spoke root", () => {
    const root = tempTree("foundation-m3p3-collide-root-");
    writeMultiHubSpoke(root, process.cwd(), MULTI_HUB_SPOKES[0]);
    write(
      path.join(root, "spokes.json"),
      `${JSON.stringify(
        {
          spokeHubs: [
            { id: "one", spokes: [{ id: "docs", root: "spokes/hub-one-docs" }] },
            { id: "two", spokes: [{ id: "docs", root: "spokes/hub-one-docs" }] },
          ],
        },
        null,
        2,
      )}\n`,
    );

    expect(() => resolveInstallationSpokeRoots(root)).toThrow(/two Spokes cannot share one authored root/);
  });

  it("ACCEPTS the same local id in two Hubs — the fixture's own shape is not a collision", () => {
    const built = twoHubInstallation();
    const roots = resolveInstallationSpokeRoots(built.root);

    expect(roots.mode).toBe("hubs");
    expect(roots.hubs.map((hub) => hub.id)).toEqual(["one", "two"]);
    expect(roots.descriptors.map((descriptor) => descriptor.id)).toEqual(["docs", "news", "docs"]);
    expect(roots.descriptors.map((descriptor) => descriptor.spokeHubId)).toEqual(["one", "one", "two"]);
  });
});

// ── §6 — AN IDENTIFIED INSTALLATION OF ONE HUB AND ONE SPOKE IS STILL FAIL-CLOSED ────────────────────────

describe("an identified Installation with exactly ONE Hub and ONE Spoke", () => {
  const solo = materializeSingleIdentifiedInstallation({ repositoryRoot: process.cwd() });
  trees.push(solo.root);
  const routing = hostRoutingForInstallation(solo.root);

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("FOUNDATION_DEPLOYMENT_ROOT", solo.root);
    vi.stubEnv("FOUNDATION_DEPLOYMENT_MODE", "hubs");
    vi.stubEnv("FOUNDATION_DEPLOYMENT_HOST_ROUTING", JSON.stringify(routing));
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("dispatches by EXACT hostname — never the permissive one-Spoke rule (§6)", async () => {
    const { runtimeContextForRequestHost } = await import("@/config/spoke-request");
    const [member] = solo.spokes;

    // ITS OWN hostname answers …
    const own = runtimeContextForRequestHost(member.hostname);
    expect(own?.id).toBe("docs");
    expect(own?.spokeHubId).toBe("solo");
    expect(own?.runtimeSegment).toBe("hub+solo+docs");

    // …and NOTHING ELSE does, even though this Installation declares exactly ONE Spoke. A LEGACY/FLAT
    // one-Spoke Installation answers every host; an IDENTIFIED one never does.
    for (const host of ["unknown.localhost", "localhost:3000", "www.example.com", null]) {
      expect(runtimeContextForRequestHost(host), String(host)).toBeNull();
    }
  });

  it("is NOT a deployment the build compatibility seam activates a Spoke for", async () => {
    const { currentBuildRuntimeContext } = await import("@/config/installation-runtime");

    expect(() => currentBuildRuntimeContext()).toThrow(/IDENTIFIED SPOKE HUBS/);
  });

  it("declares no Hub-scoped switcher at all, so none can be offered", () => {
    expect(routing.spokeSwitcher).toBeNull();
    expect(routing.spokeHubSwitchers ?? []).toEqual([]);
    // …while the SHARED fixture's Hub one does author one (the control this proof is the absence of).
    expect(MULTI_HUB_HUBS[0].spokeSwitcher?.options.length ?? 0).toBeGreaterThan(0);
  });
});
