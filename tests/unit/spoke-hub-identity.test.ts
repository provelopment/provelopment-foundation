import { describe, expect, it } from "vitest";

import {
  IMPLICIT_HUB_ID,
  IMPLICIT_SPOKE_HUB_ID,
  IMPLICIT_SPOKE_ID,
  hubMembershipIssues,
  identifiedSpokeHubCollectionIssues,
  isCoherentIdentifiedSpokeHubCollection,
  partitionSitesIntoHubs,
  resolveSpokeFromHost,
  resolveSpokeRefFromHost,
  sharedHostnamesAcrossHubs,
  spokeByRef,
  spokeCollectionIssues,
  spokeHubCollectionIssues,
  spokeHubIssues,
  type IdentifiedSpokeHub,
  type IdentifiedSpokeRef,
  type InstallationSpokeHubCollection,
  type Spoke,
  type SpokeHub,
} from "@/core/spoke";
import { resolveSites, type ResolvedSite } from "@/core/site";

/**
 * IDENTIFIED SPOKE HUBS (FOUNDATION-ID-M3-P1)
 * ==========================================
 *
 * The OUTER layer gains an identity: an Installation may contain SEVERAL independently identified Spoke
 * Hubs, each owning its own Spoke membership. A hostname claimed by one Spoke stays EXCLUSIVE; a hostname
 * claimed by members of two Hubs is a SHARED host, which is legitimate under `D31` and which hostname
 * dispatch answers with nothing.
 *
 * What this file proves, in the order it proves it:
 *
 *   1. the new names are ADDITIVE: an `IdentifiedSpokeHub` IS a `SpokeHub`, so every existing consumer —
 *      `spokeHubIssues`, `resolveSpokeFromHost` — accepts one unchanged;
 *   2. the reserved Spoke-Hub marker is its OWN declaration, refused by its OWN rule set, independent of the
 *      implicit Spoke marker and the implicit Site Hub marker (one spelling, three markers);
 *   3. a LOCAL Spoke id may repeat in another Hub (accepted), which is exactly why a Spoke is named by the
 *      COMPOSITE `IdentifiedSpokeRef` — and why the composite lookup has no fallback;
 *   4. the rules that exist ACROSS Hubs are refused: duplicate Hub ids, an empty collection, and one exact
 *      hostname claimed in two Hubs;
 *   5. every WITHIN-Hub rule is the EXISTING authority's answer, quoted with its Hub — composed, never
 *      copied (the strongest available evidence that no second algorithm exists).
 */

/** The EXISTING Foundation Site values — exactly what a deployment's `sites[]` resolves to. */
function sitesFor(...codes: readonly string[]): readonly ResolvedSite[] {
  return resolveSites({
    input: codes.map((code) => ({ code })),
    defaultLocale: "en",
    locales: ["en", "de"],
  }).sites;
}

/** ONE Spoke built from the ONE pure partition, so every fixture is a real domain value. */
function spokeOf(id: string, canonicalHostname: string, sites: readonly string[]): Spoke {
  return {
    identity: { id, canonicalHostname, hostnameClaims: [canonicalHostname] },
    hubs: partitionSitesIntoHubs(sitesFor(...sites)),
  };
}

/** ONE identified Spoke Hub, built from real Spokes. */
function hubOf(id: string, spokes: readonly Spoke[]): IdentifiedSpokeHub {
  return { identity: { id }, spokes };
}

/** Mutual assignability, EXERCISED rather than described. */
function asSpokeHub(hub: IdentifiedSpokeHub): SpokeHub {
  return hub;
}

describe("identified Spoke Hubs", () => {
  it("is ADDITIVE: an identified Hub is a SpokeHub, and every existing consumer accepts it", () => {
    const hub: IdentifiedSpokeHub = hubOf("one", [
      spokeOf("global", "foundation.example.test", ["ww"]),
    ]);

    // The identity is what was added; the contract every existing consumer reads is unchanged.
    const plain: SpokeHub = asSpokeHub(hub);
    expect(plain.spokes).toBe(hub.spokes);
    expect(Object.keys(hub).sort()).toEqual(["identity", "spokes"]);
    expect(Object.keys(hub.identity)).toEqual(["id"]);

    // The EXISTING authorities work on it with no adaptation at all.
    expect(spokeHubIssues(plain)).toEqual([]);
    expect(resolveSpokeFromHost(plain, "foundation.example.test")?.spokeId).toBe("global");
    expect(resolveSpokeFromHost(plain, "unknown.example.test")).toBeNull();
  });

  it("declares the Spoke-Hub marker INDEPENDENTLY, refused by its own rule set alone", async () => {
    // ONE SPELLING, THREE MARKERS — and three separate declarations. The module owns exactly its own marker
    // and its own rule: it neither imports nor re-exports another layer's marker, so re-spelling one of
    // them can never silently move another.
    const surface = (await import("@/core/spoke/spoke-hub-id.mjs")) as Record<string, unknown>;
    expect(Object.keys(surface).sort()).toEqual(["IMPLICIT_SPOKE_HUB_ID", "spokeHubCollectionIssues"]);
    expect(IMPLICIT_SPOKE_HUB_ID).toBe("implicit");
    expect(IMPLICIT_SPOKE_ID).toBe("implicit");
    expect(IMPLICIT_HUB_ID).toBe("implicit");

    // Each marker is refused by ITS OWN authoring surface, on the TRIMMED spelling (padding cannot launder
    // a reserved word into an authored identity)…
    expect(spokeHubCollectionIssues([IMPLICIT_SPOKE_HUB_ID]).join("\n")).toMatch(
      /reserved for the implicit Spoke Hub/,
    );
    expect(spokeHubCollectionIssues([` ${IMPLICIT_SPOKE_HUB_ID} `]).join("\n")).toMatch(
      /reserved for the implicit Spoke Hub/,
    );
    expect(spokeCollectionIssues([IMPLICIT_SPOKE_ID]).join("\n")).toMatch(/reserved for the legacy/);

    const sites = sitesFor("ww");
    expect(hubMembershipIssues(sites, [{ site: "ww", hub: IMPLICIT_HUB_ID }]).join("\n")).toMatch(
      /reserved for the implicit Hub/,
    );

    // …while an ordinary id that merely LOOKS like the marker is an ordinary id: case is never normalized.
    expect(spokeHubCollectionIssues(["IMPLICIT"])).toEqual([]);
  });

  it("ACCEPTS a local Spoke id reused in another Hub, and resolves it only by composite reference", () => {
    const collection: InstallationSpokeHubCollection = [
      hubOf("one", [spokeOf("global", "foundation.example.test", ["ww"])]),
      hubOf("two", [spokeOf("global", "germany.example.test", ["de"])]),
    ];

    // The SAME local id in two Hubs is legal — a Hub owns its membership…
    expect(identifiedSpokeHubCollectionIssues(collection)).toEqual([]);
    expect(isCoherentIdentifiedSpokeHubCollection(collection)).toBe(true);

    // …and that is precisely why an id alone can never name a Spoke.
    const first: IdentifiedSpokeRef = { spokeHubId: "one", spokeId: "global" };
    const second: IdentifiedSpokeRef = { spokeHubId: "two", spokeId: "global" };
    expect(spokeByRef(collection, first)?.identity.canonicalHostname).toBe("foundation.example.test");
    expect(spokeByRef(collection, second)?.identity.canonicalHostname).toBe("germany.example.test");
    expect(spokeByRef(collection, first)).not.toBe(spokeByRef(collection, second));

    // NO FALLBACK: an undeclared Hub, or an undeclared id inside a declared Hub, answers nothing.
    expect(spokeByRef(collection, { spokeHubId: "three", spokeId: "global" })).toBeNull();
    expect(spokeByRef(collection, { spokeHubId: "one", spokeId: "absent" })).toBeNull();
    expect(spokeByRef([], { spokeHubId: "one", spokeId: "global" })).toBeNull();
  });

  it("refuses an empty collection, a duplicate Hub id and an empty Hub", () => {
    expect(identifiedSpokeHubCollectionIssues([]).join("\n")).toMatch(/needs at least one Spoke Hub/);
    expect(spokeHubCollectionIssues([]).join("\n")).toMatch(/needs at least one Spoke Hub/);

    const duplicateHubs: InstallationSpokeHubCollection = [
      hubOf("one", [spokeOf("a", "a.example.test", ["ww"])]),
      hubOf("one", [spokeOf("b", "b.example.test", ["de"])]),
    ];
    expect(identifiedSpokeHubCollectionIssues(duplicateHubs).join("\n")).toMatch(
      /Spoke Hub #2 repeats id "one", already declared by Spoke Hub #1/,
    );

    // An AUTHORED Hub cannot be empty — and the sentence is the SPOKE-MEMBERSHIP authority's own.
    const emptyHub: InstallationSpokeHubCollection = [hubOf("empty", [])];
    expect(identifiedSpokeHubCollectionIssues(emptyHub).join("\n")).toMatch(
      /Spoke Hub "empty": The Spoke Hub coordinates no Spoke/,
    );
  });

  it("refuses a duplicate SPOKE id INSIDE one Hub, naming the Hub that owns it", () => {
    const collection: InstallationSpokeHubCollection = [
      hubOf("one", [
        spokeOf("global", "a.example.test", ["ww"]),
        spokeOf("global", "b.example.test", ["de"]),
      ]),
      hubOf("two", []),
    ];

    const issues = identifiedSpokeHubCollectionIssues(collection).join("\n");
    expect(issues).toMatch(/Spoke Hub "one": duplicate Spoke id "global"/);
    // …while the OTHER Hub's own problem is reported against ITS name: in a collection of Hubs, a bare
    // `Spoke "…"` sentence could belong to either.
    expect(issues).toMatch(/Spoke Hub "two": The Spoke Hub coordinates no Spoke/);
  });

  it("accepts ONE exact hostname claimed in TWO Hubs as a SHARED host, and never misreads a duplicate inside one", () => {
    const sharedHost: InstallationSpokeHubCollection = [
      hubOf("one", [spokeOf("global", "shared.example.test", ["ww"])]),
      hubOf("two", [spokeOf("de", "shared.example.test", ["de"])]),
    ];
    // Two Hubs publishing on one hostname is a legitimate SHARED host (`D31`): the collection is coherent,
    // and the hostname is classified rather than refused.
    expect(identifiedSpokeHubCollectionIssues(sharedHost)).toEqual([]);
    expect(isCoherentIdentifiedSpokeHubCollection(sharedHost)).toBe(true);
    expect([...sharedHostnamesAcrossHubs(sharedHost)]).toEqual(["shared.example.test"]);

    // Dispatch answers NOTHING on it — not the first Hub's member, not the second's.
    const claims = sharedHost.map((hub) => ({ spokeHubId: hub.identity.id, spokes: hub.spokes }));
    expect(resolveSpokeRefFromHost(claims, "shared.example.test")).toBeNull();

    // The SAME hostname stated twice WITHIN one Hub remains a DECLARATION defect (the existing authority's
    // finding), and must never be misread as a shared host: one Spoke naming a claim twice names ONE
    // claimant, so the classification stays empty.
    const repeatedInsideOneHub: InstallationSpokeHubCollection = [
      {
        identity: { id: "one" },
        spokes: [
          {
            identity: {
              id: "global",
              canonicalHostname: "repeated.example.test",
              hostnameClaims: ["repeated.example.test", "repeated.example.test"],
            },
            hubs: partitionSitesIntoHubs(sitesFor("ww")),
          },
        ],
      },
    ];
    const repeatedIssues = identifiedSpokeHubCollectionIssues(repeatedInsideOneHub).join("\n");
    expect(repeatedIssues).toMatch(/is stated more than once/);
    expect([...sharedHostnamesAcrossHubs(repeatedInsideOneHub)]).toEqual([]);
  });

  it("COMPOSES the per-Hub rules instead of restating them", () => {
    // Two Hubs, each incoherent in its own way. The expected issues are EXACTLY the existing authority's
    // sentences, each quoted with its Hub — which is what "composed, never copied" means operationally.
    const noDefault: IdentifiedSpokeHub = hubOf("one", [
      {
        identity: {
          id: "global",
          canonicalHostname: "one.example.test",
          hostnameClaims: ["one.example.test"],
        },
        // No Site is the default: the population is real, and the DESIGNATION is simply absent.
        hubs: partitionSitesIntoHubs(sitesFor("ww", "de").map((site) => ({ ...site, isDefault: false }))),
      },
    ]);
    const twoDefaults: IdentifiedSpokeHub = hubOf("two", [
      {
        identity: {
          id: "de",
          canonicalHostname: "two.example.test",
          hostnameClaims: ["two.example.test"],
        },
        hubs: [
          {
            identity: { id: "primary" },
            sites: sitesFor("ww", "de").map((site) => ({ ...site, isDefault: true })),
          },
        ],
      },
    ]);

    expect(spokeHubIssues(noDefault).join("\n")).toMatch(/has no default Site/);
    expect(spokeHubIssues(twoDefaults).join("\n")).toMatch(/has 2 default Sites/);
    expect(identifiedSpokeHubCollectionIssues([noDefault, twoDefaults])).toEqual([
      ...spokeHubIssues(noDefault).map((issue) => `Spoke Hub "one": ${issue}`),
      ...spokeHubIssues(twoDefaults).map((issue) => `Spoke Hub "two": ${issue}`),
    ]);
  });
});
