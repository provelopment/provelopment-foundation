import { describe, expect, it } from "vitest";

import {
  diagnoseCapsule,
  establishWebsite,
  exportEntityCapsule,
  importEntityCapsule,
  instantiateTemplate,
} from "@/application/efs-portability";

const entropy = (seed: number) => Uint8Array.from({ length: 16 }, (_, index) => (seed + index) % 256);

describe("EFS ordinary establishment and capsule portability (S3-E3-R01)", () => {
  it("establishes one explicit website with a localized Home Page", () => {
    const established = establishWebsite(
      {
        spokeId: "acme-spoke",
        facetId: "acme",
        siteId: "main",
        host: "www.acme.example",
        locales: ["en-001", "fr"],
        defaultLocale: "en-001",
        title: "Acme",
      },
      entropy(1),
    );
    expect(established.entityId).toMatch(/^e_[0-7][0-9a-hjkmnp-tv-z]{25}$/);
    expect(established.manifest.publications).toHaveLength(1);
    expect(
      established.manifest.entities[0].facets[0].sites[0].pages[0].representations,
    ).toHaveLength(2);
    expect(established.files.map((file) => file.path)).toEqual([
      `${established.entityId}/acme/main/pages/home/en-001.json`,
      `${established.entityId}/acme/main/pages/home/fr.json`,
    ]);
  });

  it("exports only the selected Entity and refuses a foreign file", () => {
    const established = establishWebsite(
      {
        spokeId: "acme-spoke",
        facetId: "acme",
        siteId: "main",
        host: "www.acme.example",
        locales: ["en-001"],
        defaultLocale: "en-001",
        title: "Acme",
      },
      entropy(2),
    );
    const bundle = exportEntityCapsule(established.manifest, established.entityId, established.files);
    expect(bundle.manifest.entities).toHaveLength(1);
    expect(bundle.files).toHaveLength(1);
    expect(() =>
      exportEntityCapsule(established.manifest, established.entityId, [
        { path: "e_00000000000000000000000000/other/page.json", content: new Uint8Array([1]) },
      ]),
    ).toThrow(/escapes the exporting Entity/);
  });

  it("round-trips a capsule and diagnoses a missing representation", () => {
    const established = establishWebsite(
      {
        spokeId: "acme-spoke",
        facetId: "acme",
        siteId: "main",
        host: "www.acme.example",
        locales: ["en-001"],
        defaultLocale: "en-001",
        title: "Acme",
      },
      entropy(3),
    );
    const bundle = exportEntityCapsule(established.manifest, established.entityId, established.files);
    const imported = importEntityCapsule(JSON.stringify(bundle));
    expect(imported.ok).toBe(true);
    expect(diagnoseCapsule(bundle)).toEqual([]);
    expect(diagnoseCapsule({ ...bundle, files: [] })).toContain(
      'Page "home" has no source for "en-001".',
    );
  });

  it("refuses a tampered capsule path", () => {
    const established = establishWebsite(
      {
        spokeId: "acme-spoke",
        facetId: "acme",
        siteId: "main",
        host: "www.acme.example",
        locales: ["en-001"],
        defaultLocale: "en-001",
        title: "Acme",
      },
      entropy(4),
    );
    const bundle = exportEntityCapsule(established.manifest, established.entityId, established.files);
    const tampered = {
      ...bundle,
      files: bundle.files.map((file) => ({ ...file, path: `../${file.path}` })),
    };
    expect(importEntityCapsule(JSON.stringify(tampered)).ok).toBe(false);
  });

  it("copies a template once into a new identity with provenance", () => {
    const source = establishWebsite(
      {
        spokeId: "acme-spoke",
        facetId: "acme",
        siteId: "main",
        host: "www.acme.example",
        locales: ["en-001"],
        defaultLocale: "en-001",
        title: "Acme",
      },
      entropy(5),
    );
    const bundle = exportEntityCapsule(source.manifest, source.entityId, source.files);
    const copy = instantiateTemplate(bundle, entropy(6), "2026-10-19T00:00:00.000Z");
    expect(copy.entityId).not.toBe(bundle.entityId);
    expect(copy.manifest.entities[0].id).toBe(copy.entityId);
    expect(copy.manifest.publications[0].entityId).toBe(copy.entityId);
    expect(copy.files[0].path.startsWith(`${copy.entityId}/`)).toBe(true);
    expect(copy.provenance).toEqual({
      templateEntityId: bundle.entityId,
      instantiatedAt: "2026-10-19T00:00:00.000Z",
    });
    expect(diagnoseCapsule(copy)).toEqual([]);
  });
});
