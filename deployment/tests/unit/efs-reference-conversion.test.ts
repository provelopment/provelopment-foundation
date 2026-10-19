import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadEfsManifest } from "@/config/efs/manifest";

const DEPLOYMENT = join(process.cwd(), "deployment");
const MANIFEST = join(DEPLOYMENT, "efs", "manifest.json");
const CAPSULE = join(DEPLOYMENT, "efs", "capsule");

describe("controlled reference Installation conversion (R02)", () => {
  const loaded = loadEfsManifest(MANIFEST);

  it("is a valid explicit manifest with two Entities and their Spokes", () => {
    expect(loaded.ok, loaded.issues.join(" ")).toBe(true);
    expect(loaded.manifest?.entities.map((entity) => entity.id)).toEqual([
      "e_00000000000000000000000001",
      "e_00000000000000000000000002",
    ]);
    expect(loaded.manifest?.publications.flatMap((publication) => publication.bindings)).toHaveLength(3);
  });

  it("preserves the released URL grammar through explicit bindings", () => {
    const bindings = loaded.manifest?.publications.flatMap((publication) => publication.bindings) ?? [];
    expect(bindings.map((binding) => [binding.host, binding.prefix.join("/"), binding.locales.join(",")])).toEqual([
      ["foundation-template.provelopment.com", "ww", "en,de"],
      ["provelopment-foundation.vercel.app", "ww", "en,de"],
      ["foundation-template-germany.provelopment.com", "de", "de,en"],
    ]);
  });

  it("has one source for every declared representation and no geographic scheduling", () => {
    for (const entity of loaded.manifest?.entities ?? []) {
      for (const facet of entity.facets) {
        for (const site of facet.sites) {
          for (const page of site.pages) {
            for (const representation of page.representations) {
              const base = join(CAPSULE, entity.id, facet.id, site.id, "pages", page.id, representation.locale);
              expect(existsSync(`${base}.json`) || existsSync(`${base}.md`), `${page.id}/${representation.locale}`).toBe(true);
            }
          }
        }
      }
    }
    const raw = JSON.stringify(loaded.manifest);
    expect(raw).not.toMatch(/timezone|regions|Europe\/Berlin/);
  });

  it("keeps the reference brand assets inside each owning Entity capsule", () => {
    for (const entity of loaded.manifest?.entities ?? []) {
      const facet = entity.facets[0];
      expect(existsSync(join(CAPSULE, entity.id, facet.id, "assets", "brand", "logo.svg"))).toBe(true);
      expect(existsSync(join(CAPSULE, entity.id, facet.id, "assets", "brand", "favicon.svg"))).toBe(true);
    }
  });
});
