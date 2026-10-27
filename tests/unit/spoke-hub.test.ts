import { describe, expect, it } from "vitest";

import {
  isCoherentSpokeHub,
  resolveSpokeFromHost,
  sharedHostnames,
  spokeById,
  spokeHubIssues,
  type Hub,
  type Spoke,
  type SpokeHub,
} from "@/core/spoke";
import { resolveSites, type ResolvedSite } from "@/core/site";

/**
 * THE SPOKE HUB / SPOKE / HUB CONTRACT (FOUNDATION-MULTISITE-S1 / S1A)
 * =================================================================
 *
 * Four containers that are NOT each other: a Spoke Hub coordinates Spokes, a Spoke is ONE domain and
 * owns Hubs, a Hub groups Sites (modelled later), and a Site stays Foundation's existing `sites[]`
 * context.
 *
 * Hostname ownership is EXPLICIT and EXACT. A Spoke states its canonical hostname plus any exact
 * aliases, and a claim for `example.com` NEVER claims `sub.example.com` — so `sub.example.com` can
 * belong to a different Spoke. Two Spokes may also name the very SAME hostname: that is a SHARED host,
 * which is legitimate under `D31` because the explicit publication binding, not the host, names a public
 * address — and which dispatch answers with NOTHING.
 *
 * The module is unwired (nothing in the application imports it); these tests are its only consumer.
 */

/** REAL Foundation Site values — the same ones a deployment's `sites[]` resolves to (S2). */
function sitesFor(...codes: readonly string[]): readonly ResolvedSite[] {
  return resolveSites({
    input: codes.map((code) => ({ code })),
    defaultLocale: "en",
    locales: ["en"],
  }).sites;
}

/** A Hub carries an identity and the Sites it owns; S1's tests need a non-empty Site list. */
function hub(id: string): Hub {
  return { identity: { id }, sites: sitesFor("ww") };
}

function spokeOf(
  id: string,
  canonicalHostname: string,
  hostnameClaims: readonly string[],
  hubIds: readonly string[] = ["main"],
): Spoke {
  return { identity: { id, canonicalHostname, hostnameClaims }, hubs: hubIds.map(hub) };
}

function spokeHubOf(spokes: readonly Spoke[]): SpokeHub {
  return { spokes };
}

/**
 * Three coherent domains: one owning an apex AND a `www` alias, one owning an unrelated domain, and
 * one owning a SUBDOMAIN of the first domain's apex — which it may, because ownership is exact.
 */
function coherentSpokeHub(): SpokeHub {
  return spokeHubOf([
    spokeOf("example", "www.example.com", ["www.example.com", "example.com"]),
    spokeOf("other", "other.org", ["other.org"], ["group-a"]),
    spokeOf("sub", "sub.example.com", ["sub.example.com"]),
  ]);
}

describe("Spoke Hub / Spoke / Hub containment", () => {
  it("keeps the containers distinct: a Spoke owns Hubs, and a Hub carries only an identity", () => {
    const spokeHub = coherentSpokeHub();
    expect(spokeHub.spokes.map((spoke) => spoke.identity.id)).toEqual(["example", "other", "sub"]);
    expect(spokeHub.spokes[0].hubs.map((entry) => entry.identity.id)).toEqual(["main"]);
    expect(spokeHub.spokes[1].hubs.map((entry) => entry.identity.id)).toEqual(["group-a"]);
    // A Hub is an identity and nothing else — no hostname, no address, no Site yet.
    expect(Object.keys(hub("main").identity)).toEqual(["id"]);
  });

  it("finds a Spoke by id, and answers null for one that is not declared", () => {
    const spokeHub = coherentSpokeHub();
    expect(spokeById(spokeHub, "other")?.identity.canonicalHostname).toBe("other.org");
    expect(spokeById(spokeHub, "missing")).toBeNull();
  });
});

describe("hostname → Spoke resolution", () => {
  it("resolves the canonical host and an exact alias of one Spoke, and another domain to its own", () => {
    const spokeHub = coherentSpokeHub();
    expect(resolveSpokeFromHost(spokeHub, "www.example.com")?.spokeId).toBe("example");
    expect(resolveSpokeFromHost(spokeHub, "example.com")?.spokeId).toBe("example");
    expect(resolveSpokeFromHost(spokeHub, "other.org")?.spokeId).toBe("other");
    expect(resolveSpokeFromHost(spokeHub, "sub.example.com")?.spokeId).toBe("sub");
  });

  it("normalizes the raw host first, so every spelling of one domain resolves alike", () => {
    const spokeHub = coherentSpokeHub();
    for (const host of ["WWW.Example.COM", "www.example.com:3000", "www.example.com.", "  WWW.example.com.  "]) {
      const selection = resolveSpokeFromHost(spokeHub, host);
      expect(selection?.spokeId, host).toBe("example");
      // The selection reports the NORMALIZED hostname the decision was made from.
      expect(selection?.hostname, host).toBe("www.example.com");
      expect(selection?.reason, host).toBe("registered-hostname");
    }
  });

  it("never claims a name beneath a claimed host: `example.com` does NOT answer `sub.example.com`", () => {
    const spokeHub = spokeHubOf([spokeOf("apex", "www.example.com", ["www.example.com", "example.com"])]);
    expect(resolveSpokeFromHost(spokeHub, "example.com")?.spokeId).toBe("apex");
    expect(resolveSpokeFromHost(spokeHub, "www.example.com")?.spokeId).toBe("apex");
    expect(resolveSpokeFromHost(spokeHub, "sub.example.com")).toBeNull();
    expect(resolveSpokeFromHost(spokeHub, "foundation.example.com")).toBeNull();
    expect(resolveSpokeFromHost(spokeHub, "demo.example.com")).toBeNull();
    expect(resolveSpokeFromHost(spokeHub, "anything.example.com")).toBeNull();
  });

  it("returns null — not a default Spoke — for an unclaimed or absent host", () => {
    const spokeHub = coherentSpokeHub();
    for (const host of ["unknown.net", "notexample.com", "example.com.evil.com", "", "   ", null, undefined]) {
      expect(resolveSpokeFromHost(spokeHub, host), JSON.stringify(host)).toBeNull();
    }
  });
});

describe("Spoke Hub coherence — a hostname may be shared, and a shared host dispatches nothing", () => {
  it("reports nothing for a coherent Spoke Hub", () => {
    const spokeHub = coherentSpokeHub();
    expect(spokeHubIssues(spokeHub)).toEqual([]);
    expect(isCoherentSpokeHub(spokeHub)).toBe(true);
  });

  it("allows independent hosts beneath a claimed apex to belong to OTHER Spokes", () => {
    // The key consequence of exact ownership: `example.com` and `sub.example.com` may live in
    // different Spokes, because the first never claims the second.
    const independent = spokeHubOf([
      spokeOf("apex", "example.com", ["example.com"]),
      spokeOf("sub", "sub.example.com", ["sub.example.com"]),
    ]);
    expect(isCoherentSpokeHub(independent)).toBe(true);
  });

  it("requires at least one Spoke, one Hub per Spoke, and unique identities", () => {
    expect(spokeHubIssues(spokeHubOf([]))).toContain("The Spoke Hub coordinates no Spoke");

    const duplicateSpokes = spokeHubOf([
      spokeOf("same", "example.com", ["example.com"]),
      spokeOf("same", "other.org", ["other.org"]),
    ]);
    expect(spokeHubIssues(duplicateSpokes)).toContain('duplicate Spoke id "same"');

    const emptySpoke = spokeHubOf([spokeOf("empty", "example.com", ["example.com"], [])]);
    expect(spokeHubIssues(emptySpoke)).toContain('Spoke "empty" owns no Hub');

    const duplicateHubs = spokeHubOf([spokeOf("dup", "example.com", ["example.com"], ["main", "main"])]);
    expect(spokeHubIssues(duplicateHubs)).toContain('Spoke "dup": duplicate Hub id "main"');
  });

  it("requires every Spoke to claim its own canonical host, in the normalized spelling", () => {
    const unclaimedCanonical = spokeHubOf([spokeOf("odd", "example.com", ["www.example.com"])]);
    expect(spokeHubIssues(unclaimedCanonical)).toContain(
      'Spoke "odd": canonicalHostname "example.com" is not one of its own hostname claims',
    );

    const noClaims = spokeHubOf([spokeOf("silent", "example.com", [])]);
    expect(spokeHubIssues(noClaims)).toContain(
      'Spoke "silent" claims no hostname, so no request can ever reach it',
    );

    const notNormalized = spokeHubOf([spokeOf("loud", "Example.com", ["Example.com"])]);
    expect(
      spokeHubIssues(notNormalized).some((issue) => issue.includes("is not a normalized hostname")),
    ).toBe(true);
  });

  it("reports a hostname stated twice inside one Spoke", () => {
    const repeated = spokeHubOf([spokeOf("twice", "example.com", ["example.com", "example.com"])]);
    expect(spokeHubIssues(repeated)).toContain(
      'Spoke "twice": the hostname claim "example.com" is stated more than once',
    );
  });

  it("accepts the SAME exact hostname in two Spokes and classifies it as SHARED", () => {
    const shared = spokeHubOf([
      spokeOf("a", "example.com", ["example.com"]),
      spokeOf("b", "example.com", ["example.com"]),
    ]);
    // A hostname authored by two Spokes is NOT a malformed declaration. `D31` makes the explicit
    // publication binding the authority for a public address, so two Spokes may publish different path
    // prefixes of the SAME host; the hostname is then SHARED and names no owner.
    expect(spokeHubIssues(shared)).toEqual([]);
    expect(isCoherentSpokeHub(shared)).toBe(true);
    expect([...sharedHostnames(shared.spokes)]).toEqual(["example.com"]);

    // The classification is what dispatch asks, and dispatch answers NOTHING on a shared host: a first-match
    // rule would silently give every request on the host to whichever Spoke was declared first.
    expect(resolveSpokeFromHost(shared, "example.com")).toBeNull();
    // An EXCLUSIVE claim is untouched by that refusal.
    expect(resolveSpokeFromHost(coherentSpokeHub(), "example.com")?.spokeId).toBeTruthy();
  });
});

