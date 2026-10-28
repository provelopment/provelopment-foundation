import { afterAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ headers: state.headers, get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { installationRuntimeIndex } from "@/config/installation-runtime";

import { selectEfsInstallation } from "../support/efs-installation";
import { materializeSharedHostInstallation } from "../support/shared-host-installation.mjs";

/**
 * `site.url` IS INFORMATIONAL — IT MAY NOT VETO AN EXPLICITLY OWNED PUBLICATION (R02)
 * =================================================================================
 *
 * The accepted contract (`D31`) makes the explicit EFS publication binding the authority for a public
 * address. A Spoke's `site.url` describes the origin it is served from; it is not a claim of exclusive
 * ownership that another Spoke's declared binding must satisfy.
 *
 * The superseded rule refused a binding whenever exactly ONE other Spoke's informational hostname matched
 * the binding's host. That reproduced the original contradiction in a narrower shape and made this
 * topology impossible — the very topology the order names:
 *
 *     Spoke A  site.url = https://authority.example.test   publication = authority.example.test/alpha
 *     Spoke B  site.url = https://other.example.test       publication = authority.example.test/beta
 *
 * ONE Installation covers every case the order requires:
 *
 *   · `authority.example.test` is named by TWO Spokes' `site.url` ........... several matches
 *   · `other.example.test`     is named by exactly ONE Spoke's `site.url` ... exactly one match
 *   · `introduced.example.test` is named by NOBODY .......................... no match
 *   · local id `alpha` exists in BOTH Hubs .................................. composite identity
 *   · Entity e1 is published by Spoke `alpha` and by Spoke `multi` .......... Entity, many Spokes
 *   · Spoke `multi` publishes Entity e1 AND Entity e3 ....................... Spoke, many Entities
 */
const AUTHORITY_HOST = "authority.example.test";
const SOLE_CLAIM_HOST = "other.example.test";
const SEVERAL_CLAIM_HOST = "several.example.test";
const INTRODUCED_HOST = "introduced.example.test";

const ENTITY_ALPHA = "e_00000000000000000000000011";
const ENTITY_BETA = "e_00000000000000000000000012";
const ENTITY_GAMMA = "e_00000000000000000000000013";

/**
 * The four cardinalities the order names, each on its OWN host, so one Installation proves all of them:
 *
 *   authority.example.test  named by exactly ONE Spoke (`hub-one/alpha`)  → the R02 scenario
 *   other.example.test      named by exactly ONE Spoke (`hub-one/beta`)   → same cardinality, other owner
 *   several.example.test    named by TWO Spokes                           → several matches
 *   introduced.example.test named by nobody                               → no match
 */
const MEMBERS = [
  {
    spokeHubId: "hub-one",
    spokeId: "alpha",
    marker: "Hub One Alpha",
    prefix: "alpha",
    entityId: ENTITY_ALPHA,
    siteUrlHost: AUTHORITY_HOST,
    publications: [
      { prefix: "alpha", entityId: ENTITY_ALPHA, host: AUTHORITY_HOST },
      { prefix: "alpha-on-sole", entityId: ENTITY_ALPHA, host: SOLE_CLAIM_HOST },
      { prefix: "fresh", entityId: ENTITY_ALPHA, host: INTRODUCED_HOST },
    ],
  },
  {
    spokeHubId: "hub-one",
    spokeId: "beta",
    marker: "Hub One Beta",
    prefix: "beta",
    entityId: ENTITY_BETA,
    siteUrlHost: SOLE_CLAIM_HOST,
    publications: [
      // THE R02 CASE: `hub-one/alpha` alone names `authority.example.test`; this binding belongs to beta.
      { prefix: "beta", entityId: ENTITY_BETA, host: AUTHORITY_HOST },
      { prefix: "several", entityId: ENTITY_BETA, host: SEVERAL_CLAIM_HOST },
    ],
  },
  {
    // SAME local Spoke id as `hub-one/alpha`, in a different Hub: only the matching Hub may resolve.
    spokeHubId: "hub-two",
    spokeId: "alpha",
    marker: "Hub Two Alpha",
    prefix: "gamma",
    entityId: ENTITY_GAMMA,
    siteUrlHost: SEVERAL_CLAIM_HOST,
    publications: [{ prefix: "gamma", entityId: ENTITY_GAMMA, host: AUTHORITY_HOST }],
  },
  {
    spokeHubId: "hub-two",
    spokeId: "multi",
    marker: "Hub Two Multi",
    prefix: "delta",
    entityId: ENTITY_ALPHA,
    siteUrlHost: SEVERAL_CLAIM_HOST,
    publications: [
      // The SAME Entity `hub-one/alpha` publishes — one Entity, two publishing Spokes.
      { prefix: "delta", entityId: ENTITY_ALPHA, host: AUTHORITY_HOST },
      { prefix: "epsilon", entityId: ENTITY_GAMMA, host: AUTHORITY_HOST },
    ],
  },
];

const installation = materializeSharedHostInstallation({ members: MEMBERS });
selectEfsInstallation(installation.root);
process.env.FOUNDATION_EFS_MANIFEST = installation.efsManifestFile;
process.env.FOUNDATION_EFS_CAPSULE = installation.capsule;
vi.resetModules();

const efs = await import("@/app/[[...segments]]/efs-request");
const page = await import("@/app/[[...segments]]/page");
const sitemap = (await import("@/app/sitemap")).default;
const robots = (await import("@/app/robots")).default;

afterAll(() => installation.cleanup());

function at(host: string): void {
  state.headers.set("host", host);
}

function about(prefix: string): string[] {
  return [prefix, "en-001", "about"];
}

/** Resolve one publication and assert which composite Spoke owns it. */
async function expectOwner(host: string, prefix: string, spokeHubId: string, spokeId: string, entityId: string) {
  at(host);
  const view = await efs.efsViewForCurrentRequest(about(prefix));
  expect(view, `${host}/${prefix}`).not.toBeNull();
  expect(view?.publication.spokeHubId).toBe(spokeHubId);
  expect(view?.publication.spokeId).toBe(spokeId);
  expect(view?.publication.entityId).toBe(entityId);
  return view;
}

describe("an informational site.url may not veto an explicitly owned publication (R02)", () => {
  it("composes the Installation: two Hubs, one local id in each, five publications", () => {
    const index = installationRuntimeIndex(installation.root);
    expect(index.mode).toBe("hubs");
    expect(index.spokes).toHaveLength(4);
    // Composite identity keeps the two `alpha` Spokes distinct.
    expect(new Set(index.spokes.map((spoke) => spoke.runtimeSegment)).size).toBe(4);
  });

  it("serves a binding on a host SEVERAL Spokes' site.url also names", async () => {
    // `several.example.test` is named by `hub-two/alpha` AND `hub-two/multi`; the publication is beta's.
    await expectOwner(SEVERAL_CLAIM_HOST, "several", "hub-one", "beta", ENTITY_BETA);
  });

  it("serves a binding on a host exactly ONE other Spoke's site.url names — the R02 scenario", async () => {
    // `hub-one/beta` authors `site.url = other.example.test` and publishes `authority.example.test/beta`.
    // `hub-one/alpha` names `authority.example.test` informationally. The binding decides; no veto.
    await expectOwner(AUTHORITY_HOST, "beta", "hub-one", "beta", ENTITY_BETA);
  });

  it("serves a binding on a host NO Spoke's site.url names", async () => {
    await expectOwner(INTRODUCED_HOST, "fresh", "hub-one", "alpha", ENTITY_ALPHA);
  });

  it("serves a binding on a host a DIFFERENT Spoke alone names informationally", async () => {
    // `other.example.test` is named only by `hub-one/beta`; the publication belongs to `hub-one/alpha`.
    await expectOwner(SOLE_CLAIM_HOST, "alpha-on-sole", "hub-one", "alpha", ENTITY_ALPHA);
  });

  it("keeps same-named local Spoke ids in different Hubs distinct", async () => {
    // `alpha` exists in BOTH Hubs. The Hub half decides, so neither borrows the other's publication.
    await expectOwner(AUTHORITY_HOST, "gamma", "hub-two", "alpha", ENTITY_GAMMA);
    await expectOwner(AUTHORITY_HOST, "alpha", "hub-one", "alpha", ENTITY_ALPHA);
  });

  it("serves an Entity published by MORE THAN ONE Spoke at each publication", async () => {
    // Entity `ENTITY_ALPHA` is published by `hub-one/alpha` and by `hub-two/multi`.
    await expectOwner(AUTHORITY_HOST, "alpha", "hub-one", "alpha", ENTITY_ALPHA);
    await expectOwner(AUTHORITY_HOST, "delta", "hub-two", "multi", ENTITY_ALPHA);
  });

  it("serves several Entities published by ONE Spoke", async () => {
    await expectOwner(AUTHORITY_HOST, "delta", "hub-two", "multi", ENTITY_ALPHA);
    await expectOwner(AUTHORITY_HOST, "epsilon", "hub-two", "multi", ENTITY_GAMMA);
  });

  it("agrees on metadata, discovery and assets for the R02 scenario's owner", async () => {
    at(AUTHORITY_HOST);
    const metadata = await page.generateMetadata({
      params: Promise.resolve({ segments: about("beta") }),
    });
    expect(metadata.alternates?.canonical).toBe(`https://${AUTHORITY_HOST}/beta/en-001/about`);

    const entries = await sitemap();
    for (const prefix of ["alpha", "beta", "gamma", "delta", "epsilon"]) {
      expect(entries.some((entry) => String(entry.url).includes(`/${prefix}/en-001`)), prefix).toBe(true);
    }
    expect((await robots()).sitemap).toBe(`https://${AUTHORITY_HOST}/sitemap.xml`);
  });

  it("still refuses an explicit publication COLLISION on one host and prefix", async () => {
    // The correction removed a hostname VETO. It did NOT weaken the explicit collision check: two
    // publications claiming the same host and the same whole-segment prefix are still refused
    // (`bindingIssues`), because that address is genuinely ambiguous.
    const { validateEfsManifest } = await import("@/config/efs/manifest");
    const document = JSON.parse(
      await (await import("node:fs/promises")).readFile(installation.efsManifestFile, "utf8"),
    ) as {
      entities: unknown[];
      publications: Array<{ id: string; bindings: Array<Record<string, unknown>> }>;
    };
    const [first, second] = document.publications;
    second.bindings = [
      { ...first.bindings[0], id: "colliding-binding" },
    ];
    const validated = validateEfsManifest(document);
    expect(validated.ok).toBe(false);
    expect(validated.issues.join(" ")).toMatch(/host|prefix|collision|claim/i);
  });
});
