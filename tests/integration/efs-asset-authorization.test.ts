import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";

import { deploymentEnvironment, resolveDeploymentForBuild } from "@/config/deployment-build.mjs";
import { SPOKE_SELECTION_HEADER } from "@/config/spoke-selection";

import { materializeSharedHostInstallation } from "../support/shared-host-installation.mjs";

/**
 * PUBLIC-ASSET AUTHORIZATION IS PUBLICATION RIGHTS, NOT DECLARATION (R03 Task A)
 * ============================================================================
 *
 * `declared` is not `published`. This suite drives the REAL request boundary (`@/proxy`) against a
 * projection the REAL build harness produced from the REAL manifest (`resolveDeploymentForBuild` →
 * `deploymentEnvironment`), so it proves the whole chain rather than a hand-written table:
 *
 *     efs/manifest.json  →  build projection  →  proxy decision  →  200 / 404
 *
 * Every case asserts the authorization OUTCOME. None of them asserts that a file merely exists.
 */
const SHARED = "shared.example.test";
const ALPHA_ALIAS = "alpha-alias.example.test";
const INTRODUCED = "introduced.example.test";

const E_A = "e_00000000000000000000000a11";
const E_B = "e_00000000000000000000000a12";
const E_C = "e_00000000000000000000000a13";
const E_D = "e_00000000000000000000000a14";
const E_E = "e_00000000000000000000000a15";

/**
 * Two identified Spoke Hubs, five publishing Spokes, one declared-but-UNPUBLISHED Spoke, and all three
 * cardinalities of informational `site.url` — none of which may influence authorization.
 */
const MEMBERS = [
  {
    spokeHubId: "group-one",
    spokeId: "alpha",
    marker: "Alpha",
    prefix: "alpha",
    entityId: E_A,
    siteUrlHost: SHARED,
    // A publication that selects this Spoke's own presentation Site.
    presentationSiteCode: "ww",
    publications: [
      { prefix: "alpha", entityId: E_A, host: SHARED },
      // The SAME Spoke publishing on a SECOND host, as an ALIAS binding.
      { prefix: "alpha-alias", entityId: E_A, host: ALPHA_ALIAS, canonical: false },
    ],
  },
  {
    spokeHubId: "group-one",
    spokeId: "beta",
    marker: "Beta",
    prefix: "beta",
    entityId: E_B,
    // The ONLY Spoke naming the alias host informationally. It publishes on its OWN host, never here.
    siteUrlHost: ALPHA_ALIAS,
    publications: [{ prefix: "beta", entityId: E_B, host: "beta-only.example.test" }],
  },
  {
    spokeHubId: "group-one",
    spokeId: "gamma",
    marker: "Gamma",
    prefix: "gamma",
    entityId: E_C,
    siteUrlHost: SHARED,
    publications: [{ prefix: "gamma", entityId: E_C, host: SHARED }],
  },
  {
    spokeHubId: "group-two",
    spokeId: "delta",
    marker: "Delta",
    prefix: "delta",
    entityId: E_D,
    siteUrlHost: "elsewhere.example.test",
    publications: [
      { prefix: "delta", entityId: E_D, host: SHARED },
      { prefix: "fresh", entityId: E_D, host: INTRODUCED },
    ],
  },
  {
    spokeHubId: "group-two",
    spokeId: "epsilon",
    marker: "Epsilon",
    prefix: "epsilon",
    entityId: E_E,
    siteUrlHost: SHARED,
    publications: [{ prefix: "epsilon", entityId: E_E, host: SHARED }],
  },
  {
    // DECLARED and composed, but it publishes NOTHING: its namespace must not be public anywhere.
    spokeHubId: "group-two",
    spokeId: "unpublished",
    marker: "Unpublished",
    prefix: "unpublished",
    entityId: "e_00000000000000000000000a16",
    siteUrlHost: SHARED,
    publications: [],
  },
];

const installation = materializeSharedHostInstallation({ members: MEMBERS });

// The REAL build seam produces the projection the boundary reads — not a fixture-authored table.
const resolved = resolveDeploymentForBuild(
  {
    FOUNDATION_DEPLOYMENT_ROOT: installation.root,
    FOUNDATION_EFS_MANIFEST: installation.efsManifestFile,
  },
  process.cwd(),
);
for (const [key, value] of Object.entries(deploymentEnvironment(resolved))) {
  process.env[key] = value;
}
process.env.FOUNDATION_EFS_MANIFEST = installation.efsManifestFile;
process.env.FOUNDATION_EFS_CAPSULE = installation.capsule;
vi.resetModules();

const { proxy } = await import("@/proxy");

afterAll(() => installation.cleanup());

/** Drive the real boundary for one asset path and host. */
function asset(host: string, path: string, headers: Record<string, string> = {}) {
  return proxy(
    new NextRequest(new URL(`http://${host}${path}`), { headers: { host, ...headers } }),
  );
}

/** The boundary let the request through to static serving. */
function allowed(response: Response): boolean {
  return response.status === 200 && response.headers.get("x-middleware-next") === "1";
}

function refused(response: Response): boolean {
  return response.status === 404;
}


/** The runtime segment of one composite Spoke, taken from the build's OWN routing description. */
async function segmentOf(spokeHubId: string, spokeId: string): Promise<string> {
  const { hostRoutingForBuild } = await import("@/config/spoke-routing");
  const entry = hostRoutingForBuild().spokes.find(
    (candidate) => candidate.spokeHubId === spokeHubId && candidate.id === spokeId,
  );
  if (entry === undefined) throw new Error(`no runtime entry for ${spokeHubId}/${spokeId}`);
  return entry.runtimeSegment;
}

describe("a Spoke's presentation namespace is authorized by PUBLICATION, not declaration (R03)", () => {
  it("authorizes every Spoke published on a host several informational site.urls name", async () => {
    for (const [hub, id] of [
      ["group-one", "alpha"],
      ["group-one", "gamma"],
      ["group-two", "epsilon"],
    ] as const) {
      const segment = await segmentOf(hub, id);
      expect(allowed(asset(SHARED, `/spokes/${segment}/assets/brand/logo.svg`)), id).toBe(true);
    }
  });

  it("authorizes a publication on a host exactly ONE informational site.url names", async () => {
    // `beta` alone names this host; the publisher is `alpha`, and its binding is the authority.
    const alpha = await segmentOf("group-one", "alpha");
    const beta = await segmentOf("group-one", "beta");
    expect(allowed(asset(ALPHA_ALIAS, `/spokes/${alpha}/assets/brand/logo.svg`))).toBe(true);
    // `beta` has no publication on this host, so it has no namespace claim there.
    expect(refused(asset(ALPHA_ALIAS, `/spokes/${beta}/assets/brand/logo.svg`))).toBe(true);
  });

  it("authorizes a publication on a host NO informational site.url names", async () => {
    const delta = await segmentOf("group-two", "delta");
    const alpha = await segmentOf("group-one", "alpha");
    expect(allowed(asset(INTRODUCED, `/spokes/${delta}/assets/brand/logo.svg`))).toBe(true);
    expect(refused(asset(INTRODUCED, `/spokes/${alpha}/assets/brand/logo.svg`))).toBe(true);
  });

  it("authorizes ONE Spoke publishing on several hosts, including an alias binding", async () => {
    const alpha = await segmentOf("group-one", "alpha");
    expect(allowed(asset(SHARED, `/spokes/${alpha}/assets/brand/logo.svg`))).toBe(true);
    expect(allowed(asset(ALPHA_ALIAS, `/spokes/${alpha}/assets/brand/logo.svg`))).toBe(true);
  });

  it("refuses a DECLARED Spoke that publishes nowhere on this host", async () => {
    const unpublished = await segmentOf("group-two", "unpublished");
    const beta = await segmentOf("group-one", "beta");
    // Composed into the runtime, its namespace exists — and it is still refused.
    expect(refused(asset(SHARED, `/spokes/${unpublished}/assets/brand/logo.svg`))).toBe(true);
    // `beta` publishes elsewhere; on the shared host it has no binding.
    expect(refused(asset(SHARED, `/spokes/${beta}/assets/brand/logo.svg`))).toBe(true);
  });

  it("keeps two Spokes with identical asset names in separate namespaces", async () => {
    const alpha = await segmentOf("group-one", "alpha");
    const gamma = await segmentOf("group-one", "gamma");
    expect(alpha).not.toBe(gamma);
    expect(allowed(asset(SHARED, `/spokes/${alpha}/assets/brand/logo.svg`))).toBe(true);
    expect(allowed(asset(SHARED, `/spokes/${gamma}/assets/brand/logo.svg`))).toBe(true);
  });

  it("refuses a foreign or unknown namespace", async () => {
    for (const segment of ["unknown-spoke", "not-a-spoke", "group-one"]) {
      expect(refused(asset(SHARED, `/spokes/${segment}/assets/brand/logo.svg`)), segment).toBe(true);
    }
  });

  it("refuses a namespace name that could climb out of itself", async () => {
    // A WHOLE `%2e%2e` dot-segment never reaches the boundary at all: URL parsing removes it, so it cannot
    // address a namespace. What CAN reach the boundary is an ENCODED separator inside the segment, and that
    // is refused because a namespace name is one path segment.
    for (const path of [
      "/spokes/group-one-alpha%2F..%2Fgroup-two-delta/assets/brand/logo.svg",
      "/spokes/..%2Fgroup-two-delta/assets/brand/logo.svg",
      "/spokes//assets/brand/logo.svg",
      "/spokes/%20/assets/brand/logo.svg",
    ]) {
      expect(refused(asset(SHARED, path)), path).toBe(true);
    }
  });

  it("refuses a host that only an informational site.url names, when EFS publishes nothing there", async () => {
    // `delta` names `elsewhere.example.test` as its origin, and NO publication claims that host. Under the
    // released host-only rule that host would select `delta` and serve its artwork. Because EFS controls this
    // deployment, an informational origin grants nothing: the host has no publication, so it is refused.
    const delta = await segmentOf("group-two", "delta");
    expect(refused(asset("elsewhere.example.test", `/spokes/${delta}/assets/logo-header.svg`))).toBe(true);
  });

  it("does not forward a forged private selector upstream", async () => {
    const alpha = await segmentOf("group-one", "alpha");
    const delta = await segmentOf("group-two", "delta");
    const response = asset(SHARED, `/spokes/${alpha}/assets/brand/logo.svg`, {
      [SPOKE_SELECTION_HEADER]: delta,
    });
    expect(allowed(response)).toBe(true);
    // The boundary's own channel is not a place a client may write.
    const overridden = (response.headers.get("x-middleware-override-headers") ?? "").toLowerCase();
    expect(overridden).not.toContain(SPOKE_SELECTION_HEADER.toLowerCase());
  });
});
