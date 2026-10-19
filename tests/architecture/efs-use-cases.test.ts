import { describe, expect, it } from "vitest";

import { establishWebsite } from "@/application/efs-portability";
import { validateEfsManifest, type EfsManifest } from "@/config/efs/manifest";
import { matchBinding } from "@/core/efs/publication";

const entropy = (seed: number) => Uint8Array.from({ length: 16 }, (_, index) => (seed + index) % 256);

function website(facet: string, host: string, seed: number) {
  return establishWebsite(
    {
      facetId: facet,
      siteId: "main",
      host,
      locales: ["en", "de"],
      defaultLocale: "en",
      title: facet,
    },
    entropy(seed),
  );
}

function combine(...parts: ReturnType<typeof website>[]): EfsManifest {
  return {
    entities: parts.flatMap((part) => part.manifest.entities),
    publications: parts.flatMap((part) =>
      part.manifest.publications.map((publication) => ({
        ...publication,
        bindings: publication.bindings.map((binding) => ({
          ...binding,
          id: `${part.entityId}-${binding.id}`,
        })),
      })),
    ),
  };
}

describe("EFS use-case contracts with executable fixtures (R03)", () => {
  it("publishes an agency itself and three independent customer Entities", () => {
    const agency = website("agency", "agency.example", 10);
    const clients = [
      website("client-a", "a.example", 11),
      website("client-b", "b.example", 12),
      website("client-c", "c.example", 13),
    ];
    const manifest = combine(agency, ...clients);
    const validation = validateEfsManifest(manifest);
    expect(validation.ok, validation.issues.join(" ")).toBe(true);
    expect(manifest.entities).toHaveLength(4);
    expect(manifest.publications).toHaveLength(4);
    expect(new Set(manifest.entities.map((entity) => entity.id)).size).toBe(4);
    expect(manifest.publications.filter((publication) => publication.entityId === agency.entityId)).toHaveLength(1);
  });

  it("keeps two Facets in one Entity distinct from two Entities", () => {
    const base = website("north", "north.example", 20);
    const entity = base.manifest.entities[0];
    const secondFacet = {
      ...entity.facets[0],
      id: "south",
      sites: entity.facets[0].sites.map((site) => ({ ...site, id: "place" })),
    };
    const twoFacets = { ...base.manifest, entities: [{ ...entity, facets: [...entity.facets, secondFacet] }] };
    const validation = validateEfsManifest(twoFacets);
    expect(validation.ok, validation.issues.join(" ")).toBe(true);
    expect(twoFacets.entities).toHaveLength(1);
    expect(twoFacets.entities[0].facets.map((facet) => facet.id)).toEqual(["north", "south"]);
    expect(combine(website("north", "one.example", 21), website("south", "two.example", 22)).entities).toHaveLength(2);
  });

  it("publishes one Entity through one or many Spokes without changing identity", () => {
    const base = website("franchise", "one.example", 30);
    const entityId = base.entityId;
    const extra = ["two.example", "three.example"].map((host, index) => ({
      ...base.manifest.publications[0],
      id: `franchise-main-${index + 2}`,
      bindings: base.manifest.publications[0].bindings.map((binding) => ({
        ...binding,
        id: `main-web-${index + 2}`,
        host,
      })),
    }));
    const manifest = { ...base.manifest, publications: [...base.manifest.publications, ...extra] };
    const validation = validateEfsManifest(manifest);
    expect(validation.ok, validation.issues.join(" ")).toBe(true);
    const bindings = manifest.publications.flatMap((publication) => publication.bindings);
    for (const host of ["one.example", "two.example", "three.example"]) {
      const matched = matchBinding(host, "/en/", bindings);
      expect(matched?.binding.entityId).toBe(entityId);
      expect(matched?.binding.facetId).toBe("franchise");
    }
  });

  it("keeps capsule publication data separate from an administration product", () => {
    const base = website("publisher", "publisher.example", 40);
    const validation = validateEfsManifest(base.manifest);
    expect(validation.ok, validation.issues.join(" ")).toBe(true);
    expect(Object.keys(base.manifest)).toEqual(["entities", "publications"]);
    expect(base.manifest.publications[0].bindings[0]).not.toHaveProperty("admin");
    expect(base.files.every((file) => file.path.startsWith(`${base.entityId}/`))).toBe(true);
  });
});
