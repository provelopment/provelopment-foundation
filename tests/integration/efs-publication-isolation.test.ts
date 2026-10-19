import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ headers: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (key: string) => state.headers.get(key) ?? null }),
}));

vi.mock("@/config/spoke-request", () => ({
  runtimeContextForCurrentRequest: async () => ({ id: "implicit" }),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));

import { efsViewForCurrentRequest } from "@/app/[[...segments]]/efs-request";
import type { EfsManifest } from "@/config/efs/manifest";

const roots: string[] = [];
const previous = { manifest: process.env.FOUNDATION_EFS_MANIFEST, capsule: process.env.FOUNDATION_EFS_CAPSULE };

function page(root: string, entityId: string, facet: string, site: string, title: string, body: string) {
  const directory = join(root, "capsule", entityId, facet, site, "pages", "home");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "en.json"), JSON.stringify({ title, description: body, body }), "utf8");
}

function install(manifest: EfsManifest, pages: readonly [string, string, string, string, string][]): string {
  const root = mkdtempSync(join(tmpdir(), "efs-isolation-"));
  roots.push(root);
  mkdirSync(join(root, "efs"), { recursive: true });
  writeFileSync(join(root, "efs", "manifest.json"), JSON.stringify(manifest), "utf8");
  for (const [entity, facet, site, title, body] of pages) page(root, entity, facet, site, title, body);
  return root;
}

function request(root: string, host: string) {
  process.env.FOUNDATION_EFS_MANIFEST = join(root, "efs", "manifest.json");
  process.env.FOUNDATION_EFS_CAPSULE = join(root, "capsule");
  state.headers.set("host", host);
  return efsViewForCurrentRequest(["en"]);
}

function publication(
  id: string,
  spokeId: string,
  entityId: string,
  facetId: string,
  host: string,
) {
  return {
    id,
    spokeId,
    entityId,
    facetId,
    bindings: [
      {
        id: `${id}-web`,
        host,
        prefix: [],
        entityId,
        facetId,
        siteIds: ["main"],
        siteMode: "closed" as const,
        defaultSiteId: "main",
        locales: ["en"],
        defaultLocale: "en",
        canonical: true,
      },
    ],
  };
}

function entity(id: string, facetIds: readonly string[], brand: string) {
  return {
    id,
    properties: { "brand.name": { value: brand, public: true } },
    facets: facetIds.map((facetId) => ({
      id: facetId,
      sites: [
        {
          id: "main",
          pages: [
            {
              id: "home",
              route: ["home"],
              representations: [{ locale: "en" }],
            },
          ],
        },
      ],
    })),
  };
}

describe("EFS publication isolation and many-to-many ownership (R04)", () => {
  beforeEach(() => state.headers.clear());
  afterEach(() => {
    process.env.FOUNDATION_EFS_MANIFEST = previous.manifest;
    process.env.FOUNDATION_EFS_CAPSULE = previous.capsule;
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it("keeps two Facets of one Entity and a second Entity distinct under one Spoke", async () => {
    const manifest: EfsManifest = {
      entities: [
        entity("e_00000000000000000000000011", ["acme", "restaurants"], "Acme"),
        entity("e_00000000000000000000000012", ["finance"], "Finance"),
      ],
      publications: [
        publication("acme", "shared-spoke", "e_00000000000000000000000011", "acme", "acme.example"),
        publication("restaurants", "shared-spoke", "e_00000000000000000000000011", "restaurants", "food.example"),
        publication("finance", "shared-spoke", "e_00000000000000000000000012", "finance", "finance.example"),
      ],
    };
    const root = install(manifest, [
      ["e_00000000000000000000000011", "acme", "main", "Acme", "Acme body"],
      ["e_00000000000000000000000011", "restaurants", "main", "Restaurants", "Food body"],
      ["e_00000000000000000000000012", "finance", "main", "Finance", "Finance body"],
    ]);
    const acme = await request(root, "acme.example");
    const food = await request(root, "food.example");
    const finance = await request(root, "finance.example");

    expect(acme?.entity.id).toBe(food?.entity.id);
    expect(acme?.facet.id).toBe("acme");
    expect(food?.facet.id).toBe("restaurants");
    expect(finance?.entity.id).not.toBe(acme?.entity.id);
    expect(acme?.source.data.title).toBe("Acme");
    expect(food?.source.data.title).toBe("Restaurants");
    expect(finance?.source.data.title).toBe("Finance");
    expect(acme?.properties.get("brand.name")?.value).toBe("Acme");
    expect(finance?.properties.get("brand.name")?.value).toBe("Finance");
    expect(acme?.publication.spokeId).toBe("shared-spoke");
    expect(finance?.publication.spokeId).toBe("shared-spoke");
  });

  it("serves one Entity through two distinct Spokes without sharing a publication", async () => {
    const manifest: EfsManifest = {
      entities: [entity("e_00000000000000000000000021", ["franchise"], "Franchise")],
      publications: [
        publication("first", "spoke-one", "e_00000000000000000000000021", "franchise", "one.example"),
        publication("second", "spoke-two", "e_00000000000000000000000021", "franchise", "two.example"),
      ],
    };
    const root = install(manifest, [
      ["e_00000000000000000000000021", "franchise", "main", "Franchise", "Same body"],
    ]);
    const one = await request(root, "one.example");
    const two = await request(root, "two.example");

    expect(one?.entity.id).toBe(two?.entity.id);
    expect(one?.facet.id).toBe(two?.facet.id);
    expect(one?.publication.id).toBe("first");
    expect(two?.publication.id).toBe("second");
    expect(one?.publication.spokeId).toBe("spoke-one");
    expect(two?.publication.spokeId).toBe("spoke-two");
    expect(one?.source.data.title).toBe(two?.source.data.title);
    expect(one?.properties.toRecord()).toEqual(two?.properties.toRecord());
    expect(one?.canonical).toBe("https://one.example/en");
    expect(two?.canonical).toBe("https://two.example/en");
  });
});
