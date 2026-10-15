import { describe, expect, it } from "vitest";

import {
  IMPLICIT_HUB_ID,
  hubForSiteCode,
  hubMembershipIssues,
  partitionSitesIntoHubs,
  resolveSpokeFromHost,
  spokeHubIssues,
  type Hub,
  type HubId,
  type HubIdentity,
  type SiteHub,
  type SiteHubId,
  type SiteHubIdentity,
  type Spoke,
  type SpokeHub,
} from "@/core/spoke";
import { resolveSites, type ResolvedSite } from "@/core/site";

/**
 * THE EXPLICIT SITE HUB VOCABULARY (FOUNDATION-ID-M2)
 * ==================================================
 *
 * FOUNDATION-ID-M2 gives the two ORGANISATIONAL layers the names the rest of the platform already used: a
 * SITE HUB is the INNER grouping of Sites inside ONE Spoke (`Hub`), and a SPOKE HUB is the OUTER coordinator
 * of an installation's Spokes (`SpokeHub`). The three new names are ALIASES of the same domain entity —
 * vocabulary, never a second model, and never a behavioural change.
 *
 * What this file proves, in the order it proves it:
 *
 *   1. the three new names are usable through the PUBLIC domain entry point (`@/core/spoke`);
 *   2. they are type-compatible with `Hub` / `HubId` / `HubIdentity`, in BOTH directions;
 *   3. they leave NO second runtime grouping model behind;
 *   4. implicit grouping is unchanged (no authored membership → ONE implicit Site Hub holding every Site);
 *   5. explicit grouping is unchanged (the authored partition, all-or-none, the reserved id);
 *   6. neither Spoke Hub ownership nor the Spoke's resolved Site population is affected.
 *
 * It deliberately does not restate the suites that already own those behaviours (`spoke-hub-membership`,
 * `spoke-site-composition`, `spoke-hub`): what is under test here is the VOCABULARY, and every assertion is the
 * smallest one that would fail if the vocabulary had introduced a second model.
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
function spokeOf(
  id: string,
  canonicalHostname: string,
  assignments: readonly { readonly site: string; readonly hub: string }[],
): Spoke {
  const sites = sitesFor(...assignments.map((assignment) => assignment.site));
  return {
    identity: { id, canonicalHostname, hostnameClaims: [canonicalHostname] },
    hubs: partitionSitesIntoHubs(sites, assignments),
  };
}

function spokeHubOf(spokes: readonly Spoke[]): SpokeHub {
  return { spokes };
}

/** One domain, two Site Hubs, disjoint Site codes, ONE default Site across them (`ww`). */
function exampleSpoke(): Spoke {
  return spokeOf("example", "example.com", [
    { site: "ww", hub: "primary" },
    { site: "de", hub: "primary" },
    { site: "ca", hub: "north-america" },
  ]);
}

/** Mutual assignability, EXERCISED rather than described: a type alias erases at runtime. */
function asSiteHub(hub: Hub): SiteHub {
  return hub;
}

function asHub(siteHub: SiteHub): Hub {
  return siteHub;
}

function asSiteHubId(id: HubId): SiteHubId {
  return id;
}

function asHubId(id: SiteHubId): HubId {
  return id;
}

function asSiteHubIdentity(identity: HubIdentity): SiteHubIdentity {
  return identity;
}

function asHubIdentity(identity: SiteHubIdentity): HubIdentity {
  return identity;
}

describe("the explicit Site Hub vocabulary", () => {
  it("is usable through the public `@/core/spoke` entry point", () => {
    // Every name below arrives from the BARREL — this file imports no inner module — so the vocabulary is
    // only usable at all if the entry point really re-exports it.
    const spoke: Spoke = exampleSpoke();
    const siteHubs: readonly SiteHub[] = spoke.hubs;
    const identity: SiteHubIdentity = siteHubs[0].identity;
    const id: SiteHubId = identity.id;

    // …and it flows through an EXISTING pure function, whose own signature still says `Hub`.
    const owner: SiteHub | null = hubForSiteCode(spoke, "ww");

    expect(siteHubs.map((hub) => hub.identity.id)).toEqual(["primary", "north-america"]);
    expect(id).toBe("primary");
    expect(owner).toBe(siteHubs[0]);
  });

  it("is type-compatible with `Hub`, `HubId` and `HubIdentity` in BOTH directions", () => {
    const hub: Hub = exampleSpoke().hubs[0];
    const siteHub: SiteHub = hub;
    expect(asHub(siteHub)).toBe(hub);
    expect(asSiteHub(hub)).toBe(hub);

    const identity: HubIdentity = hub.identity;
    expect(asSiteHubIdentity(identity)).toBe(identity);
    expect(asHubIdentity(asSiteHubIdentity(identity))).toBe(identity);

    const id: HubId = identity.id;
    expect(asSiteHubId(id)).toBe(id);
    expect(asHubId(asSiteHubId(id))).toBe(id);
  });

  it("leaves no second runtime grouping model behind", async () => {
    // A type alias emits NO runtime artefact. Had a runtime entity been introduced, it would be an export of
    // the domain entry point — so the entry point is ASKED rather than trusted.
    const runtime = (await import("@/core/spoke")) as Record<string, unknown>;
    expect(Object.keys(runtime).filter((name) => name.startsWith("SiteHub"))).toEqual([]);

    // The grouping model is still the SAME two runtime authorities and the SAME reserved marker.
    expect(typeof runtime.partitionSitesIntoHubs).toBe("function");
    expect(typeof runtime.hubForSiteCode).toBe("function");
    expect(runtime.IMPLICIT_HUB_ID).toBe(IMPLICIT_HUB_ID);

    // …and a Site Hub is still exactly an identity plus the Sites it owns: no extra leaf, no registry.
    const siteHub: SiteHub = exampleSpoke().hubs[0];
    expect(Object.keys(siteHub).sort()).toEqual(["identity", "sites"]);
    expect(Object.keys(siteHub.identity)).toEqual(["id"]);
  });

  it("leaves IMPLICIT grouping unchanged: no authored membership → ONE implicit Site Hub", () => {
    const sites = sitesFor("ww", "de");
    const hubs: readonly SiteHub[] = partitionSitesIntoHubs(sites);

    expect(hubMembershipIssues(sites)).toEqual([]);
    expect(hubs).toHaveLength(1);
    expect(hubs[0].identity.id).toBe(IMPLICIT_HUB_ID);
    // Every resolved Site, carried through untouched: no clone, no re-resolution, the same values.
    expect(hubs[0].sites).toEqual(sites);
    expect(hubs[0].sites).toBe(sites);
  });

  it("leaves EXPLICIT grouping unchanged: the authored partition, all-or-none, the reserved id", () => {
    const sites = sitesFor("ww", "de", "ca");
    const hubs = partitionSitesIntoHubs(sites, [
      { site: "ww", hub: "primary" },
      { site: "de", hub: "primary" },
      { site: "ca", hub: "north-america" },
    ]);

    expect(hubs.map((hub) => hub.identity.id)).toEqual(["primary", "north-america"]);
    expect(hubs.map((hub) => hub.sites.map((site) => site.code))).toEqual([["ww", "de"], ["ca"]]);

    // The two refusals this slice has always applied are untouched by the new names.
    expect(hubMembershipIssues(sites, [{ site: "ww", hub: "primary" }]).join("\n")).toMatch(/all or none/);
    expect(hubMembershipIssues(sites, [{ site: "ww", hub: IMPLICIT_HUB_ID }]).join("\n")).toMatch(/reserved/);
  });

  it("changes neither Spoke Hub ownership nor the Spoke's resolved Site population", () => {
    const spoke: Spoke = exampleSpoke();
    const spokeHub: SpokeHub = spokeHubOf([spoke]);

    // Ownership is what it always was: the same grouping answers, and an unowned code still answers nothing.
    expect(hubForSiteCode(spoke, "ww")?.identity.id).toBe("primary");
    expect(hubForSiteCode(spoke, "ca")?.identity.id).toBe("north-america");
    expect(hubForSiteCode(spoke, "fr")).toBeNull();

    // The population is exactly the resolution's own values, unioned across the Site Hubs: the vocabulary
    // added nothing, moved nothing and re-resolved nothing.
    const population = spoke.hubs.flatMap((hub) => hub.sites);
    expect(population).toEqual(sitesFor("ww", "de", "ca"));
    expect(population.filter((site) => site.isDefault).map((site) => site.code)).toEqual(["ww"]);

    // And the UNCHANGED entry point still decides coherence and hostname resolution.
    expect(spokeHubIssues(spokeHub)).toEqual([]);
    expect(resolveSpokeFromHost(spokeHub, "example.com")?.spokeId).toBe("example");
    expect(resolveSpokeFromHost(spokeHub, "sub.example.com")).toBeNull();
  });
});
