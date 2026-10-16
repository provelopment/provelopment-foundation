import { describe, expect, it } from "vitest";

import {
  COMPOSITE_SEGMENT_PREFIX,
  COMPOSITE_SEGMENT_SEPARATOR,
  compositeSegmentParts,
  isCompositeRuntimeSegment,
  runtimeNamespaceCollisions,
  runtimeSegmentForIdentifiedSpokeRef,
  runtimeSegmentForSpokeHubSpoke,
  runtimeSegmentForSpokeId,
  spokeRuntimeAssetNamespacePath,
  spokeRuntimeAssetUrlBase,
} from "@/config/spoke-runtime-segment.mjs";
import { spokeResourceIndexFor } from "@/config/spoke-resources";
import { hostRoutingForInstallation } from "@/config/spoke-host-routing.mjs";
import { resolveDeploymentForBuild } from "@/config/deployment-build.mjs";
import {
  runtimeContextForIdentifiedSpoke,
  runtimeContextForSpoke,
  type InstallationRuntimeIndex,
  type InstallationRuntimeSpoke,
} from "@/config/installation-runtime";
import {
  routingEntryFor,
  routingEntryForSelection,
  spokeHubSwitcherForSpokeHub,
  spokeSelectionForHost,
  type InstallationHostRouting,
} from "@/config/spoke-routing";
import { resolveInstallationSpokeRoots } from "@/config/spoke-roots";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { SiteConfig } from "@/config/site-config";

/**
 * COMPOSITE RUNTIME ISOLATION (FOUNDATION-ID-M3-P2)
 * ================================================
 *
 * The runtime support a multi-Spoke-Hub Installation needs, proved WITHOUT making one operable: the nested
 * manifest form is still refused at every public entry point (§9), so every capability below is exercised
 * through the pure authorities and through routing/runtime values built as data.
 *
 * What this file proves, in order:
 *
 *   1. the COMPOSITE segment exists, is ONE atomic segment, is injective over `(SpokeHubId, SpokeId)`, and
 *      can NEVER collide with the legacy encoder's output — including for ids containing punctuation, the
 *      separator itself, escape sequences and Unicode;
 *   2. case-equivalent effective keys are refused, while two Hubs reusing one local Spoke id are not;
 *   3. the request decision selects a COMPOSITE identity, fails closed for an unknown host, and refuses a
 *      nomination that names only a local id;
 *   4. two Hubs' Spokes share nothing: not a runtime context, not an artwork namespace, not a resolved
 *      configuration, not a switcher;
 *   5. the activation gate still refuses a nested Installation at the build seam.
 */

/** A minimal configuration: only the record's identity and its namespace are under test here. */
const config = (label: string): SiteConfig => ({ site: { name: label } }) as unknown as SiteConfig;

/** ONE composite runtime record, built as DATA — the index is a value, not a lookup table. */
function compositeRecord(
  spokeHubId: string,
  spokeId: string,
  hostname: string,
  label: string,
): InstallationRuntimeSpoke {
  const spokeRef = { spokeHubId, spokeId };
  const root = `/roots/${spokeHubId}-${spokeId}`;
  return {
    id: spokeId,
    runtimeSegment: runtimeSegmentForIdentifiedSpokeRef(spokeRef),
    canonicalHostname: hostname,
    hostnameClaims: [hostname],
    config: config(label),
    resources: {
      spokeRoot: root,
      dictionaryRoot: `${root}/config/i18n`,
      dictionaryOverrideRoot: `${root}/config/i18n/sites`,
      markdownPagesRoot: `${root}/content/pages/markdown`,
      jsonPagesRoot: `${root}/content/pages/json`,
      assetSourceRoot: `${root}/content/assets`,
    },
    spokeHubId,
    spokeRef,
  };
}

/** The two-Hub index: each Hub owns a Spoke called `docs`, answering on its own hostname. */
function twoHubIndex(): InstallationRuntimeIndex {
  return {
    mode: "explicit",
    spokes: [
      compositeRecord("one", "docs", "docs.one.example.test", "one"),
      compositeRecord("two", "docs", "docs.two.example.test", "two"),
    ],
  };
}

/** A composite routing description, exactly as the build would publish it. */
function compositeRouting(
  inspection: InstallationHostRouting["inspection"] = null,
): InstallationHostRouting {
  const entry = (spokeHubId: string, spokeId: string, hostname: string) => ({
    id: spokeId,
    runtimeSegment: runtimeSegmentForSpokeHubSpoke(spokeHubId, spokeId),
    canonicalOrigin: `https://${hostname}`,
    hostnameClaims: [hostname],
    spokeHubId,
    spokeRef: { spokeHubId, spokeId },
  });

  return {
    mode: "multi",
    spokes: [
      entry("one", "docs", "docs.one.example.test"),
      entry("two", "docs", "docs.two.example.test"),
    ],
    inspection,
    spokeSwitcher: null,
    spokeHubSwitchers: [
      {
        spokeHubId: "one",
        options: [{ spokeId: "docs", label: "Docs one", href: "https://docs.one.example.test" }],
      },
      {
        spokeHubId: "two",
        options: [{ spokeId: "docs", label: "Docs two", href: "https://docs.two.example.test" }],
      },
    ],
  };
}

describe("the composite runtime segment", () => {
  it("is the documented shape: the proven encoder, both halves, ONE atomic segment", () => {
    expect(runtimeSegmentForSpokeHubSpoke("one", "docs")).toBe("hub+one+docs");
    expect(runtimeSegmentForSpokeHubSpoke("two", "docs")).toBe("hub+two+docs");
    expect(COMPOSITE_SEGMENT_PREFIX).toBe("hub+");
    expect(COMPOSITE_SEGMENT_SEPARATOR).toBe("+");

    for (const segment of ["hub+one+docs", runtimeSegmentForSpokeHubSpoke("a b", "c/d")]) {
      expect(segment).not.toContain("/");
      expect(segment).not.toContain("\\");
      expect(segment).not.toMatch(/[\s%?#]/);
      expect(isCompositeRuntimeSegment(segment)).toBe(true);
      // ONE segment: the namespace is exactly one level below the shared container.
      expect(spokeRuntimeAssetNamespacePath(segment)).toBe(`spokes/${segment}/assets`);
      expect(spokeRuntimeAssetUrlBase(segment)).toBe(`/spokes/${segment}/assets`);
      expect(segment.split("/")).toHaveLength(1);
    }
  });

  it("is DISJOINT from the legacy encoder, for punctuation, escapes, Unicode and the separator", () => {
    const corpus = [
      "foundation",
      "docs",
      "a/b",
      "a b",
      "a~b",
      "a~2Fb",
      "~",
      ".",
      "..",
      "ä",
      "日本語",
      "a+b",
      "hub+one+docs",
      "+",
      "hub+",
      "hub+one",
      "hub+one+docs+more",
    ];

    for (const id of corpus) {
      const legacy = runtimeSegmentForSpokeId(id);
      // The legacy encoder can never emit the separator at all: `+` is not a verbatim byte, so it is always
      // escaped. That single fact is the whole proof, and it holds for every id in the corpus.
      expect(legacy).not.toContain(COMPOSITE_SEGMENT_SEPARATOR);
      expect(isCompositeRuntimeSegment(legacy)).toBe(false);
      expect(compositeSegmentParts(legacy)).toBeNull();
      // …while a composite segment always carries it, so the two encoders' outputs cannot meet.
      expect(runtimeSegmentForSpokeHubSpoke("one", id)).toContain(COMPOSITE_SEGMENT_SEPARATOR);
    }

    // An id that SPELLS a composite segment occupies its own namespace instead of borrowing one.
    expect(runtimeSegmentForSpokeId("hub+one+docs")).toBe("hub~2Bone~2Bdocs");
    expect(runtimeSegmentForSpokeId("hub+one+docs")).not.toBe(
      runtimeSegmentForSpokeHubSpoke("one", "docs"),
    );
  });

  it("is INJECTIVE over (SpokeHubId, SpokeId), and round-trips through its own split", () => {
    const hubs = ["one", "two", "One", "a+b", "a~2Bb", "ä", "hub+one"];
    const spokes = ["docs", "Docs", "a/b", "a b", "a+b", "~", "日本語"];

    const seen = new Map<string, string>();
    for (const hub of hubs) {
      for (const spoke of spokes) {
        const ref = { spokeHubId: hub, spokeId: spoke };
        const segment = runtimeSegmentForIdentifiedSpokeRef(ref);
        const key = `${hub} :: ${spoke}`;
        // No two PAIRS may share a segment…
        expect(seen.has(segment), `${key} collided with ${seen.get(segment)}`).toBe(false);
        seen.set(segment, key);
        // …and every segment says exactly which pair produced it.
        expect(compositeSegmentParts(segment)).toEqual(ref);
      }
    }

    // The pairing IS the identity: the same local id in two Hubs is two identities, never one.
    expect(runtimeSegmentForSpokeHubSpoke("one", "docs")).not.toBe(
      runtimeSegmentForSpokeHubSpoke("two", "docs"),
    );

    // A hand-written spelling never resolves to an identity nobody encoded.
    for (const bogus of [
      "hub+one",
      "hub++docs",
      "hub+one+docs+more",
      "hub+one~2bdocs",
      "hub+~FF+docs",
      "hub+one+",
    ]) {
      expect(compositeSegmentParts(bogus), bogus).toBeNull();
    }
  });

  it("refuses case-equivalent and duplicate EFFECTIVE keys, and ACCEPTS reuse across Hubs", () => {
    const one = runtimeSegmentForSpokeHubSpoke("one", "docs");
    const two = runtimeSegmentForSpokeHubSpoke("two", "docs");
    const otherCase = runtimeSegmentForSpokeHubSpoke("One", "docs");

    // Two Hubs reusing ONE local Spoke id are two namespaces — the reason the composite exists.
    expect(runtimeNamespaceCollisions([one, two])).toEqual([]);
    expect(runtimeNamespaceCollisions([one, one])).toHaveLength(1);
    expect(runtimeNamespaceCollisions([one, one])[0]).toMatch(/is the same namespace as #1/);
    expect(runtimeNamespaceCollisions([one, otherCase])[0]).toMatch(/CASE-INSENSITIVE/);
    // The legacy and composite namespaces of one local id are distinct rather than colliding.
    expect(runtimeNamespaceCollisions([one, runtimeSegmentForSpokeId("docs")])).toEqual([]);
  });
});

describe("the composite request decision", () => {
  it("selects the COMPOSITE identity, and two Hubs' Spokes never answer for each other", () => {
    const routing = compositeRouting();

    const first = spokeSelectionForHost(routing, "docs.one.example.test");
    expect(first).toEqual({
      spokeId: "docs",
      spokeHubId: "one",
      hostname: "docs.one.example.test",
      reason: "registered-hostname",
    });
    expect(spokeSelectionForHost(routing, "docs.two.example.test")).toEqual({
      spokeId: "docs",
      spokeHubId: "two",
      hostname: "docs.two.example.test",
      reason: "registered-hostname",
    });

    // The entry each selection names is the COMPOSITE one: found by BOTH halves, never by the local id.
    expect(
      routingEntryForSelection(routing, {
        spokeId: "docs",
        spokeHubId: "one",
        hostname: "docs.one.example.test",
        reason: "registered-hostname",
      })?.runtimeSegment,
    ).toBe("hub+one+docs");
    expect(
      routingEntryForSelection(routing, {
        spokeId: "docs",
        spokeHubId: "two",
        hostname: "docs.two.example.test",
        reason: "registered-hostname",
      })?.runtimeSegment,
    ).toBe("hub+two+docs");

    // A bare local id addresses NOTHING in an identified Installation; the composite segment does.
    expect(routingEntryFor(routing, "docs")).toBeNull();
    expect(routingEntryFor(routing, "hub+two+docs")?.id).toBe("docs");
  });

  it("FAILS CLOSED for an unknown host, and never falls back to another Hub", () => {
    expect(spokeSelectionForHost(compositeRouting(), "elsewhere.example.test")).toBeNull();
    expect(spokeSelectionForHost(compositeRouting(), null)).toBeNull();
    expect(spokeSelectionForHost(compositeRouting(), "")).toBeNull();
    // A hostname that merely CONTAINS a claim is not claimed — recognition stays exact.
    expect(spokeSelectionForHost(compositeRouting(), "sub.docs.one.example.test")).toBeNull();
  });

  it("requires a COMPOSITE nomination, and lets an authored claim win over it", () => {
    const inspectionHosts = ["inspect.example.test"];
    const nominated = compositeRouting({ spokeId: "docs", spokeHubId: "two", hostnames: inspectionHosts });
    expect(spokeSelectionForHost(nominated, "inspect.example.test")).toEqual({
      spokeId: "docs",
      spokeHubId: "two",
      hostname: "inspect.example.test",
      reason: "inspection-hostname",
    });

    // A BARE local id nomination is REFUSED: it names a Spoke in either Hub, so nothing could decide.
    const bare = compositeRouting({ spokeId: "docs", hostnames: inspectionHosts });
    expect(spokeSelectionForHost(bare, "inspect.example.test")).toBeNull();

    // A nomination of a Hub or Spoke this Installation does not declare answers nothing.
    const absent = compositeRouting({ spokeId: "docs", spokeHubId: "three", hostnames: inspectionHosts });
    expect(spokeSelectionForHost(absent, "inspect.example.test")).toBeNull();

    // …and an AUTHORED claim always wins over the nomination — the accepted order, preserved.
    const claiming = compositeRouting({
      spokeId: "docs",
      spokeHubId: "two",
      hostnames: ["docs.one.example.test"],
    });
    expect(spokeSelectionForHost(claiming, "docs.one.example.test")).toEqual({
      spokeId: "docs",
      spokeHubId: "one",
      hostname: "docs.one.example.test",
      reason: "registered-hostname",
    });
  });

  it("refuses a description that MIXES the flat and identified forms", () => {
    const routing = compositeRouting();
    const mixed: InstallationHostRouting = {
      ...routing,
      spokes: [
        ...routing.spokes,
        {
          id: "flat",
          runtimeSegment: "flat",
          canonicalOrigin: "https://flat.example.test",
          hostnameClaims: ["flat.example.test"],
        },
      ],
    };
    expect(() => spokeSelectionForHost(mixed, "flat.example.test")).toThrow(/MIXES/);
  });
});

describe("per-Hub isolation: context, resources, artwork and switcher", () => {
  it("resolves each Hub's Spoke to ITS OWN context, and never by a bare local id", () => {
    const index = twoHubIndex();

    const one = runtimeContextForIdentifiedSpoke(index, { spokeHubId: "one", spokeId: "docs" });
    const two = runtimeContextForIdentifiedSpoke(index, { spokeHubId: "two", spokeId: "docs" });
    expect(one?.runtimeSegment).toBe("hub+one+docs");
    expect(two?.runtimeSegment).toBe("hub+two+docs");

    // Not the configuration, the authored trees nor the artwork of the other Hub's `docs`.
    expect(one?.siteConfig).toEqual(config("one"));
    expect(two?.siteConfig).toEqual(config("two"));
    expect(one?.resources.spokeRoot).toBe("/roots/one-docs");
    expect(two?.resources.spokeRoot).toBe("/roots/two-docs");
    expect(one?.runtimeAssetNamespaces[1].urlBase).toBe("/spokes/hub+one+docs/assets");
    expect(two?.runtimeAssetNamespaces[1].urlBase).toBe("/spokes/hub+two+docs/assets");
    // …while the PLATFORM namespace leads both and is never shadowable.
    expect(one?.runtimeAssetNamespaces[0]).toEqual(two?.runtimeAssetNamespaces[0]);
    expect(one?.runtimeAssetNamespaces[0].urlBase).toBe("/assets");

    // A BARE LOCAL ID ANSWERS NOTHING here: two Hubs declare it, so resolving by id alone would be a guess.
    expect(runtimeContextForSpoke(index, "docs")).toBeNull();
    // The composite segment is the runtime key that does answer, and it names exactly one Spoke.
    expect(runtimeContextForSpoke(index, "hub+one+docs")?.siteConfig).toEqual(config("one"));

    // An undeclared Hub, or an undeclared id inside a declared Hub, answers nothing.
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "three", spokeId: "docs" })).toBeNull();
    expect(runtimeContextForIdentifiedSpoke(index, { spokeHubId: "one", spokeId: "absent" })).toBeNull();
  });

  it("gives each Hub its OWN authored resource record, and a flat record keeps its exact shape", () => {
    const flat = spokeResourceIndexFor({ id: "docs", root: "/roots/flat" });
    expect(Object.keys(flat).sort()).toEqual([
      "assetBasePath",
      "resources",
      "runtimeSegment",
      "spokeId",
    ]);
    expect(flat.runtimeSegment).toBe("docs");
    expect(flat.assetBasePath).toBe("/spokes/docs/assets");

    const one = spokeResourceIndexFor(
      { id: "docs", root: "/roots/one" },
      { spokeHubId: "one", spokeId: "docs" },
    );
    const two = spokeResourceIndexFor(
      { id: "docs", root: "/roots/two" },
      { spokeHubId: "two", spokeId: "docs" },
    );
    expect(one.runtimeSegment).toBe("hub+one+docs");
    expect(two.runtimeSegment).toBe("hub+two+docs");
    expect(one.assetBasePath).not.toBe(two.assetBasePath);
    // The authored trees come from EACH descriptor's own root: no shared source, dictionary or page tree.
    expect(one.resources.dictionaryRoot).toBe("/roots/one/config/i18n");
    expect(two.resources.dictionaryRoot).toBe("/roots/two/config/i18n");
    expect(one.resources.assetSourceRoot).not.toBe(two.resources.assetSourceRoot);
    expect(one.spokeHubId).toBe("one");
    expect(two.spokeRef).toEqual({ spokeHubId: "two", spokeId: "docs" });
  });

  it("hands the rendering Spoke its OWNING Hub's switcher, never a merged list", () => {
    const routing = compositeRouting();

    expect(spokeHubSwitcherForSpokeHub(routing, "one")?.options).toEqual([
      { spokeId: "docs", label: "Docs one", href: "https://docs.one.example.test" },
    ]);
    expect(spokeHubSwitcherForSpokeHub(routing, "two")?.options).toEqual([
      { spokeId: "docs", label: "Docs two", href: "https://docs.two.example.test" },
    ]);
    // A Hub that authors none gets none, and a flat description carries no per-Hub switchers at all.
    expect(spokeHubSwitcherForSpokeHub(routing, "three")).toBeNull();
    expect(
      spokeHubSwitcherForSpokeHub({ ...routing, spokeHubSwitchers: undefined }, "one"),
    ).toBeNull();
  });
});

describe("the activation gate is LIFTED for a coherent collection — and only for one", () => {
  it("resolves a nested Installation at the build seam, with the composite identity of every member", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-p3-gate-"));
    try {
      mkdirSync(path.join(root, "spokes", "one"), { recursive: true });
      writeFileSync(
        path.join(root, "spokes", "one", "site.config.json"),
        JSON.stringify({ site: { name: "One", url: "https://one.test" } }),
        "utf8",
      );
      writeFileSync(
        path.join(root, "spokes.json"),
        JSON.stringify({ spokeHubs: [{ id: "one", spokes: [{ id: "docs", root: "spokes/one" }] }] }),
        "utf8",
      );

      // Phase 3 ENABLES the form — for a COHERENT collection, through the same authority that validated it
      // while it was gated. The member is addressed by BOTH halves of its identity from here on.
      const roots = resolveInstallationSpokeRoots(root);
      expect(roots.mode).toBe("hubs");
      expect(roots.hubs[0].id).toBe("one");
      expect(roots.descriptors).toEqual([
        {
          id: "docs",
          root: path.join(root, "spokes", "one"),
          spokeHubId: "one",
        },
      ]);

      const routing = hostRoutingForInstallation(root);
      expect(routing.mode).toBe("identified");
      expect(routing.spokes.map((spoke) => spoke.segment)).toEqual(["hub+one+docs"]);
      expect(routing.spokes[0].spokeHubId).toBe("one");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still refuses an INVALID nested Installation, with an actionable diagnostic", () => {
    const root = mkdtempSync(path.join(tmpdir(), "foundation-p3-gate-invalid-"));
    try {
      mkdirSync(path.join(root, "spokes", "one"), { recursive: true });
      writeFileSync(path.join(root, "spokes", "one", "site.config.json"), "{}", "utf8");
      // A member with no canonical origin: an identified collection ALWAYS dispatches by hostname, so this
      // Installation can never be dispatched to — it is refused at the build seam, by name.
      writeFileSync(
        path.join(root, "spokes.json"),
        JSON.stringify({ spokeHubs: [{ id: "one", spokes: [{ id: "docs", root: "spokes/one" }] }] }),
        "utf8",
      );

      expect(() => hostRoutingForInstallation(root)).toThrow(
        /Spoke Hub "one" > Spoke "docs" declares no canonical origin/,
      );
      expect(() => resolveDeploymentForBuild({}, root)).toThrow(
        /Spoke Hub "one" > Spoke "docs" declares no canonical origin/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
