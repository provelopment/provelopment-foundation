import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadEfsDictionary, loadEfsPageSource } from "@/adapters/content/efs-content";
import { loadEfsManifest, validateEfsManifest } from "@/config/efs/manifest";

const capsule = join(process.cwd(), "tests", "fixtures", "efs", "capsule");
const manifestPath = join(process.cwd(), "tests", "fixtures", "efs", "manifest.json");
const entityA = "e_00000000000000000000000000";
const entityB = "e_00000000000000000000000001";

function mutableManifest(): { entities: Array<Record<string, unknown>>; publications: Array<Record<string, unknown>> } {
  const result = loadEfsManifest(manifestPath);
  expect(result.ok).toBe(true);
  return JSON.parse(JSON.stringify(result.manifest)) as {
    entities: Array<Record<string, unknown>>;
    publications: Array<Record<string, unknown>>;
  };
}

describe("EFS owner-scoped content adapter (E1 CP-0/CP-2)", () => {
  it("loads JSON and Markdown Page sources by ownership path", () => {
    const json = loadEfsPageSource({
      root: capsule,
      entityId: entityA,
      facetId: "acme",
      siteId: "jakarta",
      pageId: "home",
    });
    expect(json.kind).toBe("ok");
    if (json.kind === "ok") {
      expect(json.value.format).toBe("json");
      expect(json.value.data.title).toBe("Jakarta Home (JSON)");
    }

    const markdown = loadEfsPageSource({
      root: capsule,
      entityId: entityA,
      facetId: "acme",
      siteId: "jakarta",
      pageId: "about",
    });
    expect(markdown.kind).toBe("ok");
    if (markdown.kind === "ok") {
      expect(markdown.value.format).toBe("markdown");
      expect(markdown.value.body).toContain("About Jakarta");
    }
  });

  it("keeps JSON precedence over a Markdown source of the same Page", () => {
    const source = loadEfsPageSource({
      root: capsule,
      entityId: entityA,
      facetId: "acme",
      siteId: "jakarta",
      pageId: "home",
    });
    expect(source.kind).toBe("ok");
    if (source.kind === "ok") expect(source.value.format).toBe("json");
  });

  it("refuses another Entity's content and path traversal", () => {
    const otherOwner = loadEfsPageSource({
      root: capsule,
      entityId: entityB,
      facetId: "acme",
      siteId: "jakarta",
      pageId: "home",
    });
    expect(otherOwner.kind).toBe("rejected");
    const traversal = loadEfsPageSource({
      root: capsule,
      entityId: entityA,
      facetId: "acme",
      siteId: "jakarta",
      pageId: "..",
    });
    expect(traversal.kind).toBe("rejected");
  });

  it("loads only the requested owner's dictionary", () => {
    const dictionary = loadEfsDictionary({
      root: capsule,
      entityId: entityA,
      facetId: "acme",
      siteId: "jakarta",
      localeKey: "en-001",
    });
    expect(dictionary).toEqual({ kind: "ok", value: { "nav.home": "Home", "nav.about": "About" } });
    const otherOwner = loadEfsDictionary({
      root: capsule,
      entityId: entityB,
      facetId: "acme",
      siteId: "jakarta",
      localeKey: "en-001",
    });
    expect(otherOwner.kind).toBe("rejected");
  });
});

describe("EFS manifest validation (E1 CP-1)", () => {
  it("accepts the synthetic manifest", () => {
    expect(loadEfsManifest(manifestPath)).toMatchObject({ ok: true });
  });

  it("refuses a non-e_ EntityID", () => {
    const manifest = mutableManifest();
    manifest.entities[0].id = "b_00000000000000000000000000";
    expect(validateEfsManifest(manifest).issues.join(" ")).toContain("retired");
  });

  it("refuses duplicate Site declarations within a Facet", () => {
    const manifest = mutableManifest();
    const facets = manifest.entities[0].facets as Array<Record<string, unknown>>;
    const sites = facets[0].sites as Array<Record<string, unknown>>;
    sites.push(structuredClone(sites[0]));
    expect(validateEfsManifest(manifest).issues.join(" ")).toContain("duplicates Site");
  });

  it("refuses a Page fallback that names no existing representation", () => {
    const manifest = mutableManifest();
    const facets = manifest.entities[0].facets as Array<Record<string, unknown>>;
    const sites = facets[0].sites as Array<Record<string, unknown>>;
    const pages = sites[0].pages as Array<Record<string, unknown>>;
    pages[0].fallbackLocaleKey = "de";
    expect(validateEfsManifest(manifest).issues.join(" ")).toContain("fallbackLocaleKey");
  });

  it("refuses a binding that selects a Site outside its Facet", () => {
    const manifest = mutableManifest();
    const bindings = manifest.publications[0].bindings as Array<Record<string, unknown>>;
    bindings[0].siteIds = ["outside"];
    expect(validateEfsManifest(manifest).issues.join(" ")).toContain("outside its Facet");
  });

  it("refuses a Site-open binding with only one Site", () => {
    const manifest = mutableManifest();
    const bindings = manifest.publications[0].bindings as Array<Record<string, unknown>>;
    bindings[0].siteIds = ["jakarta"];
    expect(validateEfsManifest(manifest).issues.join(" ")).toContain("at least two Sites");
  });
});
